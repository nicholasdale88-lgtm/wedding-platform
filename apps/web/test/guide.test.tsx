import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import texts from '../../../seed/texts.json';
import dynamicTexts from '../../../seed/texts.dynamic.json';
import { assetOf } from '../src/guest/guide/common';
import { GuidePage } from '../src/guest/guide/GuidePage';
import type { GuidePayload } from '../src/guest/invitation/api';

const TOKEN = 'B'.repeat(22);
const all: Record<string, string> = { ...texts, ...dynamicTexts };
const only = (p: string) => Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(`${p}.`)));

const base = {
  images: {},
  wedding: { slug: 'alex-and-blair', name1: 'Alex Smith', name2: 'Blair Jones', monogram: 'A&B', theme: 'Cream & Sage', timezone: 'Australia/Sydney' },
  weather: null,
  photoUrl: `https://example.com/w/alex-and-blair/photos?g=${TOKEN}`,
  mates: {},
  seating: null,
};

const reception: GuidePayload = {
  ...base,
  event: { key: 'wedding', name: 'The wedding', startsAt: '2027-03-06T05:00:00.000Z', slot: 0 },
  guide: {
    style: 'reception', date: 'Saturday 6 March 2027', arrive: '3:30pm', start: '4:00pm', address: '1 Garden Lane',
    runsheet: [{ t: '4:00pm', what: 'Ceremony', where: 'The garden' }, { t: '6:00pm', what: 'Reception dinner', where: 'The hall' }],
    contacts: [{ name: 'Venue', role: 'Office', phone: '(02) 1234 5678' }, { name: 'Us', role: 'Email', phone: 'us@example.com' }],
    faq: [{ q: 'Dress code?', a: 'Garden formal.' }],
    menu: [{ course: 'Main', a: 'Lamb', b: 'Fish' }],
  },
  texts: only('gd'),
  guest: {
    token: TOKEN, attending: true, answers: {},
    people: [
      { idx: 0, name: 'Robin Hart', diet: 'Vegetarian', tableId: 't1', meals: { e: '', m: '', d: '' } },
      { idx: 1, name: 'Sam Hart', diet: '', tableId: 't1', meals: { e: '', m: 'Fish', d: '' } },
    ],
  },
  seating: { aspect: '4 / 3', planImg: '', tables: [{ id: 't1', name: '7', shape: 'round', dir: 'h', len: 40, x: 20, y: 30 }, { id: 't2', name: 'Willow', shape: 'long', dir: 'h', len: 40, x: 60, y: 30 }], features: [] },
  mates: { t1: ['Casey Lee', 'Drew Park'] },
};

const dayout = (answers: Record<string, string>): GuidePayload => ({
  ...base,
  event: { key: 'party', name: 'The party', startsAt: '2027-03-07T05:00:00.000Z', slot: 1 },
  guide: {
    style: 'dayout', date: 'Sunday 7 March 2027', arriveBy: '9:30am', activityTime: '10:00am', picnicTime: '12:00pm', picnicWhere: 'By the river',
    dress: 'Casual', choiceKey: 'ride', yesAnswer: 'Yes, I will ride', unsureAnswer: 'Not sure yet', bring: ['Hat', 'Water'],
    runsheet: [{ t: '12:00pm', what: 'Picnic', where: 'River' }], contacts: [],
  },
  texts: only('g30'),
  guest: { token: TOKEN, attending: true, answers, people: [{ idx: 0, name: 'Robin Hart', diet: '', tableId: null, meals: { e: '', m: '', d: '' } }] },
});

function renderGuide(url: string, data: GuidePayload) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (path: string) => {
    calls.push(path);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/w/:slug/tomorrow" element={<GuidePage />} />
        <Route path="/w/:slug/tomorrow/:event" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
  return calls;
}

describe('night-before guide (reception design)', () => {
  it('asks for their own guide and shows their seats and meals', async () => {
    const calls = renderGuide(`/w/alex-and-blair/tomorrow?g=${TOKEN}`, reception);
    expect((await screen.findAllByText('Table 7')).length).toBeGreaterThan(0);
    expect(calls[0]).toBe(`/api/p/alex-and-blair/guide?g=${TOKEN}`);
    expect(screen.getByText('Your meal: Vegetarian')).toBeInTheDocument();
    expect(screen.getByText('Main: Fish')).toBeInTheDocument();
    expect(screen.getByText('The kitchen has your note: Vegetarian')).toBeInTheDocument();
    expect(screen.getAllByText(/Robin & Sam/).length).toBeGreaterThan(0);
  });

  it('lists only their table mates, with them marked "You"', async () => {
    renderGuide(`/w/alex-and-blair/tomorrow?g=${TOKEN}`, reception);
    expect(await screen.findByText('4 at this table · tap to see who')).toBeInTheDocument();
    expect(screen.getByText('Casey Lee')).toBeInTheDocument();
    expect(screen.getAllByText('You')).toHaveLength(2);
  });

  it('contacts dial or email; no forecast yet says so; the photo QR is drawn', async () => {
    renderGuide(`/w/alex-and-blair/tomorrow?g=${TOKEN}`, reception);
    expect((await screen.findByText('(02) 1234 5678')).closest('a')).toHaveAttribute('href', 'tel:0212345678');
    expect(screen.getByText('us@example.com').closest('a')).toHaveAttribute('href', 'mailto:us@example.com');
    expect(screen.getByText('Forecast coming soon')).toBeInTheDocument();
    expect(document.querySelector('img[src^="data:image/gif"]')).not.toBeNull();
  });

  it('FAQ opens on tap', async () => {
    renderGuide(`/w/alex-and-blair/tomorrow?g=${TOKEN}`, reception);
    const q = await screen.findByText('Dress code?');
    fireEvent.click(q);
    expect(q.closest('button')!.parentElement!.innerHTML).toContain('1fr');
  });
});

describe('night-before guide (day-out design)', () => {
  it('a rider gets the stables plan', async () => {
    const calls = renderGuide(`/w/alex-and-blair/tomorrow/party?g=${TOKEN}`, dayout({ ride: 'Yes, I will ride' }));
    expect(await screen.findByText('You are riding')).toBeInTheDocument();
    expect(calls[0]).toBe(`/api/p/alex-and-blair/guide?g=${TOKEN}&event=party`);
    expect(screen.getByText('Be at the stables by 9:30am')).toBeInTheDocument();
  });

  it('a picnic guest gets the picnic plan; the packing list counts and remembers', async () => {
    localStorage.clear();
    renderGuide(`/w/alex-and-blair/tomorrow/party?g=${TOKEN}`, dayout({ ride: 'No, not riding' }));
    expect(await screen.findByText('Joining for the picnic')).toBeInTheDocument();
    expect(screen.getByText('Meet us by the river at 12:00pm')).toBeInTheDocument();
    expect(screen.getByText('0 of 2 packed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Hat'));
    expect(screen.getByText('1 of 2 packed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Water'));
    expect(screen.getByText('All packed. See you tomorrow!')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`wp-packed-party-${TOKEN}`)!)).toEqual({ Hat: true, Water: true });
  });
});

describe('design photos (v.asset)', () => {
  it("uses the wedding's own picture for the slot, else the design's", () => {
    expect(assetOf({})('lookout.jpg')).toBe('/seed-media/lookout.jpg');
    expect(assetOf({ lookout: 'https://cdn.example.com/a b.jpg' })('lookout.jpg')).toBe('https://cdn.example.com/a%20b.jpg');
  });
  it('an edited link can never break out of the CSS or run script', () => {
    expect(assetOf({ lookout: "x.jpg') ; background:red" })('lookout.jpg')).not.toMatch(/['()\s]/);
    expect(assetOf({ lookout: 'javascript:alert(1)' })('lookout.jpg')).toBe('');
  });
});

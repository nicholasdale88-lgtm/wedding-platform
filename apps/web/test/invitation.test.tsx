import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import texts from '../../../seed/texts.json';
import dynamicTexts from '../../../seed/texts.dynamic.json';
import type { InvitePayload } from '../src/guest/invitation/api';
import { InvitationPage } from '../src/guest/invitation/InvitationPage';
import { sx } from '../src/guest/sx';

const TOKEN = 'A'.repeat(22);
const payload = (over: Partial<InvitePayload> = {}): InvitePayload => ({
  wedding: { slug: 'alex-and-blair', name1: 'Alex Smith', name2: 'Blair Jones', monogram: 'A&B', theme: 'Cream & Sage', timezone: 'Australia/Sydney' },
  content: { rsvpBy: 'Kindly reply by 1 May', seal: 'Sandstone' },
  texts: { ...texts, ...dynamicTexts },
  events: [
    { key: 'wedding', name: 'The wedding', startsAt: '2027-03-06T05:00:00.000Z', slot: 0, questions: [] },
    { key: 'party', name: 'The party', startsAt: '2027-03-07T05:00:00.000Z', slot: 1, questions: [{ key: 'ride', label: 'Will you ride?', type: 'choice', options: ['Yes, I will ride', 'Not sure yet', 'No, not riding'] }] },
  ],
  invitation: {
    token: TOKEN, people: [{ idx: 0, name: 'Robin Hart', diet: '' }, { idx: 1, name: 'Sam Hart', diet: '' }], seatsHeld: 2,
    invited: ['wedding', 'party'], rsvp: {}, message: '', repliedAt: null,
  },
  ...over,
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function renderAt(url: string, data: InvitePayload, onRsvp?: (body: unknown) => void) {
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/p/alex-and-blair/invite')) return json(200, data);
    if (path === '/api/p/alex-and-blair/rsvp') {
      onRsvp?.(JSON.parse(String(init!.body)));
      return json(200, { ok: true, invitation: data.invitation });
    }
    throw new Error(`unexpected ${path}`);
  });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/w/:slug" element={<InvitationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('invitation page', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('greets the guests by name and shows the envelope until tapped', async () => {
    renderAt(`/w/alex-and-blair?g=${TOKEN}`, payload());
    expect(await screen.findByText('Dear Robin Hart & Sam Hart')).toBeInTheDocument();
    expect(screen.getByText('Tap to open')).toBeInTheDocument();
    expect(screen.getByText('Kindly reply by 1 May')).toBeInTheDocument();
  });

  it('opens with the design timings and remembers it was opened', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt(`/w/alex-and-blair?g=${TOKEN}`, payload());
    const envelope = await screen.findByRole('button', { name: 'Open invitation' });
    fireEvent.click(envelope);
    act(() => vi.advanceTimersByTime(4700));
    expect(JSON.parse(localStorage.getItem(`wp-inv-opened-${TOKEN}`)!).at).toBeGreaterThan(0);
  });

  it('RSVP: one tap per event, then Send posts exactly their answers', async () => {
    let sent: unknown;
    renderAt(`/w/alex-and-blair?g=${TOKEN}`, payload(), (b) => (sent = b));
    await screen.findByText('Dear Robin Hart & Sam Hart');
    const yes = screen.getAllByText("Yes, I'll be there");
    const no = screen.getAllByText("Sorry, can't make it");
    fireEvent.click(yes[0]!);
    fireEvent.click(no[1]!);
    await act(async () => {
      fireEvent.click(screen.getByText('Send RSVP'));
    });
    expect(sent).toEqual({ token: TOKEN, events: { wedding: { attending: true }, party: { attending: false } }, count: 2, diet: '', message: '' });
    expect(await screen.findByText('We have your reply and cannot wait to celebrate with you.')).toBeInTheDocument();
  });

  it('asks for an answer to every event first', async () => {
    let sent: unknown;
    renderAt(`/w/alex-and-blair?g=${TOKEN}`, payload(), (b) => (sent = b));
    await screen.findByText('Dear Robin Hart & Sam Hart');
    fireEvent.click(screen.getAllByText("Yes, I'll be there")[0]!);
    fireEvent.click(screen.getByText('Send RSVP'));
    expect(await screen.findByText('Please answer for each event.')).toBeInTheDocument();
    expect(sent).toBeUndefined();
  });

  it('preview never records a reply', async () => {
    let sent: unknown;
    renderAt(`/w/alex-and-blair?g=${TOKEN}&preview=1`, payload(), (b) => (sent = b));
    await screen.findByText('Dear Robin Hart & Sam Hart');
    fireEvent.click(screen.getAllByText("Yes, I'll be there")[0]!);
    fireEvent.click(screen.getAllByText("Sorry, can't make it")[1]!);
    await act(async () => {
      fireEvent.click(screen.getByText('Send RSVP'));
    });
    expect(sent).toBeUndefined();
  });

  it('without a link it shows the name lookup', async () => {
    renderAt('/w/alex-and-blair', payload({ invitation: null }));
    expect(await screen.findByText('Find my invitation')).toBeInTheDocument();
    expect(screen.getByText('Dear Guest')).toBeInTheDocument();
  });
});

describe('sx (design CSS -> React style)', () => {
  it('keeps values verbatim, including data URIs, gradients, custom properties and vendor prefixes', () => {
    expect(sx("position:absolute;background:url('data:image/svg+xml,a;b'),linear-gradient(0deg,#fff 0 1px,transparent 1px);--pgbg:#fff;-webkit-backdrop-filter:blur(6px)")).toEqual({
      position: 'absolute',
      background: "url('data:image/svg+xml,a;b'),linear-gradient(0deg,#fff 0 1px,transparent 1px)",
      '--pgbg': '#fff',
      WebkitBackdropFilter: 'blur(6px)',
    });
  });
});

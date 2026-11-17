import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyPayload } from '../src/guest/invitation/api';
import { PartyPage } from '../src/guest/party/PartyPage';
import { partyGroup, PartyHelp, PartyWelcome } from '../src/guest/party/PartyWelcome';

describe('wedding party portal', () => {
  beforeEach(() => localStorage.clear());

  it('names the group: the bridal party, the groomsmen, or the wedding party', () => {
    expect(partyGroup(['Bridesmaid']).title).toBe('The bridal party');
    expect(partyGroup(['Maid of honour', 'Flower girl']).title).toBe('The bridal party');
    expect(partyGroup(['Best man', 'Groomsman']).title).toBe('The groomsmen');
    expect(partyGroup(['MC']).title).toBe('Wedding party');
    expect(partyGroup(['Bridesmaid', 'Usher']).title).toBe('Wedding party');
  });

  it('welcomes them once, with what their page does; the guide stays at the bottom', () => {
    const props = { storeKey: 'k', firstNames: 'Ella', word: 'bridal party', couple: 'Alex & Sam', perms: undefined, calendar: true, gold: '#b39563', ink: '#33402f' };
    const { unmount } = render(<PartyWelcome {...props} />);
    expect(screen.getByRole('heading', { name: 'Welcome to the bridal party, Ella!' })).toBeInTheDocument();
    expect(screen.getByText('Your to-dos.')).toBeInTheDocument();
    expect(screen.getByText('On your phone.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('heading', { name: /Welcome/ })).toBeNull();
    unmount();
    render(<PartyWelcome {...props} />);
    expect(screen.queryByRole('heading', { name: /Welcome/ })).toBeNull(); // seen
    render(<PartyHelp perms={{ runsheet: true, tasks: false, addTasks: false, sideTasks: false, packing: true, speeches: true, people: true, vendors: false, guests: false, seating: false }} calendar={false} gold="#b39563" />);
    fireEvent.click(screen.getByRole('button', { name: 'How your page works' }));
    expect(screen.getByText('Speeches.')).toBeInTheDocument();
    expect(screen.queryByText('Your to-dos.')).toBeNull(); // not shared with them
  });
});

describe('wedding party page', () => {
  beforeEach(() => localStorage.clear());

  const TOKEN = 'P'.repeat(22);
  const payload: PartyPayload = {
    couple: 'Alex & Sam',
    names: { p1: 'Alex', p2: 'Sam' },
    theme: 'Cream & Sage',
    me: [{ name: 'Ella Hart', role: 'Bridesmaid' }],
    party: [{ name: 'Ella Hart', role: 'Bridesmaid', side: 'p1', phone: '0412 345 678' }],
    mine: [{ personId: 'p-1', name: 'Ella Hart', role: 'Bridesmaid', tasks: [{ id: 't1', text: 'Book the hair trial', due: '', done: false, mine: false }], packed: [], pack: [] }],
    events: [
      {
        key: 'wedding',
        name: 'The wedding',
        startsAt: '2027-03-06T05:00:00.000Z',
        note: '',
        items: [
          { time: '8:30am', until: '', title: 'Hair and makeup', detail: '', place: '', who: ['p1'] },
          { time: '2:00pm', until: '', title: 'Ceremony', detail: '', place: '', who: ['party'] },
        ],
      },
    ],
  };

  it('opens on a menu: their invitation to tap, who they are, then each part one at a time', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }));
    render(
      <MemoryRouter initialEntries={[`/w/alex-and-sam/party?g=${TOKEN}`]}>
        <Routes>
          <Route path="/w/:slug/party" element={<PartyPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const role = await screen.findByRole('region', { name: 'Your role' });
    expect(within(role).getByText('Ella Hart')).toBeInTheDocument();
    expect(within(role).getByText('Bridesmaid')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your invitation: tap to open' })).toHaveAttribute('href', `/w/alex-and-sam?g=${TOKEN}`);
    const menu = screen.getByRole('navigation', { name: 'Your page' });
    expect(within(menu).getByRole('button', { name: /What needs you\s*1 to do/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Book the hair trial' })).toBeNull(); // one part at a time
    fireEvent.click(within(menu).getByRole('button', { name: /What needs you/ }));
    expect(await screen.findByRole('heading', { name: 'What needs you' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Book the hair trial' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Menu/ }));
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Your page' })).getByRole('button', { name: /The day\s*1 of your moments/ }));
    expect((await screen.findByText('Hair and makeup')).closest('li')).toHaveTextContent('Yours');
    expect(screen.getByText('Ceremony').closest('li')).not.toHaveTextContent('Yours');
    fireEvent.click(screen.getByRole('button', { name: /Menu/ }));
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Your page' })).getByRole('button', { name: /Who’s who/ }));
    expect(await screen.findByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:0412345678');
    vi.unstubAllGlobals();
  });

  it('the best man and maid of honour get a proper thank-you', async () => {
    const best = { ...payload, me: [{ name: 'Jon Lee', role: 'Best man' }], party: [{ name: 'Jon Lee', role: 'Best man', side: 'p2' as const }], mine: [] };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(best), { status: 200, headers: { 'content-type': 'application/json' } }));
    render(
      <MemoryRouter initialEntries={[`/w/alex-and-sam/party?g=${TOKEN}`]}>
        <Routes>
          <Route path="/w/:slug/party" element={<PartyPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const thanks = await screen.findByRole('region', { name: 'Thank you, our best man' });
    expect(within(thanks).getByText(/Jon, of everyone we know/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('the sample page (/demo/party?as=best): the menu and the best man’s thank-you, with nothing asked of the server', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(
      <MemoryRouter initialEntries={['/demo/party?as=best']}>
        <Routes>
          <Route path="/demo/party" element={<PartyPage sample />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('region', { name: 'Thank you, our best man' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your invitation: tap to open' })).toHaveAttribute('href', '/demo');
    expect(screen.getByRole('navigation', { name: 'Your page' })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('their outfit says who’s paying: the couple’s gift, or theirs with the cost', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { unmount } = render(
      <MemoryRouter initialEntries={['/demo/party?as=bridesmaid']}>
        <Routes>
          <Route path="/demo/party" element={<PartyPage sample />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Your page' })).getByRole('button', { name: /What needs you/ }));
    expect(await screen.findByText('Your dress is our gift to you. Thank you for wearing it.')).toBeInTheDocument();
    unmount();
    render(
      <MemoryRouter initialEntries={['/demo/party?as=groomsman']}>
        <Routes>
          <Route path="/demo/party" element={<PartyPage sample />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Your page' })).getByRole('button', { name: /What needs you/ }));
    expect(await screen.findByText('You’re paying for your own suit: about $180.')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('the couple’s own note: on a bridesmaid’s page as a note, and in place of the best man’s standard thank-you', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { unmount } = render(
      <MemoryRouter initialEntries={['/demo/party?as=bridesmaid']}>
        <Routes>
          <Route path="/demo/party" element={<PartyPage sample />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('region', { name: 'A note for Priya' })).toHaveTextContent('Thank you for being part of our day');
    unmount();
    render(
      <MemoryRouter initialEntries={['/demo/party?as=best']}>
        <Routes>
          <Route path="/demo/party" element={<PartyPage sample />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('region', { name: 'Thank you, our best man' })).toHaveTextContent('best mate since we were six');
    vi.unstubAllGlobals();
  });
});

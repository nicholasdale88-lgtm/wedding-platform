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

  it('shows who they are first, then what needs them, then their day with their own moments marked', async () => {
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
    expect(screen.getByRole('heading', { name: 'What needs you' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Book the hair trial' })).not.toBeChecked();
    expect(screen.getByText('Hair and makeup').closest('li')).toHaveTextContent('Yours');
    expect(screen.getByText('Ceremony').closest('li')).not.toHaveTextContent('Yours');
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:0412345678');
    vi.unstubAllGlobals();
  });
});

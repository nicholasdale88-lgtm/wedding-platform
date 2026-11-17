import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PartyData } from '../src/lib/api';

const m = vi.hoisted(() => ({
  guests: vi.fn(),
  setRole: vi.fn(),
  addMember: vi.fn(),
}));
vi.mock('../src/admin/Shell', () => ({ useAdmin: () => ({ wid: 'w1' }) }));
vi.mock('../src/lib/api', () => ({
  api: { guests: m.guests },
  plannerApi: { setRole: m.setRole, addMember: m.addMember },
}));

import { PartyBuilder } from '../src/admin/party/PartyBuilder';

const party: PartyData = {
  slug: 'alex-and-sam',
  names: { p1: 'Alex', p2: 'Sam' },
  roles: [],
  events: [],
  event: 'wedding',
  members: [{ personId: 'p-1', invitationId: 'i-1', name: 'Ella Hart', role: 'Maid of honour', side: 'p1', token: 'tok' }],
  runsheet: null,
  checklist: null,
};

describe('wedding party builder', () => {
  it('shows each role, its people, and adds a guest by typing their name', async () => {
    m.guests.mockResolvedValue({
      events: [],
      guests: [
        { people: [{ id: 'p-1', name: 'Ella Hart' }] },
        { people: [{ id: 'p-2', name: 'Mia Stone' }, { id: 'p-3', name: 'Noah Reed' }] },
      ],
    });
    m.setRole.mockResolvedValue({
      ok: true,
      members: [
        { personId: 'p-1', invitationId: 'i-1', name: 'Ella Hart', role: 'Maid of honour', side: 'p1', token: null },
        { personId: 'p-2', invitationId: 'i-2', name: 'Mia Stone', role: 'Bridesmaid', side: 'p1', token: null },
      ],
    });
    const setD = vi.fn();
    render(<PartyBuilder d={party} setD={setD} />);

    expect(screen.getByRole('heading', { name: 'Your wedding party' })).toBeInTheDocument();
    const moh = screen.getByRole('group', { name: 'Maid of honour' });
    expect(within(moh).getByText('Ella Hart')).toBeInTheDocument();
    expect(within(moh).getByRole('button', { name: 'Remove Ella Hart as Maid of honour' })).toBeInTheDocument();
    // One person: the add box hides behind "Change".
    expect(within(moh).queryByRole('textbox')).toBeNull();
    expect(within(moh).getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Groomsmen' })).toBeInTheDocument();

    const maids = screen.getByRole('group', { name: 'Bridesmaids' });
    fireEvent.change(within(maids).getByRole('textbox', { name: 'Add a Bridesmaid' }), { target: { value: 'mia' } });
    const suggestion = await within(maids).findByRole('button', { name: 'Mia Stone' });
    expect(within(maids).queryByRole('button', { name: 'Ella Hart' })).toBeNull(); // already in the party
    fireEvent.click(suggestion);

    expect(m.setRole).toHaveBeenCalledWith('w1', 'p-2', 'Bridesmaid');
    // Shown straight away while it saves.
    expect(within(maids).getByText('Mia Stone')).toBeInTheDocument();
    await waitFor(() => expect(setD).toHaveBeenCalled());
    const saved = setD.mock.calls[0]![0] as PartyData;
    expect(saved.members.map((x) => x.name)).toEqual(['Ella Hart', 'Mia Stone']);
    expect(saved.members[0]!.token).toBe('tok'); // keeps their link
  });
});

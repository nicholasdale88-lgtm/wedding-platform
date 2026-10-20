import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
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

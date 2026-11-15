import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BOARDS, ColourBoards } from '../src/admin/pages/ColourBoards';

describe('colour boards (the design studio)', () => {
  it('every board is a whole palette: five colours and a seal', () => {
    expect(BOARDS.length).toBeGreaterThanOrEqual(12);
    for (const b of BOARDS) for (const c of [b.paper, b.soft, b.accent, b.ink, b.envelope]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('tapping a board puts its colours and seal on the invitation, and shows it chosen', () => {
    const setInv = vi.fn();
    const { rerender } = render(<ColourBoards inv={{}} setInv={setInv} names={['H', 'T']} />);
    const b = BOARDS.find((x) => x.name === 'Navy & gold')!;
    fireEvent.click(screen.getByRole('radio', { name: /Navy & gold/ }));
    expect(setInv).toHaveBeenCalledWith({ custom: { paper: b.paper, soft: b.soft, accent: b.accent, ink: b.ink, envelope: b.envelope }, seal: 'Gold' });
    rerender(<ColourBoards inv={{ custom: { paper: b.paper, soft: b.soft, accent: b.accent, ink: b.ink, envelope: b.envelope } }} setInv={setInv} names={['H', 'T']} />);
    expect(screen.getByRole('radio', { name: /Navy & gold/ })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('mood boards', () => {
  it('the chosen board is pinned up large as "Your board", with its materials and seal', () => {
    const b = BOARDS.find((x) => x.name === 'Olive grove')!;
    render(<ColourBoards inv={{ custom: { paper: b.paper, soft: b.soft, accent: b.accent, ink: b.ink, envelope: b.envelope }, seal: b.seal }} setInv={() => {}} names={['H', 'T']} />);
    expect(screen.getByText('Your board')).toBeInTheDocument();
    expect(screen.getByText(`Wax seal · ${b.seal}`)).toBeInTheDocument();
    for (const m of b.materials) expect(screen.getAllByText(new RegExp(m)).length).toBeGreaterThan(0);
  });
  it('no board chosen: nothing pinned up large', () => {
    render(<ColourBoards inv={{}} setInv={() => {}} names={['H', 'T']} />);
    expect(screen.queryByText('Your board')).toBeNull();
  });
});

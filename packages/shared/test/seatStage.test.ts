import { describe, expect, it } from 'vitest';
import { anyChanges, seatBaseline, seatChanges, seatChangesLine, seatStage } from '../src/seatStage';

/** Seating's life: the stage it's at, and what changed since it was last saved. */
describe('seating stage', () => {
  const base = { sent: false, invited: 100, replied: 0, closed: false, published: false };

  it('starts as a draft, moves on as invitations go out and replies come in', () => {
    expect(seatStage(base)).toBe('draft');
    expect(seatStage({ ...base, sent: true })).toBe('replies');
    expect(seatStage({ ...base, replied: 5 })).toBe('replies'); // a reply means they're out, even without a text
    expect(seatStage({ ...base, sent: true, replied: 79 })).toBe('replies');
    expect(seatStage({ ...base, sent: true, replied: 80 })).toBe('final'); // most are in
    expect(seatStage({ ...base, sent: true, replied: 10, closed: true })).toBe('final'); // the reply date has passed
    expect(seatStage({ ...base, sent: true, replied: 10, published: true })).toBe('published');
    expect(seatStage({ ...base, invited: 0 })).toBe('draft'); // nobody invited yet
  });
});

describe('seating changes since the last save', () => {
  const tables = [
    { id: 't4', name: '4' },
    { id: 't7', name: '7' },
    { id: 'th', name: 'Head table' },
  ];
  const saved = seatBaseline(
    '2026-11-01T00:00:00Z',
    [
      { id: 'a', name: 'Ava', coming: false, tableId: 't4' }, // pencilled in
      { id: 'b', name: 'Ben', coming: false, tableId: 't4' },
      { id: 'c', name: 'Cal', coming: false, tableId: 't4' },
      { id: 'd', name: 'Dee', coming: true, tableId: 't4' },
      { id: 'e', name: 'Eli', coming: false, tableId: 't7' },
      { id: 'f', name: 'Fay', coming: false, tableId: null }, // not seated
      { id: 'g', name: 'Gus', coming: true, tableId: 'th' },
    ],
    tables,
  );

  it('keeps names, yes or pencilled in, and the table name', () => {
    expect(saved.people.a).toEqual({ n: 'Ava', y: 0, t: '4' });
    expect(saved.people.f).toEqual({ n: 'Fay', y: 0 });
    expect(saved.people.g).toEqual({ n: 'Gus', y: 1, t: 'Head table' });
  });

  it('says who said yes, who can no longer come (and where seats freed up) and who is new', () => {
    const now = [
      { id: 'a', name: 'Ava', coming: true, tableId: 't4' }, // said yes: still at Table 4
      { id: 'b', name: 'Ben', coming: true, tableId: 't4' },
      { id: 'c', name: 'Cal', coming: true, tableId: 't4' },
      // Dee and Eli said no: gone from the list, their seats freed
      { id: 'f', name: 'Fay', coming: false, tableId: null }, // still waiting: no change
      { id: 'g', name: 'Gus', coming: true, tableId: 'th' },
      { id: 'h', name: 'Hal', coming: false, tableId: null }, // newly invited
    ];
    const c = seatChanges(saved, now);
    expect(c).toEqual({
      saidYes: ['Ava', 'Ben', 'Cal'],
      cantCome: [
        { name: 'Dee', table: '4' },
        { name: 'Eli', table: '7' },
      ],
      newGuests: ['Hal'],
    });
    expect(anyChanges(c)).toBe(true);
    expect(seatChangesLine(c)).toBe('3 said yes (pencilled in → confirmed) · 2 can’t come (seats freed at Table 4 and Table 7) · 1 new guest to place');
  });

  it('nothing to say when nothing changed, or the plan was never saved', () => {
    const same = Object.entries(saved.people).map(([id, p]) => ({ id, name: p.n, coming: !!p.y, tableId: p.t ? tables.find((t) => t.name === p.t)!.id : null }));
    expect(anyChanges(seatChanges(saved, same))).toBe(false);
    expect(seatChanges(null, same)).toEqual({ saidYes: [], cantCome: [], newGuests: [] });
    expect(seatChangesLine(seatChanges(null, same))).toBe('');
  });

  it('one seat freed reads naturally', () => {
    expect(seatChangesLine({ saidYes: [], cantCome: [{ name: 'Gus', table: 'Head table' }], newGuests: ['Hal', 'Ida'] })).toBe('1 can’t come (seat freed at Head table) · 2 new guests to place');
  });
});

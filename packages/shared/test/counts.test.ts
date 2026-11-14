import { describe, expect, it } from 'vitest';
import { countGuests, type CountableGuest } from '../src/counts';

const g = (seatsHeld: number, attending: boolean | null, count?: number, invited = ['wedding']): CountableGuest => ({
  seatsHeld,
  invited,
  rsvp: attending === null ? {} : { wedding: { attending, count } },
  people: Array.from({ length: seatsHeld }, (_, i) => ({ name: `P${i}`, child: i === 2 })),
});

describe('counting guests, the same on every page', () => {
  it('coming + can’t come + still to reply always add up to the guests invited', () => {
    const list = [g(2, true, 2), g(3, true, 2), g(2, false), g(1, null), g(4, null), g(2, true, 2, ['brunch'])];
    const c = countGuests(list, 'wedding');
    expect(c.invitations).toBe(5);
    expect(c.guests).toBe(12);
    expect(c.coming).toBe(4); // 2 + 2 (one of a 3 can't come)
    expect(c.cantCome).toBe(3); // the 1 who didn't come with the yes, and both on the no
    expect(c.awaiting).toBe(5);
    expect(c.coming + c.cantCome + c.awaiting).toBe(c.guests);
    expect([c.invitationsYes, c.invitationsNo, c.invitationsAwaiting]).toEqual([2, 1, 2]);
    expect(c.children).toBe(2);
  });

  it('a yes without a number is one person, and a yes for more than the places held still adds up', () => {
    const c = countGuests([g(2, true), g(1, true, 3)], 'wedding');
    expect(c.coming).toBe(4);
    expect(c.coming + c.cantCome + c.awaiting).toBe(c.guests);
  });
});

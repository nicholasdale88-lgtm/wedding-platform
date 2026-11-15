/**
 * How guests are counted, in one place, so every page agrees (the guest list, each event's overview, Account,
 * seating, dietary, the budget). Guests are the places held on invitations (an invitation for a couple holds 2);
 * for an event, every guest is exactly one of: coming, can't come, or still to reply, so the three always add up
 * to the guests invited:
 * - coming: the number a yes said is coming (at least 1);
 * - can't come: everyone on a no, plus the places a yes didn't take (2 of 3 coming: 1 can't come);
 * - still to reply: everyone on an invitation with no answer yet.
 */
export interface CountableGuest {
  seatsHeld: number;
  invited: string[];
  rsvp: Record<string, { attending: boolean | null; count?: number | null } | undefined>;
  people: { name: string; child?: boolean }[];
  phone?: string | null;
  email?: string | null;
}

/**
 * A blank invitation: started with Add guest but never given a name, a mobile or an email. It isn't a guest:
 * the guest list hides it, and no page counts it.
 */
export const isBlankGuest = (g: { people: { name: string }[]; phone?: string | null; email?: string | null }) =>
  !g.people.some((p) => p.name.trim()) && !(g.phone ?? '').trim() && !(g.email ?? '').trim();

/** The real guests: every invitation that isn't blank. */
export const realGuests = <G extends { people: { name: string }[]; phone?: string | null; email?: string | null }>(gs: G[]) => gs.filter((g) => !isBlankGuest(g));

/** Places held on an invitation: at least 1, and at least one for each person named on it. */
export const placesOf = (g: CountableGuest) => Math.max(1, g.seatsHeld || 1, g.people.filter((p) => p.name.trim()).length);

/** How many are coming to an event from this invitation (0 unless they said yes). */
export function comingCount(g: CountableGuest, event: string): number {
  const r = g.rsvp[event];
  if (!g.invited.includes(event) || r?.attending !== true) return 0;
  return Math.max(1, r.count ?? 1);
}

export interface GuestCounts {
  /** Invitations (households) invited to the event. */
  invitations: number;
  /** Guests invited: the places those invitations hold. */
  guests: number;
  /** Children among the named people invited. */
  children: number;
  coming: number;
  cantCome: number;
  awaiting: number;
  /** The same, as invitations: said yes, said no, not answered. */
  invitationsYes: number;
  invitationsNo: number;
  invitationsAwaiting: number;
}

/** Everyone's numbers for one event. */
export function countGuests(guests: CountableGuest[], event: string): GuestCounts {
  const c: GuestCounts = { invitations: 0, guests: 0, children: 0, coming: 0, cantCome: 0, awaiting: 0, invitationsYes: 0, invitationsNo: 0, invitationsAwaiting: 0 };
  for (const g of guests) {
    if (!g.invited.includes(event) || isBlankGuest(g)) continue;
    const places = placesOf(g);
    const a = g.rsvp[event]?.attending ?? null;
    c.invitations++;
    c.guests += places;
    c.children += g.people.filter((p) => p.child && p.name.trim()).length;
    if (a === true) {
      const n = comingCount(g, event);
      c.coming += n;
      c.cantCome += Math.max(0, places - n);
      c.invitationsYes++;
    } else if (a === false) {
      c.cantCome += places;
      c.invitationsNo++;
    } else {
      c.awaiting += places;
      c.invitationsAwaiting++;
    }
  }
  // A yes for more than the places held (the couple let a guest bring one more) is still everyone coming.
  c.guests = Math.max(c.guests, c.coming + c.cantCome + c.awaiting);
  return c;
}

/** "1 guest", "44 guests" */
export const guestsLabel = (n: number) => `${n} ${n === 1 ? 'guest' : 'guests'}`;

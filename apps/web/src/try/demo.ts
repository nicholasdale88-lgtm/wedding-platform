import { ApiError, type EventFull, type EventInfo, type Guest, type GuestDetail, type GuestPatch, type Overview, type RsvpPut, type SeatingData, type SeatTable } from '../lib/api';

/**
 * "Try the app": the real admin, for a made-up wedding, answered here in the browser instead of by the
 * server. Nothing is saved (a refresh starts again) and nothing is sent. Everything at /admin/demo uses it.
 * Screens the sample doesn't cover say so, with a way to start a real wedding.
 */
export const DEMO_WID = 'demo';
export type DemoPlan = 'free' | 'essentials' | 'complete';

export const isDemo = () => typeof window !== 'undefined' && window.location.pathname.startsWith(`/admin/${DEMO_WID}`);

const PLAN_KEY = 'yl-try-plan';
export function demoPlan(): DemoPlan {
  try {
    const p = sessionStorage.getItem(PLAN_KEY);
    return p === 'free' || p === 'complete' ? p : 'essentials';
  } catch {
    return 'essentials';
  }
}
export function setDemoPlan(p: DemoPlan) {
  try {
    sessionStorage.setItem(PLAN_KEY, p);
  } catch {
    /* a private window: it still works for this page */
  }
  plan = p;
}
let plan: DemoPlan = 'essentials';


// ---------------------------------------------------------------- the sample wedding (all made up)
const TZ = 'Australia/Sydney';
const DAY = '2027-03-20T05:00:00.000Z';
const EVENTS: EventInfo[] = [{ id: 'de1', key: 'wedding', name: 'The wedding', pendingLabel: 'the wedding', startsAt: DAY, sort: 0, hasSeating: true, catered: true, questions: [] }];
const FIRST = ['Charlotte', 'Tom', 'Priya', 'Sam', 'Grace', 'Liam', 'Mia', 'Noah', 'Ava', 'Jack', 'Isla', 'Oliver', 'Zoe', 'Ethan', 'Ruby', 'Lucas', 'Chloe', 'Henry', 'Emily', 'Max', 'Sophia', 'Leo', 'Harper', 'Archie', 'Ella', 'Theo', 'Lily', 'Hugo', 'Amelia', 'Finn', 'Evie', 'Oscar', 'Matilda', 'Arlo', 'Willow', 'Felix', 'Poppy', 'Jasper', 'Ivy', 'Louis', 'Hazel', 'Toby'];
const LAST = ['Hale', 'Nair', 'Brooks', 'Chen', 'Walsh', 'Russo', 'Okafor', 'Murphy', 'Kowalski', 'Tanaka', 'Fraser', 'Singh', 'Ng', 'Doyle'];
const DIETS = ['', '', 'Vegetarian', '', '', 'Gluten free', '', '', 'Nut allergy (anaphylaxis)', '', 'Vegan', '', '', '', 'Dairy free', ''];
const PARTIES = ['Family', 'Uni crew', 'Work', 'School friends', ''];

let guests: Guest[] = [];
let tables: SeatTable[] = [];
let seats: Record<string, string | null> = {};
let chairs: Record<string, number> = {};
let version = 1;

function build() {
  plan = demoPlan();
  guests = [];
  let n = 0;
  for (let i = 0; i < 30; i++) {
    const two = i % 3 !== 2;
    const last = LAST[i % LAST.length]!;
    const people = Array.from({ length: two ? 2 : 1 }, (_, j) => {
      const k = n++;
      return { id: `dp${k}`, idx: j, name: `${FIRST[k % FIRST.length]} ${last}`, diet: DIETS[k % DIETS.length]!, table: null, meal: { entree: '', main: '', dessert: '' }, role: '', child: false };
    });
    const state = i % 6 === 5 ? null : i % 9 === 8 ? false : true;
    guests.push({
      id: `dg${i}`,
      phone: i % 7 === 6 ? null : `+614120${String(10000 + i).slice(1)}`,
      phoneDisplay: i % 7 === 6 ? '' : `0412 0${String(10000 + i).slice(1, 3)} ${String(10000 + i).slice(3)}`,
      email: i % 4 === 0 ? `${people[0]!.name.split(' ')[0]!.toLowerCase()}@example.com` : '',
      channel: '',
      seatsHeld: people.length,
      party: PARTIES[i % PARTIES.length]!,
      side: i % 2 ? 'p2' : 'p1',
      relation: '',
      circles: [],
      delivery: 'digital',
      optOut: false,
      version: 1,
      createdAt: '2026-10-01T00:00:00.000Z',
      openedAt: state === null ? null : '2026-10-03T00:00:00.000Z',
      people,
      invited: ['wedding'],
      rsvp: state === null ? {} : { wedding: { attending: state, count: people.length, answers: {}, message: i % 5 === 0 ? 'Can’t wait!' : '', via: 'invitation', updatedAt: '2026-10-05T00:00:00.000Z' } },
      repliedAt: state === null ? null : '2026-10-05T00:00:00.000Z',
      lastSms: { name: 'Invitation', at: '2026-10-02T07:00:00.000Z', status: 'delivered' },
    } as Guest);
  }
  tables = [
    { id: 'dt0', name: 'Bridal table', shape: 'head', dir: 'h', len: 40, x: 50, y: 14, seats: 8, sides: 1 } as SeatTable,
    ...[1, 2, 3, 4, 5, 6].map((k) => ({ id: `dt${k}`, name: String(k), shape: 'round', dir: 'h', len: 30, x: 18 + ((k - 1) % 3) * 32, y: k <= 3 ? 44 : 76, seats: 10 }) as SeatTable),
  ];
  seats = {};
  chairs = {};
  const coming = guests.filter((g) => g.rsvp.wedding?.attending).flatMap((g) => g.people);
  coming.slice(0, 34).forEach((p, i) => {
    seats[p.id] = `dt${1 + (i % 6)}`;
  });
  version = 1;
}

function overview(): Overview {
  const coming = guests.filter((g) => g.rsvp.wedding?.attending);
  const people = guests.flatMap((g) => g.people);
  return {
    wedding: { id: DEMO_WID, slug: 'olivia-and-james-sample', name1: 'Olivia Bennett', name2: 'James Carter', monogram: 'O&J', theme: 'Cream & Sage', timezone: TZ, adminName: '', plan },
    total: guests.length,
    replied: guests.filter((g) => g.repliedAt).length,
    awaiting: guests.filter((g) => !g.repliedAt).length,
    expectedGuests: 80,
    yesInv: coming.length,
    noInv: guests.filter((g) => g.rsvp.wedding?.attending === false).length,
    seatsHeld: guests.reduce((a, g) => a + g.seatsHeld, 0),
    events: [{ key: 'wedding', name: 'The wedding', startsAt: DAY, venue: 'Bellbird Estate', coming: coming.reduce((a, g) => a + g.people.length, 0) }],
    diet: { people: people.filter((p) => p.diet).length, serious: people.filter((p) => /allerg|anaphyl/i.test(p.diet)).length, mealsSet: 0 },
    daysToGo: Math.max(0, Math.round((Date.parse(DAY) - Date.now()) / 86_400_000)),
    needsYou: [{ kind: 'awaiting', title: `${guests.filter((g) => !g.repliedAt).length} invitations still to reply`, detail: 'A gentle reminder goes out by itself two weeks before replies close.', cta: 'See who', link: 'guests?filter=awaiting' }],
    nextUp: [],
    latest: guests
      .filter((g) => g.repliedAt)
      .slice(0, 5)
      .map((g) => ({ id: g.id, name: g.people[0]!.name, at: g.repliedAt!, summary: `The wedding: ${g.rsvp.wedding?.attending ? 'Attending' : 'Declined'}`, message: g.rsvp.wedding?.message ?? '' })),
    nav: { guests: guests.length, dietary: people.filter((p) => p.diet).length, autopilot: 6, smsLive: false },
    partySides: { p1: 'Olivia', p2: 'James' },
    focus: null,
  };
}

const eventsFull = (): EventFull[] => [
  { id: 'de1', key: 'wedding', name: 'The wedding', pendingLabel: 'the wedding', startsAt: DAY, venue: 'Bellbird Estate', address: 'Hunter Valley NSW', mapUrl: '', catered: true, hasSeating: true, questions: [], sort: 0, version: 1, invited: guests.length, coming: overview().events[0]!.coming },
];

const detail = (g: Guest): GuestDetail => ({ guest: g, link: `${location.origin}/demo`, sms: g.lastSms ? [g.lastSms] : [], events: EVENTS, campaigns: [{ id: 'dc1', name: 'Invitation' }, { id: 'dc2', name: 'RSVP reminder' }] });

function seating(): SeatingData {
  const coming = guests.filter((g) => g.rsvp.wedding?.attending !== false);
  return {
    published: null,
    stage: { auto: 'replies', chosen: null, sent: true, invited: guests.length, replied: guests.filter((g) => g.repliedAt).length, closed: false, published: false },
    sinceSave: null,
    versions: [],
    current: null,
    version,
    event: { key: 'wedding', name: 'The wedding' },
    events: [{ key: 'wedding', name: 'The wedding' }],
    aspect: '4 / 3',
    planImg: '',
    tables,
    areas: [{ label: 'Dance floor', x: 50, y: 60, w: 22, h: 10 }],
    people: coming.flatMap((g) =>
      g.people.map((p) => ({ id: p.id, invitationId: g.id, name: p.name, party: g.party, side: g.side ?? '', relation: '', circles: [], role: p.role ?? '', diet: p.diet, meal: { e: '', m: '', d: '' }, tableId: seats[p.id] ?? null, chair: chairs[p.id] ?? null, coming: !!g.rsvp.wedding?.attending })),
    ),
    couple: [
      { id: 'couple-1', invitationId: 'couple', name: 'Olivia Bennett', party: 'The couple', side: 'p1', diet: '', meal: { e: '', m: '', d: '' }, tableId: seats['couple-1'] ?? 'dt0', chair: chairs['couple-1'] ?? 4, coming: true },
      { id: 'couple-2', invitationId: 'couple', name: 'James Carter', party: 'The couple', side: 'p2', diet: '', meal: { e: '', m: '', d: '' }, tableId: seats['couple-2'] ?? 'dt0', chair: chairs['couple-2'] ?? 5, coming: true },
    ],
  };
}

// ---------------------------------------------------------------- answering the admin
const notHere = () => new ApiError(404, 'demo', 'This part isn’t in the sample. Start your wedding to use it: everything you set up stays.');
const FEATURE_OF: [RegExp, string][] = [
  [/\/seating/, 'seating'],
  [/\/planner/, 'planner'],
];

function patchGuest(g: Guest, p: GuestPatch): Guest {
  const next = { ...g, version: g.version + 1 } as Guest;
  for (const k of ['channel', 'side', 'relation', 'circles', 'delivery', 'invited', 'party', 'seatsHeld'] as const) if (p[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = p[k];
  if (p.email !== undefined) next.email = p.email ?? '';
  if (p.phone !== undefined) {
    next.phone = p.phone;
    next.phoneDisplay = p.phone ?? '';
  }
  if (p.people) {
    const people = p.people.map((name, idx) => ({ ...(g.people[idx] ?? { id: `dp${Date.now()}${idx}`, diet: '', table: null, meal: { entree: '', main: '', dessert: '' }, role: '', child: false }), idx, name }));
    next.people = people;
    next.seatsHeld = Math.max(next.seatsHeld, people.length);
  }
  if (p.children) next.people = next.people.map((x, i) => ({ ...x, child: p.children![i] ?? x.child }));
  return next;
}

export async function demoRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!guests.length) build();
  await new Promise((ok) => setTimeout(ok, 120)); // feels like a real save
  const method = (init.method ?? 'GET').toUpperCase();
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const at = path.split('?')[0]!;
  const w = `/a/w/${DEMO_WID}`;
  const ok = (x: unknown) => x as T;
  if (at === '/a/me') return ok({ user: { id: 'demo-user', email: 'you@example.com', superAdmin: false }, weddings: [{ id: DEMO_WID, slug: 'olivia-and-james-sample', name1: 'Olivia Bennett', name2: 'James Carter', role: 'owner' }] });
  if (at === '/a/auth/logout') return ok({ ok: true });
  if (!at.startsWith(w)) throw notHere();
  const rest = at.slice(w.length);
  // Locked on the sample's plan: the upgrade card shows, exactly as for a real couple.
  for (const [re, feature] of FEATURE_OF) {
    if (re.test(rest) && method !== 'GET' && plan === 'free') {
      window.dispatchEvent(new CustomEvent('wp:upgrade', { detail: feature }));
      throw new ApiError(402, 'upgrade', 'That comes with Essentials.');
    }
  }
  if (rest === '/overview') return ok(overview());
  if (rest === '/events') return ok({ timezone: TZ, events: eventsFull() });
  if (rest === '/guests' && method === 'GET') return ok({ events: EVENTS, guests: guests.filter((g) => !(g as Guest & { gone?: boolean }).gone) });
  if (rest === '/guests' && method === 'POST') {
    const g = { ...guests[0]!, id: `dg${Date.now()}`, phone: null, phoneDisplay: '', email: '', version: 1, people: [{ id: `dp${Date.now()}`, idx: 0, name: '', diet: '', table: null, meal: { entree: '', main: '', dessert: '' }, role: '', child: false }], rsvp: {}, repliedAt: null, openedAt: null, lastSms: null, party: '', seatsHeld: 1 } as Guest;
    guests = [g, ...guests];
    return ok(detail(g));
  }
  const gm = /^\/guests\/([^/]+)(\/rsvp|\/restore)?$/.exec(rest);
  if (gm) {
    const i = guests.findIndex((x) => x.id === gm[1]);
    if (i < 0) throw notHere();
    const g = guests[i]!;
    if (!gm[2] && method === 'GET') return ok(detail(g));
    if (!gm[2] && method === 'PATCH') return ok(detail((guests[i] = patchGuest(g, body as GuestPatch))));
    if (!gm[2] && method === 'DELETE') {
      guests = guests.filter((x) => x.id !== g.id);
      return ok({ ok: true });
    }
    if (gm[2] === '/rsvp' && method === 'PUT') {
      const r = body as unknown as RsvpPut;
      const rsvp = { ...g.rsvp };
      for (const [k, v] of Object.entries(r.events)) rsvp[k] = { ...(rsvp[k] ?? { attending: null, count: 1, answers: {}, message: '', via: 'admin', updatedAt: '' }), attending: v.attending, updatedAt: new Date().toISOString() };
      if (r.count) for (const k of Object.keys(rsvp)) rsvp[k] = { ...rsvp[k]!, count: r.count };
      guests[i] = { ...g, rsvp, version: g.version + 1, repliedAt: new Date().toISOString() };
      return ok(detail(guests[i]!));
    }
  }
  if (rest === '/seating' && method === 'GET') return ok(seating());
  if (rest === '/seating' && method === 'PUT') {
    const b = body as { tables: SeatTable[]; seats: Record<string, string | null>; chairs?: Record<string, number> };
    tables = b.tables;
    seats = { ...seats, ...b.seats };
    chairs = { ...chairs, ...(b.chairs ?? {}) };
    version += 1;
    return ok(seating());
  }
  if (method === 'GET') throw notHere();
  throw new ApiError(400, 'demo', 'In the sample, that isn’t saved or sent. Start your wedding to do it for real.');
}


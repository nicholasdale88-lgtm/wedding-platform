import { z } from 'zod';

/**
 * The planner: the wedding party (roles on guests), the party's own run sheet (more detailed than the
 * guests' one, per event), and each partner's on-the-day checklist. "p1"/"p2" are the two partners, in
 * the order of the couple's names; each side of the wedding party belongs to one of them.
 */

export type Side = 'p1' | 'p2' | '';
/** The usual roles, each with the side it usually stands on (the couple's first name is shown for it). */
export const PARTY_ROLES: { role: string; side: Side }[] = [
  { role: 'Maid of honour', side: 'p1' },
  { role: 'Bridesmaid', side: 'p1' },
  { role: 'Flower girl', side: 'p1' },
  { role: 'Parent of the bride', side: 'p1' },
  { role: 'Best man', side: 'p2' },
  { role: 'Groomsman', side: 'p2' },
  { role: 'Page boy', side: 'p2' },
  { role: 'Ring bearer', side: 'p2' },
  { role: 'Parent of the groom', side: 'p2' },
  { role: 'MC', side: '' },
  { role: 'Usher', side: '' },
  { role: 'Reader', side: '' },
  { role: 'Celebrant', side: '' },
];
export const sideOf = (role: string): Side => PARTY_ROLES.find((r) => r.role.toLowerCase() === role.trim().toLowerCase())?.side ?? '';

const s = (max: number) => z.string().max(max).default('');

/** Who an item is for: "party" (everyone), "p1"/"p2" (one side), or a role ("MC", "Best man"). */
export const PartyItem = z.object({
  time: s(20),
  until: s(20),
  title: z.string().max(120),
  detail: s(800),
  place: s(200),
  who: z.array(z.string().max(40)).max(20).default(['party']),
});
export type PartyItem = z.infer<typeof PartyItem>;
/** Something to bring on the day, for everyone in the party, one side, or one role. */
export const PackItem = z.object({ text: z.string().max(160), who: z.array(z.string().max(40)).max(20).default(['party']) });
export type PackItem = z.infer<typeof PackItem>;
export const PartyRunsheet = z.object({ items: z.array(PartyItem).max(100).default([]), note: s(1500), packing: z.array(PackItem).max(120).default([]) });
export type PartyRunsheet = z.infer<typeof PartyRunsheet>;

/** When a checklist item happens: from a month out to the days after. */
export const PHASES = ['month', 'week', 'eve', 'morning', 'ceremony', 'reception', 'after'] as const;
export type Phase = (typeof PHASES)[number];
export const WEDDING_PHASES: Record<Phase, string> = {
  month: 'The month before',
  week: 'The week before',
  eve: 'The day before',
  morning: 'The morning',
  ceremony: 'The ceremony',
  reception: 'The reception',
  after: 'After the wedding',
};
/** The same moments for a party (a birthday): setting up, guests arriving, the party itself. */
export const PARTY_PHASES: Record<Phase, string> = {
  month: 'The month before',
  week: 'The week before',
  eve: 'The day before',
  morning: 'On the day: setting up',
  ceremony: 'As guests arrive',
  reception: 'The party',
  after: 'After',
};

export const CheckItem = z.object({
  text: z.string().max(200),
  time: s(20),
  done: z.boolean().default(false),
  phase: z.enum(PHASES).default('morning'),
  note: s(300),
});
export type CheckItem = z.infer<typeof CheckItem>;
/** Each partner's own list, and the things you do together. */
export const DayChecklist = z.object({
  p1: z.array(CheckItem).max(120).default([]),
  p2: z.array(CheckItem).max(120).default([]),
  both: z.array(CheckItem).max(120).default([]),
});
export type DayChecklist = z.infer<typeof DayChecklist>;
/** A checklist for an event that isn't the wedding (a birthday): the host's things to do. */
export const EventChecklist = z.object({ items: z.array(CheckItem).max(150).default([]) });
export type EventChecklist = z.infer<typeof EventChecklist>;

/** The document that holds a side's people and to-dos (helpers on neither side have their own). */
export const sideDoc = (side: Side) => (side === 'p1' ? 'party-p1' : side === 'p2' ? 'party-p2' : 'party-help') as 'party-p1' | 'party-p2' | 'party-help';

/** Progress over a list: how many are done, of how many. */
export const progressOf = (items: { done: boolean }[]) => ({ done: items.filter((x) => x.done).length, total: items.length });

// ---------------------------------------------------------------- one side of the wedding party

/** Something the side does before the day (order dresses, plan the hens), for one person or the whole side. */
export const SideTask = z.object({
  id: z.string().max(40),
  text: z.string().max(200),
  person: s(40), // a person id, or '' for the whole side
  due: s(10), // yyyy-mm-dd
  done: z.boolean().default(false),
});
export type SideTask = z.infer<typeof SideTask>;
/** One member's details: what they wear, their size, fittings, what they've paid, their thank-you gift. */
export const SidePerson = z.object({
  outfit: s(120),
  size: s(40),
  fitting: s(10), // yyyy-mm-dd
  collected: z.boolean().default(false),
  paid: z.boolean().default(false),
  gift: s(120),
  given: z.boolean().default(false),
  notes: s(500),
  /** What they've packed from the shared lists (by wording), ticked on their own page. */
  packed: z.array(z.string().max(160)).max(150).default([]),
  /** Things they added to their own packing list. */
  pack: z.array(z.object({ text: z.string().max(160), done: z.boolean().default(false) })).max(40).default([]),
});
export type SidePerson = z.infer<typeof SidePerson>;
/** The side's own celebration before the day (the hens or the bucks). */
export const SideParty = z.object({
  title: s(60),
  date: s(10),
  place: s(200),
  organiser: s(80),
  budget: money0(),
  notes: s(1000),
});
/** What the side wears: one look, where it's from, roughly what it costs each. */
export const SideAttire = z.object({ what: s(120), colour: s(60), where: s(160), each: money0(), orderBy: s(10), notes: s(600) });
/** One person in the hair and makeup chairs: what they're having and how long each takes. */
export const GlamPerson = z.object({
  id: z.string().max(40),
  who: z.string().max(80),
  hair: z.boolean().default(true),
  makeup: z.boolean().default(true),
  hairMins: z.number().int().min(10).max(240).default(45),
  makeupMins: z.number().int().min(10).max(240).default(45),
  /** The bride (or whoever should be done last, fresh for the photos). */
  last: z.boolean().default(false),
});
export type GlamPerson = z.infer<typeof GlamPerson>;
/** The hair and makeup morning: when everyone must be ready, how many artists of each, who's in the chairs. */
export const Glam = z.object({
  finish: s(20),
  hairArtists: z.number().int().min(1).max(6).default(1),
  makeupArtists: z.number().int().min(1).max(6).default(1),
  people: z.array(GlamPerson).max(20).default([]),
});
export type Glam = z.infer<typeof Glam>;

/** "9:30am" (or "14:15") → minutes after midnight; null when it can't be read. */
export function clockMinutes(t: string): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const ap = (m[3] ?? '').toLowerCase();
  if (h > 23 || Number(m[2] ?? 0) > 59) return null;
  if (ap) h = (h % 12) + (ap === 'pm' ? 12 : 0);
  return h * 60 + Number(m[2] ?? 0);
}
/** Minutes after midnight → "9:30am". */
export const clockText = (mins: number) => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};

/**
 * The chairs: each artist takes the next person waiting for them (the one marked last goes after everyone
 * else), worked forward, then the whole morning is set to end at the finish time. Returns each person's
 * slots in minutes after midnight (or relative to the end when there's no finish time) and the start.
 */
export function glamSchedule(g: Glam): { start: number; end: number; rows: { id: string; who: string; hair?: [number, number]; makeup?: [number, number] }[] } {
  type Job = { p: GlamPerson; need: Set<'hair' | 'makeup'>; busyUntil: number; slots: { hair?: [number, number]; makeup?: [number, number] } };
  const jobs: Job[] = g.people.map((p) => ({ p, need: new Set([...(p.hair ? ['hair' as const] : []), ...(p.makeup ? ['makeup' as const] : [])]), busyUntil: 0, slots: {} }));
  const artists: { kind: 'hair' | 'makeup'; free: number }[] = [
    ...Array.from({ length: g.hairArtists }, () => ({ kind: 'hair' as const, free: 0 })),
    ...Array.from({ length: g.makeupArtists }, () => ({ kind: 'makeup' as const, free: 0 })),
  ];
  // Whoever is marked last waits until everyone else is done with that service.
  const othersNeed = (kind: 'hair' | 'makeup', who: Job) => jobs.some((j) => j !== who && !j.p.last && j.need.has(kind));
  let guard = 0;
  while (jobs.some((j) => j.need.size) && guard++ < 500) {
    const a = artists.reduce((x, y) => (y.free < x.free ? y : x));
    const waiting = jobs
      .filter((j) => j.need.has(a.kind) && !(j.p.last && othersNeed(a.kind, j)))
      .sort((x, y) => Math.max(x.busyUntil, a.free) - Math.max(y.busyUntil, a.free) || Number(x.p.last) - Number(y.p.last));
    const j = waiting[0];
    if (!jobs.some((x) => x.need.has(a.kind))) {
      a.free = Infinity; // nobody left for this artist
      continue;
    }
    if (!j) {
      // Nothing this artist can do yet: wait for the next person to come free.
      const next = Math.min(...jobs.filter((x) => x.need.has(a.kind)).map((x) => x.busyUntil).filter((t) => t > a.free), Infinity);
      if (!Number.isFinite(next)) a.free = Math.min(...artists.filter((x) => x !== a).map((x) => x.free)) + 1;
      else a.free = next;
      continue;
    }
    const s = Math.max(a.free, j.busyUntil);
    const e = s + (a.kind === 'hair' ? j.p.hairMins : j.p.makeupMins);
    j.slots[a.kind] = [s, e];
    j.need.delete(a.kind);
    j.busyUntil = e;
    a.free = e;
  }
  const total = Math.max(0, ...jobs.flatMap((j) => [j.slots.hair?.[1] ?? 0, j.slots.makeup?.[1] ?? 0]));
  const finish = clockMinutes(g.finish);
  const shift = finish === null ? -total : finish - total;
  const at = (x?: [number, number]): [number, number] | undefined => (x ? [x[0] + shift, x[1] + shift] : undefined);
  return { start: shift, end: shift + total, rows: jobs.map((j) => ({ id: j.p.id, who: j.p.who, hair: at(j.slots.hair), makeup: at(j.slots.makeup) })) };
}

export const PartySide = z.object({
  tasks: z.array(SideTask).max(80).default([]),
  glam: Glam.default({}),
  people: z.record(z.string().max(40), SidePerson).default({}),
  party: SideParty.default({}),
  attire: SideAttire.default({}),
});
export type PartySide = z.infer<typeof PartySide>;

function money0() {
  return z.number().min(0).max(1_000_000).default(0);
}

/** What the two sides are called (the couple can change them, e.g. "Bride" and "Bride"). */
export const PartySetup = z.object({
  p1: z.string().max(30).default('Bride'),
  p2: z.string().max(30).default('Groom'),
  /** "Who's who" on the invitation: the party's names and roles, under the first event. Off until switched on. */
  showOnInvite: z.boolean().default(false),
  /** Wedding party sign-in, per person id: false pauses that member's page (everyone else can sign in). */
  access: z.record(z.string().max(40), z.boolean()).default({}),
  /** The party portal needs a sign-in (email and password): their private links alone no longer open it. */
  signIn: z.boolean().default(false),
});
export type PartySetup = z.infer<typeof PartySetup>;

// ---------------------------------------------------------------- the wedding party portal: what each member can see and do

export const PARTY_PERMS = ['runsheet', 'tasks', 'addTasks', 'sideTasks', 'packing', 'speeches', 'people', 'vendors', 'guests', 'seating'] as const;
export type PartyPerm = (typeof PARTY_PERMS)[number];
/** Each permission: its name and what it means, for the couple. */
export const PARTY_PERM_LABEL: Record<PartyPerm, [string, string]> = {
  runsheet: ['Their part of the day', 'The run sheet lines for them, their side or their role'],
  tasks: ['Their to-dos', 'See and tick off what you’ve given them'],
  addTasks: ['Add their own to-dos', 'Keep their own list with yours'],
  sideTasks: ['Their side’s shared to-dos', 'Everything for the whole side, not just theirs'],
  packing: ['Packing list', 'What to bring on the day, ticked off'],
  speeches: ['Speeches and who holds what', 'The speaking order, and what they’re looking after'],
  people: ['Wedding party phone numbers', 'Everyone in the party, a tap to call or text'],
  vendors: ['Suppliers and arrival times', 'Who’s coming when on the day, with their phone'],
  guests: ['Guest numbers', 'How many are coming and how many still to reply'],
  seating: ['The seating plan', 'Every table and who’s at it'],
};
/** Starting points: the lead of each side (maid of honour, best man) sees more. */
export const PERM_PRESETS: Record<'lead' | 'member' | 'view', { label: string; perms: PartyPerm[] }> = {
  lead: { label: 'Lead (maid of honour, best man)', perms: ['runsheet', 'tasks', 'addTasks', 'sideTasks', 'packing', 'speeches', 'people', 'vendors', 'guests', 'seating'] },
  member: { label: 'Wedding party', perms: ['runsheet', 'tasks', 'addTasks', 'sideTasks', 'packing', 'speeches', 'people'] },
  view: { label: 'Just looking', perms: ['runsheet', 'packing', 'speeches'] },
};
export const presetFor = (role: string): keyof typeof PERM_PRESETS => (/(maid|matron) of honou?r|best (wo)?man|lead/i.test(role) ? 'lead' : 'member');
/** A member's permissions: what the couple set, else the preset for their role. */
export function permsOf(stored: unknown, role: string): Record<PartyPerm, boolean> {
  const set = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : null;
  const preset = new Set(PERM_PRESETS[presetFor(role)].perms);
  return Object.fromEntries(PARTY_PERMS.map((k) => [k, set && typeof set[k] === 'boolean' ? (set[k] as boolean) : preset.has(k)])) as Record<PartyPerm, boolean>;
}

/** A starting packing list for the day. */
export const PACK_TEMPLATE: PackItem[] = [
  { text: 'Phone, charger and a power bank', who: ['party'] },
  { text: 'Water bottle and a snack', who: ['party'] },
  { text: 'Sunscreen and sunglasses (outdoor photos)', who: ['party'] },
  { text: 'Cash or card for a taxi home', who: ['party'] },
  { text: 'Dress, shoes and jewellery', who: ['p1'] },
  { text: 'Flat shoes for dancing', who: ['p1'] },
  { text: 'Emergency kit: safety pins, bobby pins, tissues, blotting paper, painkillers', who: ['Maid of honour'] },
  { text: 'Lipstick and powder for touch-ups', who: ['p1'] },
  { text: 'A wrap or jacket for the evening', who: ['p1'] },
  { text: 'Suit, shirt, tie and cufflinks', who: ['p2'] },
  { text: 'Polished shoes and dark socks', who: ['p2'] },
  { text: 'Lint roller and deodorant', who: ['p2'] },
  { text: 'The rings', who: ['Best man'] },
  { text: 'Vendor envelopes (final payments and tips)', who: ['Best man'] },
  { text: 'Speech notes', who: ['Best man', 'Maid of honour', 'MC'] },
  { text: 'Run sheet and the vendors’ phone numbers', who: ['MC'] },
];

/** What a party member sees: items for everyone in the party, their side, or their own role. */
export function itemsFor<T extends { who: string[] }>(items: T[], role: string): T[] {
  const side = sideOf(role);
  const r = role.trim().toLowerCase();
  return items.filter((it) => !it.who.length || it.who.some((w) => w === 'party' || (side && w === side) || w.toLowerCase() === r));
}

/** A starting point for the wedding day (times are suggestions; everything is editable). */
export const PARTY_TEMPLATE: PartyItem[] = [
  { time: '8:00am', until: '', title: 'Breakfast together', detail: 'Eat properly: it is a long day. Water bottles for everyone.', place: '', who: ['party'] },
  { time: '8:30am', until: '12:30pm', title: 'Hair and makeup', detail: 'In the order the stylists give. Wear button-up shirts so nothing goes over your head after.', place: '', who: ['p1'] },
  { time: '11:00am', until: '', title: 'Suits on, buttonholes pinned', detail: 'Best man: check you have the rings and the vendor envelopes.', place: '', who: ['p2'] },
  { time: '12:00pm', until: '', title: 'Photographer arrives (getting ready photos)', detail: 'Tidy the room: clear bags and bottles out of the shots.', place: '', who: ['party'] },
  { time: '1:00pm', until: '', title: 'Groomsmen and ushers to the ceremony', detail: 'Ushers: hand out programs, seat family in the front rows, keep the aisle clear.', place: '', who: ['p2', 'Usher'] },
  { time: '1:30pm', until: '', title: 'Guests arrive', detail: '', place: '', who: ['party'] },
  { time: '1:45pm', until: '', title: 'Bridal party leaves for the ceremony', detail: 'Bouquets, tissues, the emergency kit.', place: '', who: ['p1'] },
  { time: '2:00pm', until: '2:30pm', title: 'Ceremony', detail: 'Walk order and positions as rehearsed. Phones on silent.', place: '', who: ['party'] },
  { time: '2:30pm', until: '3:30pm', title: 'Family and bridal party photos', detail: 'Stay close by: the photographer works through the list quickly.', place: '', who: ['party'] },
  { time: '5:30pm', until: '', title: 'Reception entrance', detail: 'Line up in pairs at the door when the MC calls.', place: '', who: ['party', 'MC'] },
  { time: '7:30pm', until: '', title: 'Speeches', detail: 'Keep it to 3–4 minutes each. MC introduces each speaker.', place: '', who: ['MC', 'Best man', 'Maid of honour'] },
];

/** A checklist item: `ck('eve', 'Lay out the dress')`, optionally with a time and a tip. */
const ck = (phase: Phase, text: string, time = '', note = ''): CheckItem => ({ text, time, done: false, phase, note });

/**
 * Each partner's own list from a month out to after the day, and the things you do together. Written for
 * an Australian wedding (the celebrant lodges the paperwork; the official certificate comes from the state
 * registry). Everything can be changed, removed or added to.
 */
export const CHECK_TEMPLATE: DayChecklist = {
  p1: [
    ck('month', 'Final dress fitting', '', 'Bring the shoes and underwear you will wear on the day.'),
    ck('month', 'Wear the wedding shoes in at home'),
    ck('month', 'Hair and makeup trial done; photos of the look saved'),
    ck('month', 'Write your vows (or choose the words with the celebrant)'),
    ck('month', 'Bridesmaids’ gifts bought'),
    ck('month', 'Honeymoon: passport valid 6+ months, bookings in the name on the passport'),
    ck('week', 'Collect the dress; steam it and hang it high'),
    ck('week', 'Nails and any beauty appointments'),
    ck('week', 'Confirm hair and makeup: start time, address, how many people'),
    ck('week', 'Practise the vows out loud'),
    ck('week', 'Emergency kit to the maid of honour', '', 'Safety pins, bobby pins, tissues, blotting paper, painkillers, needle and thread.'),
    ck('week', 'Pack the honeymoon bag'),
    ck('eve', 'Rehearsal: the walk, where everyone stands, who holds what'),
    ck('eve', 'Lay out the dress, shoes, jewellery and veil'),
    ck('eve', 'Pack the day bag: wrap, flat shoes, touch-up kit, phone charger'),
    ck('eve', 'Write a note for your partner (the best man can deliver it)'),
    ck('eve', 'A proper dinner, lots of water, early night'),
    ck('morning', 'Breakfast and water', '8:00am', 'Eat something even if you are nervous: it is a long day.'),
    ck('morning', 'Button-up shirt for hair and makeup'),
    ck('morning', 'Something old, new, borrowed, blue'),
    ck('morning', 'Vows card to the maid of honour'),
    ck('morning', 'Phone charged and handed to the maid of honour'),
    ck('morning', 'Details out for the photographer: rings, invitation, perfume, shoes'),
    ck('morning', 'Getting-ready photos: tidy the room first'),
    ck('ceremony', 'Slow down the walk; look at your partner'),
    ck('ceremony', 'Sign the marriage register (two witnesses over 18)'),
    ck('ceremony', 'A minute alone together after the ceremony'),
    ck('reception', 'Actually eat your meal'),
    ck('reception', 'Say hello to every table'),
    ck('reception', 'Bouquet to the coordinator for the toss'),
    ck('after', 'Dress cleaned and stored'),
    ck('after', 'Name change, once the official certificate arrives', '', 'Only if you’re changing it. Driver licence first, then passport, Medicare, ATO, bank and super, employer, electoral roll, insurance. Taking your spouse’s surname needs no registry application.'),
  ],
  p2: [
    ck('month', 'Final suit fitting'),
    ck('month', 'Wedding rings collected; engraving checked'),
    ck('month', 'Write your vows and your speech'),
    ck('month', 'Haircut booked for 2–3 days before'),
    ck('month', 'Groomsmen’s gifts bought'),
    ck('month', 'Honeymoon booked; travel insurance'),
    ck('week', 'Collect the suit; check every piece is there'),
    ck('week', 'Vendor envelopes: final payments and tips, labelled', '', 'The best man hands them over on the night.'),
    ck('week', 'Confirm cars or transport and their times'),
    ck('week', 'Practise the speech out loud (3–5 minutes)'),
    ck('week', 'Shoes polished'),
    ck('week', 'Pack the honeymoon bag'),
    ck('eve', 'Rehearsal: where you stand, when you turn'),
    ck('eve', 'Rings to the best man'),
    ck('eve', 'Lay out suit, shirt, tie, cufflinks, belt, socks'),
    ck('eve', 'Write a note for your partner (the maid of honour can deliver it)'),
    ck('eve', 'Go easy on the drinks; early night'),
    ck('morning', 'Breakfast and water', '8:00am'),
    ck('morning', 'Shave (not with a new razor)'),
    ck('morning', 'Dressed; buttonhole pinned'),
    ck('morning', 'ID for the celebrant'),
    ck('morning', 'Speech notes in your pocket; groomsmen briefed'),
    ck('morning', 'Phone to the best man'),
    ck('morning', 'At the ceremony 30 minutes early to greet guests'),
    ck('ceremony', 'Look up the aisle'),
    ck('ceremony', 'Sign the marriage register'),
    ck('reception', 'Speech: thank the parents, the party and the vendors; toast your partner'),
    ck('reception', 'Check with the best man that every vendor was paid'),
    ck('after', 'Return the hire suit on time'),
  ],
  both: [
    ck('month', 'Final guest numbers and dietary list to the venue'),
    ck('month', 'Seating plan finished'),
    ck('month', 'Paperwork: the Notice of Intended Marriage was lodged at least a month ago', '', 'If not, talk to your celebrant today: it is the law.'),
    ck('month', 'Decide who holds the rings and who has the vendor envelopes'),
    ck('week', 'Run sheet to the venue, the MC, the photographer and the coordinator'),
    ck('week', 'Balances paid (check the budget’s payments due)'),
    ck('week', 'Check the long-range forecast; agree the time for the wet-weather call'),
    ck('eve', 'Signs, decorations and the guest book to the venue'),
    ck('eve', 'Make the wet-weather call and tell the venue'),
    ck('morning', 'From now on, questions go to the coordinator, not you'),
    ck('ceremony', 'Sign the register and the two certificates (celebrant lodges them within 14 days)'),
    ck('after', 'Order the official marriage certificate from the state registry', '', 'The one you sign on the day is commemorative: it isn’t accepted as legal proof.'),
    ck('after', 'Thank-you cards within three months (Gifts has the list)'),
    ck('after', 'Share the album with guests and back up the photos'),
    ck('after', 'Return anything hired; venue bond back; leave reviews for your vendors'),
  ],
};

/** A 30th (or any party) from the host's side: what to do the month, week, day before, and on the day. */
export const PARTY_CHECK_TEMPLATE: EventChecklist = {
  items: [
    ck('month', 'Venue and catering confirmed'),
    ck('month', 'Ask someone to say a few words'),
    ck('month', 'Order the cake'),
    ck('week', 'Final numbers and dietary needs to the venue or caterer'),
    ck('week', 'Playlist done (and a speaker that works there)'),
    ck('week', 'Photo slideshow or a board of old photos'),
    ck('week', 'Decorations, candles, matches and a lighter'),
    ck('week', 'Plan how everyone gets home (taxis, a designated driver)'),
    ck('eve', 'Drinks and ice bought (or ordered for delivery)'),
    ck('eve', 'Outfit ready; phone and speaker charged'),
    ck('eve', 'Run sheet to whoever is helping'),
    ck('morning', 'Set up decorations and the photo board'),
    ck('morning', 'Collect the cake; confirm deliveries (balloons, hire)'),
    ck('morning', 'Check the weather; plan B if it’s outside'),
    ck('morning', 'Ice in the eskies; glasses out'),
    ck('ceremony', 'Music on; welcome everyone at the door'),
    ck('ceremony', 'Point people to food, drinks and the bathrooms'),
    ck('reception', 'Speeches'),
    ck('reception', 'Cake and candles; someone filming'),
    ck('reception', 'Group photo while everyone is still there'),
    ck('reception', 'Taxis and rideshares sorted as people leave'),
    ck('after', 'Pack down and return anything hired'),
    ck('after', 'Thank everyone who helped'),
    ck('after', 'Share the photos'),
  ],
};

const tk = (text: string): SideTask => ({ id: '', text, person: '', due: '', done: false });
/** What each side usually does before the day. */
export const SIDE_TEMPLATE: Record<'p1' | 'p2', SideTask[]> = {
  p1: [
    tk('Choose the bridesmaids’ dresses (order 4–6 months before)'),
    tk('Everyone’s measurements in; fittings booked'),
    tk('Shoes and accessories chosen'),
    tk('Plan the hens: date, place, who organises'),
    tk('Bridal shower or kitchen tea (if you’re having one)'),
    tk('Hair and makeup booked for everyone, with start times'),
    tk('Maid of honour: speech written'),
    tk('Maid of honour: emergency kit packed'),
    tk('At the ceremony: hold the bouquet, fix the dress and veil'),
    tk('Bridesmaids’ gifts (from the couple)'),
  ],
  p2: [
    tk('Choose the suits: hire or buy, colour and fit'),
    tk('Everyone’s measurements sent to the suit hire'),
    tk('Shoes, ties, socks and cufflinks matched'),
    tk('Plan the bucks: date, place, who organises'),
    tk('Best man: speech written'),
    tk('Best man: holds the rings and the vendor envelopes on the day'),
    tk('Ushers: who seats which family'),
    tk('Collect the hire suits, and return them after'),
    tk('Groomsmen’s gifts (from the couple)'),
  ],
};

// ---------------------------------------------------------------- budget and vendors

const money = z.number().min(0).max(10_000_000).default(0);
/** One payment to a vendor: what it's for, how much, when it's due, and whether it's paid (and when). */
export const Payment = z.object({
  id: z.string().max(40),
  label: s(60),
  amount: money,
  due: s(10), // yyyy-mm-dd
  paid: z.boolean().default(false),
  paidOn: s(10),
});
export type Payment = z.infer<typeof Payment>;

/** One budget line: what it's for, the estimate, the quote once you have one, what's paid, when the rest is due. */
export const BudgetLine = z.object({
  category: z.string().max(60),
  item: s(120),
  estimate: money,
  quote: money,
  paid: money,
  due: s(10), // yyyy-mm-dd, when the rest is due
  vendor: s(120),
  note: s(500),
  /** Who's paying for it ('' is the two of you; e.g. "Her parents"). */
  payer: s(80),
  /** Priced per guest (catering, drinks): the estimate follows the guest count. */
  perHead: money,
});
export type BudgetLine = z.infer<typeof BudgetLine>;
export const Budget = z.object({
  total: money,
  /** The guest count per-guest lines are priced for (0: the number coming so far). */
  guests: z.number().int().min(0).max(5000).default(0),
  lines: z.array(BudgetLine).max(300).default([]),
  /** Your own split by category (share of the total, 0 to 1); categories not here use the usual split. */
  split: z.record(z.string().max(60), z.number().min(0).max(1)).default({}),
});
export type Budget = z.infer<typeof Budget>;

/**
 * The standard budget: each category's usual lines and their share of the whole budget (Australian
 * weddings). Per-guest lines (catering, drinks) are priced per head from the guest count.
 */
export const BUDGET_TEMPLATE: { category: string; item: string; share: number; perHead?: boolean }[] = [
  { category: 'Venue and catering', item: 'Venue hire', share: 0.14 },
  { category: 'Venue and catering', item: 'Catering', share: 0.2, perHead: true },
  { category: 'Venue and catering', item: 'Drinks package', share: 0.08, perHead: true },
  { category: 'Venue and catering', item: 'Ceremony venue and fees', share: 0.02 },
  { category: 'Photography and video', item: 'Photographer', share: 0.08 },
  { category: 'Photography and video', item: 'Videographer', share: 0.04 },
  { category: 'Attire and rings', item: 'Wedding dress', share: 0.04 },
  { category: 'Attire and rings', item: 'Suit', share: 0.015 },
  { category: 'Attire and rings', item: 'Alterations', share: 0.005 },
  { category: 'Attire and rings', item: 'Wedding rings', share: 0.04 },
  { category: 'Attire and rings', item: 'Shoes and accessories', share: 0.02 },
  { category: 'Flowers and styling', item: 'Florist', share: 0.05 },
  { category: 'Flowers and styling', item: 'Styling and hire', share: 0.03 },
  { category: 'Music and entertainment', item: 'Band or DJ', share: 0.05 },
  { category: 'Music and entertainment', item: 'Ceremony music', share: 0.01 },
  { category: 'Hair and makeup', item: 'Hair and makeup', share: 0.03 },
  { category: 'Cake', item: 'Wedding cake', share: 0.02 },
  { category: 'Stationery', item: 'Invitations and stationery', share: 0.012 },
  { category: 'Stationery', item: 'Signage', share: 0.008 },
  { category: 'Celebrant', item: 'Celebrant', share: 0.015 },
  { category: 'Celebrant', item: 'Marriage certificate and fees', share: 0.005 },
  { category: 'Transport', item: 'Wedding cars', share: 0.012 },
  { category: 'Transport', item: 'Guest shuttle', share: 0.008 },
  { category: 'Accommodation and extras', item: 'Accommodation', share: 0.02 },
  { category: 'Accommodation and extras', item: 'Favours and gifts', share: 0.015 },
  { category: 'Accommodation and extras', item: 'Wedding party gifts', share: 0.01 },
  { category: 'Accommodation and extras', item: 'Contingency (for surprises)', share: 0.025 },
];

/** Each category's share of the budget: your own where you've set one, else the usual. */
export const splitOf = (b: Pick<Budget, 'split'>) => BUDGET_SPLIT.map((x) => ({ category: x.category, share: b.split?.[x.category] ?? x.share }));

/**
 * The standard lines for a budget: each line's amount from your total and your split (a category's
 * share is divided among its lines as usual); per-guest lines priced per head. Lines you already have
 * (same item in the same category) are left out.
 */
export function standardLines(b: Pick<Budget, 'total' | 'split' | 'lines'>, guests: number): BudgetLine[] {
  const shares = new Map(splitOf(b).map((x) => [x.category, x.share]));
  const have = new Set(b.lines.map((l) => `${l.category}|${l.item}`.toLowerCase()));
  return BUDGET_TEMPLATE.filter((t) => !have.has(`${t.category}|${t.item}`.toLowerCase())).map((t) => {
    const usual = BUDGET_SPLIT.find((x) => x.category === t.category)?.share ?? t.share;
    const amount = Math.round((b.total * t.share * (shares.get(t.category) ?? usual)) / usual);
    const perHead = t.perHead && guests > 0 ? Math.round((amount / guests) * 100) / 100 : 0;
    return { category: t.category, item: t.item, estimate: perHead ? Math.round(perHead * guests * 100) / 100 : amount, quote: 0, paid: 0, due: '', vendor: '', note: '', payer: '', perHead };
  });
}

/** How Australian couples usually split the budget (a starting point, by share of the total). */
export const BUDGET_SPLIT: { category: string; share: number }[] = [
  { category: 'Venue and catering', share: 0.44 },
  { category: 'Photography and video', share: 0.12 },
  { category: 'Attire and rings', share: 0.12 },
  { category: 'Flowers and styling', share: 0.08 },
  { category: 'Music and entertainment', share: 0.06 },
  { category: 'Hair and makeup', share: 0.03 },
  { category: 'Cake', share: 0.02 },
  { category: 'Stationery', share: 0.02 },
  { category: 'Celebrant', share: 0.02 },
  { category: 'Transport', share: 0.02 },
  { category: 'Accommodation and extras', share: 0.07 },
];

/** Where a vendor is at: an idea, contacted, asked for a quote (pricing), quote in, booked, or not going ahead. */
export const VENDOR_STATUS = ['idea', 'contacted', 'requested', 'quoted', 'booked', 'declined'] as const;

/** A quote from a vendor: the numbers, what's in and out, and the file it came in (if filed). */
export const Quote = z.object({
  id: z.string().max(40),
  amount: money,
  deposit: money,
  date: s(10), // yyyy-mm-dd, when it was given
  validUntil: s(10),
  includes: s(1500),
  excludes: s(1500),
  notes: s(1500),
  fileId: s(40),
  fileName: s(160),
  /** What the assistant read from the file (kept so quotes can be compared later). */
  extract: s(6000),
});
export type Quote = z.infer<typeof Quote>;
export const Vendor = z.object({
  id: z.string().max(40),
  name: z.string().max(120),
  category: s(60),
  status: z.enum(VENDOR_STATUS).default('idea'),
  contact: s(120),
  phone: s(40),
  email: s(120),
  website: s(300),
  address: s(300),
  km: z.number().min(0).max(100_000).nullable().default(null), // from the venue
  quote: money,
  deposit: money,
  depositPaid: z.boolean().default(false),
  balanceDue: s(10), // yyyy-mm-dd
  arrival: s(20), // on the day
  notes: s(1500),
  quotes: z.array(Quote).max(12).default([]),
  /** The quote you accepted (its id): its amount and deposit are this vendor's commitment. */
  accepted: s(40),
  /** The contract: when it was signed, the cancellation terms, whether the deposit comes back, the file. */
  contractSigned: s(10),
  cancellation: s(600),
  depositRefundable: z.boolean().default(false),
  contractFileId: s(40),
  contractFileName: s(160),
  /** Meals for this vendor's team on the day (tell the caterer). */
  meals: z.number().int().min(0).max(50).default(0),
  /** The quote: when you asked for it, when they said it would come (or when to chase), when you last chased. */
  askedOn: s(10),
  quoteBy: s(10),
  chasedOn: s(10),
  /** Not going ahead: why (too dear, booked out, went with someone else). */
  declinedWhy: s(200),
  /** The payment schedule (deposit, instalments, balance), once you've set one; until then it comes from the quote. */
  payments: z.array(Payment).max(12).default([]),
});
export type Vendor = z.infer<typeof Vendor>;

/** A booked vendor's commitment: the accepted quote (or the quote entered by hand). */
export function commitmentOf(v: Vendor): { amount: number; deposit: number } {
  // The accepted quote; else the amount entered by hand; else (booked without choosing) the lowest quote in.
  const q = v.quotes.find((x) => x.id === v.accepted) ?? (v.quote ? undefined : v.quotes.filter((x) => x.amount > 0).sort((a, b) => a.amount - b.amount)[0]);
  return { amount: q?.amount ?? v.quote, deposit: q?.deposit ?? v.deposit };
}
/**
 * When couples usually book each supplier (months before the day). Listed in matching order: a supplier
 * goes to the first whose words match its "what they do" (then its name), so "hair stylist" is hair, not styling.
 */
export const BOOKING_TIMELINE: { what: string; months: number; match: RegExp }[] = [
  { what: 'Venue', months: 15, match: /venue|reception|estate|winery/i },
  { what: 'Band or DJ', months: 9, match: /\bband\b|\bdj\b|music|singer|string|entertain|photo ?booth/i },
  { what: 'Photographer', months: 12, match: /photog|\bphotos?\b/i },
  { what: 'Videographer', months: 10, match: /video|film/i },
  { what: 'Celebrant', months: 10, match: /celebrant|officiant|minister|priest/i },
  { what: 'Catering', months: 10, match: /cater/i },
  { what: 'Hair and makeup', months: 6, match: /\bhair|make-?up|beauty/i },
  { what: 'Attire', months: 9, match: /dress|gown|bridal(?! suite)|\bsuits?\b|tailor|attire/i },
  { what: 'Florist', months: 8, match: /flor|flower/i },
  { what: 'Accommodation', months: 8, match: /accommodation|hotel|motel|lodg|suite/i },
  { what: 'Transport', months: 5, match: /transport|\bcars?\b|\bbus(es)?\b|coach|limo|shuttle/i },
  { what: 'Styling and hire', months: 7, match: /styl|hire|decor|marquee/i },
  { what: 'Stationery', months: 6, match: /station|invit|print/i },
  { what: 'Cake', months: 5, match: /cake|dessert|patisserie/i },
  { what: 'Rings', months: 3, match: /\brings?\b|jewel/i },
];
export type BookingRow = { what: string; months: number; bookBy: string; state: 'booked' | 'looking' | 'none'; vendor: string; late: boolean };

/**
 * Each supplier type against when couples usually book it: booked (and who), looking (on your list, not
 * booked), or not started; `late` once the usual time has passed without a booking. Earliest first.
 * `day`: the wedding's date (midnight UTC of its local date). `venueSet`: the wedding already has a venue
 * (counts as booked without a supplier for it).
 */
export function bookingTimeline(list: Vendor[], day: number, now: number, venueSet = false): BookingRow[] {
  const found = new Map<string, Vendor[]>();
  for (const v of list) {
    const hit = BOOKING_TIMELINE.find((b) => b.match.test(v.category)) ?? BOOKING_TIMELINE.find((b) => b.match.test(v.name));
    if (hit) found.set(hit.what, [...(found.get(hit.what) ?? []), v]);
  }
  return BOOKING_TIMELINE.map((b) => {
    const vs = found.get(b.what) ?? [];
    const booked = vs.find((v) => v.status === 'booked');
    // The same day so many months before (the month's last day when it's shorter: 31 Oct less 8 months is 28 Feb).
    const d = new Date(day);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - b.months + 1, 0)).getUTCDate();
    const by = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - b.months, Math.min(d.getUTCDate(), last)));
    const state: BookingRow['state'] = booked || (b.what === 'Venue' && venueSet) ? 'booked' : vs.length ? 'looking' : 'none';
    return { what: b.what, months: b.months, bookBy: by.toISOString().slice(0, 10), state, vendor: booked?.name ?? '', late: state !== 'booked' && by.getTime() <= now };
  }).sort((a, b) => b.months - a.months);
}

const same = (a: string, b: string) => !!a.trim() && a.trim().toLowerCase() === b.trim().toLowerCase();
/** The budget lines that track this vendor (their "vendor" is the vendor's name). */
export const linesFor = (v: Vendor, lines: BudgetLine[]) => lines.filter((l) => same(l.vendor, v.name));
/** This vendor's budget, as one line: all its lines together (a venue on both "Venue hire" and "Catering"), if any. */
export function lineFor(v: Vendor, lines: BudgetLine[]): BudgetLine | undefined {
  const mine = linesFor(v, lines);
  if (mine.length <= 1) return mine[0];
  const due = mine.map((l) => l.due).filter(Boolean).sort()[0] ?? '';
  return { ...mine[0]!, quote: mine.reduce((a, l) => a + (l.quote || l.estimate), 0), estimate: 0, paid: mine.reduce((a, l) => a + l.paid, 0), due };
}

/**
 * A vendor's payment schedule: the one you set; or, until then, what's known already (from its budget line:
 * paid so far and the rest; or from the accepted quote: the deposit and the balance).
 */
export function scheduleOf(v: Vendor, line?: BudgetLine): Payment[] {
  if (v.payments.length) return v.payments;
  const out: Payment[] = [];
  if (line) {
    const total = line.quote || line.estimate;
    if (line.paid > 0) out.push({ id: 'paid', label: 'Paid so far', amount: Math.min(line.paid, total || line.paid), due: '', paid: true, paidOn: '' });
    if (total > line.paid) out.push({ id: 'balance', label: line.paid > 0 ? 'Balance' : 'Payment', amount: Math.round((total - line.paid) * 100) / 100, due: line.due, paid: false, paidOn: '' });
    return out;
  }
  const c = commitmentOf(v);
  if (c.deposit > 0) out.push({ id: 'deposit', label: 'Deposit', amount: Math.min(c.deposit, c.amount || c.deposit), due: '', paid: v.depositPaid, paidOn: '' });
  if (c.amount > c.deposit) out.push({ id: 'balance', label: c.deposit > 0 ? 'Balance' : 'Payment', amount: Math.round((c.amount - c.deposit) * 100) / 100, due: v.balanceDue, paid: false, paidOn: '' });
  return out;
}

/** What a booked vendor costs (the contract: its line or quote, or the schedule if that adds to more), what's paid, what's owing. */
export function moneyOf(v: Vendor, line?: BudgetLine) {
  const sched = scheduleOf(v, line);
  const scheduled = sched.reduce((a, p) => a + p.amount, 0);
  const contract = line ? line.quote || line.estimate : commitmentOf(v).amount;
  const total = Math.max(contract, scheduled);
  const paid = sched.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
  const next = sched.filter((p) => !p.paid).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0];
  return { total, paid, owing: Math.max(0, total - paid), unscheduled: Math.max(0, contract - scheduled), schedule: sched, next };
}

/**
 * Budget lines with their vendor's schedule applied (once a schedule is set, it says what's paid and when
 * the rest is due). A vendor on several lines has its schedule shared between them, in proportion.
 */
export function withSchedules(lines: BudgetLine[], vendors: Vendor[]): BudgetLine[] {
  return lines.map((l) => {
    const v = vendors.find((x) => x.status === 'booked' && x.payments.length && same(l.vendor, x.name));
    if (!v) return l;
    const all = linesFor(v, lines);
    const m = moneyOf(v, lineFor(v, lines));
    const contract = all.reduce((a, x) => a + (x.quote || x.estimate), 0);
    const share = contract > 0 ? (l.quote || l.estimate) / contract : 1 / all.length;
    const round = (n: number) => Math.round(n * 100) / 100;
    return { ...l, quote: round(m.total * share), paid: round(m.paid * share), due: m.next?.due ?? '' };
  });
}

/** One payment in the whole-wedding schedule. `vendorId` is '' for a budget line with no booked vendor (`line` is its index). */
export type DuePayment = { key: string; vendorId: string; line: number; who: string; label: string; amount: number; due: string; paid: boolean; paidOn: string };

/** Every payment for the wedding: each booked vendor's schedule, and each budget line that isn't a booked vendor's. */
export function allPayments(lines: BudgetLine[], vendors: Vendor[]): DuePayment[] {
  const booked = vendors.filter((v) => v.status === 'booked');
  const out: DuePayment[] = [];
  for (const v of booked) {
    const line = lineFor(v, lines);
    for (const p of scheduleOf(v, line)) out.push({ key: `${v.id}:${p.id}`, vendorId: v.id, line: line ? lines.indexOf(line) : -1, who: v.name, label: p.label, amount: p.amount, due: p.due, paid: p.paid, paidOn: p.paidOn });
  }
  lines.forEach((l, i) => {
    if (booked.some((v) => same(l.vendor, v.name))) return;
    // Only what's actually agreed: a quote, a payment made, or a due date. An estimate is a plan, not a bill.
    if (!l.quote && !l.paid && !l.due) return;
    const total = l.quote || l.estimate;
    const who = l.item || l.vendor || l.category;
    if (l.paid > 0) out.push({ key: `line${i}:paid`, vendorId: '', line: i, who, label: 'Paid so far', amount: Math.min(l.paid, total || l.paid), due: '', paid: true, paidOn: '' });
    if (total > l.paid) out.push({ key: `line${i}:rest`, vendorId: '', line: i, who, label: l.paid > 0 ? 'Balance' : 'Payment', amount: Math.round((total - l.paid) * 100) / 100, due: l.due, paid: false, paidOn: '' });
  });
  return out.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.who.localeCompare(b.who));
}

/** Something a vendor needs from you, for the checklist: a payment, a contract to sign, a quote running out. */
export type VendorAction = { key: string; kind: 'payment' | 'contract' | 'quote' | 'chase'; text: string; due: string; done: boolean; vendorId: string; payment?: DuePayment };

/**
 * The checklist's vendor items, worked out from the vendors and the budget (nothing to keep in step):
 * every payment (done once paid), each booked vendor's contract to sign, and quotes that run out while
 * the vendor isn't booked yet.
 */
export function vendorActions(lines: BudgetLine[], vendors: Vendor[]): VendorAction[] {
  const out: VendorAction[] = allPayments(lines, vendors)
    .filter((p) => p.amount > 0 && (p.due || !p.paid))
    .map((p) => ({ key: `pay:${p.key}`, kind: 'payment' as const, text: `Pay ${p.who}${p.label === 'Payment' ? '' : ` · ${p.label.toLowerCase()}`} (${aud0(p.amount)})`, due: p.due, done: p.paid, vendorId: p.vendorId, payment: p }));
  for (const v of vendors) {
    if (v.status === 'booked') out.push({ key: `contract:${v.id}`, kind: 'contract', text: `Sign ${v.name}’s contract`, due: '', done: !!v.contractSigned, vendorId: v.id });
    else if (v.status !== 'declined') for (const q of v.quotes.filter((x) => x.validUntil)) out.push({ key: `quote:${q.id}`, kind: 'quote', text: `Decide on ${v.name}’s quote (it runs out)`, due: q.validUntil, done: false, vendorId: v.id });
    // A quote you're waiting on: chase it when it's due (or a week after asking, or after the last chase).
    if (v.status === 'requested') out.push({ key: `chase:${v.id}:${v.chasedOn}`, kind: 'chase', text: `Chase ${v.name} for their quote`, due: chaseDue(v), done: false, vendorId: v.id });
  }
  return out;
}

const plusDays = (d: string, n: number) => (d ? new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10) : '');
/** When to chase a quote you've asked for: the day it was due; else a week after asking or after the last chase. */
export const chaseDue = (v: Pick<Vendor, 'askedOn' | 'quoteBy' | 'chasedOn'>) => {
  if (v.chasedOn) return plusDays(v.chasedOn, 5);
  return v.quoteBy || plusDays(v.askedOn, 7);
};
/** The quote tracker's columns, in order. */
export const QUOTE_STAGES = [
  ['ask', 'To ask'],
  ['pricing', 'Pricing'],
  ['in', 'Quote in'],
  ['booked', 'Booked'],
  ['out', 'Not going ahead'],
] as const;
export type QuoteStage = (typeof QUOTE_STAGES)[number][0];
/** Where a vendor's quote is at, how long it's taken, and whether it's time to chase. `today` is yyyy-mm-dd. */
export function quoteStatus(v: Vendor, today: string) {
  const stage: QuoteStage = v.status === 'booked' ? 'booked' : v.status === 'declined' ? 'out' : v.status === 'quoted' || v.quotes.length || v.quote > 0 ? 'in' : v.status === 'requested' ? 'pricing' : 'ask';
  const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  const waiting = stage === 'pricing' && v.askedOn ? Math.max(0, days(v.askedOn, today)) : null;
  const due = stage === 'pricing' ? chaseDue(v) : '';
  const best = v.quotes.length ? v.quotes.reduce((a, q) => (q.amount && (!a.amount || q.amount < a.amount) ? q : a), v.quotes[0]!) : null;
  const firstQuote = v.quotes.map((q) => q.date).filter(Boolean).sort()[0] ?? '';
  return {
    stage,
    /** Days since you asked (pricing only). */
    waiting,
    /** Time to chase: the quote was due, or it's been a week (pricing only). */
    chase: stage === 'pricing' && !!due && due <= today,
    chaseOn: due,
    /** The lowest quote in, and how many days it took to come (from asking). */
    amount: best?.amount || v.quote || 0,
    took: v.askedOn && firstQuote ? Math.max(0, days(v.askedOn, firstQuote)) : null,
    expires: v.status !== 'booked' ? (best?.validUntil ?? '') : '',
  };
}
const aud0 = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;

export const Vendors = z.object({ list: z.array(Vendor).max(200).default([]) });
export type Vendors = z.infer<typeof Vendors>;

/** What "Find vendors" can search for near the venue (OpenStreetMap tags). */
export const VENDOR_SEARCH: Record<string, { label: string; tags: string[] }> = {
  florist: { label: 'Florists', tags: ['shop=florist'] },
  photographer: { label: 'Photographers', tags: ['craft=photographer', 'shop=photo'] },
  caterer: { label: 'Caterers', tags: ['craft=caterer'] },
  cake: { label: 'Cakes and bakeries', tags: ['shop=pastry', 'shop=bakery', 'shop=confectionery'] },
  hair: { label: 'Hairdressers', tags: ['shop=hairdresser'] },
  makeup: { label: 'Makeup and beauty', tags: ['shop=beauty', 'shop=cosmetics'] },
  bridal: { label: 'Bridal wear', tags: ['shop=wedding'] },
  suits: { label: 'Suits and tailors', tags: ['shop=tailor', 'craft=tailor'] },
  jewellery: { label: 'Jewellers and rings', tags: ['shop=jewelry'] },
  accommodation: { label: 'Accommodation', tags: ['tourism=hotel', 'tourism=motel', 'tourism=guest_house', 'tourism=apartment'] },
  transport: { label: 'Cars, buses and taxis', tags: ['amenity=car_rental', 'amenity=taxi', 'office=taxi', 'amenity=bus_station'] },
  hire: { label: 'Party hire and styling', tags: ['shop=party', 'shop=interior_decoration'] },
  print: { label: 'Printing and stationery', tags: ['shop=stationery', 'shop=copyshop', 'craft=printer'] },
  music: { label: 'Music shops and DJs', tags: ['shop=musical_instrument', 'amenity=music_venue'] },
};

// ---------------------------------------------------------------- the planning checklist

/** One thing to do before the wedding: `before` is how many days before the day it's due. */
export const PlanTask = z.object({
  id: z.string().max(40),
  text: z.string().max(200),
  before: z.number().int().min(-60).max(800),
  done: z.boolean().default(false),
  note: s(600),
  /** A legal deadline (the Notice of Intended Marriage): shown in red when close. */
  legal: z.boolean().default(false),
  /** Whose job it is: one of you, both, or not decided yet (''). */
  owner: z.enum(['', 'p1', 'p2', 'both']).default(''),
  /** Or someone helping (a helper's id): they see it on their own task list. */
  helper: s(40),
  /** Where it's at: to do, under way, done ("done" above is kept in step). */
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  /** The day it was done (yyyy-mm-dd), for "done per week". */
  doneOn: s(10),
});
export type PlanTask = z.infer<typeof PlanTask>;
/** Someone helping with the plan (a parent, a bridesmaid, a friend): their own task list on a private link. */
export const Helper = z.object({ id: z.string().max(40), name: z.string().trim().min(1).max(80), mobile: s(20), key: z.string().max(40) });
export type Helper = z.infer<typeof Helper>;
export const PlanChecklist = z.object({ tasks: z.array(PlanTask).max(300).default([]), helpers: z.array(Helper).max(40).default([]) });
export type PlanChecklist = z.infer<typeof PlanChecklist>;

/** A task's status (older lists only had "done"). */
export const statusOf = (t: Pick<PlanTask, 'done' | 'status'>): PlanTask['status'] => (t.done ? 'done' : t.status === 'done' ? 'todo' : t.status);
/** Set a task's status, keeping "done" and the day it was done in step. */
export const withStatus = (t: PlanTask, status: PlanTask['status'], today: string): PlanTask => ({ ...t, status, done: status === 'done', doneOn: status === 'done' ? t.doneOn || today : '' });
/** Who a task is with, as one id: 'p1', 'p2', 'both', 'h:<helper id>', or '' (no one yet). */
export const assigneeOf = (t: Pick<PlanTask, 'owner' | 'helper'>) => (t.helper ? `h:${t.helper}` : t.owner);

const DAY_MS = 86_400_000;
/** A task's due date (yyyy-mm-dd), counted back from the wedding's date (yyyy-mm-dd). */
export const taskDue = (t: Pick<PlanTask, 'before'>, weddingDate: string) => new Date(Date.parse(`${weddingDate}T00:00:00Z`) - t.before * DAY_MS).toISOString().slice(0, 10);

/**
 * The task figures for the overview: by status, overdue and due soon, by person, done per week (the last
 * 12 weeks, Mondays), and the next open tasks. `weddingDate` and `today` are yyyy-mm-dd where the wedding is.
 */
export function taskTotals(list: PlanChecklist, weddingDate: string, today: string, names: { p1: string; p2: string }) {
  const due = (t: PlanTask) => (weddingDate ? taskDue(t, weddingDate) : '');
  const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
  const open = list.tasks.filter((t) => statusOf(t) !== 'done');
  const overdue = (t: PlanTask) => statusOf(t) !== 'done' && !!due(t) && due(t) < today;
  const people = new Map<string, { id: string; name: string; todo: number; doing: number; done: number; overdue: number }>();
  const nameOf = (id: string) => (id === 'p1' ? names.p1 : id === 'p2' ? names.p2 : id === 'both' ? 'Both of you' : id ? list.helpers.find((h) => `h:${h.id}` === id)?.name ?? 'Someone removed' : 'Not assigned');
  for (const t of list.tasks) {
    const id = assigneeOf(t);
    const row = people.get(id) ?? { id, name: nameOf(id), todo: 0, doing: 0, done: 0, overdue: 0 };
    row[statusOf(t)]++;
    if (overdue(t)) row.overdue++;
    people.set(id, row);
  }
  // Mondays, oldest first: the week each task was done in.
  const monday = (d: string) => {
    const t = new Date(`${d}T00:00:00Z`);
    return new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
  };
  const thisWeek = monday(today);
  const weeks = Array.from({ length: 12 }, (_, i) => new Date(Date.parse(`${thisWeek}T00:00:00Z`) - (11 - i) * 7 * DAY_MS).toISOString().slice(0, 10));
  const perWeek = new Map(weeks.map((w) => [w, 0]));
  for (const t of list.tasks) if (statusOf(t) === 'done' && t.doneOn && perWeek.has(monday(t.doneOn))) perWeek.set(monday(t.doneOn), perWeek.get(monday(t.doneOn))! + 1);
  return {
    total: list.tasks.length,
    byStatus: { todo: list.tasks.filter((t) => statusOf(t) === 'todo').length, doing: list.tasks.filter((t) => statusOf(t) === 'doing').length, done: list.tasks.filter((t) => statusOf(t) === 'done').length },
    overdue: open.filter(overdue).length,
    due7: open.filter((t) => due(t) && due(t) >= today && due(t) <= plus(7)).length,
    due30: open.filter((t) => due(t) && due(t) >= today && due(t) <= plus(30)).length,
    byPerson: [...people.values()].sort((a, b) => (a.id === '' ? 1 : b.id === '' ? -1 : b.todo + b.doing - (a.todo + a.doing))),
    donePerWeek: weeks.map((week) => ({ week, n: perWeek.get(week) ?? 0 })),
    next: open
      .slice()
      .sort((a, b) => b.before - a.before)
      .slice(0, 8)
      .map((t) => ({ id: t.id, text: t.text, due: due(t), who: nameOf(assigneeOf(t)), status: statusOf(t) as 'todo' | 'doing' })),
  };
}
export type TaskTotals = ReturnType<typeof taskTotals>;

/** The usual Australian wedding plan, by days before the day (everything editable). */
export const PLAN_TEMPLATE: Omit<PlanTask, 'id' | 'done' | 'note' | 'owner' | 'helper' | 'status' | 'doneOn'>[] = [
  { text: 'Set the budget and guest numbers together', before: 450, legal: false },
  { text: 'Book the venue and lock in the date', before: 420, legal: false },
  { text: 'Book the celebrant', before: 400, legal: false },
  { text: 'Book the photographer and videographer', before: 365, legal: false },
  { text: 'Book the caterer (if the venue doesn’t cater)', before: 330, legal: false },
  { text: 'Send save-the-dates', before: 300, legal: false },
  { text: 'Book the band or DJ and the florist', before: 300, legal: false },
  { text: 'Choose the wedding party and tell them', before: 270, legal: false },
  { text: 'Find the dress and book fittings', before: 270, legal: false },
  { text: 'Book hair and makeup (with a trial)', before: 240, legal: false },
  { text: 'Book accommodation blocks for guests', before: 240, legal: false },
  { text: 'Book cars or a shuttle bus', before: 210, legal: false },
  { text: 'Order the cake', before: 180, legal: false },
  { text: 'Lodge the Notice of Intended Marriage (NOI) with your celebrant', before: 180, legal: true },
  { text: 'Send invitations', before: 120, legal: false },
  { text: 'Buy the rings', before: 120, legal: false },
  { text: 'Suits: choose and order', before: 120, legal: false },
  { text: 'Plan the ceremony with the celebrant (readings, vows)', before: 90, legal: false },
  { text: 'Book the honeymoon', before: 90, legal: false },
  { text: 'Last day to lodge the NOI: one month before (it can’t be later)', before: 31, legal: true },
  { text: 'RSVPs due: chase anyone who hasn’t replied', before: 56, legal: false },
  { text: 'Final numbers and dietary needs to the caterer', before: 21, legal: false },
  { text: 'Seating plan done', before: 14, legal: false },
  { text: 'Final payments to vendors', before: 14, legal: false },
  { text: 'Run sheet to the venue, MC and wedding party', before: 10, legal: false },
  { text: 'Vendor envelopes (final payments, tips) ready', before: 3, legal: false },
  { text: 'Sign the Declaration of No Legal Impediment with the celebrant', before: 3, legal: true },
  { text: 'Rehearsal', before: 1, legal: false },
  { text: 'Send thank-you notes', before: -42, legal: false },
  { text: 'Order the official marriage certificate (Births, Deaths and Marriages)', before: -30, legal: true },
  { text: 'Change of name (if you are): passport, Medicare, bank, licence, ATO', before: -45, legal: false },
];

// ---------------------------------------------------------------- gifts and thank-yous

export const Gift = z.object({
  id: z.string().max(40),
  from: z.string().max(160), // who gave it (as you'd write it on the card)
  invitationId: s(40), // the guest it came from, when picked from the list
  gift: s(300), // what it was ("Wishing well", "Dinner set")
  amount: money, // for cash or wishing-well gifts
  received: s(10), // yyyy-mm-dd
  thanked: z.boolean().default(false),
  note: s(1500), // the thank-you note, or a draft of it
});
export type Gift = z.infer<typeof Gift>;
export const Gifts = z.object({ list: z.array(Gift).max(500).default([]) });
export type Gifts = z.infer<typeof Gifts>;

// ---------------------------------------------------------------- shuttles

/** A shuttle run for one event: guests book seats on it from their invitation. */
export const Shuttle = z.object({
  id: z.string().max(40),
  time: z.string().max(20), // "2:15pm"
  from: z.string().max(160),
  to: z.string().max(160),
  seats: z.number().int().min(1).max(500),
  note: s(400),
});
export type Shuttle = z.infer<typeof Shuttle>;
export const Shuttles = z.object({ list: z.array(Shuttle).max(20).default([]) });
export type Shuttles = z.infer<typeof Shuttles>;

/** Seating rules per event: pairs of people (person ids) to keep apart or together. */
export const SeatRules = z.object({ pairs: z.array(z.object({ a: z.string().max(40), b: z.string().max(40), kind: z.enum(['apart', 'together']) })).max(200).default([]) });
export type SeatRules = z.infer<typeof SeatRules>;


// ---------------------------------------------------------------- signage

export const SIGN_FONTS = ['pinyon', 'vibes', 'parisienne', 'playfair', 'cormorant', 'cormorant-italic', 'sans'] as const;
export const SIGN_SIZES = ['A6', 'A5', 'A4', 'A3', 'A2', 'A1'] as const;
export const SIGN_BORDERS = ['none', 'line', 'double', 'corners', 'arch', 'dots'] as const;
const hex = z.string().regex(/^#[0-9a-f]{6}$/i).or(z.literal(''));
/** One piece of a sign, top to bottom: a small heading, a big script line, text, a rule, a list, a QR code, a gap. */
export const SignBlock = z.object({
  id: z.string().max(40),
  kind: z.enum(['small', 'heading', 'text', 'rule', 'list', 'qr', 'space']),
  /** The words ({name1}, {name2}, {couple}, {date}, {venue}, {table}, {website} are filled in); a list is one item per line; a QR code is a link. */
  text: s(1200),
  /** Bigger or smaller than usual (1 is usual). */
  size: z.number().min(0.3).max(4).default(1),
  /** '' is the sign's own font for this kind of block. */
  font: z.union([z.literal(''), z.enum(SIGN_FONTS)]).default(''),
  /** '' is the sign's ink colour; 'accent' its accent. */
  colour: z.enum(['', 'accent', 'soft']).default(''),
  italic: z.boolean().default(false),
});
export type SignBlock = z.infer<typeof SignBlock>;
/** A sign's look: paper size and way round, colours, fonts, border, alignment. */
export const SignLook = z.object({
  size: z.enum(SIGN_SIZES).default('A3'),
  landscape: z.boolean().default(false),
  /** Empty colours follow the invitation's theme. */
  paper: hex.default(''),
  ink: hex.default(''),
  accent: hex.default(''),
  heading: z.enum(SIGN_FONTS).default('pinyon'),
  body: z.enum(SIGN_FONTS).default('cormorant'),
  border: z.enum(SIGN_BORDERS).default('line'),
  align: z.enum(['center', 'left']).default('center'),
  /** Where the words sit: middle, or from the top. */
  valign: z.enum(['middle', 'top']).default('middle'),
});
export type SignLook = z.infer<typeof SignLook>;
export const SignDesign = z.object({ look: SignLook.default({}), blocks: z.array(SignBlock).max(40).default([]) });
export type SignDesign = z.infer<typeof SignDesign>;
/** A copy saved to the couple's linked storage (or kept here): the planning file it is. */
export const SavedSign = z.object({ id: z.string().max(60), sign: z.string().max(40), name: z.string().max(160), at: z.string().max(40), where: s(20) });
/** Wedding planner → Print → signs: each sign's design (by template), your own signs, and the copies saved. */
export const Signage = z.object({
  designs: z.record(z.string().max(40), SignDesign).default({}),
  /** Your own signs (beyond the templates): their names; designs are kept under their ids. */
  own: z.array(z.object({ id: z.string().max(40), name: z.string().max(80) })).max(30).default([]),
  saved: z.array(SavedSign).max(100).default([]),
});
export type Signage = z.infer<typeof Signage>;

/** The planner documents and their shapes (the API validates every save against these). */
// ---------------------------------------------------------------- speeches, who holds what, the photo list

/** A speech: who gives it, how long, how ready it is, whether they need the microphone. In speaking order. */
export const Speech = z.object({
  id: z.string().max(40),
  who: z.string().max(80),
  minutes: z.number().int().min(1).max(20).default(4),
  status: z.enum(['not started', 'drafting', 'ready']).default('not started'),
  mic: z.boolean().default(true),
  notes: s(400),
});
export type Speech = z.infer<typeof Speech>;
/** Something precious on the day and who has it (the rings, the envelopes, the paperwork). */
export const Hold = z.object({ id: z.string().max(40), what: z.string().max(120), who: s(80) });
export type Hold = z.infer<typeof Hold>;
export const DayRoles = z.object({ speeches: z.array(Speech).max(20).default([]), holds: z.array(Hold).max(40).default([]) });
export type DayRoles = z.infer<typeof DayRoles>;
export const HOLD_TEMPLATE: Omit<Hold, 'id'>[] = [
  { what: 'The rings', who: 'Best man' },
  { what: 'Vendor envelopes (final payments and tips)', who: 'Best man' },
  { what: 'ID and the marriage paperwork for the celebrant', who: '' },
  { what: 'Emergency kit', who: 'Maid of honour' },
  { what: 'The bride’s phone and lipstick', who: 'Maid of honour' },
  { what: 'Speech notes', who: 'Each speaker' },
  { what: 'Guest book and pens', who: 'Usher' },
  { what: 'Run sheet and vendors’ phone numbers', who: 'MC' },
];

/** One photo on the photographer's list: the shot and who to gather for it. */
export const Shot = z.object({ id: z.string().max(40), shot: z.string().max(160), who: s(300), done: z.boolean().default(false) });
export type Shot = z.infer<typeof Shot>;
export const ShotList = z.object({ shots: z.array(Shot).max(120).default([]) });
export type ShotList = z.infer<typeof ShotList>;

/**
 * The usual photo list, made from your names and your wedding party: the moments, then the groups
 * (smallest to largest, so people can leave as they're done).
 */
export function shotTemplate(o: { p1: string; p2: string; side1: string; side2: string; party1: string[]; party2: string[] }): Omit<Shot, 'id'>[] {
  const both = `${o.p1} & ${o.p2}`;
  const shot = (s: string, who = ''): Omit<Shot, 'id'> => ({ shot: s, who, done: false });
  return [
    shot('Details: rings, invitation, shoes, perfume, flowers'),
    shot(`${o.p1} getting ready`),
    shot(`${o.p2} getting ready`),
    shot('First look (if you’re having one)', both),
    shot('Walking down the aisle'),
    shot('Exchanging rings'),
    shot('First kiss'),
    shot('Signing the register', `${both}, two witnesses`),
    shot('Confetti or bubbles exit', 'Everyone'),
    shot(`${both} together`, both),
    shot(`With ${o.p1}’s parents`, `${both}, ${o.p1}’s parents`),
    shot(`With ${o.p1}’s immediate family`, `${both}, ${o.p1}’s parents, brothers and sisters`),
    shot(`With ${o.p2}’s parents`, `${both}, ${o.p2}’s parents`),
    shot(`With ${o.p2}’s immediate family`, `${both}, ${o.p2}’s parents, brothers and sisters`),
    shot('With grandparents', `${both}, all grandparents`),
    shot('Both families together', 'Both families'),
    shot(`With ${o.side1.toLowerCase()}’s side`, [o.p1, ...o.party1].join(', ')),
    shot(`With ${o.side2.toLowerCase()}’s side`, [o.p2, ...o.party2].join(', ')),
    shot('The whole wedding party', 'Both sides'),
    shot('Everyone (the big group photo)', 'All guests'),
    shot('Cutting the cake'),
    shot('First dance'),
    shot('Sunset portraits', both),
  ];
}


// ---------------------------------------------------------------- the coordinator's log

/** Something the day-of coordinator noted (a late supplier, a missing chair), ticked off when sorted. */
export const LogEntry = z.object({ id: z.string().max(40), at: z.string().max(40), text: z.string().max(300), done: z.boolean().default(false) });
export const CoordLog = z.object({ entries: z.array(LogEntry).max(200).default([]) });
export type CoordLog = z.infer<typeof CoordLog>;

// ---------------------------------------------------------------- the ideas board

/** A pinned idea: a photo (kept with the planning files) or just a note, under a category. */
export const Pin = z.object({ id: z.string().max(40), fileId: s(40), cat: z.string().max(40).default('Styling'), note: s(300), love: z.boolean().default(false) });
export type Pin = z.infer<typeof Pin>;
export const Ideas = z.object({
  pins: z.array(Pin).max(150).default([]),
  /** The wedding's colours, for vendors (florist, stylist, cake). */
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(8).default([]),
});
export type Ideas = z.infer<typeof Ideas>;
export const IDEA_CATEGORIES = ['Flowers', 'Attire', 'Hair and makeup', 'Styling', 'Cake', 'Stationery', 'Venue', 'Other'];

// ---------------------------------------------------------------- menus

/** A menu, course by course. */
export const Menu = z.object({
  id: s(40),
  name: s(80),
  /** Who it's for, as the guests write it ("vegan, dairy free"): guests are matched to it by these words. */
  suits: s(200),
  entree: s(200),
  main: s(200),
  dessert: s(200),
});
export type Menu = z.infer<typeof Menu>;
/** An event's menus: the set menu everyone has, the special ones, and the caterer's menus as files. */
export const Menus = z.object({
  set: Menu.default({}),
  special: z.array(Menu).max(20).default([]),
  files: z.array(z.object({ id: z.string().max(40), name: z.string().max(160) })).max(12).default([]),
});
export type Menus = z.infer<typeof Menus>;

/** The special menu that suits what a guest told you (the first whose words appear in it), if any. */
export function suggestMenu(diet: string, special: Menu[]): Menu | undefined {
  const d = diet.toLowerCase();
  if (!d.trim()) return undefined;
  return special.find((m) =>
    m.suits
      .toLowerCase()
      .split(/[,;/]|\band\b/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2)
      .some((w) => d.includes(w) || d.includes(w.replace(/-/g, ' ')) || d.replace(/-/g, ' ').includes(w)),
  );
}

export const PLANNER_DOCS = {
  'party-runsheet': PartyRunsheet,
  'day-checklist': DayChecklist,
  budget: Budget,
  vendors: Vendors,
  'party-setup': PartySetup,
  checklist: PlanChecklist,
  gifts: Gifts,
  shuttles: Shuttles,
  'seat-rules': SeatRules,
  'party-p1': PartySide,
  'party-p2': PartySide,
  'party-help': PartySide, // helpers (MC, ushers): their own to-dos and packing
  'event-checklist': EventChecklist,
  menus: Menus,
  'day-roles': DayRoles,
  shots: ShotList,
  ideas: Ideas,
  'coord-log': CoordLog,
  signage: Signage,
} as const;
export type PlannerKind = keyof typeof PLANNER_DOCS;

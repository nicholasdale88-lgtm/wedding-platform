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
export const PartySide = z.object({
  tasks: z.array(SideTask).max(80).default([]),
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
});
export type PartySetup = z.infer<typeof PartySetup>;

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
});
export type BudgetLine = z.infer<typeof BudgetLine>;
export const Budget = z.object({ total: money, lines: z.array(BudgetLine).max(300).default([]) });
export type Budget = z.infer<typeof Budget>;

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

export const VENDOR_STATUS = ['idea', 'contacted', 'quoted', 'booked'] as const;

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
});
export type Vendor = z.infer<typeof Vendor>;

/** A booked vendor's commitment: the accepted quote (or the quote entered by hand). */
export function commitmentOf(v: Vendor): { amount: number; deposit: number } {
  const q = v.quotes.find((x) => x.id === v.accepted);
  return { amount: q?.amount ?? v.quote, deposit: q?.deposit ?? v.deposit };
}
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
});
export type PlanTask = z.infer<typeof PlanTask>;
export const PlanChecklist = z.object({ tasks: z.array(PlanTask).max(300).default([]) });
export type PlanChecklist = z.infer<typeof PlanChecklist>;

/** The usual Australian wedding plan, by days before the day (everything editable). */
export const PLAN_TEMPLATE: Omit<PlanTask, 'id' | 'done' | 'note' | 'owner'>[] = [
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

/** Arrivals on the day, per event: invitation ids and how many of each party are here. */
export const CheckIn = z.object({ arrived: z.record(z.string().max(40), z.number().int().min(0).max(60)).default({}) });
export type CheckIn = z.infer<typeof CheckIn>;

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
  checkin: CheckIn,
  'party-p1': PartySide,
  'party-p2': PartySide,
  'party-help': PartySide, // helpers (MC, ushers): their own to-dos and packing
  'event-checklist': EventChecklist,
  menus: Menus,
  'day-roles': DayRoles,
  shots: ShotList,
} as const;
export type PlannerKind = keyof typeof PLANNER_DOCS;

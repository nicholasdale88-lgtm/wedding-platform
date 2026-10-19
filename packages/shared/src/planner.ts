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

export const CheckItem = z.object({ text: z.string().max(200), time: s(20), done: z.boolean().default(false) });
export type CheckItem = z.infer<typeof CheckItem>;
export const DayChecklist = z.object({ p1: z.array(CheckItem).max(80).default([]), p2: z.array(CheckItem).max(80).default([]) });
export type DayChecklist = z.infer<typeof DayChecklist>;

/** What the two sides are called (the couple can change them, e.g. "Bride" and "Bride"). */
export const PartySetup = z.object({ p1: z.string().max(30).default('Bride'), p2: z.string().max(30).default('Groom') });
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

export const CHECK_TEMPLATE: DayChecklist = {
  p1: [
    { text: 'Breakfast and water', time: '8:00am', done: false },
    { text: 'Dress, shoes, jewellery and veil laid out', time: '', done: false },
    { text: 'Something old, new, borrowed, blue', time: '', done: false },
    { text: 'Vows or reading cards', time: '', done: false },
    { text: 'Emergency kit: safety pins, tissues, blotting paper, painkillers', time: '', done: false },
    { text: 'Phone charged and handed to the maid of honour', time: '', done: false },
  ],
  p2: [
    { text: 'Breakfast and water', time: '8:00am', done: false },
    { text: 'Suit pressed, shoes polished, buttonhole', time: '', done: false },
    { text: 'Rings to the best man', time: '', done: false },
    { text: 'Vendor envelopes (final payments and tips) to the best man', time: '', done: false },
    { text: 'Speech notes', time: '', done: false },
    { text: 'Marriage paperwork for the celebrant (ID, signed documents)', time: '', done: false },
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
});
export type PlanTask = z.infer<typeof PlanTask>;
export const PlanChecklist = z.object({ tasks: z.array(PlanTask).max(300).default([]) });
export type PlanChecklist = z.infer<typeof PlanChecklist>;

/** The usual Australian wedding plan, by days before the day (everything editable). */
export const PLAN_TEMPLATE: Omit<PlanTask, 'id' | 'done' | 'note'>[] = [
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
export const PLANNER_DOCS = { 'party-runsheet': PartyRunsheet, 'day-checklist': DayChecklist, budget: Budget, vendors: Vendors, 'party-setup': PartySetup, checklist: PlanChecklist, gifts: Gifts, shuttles: Shuttles, 'seat-rules': SeatRules, checkin: CheckIn } as const;
export type PlannerKind = keyof typeof PLANNER_DOCS;

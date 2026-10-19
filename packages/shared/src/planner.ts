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
export const PartyRunsheet = z.object({ items: z.array(PartyItem).max(100).default([]), note: s(1500) });
export type PartyRunsheet = z.infer<typeof PartyRunsheet>;

export const CheckItem = z.object({ text: z.string().max(200), time: s(20), done: z.boolean().default(false) });
export type CheckItem = z.infer<typeof CheckItem>;
export const DayChecklist = z.object({ p1: z.array(CheckItem).max(80).default([]), p2: z.array(CheckItem).max(80).default([]) });
export type DayChecklist = z.infer<typeof DayChecklist>;

/** What a party member sees: items for everyone in the party, their side, or their own role. */
export function itemsFor(items: PartyItem[], role: string): PartyItem[] {
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

/** The planner documents and their shapes (the API validates every save against these). */
export const PLANNER_DOCS = { 'party-runsheet': PartyRunsheet, 'day-checklist': DayChecklist } as const;
export type PlannerKind = keyof typeof PLANNER_DOCS;

import type { EventInfo, Guest, GuestDetail, Overview } from '../src/lib/api';

/** A made-up couple, so the tests prove nothing about the seed couple is hard-coded. */
export const events: EventInfo[] = [
  { id: 'e1', key: 'wedding', name: 'The wedding', pendingLabel: 'the wedding', startsAt: '2027-03-06T05:00:00.000Z', sort: 0, hasSeating: true, catered: true, questions: [] },
  {
    id: 'e2', key: 'brunch', name: 'Recovery brunch', pendingLabel: 'the brunch', startsAt: '2027-03-07T00:00:00.000Z', sort: 1, hasSeating: false, catered: true,
    questions: [{ key: 'swim', label: 'Will you swim?', type: 'choice', options: ['Yes, I will swim', 'Not sure yet', 'No thanks'] }],
  },
];

const person = (id: string, idx: number, name: string, diet = '', table: string | null = null) => ({ id, idx, name, diet, table, meal: { entree: '', main: '', dessert: '' } });
const reply = (attending: boolean | null, extra: Partial<Guest['rsvp'][string]> = {}) => ({
  attending, count: 1, answers: {}, message: '', via: 'invitation', updatedAt: '2026-10-10T01:00:00.000Z', ...extra,
});

export const guests: Guest[] = [
  {
    id: 'g1', phone: '+61412000001', phoneDisplay: '0412 000 001', seatsHeld: 2, optOut: false, version: 3, createdAt: '', openedAt: null,
    people: [person('p1', 0, 'Robin Hart', '', '2'), person('p2', 1, 'Sam Hart', 'Sam is coeliac', '2')],
    invited: ['wedding', 'brunch'],
    rsvp: { wedding: reply(true, { count: 2, message: 'Cannot wait!' }), brunch: reply(true, { count: 2, answers: { swim: 'Yes, I will swim' } }) },
    repliedAt: '2026-10-10T01:00:00.000Z', lastSms: { name: 'Invitation', at: '2026-10-02T07:00:00.000Z', status: 'delivered' },
  },
  {
    id: 'g2', phone: null, phoneDisplay: '', seatsHeld: 1, optOut: false, version: 1, createdAt: '', openedAt: null,
    people: [person('p3', 0, 'Jo Banks')], invited: ['wedding'], rsvp: {}, repliedAt: null, lastSms: null,
  },
  {
    id: 'g3', phone: '+61412000003', phoneDisplay: '0412 000 003', seatsHeld: 1, optOut: false, version: 1, createdAt: '', openedAt: null,
    people: [person('p4', 0, 'Casey Lund')], invited: ['wedding', 'brunch'], rsvp: { wedding: reply(false), brunch: reply(false) },
    repliedAt: '2026-10-11T01:00:00.000Z', lastSms: { name: 'Invitation', at: '2026-10-02T07:00:00.000Z', status: 'sent' },
  },
];

export const overviewFixture: Overview = {
  wedding: { id: 'w1', slug: 'alex-and-blair', name1: 'Alex Smith', name2: 'Blair Jones', timezone: 'Australia/Sydney', adminName: '' },
  total: 3, replied: 2, awaiting: 1, yesInv: 1, noInv: 1, seatsHeld: 4,
  events: [
    { key: 'wedding', name: 'The wedding', startsAt: events[0]!.startsAt, coming: 2 },
    { key: 'brunch', name: 'Recovery brunch', startsAt: events[1]!.startsAt, coming: 2 },
  ],
  diet: { people: 1, serious: 1, mealsSet: 0 },
  daysToGo: 138,
  needsYou: [
    { kind: 'awaiting', title: '1 invitation still to reply', detail: 'Reminders go out by themselves on 1 Dec.', cta: 'See who', link: 'guests?filter=awaiting' },
    { kind: 'no-mobile', title: '1 invitation has no mobile', detail: 'They will not get texts. Add a number or send their link another way.', cta: 'Fix', link: 'guests?mob=none' },
  ],
  nextUp: [{ campaignId: 'c1', name: 'RSVP reminder', sendAt: '2026-11-30T23:00:00.000Z' }],
  latest: [{ id: 'g3', name: 'Casey Lund', at: '2026-10-11T01:00:00.000Z', summary: 'Wedding: Declined · Recovery brunch: Declined', message: '' }],
  nav: { guests: 3, dietary: 1, autopilot: 6, smsLive: false },
};

export const detailOf = (g: Guest): GuestDetail => ({
  guest: g, link: `https://example.com/w/alex-and-blair/?g=${'t'.repeat(22)}`, sms: g.lastSms ? [g.lastSms] : [], events,
  campaigns: [{ id: 'c1', name: 'RSVP reminder' }, { id: 'c2', name: 'Invitation' }],
});

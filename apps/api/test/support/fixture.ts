import { zonedToUtc } from '@wp/shared';
import type { Audience, Campaign, Recipient, WeddingCtx } from '../../src/sms/types';
import { TZ } from './fakes';
import type { MemoryStore } from './memoryStore';

export const W = 'w1';
export const SENDER = '+61400000001';
export const ADMIN = '+61411039612';

export const phoneOf = (i: number) => `+614${String(10000000 + i).padStart(8, '0')}`;

const campaign = (key: string, mode: Campaign['mode'], audience: Audience, body: string, extra: Partial<Campaign> = {}): Campaign => ({
  id: `c-${key}`, weddingId: W, key, name: key, body, mode, enabled: true, trigger: null, audience, excluded: [], ...extra,
});

/** The schedule from docs/05, using the seed's wording. */
export const CAMPAIGNS: Campaign[] = [
  campaign('invite', 'auto', { all: true }, 'Hi {first}, Sophie and Nicholas would love you to celebrate with them at Glenworth Valley in November 2027. Your invitation and RSVP: {link}', { trigger: 'invitation_created' }),
  campaign('thanks', 'auto', { all: true }, "Thanks {first}, we have your RSVP. We can't wait to celebrate with you. Change your reply any time: {link}", { trigger: 'rsvp_changed' }),
  campaign('reminder', 'dates', { invitedBefore: true, awaitingAny: true }, 'Hi {first}, a gentle reminder to RSVP for {pending} by 18 August 2027. It only takes a minute: {link}'),
  campaign('ride', 'dates', { attending: '30th', answer: { event: '30th', key: 'ride', notIn: ['No, not riding'] } }, 'Hi {first}, riding on Sat 20 Nov? Please book the 10:00am session by 20 August.'),
  campaign('nightW', 'dates', { attending: 'wedding' }, 'Hi {first}, see you tomorrow! Your table, menu and parking: {guide} Love, S & N'),
  campaign('rain', 'manual', { attending: 'wedding' }, 'Hi {first}, rain is forecast so the ceremony moves to the balcony. Same time, 2:00pm.', { enabled: false }),
  campaign('nightB', 'dates', { attending: '30th' }, 'Hi {first}, tomorrow is the 30th! Riders be there by 9:30am. Your plan: {guide_30th}'),
  campaign('photos', 'dates', { attending: 'wedding' }, 'Thank you for celebrating with us, {first}! Please add your photos: {photos}'),
];

const SLOTS: Record<string, string[]> = {
  reminder: ['2027-06-18T10:00', '2027-07-18T10:00', '2027-08-11T10:00'],
  ride: ['2027-06-20T10:00', '2027-08-01T10:00'],
  nightW: ['2027-11-17T17:00'],
  nightB: ['2027-11-19T17:00'],
  photos: ['2027-11-19T11:00'],
};

export interface FixtureOptions {
  invitations?: number;
  /** Invitation indexes with no mobile. */
  noPhone?: number[];
  /** i => event keys; default: every 3rd is wedding-only, every 5th 30th-only, rest both. */
  invited?: (i: number) => string[];
  walletCredits?: number | null;
  wedding?: Partial<WeddingCtx>;
}

export function seedWedding(store: MemoryStore, o: FixtureOptions = {}) {
  const n = o.invitations ?? 75;
  store.weddingList.push({
    id: W, slug: 'sophie-and-nicholas', name1: 'Sophie Bloor', name2: 'Nicholas Dale', timezone: TZ,
    quietStart: 8, quietEnd: 20, paused: false, sender: SENDER, adminMobile: ADMIN, dailyCap: 500, rateX100: 176,
    walletCredits: o.walletCredits === undefined ? null : o.walletCredits, optOutFooter: '', baseUrl: 'https://example.com',
    ...o.wedding,
  });
  store.events.set(W, [
    { id: 'e1', key: 'wedding', name: 'The wedding', pendingLabel: 'the wedding', sort: 0 },
    { id: 'e2', key: '30th', name: "Nicholas's 30th", pendingLabel: "Nicholas's 30th", sort: 1 },
  ]);
  const invited = o.invited ?? ((i: number) => (i % 3 === 0 ? ['wedding'] : i % 5 === 0 ? ['30th'] : ['wedding', '30th']));
  for (let i = 0; i < n; i++) {
    const r: Recipient = {
      id: `i${i}`, token: `tok${String(i).padStart(19, '0')}`, phone: o.noPhone?.includes(i) ? null : phoneOf(i), optOut: false,
      people: i % 4 === 0 ? [`Guest${i} Smith`, `Partner${i} Smith`] : [`Guest${i} Jones`], seatsHeld: i % 4 === 0 ? 2 : 1,
      invited: invited(i), rsvp: {}, rsvpUpdatedAt: null, tableName: null,
    };
    store.invitations.push({ weddingId: W, r, deleted: false });
  }
  store.campaignList.push(...structuredClone(CAMPAIGNS));
  let s = 0;
  for (const [key, dates] of Object.entries(SLOTS))
    for (const at of dates)
      store.slots.push({ id: `s${++s}`, campaignId: `c-${key}`, sendAt: zonedToUtc(at, TZ).toISOString(), status: 'pending', attempts: 0, lastError: null });
}

/** A guest answering on the website. */
export function reply(store: MemoryStore, id: string, at: Date, answers: Record<string, boolean>, extra: Record<string, Record<string, string>> = {}) {
  const r = store.recipient(id);
  for (const [k, attending] of Object.entries(answers)) r.rsvp[k] = { attending, count: 1, answers: extra[k] ?? {} };
  r.rsvpUpdatedAt = at.toISOString();
}

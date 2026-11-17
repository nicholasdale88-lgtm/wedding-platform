import type { LinkedVendor, MyListing, VendorChatMessage, VendorCouple, VendorCoupleDetails } from '../lib/api';

/**
 * The sample vendor account (/vendors/me?sample=1), for the company portal's Preview and for showing vendors:
 * a made-up florist with couples, enquiries, a partner code and conversations. Everything works (messages are
 * sent, read, filtered) but nothing is saved or emailed. The sample couple's app (/admin/demo) talks to the same
 * florist, so a message written on one side shows on the other in the same tab.
 */
export const isVendorDemo = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/vendors/me') && new URLSearchParams(window.location.search).get('sample') === '1';

const DAY = 86_400_000;
const at = (days: number, hour = 14) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const SAMPLE_WID = 'demo';
const LISTING_ID = 'sample-florist';

const couples: VendorCouple[] = [
  { id: SAMPLE_WID, couple: 'Harriet & Theo', date: at(124, 15), venue: 'Larkwood Estate', coming: 86, invited: 112, status: 'booked', via: 'Signed up through your link', since: at(-40), unread: 0, last: null, details: '/demo' },
  { id: 'c2', couple: 'Priya & Sam', date: at(38, 16), venue: 'The Boathouse', coming: 64, invited: 70, status: 'booked', via: 'Added you to their planner', since: at(-90), unread: 0, last: null, details: '' },
  { id: 'c3', couple: 'Mia & Jordan', date: at(212, 11), venue: 'St Peter’s Chapel', coming: 0, invited: 140, status: 'considering', via: 'Invited you from their planner', since: at(-6), unread: 0, last: null, details: '', quotes: [{ id: 'q1', title: 'Flowers', lines: 7, due: at(14).slice(0, 10), sent: at(-2).slice(0, 10), answered: false, declined: false, link: '/demo' }] },
  { id: 'c4', couple: 'Lucy & Ben', date: at(71, 17), venue: 'Hilltop Winery', coming: 52, invited: 98, status: 'considering', via: 'Added you to their planner', since: at(-21), unread: 0, last: null, details: '', quotes: [{ id: 'q2', title: 'Ceremony and reception flowers', lines: 5, due: at(5).slice(0, 10), sent: at(-9).slice(0, 10), answered: true, declined: false, link: '/demo' }] },
  { id: 'c5', couple: 'Ella & Kai', date: at(-12, 15), venue: 'Seaside Pavilion', coming: 120, invited: 126, status: 'booked', via: 'Signed up through your link', since: at(-200), unread: 0, last: null, details: '' },
];
let n = 0;
// In order: each sample message a little after the one before; one written now says now.
const msg = (fromVendor: boolean, body: string, days: number, read = true): VendorChatMessage => {
  const id = `m${++n}`;
  const when = days === 0 ? new Date().toISOString() : new Date(Date.parse(at(days, 9)) + n * 37 * 60_000).toISOString();
  return { id, fromVendor, body, at: when, read };
};
const threads: Record<string, VendorChatMessage[]> = {
  [SAMPLE_WID]: [
    msg(true, 'Congratulations, you two! So happy to be doing your flowers. Shall we lock in a time to talk colours?', -30),
    msg(false, 'Yes please! We love the blush and sage board. Could we see peonies in the bouquet?', -29),
    msg(true, 'Peonies are in season for you. I’ll send a mock-up with garden roses and eucalyptus.', -28),
    msg(false, 'Our numbers are nearly in: about 86 coming. Do we need more centrepieces?', -1, false),
  ],
  c2: [msg(true, 'Final numbers look great: 64 coming. I’ll do 8 centrepieces and the arbour.', -3), msg(false, 'Perfect, thank you!', -3)],
  c3: [msg(false, 'Hi! Our celebrant recommended you. Are you free on our date?', -2, false), msg(false, 'We’re thinking soft whites and greenery.', -2, false)],
  c4: [msg(true, 'Lovely to meet you at the expo. Here’s my code for 10% off The Yes List: WILDFLOWER10', -20)],
  c5: [msg(true, 'What a day! Thank you for having me. Enjoy the honeymoon.', -10), msg(false, 'The flowers were perfect. Thank you!', -9)],
};

const listing: MyListing = {
  partner: { code: 'WILDFLOWER10', percentOff: 10, uses: 7 },
  listing: {
    slug: 'wildflower-studio-sample',
    name: 'Wildflower Studio',
    category: 'florist',
    region: 'sydney',
    regions: ['blue-mountains', 'hunter-valley'],
    about: 'Garden-style wedding flowers, grown locally and arranged by hand. Bouquets, arbours and long-table centrepieces.',
    priceFrom: 1800,
    photo: '',
    booked: 3,
    contactName: 'Jess Lee',
    phone: '0400 000 000',
    website: '',
    instagram: 'wildflowerstudio',
    photos: [],
    packages: [
      { name: 'Ceremony', price: 1200, unit: 'total', includes: ['Bridal bouquet and two bridesmaids’ posies', 'Buttonholes for the groom’s party', 'Aisle flowers'], popular: false },
      {
        name: 'Ceremony and reception',
        price: 2400,
        unit: 'total',
        includes: ['Everything in Ceremony', 'Long-table centrepieces', 'Cake flowers', 'Set-up and pack-down on the day'],
        popular: true,
      },
      { name: 'The works', price: 3800, unit: 'total', includes: ['Everything in Ceremony and reception', 'A garden arbour for the ceremony', 'Hanging greenery over the head table', 'A planning meeting at your venue'], popular: false },
    ],
    email: 'hello@example.com',
    hidden: false,
  },
  enquiries: [
    { id: 'e1', name: 'Grace Wu', email: 'grace@example.com', phone: '', date: at(300).slice(0, 10), guests: 90, message: 'Hi! Do you travel to the Blue Mountains? We’d love a meadow-style arbour.', read: false, at: at(-1), stage: 'new', note: '' },
    { id: 'e2', name: 'Tom Reid', email: 'tom@example.com', phone: '', date: at(180).slice(0, 10), guests: 60, message: 'Looking for bouquets and buttonholes only. What would that start at?', read: true, at: at(-8), stage: 'quoted', note: 'Sent the bouquet package, $950. Follow up next week.' },
    { id: 'e3', name: 'Ava Brooks', email: 'ava@example.com', phone: '0400 555 010', date: at(38).slice(0, 10), guests: 120, message: 'Are you free on our date? Big reception, lots of candles and greenery.', read: false, at: at(-2), stage: 'new', note: '' },
    { id: 'e4', name: 'Noah Patel', email: 'noah@example.com', phone: '', date: at(150).slice(0, 10), guests: 45, message: 'Small garden wedding, just the bouquet and a few posies.', read: true, at: at(-15), stage: 'replied', note: 'Wants pastel. Sent the gallery link.' },
    { id: 'e5', name: 'Zoe Martin', email: 'zoe@example.com', phone: '', date: at(95).slice(0, 10), guests: 80, message: 'Loved your arbour at the Boathouse!', read: true, at: at(-60), stage: 'booked', note: 'Deposit paid.' },
    { id: 'e6', name: 'Liam Ford', email: 'liam@example.com', phone: '', date: at(60).slice(0, 10), guests: 150, message: 'Need a quote for a large wedding.', read: true, at: at(-45), stage: 'lost', note: 'Went with someone closer to the venue.' },
  ],
  busy: [{ date: at(52).slice(0, 10), note: 'Family holiday' }],
};

const withLast = (c: VendorCouple): VendorCouple => {
  const t = threads[c.id] ?? [];
  const last = t[t.length - 1];
  return { ...c, unread: t.filter((m) => !m.fromVendor && !m.read).length, last: last ? { body: last.body.slice(0, 140), at: last.at } : null };
};

/** The vendor's side of the sample, by API path. */
export function vendorDemo(path: string, method: string, body: Record<string, unknown>): unknown {
  if (path === '/a/vendor' && method === 'PUT') {
    Object.assign(listing.listing, body);
    return { ok: true, slug: listing.listing.slug };
  }
  if (path === '/a/vendor') return listing;
  if (path === '/a/auth/logout') return { ok: true };
  if (path === '/a/vendor/couples') {
    const list = couples.map(withLast);
    return { couples: list, unread: list.reduce((a, c) => a + c.unread, 0), quotesOpen: 1 };
  }
  if (path === '/a/vendor/couples/invite') return { sent: false };
  const m = /^\/a\/vendor\/couples\/([^/]+)\/messages$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]!);
    const c = couples.find((x) => x.id === id);
    if (!c) return null;
    const t = (threads[id] ??= []);
    if (method === 'POST') t.push(msg(true, String(body.body ?? '').trim(), 0));
    else for (const x of t) if (!x.fromVendor) x.read = true;
    return { couple: c.couple, messages: t };
  }
  // A couple's wedding, as they share it with their florist: made up, counts only.
  const dm = /^\/a\/vendor\/couples\/([^/]+)\/details$/.exec(path);
  if (dm) {
    const c = couples.find((x) => x.id === decodeURIComponent(dm[1]!));
    if (!c) return null;
    if (c.id === 'c3') return { couple: c.couple, inPlanner: false, details: null }; // only asked for a quote so far
    return { couple: c.couple, inPlanner: true, details: sampleDetails(c) };
  }
  // The pipeline: an enquiry's stage and note, and the days they're unavailable (this visit only).
  const st = /^\/a\/vendor\/enquiries\/([^/]+)$/.exec(path);
  if (st && method === 'PUT') {
    const q = listing.enquiries.find((x) => x.id === decodeURIComponent(st[1]!));
    if (q) Object.assign(q, { read: true }, body.stage ? { stage: body.stage } : {}, typeof body.note === 'string' ? { note: body.note } : {});
    return { ok: true };
  }
  if (path === '/a/vendor/busy' && method === 'PUT') {
    const dates = (body.dates as { date: string; note?: string }[]) ?? [];
    listing.busy = [...new Map(dates.map((d) => [d.date, { date: d.date, note: (d.note ?? '').trim() }])).values()].sort((a, b) => a.date.localeCompare(b.date));
    return { ok: true, busy: listing.busy };
  }
  const e = /^\/a\/vendor\/enquiries\/([^/]+)\/read$/.exec(path);
  if (e) {
    const q = listing.enquiries.find((x) => x.id === e[1]);
    if (q) q.read = true;
    return { ok: true };
  }
  return null;
}

/** The sample couple's side: their florist (the same conversation the sample vendor sees). */
export function coupleVendorDemo(rest: string, method: string, body: Record<string, unknown>): unknown {
  const t = (threads[SAMPLE_WID] ??= []);
  const vendor: LinkedVendor = { id: LISTING_ID, slug: listing.listing.slug, name: listing.listing.name, category: 'Florist', unread: t.filter((x) => x.fromVendor && !x.read).length, last: t[t.length - 1]?.body.slice(0, 140) ?? '' };
  if (rest === '/vendor-chat') return { vendors: [vendor] };
  if (rest === '/vendor-chat/invite/vendor') return { linked: false, sent: true };
  if (rest === `/vendor-chat/${LISTING_ID}`) {
    if (method === 'POST') t.push(msg(false, String(body.body ?? '').trim(), 0, false));
    else if (method === 'DELETE') return { ok: true };
    else for (const x of t) if (x.fromVendor) x.read = true;
    return { vendor: { id: LISTING_ID, name: vendor.name, category: vendor.category }, messages: t };
  }
  return null;
}

/** The made-up details a couple shares with their florist (the sample vendor account). */
function sampleDetails(c: (typeof couples)[number]): VendorCoupleDetails {
  const waiting = Math.max(0, c.invited - c.coming - Math.round(c.invited * 0.05));
  return {
    couple: c.couple,
    vendor: { name: listing.listing.name, category: 'Florist', arrival: '11:30am', meals: 2, confirmedOn: '' },
    event: { name: 'The wedding', startsAt: c.date, venue: c.venue, address: '' },
    timezone: 'Australia/Sydney',
    parking: 'Unload at the side gate by the kitchen; park in the staff bays behind the barn.',
    timeline: [
      { t: '11:30am', what: 'Florist arrives: ceremony arch and aisle', where: 'The lawn', mine: true },
      { t: '1:30pm', what: 'Guests arrive', where: '', mine: false },
      { t: '2:00pm', what: 'Ceremony', where: 'The lawn', mine: false },
      { t: '3:00pm', what: 'Move the arch flowers to the reception', where: 'The barn', mine: true },
      { t: '5:30pm', what: 'Reception', where: 'The barn', mine: false },
      { t: '11:00pm', what: 'Pack down and collect vases', where: 'The barn', mine: true },
    ],
    guests: { coming: c.coming, waiting },
    dietary: [
      { diet: 'Nut allergy (anaphylaxis)', n: 2, serious: true },
      { diet: 'Vegetarian', n: 9, serious: false },
      { diet: 'Gluten free', n: 6, serious: false },
      { diet: 'Vegan', n: 3, serious: false },
      { diet: 'Dairy free', n: 2, serious: false },
    ],
    meals: [
      { course: 'Main', choice: 'Lamb', n: Math.round(c.coming * 0.45) },
      { course: 'Main', choice: 'Barramundi', n: Math.round(c.coming * 0.35) },
      { course: 'Main', choice: 'Mushroom risotto', n: Math.round(c.coming * 0.2) },
    ],
    vendorMeals: [],
    team: [
      { name: 'Golden Hour Photography', category: 'Photographer', arrival: '12:30pm', contact: 'Mia', phone: '0400 111 222', email: 'mia@example.com' },
      { name: 'Larkwood Kitchen', category: 'Caterer', arrival: '9:00am', contact: 'Sam', phone: '0400 333 444', email: 'kitchen@example.com' },
    ],
    contacts: [{ name: 'Alex', role: 'Coordinator', phone: '0400 000 000' }],
    payments: [],
    files: { dietary: '/demo', day: '/demo', songs: '' },
  };
}

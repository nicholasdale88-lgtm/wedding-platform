import generic from '../../../../seed/texts.generic.json';
import type { InvitePayload } from '../guest/invitation/api';
import { MUSIC_BOX } from '../guest/musicBox';

/**
 * The sample wedding behind /demo and the phone on the front page: the real invitation a guest sees, fed with
 * made-up details (no server, nothing saved). The wording is the starting wording every new wedding gets,
 * with its [placeholders] filled in for this couple (where to stay included, with made-up businesses), their own
 * questions answered, our own music, and a dietary need already noted (Tom, vegetarian) so the reply shows where it
 * goes. The registry, which would still show a placeholder, is switched off, the way a couple can switch it off.
 */
export const SAMPLE = {
  couple: 'Harriet & Theo',
  venue: 'Larkwood Estate',
  region: 'Hunter Valley, NSW',
  guests: 'Emma & Tom',
  date: 'Saturday 20 March 2027',
} as const;

/**
 * The sample's own values for every [placeholder] left in the starting wording (YL-016): a guest of Harriet and
 * Theo's never sees a bracket. Any placeholder added later and not listed here shows its words without brackets.
 */
export const SAMPLE_PLACEHOLDERS: Record<string, string> = {
  '(about how long)': '(about 2 hours 30 minutes)',
  'A line about places to stay nearby.': 'There are guesthouses and cottages within ten minutes of the estate.',
  'A line about your second celebration.': 'Join us the next morning for a slow brunch on the verandah.',
  'A short line about this hotel': 'Boutique guesthouse with breakfast on the verandah',
  'Anything guests need to buy or book to get in.': 'Nothing to book: just tell us when you reply.',
  'Anything to know on the drive: tolls, roadworks.': 'There are tolls on the M1; the last 10 km are winding country roads.',
  'Arrival details.': 'Arrive from 10:30am; coffee is on.',
  'Ceremony venue': SAMPLE.venue,
  'Date and session time': 'Sunday 21 March, 10:30am',
  'Day, date': 'Saturday, 20 March 2027',
  Day: 'Saturday',
  Days: 'Saturday and Sunday',
  'Food or shops nearby, and their hours: ': 'Pokolbin General Store, open 7am to 6pm: ',
  'Hotel 1': 'Vine Cottage Guesthouse',
  'Hotel 2': 'Ridgeline Lodge',
  'Hotel 3': 'Old Dairy Cottages',
  'How far it is from the nearest town and the city': '10 minutes from Cessnock, about 2 hours 30 minutes from Sydney',
  'How guests book it.': 'Tell us when you reply; we’ll save you a place.',
  'How guests book the activity, and when.': 'Tick it when you reply, by 1 February.',
  'How long it takes': 'About 2 hours 30 minutes',
  'How to book a campsite, if there is one.': 'There’s no camping at the estate.',
  'How to book it.': 'Tick it when you reply.',
  'How to book': 'Booking',
  'Is the phone reception good there?': 'Phone reception is good across the estate.',
  'Places to stay at or near the venue.': 'Guesthouses and cottages within ten minutes of the estate.',
  'RSVP date': '1 February 2027',
  'Reception venue': SAMPLE.venue,
  'Second celebration: day and date': 'Sunday, 21 March 2027',
  'Session time': '10:30am',
  'Taxi company': 'Valley Cabs',
  'The activity': 'A vineyard walk',
  'The nearest supermarket, and how far it is.': 'The nearest supermarket is in Cessnock, 10 minutes away.',
  'The venue': SAMPLE.venue,
  'Time and place. What to bring.': '10:30am at the cellar door. Bring comfortable shoes.',
  'Town, State': 'Pokolbin, NSW',
  'Venue address': `${SAMPLE.venue}, 12 Vineyard Road, Pokolbin NSW`,
  'What a taxi costs from the nearest town.': 'About $35 from Cessnock.',
  'What to bring.': 'Comfortable shoes and a hat.',
  'What to know for the second celebration.': 'Brunch is relaxed: come as you are.',
  "What's on site.": 'A cellar door, a café and the ceremony lawn.',
  "What's on": 'Brunch on the verandah',
  'Where guests can stay at the venue, if they can.': 'The estate has six guest rooms; we’ve kept them for family.',
  'Where': 'The verandah',
  'Who has the rooms at the venue, if anyone.': 'Family are staying in the estate’s rooms.',
  'Your date': '20 March 2027',
  'Your options for staying at or near the venue.': 'Guesthouses and cottages a few minutes from the estate.',
  'a taxi or transfer, and its number': 'Valley Cabs on 02 4900 0000',
  distance: '10 km',
  exit: 'the Cessnock exit',
  'how far, and how long a drive': '10 km, a 10-minute drive',
  'how long': '30 minutes',
  name: 'Harriet',
  'nearest town': 'Cessnock',
  phone: '0400 000 000',
  'second celebration': 'Sunday brunch',
  'the best route by car': 'the M1 north',
  'the date, written out, and the time': 'Saturday 20 March 2027, at 2:00pm',
  'the date': '20 March 2027',
  'the reception venue': SAMPLE.venue,
  'the train line': 'the Hunter line',
  "the venue's address": `${SAMPLE.venue}, 12 Vineyard Road, Pokolbin NSW`,
  "the venue's road": 'Vineyard Road',
  'the venue': SAMPLE.venue,
  'the wet-weather spot': 'the barrel room',
  'then directions to the venue': 'then follow the signs to Pokolbin and Vineyard Road',
  'what follows': 'drinks on the verandah',
  "what's happening": 'the ceremony',
  where: 'the lawn',
  'your email': 'harriet.and.theo@example.com',
  'your mobile': '0400 000 000',
};
/** The starting wording with every [placeholder] filled in for the sample. */
export function fillSample(texts: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, v.replace(/\[([^[\]]{1,80})\]/g, (_, p: string) => SAMPLE_PLACEHOLDERS[p] ?? p)]));
}

const FILLS: Record<string, string> = {
  // The welcome
  'inv.78ae6f0c': 'Saturday',
  'inv.46988d28': '20 March 2027',
  'inv.52f6e451': 'Saturday 20 March, at 2:00pm',
  'inv.05cb4a19': SAMPLE.region,
  // The wedding
  'inv.9dc5006a': 'Saturday, 20 March 2027',
  'inv.e257ef55': SAMPLE.venue,
  'inv.984b8c1f': SAMPLE.venue,
  'inv.ffa3f3e2': `${SAMPLE.venue}, Hunter Valley NSW`,
  'inv.920b4069': 'In the heart of the Hunter Valley, about two and a half hours’ drive north of Sydney.',
  // The timeline and dress code
  'inv.5fb81f2d': 'Saturday 20 March 2027',
  'inv.241f4616': 'We exchange vows among the vines.',
  'inv.d73ce566': 'Saturday 20 March',
  // Anywhere else the venue or reply date shows
  'inv.de092a2e': `At ${SAMPLE.venue}`,
  'inv.a045b264': ` ${SAMPLE.venue}.`,
  'inv.ddbb7763': '1 February 2027',
  // The venue's address (made up) and the couple's mobile (ACMA's reserved drama range, so it never rings anyone).
  'inv.080fadc0': 'Larkwood Lane',
  'inv.698be8f5': '. Mention 12 Larkwood Lane, Pokolbin.',
  'inv.7c099bd6': '0491 570 156',
  // "Who do I contact with questions?": a whole sentence, not the design's "us on …" fragment.
  'inv.e9f353bc': 'Call or text Harriet & Theo on ',
  'inv.8297e5e4': 'Address: 12 Larkwood Lane, Pokolbin NSW. ',
  'inv.bcd99820': ' book a car or shuttle from the airport to 12 Larkwood Lane, Pokolbin.',
  'inv.db80331a': ' to 12 Larkwood Lane, Pokolbin.',
  // Where to stay: laid out the way a real couple fills it in. Every business here is made up.
  'inv.7fb60683': 'The cottages on the estate are taken by the wedding party, but you can still stay among the vines in a tent.',
  'inv.1e770267': 'Pick one of the three glamping providers: Canvas & Cork Glamping, Little Fern Tents or Starlit Bell Tents.',
  'inv.29b7e6aa': 'Make a separate campsite booking with Larkwood Estate. Tent hire does not include campsite fees, which are paid to the estate.',
  'inv.450fb963': 'Canvas & Cork booking page',
  'inv.bdf5a316': 'Please book early for 19 to 21 March 2027.',
  'inv.3a185ec1': 'Book online through the Larkwood camping page, using the Book Now option.',
  'inv.3deb62ce': 'Hot showers, toilets and a small cellar-door kiosk are on site, and fire pits are permitted.',
  'inv.5929ff3f': 'Larkwood camping page',
  // A drama number (ACMA's reserved range), so it never rings anyone.
  'inv.b5e35de5': '(02) 5550 0123',
  'inv.bfffe3af': 'Pokolbin is about 10 minutes’ drive from Larkwood. Three lovely options nearby, so please book early.',
  'inv.99f02070': 'The Vine House',
  'inv.04848288': 'Boutique guesthouse with breakfast on the verandah',
  'inv.ba15cee4': 'Ridgeline Lodge',
  'inv.ab0baad0': 'Hilltop rooms and a pool, overlooking the valley',
  'inv.f258ac86': 'Old Dairy Cottages',
  'inv.ca2e4a35': 'Self-contained cottages, good for families',
};

export const SAMPLE_INVITE: InvitePayload = {
  wedding: { slug: 'harriet-and-theo-sample', name1: 'Harriet Lane', name2: 'Theo Marsh', monogram: 'H&T', theme: 'Cream & Sage', timezone: 'Australia/Sydney' },
  content: {
    rsvpBy: 'Kindly reply by 1 February',
    seal: 'Sandstone',
    envelope: { liner: 'eucalyptus' },
    hidden: { '09 Gift Registry': true },
    // Our own music-box waltz (composed for us), starting when the envelope is opened.
    audioUrl: MUSIC_BOX,
    // The questions guests ask, answered the way a couple would for this wedding.
    lists: {
      '11 FAQ#1': [
        { q: 'When should I arrive?', a: ['Please arrive from 1:30pm. The ceremony starts at 2:00pm sharp, among the vines at Larkwood Estate.', 'Ushers will meet you in the car park and walk you down.'] },
        { q: 'What should I wear?', a: ['Garden formal: suits, cocktail or midi dresses.', 'The ceremony is on the lawn, so block heels or flats are kinder than stilettos.'] },
        { q: 'Can I tell you about my dietary needs?', a: ['Yes, please. When you reply, there’s a box for each guest: vegetarian, vegan, gluten free, allergies, anything at all.', 'It goes straight to our caterer, so every meal reaches the right plate.'] },
        { q: 'Can I bring a guest or my children?', a: ['Only the guests named on your invitation can reply. Your reply form shows how many seats are held for you.', 'Questions about a plus-one? Message us from your invitation.'] },
        { q: 'Where do I park?', a: ['There’s free parking at Larkwood Estate, right beside the ceremony lawn.'] },
        { q: 'What if it rains?', a: ['The ceremony moves into the barrel room, a few steps away. We’ll let you know by text on the morning.'] },
        { q: 'How do I get home?', a: ['Dancing finishes at 11:00pm. Please book your ride home before the day: taxis are hard to find late in the valley.'] },
      ],
    },
  },
  texts: fillSample({ ...(generic as Record<string, string>), ...FILLS }),
  // 2:00pm in Sydney (daylight saving time).
  events: [{ key: 'wedding', name: 'The wedding', startsAt: '2027-03-20T03:00:00.000Z', slot: 0, questions: [], venue: SAMPLE.venue, address: 'Hunter Valley NSW' }],
  invitation: {
    token: 'sample-olivia-and-james',
    people: [
      { idx: 0, name: 'Emma', diet: '' },
      { idx: 1, name: 'Tom', diet: 'Vegetarian' },
    ],
    seatsHeld: 2,
    invited: ['wedding'],
    rsvp: {},
    message: '',
    repliedAt: null,
  },
  party: null,
};

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
  texts: { ...(generic as Record<string, string>), ...FILLS },
  // 2:00pm in Sydney (daylight saving time).
  events: [{ key: 'wedding', name: 'The wedding', startsAt: '2027-03-20T03:00:00.000Z', slot: 0, questions: [] }],
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

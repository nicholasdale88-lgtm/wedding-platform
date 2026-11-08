import generic from '../../../../seed/texts.generic.json';
import type { InvitePayload } from '../guest/invitation/api';

/**
 * The sample wedding behind /demo and the phone on the front page: the real invitation a guest sees, fed with
 * made-up details (no server, nothing saved). The wording is the starting wording every new wedding gets,
 * with its [placeholders] filled in for this couple. Sections that would still show placeholders
 * (accommodation, registry, questions) are switched off, the way a couple can switch them off.
 */
export const SAMPLE = {
  couple: 'Olivia & James',
  venue: 'Bellbird Estate',
  region: 'Hunter Valley, NSW',
  guests: 'Emma & Tom',
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
};

export const SAMPLE_INVITE: InvitePayload = {
  wedding: { slug: 'olivia-and-james-sample', name1: 'Olivia Bennett', name2: 'James Carter', monogram: 'O&J', theme: 'Cream & Sage', timezone: 'Australia/Sydney' },
  content: {
    rsvpBy: 'Kindly reply by 1 February',
    seal: 'Sandstone',
    envelope: { liner: 'eucalyptus' },
    hidden: { '08 Accommodation': true, '09 Gift Registry': true, '11 FAQ': true },
  },
  texts: { ...(generic as Record<string, string>), ...FILLS },
  // 2:00pm in Sydney (daylight saving time).
  events: [{ key: 'wedding', name: 'The wedding', startsAt: '2027-03-20T03:00:00.000Z', slot: 0, questions: [] }],
  invitation: {
    token: 'sample-olivia-and-james',
    people: [
      { idx: 0, name: 'Emma', diet: '' },
      { idx: 1, name: 'Tom', diet: '' },
    ],
    seatsHeld: 2,
    invited: ['wedding'],
    rsvp: {},
    message: '',
    repliedAt: null,
  },
  party: null,
};

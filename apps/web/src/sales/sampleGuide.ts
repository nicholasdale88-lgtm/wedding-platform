import type { ReceptionGuide } from '@wp/shared';
import generic from '../../../../seed/texts.generic.json';
import dynamic from '../../../../seed/texts.dynamic.json';
import type { GuidePayload, PhotoPagePayload, ThanksPayload } from '../guest/invitation/api';
import { readDemoPages } from '../try/demoMode';
import { SAMPLE, SAMPLE_INVITE } from './sample';

/**
 * The sample wedding's night-before guide (/demo/tomorrow): what Emma and Tom open the evening before, with
 * made-up details for Harriet and Theo's day (no server, nothing saved). In the sample app, Setup changes it
 * in this tab, and ?mine=1 shows those changes (the preview beside Setup).
 */
export const SAMPLE_GUIDE: ReceptionGuide = {
  style: 'reception',
  date: SAMPLE.date,
  arrive: '1:30pm',
  start: '2:00pm',
  address: `${SAMPLE.venue}, 12 Vineyard Road, Pokolbin NSW`,
  mapUrl: 'https://maps.google.com/?q=Pokolbin+NSW',
  lat: -32.79,
  lon: 151.29,
  parking: 'Free parking beside the ceremony lawn. Follow the signs from the front gate; ushers will meet you.',
  parkDirections: 'From the car park, take the gravel path past the cellar door. The ceremony is on the lawn among the vines.',
  transport: 'A shuttle leaves for Cessnock at 11:15pm. Taxis are hard to find late in the valley, so please book your ride home before the day.',
  tableNote: 'Your name card is at your place. Dinner is served from 6:00pm.',
  wetPlan: 'If it rains, the ceremony moves into the barrel room, a few steps away. Same times; follow the signs from the car park.',
  runsheet: [
    { t: '1:30pm', what: 'Guests arrive', where: 'The lawn' },
    { t: '2:00pm', what: 'Ceremony', where: 'Among the vines' },
    { t: '2:45pm', what: 'Drinks and canapés', where: 'The verandah' },
    { t: '5:30pm', what: 'Reception opens', where: 'The barn' },
    { t: '6:00pm', what: 'Dinner', where: 'The barn' },
    { t: '8:30pm', what: 'Cake and first dance', where: 'The barn' },
    { t: '11:00pm', what: 'Last dance', where: 'The barn' },
  ],
  menu: [
    { course: 'Entrée', a: 'Burrata, heirloom tomato and basil', b: 'Kingfish crudo, citrus and fennel' },
    { course: 'Main', a: 'Slow-roasted lamb shoulder, rosemary potatoes', b: 'Mushroom and thyme risotto' },
    { course: 'Dessert', a: 'Our wedding cake, with berries and cream', b: '' },
  ],
  contacts: [
    { name: 'Larkwood Estate', role: 'The venue', phone: '(02) 4900 0000' },
    { name: 'Valley Taxis', role: 'Rides home', phone: '(02) 4900 0001' },
    { name: 'Harriet and Theo', role: 'Us, for anything at all', phone: 'hello@example.com' },
  ],
  faq: [
    { q: 'What should I wear?', a: 'Garden formal. The ceremony is on the lawn, so block heels or flats are kinder than stilettos.' },
    { q: 'Can I take photos?', a: 'Please keep phones away during the ceremony. After that, snap away and add them to our photo page.' },
    { q: 'Is there somewhere to leave a gift?', a: 'There’s a table by the barn door. Your company is the real gift.' },
  ],
};

/** The sample wedding's thank-you page (/demo/thanks); `mine`: as changed in the sample app's Setup (this tab). */
export function sampleThanks(mine = false): ThanksPayload {
  const own = mine ? readDemoPages() : null;
  const inv = (own?.invitation ?? SAMPLE_INVITE.content) as { thanks?: { heading?: string; message?: string; signoff?: string; ready?: boolean; gallery?: string }; images?: Record<string, string> };
  const t = inv.thanks ?? { ready: true };
  const w = SAMPLE_INVITE.wedding;
  return {
    wedding: { slug: w.slug, name1: w.name1, name2: w.name2, monogram: w.monogram, theme: own?.theme ?? w.theme },
    guest: 'Emma & Tom',
    heading: t.heading ?? '',
    message: t.message ?? 'Thank you for celebrating with us among the vines. Having you there made our day, and we’ll remember it always. The photos are back, and we love them: have a look below.',
    signoff: t.signoff ?? '',
    photo: inv.images?.thanks ?? '',
    album: false, // the sample has no shared album: its gallery link is the couple's own (from Setup)
    gallery: t.ready !== false ? (t.gallery ?? '') : '',
    addPhotos: true,
  };
}

const all = { ...(generic as Record<string, string>), ...(dynamic as Record<string, string>) };

/** The sample wedding's photo page (/demo/photos): try every frame and look; nothing is sent. */
export function samplePhotos(): PhotoPagePayload {
  const w = SAMPLE_INVITE.wedding;
  const ev = { key: 'wedding', name: 'The wedding', startsAt: SAMPLE_INVITE.events[0]!.startsAt, slot: 0 };
  return {
    wedding: { slug: w.slug, name1: w.name1, name2: w.name2, theme: w.theme, monogram: w.monogram, timezone: w.timezone },
    events: [ev],
    event: ev,
    images: {},
    name: 'Emma',
    linked: true,
    open: true,
    album: false,
    looks: null,
    texts: Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('ph.'))),
  };
}

const texts = Object.fromEntries(Object.entries({ ...(generic as Record<string, string>), ...(dynamic as Record<string, string>) }).filter(([k]) => k.startsWith('gd.')));

/** The guide as Emma and Tom see it; `mine`: with the sample app's Setup changes (this tab only). */
export function sampleGuide(mine = false): GuidePayload {
  const own = mine ? readDemoPages() : null;
  const w = SAMPLE_INVITE.wedding;
  const names = own?.names;
  return {
    wedding: { ...w, ...(names ? { name1: names.name1, name2: names.name2, monogram: names.monogram } : {}), theme: own?.theme ?? w.theme },
    images: {},
    event: { key: 'wedding', name: 'The wedding', startsAt: SAMPLE_INVITE.events[0]!.startsAt, slot: 0 },
    guide: (own?.guides?.wedding as ReceptionGuide | undefined) ?? SAMPLE_GUIDE,
    texts: { ...texts, ...Object.fromEntries(Object.entries(own?.texts ?? {}).filter(([k]) => k.startsWith('gd.'))) },
    guest: {
      token: 'sample-emma-and-tom',
      attending: true,
      answers: {},
      people: [
        { idx: 0, name: 'Emma Walsh', diet: '', tableId: 't3', seat: 4, meals: { e: '', m: 'Lamb', d: '' } },
        { idx: 1, name: 'Tom Walsh', diet: 'Vegetarian', tableId: 't3', seat: 5, meals: { e: 'Burrata', m: 'Risotto', d: '' } },
      ],
    },
    seating: {
      aspect: '4 / 3',
      planImg: '',
      tables: [
        { id: 'h', name: 'Head table', shape: 'head', dir: 'h', len: 40, x: 50, y: 14 },
        { id: 't1', name: '1', shape: 'round', dir: 'h', len: 14, x: 20, y: 45 },
        { id: 't2', name: '2', shape: 'round', dir: 'h', len: 14, x: 40, y: 45 },
        { id: 't3', name: '3', shape: 'round', dir: 'h', len: 14, x: 60, y: 45 },
        { id: 't4', name: '4', shape: 'round', dir: 'h', len: 14, x: 80, y: 45 },
        { id: 't5', name: '5', shape: 'round', dir: 'h', len: 14, x: 30, y: 75 },
        { id: 't6', name: '6', shape: 'round', dir: 'h', len: 14, x: 70, y: 75 },
      ],
      features: [{ label: 'Dance floor', x: 42, y: 66, w: 16, h: 18 }],
    },
    mates: { t3: ['Olivia Hart', 'James Hart', 'Priya Nair', 'Sam Nair', 'Lucy Chen', 'Ben Chen'] },
    weather: {
      summary: 'Mostly sunny',
      detail: 'Top of 27°',
      max: 27,
      hours: [
        { label: '2pm', temp: '26°', rain: '0' },
        { label: '5pm', temp: '25°', rain: '5' },
        { label: '8pm', temp: '21°', rain: '5' },
        { label: '11pm', temp: '17°', rain: '0' },
      ],
      updated: new Date().toISOString(),
    },
    photoUrl: '/demo',
  };
}

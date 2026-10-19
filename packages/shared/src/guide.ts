import { z } from 'zod';

/**
 * Night-before guides: one per event, edited in Admin → Guest pages, sent by the night-before text
 * ({guide} / {guide_<event>}). Two designs:
 *  - "reception": the full evening guide (seat cards, plan, menu, FAQ, parking video, photos QR)
 *  - "dayout":    the day-out guide (your plan, what to bring, run of the day)
 * All fields are optional; the page shows a section only when it has something to say.
 */

const s = (max = 2000) => z.string().max(max);
const Row = z.object({ t: s(40), what: s(200), where: s(400).default('') });
const Contact = z.object({ name: s(120), role: s(200).default(''), phone: s(200) });

const Common = {
  date: s(120),
  address: s(400),
  mapUrl: s(1000),
  bomUrl: s(1000),
  transport: s(),
  /** For the live forecast (Open-Meteo); find them by right-clicking the venue in Google Maps. */
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  runsheet: z.array(Row).max(30),
  contacts: z.array(Contact).max(12),
  /** Music guests can play on the page (an MP3, or a YouTube link), and what it is. */
  music: s(1000),
  musicTitle: s(120),
  /** The wet-weather plan: shown when the forecast says rain, and as a quick answer. */
  wetPlan: s(),
};

export const ReceptionGuide = z
  .object({
    style: z.literal('reception'),
    ...Common,
    arrive: s(40),
    start: s(40),
    parkDirections: s(),
    /** YouTube, Google Drive or a direct video link. */
    parkVideo: s(1000),
    /** Where guests add photos; empty = this site's own photo page. */
    photoUrl: s(1000),
    parking: s(),
    tableNote: s(),
    menu: z.array(z.object({ course: s(80), a: s(400), b: s(400).default('') })).max(12),
    faq: z.array(z.object({ q: s(200), a: s() })).max(30),
  })
  .partial()
  .required({ style: true });

export const DayoutGuide = z
  .object({
    style: z.literal('dayout'),
    ...Common,
    arriveBy: s(40),
    activityTime: s(40),
    picnicTime: s(40),
    picnicWhere: s(200),
    dress: s(200),
    signoff: s(120),
    /** Hero photo URL (or a media key). */
    hero: s(1000),
    bring: z.array(s(200)).max(20),
    /** The RSVP question that decides "your plan" (e.g. "ride"), and its answers. */
    choiceKey: s(40),
    yesAnswer: s(200),
    unsureAnswer: s(200),
  })
  .partial()
  .required({ style: true });

export const GuideContent = z.discriminatedUnion('style', [ReceptionGuide, DayoutGuide]);
export type ReceptionGuide = z.infer<typeof ReceptionGuide>;
export type DayoutGuide = z.infer<typeof DayoutGuide>;
export type GuideContent = z.infer<typeof GuideContent>;

/**
 * The stored guides ({ [eventKey]: guide }) with anything invalid dropped. An older flat guide
 * (one object with "date", "runsheet"...) belongs to the first event.
 */
export function guidesOf(raw: unknown, eventKeys: string[]): Record<string, GuideContent> {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const legacy = !eventKeys.some((k) => obj[k] && typeof obj[k] === 'object') && ('date' in obj || 'runsheet' in obj);
  const byEvent: Record<string, unknown> = legacy && eventKeys[0] ? { [eventKeys[0]]: { style: 'reception', ...obj } } : obj;
  const out: Record<string, GuideContent> = {};
  for (const k of eventKeys) {
    const g = byEvent[k];
    if (!g || typeof g !== 'object') continue;
    const parsed = GuideContent.safeParse({ style: 'reception', ...(g as object) });
    if (parsed.success) out[k] = parsed.data;
  }
  return out;
}

/** The guide page's design for a style: catalogue prefix. */
export const GUIDE_PAGE = { reception: 'gd', dayout: 'g30' } as const;

/** WMO weather code -> a word or two (Open-Meteo). */
export function weatherWords(code: number): string {
  if (code === 0) return 'Sunny';
  if (code <= 2) return 'Mostly sunny';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95) return 'Storms';
  return 'Mixed';
}

export interface Forecast {
  summary: string;
  /** e.g. "Top of 27°" */
  detail: string;
  max: number;
  hours: { label: string; temp: string; rain: string }[];
  /** ISO time it was fetched */
  updated: string;
}

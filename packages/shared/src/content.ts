import { z } from 'zod';
import { INV_SCOPES } from './generated/invScopes';

/** Pictures a timeline row can carry (drawn as in the design); "end" is the closing diamond. */
export const TIMELINE_ICONS = [
  'arrive', 'rings', 'camera', 'drinks', 'sunset', 'dinner', 'music', 'speech', 'cake', 'heart', 'sparkle', 'car', 'end',
] as const;
export type TimelineIcon = (typeof TIMELINE_ICONS)[number];
export const TimelineItem = z.object({
  time: z.string().max(40),
  until: z.string().max(40),
  title: z.string().max(120),
  note: z.string().max(400),
  /** Where it happens ("The Lookout"), shown under the detail; optional. */
  where: z.string().max(120).optional(),
  icon: z.enum(TIMELINE_ICONS),
});
export type TimelineItem = z.infer<typeof TimelineItem>;

/**
 * Per-wedding content for the guest pages (all editable in Admin → Guest pages).
 * The wording itself lives in the text catalogue (content.texts), keyed like "inv.1a2b3c4d".
 */
export const InvitationContent = z
  .object({
    /** Wax-seal / sign-off initials, e.g. "A & B". */
    initials: z.string().max(40),
    rsvpBy: z.string().max(120),
    rideTime: z.string().max(40),
    directionsUrl: z.string().max(500),
    registryUrl: z.string().max(500),
    giftAccount: z.string().max(500),
    giftAccountLabel: z.string().max(60),
    /** MP3 (preferred) or YouTube link; plays once from the envelope tap. */
    audioUrl: z.string().max(500),
    /** Backup RSVP by email. */
    rsvpEmail: z.string().max(200),
    /** The couple's own touches on the theme: paper, ink and metallic colours, and how the names are set. */
    custom: z
      .object({
        paper: z.string().regex(/^#[0-9a-f]{6}$/i),
        ink: z.string().regex(/^#[0-9a-f]{6}$/i),
        accent: z.string().regex(/^#[0-9a-f]{6}$/i),
        soft: z.string().regex(/^#[0-9a-f]{6}$/i),
        envelope: z.string().regex(/^#[0-9a-f]{6}$/i),
        names: z.enum(['script', 'caps', 'vibes', 'parisienne', 'playfair']),
      })
      .partial(),
    /** The last day replies can be changed online ("2027-08-01"); after it, guests are asked to email. */
    rsvpClose: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    seal: z.enum(['Sandstone', 'Dusty rose', 'Daphne blue']),
    /** The envelope's finishing touches: the liner inside the flap, the guest's name, a stamp and postmark, a ribbon, a shimmer. */
    envelope: z
      .object({
        liner: z.enum(['none', 'floral', 'eucalyptus', 'stripes', 'confetti', 'foil']),
        name: z.boolean(),
        stamp: z.boolean(),
        ribbon: z.enum(['none', 'silk', 'twine']),
        shimmer: z.boolean(),
      })
      .partial(),
    /** Photos in the design's picture slots, by slot id (e.g. "lookout"). */
    images: z.record(z.string().max(500)),
    /** Sections switched off, by the design's section name ("11 FAQ"). */
    hidden: z.record(z.string().max(80), z.boolean()),
    /** The couple's own questions for an accordion list ("11 FAQ#1"), replacing the design's. */
    lists: z.record(z.string().max(80), z.array(z.object({ q: z.string().max(300), a: z.array(z.string().max(1000)).max(30) })).max(40)),
    /** The couple's own order of events (03 Timeline), replacing the design's rows. */
    timeline: z.array(TimelineItem).max(30),
    /** How the timeline's times read: "2:00pm" (12h) or "14:00" (24h). */
    timelineClock: z.enum(['12h', '24h']),
    /** Each other event's own timeline, by event key, shown at the end of that event's section of the invitation. */
    timelines: z.record(z.string().max(40), z.array(TimelineItem).max(30)),
  })
  .partial();
export type InvitationContent = z.infer<typeof InvitationContent>;

/** Design parts that are per event: in this template the first event is "W", the second "B". */
const PART_EVENT: Record<string, 0 | 1> = { wDisp: 0, invW: 0, bSecDisp: 1, bFaqDisp: 1, bDisp: 1, rideDisp: 1, invB: 1 };
/** Which event (0 = first, 1 = second) a per-guest part of the design belongs to. */
export const eventSlotOfPart = (part: string | undefined): 0 | 1 | undefined => (part ? PART_EVENT[part] : undefined);

/**
 * The wording a guest may receive (docs/09 §J): everything for unidentified visitors; for an
 * identified guest, nothing that belongs to an event they're not invited to.
 */
export function textsFor(
  page: 'inv' | 'gd' | 'g30' | 'ph',
  texts: Record<string, string>,
  invitedSlots: (0 | 1)[] | null,
): Record<string, string> {
  const scopes = page === 'inv' ? INV_SCOPES : {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(texts)) {
    if (!k.startsWith(`${page}.`)) continue;
    if (invitedSlots) {
      const parts = (scopes[k] ?? '').split(',').filter(Boolean);
      if (parts.some((p) => PART_EVENT[p] !== undefined && !invitedSlots.includes(PART_EVENT[p]!))) continue;
    }
    out[k] = v;
  }
  return out;
}

/** Fill {tags} in a catalogue sentence. Unknown tags are left as written. */
export const fillTags = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));

/** "Ann", "Ann and Bob", "Ann, Bob and Cy" */
export const andList = (xs: string[], and = 'and') =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`;

/**
 * The couple's own accordion lists a guest may receive: like the wording, a list that belongs to an
 * event they're not invited to (e.g. the second event's FAQ) is never sent to them.
 */
export function listsFor(lists: Record<string, unknown> | undefined, invitedSlots: (0 | 1)[] | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, list] of Object.entries(lists ?? {})) {
    const parts = (INV_SCOPES[`list:${key}`] ?? '').split(',').filter(Boolean);
    if (invitedSlots && parts.some((p) => PART_EVENT[p] !== undefined && !invitedSlots.includes(PART_EVENT[p]!))) continue;
    out[key] = list;
  }
  return out;
}

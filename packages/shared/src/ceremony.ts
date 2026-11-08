import { z } from 'zod';

/**
 * Wedding planner → Ceremony: where the couple and their celebrant work together. The celebrant's
 * questionnaires (a file to fill in, or questions answered in the app by each partner), the legal
 * paperwork for an Australian marriage, and the ceremony itself (order, readings, vows, music).
 * The paperwork is a guide: the celebrant confirms what the couple needs.
 */

const s = (max: number) => z.string().max(max).default('');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).default('');

/** A planning file (kept with the wedding's planning files): its id and name. */
export const CeremonyFile = z.object({ id: z.string().max(40), name: z.string().max(160) });
export type CeremonyFile = z.infer<typeof CeremonyFile>;

/** One question: a short answer, a long answer, or a choice from a few options. */
export const CeremonyQuestion = z.object({
  id: z.string().max(40),
  kind: z.enum(['short', 'long', 'choice']).default('short'),
  text: z.string().max(300),
  options: z.array(z.string().max(80)).max(10).default([]),
});
export type CeremonyQuestion = z.infer<typeof CeremonyQuestion>;

const perPartner = <T extends z.ZodTypeAny>(t: T) => z.object({ p1: t, p2: t });

/**
 * A questionnaire from the celebrant: a file (PDF, Word or a photo) with a note, the couple's filled-in
 * copies sent back, and/or questions in the app. Each partner answers on their own and marks theirs
 * ready for the celebrant.
 */
export const Questionnaire = z.object({
  id: z.string().max(40),
  title: z.string().max(120),
  note: s(1000),
  /** The blank questionnaire, as the celebrant sent it. */
  file: CeremonyFile.nullable().default(null),
  /** The couple's filled-in copies, sent back. */
  returned: z.array(CeremonyFile).max(6).default([]),
  questions: z.array(CeremonyQuestion).max(60).default([]),
  /** Each partner's answers, by question id. */
  answers: perPartner(z.record(z.string().max(40), z.string().max(4000)).default({})).default({}),
  ready: perPartner(z.boolean().default(false)).default({}),
  added: day,
});
export type Questionnaire = z.infer<typeof Questionnaire>;

/** One document for one partner: ticked when the celebrant has seen it, with a copy if they like. */
export const PaperItem = z.object({ done: z.boolean().default(false), file: CeremonyFile.nullable().default(null), note: s(300) });
export type PaperItem = z.infer<typeof PaperItem>;
export const PartnerPapers = z.object({
  /** Evidence of date and place of birth: a birth certificate or passport. */
  birth: PaperItem.default({}),
  /** Photo ID: a driver licence or passport. */
  photoId: PaperItem.default({}),
  /** Been married before: proof it ended (a divorce certificate, or a death certificate). */
  married: z.boolean().default(false),
  ended: PaperItem.default({}),
});
export type PartnerPapers = z.infer<typeof PartnerPapers>;

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;
export type AuState = (typeof AU_STATES)[number];
/** Each state's Births, Deaths and Marriages registry (where the official certificate comes from). Fees change: they're on its site. */
export const BDM_LINKS: Record<AuState, { name: string; url: string }> = {
  NSW: { name: 'NSW Registry of Births, Deaths & Marriages', url: 'https://www.nsw.gov.au/family-and-relationships/births-deaths-marriages' },
  VIC: { name: 'Births, Deaths and Marriages Victoria', url: 'https://www.bdm.vic.gov.au/' },
  QLD: { name: 'Queensland Registry of Births, Deaths and Marriages', url: 'https://www.qld.gov.au/law/births-deaths-marriages-and-divorces' },
  WA: { name: 'WA Registry of Births, Deaths and Marriages', url: 'https://www.wa.gov.au/organisation/department-of-justice/the-registry-of-births-deaths-and-marriages' },
  SA: { name: 'SA Births, Deaths and Marriages', url: 'https://www.sa.gov.au/topics/family-and-community/births-deaths-and-marriages' },
  TAS: { name: 'Births, Deaths and Marriages Tasmania', url: 'https://www.justice.tas.gov.au/bdm' },
  ACT: { name: 'Access Canberra: Births, Deaths and Marriages', url: 'https://www.accesscanberra.act.gov.au/' },
  NT: { name: 'NT Births, Deaths and Marriages', url: 'https://nt.gov.au/law/bdm' },
};
/** The Notice of Intended Marriage form (Attorney-General's Department). */
export const NOIM_FORM_URL = 'https://www.ag.gov.au/families-and-marriage/publications/notice-intended-marriage';

export const Paperwork = z.object({
  /** The day the Notice of Intended Marriage reached the celebrant ('' not yet). */
  noimLodged: day,
  papers: perPartner(PartnerPapers.default({})).default({}),
  /** The Declaration of No Legal Impediment, signed before the ceremony. */
  declaration: z.boolean().default(false),
  witness1: s(80),
  witness2: s(80),
  /** The three marriage certificates, signed on the day. */
  signed: z.boolean().default(false),
  /** The celebrant lodged the marriage with the registry (within 14 days). */
  registered: day,
  /** The official certificate applied for. */
  certificate: z.boolean().default(false),
  state: z.union([z.literal(''), z.enum(AU_STATES)]).default(''),
});
export type Paperwork = z.infer<typeof Paperwork>;

/** One part of the ceremony, in order: what happens and who does it. */
export const CeremonyPart = z.object({ id: z.string().max(40), part: z.string().max(120), who: s(120), detail: s(400) });
export type CeremonyPart = z.infer<typeof CeremonyPart>;
export const Reading = z.object({ id: z.string().max(40), title: z.string().max(160), reader: s(80) });
export type Reading = z.infer<typeof Reading>;
export const MusicCue = z.object({ id: z.string().max(40), moment: z.string().max(80), song: s(160) });
export type MusicCue = z.infer<typeof MusicCue>;
/** A partner's vows. Private ones are shown only to the person who marked them private (`by`, their sign-in). */
export const Vow = z.object({ text: s(4000), private: z.boolean().default(false), by: s(60) });
export type Vow = z.infer<typeof Vow>;

export const Celebrant = z.object({ name: s(120), phone: s(40), email: s(200), note: s(400) });

export const Ceremony = z.object({
  celebrant: Celebrant.default({}),
  questionnaires: z.array(Questionnaire).max(12).default([]),
  paperwork: Paperwork.default({}),
  order: z.array(CeremonyPart).max(40).default([]),
  readings: z.array(Reading).max(12).default([]),
  vows: perPartner(Vow.default({})).default({}),
  music: z.array(MusicCue).max(20).default([]),
  notes: s(2000),
});
export type Ceremony = z.infer<typeof Ceremony>;

/** The usual order of an Australian civil ceremony. */
export const CEREMONY_ORDER: Omit<CeremonyPart, 'id'>[] = [
  { part: 'Entrance', who: '', detail: 'Who walks in, in what order, and to what music' },
  { part: 'Welcome', who: 'Celebrant', detail: 'Welcome, and the words the law requires the celebrant to say' },
  { part: 'Readings', who: '', detail: '' },
  { part: 'Vows', who: 'Both of you', detail: 'Including the legal words each of you must say' },
  { part: 'Rings', who: '', detail: 'Who holds them until now' },
  { part: 'Signing', who: 'Both of you, two witnesses, celebrant', detail: 'The three marriage certificates' },
  { part: 'Pronouncement', who: 'Celebrant', detail: 'The first kiss, then the walk back down the aisle' },
];

/** The celebrant's usual "getting to know you" questions. */
export const GETTING_TO_KNOW_YOU: Omit<CeremonyQuestion, 'id'>[] = [
  { kind: 'long', text: 'How did you meet?', options: [] },
  { kind: 'long', text: 'Tell us about the proposal.', options: [] },
  { kind: 'long', text: 'What do you love most about each other?', options: [] },
  { kind: 'short', text: 'A word or two that sums up your relationship', options: [] },
  { kind: 'choice', text: 'What feel would you like for the ceremony?', options: ['Relaxed and fun', 'Warm and personal', 'Traditional and formal', 'Short and sweet'] },
  { kind: 'choice', text: 'How long would you like it to be?', options: ['About 15 minutes', 'About 20 minutes', 'About 30 minutes'] },
  { kind: 'long', text: 'Any readings, poems or words you’d like included? Who would read them?', options: [] },
  { kind: 'long', text: 'Any rituals you’d like (a hand-fasting, sand ceremony, cultural or family traditions)?', options: [] },
  { kind: 'long', text: 'Who will be involved (walking in, holding the rings, reading, your two witnesses)?', options: [] },
  { kind: 'long', text: 'Anyone you’d like remembered or thanked during the ceremony?', options: [] },
  { kind: 'choice', text: 'Will you write your own vows?', options: ['Yes, our own', 'The celebrant’s words', 'Not sure yet'] },
];

// ---------------------------------------------------------------- the Notice of Intended Marriage

/** A yyyy-mm-dd date moved by whole calendar months (31 March less a month is the last day of February). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12; // 0-11
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/**
 * When the Notice of Intended Marriage can reach the celebrant: no more than 18 months, and at least one
 * month, before the wedding. `latest` is the last day it can be lodged (a calendar month before).
 */
export function noimWindow(weddingDay: string): { earliest: string; latest: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weddingDay) || Number.isNaN(Date.parse(`${weddingDay}T00:00:00Z`))) return null;
  return { earliest: addMonths(weddingDay, -18), latest: addMonths(weddingDay, -1) };
}

export type NoimState = 'lodged' | 'early' | 'open' | 'closing' | 'late' | 'unknown';
/**
 * Where the notice stands today: lodged; too early to lodge; open; closing (three weeks or less left);
 * or late (talk to the celebrant: only a prescribed authority can allow a shorter time).
 */
export function noimStatus(weddingDay: string, today: string, lodged: string): { state: NoimState; earliest: string; latest: string; daysLeft: number } {
  const w = noimWindow(weddingDay);
  if (!w) return { state: lodged ? 'lodged' : 'unknown', earliest: '', latest: '', daysLeft: 0 };
  const daysLeft = daysBetween(today, w.latest);
  const state: NoimState = lodged ? 'lodged' : today < w.earliest ? 'early' : daysLeft < 0 ? 'late' : daysLeft <= 21 ? 'closing' : 'open';
  return { state, ...w, daysLeft };
}

/** How far each partner is through a questionnaire: answered of asked, and whether they've said it's ready. */
export function questionnaireProgress(q: Pick<Questionnaire, 'questions' | 'answers' | 'ready' | 'file' | 'returned'>) {
  const of = (side: 'p1' | 'p2') => ({ answered: q.questions.filter((x) => (q.answers[side][x.id] ?? '').trim()).length, asked: q.questions.length, ready: q.ready[side] });
  const p1 = of('p1');
  const p2 = of('p2');
  // A file-only questionnaire is done when a filled-in copy is back.
  const done = q.questions.length ? p1.ready && p2.ready : q.returned.length > 0 || !q.file;
  return { p1, p2, done };
}

/** The paperwork's checklist, in order, with what's done: for the progress ring. */
export function paperworkProgress(p: Paperwork) {
  const items = [
    !!p.noimLodged,
    ...(['p1', 'p2'] as const).flatMap((side) => {
      const x = p.papers[side];
      return [x.birth.done, x.photoId.done, ...(x.married ? [x.ended.done] : [])];
    }),
    p.declaration,
    !!(p.witness1.trim() && p.witness2.trim()),
    p.signed,
    !!p.registered,
    p.certificate,
  ];
  return { done: items.filter(Boolean).length, total: items.length };
}

/**
 * Private vows stay private: what someone else sees of a private vow is that it's there, not its words.
 * `me` is the signed-in person's id.
 */
export function vowsFor(c: Ceremony, me: string): Ceremony {
  const hide = (v: Vow): Vow => (v.private && v.by && v.by !== me ? { ...v, text: '' } : v);
  return { ...c, vows: { p1: hide(c.vows.p1), p2: hide(c.vows.p2) } };
}

/**
 * A save of the ceremony by `me`: someone else's private vows are kept exactly as they were (whatever came
 * in), and vows marked private are marked as theirs.
 */
export function keepPrivateVows(next: Ceremony, before: Ceremony, me: string): Ceremony {
  const one = (n: Vow, b: Vow): Vow => {
    if (b.private && b.by && b.by !== me) return b;
    return n.private ? { ...n, by: me } : { ...n, by: '' };
  };
  return { ...next, vows: { p1: one(next.vows.p1, before.vows.p1), p2: one(next.vows.p2, before.vows.p2) } };
}

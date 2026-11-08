/**
 * Where a seating plan is in its life, worked out from the replies, and what changed since it was last
 * saved. The couple drafts a concept plan with everyone on the list before the invitations go out, watches it fill in as
 * replies arrive (nothing is moved for them), seats only the yeses once most are in, then publishes.
 */

export type SeatStage = 'draft' | 'replies' | 'final' | 'published';

export const SEAT_STAGES: { key: SeatStage; label: string; hint: string }[] = [
  { key: 'draft', label: 'Concept plan', hint: 'Before the invitations go out: place everyone on your list at a table and try arrangements.' },
  { key: 'replies', label: 'Replies coming in', hint: 'Guests turn from pencilled in to confirmed as they say yes. Anyone who can’t come frees their seat; nothing else moves.' },
  { key: 'final', label: 'Final', hint: 'Most replies are in: seat only those who said yes and fill the gaps.' },
  { key: 'published', label: 'Published', hint: 'Guests see their table in their guide. Publish again after any change.' },
];

/** Share of guests who have answered at which the plan is ready to finalise. */
export const FINAL_SHARE = 0.8;

/** The stage from the data: published; replies closed or mostly in; invitations out; or still a draft. */
export function seatStage(f: { sent: boolean; invited: number; replied: number; closed: boolean; published: boolean }): SeatStage {
  if (f.published) return 'published';
  if (f.closed || (f.invited > 0 && f.replied / f.invited >= FINAL_SHARE)) return 'final';
  return f.sent || f.replied > 0 ? 'replies' : 'draft';
}

/** The name suggested for a version saved at this stage. */
export const STAGE_VERSION: Record<SeatStage, string> = { draft: 'Concept plan', replies: 'After replies', final: 'Final', published: 'Final' };

/**
 * Who was on the plan when it was last saved: each person's name, whether they had said yes, and the
 * name of their table (if seated). Kept with the plan so the next visit can say what changed.
 */
export interface SeatBaseline {
  at: string;
  people: Record<string, { n: string; y: 0 | 1; t?: string }>;
}

type NowPerson = { id: string; name: string; coming: boolean; tableId: string | null };

export function seatBaseline(at: string, people: NowPerson[], tables: { id: string; name: string }[]): SeatBaseline {
  const tname = new Map(tables.map((t) => [t.id, t.name]));
  const out: SeatBaseline['people'] = {};
  for (const p of people) {
    const t = p.tableId ? tname.get(p.tableId) : undefined;
    out[p.id] = t ? { n: p.name, y: p.coming ? 1 : 0, t } : { n: p.name, y: p.coming ? 1 : 0 };
  }
  return { at, people: out };
}

export interface SeatChanges {
  /** Saved as pencilled in, now said yes (confirmed). */
  saidYes: string[];
  /** Had a seat when saved, and can't come now (or are no longer invited): their seat is free. */
  cantCome: { name: string; table: string }[];
  /** On the list now but not when saved, and not seated yet. */
  newGuests: string[];
}

/** What changed since the plan was last saved (empty lists when nothing did, or it was never saved). */
export function seatChanges(base: SeatBaseline | null | undefined, people: NowPerson[]): SeatChanges {
  const out: SeatChanges = { saidYes: [], cantCome: [], newGuests: [] };
  if (!base) return out;
  const now = new Map(people.map((p) => [p.id, p]));
  for (const [id, b] of Object.entries(base.people)) {
    const p = now.get(id);
    if (p && !b.y && p.coming) out.saidYes.push(p.name);
    if (!p && b.t) out.cantCome.push({ name: b.n, table: b.t });
  }
  for (const p of people) if (!base.people[p.id] && !p.tableId) out.newGuests.push(p.name);
  return out;
}

export const anyChanges = (c: SeatChanges) => c.saidYes.length + c.cantCome.length + c.newGuests.length > 0;

/** "Table 4" for numbered tables, the name otherwise. */
const tableWord = (t: string) => (/^\d+$/.test(t) ? `Table ${t}` : t);
const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? ''));

/** The changes in one plain line: "3 said yes (pencilled in → confirmed) · 2 can't come (seats freed at Table 4 and Table 7) · 1 new guest to place". */
export function seatChangesLine(c: SeatChanges): string {
  const parts: string[] = [];
  if (c.saidYes.length) parts.push(`${c.saidYes.length} said yes (pencilled in → confirmed)`);
  if (c.cantCome.length) {
    const tables = [...new Set(c.cantCome.map((x) => tableWord(x.table)))];
    parts.push(`${c.cantCome.length} can’t come (${c.cantCome.length === 1 ? 'seat' : 'seats'} freed at ${andList(tables)})`);
  }
  if (c.newGuests.length) parts.push(`${c.newGuests.length} new ${c.newGuests.length === 1 ? 'guest' : 'guests'} to place`);
  return parts.join(' · ');
}

import type { SeatPresets, SeatRules } from './planner';

/**
 * Seating rules, checked and followed. The admin's Checks panel lists what breaks a rule; Auto-seat
 * places everyone who said yes so no rule breaks where the room allows it, and says what it couldn't do.
 */

export type RulePerson = { id: string; invitationId: string; name: string; party: string; role?: string; coming: boolean };
export type RuleTable = { id: string; name: string; seats: number; shape?: string };
type Seats = Record<string, string | null | undefined>;

export const SEAT_PRESETS: { key: keyof SeatPresets; label: string; hint: string }[] = [
  { key: 'invite', label: 'People invited together sit together', hint: 'Couples, families and plus-ones stay at one table.' },
  { key: 'groups', label: 'Keep each group at the same tables', hint: 'Uses each guest’s group (e.g. “Uni friends”), so nobody is the only one they know.' },
  { key: 'head', label: 'Wedding party at the head table', hint: 'Anyone with a wedding-party role, when a table is a head table.' },
  { key: 'fill', label: 'Fill each table before starting another', hint: 'Fewer half-empty tables.' },
];
export const DEFAULT_PRESETS: SeatPresets = { invite: true, groups: true, head: true, fill: true };
export const NO_RULES: SeatRules = { presets: DEFAULT_PRESETS, pairs: [] };
const presetsOf = (r: SeatRules | null | undefined): SeatPresets => ({ ...DEFAULT_PRESETS, ...r?.presets });

export const tableLabel = (t: Pick<RuleTable, 'name'> | undefined) => (!t ? '' : /^\d+$/.test(t.name) ? `Table ${t.name}` : t.name);
/** A head table: the shape, or a table named "Head table" / "Bridal table". */
export const isHeadTable = (t: RuleTable) => t.shape === 'head' || /\b(head|bridal)\b/i.test(t.name);
const inParty = (p: RulePerson) => !!p.role?.trim();
const first = (p: RulePerson) => p.name.split(' ')[0] || p.name;
const names = (ps: RulePerson[]) => {
  const n = ps.map(first);
  if (n.length > 4) return `${n.slice(0, 3).join(', ')} and ${n.length - 3} more`;
  return n.length > 2 ? `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}` : n.join(' & ');
};

/** What breaks a rule in this seating, in words, worst first (too many people at a table). */
export function seatProblems(people: RulePerson[], tables: RuleTable[], seats: Seats, rules?: SeatRules | null): string[] {
  const pre = presetsOf(rules);
  const coming = people.filter((p) => p.coming);
  const byId = new Map(people.map((p) => [p.id, p]));
  const table = new Map(tables.map((t) => [t.id, t]));
  const at = (id: string) => {
    const t = seats[id];
    return t && table.has(t) ? t : null;
  };
  const out: string[] = [];
  for (const t of tables) {
    const n = coming.filter((p) => at(p.id) === t.id).length;
    if (n > t.seats) out.push(`${tableLabel(t)} has ${n} people for ${t.seats} seats.`);
  }
  if (pre.invite) {
    const byInv = new Map<string, RulePerson[]>();
    for (const p of coming) byInv.set(p.invitationId, [...(byInv.get(p.invitationId) ?? []), p]);
    for (const ps of byInv.values()) {
      const ts = [...new Set(ps.map((p) => at(p.id)).filter((x): x is string => !!x))];
      if (ts.length > 1) out.push(`${names(ps)} were invited together but sit at ${ts.map((x) => tableLabel(table.get(x))).join(' and ')}.`);
    }
  }
  for (const r of rules?.pairs ?? []) {
    const a = byId.get(r.a);
    const b = byId.get(r.b);
    if (!a?.coming || !b?.coming) continue;
    const ta = at(a.id);
    const tb = at(b.id);
    if (r.kind === 'apart' && ta && ta === tb) out.push(`${a.name} and ${b.name} are both at ${tableLabel(table.get(ta))} (you asked to keep them apart).`);
    if (r.kind === 'together' && ta && tb && ta !== tb) out.push(`${a.name} and ${b.name} are at different tables (you asked to keep them together).`);
    if (r.kind === 'apart' && pre.invite && a.invitationId === b.invitationId) out.push(`${a.name} and ${b.name} are on one invitation, and you asked to keep them apart: turn off “invited together” or remove the rule.`);
  }
  const heads = tables.filter(isHeadTable);
  if (pre.head && heads.length) {
    const away = coming.filter((p) => inParty(p) && at(p.id) && !heads.some((h) => h.id === at(p.id)));
    if (away.length) out.push(`${names(away)} ${away.length === 1 ? 'is' : 'are'} in the wedding party but not at the head table.`);
  }
  if (pre.groups) {
    // An invitation that is the only one from its group at its table, while the group sits together elsewhere.
    const groupTables = new Map<string, Map<string, Set<string>>>(); // group -> table -> invitations
    for (const p of coming) {
      const t = at(p.id);
      if (!p.party || !t) continue;
      const m = groupTables.get(p.party) ?? new Map<string, Set<string>>();
      m.set(t, (m.get(t) ?? new Set()).add(p.invitationId));
      groupTables.set(p.party, m);
    }
    for (const [group, m] of groupTables) {
      if (m.size < 2) continue;
      for (const [t, invs] of m) {
        if (invs.size !== 1 || ![...m.values()].some((x) => x.size > 1)) continue;
        const ps = coming.filter((p) => p.party === group && at(p.id) === t);
        if (heads.some((h) => h.id === t) && ps.every(inParty)) continue; // at the head table for a reason
        out.push(`${names(ps)} ${ps.length === 1 ? 'is the only one' : 'are the only ones'} from ${group} at ${tableLabel(table.get(t))}.`);
      }
    }
  }
  return out;
}

/**
 * Seat everyone who said yes and has no seat yet, following the rules: people who must sit together
 * (an invitation, or a pair you set) go to one table; nobody joins someone they're kept apart from; the
 * wedding party goes to the head table; each group fills tables it already uses before new ones. Seats
 * already given are kept. `notes` says what it couldn't do.
 */
export function autoSeat(people: RulePerson[], tables: RuleTable[], seats: Seats, rules?: SeatRules | null): { seats: Record<string, string | null>; seated: number; left: number; notes: string[] } {
  const pre = presetsOf(rules);
  const next: Record<string, string | null> = {};
  for (const p of people) next[p.id] = seats[p.id] ?? null;
  const coming = people.filter((p) => p.coming);
  const byId = new Map(coming.map((p) => [p.id, p]));
  const tableIds = new Set(tables.map((t) => t.id));
  for (const p of coming) if (next[p.id] && !tableIds.has(next[p.id]!)) next[p.id] = null;
  const occupants = new Map(tables.map((t) => [t.id, new Set<string>()]));
  for (const p of coming) if (next[p.id]) occupants.get(next[p.id]!)!.add(p.id);
  const free = (t: RuleTable) => t.seats - occupants.get(t.id)!.size;

  // Kept apart: never at one table.
  const apart = new Map<string, Set<string>>();
  const addApart = (a: string, b: string) => apart.set(a, (apart.get(a) ?? new Set()).add(b));
  for (const r of rules?.pairs ?? []) {
    if (r.kind !== 'apart' || !byId.has(r.a) || !byId.has(r.b)) continue;
    addApart(r.a, r.b);
    addApart(r.b, r.a);
  }
  const clash = (ids: string[], t: RuleTable) => ids.some((id) => [...(apart.get(id) ?? [])].some((o) => occupants.get(t.id)!.has(o)));

  // Who must sit together: invitations, and pairs set to "with" (unless that joins people kept apart).
  const root = new Map(coming.map((p) => [p.id, p.id]));
  const find = (x: string): string => {
    const up = root.get(x)!;
    if (up === x) return x;
    const top = find(up);
    root.set(x, top);
    return top;
  };
  const members = () => {
    const m = new Map<string, string[]>();
    for (const p of coming) m.set(find(p.id), [...(m.get(find(p.id)) ?? []), p.id]);
    return m;
  };
  const join = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return true;
    const m = members();
    const A = m.get(ra)!;
    const B = m.get(rb)!;
    if (A.some((x) => B.some((y) => apart.get(x)?.has(y)))) return false;
    root.set(ra, rb);
    return true;
  };
  const notes: string[] = [];
  if (pre.invite) {
    const firstOf = new Map<string, string>();
    for (const p of coming) {
      const f = firstOf.get(p.invitationId);
      if (f) join(f, p.id);
      else firstOf.set(p.invitationId, p.id);
    }
  }
  for (const r of rules?.pairs ?? []) {
    if (r.kind !== 'together' || !byId.has(r.a) || !byId.has(r.b)) continue;
    if (!join(r.a, r.b)) notes.push(`${byId.get(r.a)!.name} and ${byId.get(r.b)!.name} are to sit together, but that would put someone with a person they’re kept apart from.`);
  }

  const heads = pre.head ? tables.filter(isHeadTable) : [];
  const groupAt = (t: RuleTable) => new Set([...occupants.get(t.id)!].map((id) => byId.get(id)!.party).filter(Boolean));
  const score = (ids: string[], t: RuleTable) => {
    const ps = ids.map((id) => byId.get(id)!);
    const party = ps.find((p) => p.party)?.party ?? '';
    const used = occupants.get(t.id)!.size;
    let s = 0;
    if (ids.some((id) => [...occupants.get(t.id)!].some((o) => find(o) === find(id)))) s += 1000; // someone they sit with is already here
    if (heads.length) s += heads.some((h) => h.id === t.id) ? (ps.some(inParty) ? 500 : -500) : 0;
    if (pre.groups && party) {
      const g = groupAt(t);
      if (g.has(party)) s += 60;
      else if (g.size) s -= 30;
    } else if (pre.groups && !party && groupAt(t).size) s -= 5;
    if (pre.fill) s += (used ? 10 : 0) - (free(t) - ids.length) * 0.1;
    else s += free(t) * 0.1;
    return s;
  };
  const place = (ids: string[]) => {
    const fits = tables.filter((t) => free(t) >= ids.length && !clash(ids, t));
    if (!fits.length) return false;
    const best = fits.reduce((a, b) => (score(ids, b) > score(ids, a) ? b : a));
    for (const id of ids) {
      next[id] = best.id;
      occupants.get(best.id)!.add(id);
    }
    return true;
  };

  // Biggest and most constrained first: the wedding party, then people joining someone seated, then size.
  const clusters = [...members().values()]
    .map((ids) => ({ ids: ids.filter((id) => !next[id]), all: ids }))
    .filter((c) => c.ids.length)
    .sort((a, b) => {
      const k = (c: { ids: string[]; all: string[] }) =>
        (c.ids.some((id) => inParty(byId.get(id)!)) && heads.length ? 4 : 0) + (c.all.length > c.ids.length ? 2 : 0) + (c.ids.some((id) => apart.has(id)) ? 1 : 0);
      return k(b) - k(a) || b.ids.length - a.ids.length || (byId.get(a.ids[0]!)!.party || '~').localeCompare(byId.get(b.ids[0]!)!.party || '~');
    });
  let seated = 0;
  let left = 0;
  for (const c of clusters) {
    if (place(c.ids)) {
      seated += c.ids.length;
      continue;
    }
    // No table takes them all: by invitation, then one by one, still never beside someone kept apart.
    const ps = c.ids.map((id) => byId.get(id)!);
    const parts = [...new Set(ps.map((p) => p.invitationId))].map((inv) => ps.filter((p) => p.invitationId === inv).map((p) => p.id));
    for (const part of parts) {
      if (parts.length > 1 && place(part)) {
        seated += part.length;
        continue;
      }
      for (const id of part) {
        if (place([id])) seated++;
        else left++;
      }
    }
    if (c.ids.length > 1) notes.push(`No table had ${c.ids.length} seats free, so ${names(ps)} are split up.`);
  }
  if (left) notes.push(`${left} still ${left === 1 ? 'needs' : 'need'} a seat.`);
  return { seats: next, seated, left, notes };
}

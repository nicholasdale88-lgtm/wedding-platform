import { isFamily, isWork, KNOWS_NO_ONE } from './guestTies';
import type { SeatRules } from './planner';
import { circlesOf, DEFAULT_PRESETS, isHeadTable, tableLabel, tableNeighbours, type RulePerson, type RuleTable } from './seatRules';

/**
 * "Suggest a plan from who knows who": a whole new arrangement (never the current plan), worked out from
 * each invitation's circles, relationship and side, for the couple to compare and keep or throw away.
 *
 * - Hard rules always hold: people on one invitation and "with" pairs at one table, nobody beside someone
 *   they're kept apart from, the wedding party at the head table, no table over its seats.
 * - Then people who know each other: the biggest circles first, each at one table, or across neighbouring
 *   tables when it's too big for one. Guests in no circle are grouped by how they know the couple (uni
 *   friends with uni friends, colleagues together) and, unless the sides are to be mixed, by side.
 * - Family takes the tables nearest the head table (immediate family closest).
 * - Sides: mixed at tables, kept together, or no preference.
 *
 * Deterministic: the same guests, tables and rules always give the same plan, whatever order they come in.
 */

export interface SuggestResult {
  seats: Record<string, string | null>;
  seated: number;
  left: number;
  notes: string[];
}

type Unit = { key: string; ids: string[]; size: number; party: boolean; side: string; relation: string; circles: string[]; family: number };
type Group = { key: string; label: string; kind: 'head' | 'family' | 'circle' | 'rel' | 'loose'; units: Unit[]; size: number; family: number };

const lc = (s: string) => s.toLowerCase();
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** How a relationship groups guests who aren't in a circle ('' for not at all). */
function relationGroup(rel: string, colleagues: boolean): string {
  if (isWork(rel)) return colleagues ? 'work' : '';
  if (rel === 'plus_one' || rel === 'other' || !rel) return '';
  return rel;
}
const REL_LABEL: Record<string, string> = {
  family_immediate: 'immediate family',
  family_extended: 'extended family',
  friend_school: 'school friends',
  friend_uni: 'uni friends',
  friend_childhood: 'childhood friends',
  friend_club: 'sport and club friends',
  friend_mutual: 'mutual friends',
  friend: 'friends',
  work: 'colleagues',
  neighbour: 'neighbours',
  wedding_party: 'the wedding party',
};

export function suggestSeating(people: RulePerson[], tablesIn: RuleTable[], rules?: SeatRules | null): SuggestResult {
  const pre = { ...DEFAULT_PRESETS, ...rules?.presets };
  const sides = rules?.sides ?? '';
  const tables = [...tablesIn].sort((a, b) => byText(a.id, b.id));
  const coming = people.filter((p) => p.coming).sort((a, b) => byText(a.invitationId, b.invitationId) || byText(a.id, b.id));
  const byId = new Map(coming.map((p) => [p.id, p]));
  const seats: Record<string, string | null> = {};
  for (const p of people) seats[p.id] = null;
  const notes: string[] = [];
  if (!tables.length) return { seats, seated: 0, left: coming.length, notes: coming.length ? ['Add some tables first.'] : [] };

  // Kept apart: never at one table.
  const apart = new Map<string, Set<string>>();
  const addApart = (a: string, b: string) => apart.set(a, (apart.get(a) ?? new Set()).add(b));
  for (const r of rules?.pairs ?? []) {
    if (r.kind !== 'apart' || !byId.has(r.a) || !byId.has(r.b)) continue;
    addApart(r.a, r.b);
    addApart(r.b, r.a);
  }

  // Who must sit together: an invitation, and "with" pairs (unless that joins people kept apart).
  const root = new Map(coming.map((p) => [p.id, p.id]));
  const find = (x: string): string => {
    const up = root.get(x) ?? x;
    if (up === x) return x;
    const top = find(up);
    root.set(x, top);
    return top;
  };
  const membersOf = () => {
    const m = new Map<string, string[]>();
    for (const p of coming) m.set(find(p.id), [...(m.get(find(p.id)) ?? []), p.id]);
    return m;
  };
  const join = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return true;
    const m = membersOf();
    const A = m.get(ra) ?? [];
    const B = m.get(rb) ?? [];
    if (A.some((x) => B.some((y) => apart.get(x)?.has(y)))) return false;
    if (byText(ra, rb) < 0) root.set(rb, ra);
    else root.set(ra, rb);
    return true;
  };
  if (pre.invite) {
    const firstOf = new Map<string, string>();
    for (const p of coming) {
      const f = firstOf.get(p.invitationId);
      if (f) join(f, p.id);
      else firstOf.set(p.invitationId, p.id);
    }
  }
  const pairs = [...(rules?.pairs ?? [])].sort((x, y) => byText(`${x.a}|${x.b}`, `${y.a}|${y.b}`));
  for (const r of pairs) {
    if (r.kind !== 'together' || !byId.has(r.a) || !byId.has(r.b)) continue;
    if (!join(r.a, r.b)) notes.push(`${byId.get(r.a)!.name} and ${byId.get(r.b)!.name} are to sit together, but that would put someone with a person they’re kept apart from.`);
  }

  const heads = pre.head ? tables.filter(isHeadTable) : [];
  const near = tableNeighbours(tables);
  // Each table's distance from the front: the head table's, or the top of the room, or name order.
  const placed = tables.every((t) => typeof t.x === 'number' && typeof t.y === 'number');
  const anchor = heads.length && placed ? { x: heads.reduce((n, t) => n + (t.x ?? 0), 0) / heads.length, y: heads.reduce((n, t) => n + (t.y ?? 0), 0) / heads.length } : null;
  const order = [...tables].sort((a, b) => {
    if (anchor) return Math.hypot((a.x ?? 0) - anchor.x, (a.y ?? 0) - anchor.y) - Math.hypot((b.x ?? 0) - anchor.x, (b.y ?? 0) - anchor.y) || byText(a.id, b.id);
    if (placed) return Math.round((a.y ?? 0) / 8) - Math.round((b.y ?? 0) / 8) || (a.x ?? 0) - (b.x ?? 0) || byText(a.id, b.id);
    return a.name.localeCompare(b.name, undefined, { numeric: true }) || byText(a.id, b.id);
  });
  const rank = new Map(order.filter((t) => !heads.includes(t)).map((t, i) => [t.id, i]));
  const isHead = (id: string) => heads.some((h) => h.id === id);

  const circlesFor = (p: RulePerson) => (pre.circles ? circlesOf(p, pre.groups) : pre.groups && p.party ? [p.party] : []);
  const units: Unit[] = [...membersOf().values()].map((ids) => {
    const ps = ids.map((id) => byId.get(id)!);
    const sideCount = (s: string) => ps.filter((p) => p.side === s).length;
    const side = sideCount('both') || (sideCount('p1') && sideCount('p2')) ? 'both' : sideCount('p1') ? 'p1' : sideCount('p2') ? 'p2' : '';
    const rels = ps.map((p) => p.relation ?? '').filter(Boolean);
    const relation = rels.sort((a, b) => rels.filter((x) => x === b).length - rels.filter((x) => x === a).length || byText(a, b))[0] ?? '';
    const circles: string[] = [];
    for (const c of ps.flatMap(circlesFor)) if (!circles.some((x) => lc(x) === lc(c))) circles.push(c);
    const family = relation === 'family_immediate' ? 2 : relation === 'family_extended' ? 1 : 0;
    return { key: [...ids].sort(byText)[0]!, ids: [...ids].sort(byText), size: ids.length, party: ps.some((p) => !!p.role?.trim()), side, relation, circles, family };
  });
  units.sort((a, b) => byText(a.key, b.key));

  // How many units are in each circle: each unit sits with its biggest circle.
  const circleSize = new Map<string, number>();
  for (const u of units) for (const c of u.circles) circleSize.set(lc(c), (circleSize.get(lc(c)) ?? 0) + 1);
  const groups = new Map<string, Group>();
  const add = (key: string, label: string, kind: Group['kind'], u: Unit) => {
    const g: Group = groups.get(key) ?? { key, label, kind, units: [], size: 0, family: 0 };
    g.units.push(u);
    g.size += u.size;
    g.family += u.family * u.size;
    groups.set(key, g);
  };
  const sideKey = (u: Unit) => (sides !== 'mix' && (u.side === 'p1' || u.side === 'p2') ? `:${u.side}` : '');
  for (const u of units) {
    if (u.party && heads.length) {
      add('head', 'the wedding party', 'head', u);
      continue;
    }
    const shared = u.circles.filter((c) => (circleSize.get(lc(c)) ?? 0) > 1);
    if (shared.length) {
      const best = [...shared].sort((a, b) => (circleSize.get(lc(b)) ?? 0) - (circleSize.get(lc(a)) ?? 0) || byText(lc(a), lc(b)))[0]!;
      add(`circle:${lc(best)}`, best, 'circle', u);
      continue;
    }
    const rel = relationGroup(u.relation, pre.colleagues);
    if (rel) add(`rel:${rel}${sideKey(u)}`, REL_LABEL[rel] ?? rel, isFamily(rel) && pre.family ? 'family' : 'rel', u);
    else add(`loose${sides === 'keep' ? sideKey(u) : ''}`, 'everyone else', 'loose', u);
  }
  // A circle that's mostly family sits with the family.
  for (const g of groups.values()) if (g.kind === 'circle' && pre.family && g.family / g.size >= 1) g.kind = 'family';
  const kindOrder: Record<Group['kind'], number> = { head: 0, family: 1, circle: 2, rel: 3, loose: 4 };
  const plan = [...groups.values()].sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || (a.kind === 'family' ? b.family / b.size - a.family / a.size : 0) || b.size - a.size || byText(a.key, b.key),
  );

  const occupants = new Map(tables.map((t) => [t.id, [] as string[]]));
  const free = (t: RuleTable) => t.seats - occupants.get(t.id)!.length;
  const clash = (ids: string[], t: RuleTable) => ids.some((id) => occupants.get(t.id)!.some((o) => apart.get(id)?.has(o)));
  const peopleAt = (t: string) => occupants.get(t)!.map((id) => byId.get(id)!);
  const sideOfPerson = (p: RulePerson) => (p.side === 'p1' || p.side === 'p2' ? p.side : '');

  const score = (g: Group, u: Unit, t: RuleTable, used: Set<string>, left: number) => {
    const here = peopleAt(t.id);
    let s = 0;
    if (heads.length) s += isHead(t.id) ? (g.kind === 'head' ? 1000 : -1000) : 0;
    const r = rank.get(t.id) ?? 0;
    if (g.kind === 'loose') {
      s += here.length ? 5 : 0; // never start a table of strangers while there's room elsewhere
    } else if (used.has(t.id)) s += 200;
    else if ([...used].some((x) => near.get(t.id)?.has(x))) s += 80;
    else if (!used.size) {
      // The group's first table: one that takes the whole group, the closest fit when filling tables.
      s += free(t) >= left ? 60 - (pre.fill ? (free(t) - left) * 0.5 : 0) : free(t) * 2;
    }
    if (u.circles.length) {
      const mine = new Set(u.circles.map(lc));
      if (here.some((o) => circlesFor(o).some((c) => mine.has(lc(c))))) s += 40;
    }
    const rel = relationGroup(u.relation, pre.colleagues);
    if (rel && here.some((o) => relationGroup(o.relation ?? '', pre.colleagues) === rel)) s += 10;
    if (sides && (u.side === 'p1' || u.side === 'p2') && here.length) {
      const same = here.filter((o) => sideOfPerson(o) === u.side).length;
      const other = here.filter((o) => sideOfPerson(o) && sideOfPerson(o) !== u.side).length;
      if (sides === 'keep') s += same > other ? 15 : other > same ? -15 : 0;
      else s += other ? 12 : same ? -4 : 0;
    }
    if (pre.fill && here.length) s += 5;
    s -= r * (g.kind === 'family' ? 6 : g.kind === 'head' ? 6 : 0.5);
    return s;
  };
  const best = (g: Group, u: Unit, ids: string[], used: Set<string>, left: number) => {
    let pick: RuleTable | null = null;
    let top = -Infinity;
    for (const t of order) {
      if (free(t) < ids.length || clash(ids, t)) continue;
      const s = score(g, u, t, used, left);
      if (s > top) {
        top = s;
        pick = t;
      }
    }
    return pick;
  };
  const sit = (ids: string[], t: RuleTable, used: Set<string>) => {
    for (const id of ids) {
      seats[id] = t.id;
      occupants.get(t.id)!.push(id);
    }
    used.add(t.id);
  };

  let seated = 0;
  let left = 0;
  const spread: string[] = [];
  for (const g of plan) {
    const used = new Set<string>();
    let remaining = g.size;
    let us = [...g.units].sort((a, b) => b.size - a.size || b.family - a.family || byText(a.key, b.key));
    if (sides === 'mix') {
      // Mixing the sides: take one from each side in turn, so every table gets some of both.
      const of = (k: string) => us.filter((u) => (u.side === 'p1' || u.side === 'p2' ? u.side : '') === k);
      const a = of('p1');
      const b = of('p2');
      const mixed: Unit[] = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i];
        const y = b[i];
        if (x) mixed.push(x);
        if (y) mixed.push(y);
      }
      us = [...mixed, ...of('')];
    }
    for (const u of us) {
      const t = best(g, u, u.ids, used, remaining);
      remaining -= u.size;
      if (t) {
        sit(u.ids, t, used);
        seated += u.size;
        continue;
      }
      // No table takes them all: by invitation, then one by one, still never beside someone kept apart.
      const ps = u.ids.map((id) => byId.get(id)!);
      const parts = [...new Set(ps.map((p) => p.invitationId))].map((inv) => ps.filter((p) => p.invitationId === inv).map((p) => p.id));
      for (const part of parts) {
        const whole = parts.length > 1 ? best(g, u, part, used, part.length) : null;
        if (whole) {
          sit(part, whole, used);
          seated += part.length;
          continue;
        }
        for (const id of part) {
          const one = best(g, u, [id], used, 1);
          if (one) {
            sit([id], one, used);
            seated++;
          } else left++;
        }
      }
      if (u.size > 1) notes.push(`No table had ${u.size} seats free, so ${ps.map((p) => p.name.split(' ')[0]).join(', ')} are split up.`);
    }
    if (g.kind === 'circle' || g.kind === 'family') {
      const ts = [...used];
      const joined = ts.every((a) => ts.length === 1 || ts.some((b) => b !== a && near.get(a)?.has(b)));
      if (!joined) spread.push(`${g.label} (${ts.map((x) => tableLabel(tables.find((t) => t.id === x))).join(', ')})`);
    }
  }
  if (spread.length) notes.push(`Too big to keep beside each other: ${spread.join('; ')}.`);
  if (left) notes.push(`${left} still ${left === 1 ? 'needs' : 'need'} a seat: add a table or more seats.`);
  return { seats, seated, left, notes };
}

export interface PlanSummary {
  /** Circles with two or more people seated, and how many of them sit at one table or neighbouring tables. */
  circles: number;
  together: number;
  /** People at a table with nobody from their invitation or circles. */
  alone: number;
  seated: number;
}

/** How well a plan keeps people who know each other together (for comparing two plans). */
export function planSummary(people: RulePerson[], tables: RuleTable[], seats: Record<string, string | null | undefined>, rules?: SeatRules | null): PlanSummary {
  const pre = { ...DEFAULT_PRESETS, ...rules?.presets };
  const ids = new Set(tables.map((t) => t.id));
  const near = tableNeighbours(tables);
  const at = (id: string) => {
    const t = seats[id];
    return t && ids.has(t) ? t : null;
  };
  const seatedPeople = people.filter((p) => p.coming && at(p.id));
  const circles = new Map<string, Set<string>>(); // circle -> tables
  const members = new Map<string, number>();
  for (const p of seatedPeople)
    for (const c of circlesOf(p, pre.groups)) {
      const k = lc(c);
      circles.set(k, (circles.get(k) ?? new Set()).add(at(p.id)!));
      members.set(k, (members.get(k) ?? 0) + 1);
    }
  let total = 0;
  let together = 0;
  for (const [k, ts] of circles) {
    if ((members.get(k) ?? 0) < 2) continue;
    total++;
    // Joined up: every table reachable from the first through neighbouring tables of the circle.
    const list = [...ts];
    const seen = new Set([list[0]!]);
    const todo = [list[0]!];
    while (todo.length) {
      const x = todo.pop()!;
      for (const y of list) {
        if (seen.has(y) || !near.get(x)?.has(y)) continue;
        seen.add(y);
        todo.push(y);
      }
    }
    if (seen.size === list.length) together++;
  }
  const byTable = new Map<string, RulePerson[]>();
  for (const p of seatedPeople) byTable.set(at(p.id)!, [...(byTable.get(at(p.id)!) ?? []), p]);
  let alone = 0;
  for (const p of seatedPeople) {
    const mine = new Set(circlesOf(p, pre.groups).map(lc));
    const others = (byTable.get(at(p.id)!) ?? []).filter((o) => o.id !== p.id);
    if (!others.some((o) => o.invitationId === p.invitationId || circlesOf(o, pre.groups).some((c) => mine.has(lc(c))))) alone++;
  }
  return { circles: total, together, alone, seated: seatedPeople.length };
}

/** "Keeps 18 of 20 circles together (now 12) · 3 people alone at their table → 0". */
export function compareLine(now: PlanSummary, next: PlanSummary): string {
  const bits: string[] = [];
  if (next.circles) bits.push(`Keeps ${next.together} of ${next.circles} ${next.circles === 1 ? 'circle' : 'circles'} together (now ${now.together})`);
  bits.push(`${now.alone} ${now.alone === 1 ? 'person' : 'people'} alone at their table → ${next.alone}`);
  if (next.seated !== now.seated) bits.push(`${next.seated} seated (now ${now.seated})`);
  return bits.join(' · ');
}

/** The new version's name: "Who knows who — Sat 9 Nov". */
export function suggestName(date: Date, timeZone = 'Australia/Sydney'): string {
  let day = '';
  try {
    day = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(date).replace(/,/g, '');
  } catch {
    day = date.toISOString().slice(0, 10);
  }
  return `Who knows who — ${day}`;
}

/** Someone who knows nobody else at the wedding isn't counted as a circle of their own. */
export const knowsNoOne = (p: Pick<RulePerson, 'circles'>) => (p.circles ?? []).includes(KNOWS_NO_ONE);

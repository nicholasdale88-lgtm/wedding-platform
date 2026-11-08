/**
 * Who each invitation is to the couple, for seating: whose side they're on (the first partner's, the
 * second's, or both), how they know the couple (family, a uni friend, an ex-work colleague…), and their
 * circles: short tags for who knows who ("Uni crew", "Acme work", "Netball"). Set on each guest, in bulk
 * from the guest list, or from a spreadsheet; the seating rules and "Suggest a plan from who knows who" use them.
 */

export const GUEST_SIDES = ['', 'p1', 'p2', 'both'] as const;
export type GuestSide = (typeof GUEST_SIDES)[number];

export const RELATIONS = [
  { key: 'family_immediate', label: 'Immediate family', kind: 'Family' },
  { key: 'family_extended', label: 'Extended family', kind: 'Family' },
  { key: 'friend_school', label: 'School friend', kind: 'Friend' },
  { key: 'friend_uni', label: 'Uni friend', kind: 'Friend' },
  { key: 'friend_childhood', label: 'Childhood friend', kind: 'Friend' },
  { key: 'friend_club', label: 'Sport or club friend', kind: 'Friend' },
  { key: 'friend_mutual', label: 'Mutual friend', kind: 'Friend' },
  { key: 'friend', label: 'Friend', kind: 'Friend' },
  { key: 'work', label: 'Work colleague', kind: 'Work' },
  { key: 'ex_work', label: 'Ex-work colleague', kind: 'Work' },
  { key: 'neighbour', label: 'Neighbour', kind: 'Other' },
  { key: 'plus_one', label: 'Plus-one', kind: 'Other' },
  { key: 'wedding_party', label: 'Wedding party', kind: 'Other' },
  { key: 'other', label: 'Other', kind: 'Other' },
] as const;
export type Relation = (typeof RELATIONS)[number]['key'];
export const RELATION_KEYS = RELATIONS.map((r) => r.key) as [Relation, ...Relation[]];
export const relationLabel = (key: string) => RELATIONS.find((r) => r.key === key)?.label ?? '';
export const isFamily = (key: string | undefined) => key === 'family_immediate' || key === 'family_extended';
export const isWork = (key: string | undefined) => key === 'work' || key === 'ex_work';

/** Someone who doesn't know anyone else at the wedding (from the seating screen's quick pairing). */
export const KNOWS_NO_ONE = 'Knows no one';
export const MAX_CIRCLES = 8;
export const MAX_CIRCLE_LEN = 40;

/** One circle's name, tidied: no commas (they separate circles), single spaces, 40 characters at most. */
export const cleanCircle = (s: string) => s.replace(/[,;|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CIRCLE_LEN).trim();

/** Tidied circles, each once (whatever its capitals), at most 8. */
export function cleanCircles(list: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const c = cleanCircle(raw);
    if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
  }
  return out.slice(0, MAX_CIRCLES);
}

/** Stored as one line: "Uni crew,Acme work". */
export const joinCircles = (list: readonly string[]) => cleanCircles(list).join(',');
export const splitCircles = (s: string | null | undefined) => cleanCircles((s ?? '').split(','));
/** A cell from a spreadsheet: circles separated by commas, semicolons or slashes. */
export const parseCircles = (s: string | null | undefined) => cleanCircles((s ?? '').split(/[,;/|]/));

/** Circles used across the guest list, most used first (for suggestions as you type). */
export function circleSuggestions(all: readonly (readonly string[])[]): string[] {
  const count = new Map<string, { name: string; n: number }>();
  for (const list of all)
    for (const c of list) {
      const k = c.toLowerCase();
      const cur = count.get(k);
      count.set(k, { name: cur?.name ?? c, n: (cur?.n ?? 0) + 1 });
    }
  return [...count.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((x) => x.name);
}

const first = (s: string) => s.trim().split(/\s+/)[0] ?? '';

/**
 * What each side is called: "Alex’s side", with the wedding party's name for the side when it's been
 * changed from the usual ("Alex’s side · Bride").
 */
export function sideLabels(names: { name1: string; name2: string }, party?: { p1?: string; p2?: string }): Record<GuestSide, string> {
  const a = first(names.name1) || 'Partner one';
  const b = first(names.name2) || 'Partner two';
  const extra = (x: string | undefined) => (x?.trim() ? ` · ${x.trim()}` : '');
  return { '': 'Not set', p1: `${a}’s side${extra(party?.p1)}`, p2: `${b}’s side${extra(party?.p2)}`, both: 'Both sides' };
}
/** The short form for chips: "Alex’s", "Sam’s", "Both". */
export function sideShort(side: string, names: { name1: string; name2: string }): string {
  if (side === 'p1') return `${first(names.name1) || 'Partner one'}’s side`;
  if (side === 'p2') return `${first(names.name2) || 'Partner two'}’s side`;
  return side === 'both' ? 'Both sides' : '';
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** A spreadsheet's "Side" cell: a partner's name, the wedding party's name for the side (Bride, Groom), or "both". */
export function parseSide(raw: string | null | undefined, names: { name1: string; name2: string }, party?: { p1?: string; p2?: string }): GuestSide | null {
  const x = norm(raw ?? '');
  if (!x) return '';
  if (/^(both|mutual|shared|joint|either|both sides|ours|us|couple)$/.test(x)) return 'both';
  if (/^(p1|1|partner 1|partner one|a)$/.test(x)) return 'p1';
  if (/^(p2|2|partner 2|partner two|b)$/.test(x)) return 'p2';
  const words = new Set(x.split(' '));
  const n1 = norm(first(names.name1));
  const n2 = norm(first(names.name2));
  const has = (n: string) => !!n && (words.has(n) || words.has(`${n}s`));
  if (has(n1) && !has(n2)) return 'p1';
  if (has(n2) && !has(n1)) return 'p2';
  if (n1 && n2 && has(n1) && has(n2)) return 'both';
  // The wedding party's names for the sides (longest first, so "Bride 2" isn't read as "Bride").
  const labels = [
    { side: 'p1' as const, l: norm(party?.p1 ?? 'Bride') },
    { side: 'p2' as const, l: norm(party?.p2 ?? 'Groom') },
  ]
    .filter((s) => s.l)
    .sort((a, b) => b.l.length - a.l.length);
  for (const s of labels) if (x === s.l || x.startsWith(`${s.l} `) || x.includes(` ${s.l}`) || x.startsWith(`${s.l}s`)) return s.side;
  if (/\bbride/.test(x) && !/\bgroom/.test(x)) return 'p1';
  if (/\bgroom/.test(x) && !/\bbride/.test(x)) return 'p2';
  return null;
}

const RELATION_WORDS: [RegExp, Relation][] = [
  [/\b(ex|former|old|previous) ?(work|colleague|job|coworker|co worker)/, 'ex_work'],
  [/\b(work|colleague|coworker|co worker|office|boss|team ?mate at work|job)\b/, 'work'],
  [/\b(immediate|parent|parents|mum|mom|dad|mother|father|brother|sister|sibling|siblings|son|daughter|grandparent|grandparents|nan|nanna|grandma|grandpa|step)/, 'family_immediate'],
  [/\b(extended|cousin|cousins|aunt|aunty|auntie|uncle|niece|nephew|in law|in laws|relative|relatives|family)\b/, 'family_extended'],
  [/\b(uni|university|college)\b/, 'friend_uni'],
  [/\b(school|high school|primary)\b/, 'friend_school'],
  [/\b(childhood|grew up|kindy)\b/, 'friend_childhood'],
  [/\b(sport|club|team|footy|netball|soccer|cricket|gym|church|choir|band)\b/, 'friend_club'],
  [/\b(mutual|our friend|both)\b/, 'friend_mutual'],
  [/\b(neighbour|neighbor|neighbours|neighbors)\b/, 'neighbour'],
  [/\b(plus ?one|plus 1|\+1|date|partner of)\b/, 'plus_one'],
  [/\b(wedding party|bridal party|bridesmaid|groomsman|groomsmen|best man|maid of honour|flower girl|page boy)\b/, 'wedding_party'],
  [/\b(friend|friends|mate|mates)\b/, 'friend'],
];

/** A spreadsheet's "Relationship" cell, in the couple's own words: "Cousin" is extended family, "Old work" an ex-work colleague. */
export function parseRelation(raw: string | null | undefined): Relation | '' {
  const x = norm(raw ?? '');
  if (!x) return '';
  const exact = RELATIONS.find((r) => norm(r.label) === x || r.key === x.replace(/ /g, '_'));
  if (exact) return exact.key;
  for (const [re, key] of RELATION_WORDS) if (re.test(x)) return key;
  return 'other';
}

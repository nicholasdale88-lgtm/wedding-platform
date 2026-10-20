/** Dietary rules shared by the seed, the admin API and exports. */

/** Allergy, anaphylaxis or coeliac: flagged as "Serious" everywhere (design: severe()). */
export const isSerious = (diet: string | null | undefined): boolean => /allerg|anaphyl|coeliac|celiac|severe/i.test(diet ?? '');

const firstName = (s: string) => s.trim().split(/\s+/)[0] ?? s;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Which person a dietary note belongs to: the first person it names, otherwise the main contact (0).
 * Returns -1 for an empty note.
 */
export function attachDiet(diet: string, people: string[]): number {
  if (!diet.trim()) return -1;
  const i = people.findIndex((p) => new RegExp(`\\b${escape(firstName(p))}\\b`, 'i').test(diet));
  return i >= 0 ? i : 0;
}

/** The kitchen's headings for a dietary note (a note can be in more than one). */
const CATEGORIES: [string, RegExp][] = [
  ['Vegan', /\bvegan|plant.?based/i],
  ['Vegetarian', /vegetarian|\bveg\b|no meat/i],
  ['Gluten free', /gluten|coeliac|celiac|\bgf\b/i],
  ['Dairy free', /dairy|lactose|\bdf\b/i],
  ['Nut allergy', /\bnuts?\b|peanut|tree.?nut/i],
  ['Seafood', /seafood|shellfish|prawn|crustacean|\bfish\b/i],
  ['Egg', /\beggs?\b/i],
  ['Halal or kosher', /halal|kosher/i],
  ['Pregnant', /pregnan/i],
];
/**
 * The needs in a note that a menu can be safe for (the kitchen's headings, without "Other" or "Pregnant").
 * Used both ways: what a guest needs, and what a menu is marked as suiting.
 */
export function dietNeeds(text: string | null | undefined): string[] {
  return dietCategories(text).filter((c) => c !== 'Other' && c !== 'Pregnant');
}
/** A vegan dish is also vegetarian, dairy free and egg free. */
const IMPLIES: Record<string, string[]> = { Vegan: ['Vegetarian', 'Dairy free', 'Egg'] };
/** What a menu marked with these words is safe for, including what that implies. */
export function safeFor(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const n of dietNeeds(text)) {
    out.add(n);
    for (const x of IMPLIES[n] ?? []) out.add(x);
  }
  return out;
}

export function dietCategories(diet: string | null | undefined): string[] {
  const d = (diet ?? '').trim();
  if (!d) return [];
  const hit = CATEGORIES.filter(([, re]) => re.test(d)).map(([name]) => name);
  return hit.length ? hit : ['Other'];
}

/**
 * One dietary note for a whole invitation, split per person: "Margaret vegetarian, Peter coeliac"
 * gives Margaret "Vegetarian" and Peter "Coeliac". A part naming nobody belongs to the person
 * named just before it, or to the main contact. Returns one note per person ('' for none).
 */
export function splitDiet(diet: string, people: string[]): string[] {
  const out = people.map(() => [] as string[]);
  const text = diet.trim();
  if (!text || !people.length) return out.map(() => '');
  const firsts = people.map((p) => escape(firstName(p)));
  const anyName = new RegExp(String.raw`\b(${firsts.join('|')})\b`, 'gi');
  const who = (name: string) => people.findIndex((p) => firstName(p).toLowerCase() === name.toLowerCase());
  const tidy = (s: string, name?: string) => {
    let t = s.trim();
    if (name) t = t.replace(new RegExp(String.raw`^${escape(name)}('s)?\s*(?:[:\-–—]|\bis\b|\bhas\b|\bneeds\b)?\s*`, 'i'), '');
    t = t.replace(/^[\s,;:&-]+|[\s,;:&-]+$/g, '').replace(/\s+and$/i, '').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  };
  let current = 0;
  for (const clause of text.split(/[;\n]+|\.\s+/)) {
    const hits = [...clause.matchAll(anyName)];
    if (!hits.length) {
      const t = tidy(clause);
      if (t) out[current]!.push(t);
      continue;
    }
    // Text before the first name belongs to whoever we were on.
    const lead = tidy(clause.slice(0, hits[0]!.index));
    if (lead) out[current]!.push(lead);
    hits.forEach((h, i) => {
      const found = who(h[1]!);
      if (found >= 0) current = found;
      const part = tidy(clause.slice(h.index, hits[i + 1]?.index ?? clause.length), h[1]);
      if (part) out[current]!.push(part);
    });
  }
  return out.map((parts) => parts.join('; '));
}

/** The invitation's notes as one line again, names first when it's for more than one person (splitDiet reads it back). */
export const joinDiet = (people: { name: string; diet: string }[]): string =>
  people
    .filter((p) => p.diet.trim())
    .map((p) => (people.length > 1 ? `${firstName(p.name)}: ${p.diet.trim()}` : p.diet.trim()))
    .join('; ');

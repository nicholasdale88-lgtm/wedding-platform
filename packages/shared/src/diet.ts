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
  ['Vegan', /\bvegan/i],
  ['Vegetarian', /vegetarian|\bveg\b|no meat/i],
  ['Gluten free', /gluten|coeliac|celiac|\bgf\b/i],
  ['Dairy free', /dairy|lactose|\bdf\b/i],
  ['Nut allergy', /\bnuts?\b|peanut|tree.?nut/i],
  ['Seafood', /seafood|shellfish|prawn|crustacean|\bfish\b/i],
  ['Egg', /\beggs?\b/i],
  ['Halal or kosher', /halal|kosher/i],
  ['Pregnant', /pregnan/i],
];
export function dietCategories(diet: string | null | undefined): string[] {
  const d = (diet ?? '').trim();
  if (!d) return [];
  const hit = CATEGORIES.filter(([, re]) => re.test(d)).map(([name]) => name);
  return hit.length ? hit : ['Other'];
}

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

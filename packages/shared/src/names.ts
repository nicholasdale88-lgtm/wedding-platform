/**
 * Guests' names: each person's name is kept whole ("Emma Smith"), and split here into first and last names
 * when it helps: editing them as two boxes, and saying a household's shared last name once
 * ("Emma & Tom Smith", not "Emma Smith and Tom Smith").
 * A last name starting with a particle stays whole ("Anna van der Berg" → last "van der Berg").
 */
const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'da', 'di', 'du', 'dos', 'das', 'le', 'la', 'st', 'st.', 'bin', 'binti', 'al', 'el', 'ter', 'ten']);

/** "Anna van der Berg" → { first: 'Anna', last: 'van der Berg' }; a single word is a first name. */
export function splitName(full: string): { first: string; last: string } {
  const w = full.trim().split(/\s+/).filter(Boolean);
  if (w.length < 2) return { first: w[0] ?? '', last: '' };
  let i = w.length - 1;
  // Take in any particles just before the last word (and never the first name itself).
  while (i - 1 >= 1 && PARTICLES.has(w[i - 1]!.toLowerCase())) i--;
  return { first: w.slice(0, i).join(' '), last: w.slice(i).join(' ') };
}

export const joinName = (first: string, last: string) => [first.trim(), last.trim()].filter(Boolean).join(' ');

/** The last name every named person shares (compared without case), or '' when they don't, or there's one person. */
export function sharedLast(names: string[]): string {
  const named = names.map((n) => n.trim()).filter(Boolean);
  if (named.length < 2) return '';
  const lasts = named.map((n) => splitName(n).last);
  const first = lasts[0]!;
  return first && lasts.every((l) => l.toLowerCase() === first.toLowerCase()) ? first : '';
}

/** "Emma, Tom & Lily" */
export const andNames = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`);

/**
 * A household's names, the shared last name said once: "Emma & Tom Smith"; different last names in full:
 * "Abby Garcia & Caleb Shepherd".
 */
export function householdName(names: string[]): string {
  const named = names.map((n) => n.trim()).filter(Boolean);
  const last = sharedLast(named);
  if (!last) return andNames(named);
  return `${andNames(named.map((n) => splitName(n).first || n))} ${last}`;
}

/** The others on an invitation, after the main contact: their first names only when they share the main contact's last name. */
export function othersNames(names: string[]): string[] {
  const named = names.map((n) => n.trim()).filter(Boolean);
  const mainLast = splitName(named[0] ?? '').last.toLowerCase();
  return named.slice(1).map((n) => {
    const s = splitName(n);
    return mainLast && s.last.toLowerCase() === mainLast ? s.first : n;
  });
}

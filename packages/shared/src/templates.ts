/** SMS template placeholders (docs/05, docs/13). Unknown placeholders block saving. */

export const PLACEHOLDERS = [
  'first', 'link', 'guide', 'photos', 'pending', 'couple', 'partner1', 'partner2', 'event', 'date', 'venue', 'table',
  'arrive_by',
] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

/** Any `{guideXYZ}` placeholder links to that event's night-before guide (e.g. `{guide30}`). */
const PATTERN = /\{([a-z0-9_]+)\}/gi;

export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(PLACEHOLDERS);
  const out = new Set<string>();
  for (const [, name] of template.matchAll(PATTERN)) {
    if (!known.has(name!) && !/^guide[a-z0-9_]+$/i.test(name!)) out.add(name!);
  }
  return [...out];
}

/** "Margaret", "Margaret and Peter", "Ben, Archie and Lily". */
export function joinFirstNames(names: string[]): string {
  const firsts = names.map((n) => n.trim().split(/\s+/)[0] ?? '').filter(Boolean);
  if (firsts.length === 0) return 'there';
  if (firsts.length === 1) return firsts[0]!;
  return `${firsts.slice(0, -1).join(', ')} and ${firsts[firsts.length - 1]}`;
}

/** Fill placeholders. Values missing from `vars` are left as-is so tests catch them. */
export function render(template: string, vars: Partial<Record<string, string>>): string {
  return template.replace(PATTERN, (whole, name: string) => vars[name] ?? whole);
}

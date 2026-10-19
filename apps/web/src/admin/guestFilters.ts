import { isSerious } from '@wp/shared';
import type { EventInfo, Guest } from '../lib/api';
import { shortLabel } from '../lib/format';

/** Guests tab filters (design FL + GF, CHANGES 0s). Pure, so they're unit-tested and shared by list and counts. */

export const isAwaiting = (g: Guest) => g.invited.some((k) => (g.rsvp[k]?.attending ?? null) === null);
export const attends = (g: Guest, key: string) => g.invited.includes(key) && g.rsvp[key]?.attending === true;
export const declinedAll = (g: Guest) => g.invited.length > 0 && g.invited.every((k) => g.rsvp[k]?.attending === false);
const dietText = (g: Guest) => g.people.map((p) => p.diet.trim()).filter(Boolean).join('; ');
const seated = (g: Guest) => g.people.some((p) => p.table);

export interface QuickFilter {
  key: string;
  label: string;
  test: (g: Guest) => boolean;
}

/** All · Awaiting · <Event>: attending · Declined · <yes answers> · Not invited yet */
export function quickFilters(events: EventInfo[]): QuickFilter[] {
  const yesAnswers = events.flatMap((e) =>
    e.questions
      .filter((q) => q.type === 'choice' && q.options?.some((o) => /^yes/i.test(o)))
      .map((q) => {
        const yes = q.options!.find((o) => /^yes/i.test(o))!;
        return { key: `answer:${e.key}:${q.key}`, label: answerLabel(q.key), test: (g: Guest) => attends(g, e.key) && g.rsvp[e.key]?.answers[q.key] === yes };
      }),
  );
  return [
    { key: 'all', label: 'All', test: () => true },
    { key: 'awaiting', label: 'Awaiting', test: isAwaiting },
    ...events.map((e) => ({ key: `attending:${e.key}`, label: `${shortLabel(e.name)}: attending`, test: (g: Guest) => attends(g, e.key) })),
    { key: 'declined', label: 'Declined', test: declinedAll },
    ...yesAnswers,
    { key: 'noinv', label: 'Not invited yet', test: (g: Guest) => !g.lastSms },
  ];
}

/** "ride" -> "Riding"; other question keys capitalised. */
export const answerLabel = (key: string) => (key === 'ride' ? 'Riding' : key.charAt(0).toUpperCase() + key.slice(1));
/** Short form of a choice answer for the table: "Yes, I will ride" -> "Riding" style. */
export function shortAnswer(v: string | undefined): string {
  if (!v) return '–';
  if (/^yes/i.test(v)) return 'Yes';
  if (/not sure/i.test(v)) return 'Not sure';
  if (/^no/i.test(v)) return 'No';
  return v;
}

export interface Dropdown {
  key: string;
  label: string;
  options: [string, string][];
  test?: (g: Guest, v: string) => boolean;
}

export function dropdowns(events: EventInfo[]): Dropdown[] {
  const keys = events.map((e) => e.key);
  return [
    {
      key: 'inv', label: 'Invited to',
      options: [['', 'Any event'], ...events.map((e) => [e.key, `${shortLabel(e.name)} only`] as [string, string]), ...(events.length > 1 ? [['all', events.length === 2 ? 'Both' : 'All events'] as [string, string]] : [])],
      test: (g, v) => (v === 'all' ? keys.every((k) => g.invited.includes(k)) : g.invited.length === 1 && g.invited[0] === v),
    },
    {
      key: 'diet', label: 'Dietary',
      options: [['', 'Any'], ['has', 'Has dietary needs'], ['serious', 'Serious allergy'], ['none', 'Set menu']],
      test: (g, v) => (v === 'has' ? !!dietText(g) : v === 'serious' ? g.people.some((p) => isSerious(p.diet)) : !dietText(g)),
    },
    { key: 'seat', label: 'Seating', options: [['', 'Any'], ['yes', 'Seated'], ['no', 'Not seated']], test: (g, v) => (v === 'yes' ? seated(g) : !seated(g)) },
    { key: 'mob', label: 'Mobile', options: [['', 'Any'], ['has', 'Has mobile'], ['none', 'No mobile']], test: (g, v) => (v === 'has' ? !!g.phone : !g.phone) },
    {
      key: 'size', label: 'Invitation', options: [['', 'Any size'], ['1', 'Just one'], ['2', 'Couples'], ['3', '3 or more']],
      test: (g, v) => (v === '3' ? g.people.length >= 3 : g.people.length === Number(v)),
    },
    { key: 'sort', label: 'Sort', options: [['', 'A to Z'], ['za', 'Z to A'], ['recent', 'Latest reply'], ['table', 'By table']] },
  ];
}

export interface FilterState {
  filter: string;
  q: string;
  [dropdown: string]: string;
}

const name = (g: Guest) => g.people[0]?.name ?? '';
const tableNo = (g: Guest) => parseInt(g.people.find((p) => p.table)?.table ?? '', 10) || 999;

export function applyFilters(guests: Guest[], events: EventInfo[], s: FilterState): Guest[] {
  const quick = quickFilters(events).find((f) => f.key === s.filter) ?? quickFilters(events)[0]!;
  const q = s.q.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const out = guests
    .filter(quick.test)
    .filter((g) => dropdowns(events).every((d) => !d.test || !s[d.key] || d.test(g, s[d.key]!)))
    .filter((g) => {
      if (!q) return true;
      const names = g.people.map((p) => p.name).join(' ').toLowerCase();
      const phones = `${g.phone ?? ''} ${g.phoneDisplay.replace(/\s/g, '')}`;
      return names.includes(q) || (digits.length >= 3 && /^[\d\s+]+$/.test(q) && phones.includes(digits.replace(/^0/, '')));
    });
  const sort = s.sort ?? '';
  return out.sort((a, b) =>
    sort === 'za' ? name(b).localeCompare(name(a))
    : sort === 'recent' ? (b.repliedAt ?? '').localeCompare(a.repliedAt ?? '')
    : sort === 'table' ? tableNo(a) - tableNo(b) || name(a).localeCompare(name(b))
    : name(a).localeCompare(name(b)),
  );
}

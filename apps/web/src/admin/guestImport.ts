import { isSerious } from '@wp/shared';
import type { EventInfo, Guest } from '../lib/api';
import { shortLabel } from '../lib/format';
import type { Sheet } from '../lib/xlsx';

/**
 * Spreadsheet ↔ guest list. Import reads whatever columns a couple's spreadsheet has: names
 * (one column, or one per person), mobile, seats, group, and a yes/no column per event.
 * Export writes everything the couple, venue and caterer need, in Excel.
 */

export interface ImportRow {
  people: string[];
  phone?: string;
  seats?: number;
  party?: string;
  invited?: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Any of these in an event column means "invited to it" (our own export writes Coming / Awaiting / Declined).
const YES = /^(y|yes|true|1|x|✓|invited|coming|awaiting|declined)$/i;

/** Which column is which, from the header row. */
export function mapColumns(header: string[], events: EventInfo[]) {
  const h = header.map(norm);
  const main = h.findIndex((x) => /^(name|names|guest|guests|main contact|full name|guest name|invitation)$/.test(x));
  const extra = h.map((x, i) => (i !== main && /^(guest ?\d+|partner|plus ?one|name ?\d+|person ?\d+|other guests?|others|partners?)$/.test(x) ? i : -1)).filter((i) => i >= 0);
  const phone = h.findIndex((x) => /mobile|phone|cell|number/.test(x) && !/seat|guests/.test(x));
  const seats = h.findIndex((x) => /^(seats?|seats held|party size|count|number of guests|guests count)$/.test(x));
  const party = h.findIndex((x) => /^(group|side|party|guest group|category|relationship)$/.test(x));
  const eventCols = events
    .map((e) => ({ key: e.key, i: h.findIndex((x) => x === norm(e.name) || x === norm(e.key) || x === norm(shortLabel(e.name))) }))
    .filter((e) => e.i >= 0);
  return { main: main >= 0 ? main : 0, extra, phone, seats, party, eventCols };
}

/** Excel stores mobiles as numbers and drops the leading 0 (412345678): put it back. */
const fixPhone = (p: string) => (/^4\d{8}$/.test(p.replace(/\s/g, '')) ? `0${p.replace(/\s/g, '')}` : p);

export function toImportRows(table: string[][], events: EventInfo[]): { rows: ImportRow[]; columns: ReturnType<typeof mapColumns> } {
  const [header = [], ...body] = table;
  const columns = mapColumns(header, events);
  const rows = body.map((r) => {
    const names = (r[columns.main] ?? '').split(/\s*(?:&|\band\b|;|\+)\s*/i);
    const people = [...names, ...columns.extra.flatMap((i) => (r[i] ?? '').split(/\s*(?:&|;)\s*/))].map((s) => s.trim()).filter(Boolean);
    const row: ImportRow = { people };
    if (columns.phone >= 0 && r[columns.phone]) row.phone = fixPhone(r[columns.phone]!);
    const seats = columns.seats >= 0 ? Number.parseInt(r[columns.seats] ?? '', 10) : NaN;
    if (Number.isFinite(seats) && seats > 0) row.seats = seats;
    if (columns.party >= 0 && r[columns.party]?.trim()) row.party = r[columns.party]!.trim();
    if (columns.eventCols.length) row.invited = columns.eventCols.filter((e) => YES.test((r[e.i] ?? '').trim())).map((e) => e.key);
    return row;
  });
  return { rows: rows.filter((r) => r.people.length || r.phone), columns };
}

const replyOf = (g: Guest, e: EventInfo) => {
  if (!g.invited.includes(e.key)) return 'Not invited';
  const a = g.rsvp[e.key]?.attending;
  return a === true ? 'Coming' : a === false ? 'Declined' : 'Awaiting';
};

/** The full workbook: one sheet per invitation, one per person, and a summary per event. */
export function exportSheets(guests: Guest[], events: EventInfo[], links: Record<string, string> = {}): Sheet[] {
  const questions = events.flatMap((e) => e.questions.map((q) => ({ e, q })));
  const invitations: Sheet = {
    name: 'Invitations',
    rows: [
      [
        'Main contact', 'Others', 'Mobile', 'Group', 'Seats held',
        ...events.flatMap((e) => [shortLabel(e.name), `${shortLabel(e.name)}: coming`]),
        ...questions.map(({ e, q }) => `${shortLabel(e.name)}: ${q.label}`),
        'Dietary', 'Message', 'Table', 'Replied', 'Opened invitation', 'Texts allowed', 'Last text', 'Personal link',
      ],
      ...guests.map((g) => [
        g.people[0]?.name ?? '',
        g.people.slice(1).map((p) => p.name).join(' & '),
        g.phoneDisplay,
        g.party,
        g.seatsHeld,
        ...events.flatMap((e) => [replyOf(g, e), g.rsvp[e.key]?.attending ? g.rsvp[e.key]!.count : '']),
        ...questions.map(({ e, q }) => g.rsvp[e.key]?.answers[q.key] ?? ''),
        g.people.filter((p) => p.diet.trim()).map((p) => (g.people.length > 1 ? `${p.name.split(' ')[0]}: ${p.diet.trim()}` : p.diet.trim())).join('; '),
        Object.values(g.rsvp).map((r) => r.message.trim()).find(Boolean) ?? '',
        [...new Set(g.people.map((p) => p.table).filter(Boolean))].join(' & '),
        g.repliedAt ? g.repliedAt.slice(0, 10) : '',
        g.openedAt ? 'Yes' : '',
        !g.phone ? 'No mobile' : g.optOut ? 'Replied STOP' : 'Yes',
        g.lastSms ? `${g.lastSms.name} (${g.lastSms.status})` : '',
        links[g.id] ?? '',
      ]),
    ],
  };
  const people: Sheet = {
    name: 'People',
    rows: [
      ['Name', 'Invitation (main contact)', 'Group', ...events.map((e) => shortLabel(e.name)), 'Table', 'Dietary', 'Serious allergy', 'Entrée', 'Main', 'Dessert'],
      ...guests.flatMap((g) =>
        g.people.map((p) => [
          p.name, g.people[0]?.name ?? '', g.party, ...events.map((e) => replyOf(g, e)), p.table ?? '', p.diet, isSerious(p.diet) ? 'Yes' : '', p.meal.entree, p.meal.main, p.meal.dessert,
        ]),
      ),
    ],
  };
  const summary: Sheet = {
    name: 'Summary',
    rows: [
      ['Event', 'Invitations', 'Coming (invitations)', 'Coming (people)', 'Declined', 'Awaiting', 'Dietary needs', 'Serious allergies'],
      ...events.map((e) => {
        const inv = guests.filter((g) => g.invited.includes(e.key));
        const yes = inv.filter((g) => g.rsvp[e.key]?.attending === true);
        const ppl = yes.flatMap((g) => g.people.slice(0, Math.max(1, g.rsvp[e.key]?.count ?? g.people.length)));
        return [
          e.name, inv.length, yes.length, yes.reduce((n, g) => n + (g.rsvp[e.key]?.count ?? 0), 0),
          inv.filter((g) => g.rsvp[e.key]?.attending === false).length, inv.filter((g) => (g.rsvp[e.key]?.attending ?? null) === null).length,
          ppl.filter((p) => p.diet.trim()).length, ppl.filter((p) => isSerious(p.diet)).length,
        ];
      }),
    ],
  };
  return [invitations, people, summary];
}

/** Kept for CSV export (same columns as the Invitations sheet). */
export const exportRows = (guests: Guest[], events: EventInfo[], links: Record<string, string> = {}) => exportSheets(guests, events, links)[0]!.rows;

/** A blank template with the columns we read, and an example row. */
export function templateSheet(events: EventInfo[]): Sheet {
  return {
    name: 'Guests',
    rows: [
      ['Name', 'Partner', 'Mobile', 'Seats', 'Group', ...events.map((e) => e.name)],
      ['Alex Lee & Sam Lee', '', '0412 345 678', 2, 'Family', ...events.map(() => 'Yes')],
    ],
  };
}

import type { EventInfo, Guest } from '../lib/api';
import { shortLabel } from '../lib/format';

/**
 * Spreadsheet ↔ guest list. Import reads whatever columns a couple's spreadsheet has: names
 * (one column, or one per person), mobile, seats, and a yes/no column per event.
 */

export interface ImportRow {
  people: string[];
  phone?: string;
  seats?: number;
  invited?: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const YES = /^(y|yes|true|1|x|✓|invited|coming)$/i;

/** Which column is which, from the header row. */
export function mapColumns(header: string[], events: EventInfo[]) {
  const h = header.map(norm);
  const main = h.findIndex((x) => /^(name|names|guest|guests|main contact|full name|guest name|invitation)$/.test(x));
  const extra = h.map((x, i) => (i !== main && /^(guest ?\d+|partner|plus ?one|name ?\d+|person ?\d+|other guests?|partners?)$/.test(x) ? i : -1)).filter((i) => i >= 0);
  const phone = h.findIndex((x) => /mobile|phone|cell|number/.test(x) && !/seat|guests/.test(x));
  const seats = h.findIndex((x) => /^(seats?|party size|count|number of guests|guests count)$/.test(x));
  const eventCols = events
    .map((e) => ({ key: e.key, i: h.findIndex((x) => x === norm(e.name) || x === norm(e.key) || x === norm(shortLabel(e.name))) }))
    .filter((e) => e.i >= 0);
  return { main: main >= 0 ? main : 0, extra, phone, seats, eventCols };
}

export function toImportRows(table: string[][], events: EventInfo[]): { rows: ImportRow[]; columns: ReturnType<typeof mapColumns> } {
  const [header = [], ...body] = table;
  const columns = mapColumns(header, events);
  const rows = body.map((r) => {
    const names = (r[columns.main] ?? '').split(/\s*(?:&|\band\b|;|\+)\s*/i);
    const people = [...names, ...columns.extra.map((i) => r[i] ?? '')].map((s) => s.trim()).filter(Boolean);
    const row: ImportRow = { people };
    if (columns.phone >= 0 && r[columns.phone]) row.phone = r[columns.phone];
    const seats = columns.seats >= 0 ? Number.parseInt(r[columns.seats] ?? '', 10) : NaN;
    if (Number.isFinite(seats) && seats > 0) row.seats = seats;
    if (columns.eventCols.length) row.invited = columns.eventCols.filter((e) => YES.test((r[e.i] ?? '').trim())).map((e) => e.key);
    return row;
  });
  return { rows: rows.filter((r) => r.people.length || r.phone), columns };
}

/** The whole list, with replies, for Excel. */
export function exportRows(guests: Guest[], events: EventInfo[]): unknown[][] {
  const reply = (g: Guest, e: EventInfo) => {
    if (!g.invited.includes(e.key)) return 'Not invited';
    const a = g.rsvp[e.key]?.attending;
    return a === true ? 'Coming' : a === false ? 'Declined' : 'Awaiting';
  };
  return [
    ['Main contact', 'Others', 'Mobile', 'Seats held', ...events.flatMap((e) => [shortLabel(e.name), `${shortLabel(e.name)} count`]), 'Dietary', 'Message', 'Table'],
    ...guests.map((g) => [
      g.people[0]?.name ?? '',
      g.people.slice(1).map((p) => p.name).join(' & '),
      g.phoneDisplay,
      g.seatsHeld,
      ...events.flatMap((e) => [reply(g, e), g.rsvp[e.key]?.attending ? g.rsvp[e.key]!.count : '']),
      g.people.map((p) => p.diet.trim()).filter(Boolean).join('; '),
      Object.values(g.rsvp).map((r) => r.message.trim()).find(Boolean) ?? '',
      [...new Set(g.people.map((p) => p.table).filter(Boolean))].join(' & '),
    ]),
  ];
}

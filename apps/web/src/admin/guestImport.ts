import { addressLines, isSerious, printed, relationLabel, sideShort } from '@wp/shared';
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
  email?: string;
  seats?: number;
  party?: string;
  /** As written: "Alex", "Bride's side", "Both" (the server reads it with the couple's names). */
  side?: string;
  relation?: string;
  /** Circles separated by commas: "Uni crew, Netball". */
  circles?: string;
  /** Postal address, and "post" / "both" for a printed invitation. */
  street?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
  delivery?: 'digital' | 'post' | 'both';
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
  const email = h.findIndex((x) => /^(e ?mail|e ?mail address|email address)$/.test(x));
  const seats = h.findIndex((x) => /^(seats?|seats held|party size|count|number of guests|guests count)$/.test(x));
  const party = h.findIndex((x) => /^(group|party|guest group|category)$/.test(x));
  const side = h.findIndex((x) => /^(side|whose side|bride or groom|guest of)$/.test(x));
  const relation = h.findIndex((x) => /^(relationship|relation|relationship to (the )?couple|how (they|we) know (them|us)|connection)$/.test(x));
  const circles = h.findIndex((x) => /^(circles?|knows|who they know|friend groups?|tags?)$/.test(x));
  const street = h.findIndex((x) => /^(address|street|street address|address line 1|postal address|mailing address)$/.test(x));
  const suburb = h.findIndex((x) => /^(suburb|city|town|locality)$/.test(x));
  const state = h.findIndex((x) => /^(state|region|state territory)$/.test(x));
  const postcode = h.findIndex((x) => /^(postcode|post code|postal code|zip|zip code)$/.test(x));
  const country = h.findIndex((x) => /^(country|country region)$/.test(x));
  const delivery = h.findIndex((x) => /^(invitation by|delivery|printed|printed invitation|send by|by post)$/.test(x));
  const eventCols = events
    .map((e) => ({ key: e.key, i: h.findIndex((x) => x === norm(e.name) || x === norm(e.key) || x === norm(shortLabel(e.name))) }))
    .filter((e) => e.i >= 0);
  return { main: main >= 0 ? main : 0, extra, phone, email, seats, party, side, relation, circles, street, suburb, state, postcode, country, delivery, eventCols };
}

/** "Post", "Printed", "Both", "Yes" (a printed one), "Digital", "Text", "Email". */
function deliveryOf(v: string): ImportRow['delivery'] | undefined {
  const x = v.trim().toLowerCase();
  if (!x) return undefined;
  if (/both|post and|printed and|\+/.test(x)) return 'both';
  if (/^(post|posted|mail|printed|print|paper|yes|y|x|printed only|by post)/.test(x)) return 'post';
  if (/^(digital|text|sms|email|e-mail|no|n)/.test(x)) return 'digital';
  return undefined;
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
    if (columns.email >= 0 && r[columns.email]?.trim()) row.email = r[columns.email]!.trim();
    const seats = columns.seats >= 0 ? Number.parseInt(r[columns.seats] ?? '', 10) : NaN;
    if (Number.isFinite(seats) && seats > 0) row.seats = seats;
    if (columns.party >= 0 && r[columns.party]?.trim()) row.party = r[columns.party]!.trim();
    if (columns.side >= 0 && r[columns.side]?.trim()) row.side = r[columns.side]!.trim();
    if (columns.relation >= 0 && r[columns.relation]?.trim()) row.relation = r[columns.relation]!.trim();
    if (columns.circles >= 0 && r[columns.circles]?.trim()) row.circles = r[columns.circles]!.trim();
    for (const k of ['street', 'suburb', 'state', 'postcode', 'country'] as const) {
      const v = columns[k] >= 0 ? r[columns[k]]?.trim() : '';
      if (v) row[k] = v;
    }
    if (columns.delivery >= 0) {
      const d = deliveryOf(r[columns.delivery] ?? '');
      if (d) row.delivery = d;
    }
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
export function exportSheets(guests: Guest[], events: EventInfo[], links: Record<string, string> = {}, names: { name1: string; name2: string } = { name1: '', name2: '' }): Sheet[] {
  const questions = events.flatMap((e) => e.questions.map((q) => ({ e, q })));
  const invitations: Sheet = {
    name: 'Invitations',
    rows: [
      [
        'Main contact', 'Others', 'Mobile', 'Email', 'Group', 'Side', 'Relationship', 'Circles', 'Invitation by', 'Address', 'Suburb', 'State', 'Postcode', 'Country', 'Seats held',
        ...events.flatMap((e) => [shortLabel(e.name), `${shortLabel(e.name)}: coming`]),
        ...questions.map(({ e, q }) => `${shortLabel(e.name)}: ${q.label}`),
        'Dietary', 'Message', 'Table', 'Replied', 'Opened invitation', 'Texts allowed', 'Last text', 'Personal link',
      ],
      ...guests.map((g) => [
        g.people[0]?.name ?? '',
        g.people.slice(1).map((p) => p.name).join(' & '),
        g.phoneDisplay,
        g.email ?? '',
        g.party,
        g.side ? sideShort(g.side, names) : '',
        g.relation ? relationLabel(g.relation) : '',
        (g.circles ?? []).join(', '),
        g.delivery === 'post' ? 'Post' : g.delivery === 'both' ? 'Both' : 'Digital',
        g.address?.street ?? '',
        g.address?.suburb ?? '',
        g.address?.state ?? '',
        g.address?.postcode ?? '',
        g.address?.country ?? '',
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

/** Address labels for everyone getting a printed invitation: who it's to, and their address lines. */
export function labelRows(guests: Guest[]): { to: string; lines: string[] }[] {
  return guests
    .filter((g) => printed(g.delivery))
    .map((g) => ({ to: g.people.map((p) => p.name).filter(Boolean).join(' & '), lines: addressLines(g.address) }))
    .sort((a, b) => a.to.localeCompare(b.to));
}

/** Kept for CSV export (same columns as the Invitations sheet). */
export const exportRows = (guests: Guest[], events: EventInfo[], links: Record<string, string> = {}) => exportSheets(guests, events, links)[0]!.rows;

/** A blank template with the columns we read, and an example row. */
export function templateSheet(events: EventInfo[]): Sheet {
  return {
    name: 'Guests',
    rows: [
      ['Name', 'Partner', 'Mobile', 'Seats', 'Group', 'Side', 'Relationship', 'Circles', ...events.map((e) => e.name)],
      ['Alex Lee & Sam Lee', '', '0412 345 678', 2, 'Family', 'Both', 'Uni friend', 'Uni crew, Netball', ...events.map(() => 'Yes')],
    ],
  };
}

/**
 * Turns a tenant seed file (seed/*.json, the prototype's data format) into SQL statements.
 * Pure and couple-agnostic: everything specific comes from the JSON.
 * Events: the first event takes the prototype's "W" fields, the second its "B" fields.
 */
import { attachDiet, randomToken, segments, toE164, zonedToUtc } from '@wp/shared';
import { z } from 'zod';
import type { Audience } from '../sms/types';

const Rsvp = z.object({
  w: z.boolean().nullable(), b: z.boolean().nullable(), n: z.number().int().min(1), ride: z.string().default(''),
  diet: z.string().default(''), msg: z.string().default(''), at: z.string().nullable(), via: z.string().default(''),
});

export const SeedFile = z.object({
  wedding: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name1: z.string(), name2: z.string(), monogram: z.string(), theme: z.string(), timezone: z.string() }),
  events: z
    .array(
      z.object({
        key: z.string(), name: z.string(), date: z.string(), start: z.string(), venue: z.string(), address: z.string(), catered: z.boolean().default(true),
        questions: z.array(z.object({ key: z.string(), label: z.string(), type: z.string(), options: z.array(z.string()).optional() })).default([]),
      }),
    )
    .min(1),
  guide: z.record(z.unknown()),
  presets: z.array(z.object({ k: z.string(), label: z.string(), text: z.string() })).default([]),
  invitation: z.record(z.unknown()).default({}),
  campaigns: z.array(
    z.object({
      key: z.string(), name: z.string(), text: z.string(), aud: z.string().default(''), audKey: z.string().optional(),
      mode: z.enum(['auto', 'dates', 'manual']), on: z.boolean(), dates: z.array(z.string()).default([]), excl: z.array(z.string()).default([]),
    }),
  ),
  sampleGuests: z.array(
    z.object({
      id: z.string(), name: z.string(), partners: z.array(z.string()).default([]), phone: z.string().default(''), max: z.number().int().min(1),
      W: z.boolean(), B: z.boolean(), rsvp: Rsvp, sms: z.array(z.object({ type: z.string(), at: z.string(), status: z.string() })).default([]),
    }),
  ),
  exampleSeating: z
    .object({
      aspect: z.string().default('4 / 3'),
      tables: z.array(z.object({ id: z.string(), name: z.string(), x: z.number(), y: z.number(), seats: z.number().int() })),
      features: z.array(z.object({ id: z.string(), label: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })).default([]),
      seats: z.record(z.string()),
    })
    .optional(),
});
export type SeedFile = z.infer<typeof SeedFile>;

export interface Statement {
  sql: string;
  params: (string | number | null)[];
}

export interface SeedOptions {
  ownerEmail: string;
  /** PBKDF2 hash from lib/auth.ts hashPasscode. */
  ownerPassHash: string;
  /** The couple's mobile, for "Needs you" forwards. Optional. */
  adminMobile?: string;
  /** The page wording catalogue (seed/texts.json + seed/texts.dynamic.json). */
  texts?: Record<string, string>;
  now?: Date;
  newId?: () => string;
  newToken?: () => string;
  /** The prototype's sample guests (tests and demos). Off for the live wedding. Default on. */
  sampleGuests?: boolean;
}

/** The prototype's campaign keys and who each one goes to (docs/05). */
function audienceFor(key: string, audKey: string | undefined, ev: { first: string; second?: string }): Audience {
  const byAudKey: Record<string, Audience> = {
    all: { all: true }, W: { invitedTo: ev.first }, wYes: { attending: ev.first }, awaiting: { awaitingAny: true }, declined: { declinedAll: true },
    ...(ev.second ? { B: { invitedTo: ev.second }, bYes: { attending: ev.second } } : {}),
  };
  if (audKey && byAudKey[audKey]) return byAudKey[audKey];
  const second = ev.second ?? ev.first;
  const byKey: Record<string, Audience> = {
    invite: { all: true },
    thanks: { all: true },
    reminder: { invitedBefore: true, awaitingAny: true },
    ride: { attending: second, answer: { event: second, key: 'ride', notIn: ['No, not riding'] } },
    nightW: { attending: ev.first },
    rain: { attending: ev.first },
    photos: { attending: ev.first },
    nightB: { attending: second },
  };
  return byKey[key] ?? { all: true };
}

const TRIGGERS: Record<string, 'invitation_created' | 'rsvp_changed'> = { invite: 'invitation_created', thanks: 'rsvp_changed' };

/** "The wedding" -> "the wedding"; other names are used as written. */
const pendingLabel = (name: string) => (/^the\s/i.test(name) ? 'the' + name.slice(3) : name);

export function buildSeed(input: unknown, o: SeedOptions): Statement[] {
  const seed = SeedFile.parse(input);
  const now = (o.now ?? new Date()).toISOString();
  const newId = o.newId ?? (() => crypto.randomUUID());
  const newToken = o.newToken ?? (() => randomToken());
  const tz = seed.wedding.timezone;
  const utc = (local: string) => zonedToUtc(local.slice(0, 16), tz).toISOString();
  const out: Statement[] = [];
  const q = (sql: string, ...params: Statement['params']) => out.push({ sql, params });

  // Wedding + owner
  const weddingId = newId();
  const userId = newId();
  q(
    `INSERT INTO wedding (id, slug, name1, name2, monogram, theme, timezone, content, guide, admin_mobile, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    weddingId, seed.wedding.slug, seed.wedding.name1, seed.wedding.name2, seed.wedding.monogram, seed.wedding.theme, tz,
    JSON.stringify({ smsPresets: seed.presets, invitation: seed.invitation, texts: o.texts ?? {} }), JSON.stringify(seed.guide), toE164(o.adminMobile), now, now,
  );
  q(`INSERT INTO user (id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)`, userId, o.ownerEmail.trim().toLowerCase(), o.ownerPassHash, now);
  q(`INSERT INTO membership (wedding_id, user_id, role) VALUES (?, ?, 'owner')`, weddingId, userId);

  // Events
  const eventIds = seed.events.map(() => newId());
  seed.events.forEach((e, i) =>
    q(
      `INSERT INTO event (id, wedding_id, key, name, pending_label, starts_at, venue, address, catered, has_seating, questions, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      eventIds[i]!, weddingId, e.key, e.name, pendingLabel(e.name), utc(`${e.date}T${e.start}`), e.venue, e.address, e.catered ? 1 : 0,
      i === 0 && seed.exampleSeating ? 1 : 0, JSON.stringify(e.questions), i,
    ),
  );
  const [first, second] = seed.events;
  const ev = { first: first!.key, ...(second ? { second: second.key } : {}) };

  // Campaigns + dated slots
  const campaignIds = new Map<string, string>();
  seed.campaigns.forEach((c, i) => {
    const id = newId();
    campaignIds.set(c.key, id);
    q(
      `INSERT INTO campaign (id, wedding_id, key, name, body, mode, enabled, trigger, audience, excluded, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
      id, weddingId, c.key, c.name, c.text, c.mode, c.on ? 1 : 0, TRIGGERS[c.key] ?? null, JSON.stringify(audienceFor(c.key, c.audKey, ev)), i,
    );
    if (c.mode === 'dates') for (const d of c.dates) q(`INSERT INTO campaign_slot (id, campaign_id, send_at) VALUES (?, ?, ?)`, newId(), id, utc(d));
  });

  // Seating (first event)
  const tableIds = new Map<string, string>();
  if (seed.exampleSeating) {
    const s = seed.exampleSeating;
    q(`INSERT INTO seat_plan (event_id, aspect) VALUES (?, ?)`, eventIds[0]!, s.aspect);
    for (const t of s.tables) {
      const id = newId();
      tableIds.set(t.id, id);
      q(`INSERT INTO seat_table (id, wedding_id, event_id, name, x, y, seats) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, weddingId, eventIds[0]!, t.name, t.x, t.y, t.seats);
    }
    for (const f of s.features)
      q(`INSERT INTO seat_area (id, wedding_id, event_id, label, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, newId(), weddingId, eventIds[0]!, f.label, f.x, f.y, f.w, f.h);
  }

  // Guests
  for (const g of o.sampleGuests === false ? [] : seed.sampleGuests) {
    const invId = newId();
    const people = [g.name, ...g.partners].filter((p) => p.trim());
    q(
      `INSERT INTO invitation (id, wedding_id, token, phone, seats_held, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      invId, weddingId, newToken(), toE164(g.phone), Math.max(g.max, people.length), now, now,
    );
    const dietFor = attachDiet(g.rsvp.diet, people);
    people.forEach((name, idx) => {
      const table = seed.exampleSeating?.seats[`${g.id}:${idx}`];
      q(
        `INSERT INTO person (id, invitation_id, idx, name, diet, table_id) VALUES (?, ?, ?, ?, ?, ?)`,
        newId(), invId, idx, name, idx === dietFor ? g.rsvp.diet.trim() : '', (table && tableIds.get(table)) || null,
      );
    });

    const invited: [string, boolean | null, Record<string, string>][] = [];
    if (g.W) invited.push([eventIds[0]!, g.rsvp.w, {}]);
    if (g.B && second) invited.push([eventIds[1]!, g.rsvp.b, g.rsvp.b && g.rsvp.ride ? { ride: g.rsvp.ride } : {}]);
    let message = g.rsvp.msg;
    for (const [eventId, attending, answers] of invited) {
      q(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`, invId, eventId);
      if (attending === null || !g.rsvp.at) continue; // still awaiting
      q(
        `INSERT INTO rsvp (invitation_id, event_id, attending, count, answers, message, via, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'invitation', ?)`,
        invId, eventId, attending ? 1 : 0, g.rsvp.n, JSON.stringify(answers), message, utc(g.rsvp.at),
      );
      message = ''; // the note is stored once
    }

    // Texts already sent by the prototype. Keyed so the autopilot treats them as sent and never repeats them.
    const phone = toE164(g.phone);
    for (const [i, m] of g.sms.entries()) {
      const campaignId = campaignIds.get(m.type) ?? null;
      const key = TRIGGERS[m.type] === 'invitation_created' && campaignId ? `auto:${campaignId}:${invId}` : `import:${invId}:${i}`;
      const body = '(sent before this system)';
      q(
        `INSERT INTO sms_out (id, wedding_id, invitation_id, campaign_id, dedupe_key, kind, to_phone, body, parts, status, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, 'campaign', ?, ?, ?, ?, ?, ?)`,
        newId(), weddingId, invId, campaignId, key, phone ?? '', body, segments(body).parts,
        /deliver/i.test(m.status) ? 'delivered' : 'sent', utc(m.at), utc(m.at),
      );
    }
  }
  return out;
}

/** Inline parameters for a .sql file run with `wrangler d1 execute --file`. */
export function toSqlText(stmts: Statement[]): string {
  const lit = (v: Statement['params'][number]) =>
    v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`;
  return stmts
    .map((s) => {
      let i = 0;
      // Collapse the SQL layout first, so whitespace inside values is never touched.
      return s.sql.replace(/\s+/g, ' ').trim().replace(/\?/g, () => lit(s.params[i++] ?? null)) + ';';
    })
    .join('\n');
}

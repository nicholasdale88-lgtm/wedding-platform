import { zonedToUtc } from '@wp/shared';
import { Miniflare } from 'miniflare';
import m0001 from '../../migrations/0001_init.sql?raw';
import m0002 from '../../migrations/0002_weather.sql?raw';
import m0003 from '../../migrations/0003_table_shapes.sql?raw';
import m0004 from '../../migrations/0004_seat_publish.sql?raw';
import m0005 from '../../migrations/0005_guest_groups.sql?raw';
import m0006 from '../../migrations/0006_invites_from.sql?raw';
import m0007 from '../../migrations/0007_media_event.sql?raw';
import m0008 from '../../migrations/0008_messages.sql?raw';
import { CAMPAIGNS, phoneOf, SENDER, ADMIN } from './fixture';
import { TZ } from './fakes';

/** A fresh in-memory D1 (same engine as Cloudflare) with every migration applied, in order. */
export async function testD1() {
  const mf = new Miniflare({ modules: true, script: 'export default {}', d1Databases: { DB: crypto.randomUUID() } });
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const stmt of [m0001, m0002, m0003, m0004, m0005, m0006, m0007, m0008].flatMap(statements)) await db.prepare(stmt).run();
  return { db, dispose: () => mf.dispose() };
}

export function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The same wedding as fixture.ts seedWedding, written with SQL. */
export async function seedD1(db: D1Database, n = 20, opts: { noPhone?: number[] } = {}) {
  const now = '2026-10-01T00:00:00.000Z';
  const s: D1PreparedStatement[] = [];
  const q = (sql: string, ...p: unknown[]) => s.push(db.prepare(sql).bind(...p));
  q(
    `INSERT INTO wedding (id, slug, name1, name2, sms_sender, admin_mobile, sms_optout_footer, created_at, updated_at)
     VALUES ('w1', 'sophie-and-nicholas', 'Sophie Bloor', 'Nicholas Dale', ?, ?, '', ?, ?)`,
    SENDER, ADMIN, now, now,
  );
  q(`INSERT INTO event (id, wedding_id, key, name, pending_label, starts_at, sort) VALUES ('e1', 'w1', 'wedding', 'The wedding', 'the wedding', ?, 0)`, now);
  q(`INSERT INTO event (id, wedding_id, key, name, pending_label, starts_at, sort) VALUES ('e2', 'w1', '30th', 'Nicholas''s 30th', 'Nicholas''s 30th', ?, 1)`, now);
  for (let i = 0; i < n; i++) {
    const phone = opts.noPhone?.includes(i) ? null : phoneOf(i);
    q(`INSERT INTO invitation (id, wedding_id, token, phone, seats_held, created_at, updated_at) VALUES (?, 'w1', ?, ?, ?, ?, ?)`,
      `i${i}`, `tok${String(i).padStart(19, '0')}`, phone, i % 4 === 0 ? 2 : 1, now, now);
    q(`INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, 0, ?)`, `p${i}a`, `i${i}`, `Guest${i} ${i % 4 === 0 ? 'Smith' : 'Jones'}`);
    if (i % 4 === 0) q(`INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, 1, ?)`, `p${i}b`, `i${i}`, `Partner${i} Smith`);
    const events = i % 3 === 0 ? ['e1'] : i % 5 === 0 ? ['e2'] : ['e1', 'e2'];
    for (const e of events) q(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`, `i${i}`, e);
  }
  CAMPAIGNS.forEach((c, i) =>
    q(`INSERT INTO campaign (id, wedding_id, key, name, body, mode, enabled, trigger, audience, excluded, sort) VALUES (?, 'w1', ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
      c.id, c.key, c.name, c.body, c.mode, c.enabled ? 1 : 0, c.trigger, JSON.stringify(c.audience), i),
  );
  q(`INSERT INTO campaign_slot (id, campaign_id, send_at) VALUES ('s1', 'c-reminder', ?)`, zonedToUtc('2027-06-18T10:00', TZ).toISOString());
  q(`INSERT INTO campaign_slot (id, campaign_id, send_at) VALUES ('s2', 'c-nightW', ?)`, zonedToUtc('2027-11-17T17:00', TZ).toISOString());
  await db.batch(s);
}

/** A guest answering on the website. */
export async function replyD1(db: D1Database, invitationId: string, eventId: string, attending: boolean, at: Date) {
  await db
    .prepare(`INSERT OR REPLACE INTO rsvp (invitation_id, event_id, attending, count, updated_at) VALUES (?, ?, ?, 1, ?)`)
    .bind(invitationId, eventId, attending ? 1 : 0, at.toISOString())
    .run();
}

/** Publish every event's saved seating, as Admin → Seating → Publish does (only guests who said yes). */
export async function publishSeating(db: D1Database) {
  const { results: events } = await db.prepare(`SELECT id FROM event`).all<{ id: string }>();
  for (const e of events) {
    const tables = (await db.prepare(`SELECT id, name, shape, dir, length_pct AS len, x, y, seats FROM seat_table WHERE event_id = ? AND deleted_at IS NULL`).bind(e.id).all()).results;
    if (!tables.length) continue;
    const areas = (await db.prepare(`SELECT label, x, y, w, h FROM seat_area WHERE event_id = ?`).bind(e.id).all()).results;
    const { results: seated } = await db
      .prepare(
        `SELECT p.id, p.table_id FROM person p JOIN seat_table t ON t.id = p.table_id AND t.event_id = ?1
           JOIN rsvp r ON r.invitation_id = p.invitation_id AND r.event_id = ?1 AND r.attending = 1`,
      )
      .bind(e.id)
      .all<{ id: string; table_id: string }>();
    const snapshot = { aspect: '4 / 3', tables, areas, seats: Object.fromEntries(seated.map((s) => [s.id, s.table_id])) };
    await db.prepare(`INSERT OR REPLACE INTO seat_publish (event_id, snapshot, published_at) VALUES (?, ?, ?)`).bind(e.id, JSON.stringify(snapshot), new Date().toISOString()).run();
  }
}

import { zonedToUtc } from '@wp/shared';
import { Miniflare } from 'miniflare';
import m0001 from '../../migrations/0001_init.sql?raw';
import m0002 from '../../migrations/0002_weather.sql?raw';
import { CAMPAIGNS, phoneOf, SENDER, ADMIN } from './fixture';
import { TZ } from './fakes';

/** A fresh in-memory D1 (same engine as Cloudflare) with every migration applied, in order. */
export async function testD1() {
  const mf = new Miniflare({ modules: true, script: 'export default {}', d1Databases: { DB: crypto.randomUUID() } });
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const stmt of [m0001, m0002].flatMap(statements)) await db.prepare(stmt).run();
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

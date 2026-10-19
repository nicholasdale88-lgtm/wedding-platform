import { attachDiet, randomToken, toE164 } from '@wp/shared';
import { MAX_IMPORT, readJson } from '../lib/security';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { loadWedding } from '../admin/data';
import { buildOverview } from '../admin/overview';
import type { Env } from '../env';
import { estimate, sendNow, type EngineDeps } from '../sms/engine';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Per-wedding admin API (/api/a/w/:wid/...). Every route needs a session and membership;
 * writes need owner or editor. Edits to an invitation send If-Match: <version> and get 409
 * if someone else changed it first ("Updated elsewhere, reloaded").
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 428, code: string, message: string) => c.json({ error: { code, message } }, status);
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const wid = (c: C) => c.req.param('wid')!;

const GuestPatch = z
  .object({
    people: z.array(z.string().trim().max(120)).min(1).max(30),
    phone: z.string().max(40).nullable(),
    seatsHeld: z.number().int().min(1).max(60),
    invited: z.array(z.string()).max(20),
    table: z.string().trim().max(40).nullable(),
  })
  .partial()
  .strict();

const RsvpPut = z
  .object({
    events: z.record(z.object({ attending: z.boolean().nullable(), answers: z.record(z.string().max(200)).optional() })),
    count: z.number().int().min(1).max(60).optional(),
    diet: z.string().max(500).optional(),
    message: z.string().max(1000).optional(),
  })
  .strict();

export function adminRoutes(deps: (env: Env) => EngineDeps) {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');

  const audit = (c: C, action: string, target: string, detail?: unknown) =>
    c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id(), wid(c), c.get('user').id, action, target, detail === undefined ? null : JSON.stringify(detail), now());

  /** Bump the version if it matches; false means someone else saved first (or it doesn't exist). */
  async function claimVersion(c: C, invitationId: string): Promise<'ok' | 'missing' | 'conflict' | 'no-version'> {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return 'no-version';
    const r = await c.env.DB.prepare(
      `UPDATE invitation SET version = version + 1, updated_at = ? WHERE id = ? AND wedding_id = ? AND version = ? AND deleted_at IS NULL`,
    )
      .bind(now(), invitationId, wid(c), v)
      .run();
    if (r.meta.changes) return 'ok';
    const exists = await c.env.DB.prepare(`SELECT 1 FROM invitation WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(invitationId, wid(c)).first();
    return exists ? 'conflict' : 'missing';
  }
  const versionError = (c: C, r: 'missing' | 'conflict' | 'no-version') =>
    r === 'missing'
      ? err(c, 404, 'not_found', 'That guest no longer exists.')
      : r === 'conflict'
        ? err(c, 409, 'conflict', 'Updated elsewhere, reloaded.')
        : err(c, 428, 'version_required', 'Reload and try again.');

  async function guestJson(c: C, guestId: string) {
    const data = await loadWedding(c.env.DB, wid(c));
    const g = data?.guests.find((x) => x.id === guestId);
    if (!data || !g) return null;
    const row = await c.env.DB.prepare(`SELECT token FROM invitation WHERE id = ?`).bind(guestId).first<{ token: string }>();
    const { results: sms } = await c.env.DB.prepare(
      `SELECT COALESCE(c.name, CASE o.kind WHEN 'reply' THEN 'Reply to their text' ELSE 'Text' END) AS name,
              COALESCE(o.sent_at, o.created_at) AS at, o.status
         FROM sms_out o LEFT JOIN campaign c ON c.id = o.campaign_id
        WHERE o.invitation_id = ? AND o.status != 'cancelled' ORDER BY at DESC LIMIT 50`,
    )
      .bind(guestId)
      .all<{ name: string; at: string; status: string }>();
    const base = (c.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
    return { guest: g, link: `${base}/w/${data.wedding.slug}/?g=${row!.token}`, sms, events: data.events, campaigns: data.campaigns.map(({ id, name }) => ({ id, name })) };
  }

  app.get('/overview', async (c) => {
    const data = await loadWedding(c.env.DB, wid(c));
    if (!data) return err(c, 404, 'not_found', 'Wedding not found.');
    const w = data.wedding;
    return c.json({
      wedding: { id: w.id, slug: w.slug, name1: w.name1, name2: w.name2, timezone: w.timezone, adminName: (w.content.adminName as string | undefined) ?? '' },
      ...buildOverview(data, new Date()),
    });
  });

  app.get('/guests', async (c) => {
    const data = await loadWedding(c.env.DB, wid(c));
    if (!data) return err(c, 404, 'not_found', 'Wedding not found.');
    return c.json({ events: data.events, guests: data.guests });
  });

  app.get('/guests/:id', async (c) => {
    const g = await guestJson(c, c.req.param('id'));
    return g ? c.json(g) : err(c, 404, 'not_found', 'That guest no longer exists.');
  });

  app.post('/guests', writer, async (c) => {
    const w = wid(c);
    const invId = id();
    const t = now();
    const { results: events } = await c.env.DB.prepare(`SELECT id FROM event WHERE wedding_id = ? AND deleted_at IS NULL`).bind(w).all<{ id: string }>();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO invitation (id, wedding_id, token, seats_held, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`).bind(invId, w, randomToken(), t, t),
      c.env.DB.prepare(`INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, 0, '')`).bind(id(), invId),
      ...events.map((e) => c.env.DB.prepare(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`).bind(invId, e.id)),
      audit(c, 'guest.add', invId),
    ]);
    return c.json(await guestJson(c, invId), 201);
  });

  /**
   * Import from a spreadsheet. Every row is checked first; anyone already on the list (same mobile or
   * same main name) is skipped, never doubled. ?dry=1 reports what would happen without adding anyone.
   */
  app.post('/guests/import', writer, async (c) => {
    const Row = z.object({
      people: z.array(z.string().trim().max(120)).max(12),
      phone: z.string().max(40).optional(),
      seats: z.number().int().min(1).max(60).optional(),
      invited: z.array(z.string().max(40)).max(20).optional(),
    });
    const body = z.object({ rows: z.array(Row).min(1).max(1000) }).strict().safeParse(await readJson(c.req.raw, MAX_IMPORT));
    if (!body.success) return err(c, 400, 'invalid', 'That file could not be read. Up to 1,000 rows at a time.');
    const w = wid(c);
    const db = c.env.DB;
    const [{ results: events }, { results: existing }] = await Promise.all([
      db.prepare(`SELECT id, key FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(w).all<{ id: string; key: string }>(),
      db
        .prepare(
          `SELECT i.phone, (SELECT p.name FROM person p WHERE p.invitation_id = i.id AND p.idx = 0) AS name
             FROM invitation i WHERE i.wedding_id = ? AND i.deleted_at IS NULL`,
        )
        .bind(w)
        .all<{ phone: string | null; name: string | null }>(),
    ]);
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const phones = new Set(existing.map((e) => e.phone).filter(Boolean));
    const names = new Set(existing.map((e) => norm(e.name ?? '')).filter(Boolean));
    const byKey = new Map(events.map((e) => [e.key, e.id]));

    const ok: { people: string[]; phone: string | null; seats: number; eventIds: string[] }[] = [];
    const skipped: { row: number; name: string; reason: string }[] = [];
    const problems: { row: number; name: string; reason: string }[] = [];
    body.data.rows.forEach((r, i) => {
      const row = i + 1;
      const people = r.people.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const name = people[0] ?? '';
      if (!name) return problems.push({ row, name: '', reason: 'No name' });
      const phone = r.phone && r.phone.trim() ? toE164(r.phone) : null;
      if (r.phone && r.phone.trim() && !phone) return problems.push({ row, name, reason: `Mobile "${r.phone}" doesn't look Australian` });
      const unknown = (r.invited ?? []).filter((k) => !byKey.has(k));
      if (unknown.length) return problems.push({ row, name, reason: `Unknown event "${unknown[0]}"` });
      if ((phone && phones.has(phone)) || names.has(norm(name))) return skipped.push({ row, name, reason: 'Already on your list' });
      if (phone) phones.add(phone);
      names.add(norm(name));
      ok.push({ people, phone, seats: r.seats ?? people.length, eventIds: (r.invited?.length ? r.invited : events.map((e) => e.key)).map((k) => byKey.get(k)!) });
    });

    if (c.req.query('dry') || problems.length) return c.json({ added: 0, wouldAdd: ok.length, skipped, problems, dry: true }, problems.length && !c.req.query('dry') ? 400 : 200);

    const t = now();
    // D1 batches are all-or-nothing and up to ~100 statements: pack whole guests, never half of one.
    let batch: D1PreparedStatement[] = [];
    for (const g of ok) {
      const invId = id();
      const one = [
        db.prepare(`INSERT INTO invitation (id, wedding_id, token, phone, seats_held, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(invId, w, randomToken(), g.phone, Math.max(g.seats, g.people.length), t, t),
        ...g.people.map((p, idx) => db.prepare(`INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, ?, ?)`).bind(id(), invId, idx, p)),
        ...g.eventIds.map((e) => db.prepare(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`).bind(invId, e)),
      ];
      if (batch.length + one.length > 90) {
        await db.batch(batch);
        batch = [];
      }
      batch.push(...one);
    }
    if (batch.length) await db.batch(batch);
    await audit(c, 'guest.import', w, { added: ok.length, skipped: skipped.length }).run();
    return c.json({ added: ok.length, wouldAdd: ok.length, skipped, problems: [], dry: false });
  });

  app.patch('/guests/:id', writer, async (c) => {
    const body = GuestPatch.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Check the details and try again.');
    const p = body.data;
    const invId = c.req.param('id');

    let phone: string | null | undefined;
    if (p.phone !== undefined) {
      phone = p.phone && p.phone.trim() ? toE164(p.phone) : null;
      if (p.phone && p.phone.trim() && !phone) {
        return err(c, 400, 'bad_mobile', 'This mobile looks wrong. Australian mobiles start with 04 and have 10 digits.');
      }
    }
    let tableId: string | null | undefined;
    if (p.table !== undefined) {
      tableId = null;
      if (p.table) {
        const t = await c.env.DB.prepare(
          `SELECT t.id FROM seat_table t JOIN event e ON e.id = t.event_id
            WHERE t.wedding_id = ? AND t.deleted_at IS NULL AND lower(t.name) = lower(?) ORDER BY e.has_seating DESC, e.sort LIMIT 1`,
        )
          .bind(wid(c), p.table)
          .first<{ id: string }>();
        if (!t) return err(c, 400, 'no_table', `There's no table called "${p.table}" yet. Add it in Seating.`);
        tableId = t.id;
      }
    }

    const v = await claimVersion(c, invId);
    if (v !== 'ok') return versionError(c, v);

    const db = c.env.DB;
    const stmts: D1PreparedStatement[] = [];
    if (phone !== undefined) stmts.push(db.prepare(`UPDATE invitation SET phone = ? WHERE id = ?`).bind(phone, invId));
    if (p.seatsHeld !== undefined) stmts.push(db.prepare(`UPDATE invitation SET seats_held = ? WHERE id = ?`).bind(p.seatsHeld, invId));
    if (p.people) {
      const names = p.people.map((n, i) => n || (i === 0 ? '' : 'Guest'));
      names.forEach((name, idx) =>
        stmts.push(
          db
            .prepare(
              `INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, ?, ?)
               ON CONFLICT (invitation_id, idx) DO UPDATE SET name = excluded.name, deleted_at = NULL, version = version + 1`,
            )
            .bind(id(), invId, idx, name),
        ),
      );
      stmts.push(db.prepare(`UPDATE person SET deleted_at = ? WHERE invitation_id = ? AND idx >= ? AND deleted_at IS NULL`).bind(now(), invId, names.length));
    }
    if (p.invited) {
      stmts.push(db.prepare(`DELETE FROM invite_event WHERE invitation_id = ?`).bind(invId));
      stmts.push(
        db
          .prepare(
            `INSERT INTO invite_event (invitation_id, event_id)
             SELECT ?, id FROM event WHERE wedding_id = ? AND deleted_at IS NULL AND key IN (SELECT value FROM json_each(?))`,
          )
          .bind(invId, wid(c), JSON.stringify(p.invited)),
      );
    }
    if (tableId !== undefined) stmts.push(db.prepare(`UPDATE person SET table_id = ? WHERE invitation_id = ? AND deleted_at IS NULL`).bind(tableId, invId));
    stmts.push(audit(c, 'guest.edit', invId, p));
    await db.batch(stmts);
    return c.json(await guestJson(c, invId));
  });

  /** The couple records or corrects a reply (by phone, in person, on paper). */
  app.put('/guests/:id/rsvp', writer, async (c) => {
    const body = RsvpPut.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Check the reply and try again.');
    const r = body.data;
    const invId = c.req.param('id');
    const v = await claimVersion(c, invId);
    if (v !== 'ok') return versionError(c, v);

    const db = c.env.DB;
    const t = now();
    const { results: events } = await db
      .prepare(`SELECT e.id, e.key FROM invite_event ie JOIN event e ON e.id = ie.event_id WHERE ie.invitation_id = ? ORDER BY e.sort`)
      .bind(invId)
      .all<{ id: string; key: string }>();
    const stmts: D1PreparedStatement[] = [];
    events.forEach((e, i) => {
      const ev = r.events[e.key];
      if (!ev && r.count === undefined && r.message === undefined) return;
      stmts.push(
        db
          .prepare(
            `INSERT INTO rsvp (invitation_id, event_id, attending, count, answers, message, via, updated_at)
             VALUES (?1, ?2, ?3, COALESCE(?4, 1), COALESCE(?5, '{}'), COALESCE(?6, ''), 'admin', ?7)
             ON CONFLICT (invitation_id, event_id) DO UPDATE SET
               attending = CASE WHEN ?8 THEN ?3 ELSE attending END,
               count = COALESCE(?4, count),
               answers = COALESCE(?5, answers),
               message = COALESCE(?6, message),
               via = 'admin',
               -- the reply time moves only when the answer itself changes (it drives the thank-you text)
               updated_at = CASE WHEN ?8 AND attending IS NOT ?3 THEN ?7 ELSE updated_at END`,
          )
          .bind(
            invId, e.id, ev ? (ev.attending === null ? null : ev.attending ? 1 : 0) : null, r.count ?? null,
            ev?.answers ? JSON.stringify(ev.answers) : null, i === 0 ? (r.message ?? null) : null, t, ev ? 1 : 0,
          ),
      );
    });
    if (r.diet !== undefined) {
      const { results: people } = await db.prepare(`SELECT idx, name FROM person WHERE invitation_id = ? AND deleted_at IS NULL ORDER BY idx`).bind(invId).all<{ idx: number; name: string }>();
      const who = attachDiet(r.diet, people.map((p) => p.name));
      stmts.push(db.prepare(`UPDATE person SET diet = CASE WHEN idx = ? THEN ? ELSE '' END WHERE invitation_id = ? AND deleted_at IS NULL`).bind(who, r.diet.trim(), invId));
    }
    stmts.push(audit(c, 'guest.rsvp', invId, r));
    await db.batch(stmts);
    return c.json(await guestJson(c, invId));
  });

  app.delete('/guests/:id', writer, async (c) => {
    const invId = c.req.param('id');
    const r = await c.env.DB.prepare(`UPDATE invitation SET deleted_at = ?, version = version + 1 WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`)
      .bind(now(), invId, wid(c))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'That guest no longer exists.');
    await audit(c, 'guest.remove', invId).run();
    return c.json({ ok: true });
  });

  app.post('/guests/:id/restore', writer, async (c) => {
    const invId = c.req.param('id');
    const r = await c.env.DB.prepare(`UPDATE invitation SET deleted_at = NULL, version = version + 1 WHERE id = ? AND wedding_id = ? AND deleted_at IS NOT NULL`)
      .bind(invId, wid(c))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'Nothing to restore.');
    await audit(c, 'guest.restore', invId).run();
    return c.json(await guestJson(c, invId));
  });

  /** Dietary → meals: what the kitchen serves this person, course by course (blank = set menu). */
  app.put('/people/:pid/meal', writer, async (c) => {
    const body = z
      .object({ entree: z.string().trim().max(200), main: z.string().trim().max(200), dessert: z.string().trim().max(200) })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Keep each course under 200 characters.');
    const pid = c.req.param('pid');
    const r = await c.env.DB.prepare(
      `UPDATE person SET meal_entree = ?, meal_main = ?, meal_dessert = ?, version = version + 1
        WHERE id = ? AND deleted_at IS NULL AND invitation_id IN (SELECT id FROM invitation WHERE wedding_id = ?)`,
    )
      .bind(body.data.entree, body.data.main, body.data.dessert, pid, wid(c))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'Guest not found.');
    await audit(c, 'meal.set', pid, body.data).run();
    return c.json({ ok: true });
  });

  /** "Send now" from the guest drawer: one text to this guest. Shows count and cost first via ?dry=1. */
  app.post('/guests/:id/send', writer, async (c) => {
    const body = z.object({ campaignId: z.string() }).safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose a message.');
    const d = deps(c.env);
    const invId = c.req.param('id');
    try {
      if (c.req.query('dry')) return c.json(await estimate(d, wid(c), body.data.campaignId, [invId]));
      const res = await sendNow(d, wid(c), body.data.campaignId, [invId]);
      await audit(c, 'sms.send-one', invId, { campaignId: body.data.campaignId, sent: res.sent }).run();
      return c.json(res);
    } catch (e) {
      return err(c, 400, 'send_failed', (e as Error).message);
    }
  });

  return app;
}

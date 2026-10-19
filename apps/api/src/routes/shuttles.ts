import { isToken, Shuttles, type Shuttle } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson, safeJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Shuttle seats. The couple sets up runs per event (planner document "shuttles", scope = event key).
 * Guests (/api/p/:slug/shuttles?g=): the runs for events they're invited to, seats left, and theirs;
 * book or change seats (never more than are left). The couple (/api/a/w/:wid/shuttles): who's on each run.
 */

type GC = Context<{ Bindings: Env }>;
const gerr = (c: GC, status: 400 | 404 | 409 | 429, code: string, message: string) => c.json({ error: { code, message } }, status);

async function runsOf(db: D1Database, weddingId: string, eventKeys: string[]) {
  if (!eventKeys.length) return new Map<string, Shuttle[]>();
  const { results } = await db
    .prepare(`SELECT scope, data FROM planner_doc WHERE wedding_id = ? AND kind = 'shuttles' AND scope IN (${eventKeys.map(() => '?').join(',')})`)
    .bind(weddingId, ...eventKeys)
    .all<{ scope: string; data: string }>();
  return new Map(results.map((r) => [r.scope, Shuttles.safeParse(safeJson(r.data, {})).data?.list ?? []]));
}
const taken = async (db: D1Database, weddingId: string) => {
  const { results } = await db.prepare(`SELECT shuttle_id, SUM(seats) AS n FROM shuttle_booking WHERE wedding_id = ? GROUP BY shuttle_id`).bind(weddingId).all<{ shuttle_id: string; n: number }>();
  return new Map(results.map((r) => [r.shuttle_id, r.n]));
};

async function guestOf(c: GC, token: string) {
  const w = await c.env.DB.prepare(`SELECT id FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug')).first<{ id: string }>();
  if (!w || !isToken(token)) return null;
  const inv = await c.env.DB.prepare(`SELECT id, seats_held FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string; seats_held: number }>();
  if (!inv) return null;
  const { results: events } = await c.env.DB.prepare(
    `SELECT e.key, e.name, e.starts_at FROM event e JOIN invite_event ie ON ie.event_id = e.id AND ie.invitation_id = ? WHERE e.deleted_at IS NULL ORDER BY e.sort`,
  )
    .bind(inv.id)
    .all<{ key: string; name: string; starts_at: string }>();
  return { w, inv, events };
}

export function shuttleGuestRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const view = async (c: GC, g: NonNullable<Awaited<ReturnType<typeof guestOf>>>) => {
    const runs = await runsOf(c.env.DB, g.w.id, g.events.map((e) => e.key));
    const used = await taken(c.env.DB, g.w.id);
    const { results: mine } = await c.env.DB.prepare(`SELECT shuttle_id, seats FROM shuttle_booking WHERE invitation_id = ?`).bind(g.inv.id).all<{ shuttle_id: string; seats: number }>();
    const myMap = new Map(mine.map((m) => [m.shuttle_id, m.seats]));
    return {
      party: g.inv.seats_held,
      events: g.events
        .map((e) => ({
          key: e.key,
          name: e.name,
          startsAt: e.starts_at,
          runs: (runs.get(e.key) ?? []).map((s) => ({ id: s.id, time: s.time, from: s.from, to: s.to, note: s.note, left: Math.max(0, s.seats - (used.get(s.id) ?? 0)), mine: myMap.get(s.id) ?? 0 })),
        }))
        .filter((e) => e.runs.length),
    };
  };
  app.get('/', async (c) => {
    const g = await guestOf(c, c.req.query('g') ?? '');
    if (!g) return gerr(c, 404, 'no_link', 'Please open this from the link you were sent.');
    return c.json(await view(c, g));
  });
  /** Book (or change, or with 0 cancel) seats on one run. */
  app.post('/', async (c) => {
    const body = z.object({ token: z.string(), shuttleId: z.string().max(40), seats: z.number().int().min(0).max(20) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return gerr(c, 400, 'invalid', 'Choose how many seats.');
    const g = await guestOf(c, body.data.token);
    if (!g) return gerr(c, 404, 'no_link', 'Please open this from the link you were sent.');
    if (!(await allow(c.env.DB, `shuttle:${g.inv.id}`, 40, 3_600_000))) return gerr(c, 429, 'slow_down', 'Please wait a little and try again.');
    const runs = await runsOf(c.env.DB, g.w.id, g.events.map((e) => e.key));
    const run = [...runs.values()].flat().find((s) => s.id === body.data.shuttleId);
    if (!run) return gerr(c, 404, 'not_found', 'That shuttle isn’t running any more.');
    const seats = Math.min(body.data.seats, Math.max(1, g.inv.seats_held));
    const db = c.env.DB;
    if (!seats) {
      await db.prepare(`DELETE FROM shuttle_booking WHERE shuttle_id = ? AND invitation_id = ?`).bind(run.id, g.inv.id).run();
      return c.json(await view(c, g));
    }
    // Only if the seats are there (counting everyone else's bookings), in one statement.
    const res = await db
      .prepare(
        `INSERT INTO shuttle_booking (wedding_id, shuttle_id, invitation_id, seats, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5
          WHERE (SELECT COALESCE(SUM(seats), 0) FROM shuttle_booking WHERE shuttle_id = ?2 AND invitation_id != ?3) + ?4 <= ?6
         ON CONFLICT (shuttle_id, invitation_id) DO UPDATE SET seats = excluded.seats`,
      )
      .bind(g.w.id, run.id, g.inv.id, seats, new Date().toISOString(), run.seats)
      .run();
    if (!res.meta.changes) return gerr(c, 409, 'full', 'Sorry, there aren’t that many seats left on that one.');
    return c.json(await view(c, g));
  });
  return app;
}

type C = Context<AdminEnv>;
export function shuttleAdminRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  /** Who's booked on each run (names and seats). */
  app.get('/', async (c: C) => {
    const { results } = await c.env.DB.prepare(
      `SELECT b.shuttle_id, b.seats, (SELECT GROUP_CONCAT(name, ' & ') FROM (SELECT name FROM person WHERE invitation_id = b.invitation_id AND deleted_at IS NULL ORDER BY idx)) AS names
         FROM shuttle_booking b JOIN invitation i ON i.id = b.invitation_id AND i.deleted_at IS NULL
        WHERE b.wedding_id = ? ORDER BY b.created_at`,
    )
      .bind(c.req.param('wid'))
      .all<{ shuttle_id: string; seats: number; names: string | null }>();
    const by: Record<string, { names: string; seats: number }[]> = {};
    for (const r of results) (by[r.shuttle_id] ??= []).push({ names: r.names || 'A guest', seats: r.seats });
    return c.json({ bookings: by });
  });
  return app;
}

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Admin → Seating (/api/a/w/:wid/seating?event=<key>): the floor plan for one event. Tables and areas
 * are placed in % of the plan, so it looks the same at any size. Saving sends the whole layout and
 * who sits where, applied in one batch (If-Match: the wedding's version).
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 428, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;
const pct = z.number().min(0).max(100);

const Save = z
  .object({
    event: z.string().max(40),
    aspect: z.string().regex(/^\d{1,2} \/ \d{1,2}$/),
    tables: z
      .array(
        z.object({
          id: z.string().uuid(),
          name: z.string().trim().min(1).max(40),
          shape: z.enum(['round', 'long']),
          dir: z.enum(['h', 'v']),
          len: z.number().int().min(10).max(90),
          x: pct,
          y: pct,
          seats: z.number().int().min(1).max(60),
        }),
      )
      .max(120),
    areas: z.array(z.object({ label: z.string().trim().min(1).max(40), x: pct, y: pct, w: z.number().min(2).max(100), h: z.number().min(2).max(100) })).max(40),
    seats: z.record(z.string().max(60), z.string().uuid().nullable()),
  })
  .strict();

export function seatingRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());

  async function load(c: C, eventKey?: string) {
    const db = c.env.DB;
    const w = await db.prepare(`SELECT id, version FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(wid(c)).first<{ id: string; version: number }>();
    if (!w) return null;
    const { results: events } = await db
      .prepare(`SELECT id, key, name, has_seating, catered FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`)
      .bind(w.id)
      .all<{ id: string; key: string; name: string; has_seating: number; catered: number }>();
    const ev = events.find((e) => e.key === eventKey) ?? events.find((e) => e.has_seating) ?? events.find((e) => e.catered) ?? events[0];
    if (!ev) return null;
    const [plan, tables, areas, people] = await db.batch([
      db.prepare(`SELECT aspect, image_key FROM seat_plan WHERE event_id = ?`).bind(ev.id),
      db.prepare(`SELECT id, name, shape, dir, length_pct AS len, x, y, seats FROM seat_table WHERE event_id = ? AND deleted_at IS NULL ORDER BY name`).bind(ev.id),
      db.prepare(`SELECT label, x, y, w, h FROM seat_area WHERE event_id = ? AND deleted_at IS NULL`).bind(ev.id),
      db.prepare(
        `SELECT p.id, p.invitation_id AS invitationId, p.idx, p.name, p.diet, p.table_id AS tableId,
                ie.event_id IS NOT NULL AS invited, r.attending
           FROM person p JOIN invitation i ON i.id = p.invitation_id
           LEFT JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = ?1
           LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ?1
          WHERE i.wedding_id = ?2 AND i.deleted_at IS NULL AND p.deleted_at IS NULL
          ORDER BY i.created_at, p.idx`,
      ).bind(ev.id, w.id),
    ]);
    const tableIds = new Set((tables!.results as { id: string }[]).map((t) => t.id));
    const p = plan!.results[0] as { aspect: string; image_key: string | null } | undefined;
    return {
      eventId: ev.id,
      view: {
        version: w.version,
        event: { key: ev.key, name: ev.name },
        events: events.map((e) => ({ key: e.key, name: e.name })),
        aspect: p?.aspect ?? '4 / 3',
        planImg: '', // plan photos arrive with uploads (R2)
        tables: tables!.results as { id: string; name: string; shape: string; dir: string; len: number; x: number; y: number; seats: number }[],
        areas: areas!.results,
        people: (people!.results as { id: string; invitationId: string; idx: number; name: string; diet: string; tableId: string | null; invited: number; attending: number | null }[])
          .filter((x) => x.invited && x.attending !== 0)
          .map((x) => ({ id: x.id, invitationId: x.invitationId, name: x.name, diet: x.diet, tableId: x.tableId && tableIds.has(x.tableId) ? x.tableId : null, coming: x.attending === 1 })),
      },
    };
  }

  app.get('/', async (c) => {
    const s = await load(c, c.req.query('event'));
    if (!s) return err(c, 404, 'not_found', 'No events yet.');
    return c.json(s.view);
  });

  app.put('/', requireMember('owner', 'editor'), async (c) => {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return err(c, 428, 'version_required', 'Reload and try again.');
    const body = Save.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', body.error.issues[0]?.message ?? 'Please check the seating.');
    const b = body.data;
    const loaded = await load(c, b.event);
    const cur = loaded?.view;
    if (!loaded || !cur || cur.event.key !== b.event) return err(c, 404, 'not_found', 'That event no longer exists.');
    if (cur.version !== v) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    const db = c.env.DB;
    const ev = loaded.eventId;

    // A table id that belongs to another event or wedding can't be taken over.
    const known = new Set((cur.tables as { id: string }[]).map((t) => t.id));
    const fresh = b.tables.filter((t) => !known.has(t.id)).map((t) => t.id);
    if (fresh.length) {
      const clash = await db.prepare(`SELECT COUNT(*) AS n FROM seat_table WHERE id IN (${fresh.map(() => '?').join(',')})`).bind(...fresh).first<{ n: number }>();
      if (clash!.n) return err(c, 400, 'invalid', 'Reload and try again.');
    }
    const keep = new Set(b.tables.map((t) => t.id));
    const people = new Set(cur.people.map((p) => p.id));
    for (const [pid, tid] of Object.entries(b.seats)) {
      if (!people.has(pid)) return err(c, 400, 'invalid', 'Someone in the seating is no longer coming. Reload and try again.');
      if (tid && !keep.has(tid)) return err(c, 400, 'invalid', 'A table in the seating no longer exists.');
    }

    // Claim the version first: a batch doesn't stop when an UPDATE matches nothing.
    const now = new Date().toISOString();
    const claim = await db.prepare(`UPDATE wedding SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?`).bind(now, wid(c), v).run();
    if (!claim.meta.changes) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    const stmts: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO seat_plan (event_id, aspect) VALUES (?1, ?2) ON CONFLICT (event_id) DO UPDATE SET aspect = ?2`).bind(ev, b.aspect),
      db.prepare(`UPDATE event SET has_seating = ? WHERE id = ?`).bind(b.tables.length ? 1 : 0, ev),
    ];
    for (const t of b.tables) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO seat_table (id, wedding_id, event_id, name, shape, dir, length_pct, x, y, seats) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT (id) DO UPDATE SET name = ?4, shape = ?5, dir = ?6, length_pct = ?7, x = ?8, y = ?9, seats = ?10, deleted_at = NULL, version = version + 1`,
          )
          .bind(t.id, wid(c), ev, t.name, t.shape, t.dir, t.len, t.x, t.y, t.seats),
      );
    }
    for (const id of known) {
      if (keep.has(id)) continue;
      stmts.push(db.prepare(`UPDATE seat_table SET deleted_at = ? WHERE id = ?`).bind(now, id));
      stmts.push(db.prepare(`UPDATE person SET table_id = NULL WHERE table_id = ?`).bind(id));
    }
    stmts.push(db.prepare(`DELETE FROM seat_area WHERE event_id = ?`).bind(ev));
    for (const a of b.areas) {
      stmts.push(db.prepare(`INSERT INTO seat_area (id, wedding_id, event_id, label, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), ev, a.label, a.x, a.y, a.w, a.h));
    }
    for (const [pid, tid] of Object.entries(b.seats)) stmts.push(db.prepare(`UPDATE person SET table_id = ? WHERE id = ?`).bind(tid, pid));
    stmts.push(
      db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'seating.save', ?, ?, ?)`).bind(
        crypto.randomUUID(), wid(c), c.get('user').id, b.event, JSON.stringify({ tables: b.tables.length, seated: Object.values(b.seats).filter(Boolean).length }), now,
      ),
    );

    await db.batch(stmts);
    return c.json((await load(c, b.event))!.view);
  });

  return app;
}

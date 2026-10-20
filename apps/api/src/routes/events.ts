import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJson, safeJson } from '../lib/security';
import { eventRoom, needsUpgrade } from '../lib/plan';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Admin → Events (/api/a/w/:wid/events): the celebrations guests are invited to (a wedding, a
 * birthday, a recovery brunch…). Each has its own date, place, RSVP, dietary question and seating.
 *   GET           -> every event with how many guests are invited and coming
 *   POST          -> add one (optionally inviting everyone already on the list)
 *   PUT    /:id   -> change one (If-Match: <event version>)
 *   DELETE /:id   -> remove one: it leaves every invitation and its tables are emptied (If-Match)
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 428, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid') ?? '';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

const Question = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,30}$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum(['choice', 'text']),
  options: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
});

const Fields = z.object({
  name: z.string().trim().min(1).max(80),
  pendingLabel: z.string().trim().max(80),
  startsAt: z.string().datetime(),
  venue: z.string().trim().max(160),
  address: z.string().trim().max(240),
  mapUrl: z.string().trim().max(500).refine((u) => !u || /^https:\/\//i.test(u), 'Use an https:// link'),
  catered: z.boolean(),
  hasSeating: z.boolean(),
  questions: z.array(Question).max(6),
  sort: z.number().int().min(0).max(100),
});
const Create = Fields.partial({ pendingLabel: true, venue: true, address: true, mapUrl: true, catered: true, hasSeating: true, questions: true, sort: true })
  .extend({ inviteEveryone: z.boolean().optional() })
  .strict();
const Update = Fields.partial().strict();

interface Row {
  id: string; key: string; name: string; pending_label: string; starts_at: string; venue: string | null; address: string | null; map_url: string | null;
  catered: number; has_seating: number; questions: string; sort: number; version: number; invited: number; coming: number;
}

const out = (r: Row) => ({
  id: r.id,
  key: r.key,
  name: r.name,
  pendingLabel: r.pending_label,
  startsAt: r.starts_at,
  venue: r.venue ?? '',
  address: r.address ?? '',
  mapUrl: r.map_url ?? '',
  catered: !!r.catered,
  hasSeating: !!r.has_seating,
  questions: safeJson<z.infer<typeof Question>[]>(r.questions, []),
  sort: r.sort,
  version: r.version,
  invited: r.invited,
  coming: r.coming,
});

/** "Recovery brunch" → "recovery-brunch" (then -2, -3… if taken). Keys appear in links, so they stay short and plain. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'event';

export function eventRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');

  const list = async (c: C) => {
    const { results } = await c.env.DB.prepare(
      `SELECT e.*,
              (SELECT COUNT(*) FROM invite_event ie JOIN invitation i ON i.id = ie.invitation_id AND i.deleted_at IS NULL WHERE ie.event_id = e.id) AS invited,
              (SELECT COUNT(*) FROM rsvp r JOIN invite_event ie ON ie.invitation_id = r.invitation_id AND ie.event_id = r.event_id
                 JOIN invitation i ON i.id = r.invitation_id AND i.deleted_at IS NULL WHERE r.event_id = e.id AND r.attending = 1) AS coming
         FROM event e WHERE e.wedding_id = ? AND e.deleted_at IS NULL ORDER BY e.sort, e.starts_at`,
    )
      .bind(wid(c))
      .all<Row>();
    return results.map(out);
  };
  const audit = (c: C, action: string, target: string, detail?: unknown) =>
    c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id(), wid(c), c.get('user').id, action, target, detail === undefined ? null : JSON.stringify(detail), now());

  app.get('/', async (c) => {
    const w = await c.env.DB.prepare(`SELECT timezone FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(wid(c)).first<{ timezone: string }>();
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    return c.json({ timezone: w.timezone, events: await list(c) });
  });

  app.post('/', writer, async (c) => {
    const body = Create.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Check the event details: it needs a name and a date and time.');
    const b = body.data;
    const db = c.env.DB;
    const all = await db.prepare(`SELECT key, sort, deleted_at FROM event WHERE wedding_id = ?`).bind(wid(c)).all<{ key: string; sort: number; deleted_at: string | null }>();
    if (all.results.filter((r) => !r.deleted_at).length >= 20) return err(c, 400, 'too_many', 'Up to 20 events per celebration.');
    if (!(await eventRoom(db, wid(c)))) return needsUpgrade(c, 'extraEvent');
    const taken = new Set(all.results.map((r) => r.key)); // removed events keep their key, so old links never point at a new event
    const base = slug(b.name);
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
    const eventId = id();
    const sort = b.sort ?? Math.max(-1, ...all.results.map((r) => r.sort)) + 1;
    const stmts = [
      db
        .prepare(
          `INSERT INTO event (id, wedding_id, key, name, pending_label, starts_at, venue, address, map_url, catered, has_seating, questions, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(eventId, wid(c), key, b.name, b.pendingLabel || `the ${b.name.replace(/^the\s+/i, '')}`, b.startsAt, b.venue ?? '', b.address ?? '', b.mapUrl ?? '',
          b.catered === false ? 0 : 1, b.hasSeating ? 1 : 0, JSON.stringify(b.questions ?? []), sort),
      audit(c, 'event.add', eventId, { name: b.name }),
    ];
    if (b.inviteEveryone) {
      stmts.push(
        db.prepare(`INSERT INTO invite_event (invitation_id, event_id) SELECT id, ? FROM invitation WHERE wedding_id = ? AND deleted_at IS NULL`).bind(eventId, wid(c)),
      );
    }
    try {
      await db.batch(stmts);
    } catch (e) {
      if (/UNIQUE/i.test(String(e))) return err(c, 409, 'exists', 'That event was just added. Reload to see it.');
      throw e;
    }
    return c.json({ events: await list(c), added: key }, 201);
  });

  app.put('/:id', writer, async (c) => {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return err(c, 428, 'version_required', 'Reload and try again.');
    const body = Update.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Check the event details and try again.');
    const b = body.data;
    const cols: [string, unknown][] = [];
    if (b.name !== undefined) cols.push(['name', b.name]);
    if (b.pendingLabel !== undefined) cols.push(['pending_label', b.pendingLabel || `the ${(b.name ?? 'event').replace(/^the\s+/i, '')}`]);
    if (b.startsAt !== undefined) cols.push(['starts_at', b.startsAt]);
    if (b.venue !== undefined) cols.push(['venue', b.venue]);
    if (b.address !== undefined) cols.push(['address', b.address]);
    if (b.mapUrl !== undefined) cols.push(['map_url', b.mapUrl]);
    if (b.catered !== undefined) cols.push(['catered', b.catered ? 1 : 0]);
    if (b.hasSeating !== undefined) cols.push(['has_seating', b.hasSeating ? 1 : 0]);
    if (b.questions !== undefined) cols.push(['questions', JSON.stringify(b.questions)]);
    if (b.sort !== undefined) cols.push(['sort', b.sort]);
    const res = await c.env.DB.prepare(
      `UPDATE event SET ${[...cols.map(([k]) => `${k} = ?`), 'version = version + 1'].join(', ')}
        WHERE id = ? AND wedding_id = ? AND version = ? AND deleted_at IS NULL`,
    )
      .bind(...cols.map(([, val]) => val), c.req.param('id'), wid(c), v)
      .run();
    if (!res.meta.changes) {
      const there = await c.env.DB.prepare(`SELECT 1 FROM event WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(c.req.param('id'), wid(c)).first();
      return there ? err(c, 409, 'conflict', 'This event changed elsewhere. Reloaded: check it and try again.') : err(c, 404, 'not_found', 'That event no longer exists.');
    }
    await audit(c, 'event.edit', c.req.param('id'), { fields: cols.map(([k]) => k) }).run();
    return c.json({ events: await list(c) });
  });

  app.delete('/:id', writer, async (c) => {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return err(c, 428, 'version_required', 'Reload and try again.');
    const db = c.env.DB;
    const eventId = c.req.param('id');
    if (!(await db.prepare(`SELECT 1 FROM event WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(eventId, wid(c)).first())) return err(c, 404, 'not_found', 'That event no longer exists.');
    const live = await db.prepare(`SELECT COUNT(*) AS n FROM event WHERE wedding_id = ? AND deleted_at IS NULL`).bind(wid(c)).first<{ n: number }>();
    if ((live?.n ?? 0) <= 1) return err(c, 400, 'last_event', 'Keep at least one event. Rename this one instead.');
    // One batch: removed, gone from every invitation (so no RSVP, text, guide or list includes it), and
    // nobody keeps a seat there. The clean-up only happens if this removal is the one that happened (the
    // exact time stamp), so a losing click changes nothing. RSVPs stay, so support can put it back.
    const at = now();
    const [res] = await db.batch([
      db.prepare(`UPDATE event SET deleted_at = ?, version = version + 1 WHERE id = ? AND wedding_id = ? AND version = ? AND deleted_at IS NULL`).bind(at, eventId, wid(c), v),
      db.prepare(`DELETE FROM invite_event WHERE event_id = ?1 AND EXISTS (SELECT 1 FROM event WHERE id = ?1 AND deleted_at = ?2)`).bind(eventId, at),
      db.prepare(`DELETE FROM seat WHERE event_id = ?1 AND EXISTS (SELECT 1 FROM event WHERE id = ?1 AND deleted_at = ?2)`).bind(eventId, at),
    ]);
    if (!res!.meta.changes) return err(c, 409, 'conflict', 'This event changed elsewhere. Reloaded: check it and try again.');
    await audit(c, 'event.remove', eventId).run();
    return c.json({ events: await list(c) });
  });

  return app;
}

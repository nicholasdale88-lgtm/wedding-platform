import { randomToken } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { changeDoc, readDoc } from './planner';

/**
 * The day-of coordinator: one trusted person (a friend, the venue coordinator) gets a private link with
 * everything for running the day: the full run sheet, every supplier with arrival time and phone, the
 * wedding party with their numbers, who holds what, the speeches, the photo list; and a log of issues
 * they keep (and tick off) as the day goes. Admin: /api/a/w/:wid/coordinator. Page: /api/p/:slug/coordinator?k=
 */

type C = Context<AdminEnv>;
type Coord = { key: string; name: string };
const coordOf = async (db: D1Database, where: string, bind: string) =>
  (await db.prepare(`SELECT id, slug, name1, name2, json_extract(content, '$.coordinator') AS c FROM wedding WHERE ${where} AND deleted_at IS NULL`).bind(bind).first<{ id: string; slug: string; name1: string; name2: string; c: string | null }>()) ?? null;

export function coordinatorAdminRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const out = (c: C, slug: string, co: Coord | null) => ({
    on: !!co?.key,
    name: co?.name ?? '',
    url: co?.key ? `${(c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '')}/w/${slug}/coordinator?k=${co.key}` : '',
  });
  app.get('/', async (c) => {
    const w = await coordOf(c.env.DB, 'id = ?', c.req.param('wid')!);
    if (!w) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    return c.json(out(c, w.slug, w.c ? (JSON.parse(w.c) as Coord) : null));
  });
  /** On (with their name; "new link" makes a fresh one), or off. */
  app.put('/', requireMember('owner', 'editor'), async (c) => {
    const b = z.object({ on: z.boolean(), name: z.string().trim().max(80).optional(), fresh: z.boolean().optional() }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'That didn’t save.' } }, 400);
    const w = await coordOf(c.env.DB, 'id = ?', c.req.param('wid')!);
    if (!w) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    const cur = w.c ? (JSON.parse(w.c) as Coord) : null;
    const next: Coord | null = b.data.on ? { key: !cur?.key || b.data.fresh ? randomToken(24) : cur.key, name: b.data.name ?? cur?.name ?? '' } : null;
    await c.env.DB.prepare(next ? `UPDATE wedding SET content = json_set(content, '$.coordinator', json(?)) WHERE id = ?` : `UPDATE wedding SET content = json_remove(content, '$.coordinator') WHERE id = ?`)
      .bind(...(next ? [JSON.stringify(next), w.id] : [w.id]))
      .run();
    return c.json(out(c, w.slug, next));
  });
  return app;
}

export function coordinatorPageRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const check = async (c: Context<{ Bindings: Env }>, k: string) => {
    const w = await coordOf(c.env.DB, 'slug = ?', c.req.param('slug') ?? '');
    const co = w?.c ? (JSON.parse(w.c) as Coord) : null;
    return w && co?.key && k.length >= 20 && k === co.key ? { w, co } : null;
  };

  app.get('/', async (c) => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `coord:${ip}`, 240, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const ok = await check(c, c.req.query('k') ?? '');
    if (!ok) return c.json({ error: { code: 'no_link', message: 'This link isn’t working. Ask the couple for the coordinator link.' } }, 404);
    const { w, co } = ok;
    const db = c.env.DB;
    const { results: events } = await db.prepare(`SELECT key, name, starts_at, venue, address FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(w.id).all<{ key: string; name: string; starts_at: string; venue: string | null; address: string | null }>();
    const first = events[0];
    const [sheet, vendors, day, shots, log, setup] = await Promise.all([
      first ? readDoc(db, w.id, 'party-runsheet', first.key) : null,
      readDoc(db, w.id, 'vendors', ''),
      first ? readDoc(db, w.id, 'day-roles', first.key) : null,
      first ? readDoc(db, w.id, 'shots', first.key) : null,
      readDoc(db, w.id, 'coord-log', ''),
      readDoc(db, w.id, 'party-setup', ''),
    ]);
    const { results: party } = await db
      .prepare(
        `SELECT p.name, p.party_role AS role, i.phone FROM person p JOIN invitation i ON i.id = p.invitation_id
          WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND p.party_role != '' ORDER BY p.party_role, p.name`,
      )
      .bind(w.id)
      .all<{ name: string; role: string; phone: string | null }>();
    return c.json({
      couple: `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`,
      name: co.name,
      sides: setup.data,
      event: first ? { name: first.name, startsAt: first.starts_at, venue: first.venue ?? '', address: first.address ?? '' } : null,
      note: sheet?.data.note ?? '',
      items: sheet?.data.items ?? [],
      vendors: vendors.data.list.filter((v) => v.status === 'booked').map((v) => ({ name: v.name, category: v.category, contact: v.contact, phone: v.phone, arrival: v.arrival, meals: v.meals, notes: v.notes })),
      party: party.map((p) => ({ name: p.name, role: p.role, phone: p.phone ?? '' })),
      holds: day?.data.holds ?? [],
      speeches: day?.data.speeches.map((s) => ({ who: s.who, minutes: s.minutes, mic: s.mic })) ?? [],
      shots: shots?.data.shots.map((s) => ({ shot: s.shot, who: s.who })) ?? [],
      log: log.data.entries,
    });
  });

  /** The issues log: add a note, or tick one off. */
  app.post('/', async (c) => {
    const b = z
      .object({ k: z.string().max(60), action: z.enum(['add', 'done', 'undo']), text: z.string().trim().min(1).max(300).optional(), id: z.string().max(40).optional() })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'That didn’t save.' } }, 400);
    const ok = await check(c, b.data.k);
    if (!ok) return c.json({ error: { code: 'no_link', message: 'This link isn’t working.' } }, 404);
    if (!(await allow(c.env.DB, `coord-log:${ok.w.id}`, 300, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    if (b.data.action === 'add' && (await readDoc(c.env.DB, ok.w.id, 'coord-log', '')).data.entries.length >= 200) {
      return c.json({ error: { code: 'full', message: 'The log is full (200 notes). Tick off or clear some first.' } }, 400);
    }
    const saved = await changeDoc(c.env.DB, ok.w.id, 'coord-log', '', (d) => {
      if (b.data.action === 'add' && b.data.text) d.entries.unshift({ id: crypto.randomUUID().slice(0, 10), at: new Date().toISOString(), text: b.data.text, done: false });
      else {
        const e = d.entries.find((x) => x.id === b.data.id);
        if (e) e.done = b.data.action === 'done';
      }
    });
    if (!saved) return c.json({ error: { code: 'busy', message: 'Busy, try again.' } }, 409);
    return c.json({ log: (await readDoc(c.env.DB, ok.w.id, 'coord-log', '')).data.entries });
  });
  return app;
}

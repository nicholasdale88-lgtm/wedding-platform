import { isToken } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { mediaResponse, openPhoto } from '../photos/store';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * The shared album: once the couple switches it on, each guest (with their own link) can see and save
 * everyone's photos from the events they were invited to. Off by default; off again hides it.
 * Admin: /api/a/w/:wid/album. Guests: /api/p/:slug/album?g=… (and each photo).
 */

type C = Context<AdminEnv>;
export function albumAdminRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const state = async (c: C) =>
    !!(await c.env.DB.prepare(`SELECT json_extract(content, '$.albumShared') AS on_ FROM wedding WHERE id = ?`).bind(c.req.param('wid')).first<{ on_: number | null }>())?.on_;
  app.get('/', async (c) => c.json({ on: await state(c) }));
  app.put('/', requireMember('owner', 'editor'), async (c) => {
    const body = z.object({ on: z.boolean() }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json({ error: { code: 'invalid', message: 'Choose on or off.' } }, 400);
    await c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.albumShared', json(?)) WHERE id = ? AND json_valid(content)`)
      .bind(body.data.on ? 'true' : 'false', c.req.param('wid'))
      .run();
    return c.json({ on: await state(c) });
  });
  return app;
}

type GC = Context<{ Bindings: Env }>;
async function guestOf(c: GC) {
  const token = c.req.query('g') ?? '';
  const w = await c.env.DB.prepare(`SELECT id, name1, name2, theme, json_extract(content, '$.albumShared') AS shared FROM wedding WHERE slug = ? AND deleted_at IS NULL`)
    .bind(c.req.param('slug'))
    .first<{ id: string; name1: string; name2: string; theme: string; shared: number | null }>();
  if (!w || !isToken(token)) return null;
  const inv = await c.env.DB.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>();
  if (!inv) return null;
  const { results } = await c.env.DB.prepare(`SELECT e.key, e.name FROM event e JOIN invite_event ie ON ie.event_id = e.id AND ie.invitation_id = ? WHERE e.deleted_at IS NULL ORDER BY e.sort`)
    .bind(inv.id)
    .all<{ key: string; name: string }>();
  return { w, inv, events: results };
}

export function albumGuestRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/', async (c) => {
    const g = await guestOf(c);
    if (!g) return c.json({ error: { code: 'no_link', message: 'Please open this from the link you were sent.' } }, 404);
    if (!g.w.shared) return c.json({ error: { code: 'not_yet', message: 'The album isn’t open yet. The couple will share it after the day.' } }, 404);
    const keys = g.events.map((e) => e.key);
    const { results } = await c.env.DB.prepare(
      `SELECT m.id, m.created_at, m.event_key, m.content_type, m.edit, COALESCE(m.uploaded_by, (SELECT p.name FROM person p WHERE p.invitation_id = m.invitation_id AND p.idx = 0), '') AS by
         FROM media m WHERE m.wedding_id = ? AND m.kind IN ('photo', 'video') AND m.deleted_at IS NULL ORDER BY m.created_at LIMIT 3000`,
    )
      .bind(g.w.id)
      .all<{ id: string; created_at: string; event_key: string | null; content_type: string | null; edit: string | null; by: string }>();
    const tok = encodeURIComponent(c.req.query('g')!);
    return c.json({
      couple: `${g.w.name1.split(' ')[0]} & ${g.w.name2.split(' ')[0]}`,
      theme: g.w.theme,
      events: g.events,
      // Photos from their own events (and older ones from before albums were split).
      photos: results
        .filter((p) => !p.event_key || keys.includes(p.event_key))
        .map((p) => ({ id: p.id, at: p.created_at, event: p.event_key, by: p.by, video: (p.content_type ?? '').startsWith('video/'), look: p.edit ?? '', url: `/api/p/${encodeURIComponent(c.req.param('slug') ?? '')}/album/${p.id}?g=${tok}` })),
    });
  });
  app.get('/:id', async (c) => {
    const g = await guestOf(c);
    if (!g || !g.w.shared) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    // Per guest, not per address: a family on one Wi-Fi (or everyone at the venue) shares an IP.
    if (!(await allow(c.env.DB, `album:${g.inv.id}`, 4000, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a little.' } }, 429);
    const row = await c.env.DB.prepare(`SELECT key, content_type, event_key FROM media WHERE id = ? AND wedding_id = ? AND kind IN ('photo', 'video') AND deleted_at IS NULL`)
      .bind(c.req.param('id'), g.w.id)
      .first<{ key: string; content_type: string; event_key: string | null }>();
    if (!row || (row.event_key && !g.events.some((e) => e.key === row.event_key))) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    const res = await openPhoto(c.env, g.w.id, row.key, c.req.header('Range'));
    if (!res?.ok || !res.body) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    return mediaResponse(res, row.content_type);
  });
  return app;
}

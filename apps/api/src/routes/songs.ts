import { dropControls, isToken } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Song requests. Guests (/api/p/:slug/songs): ask for a song from their own page, and see what they asked
 * for. The couple (/api/a/w/:wid/songs): every request with who asked, marked must play / maybe /
 * don't play for the DJ, plus their own.
 */

const Song = z.object({ title: z.string().trim().min(1).max(120), artist: z.string().trim().max(120).default(''), note: z.string().trim().max(300).default('') });

type GC = Context<{ Bindings: Env }>;
const gerr = (c: GC, status: 400 | 404 | 429, code: string, message: string) => c.json({ error: { code, message } }, status);

async function guestOf(c: GC, token: string) {
  const w = await c.env.DB.prepare(`SELECT id FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug')).first<{ id: string }>();
  if (!w || !isToken(token)) return null;
  const inv = await c.env.DB.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>();
  return inv ? { w, inv } : null;
}

export function songGuestRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/', async (c) => {
    const g = await guestOf(c, c.req.query('g') ?? '');
    if (!g) return gerr(c, 404, 'no_link', 'Please open this from the link you were sent.');
    const { results } = await c.env.DB.prepare(`SELECT id, title, artist, created_at FROM song_request WHERE invitation_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 30`)
      .bind(g.inv.id)
      .all<{ id: string; title: string; artist: string; created_at: string }>();
    return c.json({ songs: results.map((r) => ({ id: r.id, title: r.title, artist: r.artist, at: r.created_at })) });
  });
  app.post('/', async (c) => {
    const body = Song.extend({ token: z.string() }).strict().safeParse(await readJson(c.req.raw));
    const g = body.success ? await guestOf(c, body.data.token) : null;
    if (!body.success) return gerr(c, 400, 'invalid', 'Add the song’s name (and who sings it, if you know).');
    if (!g) return gerr(c, 404, 'no_link', 'Please open this from the link you were sent.');
    if (!(await allow(c.env.DB, `song:${g.inv.id}`, 10, 86_400_000))) return gerr(c, 429, 'slow_down', 'That’s plenty of songs for today. Thank you!');
    await c.env.DB.prepare(`INSERT INTO song_request (id, wedding_id, invitation_id, title, artist, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), g.w.id, g.inv.id, dropControls(body.data.title), dropControls(body.data.artist), dropControls(body.data.note), new Date().toISOString())
      .run();
    return c.json({ ok: true });
  });
  return app;
}

type C = Context<AdminEnv>;
const wid = (c: C) => c.req.param('wid')!;
const err = (c: C, status: 400 | 404, code: string, message: string) => c.json({ error: { code, message } }, status);

export function songAdminRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');
  const list = async (c: C) => {
    const { results } = await c.env.DB.prepare(
      `SELECT s.id, s.title, s.artist, s.note, s.status, s.created_at, s.invitation_id,
              (SELECT GROUP_CONCAT(name, ' & ') FROM (SELECT name FROM person WHERE invitation_id = s.invitation_id AND deleted_at IS NULL ORDER BY idx)) AS who
         FROM song_request s WHERE s.wedding_id = ? AND s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 500`,
    )
      .bind(wid(c))
      .all<{ id: string; title: string; artist: string; note: string; status: string; created_at: string; invitation_id: string | null; who: string | null }>();
    return results.map((r) => ({ id: r.id, title: r.title, artist: r.artist, note: r.note, status: r.status, at: r.created_at, by: r.invitation_id ? r.who || 'A guest' : 'You' }));
  };
  app.get('/', async (c) => c.json({ songs: await list(c) }));
  app.post('/', writer, async (c) => {
    const body = Song.extend({ status: z.enum(['must', 'maybe', 'no']).default('must') }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Add the song’s name.');
    await c.env.DB.prepare(`INSERT INTO song_request (id, wedding_id, invitation_id, title, artist, note, status, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), wid(c), body.data.title, body.data.artist, body.data.note, body.data.status, new Date().toISOString())
      .run();
    return c.json({ songs: await list(c) });
  });
  app.patch('/:id', writer, async (c) => {
    const body = z.object({ status: z.enum(['new', 'must', 'maybe', 'no']) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose must play, maybe or don’t play.');
    const r = await c.env.DB.prepare(`UPDATE song_request SET status = ? WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(body.data.status, c.req.param('id'), wid(c)).run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'That song is gone.');
    return c.json({ songs: await list(c) });
  });
  app.delete('/:id', writer, async (c) => {
    await c.env.DB.prepare(`UPDATE song_request SET deleted_at = ? WHERE id = ? AND wedding_id = ?`).bind(new Date().toISOString(), c.req.param('id'), wid(c)).run();
    return c.json({ songs: await list(c) });
  });
  return app;
}

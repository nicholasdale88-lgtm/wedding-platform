import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { openPhoto } from '../photos/store';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * The live photo wall: a full-screen slideshow of guests' photos and message-board posts for the venue's
 * screen on the night. It opens with a secret code (like the share-a-preview link): switching it off
 * makes the code stop working; on again makes a new one.
 * Admin: /api/a/w/:wid/live. Screen: /api/p/:slug/live?k=<code> (and its photos).
 */

type C = Context<AdminEnv>;
const wid = (c: C) => c.req.param('wid')!;
const code = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(15)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function liveAdminRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const read = async (c: C) =>
    (await c.env.DB.prepare(`SELECT json_extract(content, '$.liveWall') AS k, slug FROM wedding WHERE id = ?`).bind(wid(c)).first<{ k: string | null; slug: string }>()) ?? { k: null, slug: '' };

  app.get('/', async (c) => {
    const r = await read(c);
    // The code is a link to every guest photo: owners and editors only.
    return c.json({ on: !!r.k, code: c.get('role') === 'viewer' ? null : r.k, slug: r.slug });
  });

  app.put('/', requireMember('owner', 'editor'), async (c) => {
    const body = z.object({ on: z.boolean() }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json({ error: { code: 'invalid', message: 'Choose on or off.' } }, 400);
    // Only this key changes, so a page edit saved at the same moment is never lost.
    await c.env.DB.prepare(
      body.data.on
        ? `UPDATE wedding SET content = CASE WHEN json_type(content, '$.liveWall') = 'text' THEN content ELSE json_set(content, '$.liveWall', ?1) END WHERE id = ?2 AND json_valid(content)`
        : `UPDATE wedding SET content = json_remove(content, '$.liveWall') WHERE id = ?2 AND json_valid(content) AND ?1 IS NOT NULL`,
    )
      .bind(code(), wid(c))
      .run();
    await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), wid(c), c.get('user').id, body.data.on ? 'live.on' : 'live.off', wid(c), new Date().toISOString())
      .run();
    const r = await read(c);
    return c.json({ on: !!r.k, code: r.k, slug: r.slug });
  });
  return app;
}

export function liveScreenRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const wedding = async (c: Context<{ Bindings: Env }>) => {
    const k = c.req.query('k') ?? '';
    if (!/^[\w-]{16,40}$/.test(k)) return null;
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `live:${ip}`, 600, 3_600_000))) return null;
    return c.env.DB.prepare(`SELECT id, name1, name2, theme FROM wedding WHERE slug = ? AND deleted_at IS NULL AND json_extract(content, '$.liveWall') = ?`)
      .bind(c.req.param('slug'), k)
      .first<{ id: string; name1: string; name2: string; theme: string }>();
  };

  /** The newest photos and board posts, for the slideshow (it asks again every 20 seconds). */
  app.get('/', async (c) => {
    const w = await wedding(c);
    if (!w) return c.json({ error: { code: 'off', message: 'The photo wall is off. Switch it on in the admin (Photos).' } }, 404);
    const db = c.env.DB;
    const [photos, posts, leaders, quizOn] = await db.batch([
      db
        .prepare(
          `SELECT m.id, m.created_at, m.kind, m.edit, COALESCE(m.uploaded_by, (SELECT p.name FROM person p WHERE p.invitation_id = m.invitation_id AND p.idx = 0), '') AS by
             FROM media m WHERE m.wedding_id = ? AND m.kind IN ('photo', 'video') AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 80`,
        )
        .bind(w.id),
      db.prepare(`SELECT id, author, body, created_at FROM board_post WHERE wedding_id = ? AND status = 'shown' AND parent_id IS NULL ORDER BY created_at DESC LIMIT 30`).bind(w.id),
      // The quiz's top five, between the photos (when the quiz is on and someone has played).
      db.prepare(`SELECT name, score FROM quiz_answer WHERE wedding_id = ? ORDER BY score DESC, created_at LIMIT 5`).bind(w.id),
      db.prepare(`SELECT json_extract(data, '$.on') AS on_, json_array_length(json_extract(data, '$.questions')) AS n FROM planner_doc WHERE wedding_id = ? AND kind = 'quiz' AND scope = ''`).bind(w.id),
    ]);
    const quiz = quizOn!.results[0] as { on_: number | null; n: number | null } | undefined;
    const k = encodeURIComponent(c.req.query('k')!);
    return c.json({
      couple: `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`,
      theme: w.theme,
      photos: (photos!.results as { id: string; created_at: string; kind: string; edit: string | null; by: string }[]).map((p) => ({ id: p.id, at: p.created_at, by: p.by, video: p.kind === 'video', look: p.edit ?? '', url: `/api/p/${encodeURIComponent(c.req.param('slug') ?? '')}/live/photo/${p.id}?k=${k}` })),
      posts: (posts!.results as { id: string; author: string; body: string; created_at: string }[]).map((p) => ({ id: p.id, author: p.author, body: p.body.slice(0, 280), at: p.created_at })),
      quiz: quiz?.on_ && leaders!.results.length ? { of: quiz.n ?? 0, leaders: leaders!.results as { name: string; score: number }[] } : null,
    });
  });

  app.get('/photo/:id', async (c) => {
    const w = await wedding(c);
    if (!w) return c.json({ error: { code: 'off', message: 'Not found' } }, 404);
    const row = await c.env.DB.prepare(`SELECT key, content_type FROM media WHERE id = ? AND wedding_id = ? AND kind IN ('photo', 'video') AND deleted_at IS NULL`)
      .bind(c.req.param('id'), w.id)
      .first<{ key: string; content_type: string }>();
    const res = row ? await openPhoto(c.env, w.id, row.key) : null;
    if (!row || !res?.ok || !res.body) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    return new Response(res.body, {
      headers: { 'content-type': row.content_type, 'cache-control': 'private, max-age=3600', 'content-security-policy': "default-src 'none'", 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin' },
    });
  });
  return app;
}

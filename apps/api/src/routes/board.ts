import { dropControls, isToken } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson, safeJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * The message board: a public wall on the guests' pages. Guests (with their own link) post messages of
 * support, heart each other's posts and reply; the couple replies, pins, and approves or hides posts.
 * Settings in wedding.content.board: { on, approve } (approve: new posts wait for the couple).
 *   Guests  /api/p/:slug/board     GET ?g=, POST {token, body, parent?}, POST /:id/like {token}, DELETE /:id {token}
 *   Couple  /api/a/w/:wid/board    GET, PUT /settings, POST {body, parent?}, PATCH /:id {status?, pinned?}, DELETE /:id
 */

export interface BoardSettings {
  on: boolean;
  approve: boolean;
}
const settingsOf = (content: string | null): BoardSettings => {
  try {
    const b = safeJson<{ board?: Partial<BoardSettings> }>(content, {}).board ?? {};
    return { on: b.on !== false, approve: !!b.approve };
  } catch {
    return { on: true, approve: false };
  }
};

interface Row {
  id: string;
  invitation_id: string | null;
  author: string;
  body: string;
  parent_id: string | null;
  status: 'shown' | 'pending' | 'hidden';
  pinned: number;
  created_at: string;
  likes: number;
}

async function rowsOf(db: D1Database, weddingId: string) {
  const { results } = await db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM board_like l WHERE l.post_id = p.id) AS likes
         FROM board_post p WHERE p.wedding_id = ? ORDER BY p.created_at LIMIT 2000`,
    )
    .bind(weddingId)
    .all<Row>();
  return results;
}

/** Posts newest first (pinned on top), each with its replies oldest first. */
function shape<T extends { id: string; parentId: string | null; pinned: boolean; at: string }>(posts: T[]) {
  const top = posts.filter((p) => !p.parentId);
  const replies = posts.filter((p) => p.parentId);
  return top
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at))
    .map((p) => ({ ...p, replies: replies.filter((r) => r.parentId === p.id).sort((a, b) => a.at.localeCompare(b.at)) }));
}

// ---------------------------------------------------------------- guests

type GEnv = { Bindings: Env };
type GC = Context<GEnv>;
const gerr = (c: GC, status: 400 | 403 | 404 | 429, code: string, message: string) => c.json({ error: { code, message } }, status);

async function guestOf(c: GC, token: string) {
  const db = c.env.DB;
  const w = await db
    .prepare(`SELECT id, name1, name2, content, theme FROM wedding WHERE slug = ? AND deleted_at IS NULL`)
    .bind(c.req.param('slug'))
    .first<{ id: string; name1: string; name2: string; content: string; theme: string }>();
  if (!w || !isToken(token)) return null;
  const inv = await db
    .prepare(
      `SELECT i.id, (SELECT GROUP_CONCAT(name, ' & ') FROM (SELECT name FROM person WHERE invitation_id = i.id AND deleted_at IS NULL AND name <> '' ORDER BY idx)) AS names
         FROM invitation i WHERE i.token = ? AND i.wedding_id = ? AND i.deleted_at IS NULL`,
    )
    .bind(token, w.id)
    .first<{ id: string; names: string | null }>();
  return inv ? { w, inv, settings: settingsOf(w.content) } : null;
}

export function boardGuestRoutes() {
  const app = new Hono<GEnv>();

  app.get('/', async (c) => {
    const g = await guestOf(c, c.req.query('g') ?? '');
    if (!g) return gerr(c, 404, 'no_link', 'Please open the board from the link in your text.');
    const couple = `${g.w.name1.split(' ')[0]} & ${g.w.name2.split(' ')[0]}`;
    if (!g.settings.on) return c.json({ on: false, approve: false, couple, theme: g.w.theme, me: g.inv.names ?? '', posts: [] });
    const rows = await rowsOf(c.env.DB, g.w.id);
    const { results: liked } = await c.env.DB.prepare(`SELECT post_id FROM board_like WHERE invitation_id = ?`).bind(g.inv.id).all<{ post_id: string }>();
    const mine = new Set(liked.map((l) => l.post_id));
    // Guests see what's shown, plus their own posts still waiting for approval (marked as such).
    const visible = rows.filter((r) => r.status === 'shown' || (r.status === 'pending' && r.invitation_id === g.inv.id));
    const shownIds = new Set(visible.map((r) => r.id));
    const posts = visible
      .filter((r) => !r.parent_id || shownIds.has(r.parent_id))
      .map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        author: r.author,
        body: r.body,
        at: r.created_at,
        pinned: !!r.pinned,
        couple: !r.invitation_id,
        mine: r.invitation_id === g.inv.id,
        pending: r.status === 'pending',
        likes: r.likes,
        liked: mine.has(r.id),
      }));
    return c.json({ on: true, approve: g.settings.approve, couple, theme: g.w.theme, me: g.inv.names ?? '', posts: shape(posts) });
  });

  app.post('/', async (c) => {
    const body = z
      .object({ token: z.string(), body: z.string().trim().min(1).max(800), parent: z.string().max(60).optional() })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!body.success) return gerr(c, 400, 'invalid', 'Write your message first (up to 800 characters).');
    const g = await guestOf(c, body.data.token);
    if (!g) return gerr(c, 404, 'no_link', 'Please open the board from the link in your text.');
    if (!g.settings.on) return gerr(c, 403, 'closed', 'The message board is closed.');
    const db = c.env.DB;
    if (!(await allow(db, `board:${g.inv.id}`, 20, 3_600_000))) return gerr(c, 429, 'slow_down', 'That is a lot of posts. Please wait a little and try again.');
    if (body.data.parent) {
      const parent = await db.prepare(`SELECT id FROM board_post WHERE id = ? AND wedding_id = ? AND parent_id IS NULL AND status = 'shown'`).bind(body.data.parent, g.w.id).first();
      if (!parent) return gerr(c, 404, 'not_found', 'That post is no longer on the board.');
    }
    const status = g.settings.approve ? 'pending' : 'shown';
    await db
      .prepare(`INSERT INTO board_post (id, wedding_id, invitation_id, author, body, parent_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), g.w.id, g.inv.id, g.inv.names || 'A guest', dropControls(body.data.body), body.data.parent ?? null, status, new Date().toISOString())
      .run();
    return c.json({ ok: true, pending: status === 'pending' });
  });

  app.post('/:id/like', async (c) => {
    const body = z.object({ token: z.string() }).strict().safeParse(await readJson(c.req.raw));
    const g = body.success ? await guestOf(c, body.data.token) : null;
    if (!g) return gerr(c, 404, 'no_link', 'Please open the board from the link in your text.');
    const db = c.env.DB;
    const post = await db.prepare(`SELECT id FROM board_post WHERE id = ? AND wedding_id = ? AND status = 'shown'`).bind(c.req.param('id'), g.w.id).first<{ id: string }>();
    if (!post) return gerr(c, 404, 'not_found', 'That post is no longer on the board.');
    if (!(await allow(db, `like:${g.inv.id}`, 300, 3_600_000))) return gerr(c, 429, 'slow_down', 'That is a lot of hearts. Please wait a little.');
    // A heart toggles: tap again to take it back. (Insert-or-nothing first, so a double tap can't collide.)
    const added = await db
      .prepare(`INSERT INTO board_like (post_id, invitation_id, created_at) VALUES (?, ?, ?) ON CONFLICT (post_id, invitation_id) DO NOTHING`)
      .bind(post.id, g.inv.id, new Date().toISOString())
      .run();
    if (!added.meta.changes) await db.prepare(`DELETE FROM board_like WHERE post_id = ? AND invitation_id = ?`).bind(post.id, g.inv.id).run();
    const n = await db.prepare(`SELECT COUNT(*) AS n FROM board_like WHERE post_id = ?`).bind(post.id).first<{ n: number }>();
    return c.json({ liked: !!added.meta.changes, likes: n?.n ?? 0 });
  });

  app.delete('/:id', async (c) => {
    const body = z.object({ token: z.string() }).strict().safeParse(await readJson(c.req.raw));
    const g = body.success ? await guestOf(c, body.data.token) : null;
    if (!g) return gerr(c, 404, 'no_link', 'Please open the board from the link in your text.');
    const db = c.env.DB;
    const id = c.req.param('id');
    const own = await db.prepare(`SELECT id FROM board_post WHERE id = ? AND wedding_id = ? AND invitation_id = ?`).bind(id, g.w.id, g.inv.id).first();
    if (!own) return gerr(c, 404, 'not_found', 'You can only remove your own posts.');
    await db.batch([
      db.prepare(`DELETE FROM board_like WHERE post_id IN (SELECT id FROM board_post WHERE id = ?1 OR parent_id = ?1)`).bind(id),
      db.prepare(`DELETE FROM board_post WHERE id = ?1 OR parent_id = ?1`).bind(id),
    ]);
    return c.json({ ok: true });
  });

  return app;
}

// ---------------------------------------------------------------- the couple

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid') ?? '';

export function boardAdminRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');
  const audit = (c: C, action: string, target: string) =>
    c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), c.get('user').id, action, target, new Date().toISOString());

  const payload = async (c: C) => {
    const w = await c.env.DB.prepare(`SELECT content FROM wedding WHERE id = ?`).bind(wid(c)).first<{ content: string }>();
    const rows = await rowsOf(c.env.DB, wid(c));
    const posts = rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      invitationId: r.invitation_id,
      author: r.author,
      body: r.body,
      at: r.created_at,
      pinned: !!r.pinned,
      couple: !r.invitation_id,
      status: r.status,
      likes: r.likes,
    }));
    return { settings: settingsOf(w?.content ?? null), pending: rows.filter((r) => r.status === 'pending').length, posts: shape(posts) };
  };

  app.get('/', async (c) => c.json(await payload(c)));

  app.put('/settings', writer, async (c) => {
    const body = z.object({ on: z.boolean(), approve: z.boolean() }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Check the settings and try again.');
    // Only the board's settings change (json_set), so a page edit saved at the same moment is never lost.
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE wedding SET content = json_set(CASE WHEN json_valid(content) THEN content ELSE '{}' END, '$.board', json(?)), version = version + 1 WHERE id = ?`).bind(
        JSON.stringify(body.data),
        wid(c),
      ),
      audit(c, 'board.settings', wid(c)),
    ]);
    return c.json(await payload(c));
  });

  app.post('/', writer, async (c) => {
    const body = z.object({ body: z.string().trim().min(1).max(800), parent: z.string().max(60).optional() }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Write your message first (up to 800 characters).');
    const w = await c.env.DB.prepare(`SELECT name1, name2 FROM wedding WHERE id = ?`).bind(wid(c)).first<{ name1: string; name2: string }>();
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    if (body.data.parent) {
      const p = await c.env.DB.prepare(`SELECT id FROM board_post WHERE id = ? AND wedding_id = ? AND parent_id IS NULL`).bind(body.data.parent, wid(c)).first();
      if (!p) return err(c, 404, 'not_found', 'That post is no longer on the board.');
    }
    const id = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO board_post (id, wedding_id, invitation_id, author, body, parent_id, status, created_at) VALUES (?, ?, NULL, ?, ?, ?, 'shown', ?)`)
        .bind(id, wid(c), `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`, dropControls(body.data.body), body.data.parent ?? null, new Date().toISOString()),
      // Replying to a post that was waiting approves it: the couple has clearly read it.
      ...(body.data.parent ? [c.env.DB.prepare(`UPDATE board_post SET status = 'shown' WHERE id = ? AND status = 'pending'`).bind(body.data.parent)] : []),
      audit(c, 'board.post', id),
    ]);
    return c.json(await payload(c));
  });

  app.patch('/:id', writer, async (c) => {
    const body = z.object({ status: z.enum(['shown', 'hidden']).optional(), pinned: z.boolean().optional() }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Check the change and try again.');
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.data.status) {
      sets.push('status = ?');
      vals.push(body.data.status);
    }
    if (body.data.pinned !== undefined) {
      sets.push('pinned = ?');
      vals.push(body.data.pinned ? 1 : 0);
    }
    if (!sets.length) return c.json(await payload(c));
    const res = await c.env.DB.prepare(`UPDATE board_post SET ${sets.join(', ')} WHERE id = ? AND wedding_id = ?`).bind(...vals, c.req.param('id'), wid(c)).run();
    if (!res.meta.changes) return err(c, 404, 'not_found', 'That post is no longer on the board.');
    await audit(c, `board.${body.data.status ?? (body.data.pinned ? 'pin' : 'unpin')}`, c.req.param('id')).run();
    return c.json(await payload(c));
  });

  app.delete('/:id', writer, async (c) => {
    const id = c.req.param('id');
    const own = await c.env.DB.prepare(`SELECT id FROM board_post WHERE id = ? AND wedding_id = ?`).bind(id, wid(c)).first();
    if (!own) return err(c, 404, 'not_found', 'That post is no longer on the board.');
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM board_like WHERE post_id IN (SELECT id FROM board_post WHERE id = ?1 OR parent_id = ?1)`).bind(id),
      c.env.DB.prepare(`DELETE FROM board_post WHERE id = ?1 OR parent_id = ?1`).bind(id),
      audit(c, 'board.delete', id),
    ]);
    return c.json(await payload(c));
  });

  return app;
}

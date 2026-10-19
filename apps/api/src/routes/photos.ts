import { Hono, type Context } from 'hono';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Admin → Photos (/api/a/w/:wid/photos): the album guests built. Photos live privately in R2;
 * only members of this wedding can list or open them (the image route checks the session too).
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 404 | 503, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;

export function photoRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());

  app.get('/', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT m.id, m.uploaded_by, m.created_at, m.bytes, m.content_type,
              (SELECT p.name FROM person p WHERE p.invitation_id = m.invitation_id AND p.idx = 0) AS guest
         FROM media m WHERE m.wedding_id = ? AND m.kind = 'photo' AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 5000`,
    )
      .bind(wid(c))
      .all<{ id: string; uploaded_by: string | null; created_at: string; bytes: number; content_type: string; guest: string | null }>();
    return c.json({
      enabled: !!c.env.MEDIA,
      items: results.map((r) => ({
        id: r.id,
        by: r.uploaded_by || r.guest || 'A guest',
        at: r.created_at,
        bytes: r.bytes,
        type: r.content_type,
        url: `/api/a/w/${wid(c)}/photos/${r.id}`,
      })),
    });
  });

  /** The photo itself, for members only. Never cached by shared caches. */
  app.get('/:id', async (c) => {
    if (!c.env.MEDIA) return err(c, 503, 'closed', 'Photo storage is not switched on yet.');
    const row = await c.env.DB.prepare(`SELECT key, content_type FROM media WHERE id = ? AND wedding_id = ? AND kind = 'photo' AND deleted_at IS NULL`)
      .bind(c.req.param('id'), wid(c))
      .first<{ key: string; content_type: string }>();
    const obj = row && (await c.env.MEDIA.get(row.key));
    if (!row || !obj) return err(c, 404, 'not_found', 'Photo not found.');
    return new Response(obj.body, {
      headers: { 'content-type': row.content_type, 'cache-control': 'private, max-age=86400', 'content-security-policy': "default-src 'none'", 'x-content-type-options': 'nosniff' },
    });
  });

  app.delete('/:id', requireMember('owner', 'editor'), async (c) => {
    const row = await c.env.DB.prepare(`SELECT key FROM media WHERE id = ? AND wedding_id = ? AND kind = 'photo' AND deleted_at IS NULL`)
      .bind(c.req.param('id'), wid(c))
      .first<{ key: string }>();
    if (!row) return err(c, 404, 'not_found', 'Photo not found.');
    await c.env.DB.prepare(`UPDATE media SET deleted_at = ? WHERE id = ?`).bind(new Date().toISOString(), c.req.param('id')).run();
    await c.env.MEDIA?.delete(row.key);
    await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, 'photo.delete', ?, ?)`)
      .bind(crypto.randomUUID(), wid(c), c.get('user').id, c.req.param('id'), new Date().toISOString())
      .run();
    return c.json({ ok: true });
  });

  return app;
}

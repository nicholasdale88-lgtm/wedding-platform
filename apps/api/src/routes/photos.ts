import { dropControls } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { imageType } from '../lib/images';
import { MAX_PHOTO, readBytes } from '../lib/security';
import { canStore, linkKey, openPhoto, storePhoto } from '../photos/store';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Admin → Photos (/api/a/w/:wid/photos): the album guests built. Photos live privately in R2 and/or the
 * couple's linked storage (photos/store.ts);
 * only members of this wedding can list or open them (the image route checks the session too).
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 404 | 413 | 415 | 502 | 503, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;

export function photoRoutes() {
  const app = new Hono<AdminEnv>();
  // Uploads send the photo itself, not JSON. The custom X-Photo-Upload header still forces a CORS
  // preflight, so another site cannot post photos here with the couple's cookie.
  app.use('*', (c, next) => (c.req.method === 'PUT' && c.req.header('X-Photo-Upload') === '1' ? next() : jsonWritesOnly(c, next)), requireUser, requireMember());

  /**
   * The couple adds a photo to an event's album (e.g. the photos from a group chat export). Named after
   * a hash of the photo, so importing the same chat twice adds nothing new.
   */
  app.put('/upload', requireMember('owner', 'editor'), async (c) => {
    if (!(await canStore(c.env, wid(c)))) return err(c, 503, 'closed', 'Photo storage is not switched on yet, and no Google Drive, Dropbox or OneDrive is linked.');
    const bytes = await readBytes(c.req.raw, MAX_PHOTO);
    if (!bytes) return err(c, 413, 'too_large', 'That photo is too large.');
    const kind = imageType(bytes);
    if (!kind) return err(c, 415, 'not_photo', 'That file is not a photo.');
    let by = '';
    try {
      by = dropControls(decodeURIComponent(c.req.header('X-Photo-By') ?? '')).trim().slice(0, 120);
    } catch {
      /* a garbled name is just left off */
    }
    const evKey = c.req.query('event') ?? '';
    const ev = evKey
      ? await c.env.DB.prepare(`SELECT key FROM event WHERE wedding_id = ? AND key = ? AND deleted_at IS NULL`).bind(wid(c), evKey).first<{ key: string }>()
      : null;
    if (evKey && !ev) return err(c, 404, 'not_found', 'That event no longer exists.');
    const r = await storePhoto(c.env, (p) => c.executionCtx.waitUntil(p), { weddingId: wid(c), bytes, kind, by, invitationId: null, eventKey: ev?.key ?? null });
    if (!r.ok) return err(c, r.status, 'not_saved', r.message);
    if (!r.duplicate) {
      await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, 'photo.upload', ?, ?)`)
        .bind(crypto.randomUUID(), wid(c), c.get('user').id, r.id, new Date().toISOString())
        .run();
    }
    return c.json({ ok: true, id: r.id, duplicate: r.duplicate });
  });

  app.get('/', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT m.id, m.uploaded_by, m.created_at, m.bytes, m.content_type, m.event_key,
              (SELECT p.name FROM person p WHERE p.invitation_id = m.invitation_id AND p.idx = 0) AS guest
         FROM media m WHERE m.wedding_id = ? AND m.kind = 'photo' AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 5000`,
    )
      .bind(wid(c))
      .all<{ id: string; uploaded_by: string | null; created_at: string; bytes: number; content_type: string; event_key: string | null; guest: string | null }>();
    return c.json({
      enabled: await canStore(c.env, wid(c)),
      siteStorage: !!c.env.MEDIA,
      items: results.map((r) => ({
        id: r.id,
        by: r.uploaded_by || r.guest || 'A guest',
        at: r.created_at,
        bytes: r.bytes,
        type: r.content_type,
        event: r.event_key, // which event's album (null: before albums were split)
        url: `/api/a/w/${wid(c)}/photos/${r.id}`,
      })),
    });
  });

  /** The photo itself, for members only. Never cached by shared caches. */
  app.get('/:id', async (c) => {
    const row = await c.env.DB.prepare(`SELECT key, content_type FROM media WHERE id = ? AND wedding_id = ? AND kind = 'photo' AND deleted_at IS NULL`)
      .bind(c.req.param('id'), wid(c))
      .first<{ key: string; content_type: string }>();
    if (!row) return err(c, 404, 'not_found', 'Photo not found.');
    if (!c.env.MEDIA && !linkKey(row.key)) return err(c, 503, 'closed', 'Photo storage is not switched on yet.');
    const res = await openPhoto(c.env, wid(c), row.key);
    if (!res?.ok || !res.body) return err(c, 404, 'not_found', 'Photo not found (it may have been moved or removed from the linked storage).');
    return new Response(res.body, {
      headers: { 'content-type': row.content_type, 'cache-control': 'private, max-age=86400', 'content-security-policy': "default-src 'none'", 'x-content-type-options': 'nosniff' },
    });
  });

  app.delete('/:id', requireMember('owner', 'editor'), async (c) => {
    const row = await c.env.DB.prepare(`SELECT key FROM media WHERE id = ? AND wedding_id = ? AND kind = 'photo' AND deleted_at IS NULL`)
      .bind(c.req.param('id'), wid(c))
      .first<{ key: string }>();
    if (!row) return err(c, 404, 'not_found', 'Photo not found.');
    await c.env.DB.prepare(`UPDATE media SET deleted_at = ? WHERE id = ?`).bind(new Date().toISOString(), c.req.param('id')).run();
    // From the site's own storage; a copy in the couple's linked storage is theirs to keep.
    if (!linkKey(row.key)) await c.env.MEDIA?.delete(row.key);
    await c.env.DB.prepare(`DELETE FROM photo_copy WHERE media_id = ? AND status != 'done'`).bind(c.req.param('id')).run();
    await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, 'photo.delete', ?, ?)`)
      .bind(crypto.randomUUID(), wid(c), c.get('user').id, c.req.param('id'), new Date().toISOString())
      .run();
    return c.json({ ok: true });
  });

  return app;
}

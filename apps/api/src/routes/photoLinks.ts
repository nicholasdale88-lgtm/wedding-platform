import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Env } from '../env';
import { SESSION_COOKIE, sessionId } from '../lib/auth';
import { seal } from '../lib/seal';
import { readJson } from '../lib/security';
import { PROVIDER, PROVIDER_NAME, PROVIDERS, providerReady, ProviderError, type ProviderKey } from '../photos/providers';
import { runCopies, SEAL_LABEL } from '../photos/store';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Linked photo storage. Admin (/api/a/w/:wid/photo-links): what is linked and how the copies are going,
 * connect, disconnect, copy existing photos. The provider sends the couple back to /api/oauth/callback,
 * which checks the one-time state AND that the same person is still signed in before keeping the link.
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 503, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;
const STATE_MINUTES = 15;
export const redirectUri = (env: Env) => `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/oauth/callback`;
const randomId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function photoLinkRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');
  const audit = (c: C, action: string, target: string) =>
    c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), c.get('user').id, action, target, new Date().toISOString());

  app.get('/', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT l.id, l.provider, l.account, l.status, l.last_error, l.created_at,
              SUM(CASE WHEN pc.status = 'done' THEN 1 ELSE 0 END) AS copied,
              SUM(CASE WHEN pc.status = 'pending' OR (pc.status = 'failed' AND pc.attempts < 6) THEN 1 ELSE 0 END) AS waiting,
              SUM(CASE WHEN pc.status = 'failed' AND pc.attempts >= 6 THEN 1 ELSE 0 END) AS failed,
              (SELECT pc2.error FROM photo_copy pc2 WHERE pc2.link_id = l.id AND pc2.status = 'failed' ORDER BY pc2.updated_at DESC LIMIT 1) AS copy_error
         FROM photo_link l LEFT JOIN photo_copy pc ON pc.link_id = l.id
        WHERE l.wedding_id = ? AND l.deleted_at IS NULL GROUP BY l.id ORDER BY l.created_at`,
    )
      .bind(wid(c))
      .all<{ id: string; provider: ProviderKey; account: string; status: string; last_error: string | null; created_at: string; copied: number | null; waiting: number | null; failed: number | null; copy_error: string | null }>();
    return c.json({
      siteStorage: !!c.env.MEDIA,
      redirectUri: redirectUri(c.env),
      providers: PROVIDERS.map((p) => ({ key: p, name: PROVIDER_NAME[p], ready: providerReady(c.env, p) })),
      links: results.map((r) => ({
        id: r.id,
        provider: r.provider,
        name: PROVIDER_NAME[r.provider],
        account: r.account,
        ok: r.status === 'ok',
        problem: r.status === 'ok' ? (r.failed ? r.copy_error : null) : r.last_error,
        copied: r.copied ?? 0,
        waiting: r.waiting ?? 0,
        failed: r.failed ?? 0,
        since: r.created_at,
      })),
    });
  });

  /** Start linking: where to send the couple (the provider's own sign-in). */
  app.post('/connect', writer, async (c) => {
    const body = z.object({ provider: z.enum(['gdrive', 'gphotos', 'dropbox', 'onedrive']) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose where to link.');
    const p = body.data.provider;
    if (!providerReady(c.env, p) || !c.env.SESSION_SECRET) return err(c, 503, 'not_set_up', `${PROVIDER_NAME[p]} isn't set up on this site yet. See the steps under it.`);
    const state = randomId();
    const now = new Date();
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM oauth_state WHERE created_at < ?`).bind(new Date(now.getTime() - STATE_MINUTES * 60_000).toISOString()),
      c.env.DB.prepare(`INSERT INTO oauth_state (id, wedding_id, user_id, provider, created_at) VALUES (?, ?, ?, ?, ?)`).bind(state, wid(c), c.get('user').id, p, now.toISOString()),
    ]);
    return c.json({ url: PROVIDER[p].authUrl(c.env, redirectUri(c.env), state) });
  });

  /** Stop copying there. Photos already copied stay in their storage (they're theirs). */
  app.delete('/:id', writer, async (c) => {
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(`UPDATE photo_link SET deleted_at = ? WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(new Date().toISOString(), id, wid(c)).run();
    if (!res.meta.changes) return err(c, 404, 'not_found', 'That link is already gone.');
    await c.env.DB.batch([c.env.DB.prepare(`DELETE FROM photo_copy WHERE link_id = ? AND status != 'done'`).bind(id), audit(c, 'photos.unlink', id)]);
    return c.json({ ok: true });
  });

  /** Copy every photo not there yet (and try failed ones again); the rest continue every 15 minutes. */
  app.post('/:id/copy-all', writer, async (c) => {
    const id = c.req.param('id');
    const link = await c.env.DB.prepare(`SELECT id FROM photo_link WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(id, wid(c)).first();
    if (!link) return err(c, 404, 'not_found', 'That link is gone.');
    const old = '2000-01-01T00:00:00.000Z'; // picked up straight away
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE photo_link SET status = 'ok', last_error = NULL WHERE id = ?`).bind(id),
      c.env.DB.prepare(`UPDATE photo_copy SET status = 'pending', attempts = 0, updated_at = ? WHERE link_id = ? AND status = 'failed'`).bind(old, id),
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO photo_copy (media_id, link_id, status, attempts, updated_at)
         SELECT m.id, ?, 'pending', 0, ? FROM media m WHERE m.wedding_id = ? AND m.kind = 'photo' AND m.deleted_at IS NULL AND m.key NOT LIKE 'link:' || ? || ':%'`,
      ).bind(id, old, wid(c), id),
      audit(c, 'photos.copy-all', id),
    ]);
    const queued = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM photo_copy WHERE link_id = ? AND status = 'pending'`).bind(id).first<{ n: number }>();
    c.executionCtx.waitUntil(runCopies(c.env, { linkId: id, limit: 25 }).catch(() => undefined));
    return c.json({ ok: true, queued: queued?.n ?? 0 });
  });

  return app;
}

/** /api/oauth/callback: the provider sends the couple back here after they allow access. */
export function oauthRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/callback', async (c) => {
    const base = c.env.PUBLIC_BASE_URL.replace(/\/$/, '');
    const state = c.req.query('state') ?? '';
    const row = state
      ? await c.env.DB.prepare(`SELECT wedding_id, user_id, provider, created_at FROM oauth_state WHERE id = ?`).bind(state).first<{ wedding_id: string; user_id: string; provider: ProviderKey; created_at: string }>()
      : null;
    if (row) await c.env.DB.prepare(`DELETE FROM oauth_state WHERE id = ?`).bind(state).run(); // used once
    const back = (q: string) => c.redirect(row ? `${base}/admin/${encodeURIComponent(row.wedding_id)}/photos?${q}` : `${base}/admin`, 302);
    if (!row || Date.now() - Date.parse(row.created_at) > STATE_MINUTES * 60_000) return back('link_error=expired');
    // Still the same signed-in person who started it (so a link can't be planted on someone else's wedding).
    const token = getCookie(c, SESSION_COOKIE);
    const me =
      token && c.env.SESSION_SECRET
        ? await c.env.DB.prepare(`SELECT user_id FROM session WHERE id = ? AND expires_at > ?`).bind(await sessionId(token, c.env.SESSION_SECRET), new Date().toISOString()).first<{ user_id: string }>()
        : null;
    if (me?.user_id !== row.user_id) return back('link_error=signed_out');
    if (c.req.query('error') || !c.req.query('code')) return back('link_error=declined');
    try {
      const t = await PROVIDER[row.provider].exchange(c.env, redirectUri(c.env), c.req.query('code')!);
      if (!t.refresh) return back('link_error=no_offline');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO photo_link (id, wedding_id, provider, account, refresh_enc, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
          id,
          row.wedding_id,
          row.provider,
          t.account.slice(0, 200),
          await seal(c.env.SESSION_SECRET!, SEAL_LABEL, t.refresh),
          now,
        ),
        c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, 'photos.link', ?, ?)`).bind(crypto.randomUUID(), row.wedding_id, row.user_id, id, now),
      ]);
      return back(`linked=${row.provider}`);
    } catch (e) {
      console.error('photo link', e instanceof ProviderError ? e.message : e);
      return back('link_error=failed');
    }
  });
  return app;
}

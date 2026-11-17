import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Env } from '../env';
import { SESSION_COOKIE, sessionId } from '../lib/auth';
import { seal } from '../lib/seal';
import { readJson } from '../lib/security';
import { COUPLE_PROVIDERS, encPath, PROVIDER, PROVIDER_NAME, providerReady, ProviderError, type ProviderKey } from '../photos/providers';
import { linkRow, primeAccess, runCopies, SEAL_LABEL, setUpFolders, topOf, verifyLink } from '../photos/store';
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
/**
 * Every photo not in this storage yet goes in the queue (failed ones are tried again): the cron copies
 * them every 15 minutes, and the first batch starts straight away.
 */
const queueCopies = (db: D1Database, linkId: string, weddingId: string): D1PreparedStatement[] => {
  const old = '2000-01-01T00:00:00.000Z'; // picked up straight away
  return [
    db.prepare(`UPDATE photo_link SET status = 'ok', last_error = NULL WHERE id = ?`).bind(linkId),
    db.prepare(`UPDATE photo_copy SET status = 'pending', attempts = 0, updated_at = ? WHERE link_id = ? AND status = 'failed'`).bind(old, linkId),
    db
      .prepare(
        `INSERT OR IGNORE INTO photo_copy (media_id, link_id, status, attempts, updated_at)
         SELECT m.id, ?, 'pending', 0, ? FROM media m WHERE m.wedding_id = ? AND m.kind IN ('photo', 'video') AND m.deleted_at IS NULL AND m.key NOT LIKE 'link:' || ? || ':%'`,
      )
      .bind(linkId, old, weddingId, linkId),
  ];
};

/**
 * Where the couple can see it in their own storage: the wedding's own folder. Google Drive goes by the
 * folder's id; Dropbox by its path inside the site's app folder (Apps/<the app's name>/).
 */
const openUrl = (env: Env, provider: ProviderKey, folders: string | null): string => {
  const f = JSON.parse(folders || '{}') as Record<string, string>;
  const name = topOf(folders);
  const top = name ? f[`path:${name}`] : undefined;
  if (provider === 'gdrive') return top ? `https://drive.google.com/drive/folders/${encodeURIComponent(top)}` : 'https://drive.google.com/drive/my-drive';
  if (provider === 'dropbox') {
    const app = encPath(env.DROPBOX_APP_FOLDER || 'The Yes List');
    return `https://www.dropbox.com/home/Apps/${app}${top?.startsWith('/') ? encPath(top) : ''}`;
  }
  return provider === 'gphotos' ? 'https://photos.google.com/albums' : 'https://onedrive.live.com/';
};

const randomId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function photoLinkRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');
  const audit = (c: C, action: string, target: string) =>
    c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), c.get('user').id, action, target, new Date().toISOString());

  app.get('/', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT l.id, l.provider, l.account, l.status, l.last_error, l.created_at, l.folders,
              SUM(CASE WHEN pc.status = 'done' THEN 1 ELSE 0 END) AS copied,
              SUM(CASE WHEN pc.status = 'pending' OR (pc.status = 'failed' AND pc.attempts < 6) THEN 1 ELSE 0 END) AS waiting,
              SUM(CASE WHEN pc.status = 'failed' AND pc.attempts >= 6 THEN 1 ELSE 0 END) AS failed,
              (SELECT pc2.error FROM photo_copy pc2 WHERE pc2.link_id = l.id AND pc2.status = 'failed' ORDER BY pc2.updated_at DESC LIMIT 1) AS copy_error
         FROM photo_link l LEFT JOIN photo_copy pc ON pc.link_id = l.id
        WHERE l.wedding_id = ? AND l.deleted_at IS NULL GROUP BY l.id ORDER BY l.created_at`,
    )
      .bind(wid(c))
      .all<{ id: string; provider: ProviderKey; account: string; status: string; last_error: string | null; created_at: string; folders: string | null; copied: number | null; waiting: number | null; failed: number | null; copy_error: string | null }>();
    const docs = await c.env.DB.prepare(`SELECT json_extract(content, '$.docsLink') AS l FROM wedding WHERE id = ?`).bind(wid(c)).first<{ l: string | null }>();
    const { results: filedRows } = await c.env.DB.prepare(`SELECT id FROM photo_link WHERE wedding_id = ? AND deleted_at IS NULL AND json_valid(folders) AND json_extract(folders, '$._v') = '2'`).bind(wid(c)).all<{ id: string }>();
    const filed = new Set(filedRows.map((r) => r.id));
    return c.json({
      siteStorage: !!c.env.MEDIA,
      redirectUri: redirectUri(c.env),
      // The site's own app setup (Google Cloud, Dropbox, Azure) is for whoever runs the site, never the couple.
      canSetUp: c.get('user').superAdmin,
      providers: COUPLE_PROVIDERS.map((p) => ({ key: p, name: PROVIDER_NAME[p], ready: providerReady(c.env, p) })),
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
        docs: docs?.l === r.id,
        filed: filed.has(r.id),
        // The welcome file was written into the wedding folder: the link can really save there.
        verified: !!(JSON.parse(r.folders || '{}') as Record<string, string>)._ok,
        folder: topOf(r.folders),
        openUrl: openUrl(c.env, r.provider, r.folders),
      })),
    });
  });

  /** Start linking: where to send the couple (the provider's own sign-in). */
  app.post('/connect', writer, async (c) => {
    const body = z.object({ provider: z.enum(['gdrive', 'gphotos', 'dropbox', 'onedrive']) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose where to link.');
    const p = body.data.provider;
    // Google Photos isn't offered: the site's Google sign-in is for Drive only.
    if (!COUPLE_PROVIDERS.includes(p)) return err(c, 400, 'invalid', 'Choose Google Drive or Dropbox.');
    if (!providerReady(c.env, p) || !c.env.SESSION_SECRET) return err(c, 503, 'not_set_up', `${PROVIDER_NAME[p]} isn't switched on for this site yet.`);
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
    // Planning files kept there can only be opened through the link: keep it until they're moved.
    const files = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM planner_file WHERE wedding_id = ? AND deleted_at IS NULL AND remote LIKE ?`).bind(wid(c), `link:${id}:%`).first<{ n: number }>();
    if (files?.n) return err(c, 400, 'has_files', `${files.n} planning ${files.n === 1 ? 'file is' : 'files are'} kept there (quotes, contracts). Download ${files.n === 1 ? 'it' : 'them'} from the planner first, or keep the link.`);
    await c.env.DB.prepare(`UPDATE wedding SET content = json_remove(content, '$.docsLink') WHERE id = ? AND json_valid(content) AND json_extract(content, '$.docsLink') = ?`).bind(wid(c), id).run();
    const res = await c.env.DB.prepare(`UPDATE photo_link SET deleted_at = ? WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(new Date().toISOString(), id, wid(c)).run();
    if (!res.meta.changes) return err(c, 404, 'not_found', 'That link is already gone.');
    await c.env.DB.batch([c.env.DB.prepare(`DELETE FROM photo_copy WHERE link_id = ? AND status != 'done'`).bind(id), audit(c, 'photos.unlink', id)]);
    return c.json({ ok: true });
  });

  /** Keep planning files (quotes, contracts, menus) in this link's storage, or stop (they're kept on the site then). */
  app.put('/:id/docs', writer, async (c) => {
    const id = c.req.param('id');
    const on = ((await readJson(c.req.raw)) as { on?: unknown } | null)?.on === true;
    const link = await c.env.DB.prepare(`SELECT provider FROM photo_link WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(id, wid(c)).first<{ provider: string }>();
    if (!link) return err(c, 404, 'not_found', 'That link is gone.');
    if (on && link.provider === 'gphotos') return err(c, 400, 'invalid', 'Google Photos only takes photos. Choose Google Drive, Dropbox or OneDrive for planning files.');
    await c.env.DB.prepare(
      on
        ? `UPDATE wedding SET content = json_set(content, '$.docsLink', ?) WHERE id = ? AND json_valid(content)`
        : `UPDATE wedding SET content = json_remove(content, '$.docsLink') WHERE id = ? AND json_valid(content) AND json_extract(content, '$.docsLink') = ?`,
    )
      .bind(...(on ? [id, wid(c)] : [wid(c), id]))
      .run();
    return c.json({ ok: true });
  });

  /**
   * Recovery for links made before folders were filed (new links are filed when they connect): one
   * wedding folder with Photos (a folder per event), Planning files, Signs and print, and Backups, made
   * now and checked with the welcome file. Photos from now on go there.
   */
  app.post('/:id/folders', writer, async (c) => {
    const link = await linkRow(c.env.DB, wid(c), c.req.param('id'));
    if (!link) return err(c, 404, 'not_found', 'That link is gone.');
    if (link.provider === 'gphotos') return err(c, 400, 'invalid', 'Google Photos keeps an album per event instead of folders.');
    try {
      const folders = await setUpFolders(c.env, link);
      await verifyLink(c.env, link);
      await audit(c, 'photos.folders', link.id).run();
      return c.json({ ok: true, folders });
    } catch (e) {
      return err(c, 503, 'unavailable', `Couldn't make the folders: ${(e as Error).message.slice(0, 200)}`);
    }
  });

  /** Copy every photo not there yet (and try failed ones again); the rest continue every 15 minutes. */
  app.post('/:id/copy-all', writer, async (c) => {
    const id = c.req.param('id');
    const link = await c.env.DB.prepare(`SELECT id FROM photo_link WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(id, wid(c)).first();
    if (!link) return err(c, 404, 'not_found', 'That link is gone.');
    await c.env.DB.batch([...queueCopies(c.env.DB, id, wid(c)), audit(c, 'photos.copy-all', id)]);
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
    const back = (q: string) => c.redirect(row ? `${base}/admin/${encodeURIComponent(row.wedding_id)}/photos?${q}` : `${base}/admin?${q}`, 302);
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
      const now = new Date().toISOString();
      const account = t.account.slice(0, 200);
      const sealed = await seal(c.env.SESSION_SECRET!, SEAL_LABEL, t.refresh);
      // Connecting the same account again mends the link it already has (its folders and copies carry on).
      const had = await c.env.DB.prepare(`SELECT id FROM photo_link WHERE wedding_id = ? AND provider = ? AND lower(account) = lower(?) AND deleted_at IS NULL ORDER BY created_at LIMIT 1`)
        .bind(row.wedding_id, row.provider, account)
        .first<{ id: string }>();
      const id = had?.id ?? crypto.randomUUID();
      await c.env.DB.batch([
        had
          ? c.env.DB.prepare(`UPDATE photo_link SET refresh_enc = ?, status = 'ok', last_error = NULL WHERE id = ?`).bind(sealed, id)
          : c.env.DB.prepare(`INSERT INTO photo_link (id, wedding_id, provider, account, refresh_enc, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, row.wedding_id, row.provider, account, sealed, now),
        c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), row.wedding_id, row.user_id, had ? 'photos.relink' : 'photos.link', id, now),
        // Photos already taken go there too, without anyone having to ask.
        ...queueCopies(c.env.DB, id, row.wedding_id),
        // Signing in is all it takes: the first storage linked (other than Google Photos, which only takes
        // photos) keeps the planning files too, unless they've already chosen one.
        ...(row.provider === 'gphotos'
          ? []
          : [c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.docsLink', ?) WHERE id = ? AND json_valid(content) AND json_extract(content, '$.docsLink') IS NULL`).bind(id, row.wedding_id)]),
      ]);
      // Finished before they're sent back: the wedding folder and its shelves are made, and a small welcome
      // file is written into it to prove the link can really save there. If that fails, the sign-in is
      // kept (no second sign-in needed) but the link shows as needing a reconnect, never a fake "connected".
      if (row.provider !== 'gphotos') {
        const l = await linkRow(c.env.DB, row.wedding_id, id);
        if (l) {
          primeAccess(l, t.access, t.expires);
          try {
            try {
              await setUpFolders(c.env, l);
              await verifyLink(c.env, l);
            } catch (e) {
              // Connecting again after the folder was deleted or moved: make it afresh (same name) and try once more.
              if (!had || (e instanceof ProviderError && e.relink)) throw e;
              const keep = JSON.parse(l.folders || '{}') as Record<string, string>;
              l.folders = JSON.stringify(Object.fromEntries(Object.entries(keep).filter(([k]) => k.startsWith('_') && k !== '_ok')));
              await c.env.DB.prepare(`UPDATE photo_link SET folders = ? WHERE id = ?`).bind(l.folders, id).run();
              await setUpFolders(c.env, l);
              await verifyLink(c.env, l);
            }
          } catch (e) {
            console.error('link setup', e instanceof Error ? e.message : e);
            await c.env.DB.prepare(`UPDATE photo_link SET status = 'error', last_error = ? WHERE id = ?`)
              .bind(`We couldn’t make your wedding folder in ${PROVIDER_NAME[row.provider]}. Tap Reconnect to try again.`, id)
              .run();
            return back(`link_error=setup`);
          }
        }
      }
      c.executionCtx.waitUntil(runCopies(c.env, { linkId: id, limit: 25 }).catch(() => undefined));
      return back(`linked=${row.provider}`);
    } catch (e) {
      console.error('photo link', e instanceof ProviderError ? e.message : e);
      return back('link_error=failed');
    }
  });
  return app;
}

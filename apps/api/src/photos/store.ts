import type { Env } from '../env';
import { seal, unseal } from '../lib/seal';
import { PROVIDER, ProviderError, safeName, type ProviderKey } from './providers';

/**
 * Where a photo goes: the site's own storage (R2) when it is switched on, and a copy to every storage
 * the couple linked (Google Drive, Google Photos, Dropbox, OneDrive). With R2 off, a linked storage is
 * the only home: the photo is saved there before the guest is told it worked. Copies that fail are
 * retried by the cron (up to 6 tries), reading the photo back from wherever it is kept.
 */

export const SEAL_LABEL = 'photo-link';
const MAX_TRIES = 6;

export interface LinkRow {
  id: string;
  wedding_id: string;
  provider: ProviderKey;
  account: string;
  refresh_enc: string;
  folders: string;
}
interface MediaRow {
  id: string;
  wedding_id: string;
  key: string;
  content_type: string;
  uploaded_by: string | null;
  event_key: string | null;
  created_at: string;
}

export async function activeLinks(db: D1Database, weddingId: string): Promise<LinkRow[]> {
  const { results } = await db
    .prepare(`SELECT id, wedding_id, provider, account, refresh_enc, folders FROM photo_link WHERE wedding_id = ? AND deleted_at IS NULL AND status = 'ok' ORDER BY created_at`)
    .bind(weddingId)
    .all<LinkRow>();
  return results;
}

/** Photos can be taken: the site's storage is on, or the couple linked one of theirs. */
export async function canStore(env: Env, weddingId: string) {
  if (env.MEDIA) return true;
  return (await activeLinks(env.DB, weddingId)).length > 0;
}

const linkError = (env: Env, id: string, message: string) =>
  env.DB.prepare(`UPDATE photo_link SET status = 'error', last_error = ? WHERE id = ?`).bind(message.slice(0, 300), id).run();

/**
 * Access tokens per link, kept until five minutes before they run out: an album of 500 photos is one
 * refresh an hour, not 500 (providers limit refreshes, and OneDrive rotates its refresh token each time).
 */
const accessCache = new Map<string, { access: string; until: number; sealed: string }>();
const forget = (link: LinkRow) => accessCache.delete(link.id);

/** A fresh access token (refresh tokens that rotate are saved again). A revoked link is marked broken. */
async function accessFor(env: Env, link: LinkRow): Promise<string> {
  const hit = accessCache.get(link.id);
  if (hit && hit.sealed === link.refresh_enc && hit.until > Date.now()) return hit.access;
  const secret = env.SESSION_SECRET ?? '';
  const refresh = await unseal(secret, SEAL_LABEL, link.refresh_enc);
  if (!refresh) {
    await linkError(env, link.id, 'This link needs connecting again.');
    throw new ProviderError(401, 'This link needs connecting again.', true);
  }
  try {
    const t = await PROVIDER[link.provider].refresh(env, refresh);
    if (t.refresh && t.refresh !== refresh) {
      const sealed = await seal(secret, SEAL_LABEL, t.refresh);
      await env.DB.prepare(`UPDATE photo_link SET refresh_enc = ? WHERE id = ?`).bind(sealed, link.id).run();
      link.refresh_enc = sealed;
    }
    if (accessCache.size > 500) accessCache.clear();
    accessCache.set(link.id, { access: t.access, until: Date.now() + Math.max(60, (t.expires ?? 3600) - 300) * 1000, sealed: link.refresh_enc });
    return t.access;
  } catch (e) {
    if (e instanceof ProviderError && (e.relink || e.status === 400)) await linkError(env, link.id, 'Access was removed or has expired. Connect it again.');
    throw e;
  }
}

/** The folder or album for an event (made the first time, remembered on the link). */
async function folderFor(env: Env, link: LinkRow, token: string, eventKey: string | null): Promise<string> {
  const folders = JSON.parse(link.folders || '{}') as Record<string, string>;
  const k = eventKey ?? '';
  if (folders[k]) return folders[k];
  const w = await env.DB.prepare(`SELECT name1, name2 FROM wedding WHERE id = ?`).bind(link.wedding_id).first<{ name1: string; name2: string }>();
  const top = safeName(`${(w?.name1 ?? '').split(' ')[0]} & ${(w?.name2 ?? '').split(' ')[0]} photos`);
  const ev = eventKey ? await env.DB.prepare(`SELECT name FROM event WHERE wedding_id = ? AND key = ?`).bind(link.wedding_id, eventKey).first<{ name: string }>() : null;
  const name = safeName(ev?.name ?? 'All photos');
  const p = PROVIDER[link.provider];
  let id: string;
  if (link.provider === 'gdrive') {
    folders[''] = folders[''] || (await p.folder(token, top, ''));
    id = eventKey ? await p.folder(token, name, folders['']) : folders[''];
  } else {
    id = await p.folder(token, name, top);
  }
  folders[k] = id;
  // Saved only if no one else saved first (two guests' first photos at once): otherwise theirs wins, so
  // every photo for the event lands in one folder or album.
  const before = link.folders;
  const next = JSON.stringify(folders);
  const res = await env.DB.prepare(`UPDATE photo_link SET folders = ? WHERE id = ? AND folders IS ?`).bind(next, link.id, before).run();
  if (res.meta.changes) {
    link.folders = next;
    return id;
  }
  const now = await env.DB.prepare(`SELECT folders FROM photo_link WHERE id = ?`).bind(link.id).first<{ folders: string }>();
  link.folders = now?.folders ?? next;
  const theirs = (JSON.parse(link.folders || '{}') as Record<string, string>)[k];
  if (theirs) return theirs;
  await env.DB.prepare(`UPDATE photo_link SET folders = json_patch(COALESCE(NULLIF(folders, ''), '{}'), ?) WHERE id = ?`).bind(JSON.stringify(folders), link.id).run();
  return id;
}

/**
 * Planning files (quotes, contracts, menus) go to the linked Drive, Dropbox or OneDrive the couple chose
 * for them (Photos → Linked storage), in one "<couple> wedding planning" folder. Returns where it went,
 * or null to keep it on the site (none chosen, or the upload failed: a file is never lost).
 */
export async function keepDocument(env: Env, weddingId: string, f: { bytes: Uint8Array; name: string; type: string }): Promise<string | null> {
  const w = await env.DB.prepare(`SELECT json_extract(content, '$.docsLink') AS l, name1, name2 FROM wedding WHERE id = ?`).bind(weddingId).first<{ l: string | null; name1: string; name2: string }>();
  if (!w?.l) return null;
  const link = await env.DB.prepare(`SELECT id, wedding_id, provider, account, refresh_enc, folders FROM photo_link WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL AND status = 'ok'`)
    .bind(w.l, weddingId)
    .first<LinkRow>();
  if (!link || link.provider === 'gphotos') return null; // Google Photos takes photos only
  try {
    const token = await accessFor(env, link);
    const folders = JSON.parse(link.folders || '{}') as Record<string, string>;
    let folder = folders.docs;
    if (!folder) {
      folder = await PROVIDER[link.provider].folder(token, safeName(`${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]} wedding planning`), '');
      await env.DB.prepare(`UPDATE photo_link SET folders = json_set(COALESCE(NULLIF(folders, ''), '{}'), '$.docs', ?) WHERE id = ?`).bind(folder, link.id).run();
    }
    const remote = await PROVIDER[link.provider].upload(token, { bytes: f.bytes, name: safeName(f.name.replace(/\.[^.]+$/, '')) + (/\.[a-z0-9]{2,5}$/i.exec(f.name)?.[0] ?? ''), type: f.type, folder });
    return `link:${link.id}:${remote}`;
  } catch {
    return null;
  }
}

const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/avif': 'avif' };
/** "2027-11-18 21-04 Alex.jpg": sorts by time, says who took it. */
const fileName = (m: MediaRow) => safeName(`${m.created_at.slice(0, 16).replace('T', ' ').replace(':', '-')} ${m.uploaded_by || 'Guest'}`) + `.${EXT[m.content_type] ?? 'jpg'}`;

/** Copies one photo to one linked storage, recording the outcome. */
export async function copyTo(env: Env, link: LinkRow, m: MediaRow, bytes: Uint8Array): Promise<string | null> {
  const now = new Date().toISOString();
  try {
    const token = await accessFor(env, link);
    const folder = await folderFor(env, link, token, m.event_key);
    const remote = await PROVIDER[link.provider].upload(token, { bytes, name: fileName(m), type: m.content_type, folder });
    await env.DB.prepare(
      `INSERT INTO photo_copy (media_id, link_id, status, remote_id, attempts, error, updated_at) VALUES (?, ?, 'done', ?, 1, NULL, ?)
       ON CONFLICT (media_id, link_id) DO UPDATE SET status = 'done', remote_id = excluded.remote_id, attempts = attempts + 1, error = NULL, updated_at = excluded.updated_at`,
    )
      .bind(m.id, link.id, remote, now)
      .run();
    return remote;
  } catch (e) {
    if (e instanceof ProviderError && e.status === 401) forget(link);
    const msg = (e as Error).message.slice(0, 300);
    await env.DB.prepare(
      `INSERT INTO photo_copy (media_id, link_id, status, attempts, error, updated_at) VALUES (?, ?, 'failed', 1, ?, ?)
       ON CONFLICT (media_id, link_id) DO UPDATE SET status = 'failed', attempts = attempts + 1, error = excluded.error, updated_at = excluded.updated_at`,
    )
      .bind(m.id, link.id, msg, now)
      .run();
    return null;
  }
}

/** A photo kept only in a linked storage: "link:<link id>:<the provider's id>". */
export const linkKey = (key: string) => {
  if (!key.startsWith('link:')) return null;
  const rest = key.slice(5);
  const at = rest.indexOf(':');
  return at > 0 ? { linkId: rest.slice(0, at), remoteId: rest.slice(at + 1) } : null;
};

/** The photo itself, from R2 or from the linked storage that holds it. */
export async function openPhoto(env: Env, weddingId: string, key: string, range?: string): Promise<Response | null> {
  const lk = linkKey(key);
  if (!lk) {
    const asked = range && /^bytes=\d*-\d*$/.test(range) ? range : undefined;
    const obj = await env.MEDIA?.get(key, asked ? { range: new Headers({ range: asked }) } : undefined);
    if (!obj || !('body' in obj)) return null;
    // A part (for video players), or the whole file.
    const r = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
    if (asked && r && typeof obj.size === 'number') {
      const start = r.suffix !== undefined ? obj.size - r.suffix : (r.offset ?? 0);
      const length = r.suffix !== undefined ? r.suffix : (r.length ?? obj.size - start);
      return new Response(obj.body, { status: 206, headers: { 'content-range': `bytes ${start}-${start + length - 1}/${obj.size}`, 'content-length': String(length) } });
    }
    return new Response(obj.body, typeof obj.size === 'number' ? { headers: { 'content-length': String(obj.size) } } : undefined);
  }
  const link = await env.DB.prepare(`SELECT id, wedding_id, provider, account, refresh_enc, folders FROM photo_link WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`)
    .bind(lk.linkId, weddingId)
    .first<LinkRow>();
  if (!link) return null;
  try {
    return await PROVIDER[link.provider].download(await accessFor(env, link), lk.remoteId, range);
  } catch (e) {
    if (e instanceof ProviderError && e.status === 401) forget(link);
    return null;
  }
}

/** A photo or video as the browser should get it: whole or the part asked for, never run as a page. */
export function mediaResponse(res: Response, type: string): Response {
  const h: Record<string, string> = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=86400',
    'content-security-policy': "default-src 'none'",
    'x-content-type-options': 'nosniff',
  };
  const cr = res.headers.get('content-range');
  const len = res.headers.get('content-length');
  if (cr) h['content-range'] = cr;
  if (len) h['content-length'] = len;
  return new Response(res.body, { status: res.status === 206 ? 206 : 200, headers: h });
}

export interface NewPhoto {
  weddingId: string;
  bytes: Uint8Array;
  kind: { type: string; ext: string };
  by: string;
  invitationId: string | null;
  eventKey: string | null;
  /** A video is kept like a photo (its look is shown when it plays). */
  media?: 'photo' | 'video';
  look?: string;
}
export type Stored = { ok: true; id: string; duplicate: boolean } | { ok: false; status: 503 | 502; message: string };

/**
 * Keeps a new photo (the same photo twice is kept once), in R2 and/or the linked storages.
 * `later` runs work after the response (ctx.waitUntil) so a guest isn't kept waiting for copies.
 */
export async function storePhoto(env: Env, later: (p: Promise<unknown>) => void, p: NewPhoto): Promise<Stored> {
  const db = env.DB;
  // The same file twice is kept once. A big file (a video) is known by its first 2 MB and its size.
  const big = p.bytes.byteLength > 4_000_000;
  const sha =
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', big ? p.bytes.subarray(0, 2_000_000) : p.bytes))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, big ? 30 : 40) +
    (big ? `-${p.bytes.byteLength}` : '');
  const dup = await db.prepare(`SELECT id FROM media WHERE wedding_id = ? AND sha = ? AND kind IN ('photo', 'video') AND deleted_at IS NULL`).bind(p.weddingId, sha).first<{ id: string }>();
  if (dup) return { ok: true, id: dup.id, duplicate: true };
  const links = await activeLinks(db, p.weddingId);
  if (!env.MEDIA && !links.length) return { ok: false, status: 503, message: 'Photo uploads are not open yet.' };

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row: MediaRow = { id, wedding_id: p.weddingId, key: '', content_type: p.kind.type, uploaded_by: p.by || null, event_key: p.eventKey, created_at: now };
  // The photo's row, and a "pending" copy for each other linked storage in the same batch: a copy cut
  // off after the response (time limits) is still owed, so the cron finishes it.
  const save = (others: LinkRow[]) =>
    db.batch([
      db
        .prepare(`INSERT INTO media (id, wedding_id, kind, key, content_type, bytes, uploaded_by, invitation_id, created_at, event_key, sha, edit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, p.weddingId, p.media ?? 'photo', row.key, p.kind.type, p.bytes.byteLength, row.uploaded_by, p.invitationId, now, p.eventKey, sha, p.look || null),
      ...others.map((l) =>
        db.prepare(`INSERT INTO photo_copy (media_id, link_id, status, attempts, updated_at) VALUES (?, ?, 'pending', 0, ?) ON CONFLICT (media_id, link_id) DO NOTHING`).bind(id, l.id, now),
      ),
    ]);

  let others = links;
  if (env.MEDIA) {
    row.key = `w/${p.weddingId}/photos/${sha}.${p.kind.ext}`;
    await env.MEDIA.put(row.key, p.bytes, { httpMetadata: { contentType: p.kind.type } });
    await save(others);
  } else {
    // No site storage: the first linked storage that takes it is its home. The photo is listed only once
    // it's there (never a half-saved photo in the album or on the wall, and a retry isn't "already there").
    let home: { link: LinkRow; remote: string } | null = null;
    for (const link of links) {
      const remote = await copyTo(env, link, row, p.bytes); // records the copy against the media id
      if (remote) {
        home = { link, remote };
        break;
      }
    }
    if (!home) {
      await db.prepare(`DELETE FROM photo_copy WHERE media_id = ?`).bind(id).run();
      return { ok: false, status: 502, message: 'Your photo could not be saved just now. Please try again in a minute.' };
    }
    row.key = `link:${home.link.id}:${home.remote}`;
    others = links.filter((l) => l.id !== home!.link.id);
    await save(others);
  }
  if (others.length) {
    const bytes = p.bytes;
    later(Promise.all(others.map((l) => copyTo(env, l, row, bytes))));
  }
  return { ok: true, id, duplicate: false };
}

/** Cron and "Copy existing photos": copies still owed (new, or failed fewer than 6 times). */
export async function runCopies(env: Env, opts: { linkId?: string; limit?: number } = {}) {
  const db = env.DB;
  const stale = new Date(Date.now() - 10 * 60_000).toISOString(); // leave ones an upload is still sending
  const { results } = await db
    .prepare(
      `SELECT c.link_id, m.id, m.wedding_id, m.key, m.content_type, m.uploaded_by, m.event_key, m.created_at
         FROM photo_copy c JOIN media m ON m.id = c.media_id JOIN photo_link l ON l.id = c.link_id
        WHERE c.status IN ('pending', 'failed') AND c.attempts < ? AND c.updated_at < ?
          AND m.deleted_at IS NULL AND l.deleted_at IS NULL AND l.status = 'ok' ${opts.linkId ? 'AND l.id = ?' : ''}
        ORDER BY c.updated_at LIMIT ?`,
    )
    .bind(...[MAX_TRIES, stale, ...(opts.linkId ? [opts.linkId] : []), opts.limit ?? 20])
    .all<MediaRow & { link_id: string }>();
  let done = 0;
  const linkCache = new Map<string, LinkRow | null>();
  for (const r of results) {
    if (!linkCache.has(r.link_id)) {
      linkCache.set(
        r.link_id,
        await db.prepare(`SELECT id, wedding_id, provider, account, refresh_enc, folders FROM photo_link WHERE id = ? AND status = 'ok' AND deleted_at IS NULL`).bind(r.link_id).first<LinkRow>(),
      );
    }
    const link = linkCache.get(r.link_id);
    if (!link) continue;
    const res = await openPhoto(env, r.wedding_id, r.key);
    if (!res?.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) continue;
    if (await copyTo(env, link, r, bytes)) done++;
  }
  return { tried: results.length, done };
}

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

/** A fresh access token (refresh tokens that rotate are saved again). A revoked link is marked broken. */
async function accessFor(env: Env, link: LinkRow): Promise<string> {
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
  link.folders = JSON.stringify(folders);
  await env.DB.prepare(`UPDATE photo_link SET folders = ? WHERE id = ?`).bind(link.folders, link.id).run();
  return id;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/avif': 'avif' };
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
export async function openPhoto(env: Env, weddingId: string, key: string): Promise<Response | null> {
  const lk = linkKey(key);
  if (!lk) {
    const obj = await env.MEDIA?.get(key);
    return obj ? new Response(obj.body) : null;
  }
  const link = await env.DB.prepare(`SELECT id, wedding_id, provider, account, refresh_enc, folders FROM photo_link WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`)
    .bind(lk.linkId, weddingId)
    .first<LinkRow>();
  if (!link) return null;
  try {
    return await PROVIDER[link.provider].download(await accessFor(env, link), lk.remoteId);
  } catch {
    return null;
  }
}

export interface NewPhoto {
  weddingId: string;
  bytes: Uint8Array;
  kind: { type: string; ext: string };
  by: string;
  invitationId: string | null;
  eventKey: string | null;
}
export type Stored = { ok: true; id: string; duplicate: boolean } | { ok: false; status: 503 | 502; message: string };

/**
 * Keeps a new photo (the same photo twice is kept once), in R2 and/or the linked storages.
 * `later` runs work after the response (ctx.waitUntil) so a guest isn't kept waiting for copies.
 */
export async function storePhoto(env: Env, later: (p: Promise<unknown>) => void, p: NewPhoto): Promise<Stored> {
  const db = env.DB;
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', p.bytes))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  const dup = await db.prepare(`SELECT id FROM media WHERE wedding_id = ? AND sha = ? AND kind = 'photo' AND deleted_at IS NULL`).bind(p.weddingId, sha).first<{ id: string }>();
  if (dup) return { ok: true, id: dup.id, duplicate: true };
  const links = await activeLinks(db, p.weddingId);
  if (!env.MEDIA && !links.length) return { ok: false, status: 503, message: 'Photo uploads are not open yet.' };

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row: MediaRow = { id, wedding_id: p.weddingId, key: '', content_type: p.kind.type, uploaded_by: p.by || null, event_key: p.eventKey, created_at: now };
  const insert = () =>
    db
      .prepare(`INSERT INTO media (id, wedding_id, kind, key, content_type, bytes, uploaded_by, invitation_id, created_at, event_key, sha) VALUES (?, ?, 'photo', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, p.weddingId, row.key, p.kind.type, p.bytes.byteLength, row.uploaded_by, p.invitationId, now, p.eventKey, sha)
      .run();

  let others = links;
  if (env.MEDIA) {
    row.key = `w/${p.weddingId}/photos/${sha}.${p.kind.ext}`;
    await env.MEDIA.put(row.key, p.bytes, { httpMetadata: { contentType: p.kind.type } });
    await insert();
  } else {
    // No site storage: the first linked storage that takes it is its home.
    let home: { link: LinkRow; remote: string } | null = null;
    for (const link of links) {
      row.key = `link:${link.id}:pending`; // copyTo records the copy against the media id
      await insert().catch(() => undefined);
      const remote = await copyTo(env, link, row, p.bytes);
      if (remote) {
        home = { link, remote };
        break;
      }
      await db.batch([db.prepare(`DELETE FROM media WHERE id = ?`).bind(id), db.prepare(`DELETE FROM photo_copy WHERE media_id = ?`).bind(id)]);
    }
    if (!home) return { ok: false, status: 502, message: 'Your photo could not be saved just now. Please try again in a minute.' };
    row.key = `link:${home.link.id}:${home.remote}`;
    await db.prepare(`UPDATE media SET key = ? WHERE id = ?`).bind(row.key, id).run();
    others = links.filter((l) => l.id !== home!.link.id);
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

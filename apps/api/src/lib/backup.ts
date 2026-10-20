import type { Env } from '../env';
import { activeLinks, fileTo, type LinkRow } from '../photos/store';

/**
 * Backups. A wedding's backup is one JSON file: every table that belongs to it (found by its wedding_id,
 * so new features are included without changes here) plus the rows that hang off those (people, replies,
 * seats, send dates). Never in it: sign-in secrets (passcode hashes, sessions, the linked-storage keys)
 * and big file bytes (photos and planning files are kept in their own places; their details are listed).
 *
 * Automatic: every day, each wedding with a linked Google Drive, Dropbox or OneDrive gets a backup in
 * its "Backups" folder there. The couple can also back up now, or download one, from Settings → Backup.
 */

/** Tables that are never in a backup (sign-in and housekeeping). */
const SKIP_TABLES = /^(_cf_|sqlite_|d1_)|^(session|user_session|party_session|account_session|rate_limit|oauth_state|photo_thumb)$/;
/** Columns that are never in a backup: secrets and file bytes. */
const SKIP_COLUMN = /hash|secret|refresh_enc|^data$|^password|^user_id$|^expires_at$/i;
/** Rows that belong to a wedding through another table. */
const CHILDREN: [string, string][] = [
  ['person', `SELECT p.* FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ?`],
  ['invite_event', `SELECT ie.* FROM invite_event ie JOIN invitation i ON i.id = ie.invitation_id WHERE i.wedding_id = ?`],
  ['rsvp', `SELECT r.* FROM rsvp r JOIN invitation i ON i.id = r.invitation_id WHERE i.wedding_id = ?`],
  ['campaign_slot', `SELECT s.* FROM campaign_slot s JOIN campaign c ON c.id = s.campaign_id WHERE c.wedding_id = ?`],
  ['seat', `SELECT s.* FROM seat s JOIN event e ON e.id = s.event_id WHERE e.wedding_id = ?`],
  ['seat_plan', `SELECT sp.* FROM seat_plan sp JOIN event e ON e.id = sp.event_id WHERE e.wedding_id = ?`],
  ['seat_publish', `SELECT sp.event_id, sp.snapshot, sp.published_at, sp.published_by FROM seat_publish sp JOIN event e ON e.id = sp.event_id WHERE e.wedding_id = ?`],
];

/** If the tables can't be listed: the ones known to belong to a wedding. */
const KNOWN = ['audit', 'board_post', 'campaign', 'event', 'inbox_email', 'invitation', 'media', 'member_invite', 'membership', 'message', 'party_account', 'photo_link', 'planner_doc', 'planner_file', 'seat_area', 'seat_table', 'seat_version', 'shuttle_booking', 'sms_in', 'sms_out', 'song_request', 'vendor_use'];

const strip = (rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !SKIP_COLUMN.test(k) && !(v instanceof ArrayBuffer) && !ArrayBuffer.isView(v))));

export async function weddingBackup(db: D1Database, weddingId: string) {
  const w = await db.prepare(`SELECT * FROM wedding WHERE id = ?`).bind(weddingId).first<Record<string, unknown>>();
  if (!w) return null;
  // Every table with a wedding_id (Cloudflare's own tables left out before they're looked at).
  const tables = await db
    .prepare(
      `SELECT m.name AS t FROM sqlite_master m WHERE m.type = 'table' AND substr(m.name, 1, 4) != '_cf_' AND substr(m.name, 1, 7) != 'sqlite_' AND substr(m.name, 1, 3) != 'd1_'
          AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name = 'wedding_id') ORDER BY m.name`,
    )
    .all<{ t: string }>()
    .then((r) => r.results.map((x) => x.t))
    .catch(() => KNOWN);
  const own = tables.filter((t) => !SKIP_TABLES.test(t) && /^[a-z_0-9]+$/.test(t));
  const asked: [string, string][] = [...own.map((t): [string, string] => [t, `SELECT * FROM "${t}" WHERE wedding_id = ?`]), ...CHILDREN];
  const res = await db.batch(asked.map(([, sql]) => db.prepare(sql).bind(weddingId)));
  const data: Record<string, Record<string, unknown>[]> = {};
  asked.forEach(([t], i) => (data[t] = strip((res[i]?.results ?? []) as Record<string, unknown>[])));
  // The first version's layout (guests, replies, texts, seating, photos), then everything else by table.
  const take = (t: string) => {
    const rows = data[t] ?? [];
    delete data[t];
    return rows;
  };
  return {
    format: 'wedding-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    wedding: strip([w])[0]!,
    events: take('event'),
    invitations: take('invitation'),
    people: take('person'),
    invites: take('invite_event'),
    rsvps: take('rsvp'),
    campaigns: take('campaign'),
    slots: take('campaign_slot'),
    seating: { tables: take('seat_table'), areas: take('seat_area'), plans: take('seat_plan'), seats: take('seat'), published: take('seat_publish'), versions: take('seat_version') },
    sms: { out: take('sms_out'), in: take('sms_in') },
    media: take('media'),
    planner: take('planner_doc'),
    more: data,
  };
}

/** A backup a day; one that failed is tried again six hours later. */
const DAY = 86_400_000;
const RETRY = 6 * 3_600_000;

/** Where a wedding's backups go: the link chosen for planning files, else the first Drive, Dropbox or OneDrive. */
export async function backupLink(env: Env, weddingId: string): Promise<LinkRow | null> {
  const links = (await activeLinks(env.DB, weddingId)).filter((l) => l.provider !== 'gphotos');
  const docs = await env.DB.prepare(`SELECT json_extract(content, '$.docsLink') AS l FROM wedding WHERE id = ? AND json_valid(content)`).bind(weddingId).first<{ l: string | null }>();
  return links.find((l) => l.id === docs?.l) ?? links[0] ?? null;
}

/** Back one wedding up to its linked storage now; records when, where, or what went wrong. */
export async function backUpNow(env: Env, weddingId: string): Promise<{ ok: boolean; at: string; where: string; message?: string }> {
  const at = new Date().toISOString();
  const link = await backupLink(env, weddingId);
  if (!link) return { ok: false, at, where: '', message: 'Link a Google Drive, Dropbox or OneDrive first (Photos → Linked storage).' };
  const where = { gdrive: 'Google Drive', dropbox: 'Dropbox', onedrive: 'OneDrive', gphotos: 'Google Photos' }[link.provider];
  try {
    const b = await weddingBackup(env.DB, weddingId);
    if (!b) return { ok: false, at, where, message: 'Wedding not found.' };
    const slug = String(b.wedding.slug ?? 'wedding');
    await fileTo(env, link, 'backups', { bytes: new TextEncoder().encode(JSON.stringify(b)), name: `${at.slice(0, 10)} ${slug} backup.json`, type: 'application/json' });
    await env.DB.prepare(`UPDATE wedding SET content = json_remove(json_set(content, '$.backupAt', ?, '$.backupWhere', ?), '$.backupError') WHERE id = ? AND json_valid(content)`).bind(at, where, weddingId).run();
    return { ok: true, at, where };
  } catch (e) {
    const message = `The backup to ${where} didn't go through: ${(e as Error).message.slice(0, 200)}`;
    await env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.backupError', ?, '$.backupTried', ?) WHERE id = ? AND json_valid(content)`).bind(message, at, weddingId).run();
    return { ok: false, at, where, message };
  }
}

/**
 * The cron's part: weddings with a linked Drive, Dropbox or OneDrive whose last backup is a day old (or
 * never), a couple per run; one that failed is tried again six hours later, not every 15 minutes.
 */
export async function runBackups(env: Env, now = new Date(), limit = 2) {
  const day = new Date(now.getTime() - DAY + 15 * 60_000).toISOString(); // the same time each day, give or take a cron run
  const retry = new Date(now.getTime() - RETRY).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT w.id FROM wedding w
      WHERE w.deleted_at IS NULL AND json_valid(w.content)
        AND COALESCE(json_extract(w.content, '$.backupOff'), 0) = 0
        AND EXISTS (SELECT 1 FROM photo_link l WHERE l.wedding_id = w.id AND l.deleted_at IS NULL AND l.status = 'ok' AND l.provider != 'gphotos')
        AND COALESCE(json_extract(w.content, '$.backupAt'), '') < ?
        AND COALESCE(json_extract(w.content, '$.backupTried'), '') < ?
      ORDER BY COALESCE(json_extract(w.content, '$.backupAt'), '') LIMIT ?`,
  )
    .bind(day, retry, limit)
    .all<{ id: string }>();
  let done = 0;
  for (const r of results) if ((await backUpNow(env, r.id)).ok) done++;
  return { due: results.length, done };
}

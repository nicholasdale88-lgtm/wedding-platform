import type { Env } from '../env';
import { keepDocument } from '../photos/store';
import { buttonEmail, emailReady, sendEmail } from './email';
import { MAX_PLANNER_FILE } from './security';

/**
 * What quote requests share: filing a quote's file (the couple's own, or the one a vendor attaches on
 * their link), the facts a request's email is filled with, and telling the couple when a quote comes in.
 */

export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type FileType = (typeof FILE_TYPES)[number];
type Stored = { ok: true; id: string; name: string; where: string } | { ok: false; code: string; message: string };

/** Files a PDF or photo (base64) for the wedding: in its linked Drive, Dropbox or OneDrive if it has one, else here. */
export async function storePlannerFile(env: Env, weddingId: string, f: { name: string; type: FileType; data: string }): Promise<Stored> {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(f.data), (ch) => ch.charCodeAt(0));
  } catch {
    return { ok: false, code: 'invalid', message: 'That file could not be read.' };
  }
  if (bytes.byteLength > MAX_PLANNER_FILE) return { ok: false, code: 'too_large', message: 'That file is over 1.5 MB. Try a smaller PDF or a photo.' };
  // It must really be what it says (a PDF starts %PDF; images by their first bytes).
  const head = String.fromCharCode(...bytes.slice(0, 12));
  const t = f.type;
  const real =
    t === 'application/pdf'
      ? head.startsWith('%PDF')
      : t === 'image/jpeg'
        ? bytes[0] === 0xff && bytes[1] === 0xd8
        : t === 'image/png'
          ? bytes[0] === 0x89 && head.slice(1, 4) === 'PNG'
          : t === 'image/webp'
            ? head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP'
            : head.slice(4, 8) === 'ftyp';
  if (!real) return { ok: false, code: 'invalid', message: "That file isn't the PDF or photo it says it is." };
  const id = crypto.randomUUID();
  const remote = await keepDocument(env, weddingId, { bytes, name: f.name, type: t });
  await env.DB.prepare(`INSERT INTO planner_file (id, wedding_id, name, type, bytes, data, created_at, remote) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, weddingId, f.name, t, bytes.byteLength, remote ? new Uint8Array(0) : bytes, new Date().toISOString(), remote)
    .run();
  // Where it went: the linked storage's kind (gdrive, dropbox, onedrive), or '' for here.
  const where = remote ? ((await env.DB.prepare(`SELECT provider FROM photo_link WHERE id = ?`).bind(remote.split(':')[1] ?? '').first<{ provider: string }>())?.provider ?? '') : '';
  return { ok: true, id, name: f.name, where };
}

const first = (s: string) => s.trim().split(/\s+/)[0] ?? '';

/** What a vendor is told about the wedding: first names, the first event's date and venue, about how many guests. */
export async function weddingFacts(db: D1Database, weddingId: string) {
  const w = await db.prepare(`SELECT id, slug, name1, name2, timezone FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(weddingId).first<{ id: string; slug: string; name1: string; name2: string; timezone: string }>();
  if (!w) return null;
  const ev = await db.prepare(`SELECT id, key, name, starts_at, venue FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(w.id).first<{ id: string; key: string; name: string; starts_at: string; venue: string | null }>();
  // About how many guests: everyone invited to the first event who hasn't said no.
  const guests = ev
    ? ((
        await db
          .prepare(
            `SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = ?1
              LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ?1
              WHERE i.wedding_id = ?2 AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND COALESCE(r.attending, 1) != 0`,
          )
          .bind(ev.id, w.id)
          .first<{ n: number }>()
      )?.n ?? 0)
    : 0;
  return { w, ev, guests, couple: `${first(w.name1)} & ${first(w.name2)}` };
}
export type WeddingFacts = NonNullable<Awaited<ReturnType<typeof weddingFacts>>>;

const longDay = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');

/** A request's email with its blanks filled for one vendor: {couple} {date} {venue} {guests} {due} {link}. */
export function fillRequest(text: string, f: WeddingFacts, due: string, link: string) {
  let date = 'our wedding day';
  try {
    if (f.ev) date = new Date(f.ev.starts_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: f.w.timezone });
  } catch {
    /* keeps "our wedding day" */
  }
  return text
    .replace(/\{couple\}/g, f.couple)
    .replace(/\{date\}/g, date)
    .replace(/\{venue\}/g, f.ev?.venue || 'our venue')
    .replace(/\{guests\}/g, f.guests ? String(f.guests) : 'our')
    .replace(/\{due\}/g, longDay(due) || 'soon')
    .replace(/\{link\}/g, link);
}

/** A vendor's private page for a request. */
export const requestLink = (env: Env, slug: string, key: string) => `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/w/${slug}/quote?k=${encodeURIComponent(key)}`;

/** The owners' emails (they get the news, and vendors' replies go to them). */
export async function ownerEmails(db: D1Database, weddingId: string) {
  const { results } = await db.prepare(`SELECT u.email FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = ? AND m.role = 'owner'`).bind(weddingId).all<{ email: string }>();
  return results.map((r) => r.email).filter(Boolean);
}

/** Tells the couple a vendor answered (a quote, or that they can't), with a button to the comparison. Never throws. */
export async function tellCouple(env: Env, f: WeddingFacts, subject: string, lines: string[]) {
  if (!emailReady(env)) return;
  try {
    const link = `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/admin/${f.w.id}/${f.ev?.key ?? 'wedding'}/planner?view=vendors`;
    const m = buttonEmail({ heading: subject, lines, button: 'See your quotes', link, footer: 'From your wedding planner: quotes appear side by side as they come in.' });
    for (const to of await ownerEmails(env.DB, f.w.id)) await sendEmail(env, { to, subject, ...m });
  } catch {
    /* the quote is saved either way */
  }
}

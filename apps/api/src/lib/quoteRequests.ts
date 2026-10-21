import { dateIn, nextFollowUp } from '@wp/shared';
import type { Env } from '../env';
import { changeDoc, readDoc } from '../routes/planner';
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

/**
 * Emails a quote request (or a reminder) to these vendors, each with their own private link; replies go to
 * the couple. Vendors who have answered or said they can't are left out; those without an email are
 * listed back (to text or copy the link instead). Reminders are counted (automatic ones stop at two).
 */
export type SendResult = { error: string; status: 404 | 409; message: string } | { sent: string[]; skipped: string[] };
export async function sendRequests(env: Env, weddingId: string, rfqId: string, vendorIds: string[], remindAsked: boolean, now = new Date()): Promise<SendResult> {
  const f = await weddingFacts(env.DB, weddingId);
  if (!f) return { error: 'not_found', status: 404, message: 'Wedding not found.' };
  const doc = await readDoc(env.DB, weddingId, 'vendors', '');
  const rfq = doc.data.rfqs.find((r) => r.id === rfqId);
  if (!rfq) return { error: 'not_found', status: 404, message: 'That quote request has gone.' };
  if (rfq.closed) return { error: 'closed', status: 409, message: 'That request is decided: reopen it to send again.' };
  const replyTo = await ownerEmails(env.DB, weddingId);
  const sent: string[] = [];
  const skipped: string[] = [];
  for (const id of vendorIds) {
    const rv = rfq.vendors.find((x) => x.vendorId === id);
    const v = doc.data.list.find((x) => x.id === id);
    if (!rv || !v || !rv.key || rv.answeredOn || rv.declinedOn) continue;
    const to = v.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      skipped.push(id);
      continue;
    }
    const link = requestLink(env, f.w.slug, rv.key);
    const remind = remindAsked && !!rv.sentOn;
    const base = fillRequest(rfq.subject || 'Quote request: {couple}', f, rfq.due, link);
    const subject = remind ? `Reminder: ${base}` : base;
    const intro = remind ? [`Just a friendly reminder from ${f.couple}: we'd still love your quote${rfq.due ? ` by ${fillRequest('{due}', f, rfq.due, link)}` : ''}. It only takes a couple of minutes, and you can attach your own quote.`, ''] : [];
    const text = [...intro, fillRequest(rfq.message, f, rfq.due, link)].join('\n');
    const m = buttonEmail({ heading: remind ? 'A quick reminder' : `A quote request from ${f.couple}`, lines: text.split('\n').filter((l) => l.trim() && !l.includes(link)), button: 'Price it here', link, footer: `Reply to this email to reach ${f.couple}.` });
    if (await sendEmail(env, { to, subject: subject.slice(0, 200), ...m, replyTo })) sent.push(id);
    else skipped.push(id);
  }
  const today = dateIn(f.w.timezone, now);
  if (sent.length) {
    await changeDoc(env.DB, weddingId, 'vendors', '', (d) => {
      const r = d.rfqs.find((x) => x.id === rfq.id);
      if (!r) return false;
      for (const rv of r.vendors.filter((x) => sent.includes(x.vendorId))) {
        if (remindAsked && rv.sentOn) {
          rv.remindedOn = today;
          rv.followUps += 1;
        } else rv.sentOn = rv.sentOn || today;
      }
      // The quote tracker knows they've been asked, and when the quote is due.
      for (const v of d.list.filter((x) => sent.includes(x.id))) {
        if (v.status === 'idea' || v.status === 'contacted') v.status = 'requested';
        v.askedOn = v.askedOn || today;
        v.quoteBy = v.quoteBy || r.due;
        if (remindAsked) v.chasedOn = today;
      }
    });
  }
  return { sent, skipped };
}

/**
 * The cron's follow-ups: every open request with automatic follow-ups on, each vendor whose next reminder
 * is due (from 9am their time; never twice in a day) is reminded. A few weddings per run.
 */
export async function runQuoteFollowUps(env: Env, now = new Date(), limit = 20) {
  if (!emailReady(env)) return { weddings: 0, sent: 0 };
  const { results } = await env.DB.prepare(
    `SELECT d.wedding_id AS id, w.timezone FROM planner_doc d JOIN wedding w ON w.id = d.wedding_id
      WHERE d.kind = 'vendors' AND d.scope = '' AND w.deleted_at IS NULL AND d.data LIKE '%"autoFollow":true%'`,
  ).all<{ id: string; timezone: string }>();
  let sent = 0;
  let weddings = 0;
  for (const w of results) {
    if (weddings >= limit) break;
    const tz = w.timezone || 'Australia/Sydney';
    const hour = Number(new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now));
    if (hour < 9 || hour >= 20) continue;
    const today = dateIn(tz, now);
    const doc = await readDoc(env.DB, w.id, 'vendors', '');
    let touched = false;
    for (const rfq of doc.data.rfqs) {
      const due = rfq.vendors.filter((rv) => rv.remindedOn !== today && (() => { const d = nextFollowUp(rfq, rv); return !!d && d <= today; })()).map((rv) => rv.vendorId);
      if (!due.length) continue;
      touched = true;
      const r = await sendRequests(env, w.id, rfq.id, due, true, now);
      if (!('error' in r)) sent += r.sent.length;
    }
    if (touched) weddings++;
  }
  return { weddings, sent };
}

import { allPayments, dateIn, localParts } from '@wp/shared';
import type { Env } from '../env';
import { readDoc } from '../routes/planner';
import { buttonEmail, emailReady, sendEmail } from './email';

/**
 * The couple's daily summary email, at about 6pm their time: who replied since the last one (yes and no,
 * with names), messages waiting for them, and payments due in the next week. Only sent when there's
 * something to say, once a day, to the wedding's owners; switched off with Settings → System check.
 */
const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

/** What today's summary would say for one wedding (null when there's nothing to say). */
export async function digestFor(env: Env, weddingId: string, since: string, now = new Date()) {
  const db = env.DB;
  const w = await db.prepare(`SELECT slug, name1, name2, timezone FROM wedding WHERE id = ?`).bind(weddingId).first<{ slug: string; name1: string; name2: string; timezone: string }>();
  if (!w) return null;
  const { results: replies } = await db
    .prepare(
      `SELECT r.attending, r.count, e.name AS event, e.sort,
              (SELECT p.name FROM person p WHERE p.invitation_id = r.invitation_id AND p.deleted_at IS NULL ORDER BY p.idx LIMIT 1) AS who
         FROM rsvp r JOIN event e ON e.id = r.event_id AND e.deleted_at IS NULL
         JOIN invitation i ON i.id = r.invitation_id AND i.deleted_at IS NULL
        WHERE e.wedding_id = ? AND r.updated_at > ? AND r.attending IS NOT NULL
        ORDER BY r.updated_at`,
    )
    .bind(weddingId, since)
    .all<{ attending: number; count: number; event: string; sort: number; who: string | null }>();
  const waiting = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM sms_in WHERE wedding_id = ?1 AND action = 'Needs you' AND handled = 0) +
              (SELECT COUNT(*) FROM message WHERE wedding_id = ?1 AND from_guest = 1 AND read_at IS NULL) AS n`,
    )
    .bind(weddingId)
    .first<{ n: number }>();
  const today = dateIn(w.timezone, now);
  const week = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const [budget, vendors] = await Promise.all([readDoc(db, weddingId, 'budget', ''), readDoc(db, weddingId, 'vendors', '')]);
  const due = allPayments(budget.data.lines, vendors.data.list).filter((p) => !p.paid && p.due && p.due <= week && p.amount > 0);

  const lines: string[] = [];
  if (replies.length) {
    const yes = replies.filter((r) => r.attending === 1);
    const no = replies.filter((r) => r.attending === 0);
    const names = (xs: typeof replies) => [...new Set(xs.map((r) => r.who?.split(' ')[0] ?? 'A guest'))];
    const list = (xs: string[]) => (xs.length > 6 ? `${xs.slice(0, 6).join(', ')} and ${xs.length - 6} more` : xs.join(', '));
    if (yes.length) lines.push(`Yes from ${list(names(yes))} (${yes.reduce((s, r) => s + r.count, 0)} coming).`);
    if (no.length) lines.push(`Can't make it: ${list(names(no))}.`);
  }
  if (waiting?.n) lines.push(`${waiting.n} ${waiting.n === 1 ? 'message is' : 'messages are'} waiting for you.`);
  for (const p of due.slice(0, 4)) lines.push(`${p.due < today ? 'Overdue' : `Due ${p.due === today ? 'today' : new Date(`${p.due}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`}: ${p.who} ${p.label.toLowerCase()} ${fmt(p.amount)}.`);
  if (!lines.length) return null;
  const couple = `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`;
  return { couple, lines, link: `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/admin` };
}

/** Every wedding whose summary is due (after 6pm their time, not sent today): a few per cron run. */
export async function runDigests(env: Env, now = new Date(), limit = 20) {
  if (!emailReady(env)) return { due: 0, sent: 0 };
  const { results } = await env.DB.prepare(
    `SELECT w.id, w.timezone, COALESCE(json_extract(w.content, '$.digestOn'), '') AS last_day, COALESCE(json_extract(w.content, '$.digestAt'), '') AS last_at
       FROM wedding w
      WHERE w.deleted_at IS NULL AND json_valid(w.content) AND COALESCE(json_extract(w.content, '$.digestOff'), 0) = 0`,
  ).all<{ id: string; timezone: string; last_day: string; last_at: string }>();
  const due = results.filter((r) => localParts(now, r.timezone || 'Australia/Sydney').hour >= 18 && r.last_day !== dateIn(r.timezone, now)).slice(0, limit);
  let sent = 0;
  for (const r of due) {
    const today = dateIn(r.timezone, now);
    // Marked first, so a slow or failed send never sends twice in a day.
    await env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.digestOn', ?, '$.digestAt', ?) WHERE id = ?`).bind(today, now.toISOString(), r.id).run();
    const d = await digestFor(env, r.id, r.last_at || new Date(now.getTime() - 86_400_000).toISOString(), now).catch(() => null);
    if (!d) continue;
    const { results: owners } = await env.DB.prepare(`SELECT u.email FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = ? AND m.role = 'owner'`).bind(r.id).all<{ email: string }>();
    const m = buttonEmail({ heading: `Today for ${d.couple}`, lines: d.lines, button: 'Open your wedding', link: d.link, footer: 'A summary once a day, only when there’s news. Turn it off in Settings → System check.' });
    for (const o of owners) if (await sendEmail(env, { to: o.email, subject: `Your wedding today: ${d.lines[0]!.slice(0, 60)}`, ...m })) sent++;
  }
  return { due: due.length, sent };
}

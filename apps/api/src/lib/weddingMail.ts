import type { Env } from '../env';
import { safeEqual } from '../sms/webhook';
import { emailReady, plainHtml, sendEmail } from './email';
import { allow } from './rateLimit';
import { safeJson } from './security';
import { mainAccountOf } from '../routes/accounts';

/**
 * A wedding's own email address, and sending from it (free: Cloudflare Email Routing brings mail in,
 * Resend's free tier sends it out).
 * - With INBOX_DOMAIN set, every wedding gets <its web address>@<INBOX_DOMAIN> unless they chose one.
 * - Sent mail goes From "Name1 & Name2" <their address>, Reply-To their address, so answers come back in.
 * - Copies of what arrives can go to the couple's own inbox (Outlook, Apple Mail, Gmail): their Reply goes
 *   to reply+<email id>.<signature>@<INBOX_DOMAIN>, comes back here, and is sent on from the wedding address.
 * Resend's free tier is shared by every wedding (100 a day), so each wedding sends at most MAIL_PER_DAY.
 */

export const MAIL_PER_DAY = 40;
const DAY = 24 * 3_600_000;
const capKey = (weddingId: string) => `mail:${weddingId}`;

/** The domain, tidied ("@Example.com " → "example.com"); '' when not set. */
export const inboxDomain = (env: Env) => (env.INBOX_DOMAIN ?? '').trim().toLowerCase().replace(/^@+/, '');

export interface InboxSettings {
  address?: string;
  /** Who gets a copy of each email (user ids). Not set: the main account. */
  copies?: string[];
}

export async function readInbox(db: D1Database, weddingId: string): Promise<InboxSettings> {
  const row = await db.prepare(`SELECT json_extract(content, '$.inbox') AS inbox FROM wedding WHERE id = ?`).bind(weddingId).first<{ inbox: string | null }>();
  const v = safeJson<unknown>(row?.inbox, {});
  return v && typeof v === 'object' ? (v as InboxSettings) : {};
}

/** Changes some of the inbox settings, keeping the rest. */
export async function saveInbox(db: D1Database, weddingId: string, patch: InboxSettings) {
  const next = { ...(await readInbox(db, weddingId)), ...patch };
  await db.prepare(`UPDATE wedding SET content = json_set(content, '$.inbox', json(?)) WHERE id = ? AND json_valid(content)`).bind(JSON.stringify(next), weddingId).run();
  return next;
}

/** True when no other wedding has this address (one wedding's emails must never land in another's). */
export async function addressFree(db: D1Database, address: string, weddingId: string) {
  return !(await db.prepare(`SELECT 1 FROM wedding WHERE lower(json_extract(content, '$.inbox.address')) = ? AND id != ? AND deleted_at IS NULL`).bind(address, weddingId).first());
}

/**
 * The wedding's address. Never set before and INBOX_DOMAIN on: <slug>@<domain>, saved now (weddings made
 * before the domain was set get theirs the first time the inbox is opened). Cleared on purpose ('') stays off.
 */
export async function ensureAddress(env: Env, weddingId: string): Promise<string> {
  const inbox = await readInbox(env.DB, weddingId);
  if (typeof inbox.address === 'string') return inbox.address;
  const domain = inboxDomain(env);
  if (!domain) return '';
  const w = await env.DB.prepare(`SELECT slug FROM wedding WHERE id = ?`).bind(weddingId).first<{ slug: string }>();
  if (!w) return '';
  const address = `${w.slug.toLowerCase()}@${domain}`;
  if (!(await addressFree(env.DB, address, weddingId))) return '';
  await saveInbox(env.DB, weddingId, { address });
  return address;
}

/** Quotes and angle brackets out, so a name can't break the From line. */
const displayName = (s: string) => s.replace(/["<>\\\r\n]/g, '').trim();

/** Who it's from: the couple's names and their address (or the site's address, when theirs isn't on the verified domain). */
export async function senderOf(env: Env, weddingId: string, address: string) {
  const w = await env.DB.prepare(`SELECT name1, name2 FROM wedding WHERE id = ?`).bind(weddingId).first<{ name1: string; name2: string }>();
  const name = displayName([w?.name1, w?.name2].filter(Boolean).join(' & ')) || 'Our wedding';
  const domain = inboxDomain(env);
  // Resend only sends from a verified domain: an address elsewhere (their own Gmail, say) goes out from the
  // site's address under their names, with replies still to theirs.
  const ownDomain = !!domain && address.endsWith(`@${domain}`);
  const siteAddr = /<([^>]+)>/.exec(env.EMAIL_FROM ?? '')?.[1] ?? (env.EMAIL_FROM ?? '').trim();
  return { name, from: `"${name}" <${ownDomain ? address : siteAddr}>`, replyTo: address ? [address] : [] };
}

/** How many emails the wedding can still send today. */
export async function mailLeft(db: D1Database, weddingId: string, now = new Date()) {
  const row = await db.prepare(`SELECT n, reset_at FROM rate_limit WHERE k = ?`).bind(capKey(weddingId)).first<{ n: number; reset_at: string }>();
  if (!row || row.reset_at <= now.toISOString()) return MAIL_PER_DAY;
  return Math.max(0, MAIL_PER_DAY - row.n);
}

/** Counts one email against today's allowance; false when the day's emails are used up. */
export const takeMail = (db: D1Database, weddingId: string) => allow(db, capKey(weddingId), MAIL_PER_DAY, DAY);

export const CAP_MESSAGE = `You’ve sent ${MAIL_PER_DAY} emails today, the most for one day. The rest can go tomorrow.`;

// ---- Replying from Outlook or Apple Mail -------------------------------------------------------------

const enc = new TextEncoder();

/** A short signature over the email's id, so only our own copies' Reply-To addresses are accepted. */
async function signId(secret: string, id: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`inbox-reply:${id}`)));
  return [...mac.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** reply+<id>.<sig>@<domain>: where a copy's Reply goes. '' when replies by email can't work. */
export async function replyAddress(env: Env, id: string) {
  const domain = inboxDomain(env);
  if (!domain || !env.SESSION_SECRET) return '';
  return `reply+${id}.${await signId(env.SESSION_SECRET, id)}@${domain}`;
}

/** The email id from a reply+ address, only when its signature is right; null otherwise. */
export async function readReplyAddress(env: Env, to: string): Promise<string | null> {
  const domain = inboxDomain(env);
  if (!domain || !env.SESSION_SECRET) return null;
  const m = /^reply\+([0-9a-f-]{36})\.([0-9a-f]{16})@(.+)$/.exec(to.trim().toLowerCase());
  if (!m || m[3] !== domain) return null;
  return safeEqual(m[2]!, await signId(env.SESSION_SECRET, m[1]!)) ? m[1]! : null;
}

/** The new part of a reply: everything above "On … wrote:", "-----Original Message-----", "From:" or quoted ">" lines. */
export function stripQuoted(text: string) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.trim();
    const joined = `${l} ${(lines[i + 1] ?? '').trim()}`; // Gmail and Apple Mail sometimes wrap "On … wrote:" over two lines
    if (/^on .{4,200}wrote:$/i.test(l) || /^on .{4,200}wrote:$/i.test(joined)) break;
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(l) || /^_{8,}$/.test(l)) break;
    if (/^from:\s.+/i.test(l) && out.length) break; // Outlook puts the old message under From: / Sent: / To:
    if (l.startsWith('>')) continue;
    out.push(lines[i]!);
  }
  return out.join('\n').trim();
}

/** The members chosen to get copies, with their emails (the main account when nobody was chosen). */
export async function copyRecipients(db: D1Database, weddingId: string, inbox?: InboxSettings) {
  const chosen = (inbox ?? (await readInbox(db, weddingId))).copies;
  const ids = Array.isArray(chosen) ? chosen.filter((x) => typeof x === 'string') : [await mainAccountOf(db, weddingId)].filter((x): x is string => !!x);
  if (!ids.length) return [];
  const { results } = await db
    .prepare(`SELECT u.id, u.email FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = ? AND u.id IN (${ids.map(() => '?').join(', ')})`)
    .bind(weddingId, ...ids)
    .all<{ id: string; email: string }>();
  return results.filter((r) => r.email);
}

/** A copy of an email that just arrived, to each chosen member; their Reply comes back through replyAddress. */
export async function sendCopies(env: Env, weddingId: string, email: { id: string; fromAddr: string; fromName: string; subject: string; body: string; files: number }) {
  if (!emailReady(env)) return 0;
  const replyTo = await replyAddress(env, email.id);
  if (!replyTo) return 0;
  const inbox = await readInbox(env.DB, weddingId);
  // Never to the sender, nor to the wedding's own address (that would loop).
  const people = (await copyRecipients(env.DB, weddingId, inbox)).filter((p) => ![email.fromAddr, (inbox.address ?? '').toLowerCase()].includes(p.email.toLowerCase()));
  if (!people.length) return 0;
  const me = await senderOf(env, weddingId, inbox.address ?? '');
  const who = email.fromName ? `${email.fromName} <${email.fromAddr}>` : email.fromAddr;
  const text = [
    `From ${who}, to ${inbox.address ?? 'your wedding address'}:`,
    '',
    email.body,
    ...(email.files ? ['', `(${email.files} attachment${email.files === 1 ? '' : 's'}: open Messages → Email in the app to see ${email.files === 1 ? 'it' : 'them'}.)`] : []),
    '',
    '---',
    `Reply to this email and your answer goes to ${email.fromName || email.fromAddr} from your wedding address.`,
  ].join('\n');
  let sent = 0;
  for (const p of people) {
    if (!(await takeMail(env.DB, weddingId))) break;
    if (await sendEmail(env, { to: p.email, from: me.from, replyTo: [replyTo], subject: email.subject || '(no subject)', text, html: plainHtml(text) })) sent++;
  }
  return sent;
}

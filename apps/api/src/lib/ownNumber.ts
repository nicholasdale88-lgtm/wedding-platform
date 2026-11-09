import { toE164, toProviderFormat } from '@wp/shared';
import type { Env } from '../env';
import { safeJson } from './security';
import { mmAuth, smsAccountFor, type SmsAccount } from './smsAccount';

/**
 * "Send from my own number (automatic)": the couple's own mobile as the sender of every automatic text,
 * through the site's Mobile Message account, while the couple has text credits (lib/smsAccount.ts).
 * See docs/OWN_NUMBER_TEXTING.md.
 * - POST /v1/senders { number, label } texts the number a confirmation link (free, valid 1 hour). There is no
 *   code to type: they tap Confirm on that phone. 409 = already active, 429 = one sent in the last 5 minutes.
 * - GET /v1/senders lists the active senders; their number appearing (type "own") means it's confirmed.
 * Once confirmed, the wedding's sms_sender is their number, so the engine's queue, caps and quiet hours apply
 * as for any texting number. Replies go to their phone, not to the site: RSVPs still come through each
 * guest's link. If the number stops being an active sender, the wedding falls back to "Text from my own
 * phone" (the manual stepper) and the couple is told.
 */

const API = 'https://api.mobilemessage.com.au/v1/senders';
export const LINK_VALID_MS = 3_600_000;

export type OwnNumberStatus = 'pending' | 'active' | 'expired' | 'lost';
export interface OwnNumber {
  number: string;
  status: OwnNumberStatus;
  requestedAt: string;
  confirmedAt?: string;
}

/** Only through Mobile Message, while the couple has text credits (Texto has no own-number senders). */
export const ownNumberReady = async (env: Env, weddingId: string) => !!(await smsAccountFor(env, weddingId));

export async function readOwnNumber(db: D1Database, weddingId: string): Promise<OwnNumber | null> {
  const row = await db.prepare(`SELECT json_extract(content, '$.ownNumber') AS o FROM wedding WHERE id = ?`).bind(weddingId).first<{ o: string | null }>();
  const o = safeJson<OwnNumber | null>(row?.o, null);
  return o && typeof o.number === 'string' ? o : null;
}

async function save(db: D1Database, weddingId: string, o: OwnNumber | null, extra: { sender?: string | null; via?: 'phone' | 'service' } = {}) {
  const stmts = [db.prepare(`UPDATE wedding SET content = json_set(content, '$.ownNumber', json(?)) WHERE id = ? AND json_valid(content)`).bind(JSON.stringify(o), weddingId)];
  if (extra.sender !== undefined) stmts.push(db.prepare(`UPDATE wedding SET sms_sender = ? WHERE id = ?`).bind(extra.sender, weddingId));
  if (extra.via) stmts.push(db.prepare(`UPDATE wedding SET content = json_set(content, '$.sendVia', ?) WHERE id = ? AND json_valid(content)`).bind(extra.via, weddingId));
  await db.batch(stmts);
}

/** The numbers Mobile Message will send from (E.164), or null when it can't be asked right now. */
async function activeOwnSenders(a: SmsAccount): Promise<Set<string> | null> {
  try {
    const r = await fetch(API, { headers: mmAuth(a) });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: { sender?: string; type?: string }[] };
    return new Set((j.results ?? []).filter((s) => s.type === 'own' || /^\+?\d{9,12}$/.test(s.sender ?? '')).map((s) => toE164(s.sender) ?? '').filter(Boolean));
  } catch {
    return null;
  }
}

export type RequestResult = { ok: true; own: OwnNumber } | { ok: false; message: string };

/** Step 1: text their mobile a confirmation link. */
export async function requestOwnNumber(env: Env, weddingId: string, mobile: string, label: string, now = new Date()): Promise<RequestResult> {
  const a = await smsAccountFor(env, weddingId);
  if (!a) return { ok: false, message: 'Buy some texts first (Texting → Buy texts, 8c a credit). Or text from your own phone instead (free).' };
  const number = toE164(mobile);
  if (!number) return { ok: false, message: 'That doesn’t look like an Australian mobile (04xx xxx xxx).' };
  let status = 0;
  try {
    const r = await fetch(API, { method: 'POST', headers: { ...mmAuth(a), 'content-type': 'application/json' }, body: JSON.stringify({ number: toProviderFormat(number), label: label.slice(0, 40) }) });
    status = r.status;
  } catch {
    status = 0;
  }
  if (status === 429) return { ok: false, message: 'A link was sent to that number in the last 5 minutes. Check your messages, or try again shortly.' };
  if (status !== 200 && status !== 201 && status !== 409) return { ok: false, message: 'The texting service couldn’t send the link just now. Please try again in a minute.' };
  // 409: it's already an active sender (confirmed before): ready straight away.
  const own: OwnNumber = status === 409 ? { number, status: 'active', requestedAt: now.toISOString(), confirmedAt: now.toISOString() } : { number, status: 'pending', requestedAt: now.toISOString() };
  await save(env.DB, weddingId, own, own.status === 'active' ? { sender: number, via: 'service' } : {});
  return { ok: true, own };
}

/** Step 2 ("I've tapped Confirm"): is it confirmed yet? A link more than an hour old has expired. */
export async function checkOwnNumber(env: Env, weddingId: string, now = new Date()): Promise<OwnNumber | null> {
  const own = await readOwnNumber(env.DB, weddingId);
  if (!own || own.status === 'active') return own;
  const a = await smsAccountFor(env, weddingId);
  if (!a) return own;
  const active = await activeOwnSenders(a);
  if (active?.has(own.number)) {
    const next: OwnNumber = { ...own, status: 'active', confirmedAt: now.toISOString() };
    await save(env.DB, weddingId, next, { sender: own.number, via: 'service' });
    return next;
  }
  if (own.status === 'pending' && now.getTime() - Date.parse(own.requestedAt) > LINK_VALID_MS) {
    const next: OwnNumber = { ...own, status: 'expired' };
    await save(env.DB, weddingId, next);
    return next;
  }
  return own;
}

/** Stop sending from their number: back to texting from their own phone (free, by hand). */
export async function removeOwnNumber(env: Env, weddingId: string) {
  const own = await readOwnNumber(env.DB, weddingId);
  const w = await env.DB.prepare(`SELECT sms_sender FROM wedding WHERE id = ?`).bind(weddingId).first<{ sms_sender: string | null }>();
  await save(env.DB, weddingId, null, { ...(own && w?.sms_sender === own.number ? { sender: null } : {}), via: 'phone' });
}

/**
 * Cron: a number that's no longer an active sender (deleted, carrier changed) stops being used straight away:
 * the wedding goes back to texting from their own phone, so nothing fails silently.
 */
export async function recheckOwnNumbers(env: Env) {
  const { results } = await env.DB.prepare(`SELECT id, sms_sender FROM wedding WHERE deleted_at IS NULL AND json_extract(content, '$.ownNumber.status') = 'active'`).all<{ id: string; sms_sender: string | null }>();
  let lost = 0;
  let checked = 0;
  for (const w of results) {
    // Only weddings still sending (with credits); couldn't ask: change nothing.
    const a = await smsAccountFor(env, w.id);
    const active = a ? await activeOwnSenders(a) : null;
    if (!active) continue;
    checked++;
    const own = await readOwnNumber(env.DB, w.id);
    if (!own || active.has(own.number)) continue;
    await save(env.DB, w.id, { ...own, status: 'lost' }, { ...(w.sms_sender === own.number ? { sender: null } : {}), via: 'phone' });
    lost++;
  }
  return { checked, lost };
}

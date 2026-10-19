import { segments, toE164 } from '@wp/shared';
import { flush, thanksKey, type EngineDeps } from './engine';
import { renderFor } from './render';
import type { InboundRow, Iso, NewOutbox, PhoneMatch, WeddingCtx } from './types';

export interface InboundSms {
  from: string;
  to: string | null;
  body: string;
  receivedAt: Iso;
  /** Mobile Message sends type "unsubscribe" when a guest opts out at their end. */
  type: 'inbound' | 'unsubscribe';
  /** Stable id for de-duplication (Mobile Message has none, so it's a hash of the payload). */
  providerId: string;
}

export const DEFAULT_REPLIES = {
  yes: "Wonderful, {first}! You're down as coming to {event}. Add numbers and dietary needs here: {link}",
  no: "Thanks for letting us know, {first}. We'll miss you! If plans change: {link}",
  multi: "Thanks {first}! You're invited to more than one celebration, so please reply for each one here: {link}",
};

const STOP = /^(stop|stopall|unsubscribe|opt ?out)\b/i;
const YES = /^(yes|y|yep|yeah|yes please|coming|attending|accept|definitely|absolutely|of course|we'?ll be there|i'?ll be there|will be there|count (us|me) in)\b/i;
const NO = /^(no|n|nope|sorry|can'?t|cannot|unable|decline|regretfully)\b/i;
const YES_ANY = /\b(yes|yep|yeah|coming|attending|accept|be there|see you|count (us|me) in)\b/i;
const NO_ANY = /\b(no|nope|can'?t|cannot|unable|decline|regret\w*|won'?t|not (be )?(able|coming|attending|make it))\b/i;
/** Polite openers that aren't an answer ("No worries…", "Sorry for the slow reply…"). */
const FILLER = /\b(no (worries|problem|probs?|stress|rush)|sorry (for|about) (the|my) (late|slow|delayed?)( reply| response)?)\b/gi;

/**
 * A text's answer: yes, no, or unclear. Only a clear answer is acted on; anything mixed ("Sorry, yes
 * we're coming", "Yes but can't do the brunch") goes to the couple instead of guessing.
 */
export function classify(text: string): 'yes' | 'no' | 'unclear' {
  const t = text.replace(FILLER, ' ').replace(/^[\s,.!-]+/, '').trim();
  const yes = YES.test(t);
  const no = !yes && NO.test(t);
  if (yes && !NO_ANY.test(t.replace(YES, ''))) return 'yes';
  if (no && !YES_ANY.test(t)) return 'no';
  return 'unclear';
}

export type InboundAction =
  | 'Duplicate'
  | 'Ignored'
  | 'Opted out'
  | 'Unknown number'
  | 'RSVP set to yes'
  | 'RSVP set to no'
  | 'Sent link'
  | 'Needs you';

/**
 * Handle a guest's text (docs/05 "Inbound reply rules"). Idempotent: a webhook
 * retry with the same payload is recorded once and acted on once.
 */
export async function handleInbound(d: EngineDeps, sms: InboundSms): Promise<InboundAction> {
  const rec = await recordInbound(d, sms);
  if (!rec) return 'Ignored';
  if (!rec.fresh) return 'Duplicate';
  return (await processInbound(d, rec.row)) ?? 'Duplicate';
}

/** Step 1, inside the webhook request: save it. Returns null for junk (no valid sender). */
export async function recordInbound(d: EngineDeps, sms: InboundSms): Promise<{ row: InboundRow; fresh: boolean } | null> {
  const from = toE164(sms.from);
  if (!from) return null;
  const row: InboundRow = {
    id: d.uuid(), weddingId: null, invitationId: null, providerId: sms.providerId, type: sms.type, from, to: sms.to,
    body: sms.body.trim().slice(0, 1000), action: 'Received',
    // Our own clock, so re-processing after a crash reuses the same time (and the same thank-you key).
    receivedAt: d.now().toISOString(),
  };
  return { row, fresh: await d.store.insertInbound(row) };
}

/** Cron: finish any text whose processing never completed (crash, timeout). */
export async function sweepInbound(d: EngineDeps): Promise<number> {
  const rows = await d.store.unprocessedInbound(new Date(d.now().getTime() - INBOUND_STALE_MS).toISOString());
  let n = 0;
  for (const row of rows) if (await processInbound(d, row)) n++;
  return n;
}

const INBOUND_STALE_MS = 2 * 60_000;

/** Step 2: act on it. Claimed atomically, so the webhook and the sweep never both act. */
export async function processInbound(d: EngineDeps, row: InboundRow): Promise<InboundAction | null> {
  const now = d.now();
  const claimed = await d.store.claimInbound(row.id, now.toISOString(), new Date(now.getTime() - INBOUND_STALE_MS).toISOString());
  if (!claimed) return null;
  const { id, from, body: text, receivedAt: at } = row;

  const matches = await d.store.matchPhone(from);
  const match = pick(matches, row.to);
  // One mobile on two invitations in this wedding (a shared family phone): never guess whose reply it is.
  const shared = !!match && matches.filter((m) => m.wedding.id === match.wedding.id).length > 1;
  const wedding = match?.wedding ?? (await weddingBySender(d, row.to));
  const outcome = (action: InboundAction) =>
    d.store.setInboundOutcome(id, { weddingId: wedding?.id ?? null, invitationId: match?.recipient.id ?? null, action });

  if (row.type === 'unsubscribe' || STOP.test(text)) {
    await d.store.optOut(from, 'STOP reply'); // the provider confirms the opt-out itself
    await outcome('Opted out');
    return 'Opted out';
  }

  if (!match) {
    if (wedding) {
      await forward(d, wedding, from, `Reply from ${from}: ${text}`);
      await flush(d, wedding);
    }
    await outcome('Unknown number');
    return 'Unknown number';
  }

  const { recipient: r, events, wedding: w } = match;
  const answer = shared ? 'unclear' : classify(text);
  const yes = answer === 'yes';
  const no = answer === 'no';
  const replies = { yes: w.replies?.yes || DEFAULT_REPLIES.yes, no: w.replies?.no || DEFAULT_REPLIES.no, multi: w.replies?.multi || DEFAULT_REPLIES.multi };
  let action: InboundAction = 'Needs you';
  let reply: NewOutbox | null = null;

  if ((yes || no) && r.invited.length === 1) {
    const eventKey = r.invited[0]!;
    const count = yes ? Math.max(1, r.seatsHeld) : (r.rsvp[eventKey]?.count ?? 1);
    await d.store.setRsvp(r.id, eventKey, { attending: yes, count }, at);
    const updated = { ...r, rsvpUpdatedAt: at, rsvp: { ...r.rsvp, [eventKey]: { attending: yes, count, answers: r.rsvp[eventKey]?.answers ?? {} } } };
    const label = events.find((e) => e.key === eventKey)?.pendingLabel ?? 'the celebration';
    const m = renderFor((yes ? replies.yes : replies.no).replaceAll('{event}', label), w, events, updated);
    // Same key as the thank-you autopilot, so this confirmation replaces it rather than doubling up.
    reply = toRow(w, r.id, thanksKey(updated), 'reply', r.phone!, m.body);
    action = yes ? 'RSVP set to yes' : 'RSVP set to no';
  } else if (yes || no) {
    const m = renderFor(replies.multi, w, events, r);
    reply = toRow(w, r.id, `reply:${id}`, 'reply', r.phone!, m.body);
    action = 'Sent link';
  }

  if (reply && !r.optOut) await d.store.enqueue([reply]);
  if (action === 'Needs you') await forward(d, w, from, `Reply from ${r.people[0] ?? from}${shared ? ' (shared mobile)' : ''}: ${text}`);
  await flush(d, w);
  await outcome(action);
  return action;
}

/** A number can be on several weddings: prefer the one whose sender number was texted, then the most recent. */
function pick(matches: PhoneMatch[], to: string | null): PhoneMatch | null {
  const toE = toE164(to);
  const bySender = toE ? matches.filter((m) => toE164(m.wedding.sender) === toE) : [];
  const pool = bySender.length ? bySender : matches;
  return [...pool].sort((a, b) => (b.lastTextedAt ?? '').localeCompare(a.lastTextedAt ?? ''))[0] ?? null;
}

async function weddingBySender(d: EngineDeps, to: string | null): Promise<WeddingCtx | null> {
  const toE = toE164(to);
  if (!toE) return null;
  return (await d.store.weddings()).find((w) => toE164(w.sender) === toE) ?? null;
}

/**
 * Queue "Reply from …" to the couple's mobile. The caller flushes. At most one forward per number every
 * 10 minutes (the key repeats), so nobody can run up texts by messaging the number over and over; every
 * text is still in Messages.
 */
async function forward(d: EngineDeps, w: WeddingCtx, from: string, text: string) {
  const admin = toE164(w.adminMobile);
  const tenMin = Math.floor(d.now().getTime() / 600_000);
  if (admin) await d.store.enqueue([toRow(w, null, `fwd:${w.id}:${toE164(from) ?? from}:${tenMin}`, 'forward', admin, text.slice(0, 300))]);
}

function toRow(w: WeddingCtx, invitationId: string | null, dedupeKey: string, kind: NewOutbox['kind'], to: string, body: string): NewOutbox {
  return { weddingId: w.id, invitationId, campaignId: null, dedupeKey, kind, to, body, parts: segments(body).parts };
}

/** Delivery receipt webhook. One receipt per part; any failed part marks the message failed. */
export async function handleReceipt(d: EngineDeps, providerId: string, status: string) {
  if (status === 'delivered' || status === 'failed') await d.store.markDelivery(providerId, status);
}

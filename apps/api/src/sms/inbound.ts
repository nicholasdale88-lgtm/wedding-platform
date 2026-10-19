import { segments, toE164 } from '@wp/shared';
import { flush, thanksKey, type EngineDeps } from './engine';
import { renderFor } from './render';
import type { Iso, NewOutbox, PhoneMatch, WeddingCtx } from './types';

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
const YES = /^(yes|y|yep|yeah|yes please|coming|attending|accept|definitely|absolutely|of course)\b/i;
const NO = /^(no|n|nope|sorry|can'?t|cannot|unable|decline|regretfully)\b/i;

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
  const from = toE164(sms.from);
  const text = sms.body.trim();
  if (!from) return 'Ignored';

  const id = d.uuid();
  const at = d.now().toISOString();
  const fresh = await d.store.insertInbound({
    id, weddingId: null, invitationId: null, providerId: sms.providerId, from, to: sms.to, body: text.slice(0, 1000),
    action: 'Received', receivedAt: sms.receivedAt || at,
  });
  if (!fresh) return 'Duplicate';

  const match = pick(await d.store.matchPhone(from), sms.to);
  const wedding = match?.wedding ?? (await weddingBySender(d, sms.to));
  const outcome = (action: InboundAction) =>
    d.store.setInboundOutcome(id, { weddingId: wedding?.id ?? null, invitationId: match?.recipient.id ?? null, action });

  if (sms.type === 'unsubscribe' || STOP.test(text)) {
    await d.store.optOut(from, 'STOP reply'); // the provider confirms the opt-out itself
    await outcome('Opted out');
    return 'Opted out';
  }

  if (!match) {
    if (wedding) {
      await forward(d, wedding, id, `Reply from ${from}: ${text}`);
      await flush(d, wedding);
    }
    await outcome('Unknown number');
    return 'Unknown number';
  }

  const { recipient: r, events, wedding: w } = match;
  const yes = YES.test(text);
  const no = !yes && NO.test(text);
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
  if (action === 'Needs you') await forward(d, w, id, `Reply from ${r.people[0] ?? from}: ${text}`);
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

/** Queue "Reply from …" to the couple's mobile. The caller flushes. */
async function forward(d: EngineDeps, w: WeddingCtx, inboundId: string, text: string) {
  const admin = toE164(w.adminMobile);
  if (admin) await d.store.enqueue([toRow(w, null, `fwd:${inboundId}`, 'forward', admin, text.slice(0, 300))]);
}

function toRow(w: WeddingCtx, invitationId: string | null, dedupeKey: string, kind: NewOutbox['kind'], to: string, body: string): NewOutbox {
  return { weddingId: w.id, invitationId, campaignId: null, dedupeKey, kind, to, body, parts: segments(body).parts };
}

/** Delivery receipt webhook. One receipt per part; any failed part marks the message failed. */
export async function handleReceipt(d: EngineDeps, providerId: string, status: string) {
  if (status === 'delivered' || status === 'failed') await d.store.markDelivery(providerId, status);
}

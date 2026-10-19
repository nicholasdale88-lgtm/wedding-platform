import { costCents, inQuietHours, localParts, segments, toE164, toProviderFormat, zonedToUtc } from '@wp/shared';
import { matches, recipientsFor, textable } from './audience';
import type { SmsProvider } from './provider';
import { renderFor } from './render';
import type { SmsStore } from './store';
import type { Campaign, EventInfo, NewOutbox, OutboxKind, OutboxResult, OutboxRow, Recipient, WeddingCtx } from './types';

/**
 * The SMS engine. Rules that must never break (docs/05):
 *  1. Nothing sends twice: every message has a unique dedupe key, enforced by the store.
 *  2. Campaign texts never go out in quiet hours; replies to guests do.
 *  3. Never text an opted-out number, a deleted invitation, or someone excluded.
 *  4. A provider failure sends nothing twice: a retry re-sends the same batch with the same Idempotency-Key.
 *  5. One wedding's failure never stops another's.
 */

export interface EngineDeps {
  store: SmsStore;
  provider: SmsProvider;
  now: () => Date;
  uuid: () => string;
}

export const LIMITS = {
  slotAttempts: 5,
  batchSize: 500,
  thanksDebounceMs: 10 * 60_000,
  thanksWindowMs: 7 * 24 * 3_600_000,
  /** Provider keeps Idempotency-Keys for 24 h; past this a retry could double-send, so stop and flag. */
  batchKeyTtlMs: 23 * 3_600_000,
  /** A row claimed for sending longer ago than this belongs to a run that crashed. */
  claimStaleMs: 10 * 60_000,
  /** Dated texts more than a day overdue (cron outage, credits out all day) are not sent late. */
  slotGraceMs: 24 * 3_600_000,
} as const;

const URGENT: OutboxKind[] = ['reply', 'forward', 'test'];
const ALL: OutboxKind[] = ['campaign', ...URGENT];

export interface FlushResult {
  sent: number;
  failed: number;
  /** Set when sending stopped early; slots retry on a later run. */
  stopped?: { reason: 'auth' | 'credits' | 'transient' | 'no-sender' | 'paused'; error: string };
}

export interface RunReport {
  weddings: number;
  sent: number;
  errors: { weddingId: string; error: string }[];
}

// ---------------------------------------------------------------- autopilot

/** Cron entry point, every 15 minutes. */
export async function runAutopilot(d: EngineDeps): Promise<RunReport> {
  const report: RunReport = { weddings: 0, sent: 0, errors: [] };
  for (const w of await d.store.weddings()) {
    report.weddings++;
    try {
      report.sent += await runWedding(d, w);
    } catch (e) {
      report.errors.push({ weddingId: w.id, error: (e as Error).message });
    }
  }
  return report;
}

async function runWedding(d: EngineDeps, w: WeddingCtx): Promise<number> {
  if (w.paused) return 0;
  const now = d.now();
  const quiet = inQuietHours(now, w.timezone, w.quietStart, w.quietEnd);
  const campaigns = (await d.store.campaigns(w.id)).filter((c) => c.enabled);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const { events, recipients } = await d.store.audience(w.id);
  const invitedBefore = await d.store.invitedIds(w.id);
  let sent = 0;

  // 1. Dated slots, claimed atomically. Audience is evaluated now, so late replies count.
  for (const slot of await d.store.claimDueSlots(w.id, now.toISOString(), LIMITS.slotAttempts)) {
    const c = byId.get(slot.campaignId);
    if (now.getTime() - Date.parse(slot.sendAt) > LIMITS.slotGraceMs) {
      // A reminder days late is worse than none; the admin sees it under "Needs you".
      await d.store.finishSlot(slot.id, 'cancelled', `Missed: was due ${slot.sendAt}`);
      continue;
    }
    if (quiet || !c) {
      await d.store.releaseSlot(slot.id); // waits for the morning
      continue;
    }
    const list = recipientsFor(c, recipients, invitedBefore);
    const prefix = `slot:${slot.id}:`;
    await d.store.cancelQueued(prefix, new Set(list.map((r) => r.id)));
    await enqueueCampaign(d, w, events, c, list, (r) => prefix + r.id);
    const res = await flush(d, w);
    sent += res.sent;
    if (res.stopped) {
      await d.store.finishSlot(slot.id, 'failed', res.stopped.error);
      return sent;
    }
    await d.store.finishSlot(slot.id, 'done');
  }

  // 2. Automatic texts: invitation on add, thank-you after each reply.
  if (!quiet) {
    const t = now.getTime();
    for (const c of campaigns.filter((x) => x.mode === 'auto')) {
      if (c.trigger === 'invitation_created') {
        // Invitations wait for their date (8 months before the first event, or the couple's choice).
        if (w.invitesFrom && now.toISOString() < w.invitesFrom) continue;
        await enqueueCampaign(d, w, events, c, recipientsFor(c, recipients, invitedBefore), (r) => `auto:${c.id}:${r.id}`);
      } else if (c.trigger === 'rsvp_changed') {
        const replied = recipients.filter((r) => {
          if (!r.rsvpUpdatedAt || !textable(r, c)) return false;
          const age = t - Date.parse(r.rsvpUpdatedAt);
          return age >= LIMITS.thanksDebounceMs && age <= LIMITS.thanksWindowMs;
        });
        await enqueueCampaign(d, w, events, c, replied, thanksKey);
      }
    }
  }

  // 3. Send whatever is queued (manual sends waiting for the morning, retries, etc.).
  sent += (await flush(d, w)).sent;
  return sent;
}

/** Shared with inbound confirmations so a YES by text doesn't also get the thank-you. */
export const thanksKey = (r: Pick<Recipient, 'id' | 'rsvpUpdatedAt'>) => `thanks:${r.id}:${r.rsvpUpdatedAt}`;

async function enqueueCampaign(
  d: EngineDeps,
  w: WeddingCtx,
  events: EventInfo[],
  c: Campaign,
  list: Recipient[],
  key: (r: Recipient) => string,
): Promise<number> {
  const rows: NewOutbox[] = list.map((r) => {
    const m = renderFor(c.body, w, events, r, { footer: true });
    return {
      weddingId: w.id,
      invitationId: r.id,
      campaignId: c.id,
      dedupeKey: key(r),
      kind: 'campaign',
      to: r.phone!,
      body: m.body,
      parts: m.parts,
      ...(m.unfilled.length ? { status: 'failed' as const, error: `Unfilled: {${m.unfilled.join('}, {')}}` } : {}),
    };
  });
  return rows.length ? d.store.enqueue(rows) : 0;
}

// ---------------------------------------------------------------- flush

/**
 * Send queued messages for one wedding. In quiet hours only replies/forwards/tests go.
 * Batches that were attempted before are re-sent exactly as they were, with the same key.
 */
export async function flush(d: EngineDeps, w: WeddingCtx): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0 };
  if (w.paused) return { ...result, stopped: { reason: 'paused', error: 'Texts are paused' } };
  if (!w.sender) return { ...result, stopped: { reason: 'no-sender', error: 'No SMS sender number is set up' } };
  const now = d.now();
  const nowIso = now.toISOString();
  const quiet = inQuietHours(now, w.timezone, w.quietStart, w.quietEnd);
  const staleBefore = new Date(now.getTime() - LIMITS.claimStaleMs).toISOString();
  let rows = await d.store.claimQueued(w.id, quiet ? URGENT : ALL, nowIso, staleBefore);
  if (!rows.length) return result;

  // Last-moment safety: STOP may have arrived since these were queued. Rows already sent to the
  // provider once keep their batch intact (a changed batch can't be replayed); the provider blocks them itself.
  const optedOut = await d.store.optedOut([...new Set(rows.map((r) => r.to))]);
  const blocked = (r: OutboxRow) => r.batchKey === null && optedOut.has(r.to);
  const expired = (r: OutboxRow) =>
    r.attemptedAt !== null && now.getTime() - Date.parse(r.attemptedAt) > LIMITS.batchKeyTtlMs;
  await d.store.markResults([
    ...rows.filter(blocked).map((r) => ({ id: r.id, status: 'blocked' as const, error: 'Opted out' })),
    ...rows
      .filter(expired)
      .map((r) => ({ id: r.id, status: 'failed' as const, error: 'Not confirmed by the provider within 23 hours. Check before resending.' })),
  ]);
  rows = rows.filter((r) => !blocked(r) && !expired(r));

  // Dated texts held over (cap, credits) are re-checked: a guest who has replied since is not reminded.
  const stale = await noLongerQualifies(d, w, rows.filter((r) => r.batchKey === null && r.dedupeKey.startsWith('slot:')));
  // Other held texts (a "Send now" in quiet hours, an autopilot text, a message to one guest): still sent
  // only if the guest is still on the list (not removed, not excluded) and the message still exists.
  const gone = await noLongerThere(d, w, rows.filter((r) => r.batchKey === null && r.kind === 'campaign' && !r.dedupeKey.startsWith('slot:')));
  await d.store.markResults([
    ...[...stale].map((id) => ({ id, status: 'cancelled' as const, error: 'No longer in the audience' })),
    ...[...gone].map((id) => ({ id, status: 'cancelled' as const, error: 'The guest or the message was removed' })),
  ]);
  rows = rows.filter((r) => !stale.has(r.id) && !gone.has(r.id));

  const { now: sendable, later } = await applyDailyCap(d, w, rows, now);
  await d.store.release(later.map((r) => r.id));

  const todo = batches(sendable);
  /** Anything not finished goes back to the queue for the next run. */
  const stop = async (i: number, reason: NonNullable<FlushResult['stopped']>['reason'], error: string) => {
    await d.store.release(todo.slice(i).flat().map((r) => r.id));
    return { ...result, stopped: { reason, error } };
  };
  let credits = w.walletCredits;

  for (const [i, batch] of todo.entries()) {
    const parts = batch.reduce((n, r) => n + r.parts, 0);
    if (credits !== null && credits < parts) return stop(i, 'credits', 'Not enough SMS credits. Top up to keep texts going.');
    const ids = batch.map((r) => r.id);
    const key = batch[0]!.batchKey ?? (await idempotencyKey(ids));
    if (!batch[0]!.batchKey) await d.store.assignBatch(ids, key, nowIso);

    const out = await d.provider.send(
      batch.map((r) => ({ to: toProviderFormat(r.to), message: r.body, sender: w.sender!, customRef: r.id })),
      key,
    );
    if (!out.ok) {
      if (out.reason === 'transient') return stop(i, 'transient', out.error);
      // Definitely not sent: clear the key so the next attempt isn't answered with this replayed error.
      await d.store.assignBatch(ids, null, nowIso);
      if (out.reason === 'rejected') {
        await d.store.markResults(ids.map((id) => ({ id, status: 'failed' as const, error: out.error })));
        result.failed += ids.length;
        continue;
      }
      return stop(i, out.reason, out.error);
    }

    const sentAt = now.toISOString();
    const partsById = new Map(batch.map((r) => [r.id, r.parts]));
    let used = 0;
    // Not attempted this run (a provider that sends one at a time stopped part-way): back to the queue.
    const unsent = out.results.filter((m) => m.status === 'unsent').map((m) => m.customRef);
    if (unsent.length) {
      await d.store.assignBatch(unsent, null, nowIso);
      await d.store.release(unsent);
    }
    await d.store.markResults(
      out.results.filter((m) => m.status !== 'unsent').map((m): OutboxResult => {
        if (m.status === 'success') {
          result.sent++;
          used += partsById.get(m.customRef) ?? 1;
          return { id: m.customRef, status: 'sent', providerId: m.messageId, sentAt };
        }
        result.failed++;
        return { id: m.customRef, status: m.status === 'blocked' ? 'blocked' : 'failed', error: m.error ?? 'Unsubscribed at provider' };
      }),
    );
    if (credits !== null) {
      credits -= used;
      await d.store.debitWallet(w.id, used);
    }
    if (out.stopped) return stop(i + 1, out.stopped.reason, out.stopped.error);
  }
  return result;
}

async function noLongerQualifies(d: EngineDeps, w: WeddingCtx, rows: OutboxRow[]): Promise<Set<string>> {
  if (!rows.length) return new Set();
  const campaigns = new Map((await d.store.campaigns(w.id)).map((c) => [c.id, c]));
  const { recipients } = await d.store.audience(w.id);
  const byId = new Map(recipients.map((r) => [r.id, r]));
  const invitedBefore = await d.store.invitedIds(w.id);
  return new Set(
    rows
      .filter((row) => {
        const c = row.campaignId ? campaigns.get(row.campaignId) : undefined;
        const r = row.invitationId ? byId.get(row.invitationId) : undefined;
        return !c || !c.enabled || !r || !textable(r, c) || !matches(c.audience, r, invitedBefore);
      })
      .map((row) => row.id),
  );
}

async function noLongerThere(d: EngineDeps, w: WeddingCtx, rows: OutboxRow[]): Promise<Set<string>> {
  if (!rows.length) return new Set();
  const campaigns = new Map((await d.store.campaigns(w.id)).map((c) => [c.id, c]));
  const { recipients } = await d.store.audience(w.id);
  const byId = new Map(recipients.map((r) => [r.id, r]));
  return new Set(
    rows
      .filter((row) => {
        const r = row.invitationId ? byId.get(row.invitationId) : undefined;
        if (row.invitationId && !r) return true; // the guest was removed
        if (!row.campaignId) return false; // a message to one guest: they're still here
        const c = campaigns.get(row.campaignId);
        if (!c) return true; // the message was deleted
        if (row.dedupeKey.startsWith('auto:') && !c.enabled) return true; // autopilot switched off since
        return !!r && !textable(r, c);
      })
      .map((row) => row.id),
  );
}

/** Previously attempted batches first (kept intact), then new rows in chunks. */
function batches(rows: OutboxRow[]): OutboxRow[][] {
  const retry = new Map<string, OutboxRow[]>();
  const fresh: OutboxRow[] = [];
  for (const r of rows) {
    if (r.batchKey) retry.set(r.batchKey, [...(retry.get(r.batchKey) ?? []), r]);
    else fresh.push(r);
  }
  const out = [...retry.values()];
  for (let i = 0; i < fresh.length; i += LIMITS.batchSize) out.push(fresh.slice(i, i + LIMITS.batchSize));
  return out;
}

/** Campaign texts beyond the wedding's daily cap wait until tomorrow. Replies and retries are never capped. */
async function applyDailyCap(d: EngineDeps, w: WeddingCtx, rows: OutboxRow[], now: Date) {
  const p = localParts(now, w.timezone);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dayStart = zonedToUtc(`${p.year}-${pad(p.month)}-${pad(p.day)}T00:00`, w.timezone).toISOString();
  let room = w.dailyCap - (await d.store.sentSince(w.id, dayStart));
  const out = { now: [] as OutboxRow[], later: [] as OutboxRow[] };
  for (const r of rows) (r.kind !== 'campaign' || r.batchKey !== null || room-- > 0 ? out.now : out.later).push(r);
  return out;
}

async function idempotencyKey(ids: string[]): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ids.join(',')));
  const h = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------- admin actions

export interface Estimate {
  count: number;
  /** Who it would go to (invitation ids). */
  ids: string[];
  parts: number;
  costCents: number;
  sample: string | null;
  quiet: boolean;
}

/** What a send would cost right now. Shown before every manual send, and for a draft (unsaved wording or audience). */
export async function estimate(d: EngineDeps, weddingId: string, campaignId: string, only?: string[], draft?: Draft): Promise<Estimate> {
  const { w, c, events, list } = await prepare(d, weddingId, campaignId, only, draft);
  const rendered = list.map((r) => renderFor(c.body, w, events, r, { footer: true }));
  const parts = rendered.reduce((n, m) => n + m.parts, 0);
  return {
    count: list.length,
    ids: list.map((r) => r.id),
    parts,
    costCents: costCents(parts, w.rateX100),
    sample: rendered[0]?.body ?? null,
    quiet: inQuietHours(d.now(), w.timezone, w.quietStart, w.quietEnd),
  };
}

/** "Send now": queues with a one-off key and sends unless it's quiet hours (then it waits for 8am). */
export async function sendNow(d: EngineDeps, weddingId: string, campaignId: string, only?: string[]) {
  const { w, c, events, list } = await prepare(d, weddingId, campaignId, only);
  const run = d.uuid();
  const queued = await enqueueCampaign(d, w, events, c, list, (r) => `manual:${run}:${r.id}`);
  const res = await flush(d, w);
  return { queued, ...res };
}

export type Draft = Partial<Pick<Campaign, 'body' | 'audience' | 'excluded'>>;

async function prepare(d: EngineDeps, weddingId: string, campaignId: string, only?: string[], draft: Draft = {}) {
  const w = await d.store.wedding(weddingId);
  if (!w) throw new Error('Wedding not found');
  const saved = (await d.store.campaigns(weddingId)).find((x) => x.id === campaignId);
  if (!saved) throw new Error('Message not found');
  const c: Campaign = { ...saved, ...draft };
  const { events, recipients } = await d.store.audience(weddingId);
  const invitedBefore = await d.store.invitedIds(weddingId);
  const list = only
    ? recipients.filter((r) => only.includes(r.id) && textable(r))
    : recipientsFor(c, recipients, invitedBefore);
  return { w, c, events, list };
}

/** "Send a test to me". Goes immediately, any hour. */
export async function sendTest(d: EngineDeps, weddingId: string, to: string, body: string) {
  const w = await d.store.wedding(weddingId);
  const phone = toE164(to);
  if (!w || !phone) throw new Error('Enter a valid Australian mobile');
  await d.store.enqueue([
    { weddingId, invitationId: null, campaignId: null, dedupeKey: `test:${d.uuid()}`, kind: 'test', to: phone, body, parts: segments(body).parts },
  ]);
  return flush(d, w);
}

/** The couple's reply to a guest's message, as a text to that guest (Account → Messages). Never to an opted-out number. */
/**
 * One text to one guest. `held`: a message the couple started (not an answer to the guest's own text),
 * so it waits out quiet hours and counts towards the daily cap like any other text.
 */
export async function sendReply(d: EngineDeps, weddingId: string, invitationId: string, to: string, body: string, key: string, held = false) {
  const w = await d.store.wedding(weddingId);
  const phone = toE164(to);
  if (!w || !phone) throw new Error('This guest has no mobile to text.');
  await d.store.enqueue([{ weddingId, invitationId, campaignId: null, dedupeKey: key, kind: held ? 'campaign' : 'reply', to: phone, body, parts: segments(body).parts }]);
  return flush(d, w);
}

import type {
  Campaign, EventInfo, InboundRow, Iso, NewOutbox, OutboxKind, OutboxResult, OutboxRow, PhoneMatch, Recipient,
  Slot, WeddingCtx,
} from './types';

/**
 * Everything the SMS engine needs from storage. The D1 implementation lives in
 * ../db/smsStore.ts; tests use an in-memory one with the same guarantees:
 *  - enqueue() ignores rows whose dedupeKey already exists (INSERT OR IGNORE)
 *  - claimDueSlots() is atomic, so overlapping cron runs can't claim the same slot
 *  - cancelQueued() never touches rows that already have a batchKey (they may have reached the provider)
 *  - audience() reflects the platform-wide STOP list in Recipient.optOut
 */
export interface SmsStore {
  weddings(): Promise<WeddingCtx[]>;
  wedding(id: string): Promise<WeddingCtx | null>;
  audience(weddingId: string): Promise<{ events: EventInfo[]; recipients: Recipient[] }>;
  campaigns(weddingId: string): Promise<Campaign[]>;

  /** Due slots of enabled 'dates' campaigns: pending|failed, send_at <= now, attempts < max. Also reclaims slots left 'claimed' for over 10 minutes by a crashed run. */
  claimDueSlots(weddingId: string, now: Iso, maxAttempts: number): Promise<Slot[]>;
  /** Hand a claimed slot back untouched (quiet hours): pending, attempt not counted. */
  releaseSlot(slotId: string): Promise<void>;
  finishSlot(slotId: string, status: 'done' | 'failed' | 'cancelled', error?: string): Promise<void>;

  /** Returns how many rows were new. */
  enqueue(rows: NewOutbox[]): Promise<number>;
  /** Cancel still-queued, never-attempted rows with this prefix whose invitation no longer qualifies. */
  cancelQueued(dedupePrefix: string, keepInvitationIds: Set<string>): Promise<void>;
  /**
   * Atomically move queued rows (oldest first) to 'sending' and return them, so two
   * overlapping flushes never get the same row. Also reclaims rows stuck in 'sending'
   * since before `staleBefore` (a crashed run); their batchKey keeps the resend safe.
   */
  claimQueued(weddingId: string, kinds: OutboxKind[], now: Iso, staleBefore: Iso): Promise<OutboxRow[]>;
  /** Put claimed rows back to 'queued' (send later). */
  release(ids: string[]): Promise<void>;
  /** Stamp rows with their Idempotency-Key before sending; null clears it after a definite non-send. */
  assignBatch(ids: string[], batchKey: string | null, at: Iso): Promise<void>;
  markResults(results: OutboxResult[]): Promise<void>;
  /** Campaign messages sent since the given instant, for the daily cap. */
  sentSince(weddingId: string, since: Iso): Promise<number>;
  /** Invitations that have successfully received an 'invitation_created' text. */
  invitedIds(weddingId: string): Promise<Set<string>>;
  debitWallet(weddingId: string, credits: number): Promise<void>;
  /** Which of these numbers are on the platform-wide STOP list. */
  optedOut(phones: string[]): Promise<Set<string>>;

  // Inbound
  insertInbound(row: InboundRow): Promise<boolean>;
  /** Atomically take a recorded text for processing (or one stuck in processing since before staleBefore). */
  claimInbound(id: string, now: Iso, staleBefore: Iso): Promise<boolean>;
  /** Texts recorded but never processed, or stuck in processing since before staleBefore. */
  unprocessedInbound(staleBefore: Iso): Promise<InboundRow[]>;
  setInboundOutcome(id: string, outcome: Pick<InboundRow, 'weddingId' | 'invitationId' | 'action'>): Promise<void>;
  matchPhone(phone: string): Promise<PhoneMatch[]>;
  /** Platform-wide STOP: every invitation with this number, in every wedding. */
  optOut(phone: string, source: string): Promise<void>;
  setRsvp(invitationId: string, eventKey: string, rsvp: { attending: boolean; count: number }, at: Iso): Promise<void>;

  // Delivery receipts
  markDelivery(providerId: string, status: 'delivered' | 'failed'): Promise<void>;
}

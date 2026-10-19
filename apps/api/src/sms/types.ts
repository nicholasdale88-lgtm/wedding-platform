import { z } from 'zod';

export type Iso = string;

/** Who a campaign goes to. Every clause present must match (AND). See docs/05. */
export const Audience = z
  .object({
    all: z.literal(true).optional(),
    invitedTo: z.string().optional(),
    attending: z.string().optional(),
    awaitingAny: z.literal(true).optional(),
    declinedAll: z.literal(true).optional(),
    /** Only invitations that have already received their invitation text (e.g. reminders). */
    invitedBefore: z.literal(true).optional(),
    answer: z
      .object({
        event: z.string(),
        key: z.string(),
        in: z.array(z.string()).optional(),
        notIn: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .strict();
export type Audience = z.infer<typeof Audience>;

export interface WeddingCtx {
  id: string;
  slug: string;
  name1: string;
  name2: string;
  timezone: string;
  quietStart: number;
  quietEnd: number;
  /** "Pause all texts" kill switch. */
  paused: boolean;
  sender: string | null;
  adminMobile: string | null;
  dailyCap: number;
  rateX100: number;
  /** Prepaid credits; null means unlimited (tenant pays the provider directly). */
  walletCredits: number | null;
  /** Appended to campaign texts that don't mention STOP (Spam Act). Empty disables. */
  optOutFooter: string;
  baseUrl: string;
  /** Automatic replies to YES / NO texts. Defaults in inbound.ts; editable per wedding. */
  replies?: Partial<Record<'yes'   /** Invitations start going out at this time (the couple's date, else 8 months before the first event). */
  invitesFrom?: Iso | null;
  /** True when the couple picked the date. */
  invitesFromCustom?: boolean;
| 'no' | 'multi', string>>;
}

export interface EventInfo {
  id: string;
  key: string;
  name: string;
  /** How {pending} names this event: "the wedding". */
  pendingLabel: string;
  sort: number;
}

export interface RsvpState {
  attending: boolean | null;
  count: number;
  answers: Record<string, string>;
}

export interface Recipient {
  id: string;
  token: string;
  phone: string | null;
  optOut: boolean;
  people: string[];
  seatsHeld: number;
  /** Event keys this invitation is invited to. */
  invited: string[];
  rsvp: Record<string, RsvpState>;
  rsvpUpdatedAt: Iso | null;
  tableName: string | null;
}

export type CampaignMode = 'auto' | 'dates' | 'manual';
export type Trigger = 'invitation_created' | 'rsvp_changed';

export interface Campaign {
  id: string;
  weddingId: string;
  key: string;
  name: string;
  body: string;
  mode: CampaignMode;
  enabled: boolean;
  trigger: Trigger | null;
  audience: Audience;
  excluded: string[];
}

export type SlotStatus = 'pending' | 'claimed' | 'done' | 'failed' | 'cancelled';
export interface Slot {
  id: string;
  campaignId: string;
  sendAt: Iso;
  status: SlotStatus;
  attempts: number;
  lastError: string | null;
}

/** campaign texts obey quiet hours; replies, forwards and tests go straight away. */
export type OutboxKind = 'campaign' | 'reply' | 'forward' | 'test';
/** 'sending' = claimed by one flush; nobody else can pick it up until released or finished. */
export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'blocked' | 'cancelled';

export interface NewOutbox {
  weddingId: string;
  invitationId: string | null;
  campaignId: string | null;
  dedupeKey: string;
  kind: OutboxKind;
  to: string;
  body: string;
  parts: number;
  /** Rows that can never be sent (e.g. unfilled placeholder) are stored as failed so the admin sees them. */
  status?: 'queued' | 'failed';
  error?: string | null;
}

export interface OutboxRow extends Omit<NewOutbox, 'status' | 'error'> {
  id: string;
  status: OutboxStatus;
  providerId: string | null;
  error: string | null;
  createdAt: Iso;
  sentAt: Iso | null;
  /**
   * Idempotency-Key of the first send attempt. A retry re-sends exactly the same
   * batch with the same key, so the provider replays instead of sending twice.
   */
  batchKey: string | null;
  attemptedAt: Iso | null;
}

export interface OutboxResult {
  id: string;
  status: OutboxStatus;
  providerId?: string | null;
  error?: string | null;
  sentAt?: Iso | null;
}

export interface InboundRow {
  id: string;
  weddingId: string | null;
  invitationId: string | null;
  providerId: string;
  type: 'inbound' | 'unsubscribe';
  from: string;
  to: string | null;
  body: string;
  action: string;
  receivedAt: Iso;
}

export interface PhoneMatch {
  wedding: WeddingCtx;
  recipient: Recipient;
  events: EventInfo[];
  /** When this wedding last texted the number (to pick between weddings sharing it). */
  lastTextedAt: Iso | null;
}

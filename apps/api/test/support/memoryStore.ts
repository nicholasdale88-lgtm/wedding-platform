import type { SmsStore } from '../../src/sms/store';
import type {
  Campaign, EventInfo, InboundRow, NewOutbox, OutboxRow, Recipient, Slot, WeddingCtx,
} from '../../src/sms/types';

/** In-memory SmsStore with the same guarantees as D1 (unique dedupe keys, atomic claims). */
export class MemoryStore implements SmsStore {
  weddingList: WeddingCtx[] = [];
  events = new Map<string, EventInfo[]>();
  invitations: { weddingId: string; r: Recipient; deleted: boolean }[] = [];
  campaignList: Campaign[] = [];
  slots: Slot[] = [];
  outbox: OutboxRow[] = [];
  inbound: InboundRow[] = [];
  stopList = new Set<string>();
  private seq = 0;

  private clone = <T>(x: T): T => structuredClone(x);
  private live = (weddingId: string) => this.invitations.filter((i) => i.weddingId === weddingId && !i.deleted);

  async weddings() { return this.clone(this.weddingList); }
  async wedding(id: string) { return this.clone(this.weddingList.find((w) => w.id === id) ?? null); }

  async audience(weddingId: string) {
    return {
      events: this.clone(this.events.get(weddingId) ?? []),
      recipients: this.live(weddingId).map(({ r }) => ({ ...this.clone(r), optOut: r.optOut || (!!r.phone && this.stopList.has(r.phone)) })),
    };
  }

  async campaigns(weddingId: string) { return this.clone(this.campaignList.filter((c) => c.weddingId === weddingId)); }

  slotClaims = new Map<string, string>();
  async claimDueSlots(weddingId: string, now: string, maxAttempts: number) {
    const stale = new Date(Date.parse(now) - 10 * 60_000).toISOString();
    const ok = new Set(this.campaignList.filter((c) => c.weddingId === weddingId && c.enabled && c.mode === 'dates').map((c) => c.id));
    const claimed = this.slots.filter(
      (s) =>
        ok.has(s.campaignId) && s.sendAt <= now && s.attempts < maxAttempts &&
        (s.status === 'pending' || s.status === 'failed' || (s.status === 'claimed' && (this.slotClaims.get(s.id) ?? '') < stale)),
    );
    for (const s of claimed) { s.status = 'claimed'; s.attempts++; this.slotClaims.set(s.id, now); }
    return this.clone(claimed);
  }
  async releaseSlot(id: string) { const s = this.slot(id); s.status = 'pending'; s.attempts--; }
  async finishSlot(id: string, status: 'done' | 'failed' | 'cancelled', error?: string) { const s = this.slot(id); s.status = status; s.lastError = error ?? null; }
  private slot(id: string) { const s = this.slots.find((x) => x.id === id); if (!s) throw new Error('no slot'); return s; }

  async queuedKeys(weddingId: string, prefix: string) {
    return new Set(this.outbox.filter((o) => o.weddingId === weddingId && o.dedupeKey.startsWith(prefix)).map((o) => o.dedupeKey));
  }

  async enqueue(rows: NewOutbox[]) {
    let n = 0;
    for (const r of rows) {
      if (this.outbox.some((o) => o.dedupeKey === r.dedupeKey)) continue;
      this.outbox.push({
        ...r, id: `o${++this.seq}`, status: r.status ?? 'queued', error: r.error ?? null, providerId: null,
        createdAt: new Date(this.seq).toISOString(), sentAt: null, batchKey: null, attemptedAt: null,
      });
      n++;
    }
    return n;
  }
  async cancelQueued(prefix: string, keep: Set<string>) {
    for (const o of this.outbox)
      if (o.status === 'queued' && !o.batchKey && o.dedupeKey.startsWith(prefix) && !keep.has(o.invitationId ?? '')) o.status = 'cancelled';
  }
  claimedAt = new Map<string, string>();
  async claimQueued(weddingId: string, kinds: string[], now: string, staleBefore: string) {
    const rows = this.outbox.filter(
      (o) => o.weddingId === weddingId && kinds.includes(o.kind) &&
        (o.status === 'queued' || (o.status === 'sending' && (this.claimedAt.get(o.id) ?? '') < staleBefore)),
    );
    for (const o of rows) { o.status = 'sending'; this.claimedAt.set(o.id, now); }
    return this.clone(rows);
  }
  async release(ids: string[]) { for (const o of this.outbox) if (ids.includes(o.id) && o.status === 'sending') o.status = 'queued'; }
  async assignBatch(ids: string[], key: string | null, at: string) {
    for (const o of this.outbox) if (ids.includes(o.id)) { o.batchKey = key; o.attemptedAt = key ? at : null; }
  }
  async markResults(results: { id: string; status: OutboxRow['status']; providerId?: string | null; error?: string | null; sentAt?: string | null }[]) {
    for (const r of results) {
      const o = this.outbox.find((x) => x.id === r.id);
      if (!o) continue;
      o.status = r.status;
      if (r.providerId !== undefined) o.providerId = r.providerId;
      if (r.error !== undefined) o.error = r.error;
      if (r.sentAt !== undefined) o.sentAt = r.sentAt;
    }
  }
  async sentSince(weddingId: string, since: string) {
    return this.outbox.filter((o) => o.weddingId === weddingId && o.kind === 'campaign' && o.sentAt && o.sentAt >= since).length;
  }
  async invitedIds(weddingId: string) {
    const invite = new Set(this.campaignList.filter((c) => c.weddingId === weddingId && c.trigger === 'invitation_created').map((c) => c.id));
    return new Set(
      this.outbox.filter((o) => o.campaignId && invite.has(o.campaignId) && (o.status === 'sent' || o.status === 'delivered')).map((o) => o.invitationId!),
    );
  }
  async debitWallet(weddingId: string, n: number) {
    const w = this.weddingList.find((x) => x.id === weddingId)!;
    if (w.walletCredits !== null) w.walletCredits -= n;
  }
  async optedOut(phones: string[]) { return new Set(phones.filter((p) => this.stopList.has(p))); }

  inboundClaims = new Map<string, string>();
  async insertInbound(row: InboundRow) {
    if (this.inbound.some((i) => i.providerId === row.providerId)) return false;
    this.inbound.push({ ...row });
    return true;
  }
  async claimInbound(id: string, now: string, staleBefore: string) {
    const row = this.inbound.find((i) => i.id === id);
    const stuck = row?.action === 'Processing' && (this.inboundClaims.get(id) ?? '') < staleBefore;
    if (!row || (row.action !== 'Received' && !stuck)) return false;
    row.action = 'Processing';
    this.inboundClaims.set(id, now);
    return true;
  }
  async unprocessedInbound(staleBefore: string) {
    return this.clone(
      this.inbound.filter((i) => i.action === 'Received' || (i.action === 'Processing' && (this.inboundClaims.get(i.id) ?? '') < staleBefore)),
    );
  }
  async setInboundOutcome(id: string, o: Pick<InboundRow, 'weddingId' | 'invitationId' | 'action'>) {
    Object.assign(this.inbound.find((i) => i.id === id)!, o);
  }
  async matchPhone(phone: string) {
    return this.invitations
      .filter((i) => !i.deleted && i.r.phone === phone)
      .map((i) => {
        const wedding = this.clone(this.weddingList.find((w) => w.id === i.weddingId)!);
        const sent = this.outbox.filter((o) => o.weddingId === i.weddingId && o.to === phone && o.sentAt).map((o) => o.sentAt!).sort();
        return {
          wedding,
          recipient: { ...this.clone(i.r), optOut: i.r.optOut || this.stopList.has(phone) },
          events: this.clone(this.events.get(i.weddingId) ?? []),
          lastTextedAt: sent.at(-1) ?? null,
        };
      });
  }
  async optOut(phone: string) {
    this.stopList.add(phone);
    for (const i of this.invitations) if (i.r.phone === phone) i.r.optOut = true;
  }
  async setRsvp(invitationId: string, eventKey: string, v: { attending: boolean; count: number }, at: string) {
    const r = this.invitations.find((i) => i.r.id === invitationId)!.r;
    r.rsvp[eventKey] = { attending: v.attending, count: v.count, answers: r.rsvp[eventKey]?.answers ?? {} };
    r.rsvpUpdatedAt = at;
  }
  async markDelivery(providerId: string, status: 'delivered' | 'failed') {
    const o = this.outbox.find((x) => x.providerId === providerId);
    if (o && (o.status === 'sent' || status === 'failed')) o.status = status;
  }

  // ---- test helpers
  recipient(id: string) { return this.invitations.find((i) => i.r.id === id)!.r; }
  sentTo(filter: (o: OutboxRow) => boolean = () => true) {
    return this.outbox.filter((o) => (o.status === 'sent' || o.status === 'delivered') && filter(o));
  }
}

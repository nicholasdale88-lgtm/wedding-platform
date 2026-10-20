import { defaultInvitesFrom, guidesOf } from '@wp/shared';
import type { EventFacts } from '../sms/smart';
import { clearDietIfDeclinedAll, clearMealsIfDeclined, releaseShuttlesIfDeclined, unseatIfNotComing } from '../lib/seatingRules';
import type { SmsStore } from '../sms/store';
import {
  Audience, type Campaign, type EventInfo, type InboundRow, type Iso, type NewOutbox, type OutboxKind, type OutboxResult,
  type OutboxRow, type PhoneMatch, type Recipient, type Slot, type WeddingCtx,
} from '../sms/types';

/**
 * D1 implementation of the SMS engine's storage. Guarantees come from SQL, not from code:
 *  - UNIQUE sms_out.dedupe_key + INSERT OR IGNORE: nothing is queued twice
 *  - single UPDATE ... RETURNING statements: claims are atomic across overlapping cron runs
 * Lists are passed as one JSON parameter (json_each) to stay under D1's 100-parameter limit.
 */
export class D1SmsStore implements SmsStore {
  constructor(
    private db: D1Database,
    private baseUrl: string,
    private newId: () => string = () => crypto.randomUUID(),
  ) {}

  private all = async <T>(sql: string, ...params: unknown[]) => (await this.db.prepare(sql).bind(...params).all<T>()).results;
  private run = async (sql: string, ...params: unknown[]) => (await this.db.prepare(sql).bind(...params).run()).meta.changes ?? 0;

  // ---------------------------------------------------------------- reads

  async weddings() {
    return (await this.all<WeddingRow>(`SELECT *, (SELECT MIN(e.starts_at) FROM event e WHERE e.wedding_id = wedding.id AND e.deleted_at IS NULL) AS first_event FROM wedding WHERE deleted_at IS NULL`)).map((w) => this.toWedding(w));
  }

  async wedding(id: string) {
    const [w] = await this.all<WeddingRow>(`SELECT *, (SELECT MIN(e.starts_at) FROM event e WHERE e.wedding_id = wedding.id AND e.deleted_at IS NULL) AS first_event FROM wedding WHERE id = ? AND deleted_at IS NULL`, id);
    return w ? this.toWedding(w) : null;
  }

  async audience(weddingId: string) {
    const q = (sql: string) => this.db.prepare(sql).bind(weddingId);
    const [events, invitations, people, invites, rsvps] = await this.db.batch([
      q(`SELECT id, key, name, pending_label, sort FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`),
      q(`SELECT i.id, i.token, i.phone, i.seats_held, i.sms_optout, o.phone IS NOT NULL AS stopped
           FROM invitation i LEFT JOIN opt_out o ON o.phone = i.phone
          WHERE i.wedding_id = ? AND i.deleted_at IS NULL`),
      // {table} comes from the *published* seating (first event that has one), never a draft.
      q(`SELECT p.invitation_id, p.name,
                (SELECT json_extract(tb.value, '$.name')
                   FROM seat_publish sp JOIN event e ON e.id = sp.event_id, json_each(sp.snapshot, '$.tables') tb
                  WHERE e.wedding_id = i.wedding_id AND e.deleted_at IS NULL
                    AND EXISTS (SELECT 1 FROM rsvp r WHERE r.invitation_id = i.id AND r.event_id = e.id AND r.attending = 1)
                    AND json_extract(tb.value, '$.id') = json_extract(sp.snapshot, '$.seats."' || p.id || '"')
                  ORDER BY e.sort LIMIT 1) AS table_name
           FROM person p JOIN invitation i ON i.id = p.invitation_id
          WHERE i.wedding_id = ? AND p.deleted_at IS NULL ORDER BY p.invitation_id, p.idx`),
      q(`SELECT ie.invitation_id, e.key FROM invite_event ie JOIN event e ON e.id = ie.event_id
          WHERE e.wedding_id = ? AND e.deleted_at IS NULL`),
      q(`SELECT r.invitation_id, e.key, r.attending, r.count, r.answers, r.updated_at FROM rsvp r
           JOIN event e ON e.id = r.event_id WHERE e.wedding_id = ? AND e.deleted_at IS NULL`),
    ]);

    const byId = new Map<string, Recipient>();
    for (const i of invitations!.results as InvitationRow[]) {
      byId.set(i.id, {
        id: i.id, token: i.token, phone: i.phone, optOut: !!i.sms_optout || !!i.stopped, people: [], seatsHeld: i.seats_held,
        invited: [], rsvp: {}, rsvpUpdatedAt: null, tableName: null,
      });
    }
    for (const p of people!.results as { invitation_id: string; name: string; table_name: string | null }[]) {
      const r = byId.get(p.invitation_id);
      if (!r) continue;
      if (r.people.length === 0) r.tableName = p.table_name; // the main contact's table
      r.people.push(p.name);
    }
    for (const x of invites!.results as { invitation_id: string; key: string }[]) byId.get(x.invitation_id)?.invited.push(x.key);
    for (const x of rsvps!.results as RsvpRow[]) {
      const r = byId.get(x.invitation_id);
      if (!r) continue;
      r.rsvp[x.key] = { attending: x.attending === null ? null : !!x.attending, count: x.count, answers: parseJson(x.answers, {}) };
      // Only real answers count as "replied" (a count or note on an unanswered event must not trigger a thank-you).
      if (x.attending !== null && (!r.rsvpUpdatedAt || x.updated_at > r.rsvpUpdatedAt)) r.rsvpUpdatedAt = x.updated_at;
    }
    return {
      events: (events!.results as EventRow[]).map((e): EventInfo => ({ id: e.id, key: e.key, name: e.name, pendingLabel: e.pending_label, sort: e.sort })),
      recipients: [...byId.values()],
    };
  }

  async campaigns(weddingId: string) {
    const rows = await this.all<CampaignRow>(`SELECT * FROM campaign WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`, weddingId);
    return rows.map((c): Campaign => {
      const audience = Audience.safeParse(parseJson(c.audience, null));
      return {
        id: c.id, weddingId: c.wedding_id, key: c.key, name: c.name, body: c.body, mode: c.mode, trigger: c.trigger,
        // A malformed audience never sends to "everyone": the campaign is treated as switched off.
        enabled: !!c.enabled && audience.success,
        audience: audience.success ? audience.data : {},
        excluded: parseJson<string[]>(c.excluded, []),
      };
    });
  }

  // ---------------------------------------------------------------- slots

  async claimDueSlots(weddingId: string, now: Iso, maxAttempts: number) {
    const stale = new Date(Date.parse(now) - 10 * 60_000).toISOString();
    const rows = await this.all<SlotRow>(
      `UPDATE campaign_slot SET status = 'claimed', claimed_at = ?1, attempts = attempts + 1
        WHERE send_at <= ?1 AND attempts < ?2
          AND (status IN ('pending', 'failed') OR (status = 'claimed' AND claimed_at < ?3))
          AND campaign_id IN (SELECT id FROM campaign WHERE wedding_id = ?4 AND enabled = 1 AND mode = 'dates' AND deleted_at IS NULL)
        RETURNING *`,
      now, maxAttempts, stale, weddingId,
    );
    return rows
      .map((s): Slot => ({ id: s.id, campaignId: s.campaign_id, sendAt: s.send_at, status: s.status, attempts: s.attempts, lastError: s.last_error }))
      .sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  }

  async releaseSlot(id: string) {
    await this.run(`UPDATE campaign_slot SET status = 'pending', attempts = MAX(0, attempts - 1), claimed_at = NULL WHERE id = ?`, id);
  }

  async finishSlot(id: string, status: 'done' | 'failed' | 'cancelled', error?: string) {
    await this.run(`UPDATE campaign_slot SET status = ?, last_error = ?, claimed_at = NULL WHERE id = ?`, status, error ?? null, id);
  }

  // ---------------------------------------------------------------- outbox

  async queuedKeys(weddingId: string, prefix: string) {
    const rows = await this.all<{ dedupe_key: string }>(`SELECT dedupe_key FROM sms_out WHERE wedding_id = ? AND substr(dedupe_key, 1, ?) = ?`, weddingId, prefix.length, prefix);
    return new Set(rows.map((r) => r.dedupe_key));
  }

  async enqueue(rows: NewOutbox[]) {
    const now = new Date().toISOString();
    let inserted = 0;
    for (const chunk of chunks(rows, 50)) {
      const results = await this.db.batch(
        chunk.map((r) =>
          this.db
            .prepare(
              `INSERT OR IGNORE INTO sms_out (id, wedding_id, invitation_id, campaign_id, dedupe_key, kind, to_phone, body, parts, status, error, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(this.newId(), r.weddingId, r.invitationId, r.campaignId, r.dedupeKey, r.kind, r.to, r.body, r.parts, r.status ?? 'queued', r.error ?? null, now),
        ),
      );
      inserted += results.reduce((n, x) => n + (x.meta.changes ?? 0), 0);
    }
    return inserted;
  }

  async cancelQueued(prefix: string, keep: Set<string>) {
    await this.run(
      `UPDATE sms_out SET status = 'cancelled', error = 'No longer in the audience'
        WHERE status = 'queued' AND batch_key IS NULL AND substr(dedupe_key, 1, length(?1)) = ?1
          AND (invitation_id IS NULL OR invitation_id NOT IN (SELECT value FROM json_each(?2)))`,
      prefix, JSON.stringify([...keep]),
    );
  }

  async claimQueued(weddingId: string, kinds: OutboxKind[], now: Iso, staleBefore: Iso) {
    const rows = await this.all<OutRow>(
      `UPDATE sms_out SET status = 'sending', claimed_at = ?1
        WHERE wedding_id = ?2 AND kind IN (SELECT value FROM json_each(?3))
          AND (status = 'queued' OR (status = 'sending' AND claimed_at < ?4))
        RETURNING *`,
      now, weddingId, JSON.stringify(kinds), staleBefore,
    );
    return rows.map(toOutbox).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async release(ids: string[]) {
    if (!ids.length) return;
    await this.run(`UPDATE sms_out SET status = 'queued', claimed_at = NULL WHERE status = 'sending' AND id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids));
  }

  async assignBatch(ids: string[], key: string | null, at: Iso) {
    if (!ids.length) return;
    await this.run(
      `UPDATE sms_out SET batch_key = ?1, attempted_at = CASE WHEN ?1 IS NULL THEN NULL ELSE ?2 END WHERE id IN (SELECT value FROM json_each(?3))`,
      key, at, JSON.stringify(ids),
    );
  }

  async markResults(results: OutboxResult[]) {
    for (const chunk of chunks(results, 50)) {
      await this.db.batch(
        chunk.map((r) =>
          this.db
            .prepare(
              `UPDATE sms_out SET status = ?, provider_id = COALESCE(?, provider_id), error = COALESCE(?, error), sent_at = COALESCE(?, sent_at)
                WHERE id = ?`,
            )
            .bind(r.status, r.providerId ?? null, r.error ?? null, r.sentAt ?? null, r.id),
        ),
      );
    }
  }

  async sentSince(weddingId: string, since: Iso) {
    const [row] = await this.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sms_out WHERE wedding_id = ? AND kind = 'campaign' AND sent_at >= ?`, weddingId, since,
    );
    return row?.n ?? 0;
  }

  async invitedIds(weddingId: string) {
    const rows = await this.all<{ invitation_id: string }>(
      `SELECT DISTINCT o.invitation_id FROM sms_out o JOIN campaign c ON c.id = o.campaign_id
        WHERE c.wedding_id = ? AND c.trigger = 'invitation_created' AND o.status IN ('sent', 'delivered') AND o.invitation_id IS NOT NULL`,
      weddingId,
    );
    return new Set(rows.map((r) => r.invitation_id));
  }

  async debitWallet(weddingId: string, credits: number) {
    await this.run(`UPDATE wedding SET wallet_credits = wallet_credits - ? WHERE id = ? AND wallet_credits IS NOT NULL`, credits, weddingId);
  }

  async optedOut(phones: string[]) {
    if (!phones.length) return new Set<string>();
    const rows = await this.all<{ phone: string }>(`SELECT phone FROM opt_out WHERE phone IN (SELECT value FROM json_each(?))`, JSON.stringify(phones));
    return new Set(rows.map((r) => r.phone));
  }

  // ---------------------------------------------------------------- inbound

  async insertInbound(row: InboundRow) {
    const changes = await this.run(
      `INSERT OR IGNORE INTO sms_in (id, wedding_id, invitation_id, provider_id, type, from_phone, to_phone, body, action, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.weddingId, row.invitationId, row.providerId, row.type, row.from, row.to, row.body, row.action, row.receivedAt,
    );
    return changes > 0;
  }

  async claimInbound(id: string, now: Iso, staleBefore: Iso) {
    const changes = await this.run(
      `UPDATE sms_in SET action = 'Processing', claimed_at = ?1
        WHERE id = ?2 AND (action = 'Received' OR (action = 'Processing' AND claimed_at < ?3))`,
      now, id, staleBefore,
    );
    return changes > 0;
  }

  async unprocessedInbound(staleBefore: Iso) {
    const rows = await this.all<InRow>(
      `SELECT * FROM sms_in WHERE action = 'Received' OR (action = 'Processing' AND claimed_at < ?) ORDER BY received_at LIMIT 100`,
      staleBefore,
    );
    return rows.map(
      (r): InboundRow => ({
        id: r.id, weddingId: r.wedding_id, invitationId: r.invitation_id, providerId: r.provider_id, type: r.type === 'unsubscribe' ? 'unsubscribe' : 'inbound',
        from: r.from_phone, to: r.to_phone, body: r.body, action: r.action, receivedAt: r.received_at,
      }),
    );
  }

  async setInboundOutcome(id: string, o: Pick<InboundRow, 'weddingId' | 'invitationId' | 'action'>) {
    await this.run(`UPDATE sms_in SET wedding_id = ?, invitation_id = ?, action = ? WHERE id = ?`, o.weddingId, o.invitationId, o.action, id);
  }

  async matchPhone(phone: string) {
    const hits = await this.all<{ id: string; wedding_id: string; last_texted: string | null }>(
      `SELECT i.id, i.wedding_id,
              (SELECT MAX(o.sent_at) FROM sms_out o WHERE o.wedding_id = i.wedding_id AND o.to_phone = i.phone) AS last_texted
         FROM invitation i JOIN wedding w ON w.id = i.wedding_id
        WHERE i.phone = ? AND i.deleted_at IS NULL AND w.deleted_at IS NULL`,
      phone,
    );
    const out: PhoneMatch[] = [];
    for (const h of hits) {
      const wedding = await this.wedding(h.wedding_id);
      const { events, recipients } = await this.audience(h.wedding_id);
      const recipient = recipients.find((r) => r.id === h.id);
      if (wedding && recipient) out.push({ wedding, recipient, events, lastTextedAt: h.last_texted });
    }
    return out;
  }

  async optOut(phone: string, source: string) {
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO opt_out (phone, source, created_at) VALUES (?, ?, ?)`).bind(phone, source, now),
      this.db.prepare(`UPDATE invitation SET sms_optout = 1, updated_at = ?, version = version + 1 WHERE phone = ?`).bind(now, phone),
    ]);
  }

  async addDiet(invitationId: string, names: string[], diets: string[], at: Iso) {
    const rows = await this.all<{ id: string; name: string; diet: string }>(`SELECT id, name, diet FROM person WHERE invitation_id = ? AND deleted_at IS NULL`, invitationId);
    const stmts = rows
      .filter((p) => names.includes(p.name))
      .map((p) => {
        const have = p.diet.split(/;\s*/).filter(Boolean);
        const next = [...have, ...diets.filter((d) => !have.some((h) => h.toLowerCase() === d.toLowerCase()))].join('; ').slice(0, 500);
        return this.db.prepare(`UPDATE person SET diet = ? WHERE id = ?`).bind(next, p.id);
      });
    if (!stmts.length) return;
    // Bump the version so an admin editing this invitation gets "updated elsewhere" instead of overwriting it.
    stmts.push(this.db.prepare(`UPDATE invitation SET version = version + 1, updated_at = ? WHERE id = ?`).bind(at, invitationId));
    await this.db.batch(stmts);
  }

  async eventFacts(weddingId: string): Promise<EventFacts[]> {
    const [w] = await this.all<{ guide: string | null }>(`SELECT guide FROM wedding WHERE id = ?`, weddingId);
    const events = await this.all<{ key: string; name: string; starts_at: string; venue: string | null; address: string | null }>(
      `SELECT key, name, starts_at, venue, address FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`,
      weddingId,
    );
    const guides = guidesOf(parseJson(w?.guide ?? null, {}), events.map((e) => e.key));
    return events.map((e) => {
      const g = guides[e.key] as Record<string, unknown> | undefined;
      const str = (k: string) => (typeof g?.[k] === 'string' ? (g[k] as string).trim() : '');
      return {
        eventKey: e.key,
        name: e.name,
        startsAt: e.starts_at,
        venue: e.venue ?? '',
        address: e.address || str('address'),
        arrive: str('arrive') ? `Arrive from ${str('arrive')}` : str('arriveBy') ? `Be there by ${str('arriveBy')}` : '',
        parking: [str('parking'), str('parkDirections')].filter(Boolean).join(' '),
        dress: str('dress'),
        faq: Array.isArray(g?.faq) ? (g.faq as { q: string; a: string }[]) : [],
      };
    });
  }

  async setRsvp(invitationId: string, eventKey: string, v: { attending: boolean; count: number }, at: Iso) {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO rsvp (invitation_id, event_id, attending, count, via, updated_at)
           SELECT i.id, e.id, ?, ?, 'sms', ? FROM invitation i JOIN event e ON e.wedding_id = i.wedding_id AND e.key = ?
            WHERE i.id = ?
           ON CONFLICT (invitation_id, event_id) DO UPDATE
             SET attending = excluded.attending, count = excluded.count, via = 'sms', updated_at = excluded.updated_at`,
        )
        .bind(v.attending ? 1 : 0, v.count, at, eventKey, invitationId),
      // Bump the version so an admin editing this invitation gets "updated elsewhere" instead of overwriting it.
      // Same rules as replies on the invitation: a seat needs a yes; declining everything clears dietary.
      unseatIfNotComing(this.db, invitationId),
      releaseShuttlesIfDeclined(this.db, invitationId),
      clearMealsIfDeclined(this.db, invitationId),
      clearDietIfDeclinedAll(this.db, invitationId),
      this.db.prepare(`UPDATE invitation SET version = version + 1, updated_at = ? WHERE id = ?`).bind(at, invitationId),
    ]);
  }

  async markDelivery(providerId: string, status: 'delivered' | 'failed') {
    await this.run(
      `UPDATE sms_out SET status = ?1 WHERE provider_id = ?2 AND (status = 'sent' OR (?1 = 'failed' AND status = 'delivered'))`,
      status, providerId,
    );
  }

  // ---------------------------------------------------------------- mapping

  private toWedding(w: WeddingRow): WeddingCtx {
    return {
      id: w.id, slug: w.slug, name1: w.name1, name2: w.name2, timezone: w.timezone, quietStart: w.quiet_start, quietEnd: w.quiet_end,
      paused: !!w.sms_paused, sender: w.sms_sender, adminMobile: w.admin_mobile, dailyCap: w.sms_daily_cap, rateX100: w.sms_rate_cents_x100,
      walletCredits: w.wallet_credits, optOutFooter: w.sms_optout_footer, baseUrl: this.baseUrl,
      replies: parseJson(w.sms_replies, {}),
      plan: w.plan,
      rsvpClose: (() => {
        const close = parseJson<{ invitation?: { rsvpClose?: unknown } }>(w.content, {}).invitation?.rsvpClose;
        return typeof close === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(close) ? close : '';
      })(),
      ...invitesFrom(w.invites_from, w.first_event),
    };
  }
}

function toOutbox(r: OutRow): OutboxRow {
  return {
    id: r.id, weddingId: r.wedding_id, invitationId: r.invitation_id, campaignId: r.campaign_id, dedupeKey: r.dedupe_key, kind: r.kind,
    to: r.to_phone, body: r.body, parts: r.parts, status: r.status, providerId: r.provider_id, error: r.error, createdAt: r.created_at,
    sentAt: r.sent_at, batchKey: r.batch_key, attemptedAt: r.attempted_at,
  };
}

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

// Row shapes as D1 returns them (snake_case, integers for booleans).
interface WeddingRow {
  id: string; slug: string; name1: string; name2: string; timezone: string; quiet_start: number; quiet_end: number;
  sms_paused: number; sms_sender: string | null; admin_mobile: string | null; sms_daily_cap: number; sms_rate_cents_x100: number;
  wallet_credits: number | null; sms_optout_footer: string; sms_replies: string; invites_from: string | null; first_event: string | null;
  plan: string;
  content: string;
}
interface EventRow { id: string; key: string; name: string; pending_label: string; sort: number }
interface InvitationRow { id: string; token: string; phone: string | null; seats_held: number; sms_optout: number; stopped: number }
interface RsvpRow { invitation_id: string; key: string; attending: number | null; count: number; answers: string; updated_at: string }
interface CampaignRow {
  id: string; wedding_id: string; key: string; name: string; body: string; mode: Campaign['mode']; enabled: number;
  trigger: Campaign['trigger']; audience: string; excluded: string;
}
interface SlotRow { id: string; campaign_id: string; send_at: string; status: Slot['status']; attempts: number; last_error: string | null }
interface OutRow {
  id: string; wedding_id: string; invitation_id: string | null; campaign_id: string | null; dedupe_key: string; kind: OutboxKind;
  to_phone: string; body: string; parts: number; status: OutboxRow['status']; provider_id: string | null; error: string | null;
  created_at: string; sent_at: string | null; batch_key: string | null; attempted_at: string | null;
}
interface InRow {
  id: string; wedding_id: string | null; invitation_id: string | null; provider_id: string; type: string; from_phone: string;
  to_phone: string | null; body: string; action: string; received_at: string;
}

/** The couple's chosen date, else 8 months before the first event. */
function invitesFrom(custom: string | null, firstEvent: string | null) {
  return { invitesFrom: custom ?? (firstEvent ? defaultInvitesFrom(firstEvent) : null), invitesFromCustom: !!custom };
}

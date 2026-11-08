import { inQuietHours } from '@wp/shared';
import type { Env } from '../env';
import { emailReady, plainHtml, sendEmail } from '../lib/email';
import { ensureAddress, mailLeft, senderOf, stripQuoted, takeMail } from '../lib/weddingMail';
import { matches } from '../sms/audience';
import { LIMITS, thanksKey, type EngineDeps } from '../sms/engine';
import { classify, DEFAULT_REPLIES } from '../sms/inbound';
import { renderFor } from '../sms/render';
import { answerFrom, dietsIn, whoseDiet } from '../sms/smart';
import type { Campaign, EventInfo, Recipient, WeddingCtx } from '../sms/types';

/**
 * Everything the texts do, by email too, from the wedding's own address (free): invitations and
 * save-the-dates, the reminders to people who haven't replied, the night-before guide and "Send now".
 * The texts' own messages, dates and rules are used (no second schedule): the same campaigns, the same
 * slots (send times), the same audiences, the same "invitation when added" and thank-you after a reply.
 * - Who gets email: guests with an email whose channel is email or both (no mobile and no choice: email).
 * - Nothing is sent twice: one row per wedding and key in email_out, like sms_out's dedupe keys.
 * - The free allowance is shared, so each email counts against the wedding's day (lib/weddingMail.ts);
 *   the rest wait in the queue and go the next morning, never dropped.
 * - Campaign emails keep the texts' quiet hours; answers to a guest go straight away.
 * - A guest's email reply ("yes", "can't make it", a dietary need, a question the wedding answers) is
 *   handled the way a text is (sms/inbound.ts); anything else stays in the inbox for the couple.
 */

export type Channel = '' | 'text' | 'email' | 'both';

/** This guest gets emails: an email address, and email (or both) chosen, or no mobile to text. */
export const emailable = (r: Recipient, c?: Pick<Campaign, 'excluded'>): boolean =>
  !!r.email && (r.channel === 'email' || r.channel === 'both' || (!r.channel && !r.phone)) && !(c?.excluded.includes(r.id) ?? false);

/** Who a campaign emails right now (its audience, evaluated at send time like the texts). */
export const emailRecipientsFor = (c: Campaign, all: Recipient[], invitedBefore: Set<string>) => all.filter((r) => emailable(r, c) && matches(c.audience, r, invitedBefore));

/** Invitations that have had their invitation, by text or by email (for "only those already invited"). */
export async function invitedEither(d: EngineDeps, db: D1Database, weddingId: string) {
  const ids = await d.store.invitedIds(weddingId);
  const { results } = await db
    .prepare(
      `SELECT DISTINCT e.invitation_id FROM email_out e JOIN campaign c ON c.id = e.campaign_id
        WHERE e.wedding_id = ? AND c.trigger = 'invitation_created' AND e.status = 'sent' AND e.invitation_id IS NOT NULL`,
    )
    .bind(weddingId)
    .all<{ invitation_id: string }>();
  for (const r of results) ids.add(r.invitation_id);
  return ids;
}

const firstName = (s: string) => s.trim().split(/\s+/)[0] ?? s;
const couple = (w: WeddingCtx) => `${firstName(w.name1)} & ${firstName(w.name2)}`;

type Row = { invitationId: string | null; campaignId: string | null; dedupeKey: string; kind: 'campaign' | 'reply'; to: string; subject: string; body: string; status?: 'failed'; error?: string };

/** One email per guest, worded exactly as the text (without the text-only STOP line). */
function campaignRows(w: WeddingCtx, events: EventInfo[], c: Campaign, list: Recipient[], key: (r: Recipient) => string): Row[] {
  return list.map((r) => {
    const m = renderFor(c.body, w, events, r);
    return {
      invitationId: r.id,
      campaignId: c.id,
      dedupeKey: key(r),
      kind: 'campaign' as const,
      to: r.email!,
      subject: `${couple(w)}: ${c.name}`,
      body: m.body,
      ...(m.unfilled.length ? { status: 'failed' as const, error: `Unfilled: {${m.unfilled.join('}, {')}}` } : {}),
    };
  });
}

/** Adds to the queue; a key already there is skipped. Returns how many were new. */
async function enqueue(db: D1Database, weddingId: string, rows: Row[]) {
  if (!rows.length) return 0;
  const now = new Date().toISOString();
  let added = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const res = await db.batch(
      rows.slice(i, i + 50).map((r) =>
        db
          .prepare(
            `INSERT INTO email_out (id, wedding_id, invitation_id, campaign_id, dedupe_key, kind, to_addr, subject, body, status, error, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          )
          .bind(crypto.randomUUID(), weddingId, r.invitationId, r.campaignId, r.dedupeKey, r.kind, r.to, r.subject.slice(0, 300), r.body.slice(0, 20000), r.status ?? 'queued', r.error ?? null, now),
      ),
    );
    added += res.reduce((n, x) => n + (x.meta.changes ?? 0), 0);
  }
  return added;
}

export interface EmailFlush {
  sent: number;
  failed: number;
  /** Still waiting (quiet hours, or today's emails used up: they go tomorrow morning). */
  waiting: number;
  capped: boolean;
}

/**
 * Sends what's queued for one wedding, oldest first, until today's allowance runs out (the rest stay
 * queued for tomorrow). In quiet hours only answers to guests go. Held reminders are checked again first:
 * a guest who has replied since isn't reminded.
 */
export async function flushEmail(env: Env, d: EngineDeps, w: WeddingCtx, address: string): Promise<EmailFlush> {
  const db = env.DB;
  const out: EmailFlush = { sent: 0, failed: 0, waiting: 0, capped: false };
  if (!emailReady(env) || !address) return out;
  const quiet = inQuietHours(d.now(), w.timezone, w.quietStart, w.quietEnd);
  const { results: rows } = await db
    .prepare(`SELECT id, invitation_id, campaign_id, dedupe_key, kind, to_addr, subject, body FROM email_out WHERE wedding_id = ? AND status = 'queued' ORDER BY kind = 'reply' DESC, created_at LIMIT 200`)
    .bind(w.id)
    .all<{ id: string; invitation_id: string | null; campaign_id: string | null; dedupe_key: string; kind: string; to_addr: string; subject: string; body: string }>();
  if (!rows.length) return out;

  // Reminders held over: only if the guest still qualifies (and still wants email).
  const held = rows.filter((r) => r.dedupe_key.startsWith('slot:'));
  const gone = new Set<string>();
  if (held.length) {
    const campaigns = new Map((await d.store.campaigns(w.id)).map((c) => [c.id, c]));
    const { recipients } = await d.store.audience(w.id);
    const byId = new Map(recipients.map((r) => [r.id, r]));
    const invited = await invitedEither(d, db, w.id);
    for (const row of held) {
      const c = row.campaign_id ? campaigns.get(row.campaign_id) : undefined;
      const r = row.invitation_id ? byId.get(row.invitation_id) : undefined;
      if (!c || !c.enabled || !r || !emailable(r, c) || !matches(c.audience, r, invited)) gone.add(row.id);
    }
    for (const id of gone) await db.prepare(`UPDATE email_out SET status = 'cancelled', error = 'No longer in the audience' WHERE id = ? AND status = 'queued'`).bind(id).run();
  }

  const me = await senderOf(env, w.id, address);
  for (const row of rows) {
    if (gone.has(row.id)) continue;
    if ((quiet && row.kind !== 'reply') || out.capped) {
      out.waiting++;
      continue;
    }
    // Claimed first, so two runs at once never send the same email.
    const claim = await db.prepare(`UPDATE email_out SET status = 'sending' WHERE id = ? AND status = 'queued'`).bind(row.id).run();
    if (!claim.meta.changes) continue;
    if (!(await takeMail(db, w.id))) {
      await db.prepare(`UPDATE email_out SET status = 'queued' WHERE id = ?`).bind(row.id).run();
      out.capped = true;
      out.waiting++;
      continue;
    }
    const ok = await sendEmail(env, { to: row.to_addr, from: me.from, replyTo: me.replyTo, subject: row.subject, text: row.body, html: plainHtml(row.body) });
    await db
      .prepare(`UPDATE email_out SET status = ?, sent_at = ?, error = ? WHERE id = ?`)
      .bind(ok ? 'sent' : 'failed', ok ? new Date().toISOString() : null, ok ? null : 'The email service didn’t take it', row.id)
      .run();
    if (ok) out.sent++;
    else out.failed++;
  }
  return out;
}

/** The wedding, its address, and everyone it could email (null when email can't go: not set up, no address). */
async function load(env: Env, d: EngineDeps, weddingId: string, w0?: WeddingCtx) {
  if (!emailReady(env)) return null;
  const w = w0 ?? (await d.store.wedding(weddingId));
  if (!w) return null;
  const address = await ensureAddress(env, w.id);
  if (!address) return null;
  return { w, address };
}

/**
 * Cron (every 15 minutes, beside the texts' autopilot): the emails due now, by the texts' own rules.
 * - Dated messages (reminders, last call, the night-before guide): slots due within the last day.
 * - Invitations as guests are added (from the invitations' date), and the thank-you after a reply.
 */
export async function runEmailCampaigns(env: Env, d: EngineDeps) {
  const report = { weddings: 0, queued: 0, sent: 0, waiting: 0 };
  if (!emailReady(env)) return report;
  for (const w of await d.store.weddings()) {
    try {
      // Only weddings with someone to email (no address is made for a wedding that has none).
      const any = await env.DB.prepare(`SELECT 1 FROM invitation WHERE wedding_id = ? AND deleted_at IS NULL AND email IS NOT NULL AND email != '' LIMIT 1`).bind(w.id).first();
      if (!any) continue;
      const ctx = await load(env, d, w.id, w);
      if (!ctx) continue;
      report.weddings++;
      report.queued += await queueDue(env, d, w);
      const f = await flushEmail(env, d, w, ctx.address);
      report.sent += f.sent;
      report.waiting += f.waiting;
    } catch (e) {
      console.error('email campaigns', w.id, e);
    }
  }
  return report;
}

async function queueDue(env: Env, d: EngineDeps, w: WeddingCtx) {
  const now = d.now();
  if (inQuietHours(now, w.timezone, w.quietStart, w.quietEnd)) return 0; // built in the morning, like the texts
  const db = env.DB;
  const campaigns = (await d.store.campaigns(w.id)).filter((c) => c.enabled);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const { events, recipients } = await d.store.audience(w.id);
  const invited = await invitedEither(d, db, w.id);
  let queued = 0;

  // 1. The same send times as the texts (campaign_slot), due within the last day.
  const { results: slots } = await db
    .prepare(
      `SELECT s.id, s.campaign_id FROM campaign_slot s JOIN campaign c ON c.id = s.campaign_id
        WHERE c.wedding_id = ? AND c.enabled = 1 AND c.mode = 'dates' AND c.deleted_at IS NULL AND s.status != 'cancelled'
          AND s.send_at <= ? AND s.send_at > ? ORDER BY s.send_at`,
    )
    .bind(w.id, now.toISOString(), new Date(now.getTime() - LIMITS.slotGraceMs).toISOString())
    .all<{ id: string; campaign_id: string }>();
  for (const s of slots) {
    const c = byId.get(s.campaign_id);
    if (!c) continue;
    // Built once per slot (who it goes to is decided when it falls due, as for the texts).
    if (await db.prepare(`SELECT 1 FROM email_out WHERE wedding_id = ? AND dedupe_key LIKE ? LIMIT 1`).bind(w.id, `slot:${s.id}:%`).first()) continue;
    queued += await enqueue(db, w.id, campaignRows(w, events, c, emailRecipientsFor(c, recipients, invited), (r) => `slot:${s.id}:${r.id}`));
  }

  // 2. Automatic: the invitation when a guest is added (from the invitations' date), the thank-you after a reply.
  const t = now.getTime();
  for (const c of campaigns.filter((x) => x.mode === 'auto')) {
    if (c.trigger === 'invitation_created') {
      if (w.invitesFrom && now.toISOString() < w.invitesFrom) continue;
      // Not to guests already emailed their invitation from Messages → Email ("Email everyone").
      const { results: had } = await db
        .prepare(`SELECT invitation_id FROM inbox_email WHERE wedding_id = ? AND direction = 'out' AND message_id LIKE 'invitation:%' AND invitation_id IS NOT NULL`)
        .bind(w.id)
        .all<{ invitation_id: string }>();
      const already = new Set(had.map((x) => x.invitation_id));
      const owed = emailRecipientsFor(c, recipients, invited).filter((r) => !already.has(r.id));
      queued += await enqueue(db, w.id, campaignRows(w, events, c, owed, (r) => `auto:${c.id}:${r.id}`));
    } else if (c.trigger === 'rsvp_changed') {
      const declineReply = campaigns.some((x) => x.mode === 'auto' && x.trigger === 'rsvp_changed' && x.audience.declinedAll);
      const replied = recipients.filter((r) => {
        if (!r.rsvpUpdatedAt || !emailable(r, c) || !matches(c.audience, r, invited)) return false;
        if (declineReply && !c.audience.declinedAll && matches({ declinedAll: true }, r, invited)) return false;
        const age = t - Date.parse(r.rsvpUpdatedAt);
        return age >= LIMITS.thanksDebounceMs && age <= LIMITS.thanksWindowMs;
      });
      queued += await enqueue(db, w.id, campaignRows(w, events, c, replied, thanksKey));
    }
  }
  return queued;
}

/**
 * "Send now" by email, beside the texts: the message to everyone in its audience who gets email (or the
 * chosen guests). Quiet hours and today's allowance hold the rest for the morning.
 */
export async function sendNowEmail(env: Env, d: EngineDeps, weddingId: string, campaignId: string, only?: string[]) {
  const none = { queued: 0, sent: 0, failed: 0, waiting: 0, capped: false, on: false };
  const ctx = await load(env, d, weddingId);
  if (!ctx) return none;
  const c = (await d.store.campaigns(weddingId)).find((x) => x.id === campaignId);
  if (!c) return none;
  const { events, recipients } = await d.store.audience(weddingId);
  const list = only ? recipients.filter((r) => only.includes(r.id) && emailable(r)) : emailRecipientsFor(c, recipients, await invitedEither(d, env.DB, weddingId));
  const run = `${campaignId}:${Math.floor(d.now().getTime() / 120_000)}`;
  const queued = await enqueue(env.DB, weddingId, campaignRows(ctx.w, events, c, list, (r) => `manual:${run}:${r.id}`));
  const f = await flushEmail(env, d, ctx.w, ctx.address);
  return { queued, ...f, on: true };
}

/** For the Texts screen: per message, how many would go by email now, and what has gone or is waiting. */
export async function emailSummary(env: Env, d: EngineDeps, weddingId: string, campaigns: Campaign[], recipients: Recipient[]) {
  const invited = await invitedEither(d, env.DB, weddingId);
  const { results } = await env.DB.prepare(
    `SELECT campaign_id, SUM(status = 'sent') AS sent, SUM(status = 'queued') AS waiting, SUM(status = 'failed') AS failed FROM email_out WHERE wedding_id = ? AND campaign_id IS NOT NULL GROUP BY campaign_id`,
  )
    .bind(weddingId)
    .all<{ campaign_id: string; sent: number; waiting: number; failed: number }>();
  const done = new Map(results.map((r) => [r.campaign_id, r]));
  return new Map(
    campaigns.map((c) => [
      c.id,
      { count: emailRecipientsFor(c, recipients, invited).length, sent: done.get(c.id)?.sent ?? 0, waiting: done.get(c.id)?.waiting ?? 0, failed: done.get(c.id)?.failed ?? 0 },
    ]),
  );
}

export type EmailAction = 'RSVP set to yes' | 'RSVP set to no' | 'Sent link' | 'Dietary noted' | 'Answered' | 'Needs you';

/**
 * A guest's email to the wedding's address, from the email on their invitation: handled like a text
 * (sms/inbound.ts). A clear yes or no (one event) is their RSVP; a dietary need is noted on them; a question
 * the wedding already answers is answered; each with a short email back. Anything else: 'Needs you'.
 */
export async function answerGuestEmail(env: Env, d: EngineDeps, weddingId: string, invitationId: string, mail: { from: string; subject: string; text: string; inboxId: string }): Promise<EmailAction> {
  const { from, text, inboxId } = mail;
  const w = await d.store.wedding(weddingId);
  if (!w) return 'Needs you';
  const { events, recipients } = await d.store.audience(weddingId);
  const r = recipients.find((x) => x.id === invitationId);
  if (!r) return 'Needs you';
  const said = stripQuoted(text).trim().slice(0, 1000);
  const answer = classify(said.split(/\n\s*\n/)[0] ?? said);
  const yes = answer === 'yes';
  const no = answer === 'no';
  const at = d.now().toISOString();
  const replies = { yes: w.replies?.yes || DEFAULT_REPLIES.yes, no: w.replies?.no || DEFAULT_REPLIES.no, multi: w.replies?.multi || DEFAULT_REPLIES.multi };
  let action: EmailAction = 'Needs you';
  let body = '';
  let key = `reply:${inboxId}`;

  if ((yes || no) && r.invited.length === 1) {
    const eventKey = r.invited[0]!;
    const count = yes ? Math.max(1, r.seatsHeld) : (r.rsvp[eventKey]?.count ?? 1);
    await d.store.setRsvp(r.id, eventKey, { attending: yes, count }, at);
    const updated = { ...r, rsvpUpdatedAt: at, rsvp: { ...r.rsvp, [eventKey]: { attending: yes, count, answers: r.rsvp[eventKey]?.answers ?? {} } } };
    const label = events.find((e) => e.key === eventKey)?.pendingLabel ?? 'the celebration';
    body = renderFor((yes ? replies.yes : replies.no).replaceAll('{event}', label), w, events, updated).body;
    key = thanksKey(updated); // the thank-you autopilot's key, so it isn't sent as well
    action = yes ? 'RSVP set to yes' : 'RSVP set to no';
  } else if (yes || no) {
    body = renderFor(replies.multi, w, events, r).body;
    action = 'Sent link';
  }
  const diets = dietsIn(said);
  const whose = diets.length ? whoseDiet(said, r.people) : null;
  if (diets.length && whose) {
    await d.store.addDiet(r.id, whose, diets, at);
    const noted = `We've noted ${diets.join(', ').toLowerCase()} for ${whose.length === r.people.length && whose.length > 1 ? 'everyone' : whose.map((p) => p.split(' ')[0]).join(' and ')}.`;
    if (body) body = `${body} ${noted}`;
    else {
      body = renderFor(`Thanks {first}! ${noted} You can change it until {rsvp_by}: {link}`, w, events, r).body;
      action = 'Dietary noted';
    }
  } else if (!body && !diets.length) {
    const facts = (await d.store.eventFacts(w.id)).filter((f) => r.invited.includes(f.eventKey));
    const found = answerFrom(said, facts, w.timezone);
    if (found) {
      body = renderFor(`Hi {first}! ${found.replaceAll('{', '(').replaceAll('}', ')')} Everything's on your page: {link}`, w, events, r).body;
      action = 'Answered';
    }
  }
  if (body) {
    await enqueue(env.DB, weddingId, [{ invitationId: r.id, campaignId: null, dedupeKey: key, kind: 'reply', to: from, subject: /^re:/i.test(mail.subject) ? mail.subject : `Re: ${mail.subject || couple(w)}`, body }]);
    const address = await ensureAddress(env, weddingId);
    await flushEmail(env, d, w, address);
  }
  return action;
}

/** How many emails the wedding can still send today (for the Texts screen). */
export const emailsLeftToday = (env: Env, weddingId: string) => mailLeft(env.DB, weddingId);

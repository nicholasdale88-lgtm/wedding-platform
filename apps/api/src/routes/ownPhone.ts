import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { checkOwnNumber, ownNumberReady, readOwnNumber, removeOwnNumber, requestOwnNumber } from '../lib/ownNumber';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * "Send from my own phone" (free): /api/a/w/:wid/own-phone.
 * The couple's way of sending (Settings → Texting): their own phone, by email, or a texting service number
 * (paid). Messages for guests on their own phone are never sent by the server: each is kept ready
 * (mail/campaigns.ts, email_out kind 'phone') and sent by the couple from their Messages app, one guest at a
 * time (never a group message), then marked sent here, so counts, reminders and "who hasn't had it" stay right.
 */

type C = Context<AdminEnv>;
const wid = (c: C) => c.req.param('wid')!;
const err = (c: C, status: 400 | 404, code: string, message: string) => c.json({ error: { code, message } }, status);

export const SEND_VIA = ['phone', 'email', 'service'] as const;
export type SendVia = (typeof SEND_VIA)[number];

/** The wedding's way of sending: their choice, else the texting service when a number is set up, else their own phone. */
export async function sendViaOf(db: D1Database, weddingId: string): Promise<{ via: SendVia; chosen: boolean }> {
  const w = await db.prepare(`SELECT json_extract(content, '$.sendVia') AS via, sms_sender FROM wedding WHERE id = ?`).bind(weddingId).first<{ via: string | null; sms_sender: string | null }>();
  const chosen = SEND_VIA.find((v) => v === w?.via);
  return chosen ? { via: chosen, chosen: true } : { via: w?.sms_sender ? 'service' : 'phone', chosen: false };
}

export function ownPhoneRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');

  /** The way of sending, and every message ready to send from the couple's own phone (oldest first). */
  app.get('/', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT o.id, o.invitation_id, o.campaign_id, o.to_addr, o.subject, o.body, o.created_at,
              (SELECT group_concat(p.name, ' & ') FROM person p WHERE p.invitation_id = o.invitation_id AND p.deleted_at IS NULL) AS name
         FROM email_out o WHERE o.wedding_id = ? AND o.kind = 'phone' AND o.status = 'ready' ORDER BY o.created_at, o.id LIMIT 500`,
    )
      .bind(wid(c))
      .all<{ id: string; invitation_id: string | null; campaign_id: string | null; to_addr: string; subject: string; body: string; created_at: string; name: string | null }>();
    const sent = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM email_out WHERE wedding_id = ? AND kind = 'phone' AND status = 'sent'`).bind(wid(c)).first<{ n: number }>();
    const by = new Map<string, number>();
    for (const r of results) by.set(r.subject, (by.get(r.subject) ?? 0) + 1);
    return c.json({
      ...(await sendViaOf(c.env.DB, wid(c))),
      ready: results.map((r) => ({ id: r.id, invitationId: r.invitation_id, campaignId: r.campaign_id, name: r.name ?? 'A guest', phone: r.to_addr, message: r.subject, body: r.body, at: r.created_at })),
      /** e.g. [{ message: 'Reminder', count: 12 }] for "12 reminders ready to send from your phone". */
      batches: [...by.entries()].map(([message, count]) => ({ message, count })),
      sent: Number(sent?.n ?? 0),
      // "Send from my own number (automatic)": available when the site's texting service is connected.
      ownNumber: { available: ownNumberReady(c.env), ...((await checkOwnNumber(c.env, wid(c)).catch(() => readOwnNumber(c.env.DB, wid(c)))) ?? {}) },
    });
  });

  /** "Send from my own number": text their mobile a confirmation link (they tap Confirm on that phone). */
  app.post('/own-number', writer, async (c) => {
    const b = z.object({ mobile: z.string().max(40) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Enter your mobile.');
    const w = await c.env.DB.prepare(`SELECT slug FROM wedding WHERE id = ?`).bind(wid(c)).first<{ slug: string }>();
    const r = await requestOwnNumber(c.env, wid(c), b.data.mobile, w?.slug ?? 'wedding');
    return r.ok ? c.json(r.own) : err(c, 400, 'own_number', r.message);
  });

  /** "I've tapped Confirm": confirmed yet? (Or the link expired: send a new one.) */
  app.post('/own-number/check', writer, async (c) => c.json((await checkOwnNumber(c.env, wid(c))) ?? { status: 'none' }));

  /** Stop sending from your own number: back to texting from your own phone, by hand (free). */
  app.delete('/own-number', writer, async (c) => {
    await removeOwnNumber(c.env, wid(c));
    return c.json({ ok: true });
  });

  /** Settings → Texting: their own phone (free), by email (free), or a texting service number (paid). */
  app.put('/send-via', writer, async (c) => {
    const b = z.object({ sendVia: z.enum(SEND_VIA) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Choose how your messages are sent.');
    await c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.sendVia', ?) WHERE id = ? AND json_valid(content)`).bind(b.data.sendVia, wid(c)).run();
    return c.json({ via: b.data.sendVia, chosen: true });
  });

  /** "Sent, next": the couple sent it from their phone (or skipped it: not sent, gone from the list). */
  app.post('/:id/:what{sent|skip}', writer, async (c) => {
    const status = c.req.param('what') === 'sent' ? 'sent' : 'skipped';
    const r = await c.env.DB.prepare(`UPDATE email_out SET status = ?, sent_at = ? WHERE id = ? AND wedding_id = ? AND kind = 'phone' AND status = 'ready'`)
      .bind(status, status === 'sent' ? new Date().toISOString() : null, c.req.param('id'), wid(c))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'That message has already been done.');
    return c.json({ ok: true, status });
  });

  return app;
}

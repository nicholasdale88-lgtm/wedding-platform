import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { readJson } from '../lib/security';
import { sendReply } from '../sms/engine';
import type { EngineDeps } from '../sms/engine';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Account → Messages (/api/a/w/:wid/messages): every conversation with guests, Messenger-style, one per
 * invitation. A conversation gathers what guests wrote on their pages (support, questions), the note
 * they left with their RSVP, and texts they sent that weren't a simple yes or no; plus the couple's
 * replies, which the guest sees on their page and can also get as a text.
 *   GET            -> conversations, newest first, with unread counts
 *   GET  /:inv     -> one conversation (opening it marks it read)
 *   POST /:inv     -> reply { body, sms }
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid') ?? '';

export interface ThreadMessage {
  id: string;
  from: 'guest' | 'couple';
  body: string;
  at: string;
  /** Where it came from: their page, their RSVP, a text, or the couple's reply. */
  via: 'page' | 'rsvp' | 'sms' | 'reply';
  kind: 'message' | 'support' | 'question';
  sentSms: boolean;
}

async function threadOf(db: D1Database, weddingId: string, invId: string): Promise<ThreadMessage[]> {
  const [msgs, rsvps, texts] = await db.batch([
    db.prepare(`SELECT id, from_guest, kind, body, sent_sms, created_at FROM message WHERE wedding_id = ? AND invitation_id = ? ORDER BY created_at`).bind(weddingId, invId),
    db.prepare(`SELECT event_id, message, updated_at FROM rsvp WHERE invitation_id = ? AND message <> ''`).bind(invId),
    db.prepare(`SELECT id, body, received_at FROM sms_in WHERE wedding_id = ? AND invitation_id = ? AND type = 'inbound' ORDER BY received_at`).bind(weddingId, invId),
  ]);
  const out: ThreadMessage[] = [
    ...(msgs!.results as { id: string; from_guest: number; kind: ThreadMessage['kind']; body: string; sent_sms: number; created_at: string }[]).map((m) => ({
      id: m.id, from: m.from_guest ? ('guest' as const) : ('couple' as const), body: m.body, at: m.created_at, via: m.from_guest ? ('page' as const) : ('reply' as const), kind: m.kind, sentSms: !!m.sent_sms,
    })),
    ...(rsvps!.results as { event_id: string; message: string; updated_at: string }[]).map((r) => ({
      id: `rsvp:${r.event_id}`, from: 'guest' as const, body: r.message, at: r.updated_at, via: 'rsvp' as const, kind: 'message' as const, sentSms: false,
    })),
    ...(texts!.results as { id: string; body: string; received_at: string }[]).map((t) => ({
      id: `sms:${t.id}`, from: 'guest' as const, body: t.body, at: t.received_at, via: 'sms' as const, kind: 'message' as const, sentSms: false,
    })),
  ];
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function messageRoutes(deps: (env: Env) => EngineDeps) {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');

  app.get('/', async (c) => {
    const db = c.env.DB;
    const w = wid(c);
    const [msgs, rsvps, texts, names] = await db.batch([
      db.prepare(`SELECT invitation_id, from_guest, kind, body, created_at, read_at FROM message WHERE wedding_id = ?`).bind(w),
      db.prepare(`SELECT r.invitation_id, r.message AS body, r.updated_at AS created_at FROM rsvp r JOIN invitation i ON i.id = r.invitation_id WHERE i.wedding_id = ? AND r.message <> ''`).bind(w),
      db.prepare(`SELECT invitation_id, body, received_at AS created_at, action, handled FROM sms_in WHERE wedding_id = ? AND invitation_id IS NOT NULL AND type = 'inbound'`).bind(w),
      db.prepare(
        `SELECT i.id, i.phone, (SELECT GROUP_CONCAT(name, ' & ') FROM (SELECT name FROM person WHERE invitation_id = i.id AND deleted_at IS NULL ORDER BY idx)) AS names
           FROM invitation i WHERE i.wedding_id = ? AND i.deleted_at IS NULL`,
      ).bind(w),
    ]);
    type T = { invitationId: string; name: string; canText: boolean; last: { body: string; at: string; from: 'guest' | 'couple' }; unread: number; kinds: string[] };
    const who = new Map((names!.results as { id: string; phone: string | null; names: string | null }[]).map((r) => [r.id, r]));
    const threads = new Map<string, T>();
    const touch = (inv: string, body: string, at: string, from: 'guest' | 'couple', unread: boolean, kind?: string) => {
      const p = who.get(inv);
      if (!p) return; // a removed guest
      const t = threads.get(inv) ?? { invitationId: inv, name: p.names || 'A guest', canText: !!p.phone, last: { body, at, from }, unread: 0, kinds: [] };
      if (at >= t.last.at) t.last = { body, at, from };
      if (unread) t.unread++;
      if (kind && kind !== 'message' && !t.kinds.includes(kind)) t.kinds.push(kind);
      threads.set(inv, t);
    };
    for (const m of msgs!.results as { invitation_id: string; from_guest: number; kind: string; body: string; created_at: string; read_at: string | null }[]) {
      touch(m.invitation_id, m.body, m.created_at, m.from_guest ? 'guest' : 'couple', !!m.from_guest && !m.read_at, m.kind);
    }
    for (const r of rsvps!.results as { invitation_id: string; body: string; created_at: string }[]) touch(r.invitation_id, r.body, r.created_at, 'guest', false);
    for (const t of texts!.results as { invitation_id: string; body: string; created_at: string; action: string; handled: number }[]) {
      touch(t.invitation_id, t.body, t.created_at, 'guest', t.action === 'Needs you' && !t.handled);
    }
    return c.json({ threads: [...threads.values()].sort((a, b) => b.last.at.localeCompare(a.last.at)) });
  });

  app.get('/:inv', async (c) => {
    const db = c.env.DB;
    const inv = await db
      .prepare(
        `SELECT i.id, i.phone, (SELECT GROUP_CONCAT(name, ' & ') FROM (SELECT name FROM person WHERE invitation_id = i.id AND deleted_at IS NULL ORDER BY idx)) AS names,
                EXISTS (SELECT 1 FROM opt_out o WHERE o.phone = i.phone) AS opted_out
           FROM invitation i WHERE i.id = ? AND i.wedding_id = ? AND i.deleted_at IS NULL`,
      )
      .bind(c.req.param('inv'), wid(c))
      .first<{ id: string; phone: string | null; names: string | null; opted_out: number }>();
    if (!inv) return err(c, 404, 'not_found', 'That guest no longer exists.');
    const now = new Date().toISOString();
    // Opening the conversation is reading it.
    await db.batch([
      db.prepare(`UPDATE message SET read_at = ? WHERE invitation_id = ? AND from_guest = 1 AND read_at IS NULL`).bind(now, inv.id),
      db.prepare(`UPDATE sms_in SET handled = 1 WHERE invitation_id = ? AND action = 'Needs you' AND handled = 0`).bind(inv.id),
    ]);
    const w = await db.prepare(`SELECT sms_sender FROM wedding WHERE id = ?`).bind(wid(c)).first<{ sms_sender: string | null }>();
    return c.json({
      invitationId: inv.id,
      name: inv.names || 'A guest',
      // Replies can also go as a text when the guest has a mobile, hasn't opted out, and texting is set up.
      canText: !!inv.phone && !inv.opted_out && !!w?.sms_sender,
      messages: await threadOf(db, wid(c), inv.id),
    });
  });

  app.post('/:inv', writer, async (c) => {
    const body = z.object({ body: z.string().trim().min(1).max(1000), sms: z.boolean().default(false) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Write your reply first (up to 1,000 characters).');
    const db = c.env.DB;
    const inv = await db
      .prepare(`SELECT id, phone, EXISTS (SELECT 1 FROM opt_out o WHERE o.phone = invitation.phone) AS opted_out FROM invitation WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`)
      .bind(c.req.param('inv'), wid(c))
      .first<{ id: string; phone: string | null; opted_out: number }>();
    if (!inv) return err(c, 404, 'not_found', 'That guest no longer exists.');
    const id = crypto.randomUUID();
    let sentSms = false;
    if (body.data.sms && inv.phone && !inv.opted_out) {
      try {
        await sendReply(deps(c.env), wid(c), inv.id, inv.phone, body.data.body, `msg:${id}`);
        sentSms = true; // sent, or queued for the morning in quiet hours
      } catch {
        /* the reply is still saved and shown on their page */
      }
    }
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO message (id, wedding_id, invitation_id, from_guest, kind, body, sent_sms, created_at) VALUES (?, ?, ?, 0, 'message', ?, ?, ?)`).bind(id, wid(c), inv.id, body.data.body, sentSms ? 1 : 0, now),
      db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'message.reply', ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), c.get('user').id, inv.id, JSON.stringify({ sms: sentSms }), now),
    ]);
    return c.json({ ok: true, sentSms, messages: await threadOf(db, wid(c), inv.id) });
  });

  return app;
}

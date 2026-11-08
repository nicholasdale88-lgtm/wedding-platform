import { Quote, type Vendor } from '@wp/shared';
import { Hono, type Context } from 'hono';
import PostalMime from 'postal-mime';
import { z } from 'zod';
import type { Env } from '../env';
import { buttonEmail, emailReady, plainHtml, sendEmail } from '../lib/email';
import { MAX_PLANNER_FILE, readJson, safeJson } from '../lib/security';
import {
  addressFree, CAP_MESSAGE, copyRecipients, ensureAddress, inboxDomain, mailLeft, MAIL_PER_DAY, readInbox, readReplyAddress, replyAddress, saveInbox, sendCopies, senderOf, stripQuoted, takeMail,
} from '../lib/weddingMail';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { keepDocument } from '../photos/store';
import { changeDoc, readDoc } from './planner';

/**
 * The event's own email address. Cloudflare Email Routing hands each email to the Worker (`receiveEmail`);
 * it's kept, sorted (a guest by their email or name, a vendor by their email or web address, or other), and
 * a vendor's quote that comes as a PDF or photo is filed under that vendor with the file attached.
 * Admin: /api/a/w/:wid/inbox (list, read, re-sort, file a quote, the address).
 * Sending (lib/weddingMail.ts): write or reply from the wedding's address, email everyone their invitation,
 * and copies to the couple's own inbox whose replies come back here and go out from the wedding's address.
 */

const FREE_MAIL = /@(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|bigpond|optusnet|aol|proton|protonmail)\./i;
const QUOTEY = /quote|quotation|proposal|invoice|estimate|pricing|package|price list/i;
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const domainOf = (s: string) => (/@([^>\s]+)$/.exec(s.trim().toLowerCase())?.[1] ?? /^(?:https?:\/\/)?(?:www\.)?([^/\s]+)/i.exec(s.trim().toLowerCase())?.[1] ?? '').replace(/^www\./, '');

/** Who wrote it: a vendor (their email, or their own web domain), a guest (by email or name), or neither. */
export async function sortEmail(db: D1Database, weddingId: string, from: string, name: string, subject: string) {
  const vendors = (await readDoc(db, weddingId, 'vendors', '')).data.list;
  const addr = from.trim().toLowerCase();
  const dom = domainOf(addr);
  const vendor =
    vendors.find((v) => v.email.trim().toLowerCase() === addr) ??
    (dom && !FREE_MAIL.test(addr) ? vendors.find((v) => (v.email && domainOf(v.email) === dom) || (v.website && domainOf(v.website) === dom)) : undefined);
  if (vendor) return { kind: 'vendor' as const, vendor };
  // A guest whose email is on their invitation.
  const byEmail = addr
    ? await db.prepare(`SELECT id FROM invitation WHERE wedding_id = ? AND deleted_at IS NULL AND lower(email) = ? LIMIT 1`).bind(weddingId, addr).first<{ id: string }>()
    : null;
  if (byEmail) return { kind: 'guest' as const, invitationId: byEmail.id };
  const n = norm(name);
  if (n) {
    const guest = await db
      .prepare(`SELECT p.invitation_id FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND lower(p.name) = ? LIMIT 1`)
      .bind(weddingId, n)
      .first<{ invitation_id: string }>();
    if (guest) return { kind: 'guest' as const, invitationId: guest.invitation_id };
  }
  return { kind: QUOTEY.test(subject) ? ('vendor' as const) : ('other' as const) };
}

/** Files an emailed quote under a vendor (a new quote with the file attached; the numbers are yours to fill in). */
async function fileQuote(db: D1Database, weddingId: string, vendorId: string, file: { id: string; name: string }, subject: string, receivedAt: string) {
  return changeDoc(db, weddingId, 'vendors', '', (d) => {
    const v = d.list.find((x: Vendor) => x.id === vendorId);
    if (!v || v.quotes.some((q) => q.fileId === file.id) || v.quotes.length >= 12) return;
    v.quotes.push(Quote.parse({ id: crypto.randomUUID().slice(0, 12), date: receivedAt.slice(0, 10), fileId: file.id, fileName: file.name, notes: `From email: ${subject}`.slice(0, 1500) }));
    if (v.status !== 'booked' && v.status !== 'declined') v.status = 'quoted';
  });
}

type Mail = Awaited<ReturnType<typeof PostalMime.parse>>;
/** The words of an email: its plain text, or its HTML with the tags taken out. */
const textOf = (mail: Mail) =>
  (mail.text ?? (mail.html ?? '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' '))
    .trim()
    .slice(0, 20000);

type Kind = 'guest' | 'vendor' | 'other';
/** What became of an email that arrived: kept (its id, and how many copies went out), or a reply sent on. */
type Received = { stored: boolean; id?: string; copies?: number; relayed?: boolean };

/** Something sent from the wedding's address: kept in Sent (one row for the whole send). */
type Outgoing = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  kind?: Kind;
  invitationId?: string | null;
  vendorId?: string | null;
  /** The email this answers (its id here, and its Message-ID so it threads in their mail app). */
  inReplyTo?: { id: string; messageId: string | null } | null;
  /** Marks it so the same thing is never sent twice (an invitation, or a reply that arrived twice). */
  messageId?: string | null;
};

/**
 * Sends from the wedding's address, one email per person (nobody sees anyone else's address), each counted
 * against the day's allowance; what went is kept in Sent. Stops when the day's emails are used up.
 */
async function sendOut(env: Env, weddingId: string, address: string, o: Outgoing) {
  const me = await senderOf(env, weddingId, address);
  const headers = o.inReplyTo?.messageId ? { 'In-Reply-To': o.inReplyTo.messageId, References: o.inReplyTo.messageId } : undefined;
  const sent: string[] = [];
  const failed: string[] = [];
  let capped = false;
  for (const to of o.to) {
    if (capped || !(await takeMail(env.DB, weddingId))) {
      capped = true;
      failed.push(to);
      continue;
    }
    const ok = await sendEmail(env, { to, from: me.from, replyTo: me.replyTo, subject: o.subject, text: o.text, html: o.html ?? plainHtml(o.text), headers });
    (ok ? sent : failed).push(to);
  }
  if (sent.length) {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO inbox_email (id, wedding_id, message_id, from_addr, from_name, subject, body, kind, invitation_id, vendor_id, received_at, read_at, direction, to_addr, in_reply_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'out', ?, ?) ON CONFLICT DO NOTHING`,
    )
      .bind(crypto.randomUUID(), weddingId, o.messageId ?? null, address, me.name, o.subject.slice(0, 300), o.text.slice(0, 20000), o.kind ?? 'other', o.invitationId ?? null, o.vendorId ?? null, now, now, sent.join(', ').slice(0, 2000), o.inReplyTo?.id ?? null)
      .run();
  }
  return { sent: sent.length, failed, capped };
}

/**
 * A member's Reply to a copy (sent to reply+<email id>.<signature>@<INBOX_DOMAIN>): checked (the signature,
 * and that it's from someone who can send for that wedding), the quoted old message taken off, and sent on
 * from the wedding's address to whoever wrote in. Anything that fails a check is quietly dropped.
 */
async function relayReply(message: { from: string; raw: ReadableStream; headers: Headers }, env: Env, emailId: string): Promise<Received> {
  const db = env.DB;
  const orig = await db
    .prepare(
      `SELECT e.id, e.wedding_id, e.from_addr, e.subject, e.message_id, e.kind, e.invitation_id, e.vendor_id FROM inbox_email e JOIN wedding w ON w.id = e.wedding_id
        WHERE e.id = ? AND e.direction = 'in' AND w.deleted_at IS NULL`,
    )
    .bind(emailId)
    .first<{ id: string; wedding_id: string; from_addr: string; subject: string; message_id: string | null; kind: Kind; invitation_id: string | null; vendor_id: string | null }>();
  if (!orig) return { stored: false };
  const mail = await PostalMime.parse(message.raw);
  const sender = (mail.from?.address ?? message.from).trim().toLowerCase();
  const member = await db
    .prepare(`SELECT 1 FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = ? AND lower(u.email) = ? AND m.role IN ('owner', 'editor')`)
    .bind(orig.wedding_id, sender)
    .first();
  if (!member) return { stored: false };
  const messageId = (mail.messageId ?? message.headers.get('message-id') ?? '').slice(0, 290) || null;
  const mark = messageId ? `reply:${messageId}` : null;
  if (mark && (await db.prepare(`SELECT 1 FROM inbox_email WHERE wedding_id = ? AND message_id = ?`).bind(orig.wedding_id, mark).first())) return { stored: false };
  const text = stripQuoted(textOf(mail));
  const address = await ensureAddress(env, orig.wedding_id);
  if (!text || !address || !emailReady(env)) return { stored: false };
  const subject = (mail.subject ?? '').trim().slice(0, 300) || (/^re:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`);
  const r = await sendOut(env, orig.wedding_id, address, {
    to: [orig.from_addr],
    subject,
    text,
    kind: orig.kind,
    invitationId: orig.invitation_id,
    vendorId: orig.vendor_id,
    inReplyTo: { id: orig.id, messageId: orig.message_id },
    messageId: mark,
  });
  if (r.sent) await db.prepare(`UPDATE inbox_email SET read_at = COALESCE(read_at, ?) WHERE id = ?`).bind(new Date().toISOString(), orig.id).run();
  return { stored: r.sent > 0, relayed: r.sent > 0 };
}

/** An email arriving at the event's address. Unknown addresses are dropped (never bounced, never answered). */
export async function receiveEmail(message: { from: string; to: string; raw: ReadableStream; headers: Headers }, env: Env): Promise<Received> {
  const db = env.DB;
  const to = message.to.trim().toLowerCase();
  // A reply from the couple's own mail app to a copy: sent on from the wedding's address.
  const domain = inboxDomain(env);
  if (domain && to.startsWith('reply+') && to.endsWith(`@${domain}`)) {
    const emailId = await readReplyAddress(env, to);
    return emailId ? relayReply(message, env, emailId) : { stored: false };
  }
  const w = await db.prepare(`SELECT id FROM wedding WHERE lower(json_extract(content, '$.inbox.address')) = ? AND deleted_at IS NULL`).bind(to).first<{ id: string }>();
  if (!w) return { stored: false };
  const mail = await PostalMime.parse(message.raw);
  const fromAddr = (mail.from?.address ?? message.from).toLowerCase().slice(0, 200);
  const fromName = (mail.from?.name ?? '').slice(0, 120);
  const subject = (mail.subject ?? '').slice(0, 300);
  const body = textOf(mail);
  const messageId = (mail.messageId ?? message.headers.get('message-id') ?? '').slice(0, 300) || null;
  // Email Routing can deliver the same email again: nothing is stored (or uploaded) twice.
  if (messageId && (await db.prepare(`SELECT 1 FROM inbox_email WHERE wedding_id = ? AND message_id = ?`).bind(w.id, messageId).first())) return { stored: false };
  const now = new Date().toISOString();
  const sorted = await sortEmail(db, w.id, fromAddr, fromName, subject);

  // Attachments worth keeping: PDFs and photos up to 1.5 MB (quotes, menus, contracts).
  const files: { id: string; name: string; type: string }[] = [];
  for (const a of (mail.attachments ?? []).slice(0, 6)) {
    const type = (a.mimeType ?? '').toLowerCase();
    const bytes = typeof a.content === 'string' ? new TextEncoder().encode(a.content) : new Uint8Array(a.content);
    if (!FILE_TYPES.includes(type) || !bytes.byteLength || bytes.byteLength > MAX_PLANNER_FILE) continue;
    const id = crypto.randomUUID();
    const name = (a.filename ?? 'attachment').slice(0, 160);
    const remote = await keepDocument(env, w.id, { bytes, name, type }); // the couple's Drive, Dropbox or OneDrive when chosen
    await db
      .prepare(`INSERT INTO planner_file (id, wedding_id, name, type, bytes, data, created_at, remote) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, w.id, name, type, bytes.byteLength, remote ? new Uint8Array(0) : bytes, now, remote)
      .run();
    files.push({ id, name, type });
  }
  const id = crypto.randomUUID();
  const res = await db
    .prepare(
      `INSERT INTO inbox_email (id, wedding_id, message_id, from_addr, from_name, subject, body, kind, invitation_id, vendor_id, files, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(id, w.id, messageId, fromAddr, fromName, subject, body, sorted.kind, 'invitationId' in sorted ? sorted.invitationId : null, 'vendor' in sorted && sorted.vendor ? sorted.vendor.id : null, JSON.stringify(files), now)
    .run();
  if (!res.meta.changes) return { stored: false }; // the same email twice
  // A known vendor's quote: filed straight away under them.
  const quote = files.find((f) => QUOTEY.test(subject) || QUOTEY.test(f.name));
  if ('vendor' in sorted && sorted.vendor && quote && (await fileQuote(db, w.id, sorted.vendor.id, quote, subject, now))) {
    await db.prepare(`UPDATE inbox_email SET filed = ? WHERE id = ?`).bind(sorted.vendor.id, id).run();
  }
  // A copy to the couple's own inbox (Outlook, Apple Mail…), never for mail from the wedding's own address.
  const copies = fromAddr === to ? 0 : await sendCopies(env, w.id, { id, fromAddr, fromName, subject, body, files: files.length }).catch(() => 0);
  return { stored: true, id, copies };
}

type C = Context<AdminEnv>;
const wid = (c: C) => c.req.param('wid')!;
const err = (c: C, status: 400 | 404 | 429, code: string, message: string) => c.json({ error: { code, message } }, status);
const EMAIL_OFF = 'Sending email isn’t switched on for the site yet.';
const NO_ADDRESS = 'Set up your wedding’s email address first.';
const Addr = z.string().trim().toLowerCase().email().max(200);

/** Each guest's own invitation link, with their email: who's ready for "Email everyone", and who has no email. */
async function invitationList(c: C) {
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.token, i.email, (SELECT p.name FROM person p WHERE p.invitation_id = i.id AND p.idx = 0 AND p.deleted_at IS NULL) AS name,
            EXISTS (SELECT 1 FROM inbox_email e WHERE e.wedding_id = i.wedding_id AND e.message_id = 'invitation:' || i.id || ':' || lower(trim(i.email))) AS done
       FROM invitation i WHERE i.wedding_id = ? AND i.deleted_at IS NULL ORDER BY name`,
  )
    .bind(wid(c))
    .all<{ id: string; token: string; email: string | null; name: string | null; done: number }>();
  const withEmail = results.filter((r) => r.email && r.email.trim());
  return {
    ready: withEmail.filter((r) => !r.done),
    already: withEmail.filter((r) => r.done).length,
    without: results.filter((r) => !(r.email && r.email.trim())).map((r) => r.name || 'A guest'),
  };
}

export function inboxRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');

  // The address (made now from the wedding's web address when INBOX_DOMAIN is set and they haven't chosen one).
  const address = (c: C) => ensureAddress(c.env, wid(c));

  /** The inbox (or ?sent=1: what was sent from the address; ?archived=1: archived). */
  app.get('/', async (c) => {
    const db = c.env.DB;
    const archived = c.req.query('archived') === '1';
    const sent = c.req.query('sent') === '1';
    const { results } = await db
      .prepare(
        `SELECT e.id, e.from_addr, e.from_name, e.subject, substr(e.body, 1, 180) AS preview, e.kind, e.invitation_id, e.vendor_id, e.files, e.filed, e.received_at, e.read_at, e.direction, e.to_addr,
                (SELECT p.name FROM person p WHERE p.invitation_id = e.invitation_id AND p.idx = 0) AS guest
           FROM inbox_email e WHERE e.wedding_id = ? AND e.direction = ? AND (e.archived_at IS NOT NULL) = ? ORDER BY e.received_at DESC LIMIT 300`,
      )
      .bind(wid(c), sent ? 'out' : 'in', archived && !sent ? 1 : 0)
      .all<{ id: string; from_addr: string; from_name: string; subject: string; preview: string; kind: string; invitation_id: string | null; vendor_id: string | null; files: string; filed: string; received_at: string; read_at: string | null; direction: string; to_addr: string; guest: string | null }>();
    const vendors = new Map((await readDoc(db, wid(c), 'vendors', '')).data.list.map((v) => [v.id, v.name]));
    return c.json({
      address: await address(c),
      emails: results.map((r) => ({
        id: r.id,
        from: r.from_addr,
        fromName: r.from_name,
        subject: r.subject,
        preview: r.preview,
        kind: r.kind,
        invitationId: r.invitation_id,
        guest: r.guest,
        vendorId: r.vendor_id,
        vendor: r.vendor_id ? (vendors.get(r.vendor_id) ?? null) : null,
        files: safeJson<{ id: string; name: string; type: string }[]>(r.files, []),
        filed: r.filed ? (vendors.get(r.filed) ?? 'a vendor') : '',
        receivedAt: r.received_at,
        read: !!r.read_at,
        sent: r.direction === 'out',
        to: r.to_addr,
      })),
    });
  });

  /**
   * The address, whether sending is on, how many emails are left today, and who gets copies in their own
   * inbox (the main account unless chosen).
   */
  app.get('/settings', async (c) => {
    const db = c.env.DB;
    const addr = await address(c);
    const inbox = await readInbox(db, wid(c));
    const chosen = new Set((await copyRecipients(db, wid(c), inbox)).map((p) => p.id));
    const { results } = await db
      .prepare(`SELECT u.id, u.email, u.name, m.role FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = ? ORDER BY u.created_at`)
      .bind(wid(c))
      .all<{ id: string; email: string; name: string | null; role: string }>();
    return c.json({
      address: addr,
      domain: inboxDomain(c.env),
      canSend: emailReady(c.env) && !!addr,
      // Viewers can read, not send.
      canWrite: c.get('role') !== 'viewer',
      replyByEmail: emailReady(c.env) && !!(await replyAddress(c.env, crypto.randomUUID())),
      left: await mailLeft(db, wid(c)),
      perDay: MAIL_PER_DAY,
      copies: results.map((r) => ({ id: r.id, email: r.email, name: r.name ?? '', role: r.role, on: chosen.has(r.id) })),
    });
  });

  /** Who gets a copy of each email in their own inbox (Outlook, Apple Mail, Gmail…). */
  app.put('/settings/copies', writer, async (c) => {
    const b = z.object({ userIds: z.array(z.string().max(60)).max(30) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'That didn’t save.');
    const { results } = await c.env.DB.prepare(`SELECT user_id FROM membership WHERE wedding_id = ?`).bind(wid(c)).all<{ user_id: string }>();
    const members = new Set(results.map((r) => r.user_id));
    const userIds = [...new Set(b.data.userIds)].filter((u) => members.has(u));
    await saveInbox(c.env.DB, wid(c), { copies: userIds });
    return c.json({ ok: true, userIds });
  });

  /** "Email everyone their invitation": who has an email and hasn't had it yet, and who has no email. */
  app.get('/invitations', async (c) => {
    const list = await invitationList(c);
    return c.json({ ready: list.ready.length, already: list.already, without: list.without, left: await mailLeft(c.env.DB, wid(c)), canSend: emailReady(c.env) && !!(await address(c)) });
  });

  /**
   * Emails each guest who has an email (and hasn't had it) their own invitation link, from the wedding's
   * address, up to today's allowance: the rest go when this is pressed again tomorrow.
   */
  app.post('/invitations', writer, async (c) => {
    if (!emailReady(c.env)) return err(c, 400, 'email_off', EMAIL_OFF);
    const addr = await address(c);
    if (!addr) return err(c, 400, 'no_address', NO_ADDRESS);
    const w = await c.env.DB.prepare(`SELECT slug, name1, name2 FROM wedding WHERE id = ?`).bind(wid(c)).first<{ slug: string; name1: string; name2: string }>();
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    const list = await invitationList(c);
    if (!list.ready.length) return c.json({ sent: 0, failed: 0, left: 0, without: list.without, already: list.already });
    // The same personal link the texts use.
    const base = (c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '');
    const couple = [w.name1, w.name2].filter(Boolean).join(' & ') || 'We';
    let sent = 0;
    let failed = 0;
    let capped = false;
    for (const g of list.ready) {
      const email = g.email!.trim().toLowerCase();
      const first = (g.name ?? '').trim().split(/\s+/)[0] ?? '';
      const m = buttonEmail({
        heading: first ? `You’re invited, ${first}!` : 'You’re invited!',
        lines: [`${couple} would love you to celebrate with them.`, 'Your invitation has all the details, and you can reply (RSVP) right there. The link is just for you.'],
        button: 'Open your invitation',
        link: `${base}/w/${w.slug}/?g=${g.token}`,
        footer: `Questions? Just reply to this email to reach ${couple}.`,
      });
      const r = await sendOut(c.env, wid(c), addr, { to: [email], subject: `${couple}: you’re invited`, text: m.text, html: m.html, kind: 'guest', invitationId: g.id, messageId: `invitation:${g.id}:${email}` });
      sent += r.sent;
      if (r.capped) {
        capped = true;
        break;
      }
      if (!r.sent) failed++;
    }
    const left = list.ready.length - sent - failed;
    return c.json({
      sent,
      failed,
      left,
      without: list.without,
      already: list.already,
      ...(capped ? { message: `Sent ${sent}. ${CAP_MESSAGE} Press “Email everyone” again tomorrow to send the other ${left}.` } : {}),
    });
  });

  /**
   * Write an email (to any addresses, guests or vendors) or reply to one, from the wedding's address.
   * Answers come back into the inbox.
   */
  app.post('/send', writer, async (c) => {
    const b = z
      .object({
        to: z.array(Addr).max(20).default([]),
        guests: z.array(z.string().max(60)).max(20).default([]),
        vendors: z.array(z.string().max(60)).max(20).default([]),
        subject: z.string().trim().max(300).default(''),
        body: z.string().trim().min(1, 'Write your message.').max(20000),
        replyTo: z.string().max(60).optional(),
      })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.path[0] === 'to' ? 'One of those email addresses doesn’t look right.' : (b.error.issues[0]?.message ?? 'Check the email and try again.'));
    if (!emailReady(c.env)) return err(c, 400, 'email_off', EMAIL_OFF);
    const addr = await address(c);
    if (!addr) return err(c, 400, 'no_address', NO_ADDRESS);
    const db = c.env.DB;
    const d = b.data;
    const orig = d.replyTo
      ? await db
          .prepare(`SELECT id, from_addr, subject, message_id, kind, invitation_id, vendor_id FROM inbox_email WHERE id = ? AND wedding_id = ? AND direction = 'in'`)
          .bind(d.replyTo, wid(c))
          .first<{ id: string; from_addr: string; subject: string; message_id: string | null; kind: Kind; invitation_id: string | null; vendor_id: string | null }>()
      : null;
    if (d.replyTo && !orig) return err(c, 404, 'not_found', 'That email is gone.');

    // Who it's to: typed addresses, chosen guests (their invitation's email) and vendors (their email).
    const to = new Set(d.to);
    const skipped: string[] = [];
    const guestIds: string[] = [];
    const vendorIds: string[] = [];
    if (d.guests.length) {
      const { results } = await db
        .prepare(
          `SELECT i.id, i.email, (SELECT p.name FROM person p WHERE p.invitation_id = i.id AND p.idx = 0) AS name FROM invitation i
            WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND i.id IN (${d.guests.map(() => '?').join(', ')})`,
        )
        .bind(wid(c), ...d.guests)
        .all<{ id: string; email: string | null; name: string | null }>();
      for (const g of results) {
        guestIds.push(g.id);
        if (g.email?.trim()) to.add(g.email.trim().toLowerCase());
        else skipped.push(g.name ?? 'A guest');
      }
    }
    if (d.vendors.length) {
      for (const v of (await readDoc(db, wid(c), 'vendors', '')).data.list.filter((x) => d.vendors.includes(x.id))) {
        vendorIds.push(v.id);
        if (Addr.safeParse(v.email).success) to.add(v.email.trim().toLowerCase());
        else skipped.push(v.name);
      }
    }
    if (orig && !to.size && !d.guests.length && !d.vendors.length) to.add(orig.from_addr);
    to.delete(addr);
    if (!to.size) return err(c, 400, 'no_one', skipped.length ? `${skipped.join(', ')} ${skipped.length === 1 ? 'has' : 'have'} no email address yet.` : 'Add who it’s to.');
    if (to.size > 20) return err(c, 400, 'too_many', 'Up to 20 people at a time. For every guest, use “Email everyone their invitation”.');
    const left = await mailLeft(db, wid(c));
    if (to.size > left) return err(c, 429, 'daily_cap', left ? `You can send ${left} more email${left === 1 ? '' : 's'} today. Send to fewer people, or the rest tomorrow.` : CAP_MESSAGE);

    const subject = d.subject || (orig ? (/^re:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`) : '(no subject)');
    // Sorted like the inbox: what it answers, who was chosen, or by the first address.
    let kind: Kind = 'other';
    let invitationId: string | null = null;
    let vendorId: string | null = null;
    if (orig) {
      kind = orig.kind;
      invitationId = orig.invitation_id;
      vendorId = orig.vendor_id;
    } else if (guestIds.length) {
      kind = 'guest';
      invitationId = guestIds.length === 1 ? guestIds[0]! : null;
    } else if (vendorIds.length) {
      kind = 'vendor';
      vendorId = vendorIds.length === 1 ? vendorIds[0]! : null;
    } else {
      const s = await sortEmail(db, wid(c), [...to][0]!, '', subject);
      kind = s.kind;
      invitationId = ('invitationId' in s ? s.invitationId : null) ?? null; // the inferred union has invitationId?: undefined
      vendorId = 'vendor' in s && s.vendor ? s.vendor.id : null;
    }
    const r = await sendOut(c.env, wid(c), addr, { to: [...to], subject, text: d.body, kind, invitationId, vendorId, inReplyTo: orig ? { id: orig.id, messageId: orig.message_id } : null });
    if (!r.sent) return err(c, 400, 'not_sent', r.capped ? CAP_MESSAGE : 'That didn’t send. Please try again in a minute.');
    if (orig) await db.prepare(`UPDATE inbox_email SET read_at = COALESCE(read_at, ?) WHERE id = ?`).bind(new Date().toISOString(), orig.id).run();
    return c.json({ sent: r.sent, failed: r.failed, skipped, left: await mailLeft(db, wid(c)) });
  });

  app.get('/:id', async (c) => {
    const row = await c.env.DB.prepare(`SELECT body FROM inbox_email WHERE id = ? AND wedding_id = ?`).bind(c.req.param('id'), wid(c)).first<{ body: string }>();
    if (!row) return err(c, 404, 'not_found', 'That email is gone.');
    await c.env.DB.prepare(`UPDATE inbox_email SET read_at = COALESCE(read_at, ?) WHERE id = ?`).bind(new Date().toISOString(), c.req.param('id')).run();
    return c.json({ body: row.body });
  });

  /** Re-sort it (guest, vendor, other; which vendor), archive it, or mark it unread. */
  app.put('/:id', writer, async (c) => {
    const b = z
      .object({ kind: z.enum(['guest', 'vendor', 'other']).optional(), vendorId: z.string().max(40).nullable().optional(), archived: z.boolean().optional(), read: z.boolean().optional() })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'That didn’t save.');
    const now = new Date().toISOString();
    const changes: [string, string | null][] = [];
    if (b.data.kind) changes.push(['kind', b.data.kind]);
    if (b.data.vendorId !== undefined) changes.push(['vendor_id', b.data.vendorId]);
    if (b.data.archived !== undefined) changes.push(['archived_at', b.data.archived ? now : null]);
    if (b.data.read !== undefined) changes.push(['read_at', b.data.read ? now : null]);
    const sets = changes.map(([col]) => `${col} = ?`);
    const vals = changes.map(([, v]) => v);
    if (!sets.length) return c.json({ ok: true });
    const r = await c.env.DB.prepare(`UPDATE inbox_email SET ${sets.join(', ')} WHERE id = ? AND wedding_id = ?`).bind(...vals, c.req.param('id'), wid(c)).run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'That email is gone.');
    return c.json({ ok: true });
  });

  /** File one of its attachments as a quote under a vendor. */
  app.post('/:id/file', writer, async (c) => {
    const b = z.object({ vendorId: z.string().max(40), fileId: z.string().max(40) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Choose a vendor.');
    const row = await c.env.DB.prepare(`SELECT subject, files, received_at FROM inbox_email WHERE id = ? AND wedding_id = ?`).bind(c.req.param('id'), wid(c)).first<{ subject: string; files: string; received_at: string }>();
    const file = row ? safeJson<{ id: string; name: string }[]>(row.files, []).find((f) => f.id === b.data.fileId) : undefined;
    if (!row || !file) return err(c, 404, 'not_found', 'That attachment is gone.');
    if (!(await fileQuote(c.env.DB, wid(c), b.data.vendorId, file, row.subject, row.received_at))) return err(c, 400, 'invalid', 'That didn’t file. Try again.');
    await c.env.DB.prepare(`UPDATE inbox_email SET filed = ?, kind = 'vendor', vendor_id = ? WHERE id = ?`).bind(b.data.vendorId, b.data.vendorId, c.req.param('id')).run();
    return c.json({ ok: true });
  });

  /** The event's address: their own instead of the one made for them, or '' for none (it stays off). */
  app.put('/settings/address', writer, async (c) => {
    const b = z.object({ address: z.union([z.literal(''), Addr]) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'That doesn’t look like an email address.');
    // An address belongs to one wedding (its emails must never land in someone else's).
    if (b.data.address && !(await addressFree(c.env.DB, b.data.address, wid(c)))) return err(c, 400, 'taken', 'That address is already used by another wedding.');
    // The reply+ addresses are the app's own.
    const domain = inboxDomain(c.env);
    if (domain && b.data.address.startsWith('reply+') && b.data.address.endsWith(`@${domain}`)) return err(c, 400, 'taken', 'Choose a different address.');
    await saveInbox(c.env.DB, wid(c), { address: b.data.address });
    return c.json({ address: b.data.address });
  });
  return app;
}

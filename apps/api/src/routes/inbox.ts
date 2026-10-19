import { Quote, type Vendor } from '@wp/shared';
import { Hono, type Context } from 'hono';
import PostalMime from 'postal-mime';
import { z } from 'zod';
import type { Env } from '../env';
import { MAX_PLANNER_FILE, readJson, safeJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { keepDocument } from '../photos/store';
import { changeDoc, readDoc } from './planner';

/**
 * The event's own email address. Cloudflare Email Routing hands each email to the Worker (`receiveEmail`);
 * it's kept, sorted (a guest by name, a vendor by their email or web address, or other), and a vendor's
 * quote that comes as a PDF or photo is filed under that vendor with the file attached.
 * Admin: /api/a/w/:wid/inbox (list, read, re-sort, file a quote, the address).
 */

const FREE_MAIL = /@(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|bigpond|optusnet|aol|proton|protonmail)\./i;
const QUOTEY = /quote|quotation|proposal|invoice|estimate|pricing|package|price list/i;
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const domainOf = (s: string) => (/@([^>\s]+)$/.exec(s.trim().toLowerCase())?.[1] ?? /^(?:https?:\/\/)?(?:www\.)?([^/\s]+)/i.exec(s.trim().toLowerCase())?.[1] ?? '').replace(/^www\./, '');

/** Who wrote it: a vendor (their email, or their own web domain), a guest (by name), or neither. */
export async function sortEmail(db: D1Database, weddingId: string, from: string, name: string, subject: string) {
  const vendors = (await readDoc(db, weddingId, 'vendors', '')).data.list;
  const addr = from.trim().toLowerCase();
  const dom = domainOf(addr);
  const vendor =
    vendors.find((v) => v.email.trim().toLowerCase() === addr) ??
    (dom && !FREE_MAIL.test(addr) ? vendors.find((v) => (v.email && domainOf(v.email) === dom) || (v.website && domainOf(v.website) === dom)) : undefined);
  if (vendor) return { kind: 'vendor' as const, vendor };
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

/** An email arriving at the event's address. Unknown addresses are dropped (never bounced, never answered). */
export async function receiveEmail(message: { from: string; to: string; raw: ReadableStream; headers: Headers }, env: Env) {
  const db = env.DB;
  const to = message.to.trim().toLowerCase();
  const w = await db.prepare(`SELECT id FROM wedding WHERE lower(json_extract(content, '$.inbox.address')) = ? AND deleted_at IS NULL`).bind(to).first<{ id: string }>();
  if (!w) return { stored: false };
  const mail = await PostalMime.parse(message.raw);
  const fromAddr = (mail.from?.address ?? message.from).toLowerCase().slice(0, 200);
  const fromName = (mail.from?.name ?? '').slice(0, 120);
  const subject = (mail.subject ?? '').slice(0, 300);
  const body = (mail.text ?? (mail.html ?? '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' '))
    .trim()
    .slice(0, 20000);
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
  return { stored: true, id };
}

type C = Context<AdminEnv>;
const wid = (c: C) => c.req.param('wid')!;
const err = (c: C, status: 400 | 404, code: string, message: string) => c.json({ error: { code, message } }, status);

export function inboxRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');

  const address = async (c: C) =>
    (await c.env.DB.prepare(`SELECT json_extract(content, '$.inbox.address') AS a FROM wedding WHERE id = ?`).bind(wid(c)).first<{ a: string | null }>())?.a ?? '';

  app.get('/', async (c) => {
    const db = c.env.DB;
    const archived = c.req.query('archived') === '1';
    const { results } = await db
      .prepare(
        `SELECT e.id, e.from_addr, e.from_name, e.subject, substr(e.body, 1, 180) AS preview, e.kind, e.invitation_id, e.vendor_id, e.files, e.filed, e.received_at, e.read_at,
                (SELECT p.name FROM person p WHERE p.invitation_id = e.invitation_id AND p.idx = 0) AS guest
           FROM inbox_email e WHERE e.wedding_id = ? AND (e.archived_at IS NOT NULL) = ? ORDER BY e.received_at DESC LIMIT 300`,
      )
      .bind(wid(c), archived ? 1 : 0)
      .all<{ id: string; from_addr: string; from_name: string; subject: string; preview: string; kind: string; invitation_id: string | null; vendor_id: string | null; files: string; filed: string; received_at: string; read_at: string | null; guest: string | null }>();
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
      })),
    });
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

  /** The event's address (set up in Cloudflare Email Routing to send to this site). */
  app.put('/settings/address', writer, async (c) => {
    const b = z.object({ address: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(200)]) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'That doesn’t look like an email address.');
    // An address belongs to one wedding (its emails must never land in someone else's).
    if (b.data.address) {
      const taken = await c.env.DB.prepare(`SELECT 1 FROM wedding WHERE lower(json_extract(content, '$.inbox.address')) = ? AND id != ? AND deleted_at IS NULL`).bind(b.data.address, wid(c)).first();
      if (taken) return err(c, 400, 'taken', 'That address is already used by another wedding.');
    }
    await c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.inbox', json(?)) WHERE id = ? AND json_valid(content)`).bind(JSON.stringify({ address: b.data.address }), wid(c)).run();
    return c.json({ address: b.data.address });
  });
  return app;
}

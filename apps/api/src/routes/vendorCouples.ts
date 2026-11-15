import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { buttonEmail, emailReady, sendEmail } from '../lib/email';
import { allow } from '../lib/rateLimit';
import { PLACES, REAL_INVITATION } from '../lib/realGuests';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { ensureVendorCode } from './company';
import { readDoc } from './planner';
import { vendorHubKey } from './vendorHub';

/**
 * A listed vendor's couples, and messages between them in the app.
 *
 * Linked when the couple signs up through the vendor's link (?ref=their page) or adds the vendor to their
 * planner. The vendor sees each couple's first names, date, how many are coming and whether they're booked,
 * never a guest's name; with the couple's own vendor page link (when the couple has them in their planner),
 * the details the couple chose to share. Either side writes; the other gets an email that a message is
 * waiting (not for every message: one per half hour per conversation). The couple can end the link.
 *
 * Vendor: /api/a/vendor/couples. Couple: /api/a/w/:wid/vendor-chat.
 */
type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 403 | 404 | 429, code: string, message: string) => c.json({ error: { code, message } }, status);
const base = (env: Env) => env.PUBLIC_BASE_URL.replace(/\/+$/, '');
const Body = z.object({ body: z.string().trim().min(1, 'Write a message first.').max(4000) });
const Invite = z.object({ name: z.string().trim().max(120).default(''), email: z.string().trim().toLowerCase().email('That email looks wrong.') });

type Thread = { id: string; fromVendor: boolean; body: string; at: string; read: boolean };
const thread = async (db: D1Database, listingId: string, weddingId: string): Promise<Thread[]> =>
  (
    await db
      .prepare(`SELECT id, from_vendor, body, created_at, read_at FROM vendor_message WHERE listing_id = ? AND wedding_id = ? ORDER BY created_at LIMIT 500`)
      .bind(listingId, weddingId)
      .all<{ id: string; from_vendor: number; body: string; created_at: string; read_at: string | null }>()
  ).results.map((m) => ({ id: m.id, fromVendor: !!m.from_vendor, body: m.body, at: m.created_at, read: !!m.read_at }));

/** Writes a message; emails the other side unless this side already wrote in the last half hour. */
async function post(env: Env, listingId: string, weddingId: string, fromVendor: boolean, body: string, notify: () => Promise<void>) {
  const now = new Date();
  const recent = await env.DB.prepare(`SELECT 1 FROM vendor_message WHERE listing_id = ? AND wedding_id = ? AND from_vendor = ? AND created_at > ? LIMIT 1`)
    .bind(listingId, weddingId, fromVendor ? 1 : 0, new Date(now.getTime() - 30 * 60_000).toISOString())
    .first();
  await env.DB.prepare(`INSERT INTO vendor_message (id, listing_id, wedding_id, from_vendor, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), listingId, weddingId, fromVendor ? 1 : 0, body, now.toISOString())
    .run();
  if (!recent && emailReady(env)) await notify().catch(() => undefined);
}

const firstNames = (a: string, b: string) => [a, b].map((n) => n.trim().split(' ')[0]).filter(Boolean).join(' & ');

/** The vendor's side (signed in with their listing's account). */
export function vendorCoupleRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser);
  const listingOf = (c: C) => c.env.DB.prepare(`SELECT id, slug, name FROM vendor_listing WHERE user_id = ?`).bind(c.get('user').id).first<{ id: string; slug: string; name: string }>();
  /** The couple, if linked to this vendor and not ended. */
  const linked = (c: C, listingId: string, weddingId: string) =>
    c.env.DB.prepare(`SELECT w.id, w.slug, w.name1, w.name2 FROM vendor_couple vc JOIN wedding w ON w.id = vc.wedding_id AND w.deleted_at IS NULL WHERE vc.listing_id = ? AND vc.wedding_id = ? AND vc.status = 'active'`)
      .bind(listingId, weddingId)
      .first<{ id: string; slug: string; name1: string; name2: string }>();

  app.get('/', async (c) => {
    const l = await listingOf(c);
    if (!l) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    const db = c.env.DB;
    const { results } = await db
      .prepare(
        `SELECT w.id, w.slug, w.name1, w.name2, w.plan, vc.source, vc.created_at,
                (SELECT e.starts_at FROM event e WHERE e.wedding_id = w.id AND e.deleted_at IS NULL ORDER BY e.sort LIMIT 1) AS starts_at,
                (SELECT e.venue FROM event e WHERE e.wedding_id = w.id AND e.deleted_at IS NULL ORDER BY e.sort LIMIT 1) AS venue,
                (SELECT COALESCE(SUM(CASE WHEN r.attending = 1 THEN MAX(1, COALESCE(r.count, 1)) ELSE 0 END), 0)
                   FROM invitation i JOIN invite_event ie ON ie.invitation_id = i.id
                    AND ie.event_id = (SELECT e.id FROM event e WHERE e.wedding_id = w.id AND e.deleted_at IS NULL ORDER BY e.sort LIMIT 1)
                   LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ie.event_id
                  WHERE i.wedding_id = w.id AND i.deleted_at IS NULL AND ${REAL_INVITATION}) AS coming,
                (SELECT COALESCE(SUM(${PLACES}), 0)
                   FROM invitation i JOIN invite_event ie ON ie.invitation_id = i.id
                    AND ie.event_id = (SELECT e.id FROM event e WHERE e.wedding_id = w.id AND e.deleted_at IS NULL ORDER BY e.sort LIMIT 1)
                  WHERE i.wedding_id = w.id AND i.deleted_at IS NULL AND ${REAL_INVITATION}) AS invited,
                (SELECT u.booked FROM vendor_use u WHERE u.wedding_id = w.id AND u.dir_id = 'v:' || vc.listing_id) AS booked,
                (SELECT COUNT(*) FROM vendor_message m WHERE m.listing_id = vc.listing_id AND m.wedding_id = w.id AND m.from_vendor = 0 AND m.read_at IS NULL) AS unread,
                (SELECT m.body FROM vendor_message m WHERE m.listing_id = vc.listing_id AND m.wedding_id = w.id ORDER BY m.created_at DESC LIMIT 1) AS last,
                (SELECT m.created_at FROM vendor_message m WHERE m.listing_id = vc.listing_id AND m.wedding_id = w.id ORDER BY m.created_at DESC LIMIT 1) AS last_at
           FROM vendor_couple vc JOIN wedding w ON w.id = vc.wedding_id AND w.deleted_at IS NULL
          WHERE vc.listing_id = ? AND vc.status = 'active'
          ORDER BY starts_at LIMIT 500`,
      )
      .bind(l.id)
      .all<{ id: string; slug: string; name1: string; name2: string; plan: string; source: string; created_at: string; starts_at: string | null; venue: string | null; coming: number; invited: number; booked: number | null; unread: number; last: string | null; last_at: string | null }>();
    // Their own vendor page for each couple who has them in their planner: the details the couple shares.
    const secret = c.env.SESSION_SECRET;
    const couples = await Promise.all(
      results.map(async (w) => {
        let details = '';
        if (secret && w.booked !== null) {
          const v = (await readDoc(db, w.id, 'vendors', '')).data.list.find((x) => x.dirId === `v:${l.id}`);
          if (v) details = `${base(c.env)}/w/${w.slug}/vendor?v=${encodeURIComponent(v.id)}&k=${await vendorHubKey(secret, w.id, v.id)}`;
        }
        return {
          id: w.id,
          couple: firstNames(w.name1, w.name2),
          date: w.starts_at ?? '',
          venue: w.venue ?? '',
          coming: w.coming,
          invited: w.invited,
          status: w.booked === 1 ? 'booked' : w.booked === 0 ? 'considering' : 'linked',
          via: w.source === 'link' ? 'Signed up through your link' : 'Added you to their planner',
          since: w.created_at,
          unread: w.unread,
          last: w.last ? { body: w.last.slice(0, 140), at: w.last_at ?? '' } : null,
          details,
        };
      }),
    );
    return c.json({ couples, unread: couples.reduce((n, x) => n + x.unread, 0) });
  });

  app.get('/:wid/messages', async (c) => {
    const l = await listingOf(c);
    if (!l) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    const w = await linked(c, l.id, c.req.param('wid'));
    if (!w) return err(c, 404, 'not_found', 'That couple isn’t linked to you.');
    await c.env.DB.prepare(`UPDATE vendor_message SET read_at = ? WHERE listing_id = ? AND wedding_id = ? AND from_vendor = 0 AND read_at IS NULL`).bind(new Date().toISOString(), l.id, w.id).run();
    return c.json({ couple: firstNames(w.name1, w.name2), messages: await thread(c.env.DB, l.id, w.id) });
  });

  app.post('/:wid/messages', async (c) => {
    const l = await listingOf(c);
    if (!l) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    const w = await linked(c, l.id, c.req.param('wid'));
    if (!w) return err(c, 404, 'not_found', 'That couple isn’t linked to you.');
    const b = Body.safeParse(await readJson(c));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Write a message first.');
    if (!(await allow(c.env.DB, `vendor-msg:${l.id}`, 120, 3_600_000))) return err(c, 429, 'slow_down', 'That is a lot of messages. Try again in a little while.');
    await post(c.env, l.id, w.id, true, b.data.body, async () => {
      const { results: owners } = await c.env.DB.prepare(`SELECT u.email FROM membership m JOIN user u ON u.id = m.user_id WHERE m.wedding_id = ? AND m.role = 'owner'`).bind(w.id).all<{ email: string }>();
      const m = buttonEmail({ heading: `A message from ${l.name}`, lines: [b.data.body.slice(0, 600)], button: 'Read and reply', link: `${base(c.env)}/admin`, footer: 'Reply in your planner, under Vendors.', brand: true });
      for (const o of owners) await sendEmail(c.env, { to: o.email, subject: `${l.name} sent you a message`, ...m });
    });
    return c.json({ messages: await thread(c.env.DB, l.id, w.id) });
  });

  /** Invite a couple: an email from us, in the vendor's name, with their link (and code) to the sample. */
  app.post('/invite', async (c) => {
    const l = await listingOf(c);
    if (!l) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    const b = Invite.safeParse(await readJson(c));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Check the email.');
    if (!emailReady(c.env)) return c.json({ sent: false });
    if (!(await allow(c.env.DB, `vendor-invite:${l.id}`, 30, 86_400_000))) return err(c, 429, 'slow_down', 'That is a lot of invitations today. Try again tomorrow.');
    const code = await ensureVendorCode(c.env.DB, l.id, l.name).catch(() => '');
    const link = `${base(c.env)}/demo?play=1&ref=${encodeURIComponent(l.slug)}${code ? `&code=${encodeURIComponent(code)}` : ''}`;
    const hello = b.data.name ? `Hi ${b.data.name.split(' ')[0]},` : 'Hi,';
    const m = buttonEmail({
      heading: `${l.name} thought you'd like this`,
      lines: [hello, `${l.name} uses The Yes List with their couples: your invitations, RSVPs, seating, dietary needs and the whole plan in one place, and you can message them from it.`, ...(code ? [`Their code ${code} takes 10% off when you upgrade.`] : []), 'Have a look at a sample invitation on your phone.'],
      button: 'See a sample invitation',
      link,
      footer: `You got this because ${l.name} asked us to send it. We won't email you again unless you sign up.`,
      brand: true,
    });
    const sent = await sendEmail(c.env, { to: b.data.email, subject: `${l.name}: your wedding invitations and plan, in one place`, ...m });
    return c.json({ sent });
  });

  return app;
}

/** The couple's side: their linked vendors, the conversations, and ending a link. */
export function coupleVendorChatRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');
  const wid = (c: C) => c.req.param('wid')!;
  const vendorOf = (c: C, listingId: string) =>
    c.env.DB.prepare(`SELECT l.id, l.name, l.email, l.category FROM vendor_couple vc JOIN vendor_listing l ON l.id = vc.listing_id WHERE vc.wedding_id = ? AND vc.listing_id = ? AND vc.status = 'active'`)
      .bind(wid(c), listingId)
      .first<{ id: string; name: string; email: string; category: string }>();

  app.get('/', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT l.id, l.slug, l.name, l.category,
              (SELECT COUNT(*) FROM vendor_message m WHERE m.listing_id = l.id AND m.wedding_id = vc.wedding_id AND m.from_vendor = 1 AND m.read_at IS NULL) AS unread,
              (SELECT m.body FROM vendor_message m WHERE m.listing_id = l.id AND m.wedding_id = vc.wedding_id ORDER BY m.created_at DESC LIMIT 1) AS last
         FROM vendor_couple vc JOIN vendor_listing l ON l.id = vc.listing_id
        WHERE vc.wedding_id = ? AND vc.status = 'active' ORDER BY l.name`,
    )
      .bind(wid(c))
      .all<{ id: string; slug: string; name: string; category: string; unread: number; last: string | null }>();
    return c.json({ vendors: results.map((v) => ({ id: v.id, slug: v.slug, name: v.name, category: v.category, unread: v.unread, last: v.last ? v.last.slice(0, 140) : '' })) });
  });

  app.get('/:lid', async (c) => {
    const v = await vendorOf(c, c.req.param('lid'));
    if (!v) return err(c, 404, 'not_found', 'That vendor isn’t linked to your wedding.');
    await c.env.DB.prepare(`UPDATE vendor_message SET read_at = ? WHERE listing_id = ? AND wedding_id = ? AND from_vendor = 1 AND read_at IS NULL`).bind(new Date().toISOString(), v.id, wid(c)).run();
    return c.json({ vendor: { id: v.id, name: v.name, category: v.category }, messages: await thread(c.env.DB, v.id, wid(c)) });
  });

  app.post('/:lid', writer, async (c) => {
    const v = await vendorOf(c, c.req.param('lid'));
    if (!v) return err(c, 404, 'not_found', 'That vendor isn’t linked to your wedding.');
    const b = Body.safeParse(await readJson(c));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Write a message first.');
    if (!(await allow(c.env.DB, `couple-msg:${wid(c)}`, 120, 3_600_000))) return err(c, 429, 'slow_down', 'That is a lot of messages. Try again in a little while.');
    const w = await c.env.DB.prepare(`SELECT name1, name2 FROM wedding WHERE id = ?`).bind(wid(c)).first<{ name1: string; name2: string }>();
    const who = firstNames(w?.name1 ?? '', w?.name2 ?? '') || 'A couple';
    await post(c.env, v.id, wid(c), false, b.data.body, async () => {
      const m = buttonEmail({ heading: `A message from ${who}`, lines: [b.data.body.slice(0, 600)], button: 'Read and reply', link: `${base(c.env)}/vendors/me`, footer: 'Reply from your vendor page, under Your couples.', brand: true });
      await sendEmail(c.env, { to: v.email, subject: `${who} sent you a message`, ...m });
    });
    return c.json({ messages: await thread(c.env.DB, v.id, wid(c)) });
  });

  /** Stop: the vendor no longer sees this wedding among their couples, and the conversation closes. */
  app.delete('/:lid', writer, async (c) => {
    const r = await c.env.DB.prepare(`UPDATE vendor_couple SET status = 'ended' WHERE wedding_id = ? AND listing_id = ? AND status = 'active'`).bind(wid(c), c.req.param('lid')).run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'That vendor isn’t linked to your wedding.');
    return c.json({ ok: true });
  });

  return app;
}

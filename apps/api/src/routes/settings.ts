import { displayPhone, toE164 } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { readJson, safeJson } from '../lib/security';
import { estimateAll, type EngineDeps, type Estimate } from '../sms/engine';
import { DEFAULT_REPLIES } from '../sms/inbound';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Admin → SMS setup (/api/a/w/:wid/settings): the switches set once and left alone. Sender number,
 * your mobile, pause, quiet hours, daily limit, opt-out line, automatic replies, price per text,
 * what the whole plan costs, and a full backup of the wedding.
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 428, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;

const phone = z
  .string()
  .max(40)
  .nullable()
  .refine((v) => v === null || v.trim() === '' || !!toE164(v), 'Enter an Australian mobile, like 0412 345 678');
const hour = z.number().int().min(0).max(23);
const Put = z
  .object({
    sender: phone,
    adminMobile: phone,
    paused: z.boolean(),
    dailyCap: z.number().int().min(0).max(5000),
    quietStart: hour,
    quietEnd: hour,
    optOutFooter: z.string().max(60),
    replies: z.object({ yes: z.string().max(480), no: z.string().max(480), multi: z.string().max(480) }).partial(),
    rateX100: z.number().int().min(0).max(10_000),
  })
  .partial()
  .strict()
  .refine((b) => b.quietStart === undefined || b.quietEnd === undefined || b.quietStart < b.quietEnd, 'Sending hours must start before they end');

interface Row {
  id: string;
  version: number;
  timezone: string;
  sms_sender: string | null;
  admin_mobile: string | null;
  sms_paused: number;
  sms_daily_cap: number;
  quiet_start: number;
  quiet_end: number;
  sms_optout_footer: string;
  sms_replies: string;
  sms_rate_cents_x100: number;
}

/** Texto's dedicated number for replies, per month (cents incl. GST, approximate). */
const TEXTO_NUMBER_MONTHLY_CENTS = 1500;

export function settingsRoutes(deps: (env: Env) => EngineDeps) {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const load = (c: C) => c.env.DB.prepare(`SELECT * FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(wid(c)).first<Row>();

  async function payload(c: C, w: Row) {
    // What every message costs to send once to its current group, at this wedding's rate.
    const d = deps(c.env);
    const campaigns = (await d.store.campaigns(w.id)).filter((x) => x.enabled || x.mode === 'manual');
    const plan: { name: string; detail: string; costCents: number; auto: boolean; fixed?: boolean }[] = [];
    // One load for every message (not a full guest-list load per message).
    const estimates = await estimateAll(d, w.id, campaigns.map((x) => x.id)).catch(() => new Map<string, Estimate>());
    for (const x of campaigns) {
      const e = estimates.get(x.id);
      if (e) plan.push({ name: x.name, detail: `${e.count} ${e.count === 1 ? 'guest' : 'guests'} · ${e.parts} ${e.parts === 1 ? 'credit' : 'credits'}`, costCents: e.costCents, auto: x.enabled && x.mode !== 'manual' });
    }
    const texto = c.env.SMS_PROVIDER === 'texto';
    // Texto: guests can only text back to a dedicated number (about $15 a month), kept until the last event is over.
    if (texto) {
      const last = await c.env.DB.prepare(`SELECT MAX(starts_at) AS at FROM event WHERE wedding_id = ? AND deleted_at IS NULL`).bind(w.id).first<{ at: string | null }>();
      const months = Math.max(1, Math.ceil(((last?.at ? Date.parse(last.at) : Date.now()) - Date.now()) / (30.44 * 86_400_000)) + 1);
      plan.push({ name: 'Reply number (Texto)', detail: `About $15 a month × ${months} ${months === 1 ? 'month' : 'months'}, until after your last event`, costCents: TEXTO_NUMBER_MONTHLY_CENTS * months, auto: true, fixed: true });
    }
    const replies = { ...DEFAULT_REPLIES, ...safeJson<Record<string, string>>(w.sms_replies, {}) };
    return {
      version: w.version,
      provider: texto ? 'Texto' : 'Mobile Message',
      live: !!w.sms_sender,
      sender: w.sms_sender ? displayPhone(w.sms_sender) : '',
      adminMobile: w.admin_mobile ? displayPhone(w.admin_mobile) : '',
      paused: !!w.sms_paused,
      dailyCap: w.sms_daily_cap,
      quietStart: w.quiet_start,
      quietEnd: w.quiet_end,
      optOutFooter: w.sms_optout_footer,
      replies,
      rateX100: w.sms_rate_cents_x100,
      timezone: w.timezone,
      plan,
      planTotalCents: plan.reduce((n, p) => n + p.costCents, 0),
    };
  }

  app.get('/', async (c) => {
    const w = await load(c);
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    return c.json(await payload(c, w));
  });

  app.put('/', requireMember('owner', 'editor'), async (c) => {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return err(c, 428, 'version_required', 'Reload and try again.');
    const body = Put.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', body.error.issues[0]?.message ?? 'Please check the highlighted fields.');
    const w = await load(c);
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    const b = body.data;
    if ((b.quietStart ?? w.quiet_start) >= (b.quietEnd ?? w.quiet_end)) return err(c, 400, 'invalid', 'Sending hours must start before they end');

    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    const set = (col: string, val: string | number | null) => {
      sets.push(`${col} = ?`);
      vals.push(val);
    };
    const e164 = (s: string | null) => (s && s.trim() ? toE164(s) : null);
    if (b.sender !== undefined) set('sms_sender', e164(b.sender));
    if (b.adminMobile !== undefined) set('admin_mobile', e164(b.adminMobile));
    if (b.paused !== undefined) set('sms_paused', b.paused ? 1 : 0);
    if (b.dailyCap !== undefined) set('sms_daily_cap', b.dailyCap);
    if (b.quietStart !== undefined) set('quiet_start', b.quietStart);
    if (b.quietEnd !== undefined) set('quiet_end', b.quietEnd);
    if (b.optOutFooter !== undefined) set('sms_optout_footer', b.optOutFooter.trim());
    if (b.replies !== undefined) set('sms_replies', JSON.stringify({ ...safeJson<object>(w.sms_replies, {}), ...b.replies }));
    if (b.rateX100 !== undefined) set('sms_rate_cents_x100', b.rateX100);
    const now = new Date().toISOString();
    const r = await c.env.DB.prepare(`UPDATE wedding SET ${[...sets, 'version = version + 1', 'updated_at = ?'].join(', ')} WHERE id = ? AND version = ?`)
      .bind(...vals, now, w.id, v)
      .run();
    if (!r.meta.changes) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'settings.save', ?, ?, ?)`)
      .bind(crypto.randomUUID(), w.id, c.get('user').id, w.id, JSON.stringify(Object.keys(b)), now)
      .run();
    return c.json(await payload(c, (await load(c))!));
  });

  /** Everything about this wedding as one JSON file (owner only). Sessions and passcodes are never included. */
  app.get('/backup', requireMember('owner'), async (c) => {
    const db = c.env.DB;
    const id = wid(c);
    const q = (sql: string) => db.prepare(sql).bind(id);
    const [wedding, events, invitations, people, invites, rsvps, campaigns, slots, tables, areas, plans, smsOut, smsIn, media] = await db.batch([
      q(`SELECT * FROM wedding WHERE id = ?`),
      q(`SELECT * FROM event WHERE wedding_id = ?`),
      q(`SELECT * FROM invitation WHERE wedding_id = ?`),
      q(`SELECT p.* FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ?`),
      q(`SELECT ie.* FROM invite_event ie JOIN invitation i ON i.id = ie.invitation_id WHERE i.wedding_id = ?`),
      q(`SELECT r.* FROM rsvp r JOIN invitation i ON i.id = r.invitation_id WHERE i.wedding_id = ?`),
      q(`SELECT * FROM campaign WHERE wedding_id = ?`),
      q(`SELECT s.* FROM campaign_slot s JOIN campaign c ON c.id = s.campaign_id WHERE c.wedding_id = ?`),
      q(`SELECT * FROM seat_table WHERE wedding_id = ?`),
      q(`SELECT * FROM seat_area WHERE wedding_id = ?`),
      q(`SELECT sp.* FROM seat_plan sp JOIN event e ON e.id = sp.event_id WHERE e.wedding_id = ?`),
      q(`SELECT * FROM sms_out WHERE wedding_id = ?`),
      q(`SELECT * FROM sms_in WHERE wedding_id = ?`),
      q(`SELECT id, kind, key, content_type, bytes, uploaded_by, invitation_id, created_at, deleted_at FROM media WHERE wedding_id = ?`),
    ]);
    const w = wedding!.results[0] as { slug: string } | undefined;
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    const out = {
      format: 'wedding-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      wedding: w,
      events: events!.results,
      invitations: invitations!.results,
      people: people!.results,
      invites: invites!.results,
      rsvps: rsvps!.results,
      campaigns: campaigns!.results,
      slots: slots!.results,
      seating: { tables: tables!.results, areas: areas!.results, plans: plans!.results },
      sms: { out: smsOut!.results, in: smsIn!.results },
      media: media!.results,
    };
    await db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, 'backup.download', ?, ?)`)
      .bind(crypto.randomUUID(), id, c.get('user').id, id, out.exportedAt)
      .run();
    return new Response(JSON.stringify(out, null, 1), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${w.slug}-backup-${out.exportedAt.slice(0, 10)}.json"`,
      },
    });
  });

  return app;
}

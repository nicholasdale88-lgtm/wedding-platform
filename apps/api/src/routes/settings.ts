import { displayPhone, toE164 } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { readJson, safeJson } from '../lib/security';
import { allow } from '../lib/rateLimit';
import { backUpNow, backupLink, weddingBackup } from '../lib/backup';
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
    const out = await weddingBackup(db, id);
    if (!out) return err(c, 404, 'not_found', 'Wedding not found.');
    const w = { slug: String(out.wedding.slug ?? 'wedding') };
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

  /** Automatic backups: when the last one went, where, and any problem (owners). */
  app.get('/backups', requireMember('owner'), async (c) => {
    const r = await c.env.DB.prepare(
      `SELECT json_extract(content, '$.backupAt') AS at, json_extract(content, '$.backupWhere') AS where_, json_extract(content, '$.backupError') AS error, COALESCE(json_extract(content, '$.backupOff'), 0) AS off FROM wedding WHERE id = ? AND json_valid(content)`,
    )
      .bind(wid(c))
      .first<{ at: string | null; where_: string | null; error: string | null; off: number }>();
    const link = await backupLink(c.env, wid(c));
    return c.json({ last: r?.at ?? null, where: r?.where_ ?? null, problem: r?.error ?? null, auto: !r?.off, linked: link ? ({ gdrive: 'Google Drive', dropbox: 'Dropbox', onedrive: 'OneDrive', gphotos: 'Google Photos' } as const)[link.provider] : null });
  });

  /** Back up to the linked storage now. */
  app.post('/backups/now', requireMember('owner'), async (c) => {
    if (!(await allow(c.env.DB, `backup-now:${wid(c)}`, 12, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'That is a lot of backups at once. Try again later.' } }, 429);
    const r = await backUpNow(c.env, wid(c));
    if (!r.ok) return err(c, 400, 'not_saved', r.message ?? 'The backup did not go through.');
    return c.json(r);
  });

  /** Daily automatic backups on or off. */
  app.put('/backups/auto', requireMember('owner'), async (c) => {
    const on = ((await readJson(c.req.raw)) as { on?: unknown } | null)?.on !== false;
    await c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.backupOff', ?) WHERE id = ? AND json_valid(content)`).bind(on ? 0 : 1, wid(c)).run();
    return c.json({ ok: true, auto: on });
  });

  return app;
}

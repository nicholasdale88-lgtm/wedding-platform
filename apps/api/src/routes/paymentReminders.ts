import { allPayments, costCents, dateIn, inQuietHours, segments, type DuePayment } from '@wp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { readJson } from '../lib/security';
import { flush, type EngineDeps } from '../sms/engine';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { readDoc } from './planner';

/**
 * Payment reminders by text: a few days before a vendor payment is due, a text to the couple's own mobile
 * (the one in SMS setup) listing what's due. Off until switched on (each text uses SMS credit); never in
 * quiet hours; each payment is reminded once. Admin: /api/a/w/:wid/pay-reminders. Sent by the cron.
 */

type Setting = { on: boolean; days: number; sent: string[] };
const DEFAULT: Setting = { on: false, days: 3, sent: [] };
const settingOf = (raw: string | null): Setting => {
  try {
    const s = raw ? (JSON.parse(raw) as Partial<Setting>) : {};
    return { on: s.on === true, days: Math.max(1, Math.min(30, Number(s.days) || 3)), sent: Array.isArray(s.sent) ? s.sent.filter((x): x is string => typeof x === 'string').slice(-300) : [] };
  } catch {
    return DEFAULT;
  }
};
const read = async (db: D1Database, wid: string) =>
  db.prepare(`SELECT admin_mobile, sms_rate_cents_x100 AS rate, json_extract(content, '$.payReminders') AS s FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(wid).first<{ admin_mobile: string | null; rate: number; s: string | null }>();
const write = (db: D1Database, wid: string, s: Setting) => db.prepare(`UPDATE wedding SET content = json_set(content, '$.payReminders', json(?)) WHERE id = ? AND json_valid(content)`).bind(JSON.stringify(s), wid).run();

/** A payment's reminder key: the payment and its due date (a new date is a new reminder). */
const keyOf = (p: DuePayment) => `${p.key}@${p.due}`;
const money = (n: number) => `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Thu 4 Mar" (spelt out here, so every runtime writes it the same way). */
const day = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  return `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
};

/** The text: what's due (soonest first), at most five lines. */
export function reminderText(due: DuePayment[], today: string, link: string) {
  const line = (p: DuePayment) => `• ${p.who}${p.label === 'Payment' ? '' : ` ${p.label.toLowerCase()}`} ${money(p.amount)}, ${p.due < today ? `overdue (${day(p.due)})` : p.due === today ? 'today' : day(p.due)}`;
  const shown = due.slice(0, 5).map(line);
  return [`Wedding payments due soon:`, ...shown, ...(due.length > 5 ? [`and ${due.length - 5} more`] : []), `Mark them paid: ${link}`].join('\n');
}

export function paymentReminderRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const out = (w: { admin_mobile: string | null; rate: number; s: string | null }) => {
    const s = settingOf(w.s);
    return { on: s.on, days: s.days, hasMobile: !!w.admin_mobile, costCents: costCents(2, w.rate) };
  };
  app.get('/', async (c) => {
    const w = await read(c.env.DB, c.req.param('wid')!);
    if (!w) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    return c.json(out(w));
  });
  app.put('/', requireMember('owner', 'editor'), async (c) => {
    const b = z.object({ on: z.boolean(), days: z.number().int().min(1).max(30) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'That didn’t save.' } }, 400);
    const wid = c.req.param('wid')!;
    const w = await read(c.env.DB, wid);
    if (!w) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    if (b.data.on && !w.admin_mobile) return c.json({ error: { code: 'no_mobile', message: 'Add your mobile in SMS setup first.' } }, 400);
    await write(c.env.DB, wid, { ...settingOf(w.s), on: b.data.on, days: b.data.days });
    return c.json(out({ ...w, s: JSON.stringify({ ...settingOf(w.s), ...b.data }) }));
  });
  return app;
}

/** The cron's part: for each wedding with reminders on, text what's newly due within its days (outside quiet hours). */
export async function runPaymentReminders(env: Env, d: EngineDeps) {
  const { results } = await env.DB.prepare(
    `SELECT id FROM wedding WHERE deleted_at IS NULL AND admin_mobile IS NOT NULL AND json_valid(content) AND json_extract(content, '$.payReminders.on') = 1`,
  ).all<{ id: string }>();
  let sent = 0;
  for (const { id } of results) {
    const w = await d.store.wedding(id);
    if (!w?.adminMobile || w.paused || inQuietHours(d.now(), w.timezone, w.quietStart, w.quietEnd)) continue;
    const row = await read(env.DB, id);
    const s = settingOf(row?.s ?? null);
    if (!s.on) continue;
    const today = dateIn(w.timezone, d.now());
    const until = new Date(Date.parse(`${today}T00:00:00Z`) + s.days * 86_400_000).toISOString().slice(0, 10);
    const [budget, vendors] = await Promise.all([readDoc(env.DB, id, 'budget', ''), readDoc(env.DB, id, 'vendors', '')]);
    const done = new Set(s.sent);
    const due = allPayments(budget.data.lines, vendors.data.list).filter((p) => !p.paid && p.amount > 0 && p.due && p.due <= until && !done.has(keyOf(p)));
    if (!due.length) continue;
    const ev = await env.DB.prepare(`SELECT key FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(id).first<{ key: string }>();
    const body = reminderText(due, today, `${w.baseUrl.replace(/\/+$/, '')}/admin/${id}/${ev?.key ?? 'account'}/planner?view=payments`);
    await d.store.enqueue([{ weddingId: id, invitationId: null, campaignId: null, dedupeKey: `payrem:${id}:${today}:${due.map(keyOf).join(',').slice(0, 300)}`, kind: 'test', to: w.adminMobile, body, parts: segments(body).parts }]);
    await write(env.DB, id, { ...s, sent: [...s.sent, ...due.map(keyOf)].slice(-300) });
    await flush(d, w).catch(() => undefined);
    sent++;
  }
  return sent;
}

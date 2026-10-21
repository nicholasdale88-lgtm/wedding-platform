import { chargeCents, EVENT_ADDON, PLAN_INFO, planOf, type Purchase } from '@wp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson, readText } from '../lib/security';
import { safeEqual } from '../sms/webhook';
import { mainAccountOf } from './accounts';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Paying by card with Stripe Checkout. The couple picks a plan (or another event), we open a Stripe
 * Checkout page for that amount, and Stripe's webhook (POST /api/hooks/stripe) switches it on once paid.
 * The webhook is the only thing that changes a plan: coming back to the admin with ?paid=1 proves nothing.
 *
 * Off unless STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are both set (taking money without a webhook to
 * switch the plan on would leave a couple paid up and still locked out). Off, couples ask for a payment
 * link as before (signup.ts planRoutes).
 */

const STRIPE_CHECKOUT = 'https://api.stripe.com/v1/checkout/sessions';
/** Stripe's own advice: refuse signatures more than five minutes old, so a captured request can't be replayed later. */
const TOLERANCE_S = 300;

const cardOn = (env: Env) => !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET;

const Checkout = z.object({ what: z.enum(['essentials', 'complete', 'event']) }).strict();

/** Admin routes, mounted at /a beside planRoutes. */
export function billingRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('/w/:wid/plan/*', jsonWritesOnly);

  /** Whether the Upgrade card offers card payment (any member may ask; only owners can pay). */
  app.get('/w/:wid/plan/card', requireUser, requireMember(), (c) => c.json({ on: cardOn(c.env) }));

  app.post('/w/:wid/plan/checkout', requireUser, requireMember('owner'), async (c) => {
    const err = (status: 400 | 403 | 404 | 409 | 429 | 502, code: string, message: string) => c.json({ error: { code, message } }, status);
    const key = c.env.STRIPE_SECRET_KEY;
    if (!key || !c.env.STRIPE_WEBHOOK_SECRET) return err(404, 'card_off', "Paying by card isn't switched on yet. Ask for a payment link instead.");
    const wid = c.req.param('wid');
    const user = c.get('user');
    // Same rule as asking for a payment link: the main account looks after the plan and payments.
    if (user.id !== (await mainAccountOf(c.env.DB, wid))) {
      return err(403, 'main_account', 'Only the main account (payments) can change the plan. Ask them, or see Settings → Who can sign in.');
    }
    const b = Checkout.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(400, 'invalid', 'Choose a plan.');
    const what: Purchase = b.data.what;
    const w = await c.env.DB.prepare(`SELECT plan, name1, name2 FROM wedding WHERE id = ? AND deleted_at IS NULL`)
      .bind(wid)
      .first<{ plan: string; name1: string; name2: string }>();
    if (!w) return err(404, 'not_found', 'Wedding not found.');
    // Weddings from before plans ('trial') already have everything, events included: nothing to sell them.
    if (w.plan === 'trial') return err(409, 'has_it', 'Your wedding already has everything, with as many events as you like.');
    const current = planOf(w.plan);
    const cents = chargeCents(current, what);
    if (cents === null) return err(409, 'has_it', `Your wedding already has ${PLAN_INFO[current].name}.`);
    // Each try opens a Stripe session; a page stuck in a loop shouldn't open hundreds.
    if (!(await allow(c.env.DB, `checkout:${wid}`, 20, 3_600_000))) return err(429, 'slow_down', 'Too many tries at paying. Please wait a little and try again.');

    const label =
      what === 'event' ? EVENT_ADDON.name : current === 'essentials' && what === 'complete' ? `${PLAN_INFO.complete.name} (upgrade from ${PLAN_INFO.essentials.name})` : PLAN_INFO[what].name;
    // Back to Settings → Your plan: an address with a page in it keeps ?paid=1 through the admin's redirects
    // (a bare /admin/:wid drops the query on its way to the last section used).
    const back = `${c.env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/admin/${encodeURIComponent(wid)}/settings?view=plan`;
    const form = new URLSearchParams({
      mode: 'payment',
      // Card only: it's paid (or not) before Stripe sends them back, so the webhook can switch it on straight away.
      'payment_method_types[0]': 'card',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'aud',
      'line_items[0][price_data][unit_amount]': String(cents),
      'line_items[0][price_data][product_data][name]': `The Yes List: ${label} for ${w.name1} & ${w.name2}`,
      'metadata[wedding]': wid,
      'metadata[what]': what,
      client_reference_id: wid,
      customer_email: user.email,
      success_url: `${back}&paid=1&bought=${what}`,
      cancel_url: `${back}&paid=0`,
    });
    let res: Response;
    try {
      res = await fetch(STRIPE_CHECKOUT, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
    } catch (e) {
      console.error('stripe checkout', e);
      return err(502, 'card_failed', "Couldn't open the card payment page just now. Please try again in a minute.");
    }
    const session = (await res.json().catch(() => null)) as { id?: unknown; url?: unknown; error?: { message?: unknown } } | null;
    if (!res.ok || typeof session?.url !== 'string' || !session.url.startsWith('https://')) {
      // Stripe's own message is for us (a bad key, a setting), not for the couple.
      console.error('stripe checkout', res.status, session?.error?.message);
      return err(502, 'card_failed', "Couldn't open the card payment page just now. Please try again in a minute.");
    }
    await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'plan.checkout', ?, ?, ?)`)
      .bind(crypto.randomUUID(), wid, user.id, typeof session.id === 'string' ? session.id : null, JSON.stringify({ what, cents }), new Date().toISOString())
      .run();
    return c.json({ url: session.url });
  });

  return app;
}

/**
 * Stripe's webhook, mounted at /hooks/stripe (before the SMS hooks, whose ?k= key isn't Stripe's: Stripe
 * signs each request instead). Send it checkout.session.completed. Any 2xx tells Stripe to stop retrying,
 * so a failure here answers 500 and Stripe tries again later; the session id makes a repeat change nothing.
 */
export function stripeHookRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.post('/', async (c) => {
    const bad = (code: string, message: string) => c.json({ error: { code, message } }, 400);
    const secret = c.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    const raw = await readText(c.req.raw);
    if (raw === null) return bad('too_large', 'Too large.');
    if (!(await stripeSignatureOk(secret, raw, c.req.header('Stripe-Signature'), Date.now()))) return bad('bad_signature', 'Bad signature');

    const ev = StripeEvent.safeParse(parseJson(raw));
    // Anything we don't act on is still a 200, or Stripe keeps sending it for days.
    if (!ev.success || (ev.data.type !== 'checkout.session.completed' && ev.data.type !== 'checkout.session.async_payment_succeeded')) {
      return c.json({ received: true, ignored: true });
    }
    const s = CheckoutSession.safeParse(ev.data.data.object);
    if (!s.success || s.data.payment_status !== 'paid') return c.json({ received: true, ignored: true });
    const wid = s.data.metadata?.wedding ?? '';
    const what = PurchaseOf.safeParse(s.data.metadata?.what);
    if (!wid || !what.success) return c.json({ received: true, ignored: true }); // not one of ours (another product on the same account)
    await applyPurchase(c.env.DB, wid, what.data, s.data.id, { amount: s.data.amount_total ?? null, currency: s.data.currency ?? null });
    return c.json({ received: true });
  });
  return app;
}

const PurchaseOf = z.enum(['essentials', 'complete', 'event']);
const StripeEvent = z.object({ type: z.string().max(100), data: z.object({ object: z.unknown() }) });
const CheckoutSession = z.object({
  id: z.string().min(1).max(255),
  payment_status: z.string().max(40),
  amount_total: z.number().int().nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
  metadata: z.record(z.string()).nullable().optional(),
});

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Switch on what was paid for, once per Checkout session. One batch (one transaction), with each statement
 * guarded by "no plan.paid audit row for this session yet": the update runs first, then the audit row is
 * written, so the same session delivered twice (or two deliveries at once) changes nothing the second time.
 * A plan only ever goes up: Essentials paid for on a Deluxe wedding leaves it Deluxe.
 */
async function applyPurchase(db: D1Database, wid: string, what: Purchase, sessionId: string, paid: { amount: number | null; currency: string | null }) {
  const at = new Date().toISOString();
  const fresh = `NOT EXISTS (SELECT 1 FROM audit WHERE action = 'plan.paid' AND target = ?1)`;
  const update =
    what === 'event'
      ? // One more event allowed: the same content.extraEvents the platform owner sets (PUT /a/super/plan).
        db.prepare(
          `UPDATE wedding SET
              content = json_set(
                CASE WHEN json_extract(content, '$.planRequested') = 'event' THEN json_remove(content, '$.planRequested', '$.planRequestedAt') ELSE content END,
                '$.extraEvents', COALESCE(json_extract(content, '$.extraEvents'), 0) + 1),
              updated_at = ?2
            WHERE id = ?3 AND json_valid(content) AND ${fresh}`,
        ).bind(sessionId, at, wid)
      : db.prepare(
          `UPDATE wedding SET
              plan = CASE WHEN plan = 'free' OR (plan = 'essentials' AND ?4 = 'complete') THEN ?4 ELSE plan END,
              content = CASE WHEN json_extract(content, '$.planRequested') IN ('essentials', ?4) THEN json_remove(content, '$.planRequested', '$.planRequestedAt') ELSE content END,
              updated_at = ?2
            WHERE id = ?3 AND json_valid(content) AND ${fresh}`,
        ).bind(sessionId, at, wid, what);
  await db.batch([
    update,
    db.prepare(
      `INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at)
       SELECT ?2, ?3, NULL, 'plan.paid', ?1, ?4, ?5 WHERE ${fresh}`,
    ).bind(sessionId, crypto.randomUUID(), wid, JSON.stringify({ what, ...paid }), at),
  ]);
}

/**
 * Stripe-Signature: "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${raw body}`>" (more than one v1 while a
 * secret is being rolled). Every v1 is compared in constant time, without stopping at the first match.
 */
export async function stripeSignatureOk(secret: string, raw: string, header: string | undefined, nowMs: number): Promise<boolean> {
  if (!header) return false;
  let t = '';
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v.toLowerCase());
  }
  if (!/^\d{1,12}$/.test(t) || !v1.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > TOLERANCE_S) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${raw}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  let ok = false;
  for (const s of v1) ok = safeEqual(mac, s) || ok;
  return ok;
}

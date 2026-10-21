import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { testD1 } from './support/d1';

/** Paying by card (Stripe Checkout) and Stripe's webhook switching the plan on. */
describe('card payments', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, cookie = '') => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  const form = { firstName: 'Alex', partnerName: 'Sam', email: 'alex@example.com', passcode: 'long-enough-1', date: '2027-03-14', plan: 'essentials', marketing: false, website: '' };
  const WHSEC = 'whsec_test_secret';
  const base: Env = {} as Env;

  /** Signs up (on Free) and returns the cookie and the wedding id. */
  const signup = async () => {
    const res = await call('/a/signup', { method: 'POST', body: JSON.stringify(form), headers: { 'CF-Connecting-IP': '1.1.1.1' } });
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { weddingId } = (await res.json()) as { weddingId: string };
    return { cookie, wid: weddingId };
  };
  const checkout = (wid: string, what: string, cookie: string) => call(`/a/w/${wid}/plan/checkout`, { method: 'POST', body: JSON.stringify({ what }) }, cookie);
  const planOfWedding = async (wid: string) => (await t.db.prepare(`SELECT plan FROM wedding WHERE id = ?`).bind(wid).first<{ plan: string }>())!.plan;
  const contentOf = async (wid: string) => JSON.parse((await t.db.prepare(`SELECT content FROM wedding WHERE id = ?`).bind(wid).first<{ content: string }>())!.content) as Record<string, unknown>;

  /** Stripe's calls, answered like Stripe does. */
  let stripeCalls: { url: string; init: RequestInit | undefined }[] = [];
  const stubStripe = () =>
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      stripeCalls.push({ url, init });
      const n = stripeCalls.length;
      return new Response(JSON.stringify({ id: `cs_test_${n}`, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/cs_test_${n}` }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  const sentForm = (i = stripeCalls.length - 1) => new URLSearchParams(String(stripeCalls[i]!.init?.body ?? ''));

  /** A Stripe event as it arrives, and its Stripe-Signature header. */
  const paidEvent = (sessionId: string, wid: string, what: string, over: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: `evt_${sessionId}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, object: 'checkout.session', payment_status: 'paid', amount_total: 2800, currency: 'aud', client_reference_id: wid, metadata: { wedding: wid, what }, ...over } },
    });
  const sign = async (raw: string, t = Math.floor(Date.now() / 1000), secret = WHSEC) => {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${raw}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${t},v1=${mac}`;
  };
  const hook = (raw: string, signature: string) => app.request('/api/hooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'Stripe-Signature': signature }, body: raw }, env, ctx);

  beforeEach(async () => {
    t = await testD1();
    Object.assign(base, { DB: t.db, PUBLIC_BASE_URL: 'https://example.com/', SESSION_SECRET: 'test-secret-for-sessions-000000' });
    env = { ...base, STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: WHSEC };
    stripeCalls = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('switched off (no Stripe keys): card says off, checkout says to ask for a link, and the webhook is not there', async () => {
    env = { ...base };
    stubStripe();
    const { cookie, wid } = await signup();
    expect(await (await call(`/a/w/${wid}/plan/card`, {}, cookie)).json()).toEqual({ on: false });
    const res = await checkout(wid, 'essentials', cookie);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('card_off');
    expect(body.error.message).toMatch(/payment link/);
    expect(stripeCalls).toHaveLength(0);
    const raw = paidEvent('cs_x', wid, 'essentials');
    expect((await hook(raw, await sign(raw))).status).toBe(404);
    expect(await planOfWedding(wid)).toBe('free');
    // Asking for a payment link still works as before.
    expect((await call(`/a/w/${wid}/plan/request`, { method: 'POST', body: JSON.stringify({ plan: 'essentials' }) }, cookie)).status).toBe(200);
  });

  it('a secret key without the webhook secret stays off (paid but never switched on would be worse)', async () => {
    env = { ...base, STRIPE_SECRET_KEY: 'sk_test_123' };
    const { cookie, wid } = await signup();
    expect(await (await call(`/a/w/${wid}/plan/card`, {}, cookie)).json()).toEqual({ on: false });
    expect((await checkout(wid, 'essentials', cookie)).status).toBe(404);
  });

  it('switched on: checkout posts the right form to Stripe and returns its page', async () => {
    stubStripe();
    const { cookie, wid } = await signup();
    expect(await (await call(`/a/w/${wid}/plan/card`, {}, cookie)).json()).toEqual({ on: true });
    // Signed out, or nonsense: no Stripe call.
    expect((await checkout(wid, 'essentials', '')).status).toBe(401);
    expect((await checkout(wid, 'platinum', cookie)).status).toBe(400);
    expect(stripeCalls).toHaveLength(0);

    const res = await checkout(wid, 'essentials', cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    expect(stripeCalls).toHaveLength(1);
    const sent = stripeCalls[0]!;
    expect(sent.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(sent.init?.method).toBe('POST');
    const headers = new Headers(sent.init?.headers);
    expect(headers.get('authorization')).toBe('Bearer sk_test_123');
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    const f = sentForm();
    expect(f.get('mode')).toBe('payment');
    expect(f.get('line_items[0][price_data][currency]')).toBe('aud');
    expect(f.get('line_items[0][price_data][unit_amount]')).toBe('2800');
    expect(f.get('line_items[0][quantity]')).toBe('1');
    expect(f.get('line_items[0][price_data][product_data][name]')).toBe('The Yes List: Essentials for Alex & Sam');
    expect(f.get('metadata[wedding]')).toBe(wid);
    expect(f.get('metadata[what]')).toBe('essentials');
    expect(f.get('client_reference_id')).toBe(wid);
    expect(f.get('customer_email')).toBe('alex@example.com');
    expect(f.get('success_url')).toBe(`https://example.com/admin/${wid}/settings?view=plan&paid=1&bought=essentials`);
    expect(f.get('cancel_url')).toBe(`https://example.com/admin/${wid}/settings?view=plan&paid=0`);

    // Deluxe from Free is the full price; another event is the add-on's.
    await checkout(wid, 'complete', cookie);
    expect(sentForm().get('line_items[0][price_data][unit_amount]')).toBe('3500');
    await checkout(wid, 'event', cookie);
    expect(sentForm().get('line_items[0][price_data][unit_amount]')).toBe('3900');
    expect(sentForm().get('metadata[what]')).toBe('event');
  });

  it("Essentials to Deluxe charges only the difference; a plan they already have can't be bought", async () => {
    stubStripe();
    const { cookie, wid } = await signup();
    await t.db.prepare(`UPDATE wedding SET plan = 'essentials' WHERE id = ?`).bind(wid).run();
    const res = await checkout(wid, 'complete', cookie);
    expect(res.status).toBe(200);
    expect(sentForm().get('line_items[0][price_data][unit_amount]')).toBe('700');
    expect(sentForm().get('line_items[0][price_data][product_data][name]')).toBe('The Yes List: Deluxe (upgrade from Essentials) for Alex & Sam');
    const n = stripeCalls.length;
    expect((await checkout(wid, 'essentials', cookie)).status).toBe(409);
    await t.db.prepare(`UPDATE wedding SET plan = 'complete' WHERE id = ?`).bind(wid).run();
    expect((await checkout(wid, 'complete', cookie)).status).toBe(409);
    expect((await checkout(wid, 'essentials', cookie)).status).toBe(409);
    expect(stripeCalls).toHaveLength(n);
    // Another event can still be bought on Deluxe.
    expect((await checkout(wid, 'event', cookie)).status).toBe(200);
  });

  it('owners only, and only so many tries an hour', async () => {
    stubStripe();
    const { cookie, wid } = await signup();
    await t.db.prepare(`UPDATE membership SET role = 'editor' WHERE wedding_id = ?`).bind(wid).run();
    expect((await checkout(wid, 'essentials', cookie)).status).toBe(403);
    await t.db.prepare(`UPDATE membership SET role = 'owner' WHERE wedding_id = ?`).bind(wid).run();
    for (let i = 0; i < 20; i++) expect((await checkout(wid, 'essentials', cookie)).status).toBe(200);
    expect((await checkout(wid, 'essentials', cookie)).status).toBe(429);
  });

  it('a Stripe error is a plain message, not a crash', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'Invalid API Key provided' } }), { status: 401 }));
    const { cookie, wid } = await signup();
    const res = await checkout(wid, 'essentials', cookie);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { message: string } }).error.message).not.toMatch(/API Key/);
  });

  it('the webhook, correctly signed, switches the plan on (once, never down); bad or old signatures are refused', async () => {
    const { cookie, wid } = await signup();
    await call(`/a/w/${wid}/plan/request`, { method: 'POST', body: JSON.stringify({ plan: 'essentials' }) }, cookie);
    const raw = paidEvent('cs_paid_1', wid, 'essentials');

    // A wrong secret, a changed body, no header, an old or far-future timestamp: 400, nothing changes.
    expect((await hook(raw, await sign(raw, undefined, 'whsec_wrong'))).status).toBe(400);
    expect((await hook(raw.replace('essentials', 'complete'), await sign(raw))).status).toBe(400);
    expect((await hook(raw, '')).status).toBe(400);
    expect((await hook(raw, await sign(raw, Math.floor(Date.now() / 1000) - 6 * 60))).status).toBe(400);
    expect((await hook(raw, await sign(raw, Math.floor(Date.now() / 1000) + 6 * 60))).status).toBe(400);
    expect(await planOfWedding(wid)).toBe('free');

    const ok = await hook(raw, await sign(raw));
    expect(ok.status).toBe(200);
    expect(await planOfWedding(wid)).toBe('essentials');
    expect((await contentOf(wid)).planRequested).toBeUndefined();
    const audit = await t.db.prepare(`SELECT wedding_id, detail FROM audit WHERE action = 'plan.paid' AND target = 'cs_paid_1'`).all<{ wedding_id: string; detail: string }>();
    expect(audit.results).toHaveLength(1);
    expect(audit.results[0]!.wedding_id).toBe(wid);
    expect(JSON.parse(audit.results[0]!.detail)).toMatchObject({ what: 'essentials', amount: 2800, currency: 'aud' });

    // The same session again (Stripe retries): nothing changes, no second audit row.
    await t.db.prepare(`UPDATE wedding SET plan = 'free' WHERE id = ?`).bind(wid).run();
    expect((await hook(raw, await sign(raw))).status).toBe(200);
    expect(await planOfWedding(wid)).toBe('free');
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM audit WHERE action = 'plan.paid' AND target = 'cs_paid_1'`).first<{ n: number }>())!.n).toBe(1);

    // Deluxe paid for: up to Deluxe. Then an Essentials payment arriving late never takes it back down.
    const deluxe = paidEvent('cs_paid_2', wid, 'complete');
    expect((await hook(deluxe, await sign(deluxe))).status).toBe(200);
    expect(await planOfWedding(wid)).toBe('complete');
    const late = paidEvent('cs_paid_3', wid, 'essentials');
    expect((await hook(late, await sign(late))).status).toBe(200);
    expect(await planOfWedding(wid)).toBe('complete');
  });

  it('unpaid sessions, other events and other products are a 200 and ignored', async () => {
    const { wid } = await signup();
    const unpaid = paidEvent('cs_unpaid', wid, 'essentials', { payment_status: 'unpaid' });
    expect((await hook(unpaid, await sign(unpaid))).status).toBe(200);
    const other = JSON.stringify({ id: 'evt_1', type: 'customer.created', data: { object: { id: 'cus_1' } } });
    expect((await hook(other, await sign(other))).status).toBe(200);
    const foreign = paidEvent('cs_foreign', wid, 'essentials', { metadata: { order: '42' } });
    expect((await hook(foreign, await sign(foreign))).status).toBe(200);
    expect(await planOfWedding(wid)).toBe('free');
    expect(await t.db.prepare(`SELECT 1 FROM audit WHERE action = 'plan.paid'`).first()).toBeNull();
  });

  it("'event' raises the extra events allowance by one per payment, and lets them add the event", async () => {
    const { cookie, wid } = await signup();
    const add = () => call(`/a/w/${wid}/events`, { method: 'POST', body: JSON.stringify({ name: 'Recovery brunch', startsAt: '2027-03-15T00:00:00.000Z' }) }, cookie);
    expect((await add()).status).toBe(402);
    const raw = paidEvent('cs_event_1', wid, 'event');
    expect((await hook(raw, await sign(raw))).status).toBe(200);
    expect((await contentOf(wid)).extraEvents).toBe(1);
    expect((await hook(raw, await sign(raw))).status).toBe(200); // a retry
    expect((await contentOf(wid)).extraEvents).toBe(1);
    expect(await planOfWedding(wid)).toBe('free'); // the plan itself is untouched
    expect((await add()).status).toBe(201);
    expect((await add()).status).toBe(402);
    const second = paidEvent('cs_event_2', wid, 'event');
    expect((await hook(second, await sign(second))).status).toBe(200);
    expect((await contentOf(wid)).extraEvents).toBe(2);
    expect((await add()).status).toBe(201);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEXT_COST_NOTE, TEXT_CREDIT_ALL_IN, textCreditsCents, textCreditsForGuests, textServiceFee } from '@wp/shared';
import type { Env } from '../src/env';
import { engineDeps } from '../src/env';
import { createApp } from '../src/index';
import { smsAccountFor } from '../src/lib/smsAccount';
import { testD1 } from './support/d1';

/**
 * Texts are paid for by the couple: they buy exactly the credits they need by card (5c a credit plus a 2%
 * service fee, shown all-in), Stripe's webhook adds them, and with no credits nothing is texted through
 * the site's account.
 */
describe('text credits', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, cookie = '') => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  const WHSEC = 'whsec_test_secret';
  const form = { firstName: 'Alex', partnerName: 'Sam', email: 'alex@example.com', passcode: 'long-enough-1', date: '2027-03-14', plan: 'essentials', marketing: false, website: '' };
  let stripeCalls: { url: string; body: string }[] = [];

  const signup = async () => {
    const res = await call('/a/signup', { method: 'POST', body: JSON.stringify(form), headers: { 'CF-Connecting-IP': '1.1.1.1' } });
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { weddingId } = (await res.json()) as { weddingId: string };
    return { cookie, wid: weddingId };
  };
  const credits = async (wid: string) => (await t.db.prepare(`SELECT wallet_credits AS n FROM wedding WHERE id = ?`).bind(wid).first<{ n: number | null }>())!.n;
  const sign = async (raw: string) => {
    const ts = Math.floor(Date.now() / 1000);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(WHSEC), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${raw}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${ts},v1=${mac}`;
  };
  const paid = (id: string, wid: string, n: number, amount = textCreditsCents(n)) =>
    JSON.stringify({ id: `evt_${id}`, type: 'checkout.session.completed', data: { object: { id, payment_status: 'paid', amount_total: amount, currency: 'aud', metadata: { wedding: wid, what: 'texts', credits: String(n) } } } });
  const hook = async (raw: string) => app.request('/api/hooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'Stripe-Signature': await sign(raw) }, body: raw }, env, ctx);

  beforeEach(async () => {
    t = await testD1();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: WHSEC, MM_USER: 'u', MM_PASS: 'p' };
    stripeCalls = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      stripeCalls.push({ url, body: String(init?.body ?? '') });
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('the rate: 5c a credit plus a 2% service fee, shown all-in; worked out from the guests', () => {
    expect(TEXT_CREDIT_ALL_IN).toBeCloseTo(5.1);
    expect(textServiceFee(720)).toBe(72);
    expect(textCreditsCents(720)).toBe(3672);
    expect(textCreditsForGuests(120)).toBe(1560);
    expect(textCreditsForGuests(3)).toBe(100); // the smallest purchase
    expect(textCreditsForGuests(7)).toBe(100);
    expect(textCreditsForGuests(101)).toBe(1320); // 1313, rounded up to the next 10
    expect(TEXT_COST_NOTE).toMatch(/not included in any plan/);
    expect(TEXT_COST_NOTE).toMatch(/5\.1c a credit, all-in/);
    expect(TEXT_COST_NOTE).toMatch(/2% service fee/);
  });

  it('bought by card for exactly the credits needed; the webhook adds them once; then texts can go', async () => {
    const { cookie, wid } = await signup();
    // Free: no automatic texts, so nothing to buy.
    await t.db.prepare(`UPDATE wedding SET plan = 'free'`).run();
    expect((await call(`/a/w/${wid}/texts/checkout`, { method: 'POST', body: JSON.stringify({ credits: 720 }) }, cookie)).status).toBe(400);
    await t.db.prepare(`UPDATE wedding SET plan = 'essentials'`).run();
    // Out of range.
    expect((await call(`/a/w/${wid}/texts/checkout`, { method: 'POST', body: JSON.stringify({ credits: 5 }) }, cookie)).status).toBe(400);

    const res = await call(`/a/w/${wid}/texts/checkout`, { method: 'POST', body: JSON.stringify({ credits: 720 }) }, cookie);
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(stripeCalls.at(-1)!.body);
    expect(sent.get('line_items[0][price_data][unit_amount]')).toBe('3672');
    expect(sent.get('line_items[0][price_data][product_data][name]')).toMatch(/720 text credits .*incl\. 2% service fee and GST/);
    expect(sent.get('metadata[what]')).toBe('texts');
    expect(sent.get('metadata[credits]')).toBe('720');

    // No credits yet: the site's texting account isn't used for this wedding.
    expect(await smsAccountFor(env, wid)).toBeNull();
    expect(await engineDeps(env).providerFor!(wid)).toBeNull();

    // Paid: added once, however often Stripe sends it.
    expect((await hook(paid('cs_a', wid, 720))).status).toBe(200);
    expect((await hook(paid('cs_a', wid, 720))).status).toBe(200);
    expect(await credits(wid)).toBe(720);
    // Never more credits than the amount paid covers.
    await hook(paid('cs_b', wid, 20000, 100));
    expect(await credits(wid)).toBe(720);

    expect(await smsAccountFor(env, wid)).toEqual({ user: 'u', pass: 'p' });
    expect(await engineDeps(env).providerFor!(wid)).not.toBeNull();

    // The Texting screen says texts aren't included, and what's left.
    const s = (await (await call(`/a/w/${wid}/settings`, {}, cookie)).json()) as { credits: number; connected: boolean; canBuy: boolean; costNote: string };
    expect(s).toMatchObject({ credits: 720, connected: true, canBuy: true });
    expect(s.costNote).toMatch(/not included in any plan/);
  });
});

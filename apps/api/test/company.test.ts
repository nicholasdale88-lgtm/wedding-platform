import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { testD1 } from './support/d1';

/** The company portal: only for super admins; stats, weddings, settings, promo codes (used when paying), referrals. */
describe('company portal', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, cookie = '') => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  let ip = 0;
  const signup = async (firstName: string, email: string, extra: Record<string, unknown> = {}) => {
    const res = await call('/a/signup', { method: 'POST', body: JSON.stringify({ firstName, partnerName: 'Sam', email, passcode: 'long-enough-1', date: '2027-03-14', plan: 'free', marketing: true, website: '', ...extra }), headers: { 'CF-Connecting-IP': `2.2.2.${++ip}` } });
    expect(res.status).toBe(200);
    return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]!, wid: ((await res.json()) as { weddingId: string }).weddingId };
  };
  const stripe: string[] = [];

  beforeEach(async () => {
    t = await testD1();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', SUPER_ADMINS: 'boss@example.com', STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_1' } as Env;
    stripe.length = 0;
    vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
      stripe.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ id: `cs_${stripe.length}`, url: `https://checkout.stripe.com/c/${stripe.length}` }), { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('is for super admins only; shows stats, sign-ups by referral, and finds weddings', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const couple = await signup('Alex', 'alex@example.com', { ref: 'Insta_Launch' });
    await signup('Kim', 'kim@example.com', { ref: 'alex-and-sam' });
    expect((await call('/a/company/stats', {}, couple.cookie)).status).toBe(403);
    expect((await call('/a/company/stats')).status).toBe(401);
    const s = (await (await call('/a/company/stats', {}, boss.cookie)).json()) as { weddings: number; signups: { last7: number; weekly: { n: number }[] }; plans: Record<string, number>; referrals: { ref: string; n: number }[]; optIns: number };
    expect(s.weddings).toBe(3);
    expect(s.signups.last7).toBe(3);
    expect(s.signups.weekly).toHaveLength(12);
    expect(s.signups.weekly.at(-1)!.n).toBe(3);
    expect(s.plans.free).toBe(3);
    expect(s.referrals.map((r) => r.ref).sort()).toEqual(['alex-and-sam', 'insta_launch']);
    expect(s.optIns).toBe(3);
    const found = (await (await call('/a/company/weddings?q=kim@', {}, boss.cookie)).json()) as { weddings: { slug: string; email: string; ref: string }[] };
    expect(found.weddings).toEqual([expect.objectContaining({ email: 'kim@example.com', ref: 'alex-and-sam' })]);
    // Set a plan by address.
    expect((await call(`/a/company/weddings/${found.weddings[0]!.slug}/plan`, { method: 'PUT', body: JSON.stringify({ plan: 'complete' }) }, boss.cookie)).status).toBe(200);
    expect((await t.db.prepare(`SELECT plan FROM wedding WHERE slug = ?`).bind(found.weddings[0]!.slug).first<{ plan: string }>())!.plan).toBe('complete');
    // The marketing list.
    const csv = await (await call('/a/company/optins.csv', {}, boss.cookie)).text();
    expect(csv.split('\r\n')).toHaveLength(4);
    expect(csv).toContain('"kim@example.com"');
  });

  it('settings: social links and the banner show on the public site settings; bad links are refused', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    expect(await (await call('/site')).json()).toEqual({ social: { instagram: '', tiktok: '', facebook: '', pinterest: '', youtube: '' }, supportEmail: '', banner: null, madeWith: true });
    expect((await call('/a/company/settings', { method: 'PUT', body: JSON.stringify({ social: { instagram: 'instagram.com/x' } }) }, boss.cookie)).status).toBe(400);
    const put = await call('/a/company/settings', { method: 'PUT', body: JSON.stringify({ social: { instagram: 'https://instagram.com/theyeslist' }, banner: { on: true, text: 'Launch week: 20% off with YES20', link: '/#pricing' }, madeWith: false }) }, boss.cookie);
    expect(put.status).toBe(200);
    expect(await (await call('/site')).json()).toMatchObject({ social: { instagram: 'https://instagram.com/theyeslist' }, banner: { text: 'Launch week: 20% off with YES20', link: '/#pricing' }, madeWith: false });
  });

  it('promo codes: a percentage off at checkout, a free code switches the plan on without a card, uses counted, limits kept', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const a = await signup('Alex', 'alex@example.com');
    const b = await signup('Bea', 'bea@example.com');
    const codes = [
      { code: 'yes20', percentOff: 20 },
      { code: 'FRIEND', percentOff: 100, plans: ['essentials'], maxUses: 1 },
      { code: 'OLD', percentOff: 50, expires: '2020-01-01' },
    ];
    const saved = (await (await call('/a/company/promos', { method: 'PUT', body: JSON.stringify({ codes }) }, boss.cookie)).json()) as { codes: { code: string; used: number }[] };
    expect(saved.codes.map((c) => [c.code, c.used])).toEqual([['YES20', 0], ['FRIEND', 0], ['OLD', 0]]);
    expect((await call('/a/company/promos', { method: 'PUT', body: JSON.stringify({ codes: [{ code: 'A1B' }, { code: 'a1b' }] }) }, boss.cookie)).status).toBe(400);

    // The price shown first, then Stripe asked for 20% less.
    expect(await (await call(`/a/w/${a.wid}/plan/promo`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'yes20' }) }, a.cookie)).json()).toEqual({ cents: 2240, off: 560, code: 'YES20' });
    expect(((await (await call(`/a/w/${a.wid}/plan/promo`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'OLD' }) }, a.cookie)).json()) as { error: { message: string } }).error.message).toMatch(/finished/);
    expect((await call(`/a/w/${a.wid}/plan/checkout`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'NOPE' }) }, a.cookie)).status).toBe(400);
    const pay = await call(`/a/w/${a.wid}/plan/checkout`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'YES20' }) }, a.cookie);
    expect(pay.status).toBe(200);
    const form = new URLSearchParams(stripe.at(-1)!);
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('2240');
    expect(form.get('metadata[promo]')).toBe('YES20');

    // A free code: on straight away, no Stripe; then it's used up.
    const before = stripe.length;
    const free = await call(`/a/w/${b.wid}/plan/checkout`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'friend' }) }, b.cookie);
    expect(await free.json()).toEqual({ url: `https://example.com/admin/${b.wid}/settings?view=plan&paid=1&bought=essentials` });
    expect(stripe.length).toBe(before);
    expect((await t.db.prepare(`SELECT plan FROM wedding WHERE id = ?`).bind(b.wid).first<{ plan: string }>())!.plan).toBe('essentials');
    const list = (await (await call('/a/company/promos', {}, boss.cookie)).json()) as { codes: { code: string; used: number }[] };
    expect(list.codes.find((c) => c.code === 'FRIEND')!.used).toBe(1);
    expect(((await (await call(`/a/w/${a.wid}/plan/promo`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'FRIEND' }) }, a.cookie)).json()) as { error: { message: string } }).error.message).toMatch(/used up/);
    // Not for Deluxe.
    expect(((await (await call(`/a/w/${a.wid}/plan/promo`, { method: 'POST', body: JSON.stringify({ what: 'complete', code: 'YES20' }) }, a.cookie)).json()) as { cents: number }).cents).toBe(2800);
    const stats = (await (await call('/a/company/stats', {}, boss.cookie)).json()) as { revenue: { payments: number } };
    expect(stats.revenue.payments).toBe(1);
  });
});

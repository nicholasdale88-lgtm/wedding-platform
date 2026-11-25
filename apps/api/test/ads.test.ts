import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { runAdsDaily } from '../src/routes/ads';
import { testD1 } from './support/d1';

/** The Ads bot: bots draft, only a person with Money puts an ad live, the daily check pauses losers. Meta is faked. */
describe('ads bot', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, cookie = '') => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  let ip = 0;
  const signup = async (firstName: string, email: string, extra: Record<string, unknown> = {}) => {
    const res = await call('/a/signup', { method: 'POST', body: JSON.stringify({ firstName, partnerName: 'Sam', email, passcode: 'long-enough-1', date: '2027-03-14', plan: 'free', marketing: false, website: '', ...extra }), headers: { 'CF-Connecting-IP': `3.3.3.${++ip}` } });
    expect(res.status).toBe(200);
    return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]! };
  };
  const meta: { method: string; url: string; body: string; auth: string }[] = [];
  let insights: { ad_id: string; spend: string; clicks: string; impressions: string }[] = [];
  let ads = 0;

  beforeEach(async () => {
    t = await testD1();
    env = {
      DB: t.db,
      PUBLIC_BASE_URL: 'https://example.com',
      SESSION_SECRET: 'test-secret-for-sessions-000000',
      SUPER_ADMINS: 'boss@example.com',
      META_ADS_TOKEN: 'EAAtoken',
      META_AD_ACCOUNT_ID: 'act_1234567',
      META_PAGE_ID: '7654321',
    } as Env;
    meta.length = 0;
    insights = [];
    ads = 0;
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => {
      const url = String(u);
      if (url.startsWith('https://example.com/ads/')) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
      const h = new Headers(init?.headers);
      meta.push({ method: init?.method ?? 'GET', url, body: String(init?.body ?? ''), auth: h.get('authorization') ?? '' });
      const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
      if (url.includes('/search?')) return ok({ data: [{ id: '6003', name: 'Weddings' }] });
      if (url.endsWith('/campaigns')) return ok({ id: 'camp1' });
      if (url.endsWith('/adsets')) return ok({ id: 'set1' });
      if (url.endsWith('/adimages')) return ok({ images: { f: { hash: 'hash1' } } });
      if (url.endsWith('/adcreatives')) return ok({ id: 'cr1' });
      if (url.endsWith('/ads')) return ok({ id: `ad${++ads}` });
      if (url.includes('/insights?')) return ok({ data: insights });
      return ok({ success: true });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  const draft = (id: string, primary = 'Your guests reply by text and the list fills itself in. $87, paid once.') => ({ id, name: `Ad ${id}`, primary, headline: 'RSVPs, sorted by text', image: 'text-feed', cta: 'SIGN_UP' });
  const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

  it('bots draft and pause but never spend; a person with Money approves; Stop all works for anyone', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const { key } = (await (await call('/a/company/bots', { method: 'POST', body: JSON.stringify({ name: 'Grok Ads', role: 'marketing' }) }, boss.cookie)).json()) as { key: string };
    const bot = bearer(key);

    // A bot writes a draft; bad words are refused with the reason.
    expect((await call('/a/company/ads/drafts', { method: 'POST', body: JSON.stringify(draft('text', 'Just engaged? Start free with invitations guests answer by text.')), headers: bot })).status).toBe(400);
    expect((await call('/a/company/ads/drafts', { method: 'POST', body: JSON.stringify(draft('text')), headers: bot })).status).toBe(200);
    const task = await t.db.prepare(`SELECT title FROM company_task WHERE kind = 'report'`).first<{ title: string }>();
    expect(task!.title).toBe('New ad draft: Ad text');

    // The bot can't approve, start again, or change the caps.
    expect((await call('/a/company/ads/text/approve', { method: 'POST', body: '{}', headers: bot })).status).toBe(403);
    expect((await call('/a/company/ads/settings', { method: 'PUT', body: JSON.stringify({ dailyCapCents: 5000 }), headers: bot })).status).toBe(403);
    expect(meta).toHaveLength(0);

    // The owner approves: campaign and ad set made paused, the ad made live, then both switched on.
    const res = await call('/a/company/ads/text/approve', { method: 'POST', body: '{}' }, boss.cookie);
    expect(res.status).toBe(200);
    expect(meta.every((m) => m.auth === 'Bearer EAAtoken' && !m.url.includes('EAAtoken'))).toBe(true);
    const camp = meta.find((m) => m.url.endsWith('/act_1234567/campaigns'))!;
    expect(new URLSearchParams(camp.body).get('status')).toBe('PAUSED');
    const set = new URLSearchParams(meta.find((m) => m.url.endsWith('/adsets'))!.body);
    expect(set.get('daily_budget')).toBe('1000');
    expect(JSON.parse(set.get('targeting')!)).toMatchObject({ geo_locations: { countries: ['AU'] }, age_min: 24, flexible_spec: [{ interests: [{ id: '6003' }] }] });
    const creative = JSON.parse(new URLSearchParams(meta.find((m) => m.url.endsWith('/adcreatives'))!.body).get('object_story_spec')!) as { page_id: string; link_data: { link: string; message: string } };
    expect(creative.page_id).toBe('7654321');
    expect(creative.link_data.link).toContain('?ref=meta-text');
    expect(new URLSearchParams(meta.find((m) => m.url.endsWith('/ads'))!.body).get('status')).toBe('ACTIVE');
    expect(meta.filter((m) => /\/(set1|camp1)$/.test(m.url)).map((m) => new URLSearchParams(m.body).get('status'))).toEqual(['ACTIVE', 'ACTIVE']);

    const state = (await (await call('/a/company/ads', { headers: bot })).json()) as { variants: { id: string; status: string; approvedBy: string; metaAdId: string }[]; canSpend: boolean };
    expect(state.canSpend).toBe(false);
    expect(state.variants[0]).toMatchObject({ status: 'live', approvedBy: 'Boss', metaAdId: 'ad1' });

    // A live ad can't be rewritten under the same name (its numbers stay its own).
    expect((await call('/a/company/ads/drafts', { method: 'POST', body: JSON.stringify(draft('text')), headers: bot })).status).toBe(400);
    // The bot may pause it and stop everything.
    expect((await call('/a/company/ads/text/pause', { method: 'POST', body: '{}', headers: bot })).status).toBe(200);
    expect((await call('/a/company/ads/stop-all', { method: 'POST', body: '{}', headers: bot })).status).toBe(200);
    expect((await call('/a/company/ads/start-all', { method: 'POST', body: '{}', headers: bot })).status).toBe(403);
    expect((await call('/a/company/ads/start-all', { method: 'POST', body: '{}' }, boss.cookie)).status).toBe(200);
    // The daily cap goes to Meta when the owner changes it.
    expect((await call('/a/company/ads/settings', { method: 'PUT', body: JSON.stringify({ dailyCapCents: 1500, totalCapCents: 28000, ageMin: 24, ageMax: 45, pauseNoSignupCents: 2500, pauseCostPerSaleCents: 4000 }) }, boss.cookie)).status).toBe(200);
    expect(new URLSearchParams(meta.at(-1)!.body).get('daily_budget')).toBe('1500');
    // Every step is in Activity.
    const acts = await t.db.prepare(`SELECT action FROM audit WHERE action LIKE 'ads.%' ORDER BY at`).all<{ action: string }>();
    expect(acts.results.map((r) => r.action)).toEqual(['ads.draft', 'ads.approve', 'ads.pause', 'ads.stop_all', 'ads.start_all', 'ads.settings']);
  });

  it('the daily check counts sign-ups from each ad’s link, pauses the one that spends with none, and reports', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    for (const id of ['good', 'dud']) {
      await call('/a/company/ads/drafts', { method: 'POST', body: JSON.stringify(draft(id)) }, boss.cookie);
      expect((await call(`/a/company/ads/${id}/approve`, { method: 'POST', body: '{}' }, boss.cookie)).status).toBe(200);
    }
    await signup('Alex', 'alex@example.com', { ref: 'meta-good' });
    insights = [
      { ad_id: 'ad1', spend: '12.50', clicks: '40', impressions: '2000' },
      { ad_id: 'ad2', spend: '31.20', clicks: '22', impressions: '2100' },
    ];
    // Not before 8am Sydney, and not twice a day.
    expect(await runAdsDaily(env, new Date('2026-11-15T19:00:00Z'))).toBe('not due'); // 6am Sydney
    expect(await runAdsDaily(env, new Date('2026-11-15T23:00:00Z'))).toBe('1 changes'); // 10am Sydney
    expect(await runAdsDaily(env, new Date('2026-11-16T01:00:00Z'))).toBe('not due');
    const s = (await (await call('/a/company/ads', {}, boss.cookie)).json()) as { variants: { id: string; status: string; why: string; stats: { spendCents: number; signups: number } }[] };
    expect(s.variants.find((v) => v.id === 'good')).toMatchObject({ status: 'live', stats: { spendCents: 1250, signups: 1 } });
    expect(s.variants.find((v) => v.id === 'dud')).toMatchObject({ status: 'paused', why: 'Spent $31.20 with no sign-ups.' });
    expect(new URLSearchParams(meta.at(-1)!.body).get('status')).toBe('PAUSED');
    expect(meta.at(-1)!.url).toMatch(/\/ad2$/);
    const r = await t.db.prepare(`SELECT title, body FROM company_task WHERE created_by = 'ads-bot'`).first<{ title: string; body: string }>();
    expect(r!.title).toMatch(/Paused “Ad dud”/);
    expect(r!.body).toContain('Spent so far: $43.70');
  });

  it('without Meta connected: drafts still work, nothing else does, and the cron does nothing', async () => {
    env.META_ADS_TOKEN = undefined;
    const boss = await signup('Boss', 'boss@example.com');
    expect((await call('/a/company/ads/drafts', { method: 'POST', body: JSON.stringify(draft('text')) }, boss.cookie)).status).toBe(200);
    const res = await call('/a/company/ads/text/approve', { method: 'POST', body: '{}' }, boss.cookie);
    expect(res.status).toBe(400);
    expect(((await (await call('/a/company/ads', {}, boss.cookie)).json()) as { missing: string[] }).missing).toEqual(['META_ADS_TOKEN']);
    expect(await runAdsDaily(env)).toBe('not connected');
    // A couple can't reach it.
    const couple = await signup('Kim', 'kim@example.com');
    expect((await call('/a/company/ads', {}, couple.cookie)).status).toBe(403);
  });
});

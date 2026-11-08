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
    expect(await (await call(`/a/w/${a.wid}/plan/promo`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'yes20' }) }, a.cookie)).json()).toEqual({ cents: 7040, off: 1760, code: 'YES20' }); // $88 less 20%
    expect(((await (await call(`/a/w/${a.wid}/plan/promo`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'OLD' }) }, a.cookie)).json()) as { error: { message: string } }).error.message).toMatch(/finished/);
    expect((await call(`/a/w/${a.wid}/plan/checkout`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'NOPE' }) }, a.cookie)).status).toBe(400);
    const pay = await call(`/a/w/${a.wid}/plan/checkout`, { method: 'POST', body: JSON.stringify({ what: 'essentials', code: 'YES20' }) }, a.cookie);
    expect(pay.status).toBe(200);
    const form = new URLSearchParams(stripe.at(-1)!);
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('7040');
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
    expect(((await (await call(`/a/w/${a.wid}/plan/promo`, { method: 'POST', body: JSON.stringify({ what: 'complete', code: 'YES20' }) }, a.cookie)).json()) as { cents: number }).cents).toBe(7840);
    const stats = (await (await call('/a/company/stats', {}, boss.cookie)).json()) as { revenue: { payments: number } };
    expect(stats.revenue.payments).toBe(1);
  });
  it('a plan request: email the payment link, then mark it paid (switched on, money counted); or clear it', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const a = await signup('Alex', 'alex@example.com');
    const slug = (await t.db.prepare(`SELECT slug FROM wedding WHERE id = ?`).bind(a.wid).first<{ slug: string }>())!.slug;
    expect((await call(`/a/company/weddings/${slug}/send-link`, { method: 'POST', body: '{}' }, boss.cookie)).status).toBe(400); // no request yet
    expect((await call(`/a/w/${a.wid}/plan/request`, { method: 'POST', body: JSON.stringify({ plan: 'complete' }) }, a.cookie)).status).toBe(200);
    // No payment link saved yet: told where to add one.
    const noLink = await call(`/a/company/weddings/${slug}/send-link`, { method: 'POST', body: '{}' }, boss.cookie);
    expect(noLink.status).toBe(400);
    expect((await call('/a/company/settings', { method: 'PUT', body: JSON.stringify({ paymentLinks: { complete: 'http://pay.example.com' } }) }, boss.cookie)).status).toBe(400);
    expect((await call('/a/company/settings', { method: 'PUT', body: JSON.stringify({ paymentLinks: { complete: 'https://buy.stripe.com/deluxe' } }) }, boss.cookie)).status).toBe(200);
    // The public settings never show the payment links.
    expect(JSON.stringify(await (await call('/site')).json())).not.toContain('stripe');
    expect((await call(`/a/company/weddings/${slug}/send-link`, { method: 'POST', body: '{}' }, a.cookie)).status).toBe(403);
    const sent = (await (await call(`/a/company/weddings/${slug}/send-link`, { method: 'POST', body: '{}' }, boss.cookie)).json()) as { emailed: boolean; email: string; link: string; cents: number };
    expect(sent).toEqual({ ok: true, emailed: false, email: 'alex@example.com', link: 'https://buy.stripe.com/deluxe', cents: 9800 });
    let row = ((await (await call('/a/company/weddings?requests=1', {}, boss.cookie)).json()) as { weddings: { requested: string; linkSentAt: string; paidCents: number }[] }).weddings[0]!;
    expect(row.requested).toBe('complete');
    expect(row.linkSentAt).not.toBe('');
    expect((await call(`/a/company/weddings/${slug}/paid`, { method: 'POST', body: JSON.stringify({ what: 'complete', cents: 3500 }) }, boss.cookie)).status).toBe(200);
    expect((await t.db.prepare(`SELECT plan FROM wedding WHERE id = ?`).bind(a.wid).first<{ plan: string }>())!.plan).toBe('complete');
    row = ((await (await call('/a/company/weddings?q=alex', {}, boss.cookie)).json()) as { weddings: { requested: string; linkSentAt: string; paidCents: number }[] }).weddings[0]!;
    expect(row).toMatchObject({ requested: '', linkSentAt: '', paidCents: 3500 });
    const stats = (await (await call('/a/company/stats', {}, boss.cookie)).json()) as { revenue: { total: number; payments: number }; requests: number };
    expect(stats.revenue).toMatchObject({ total: 3500, payments: 1 });
    expect(stats.requests).toBe(0);
    // Not now: clears an extra-event request without changing anything.
    await call(`/a/w/${a.wid}/plan/request`, { method: 'POST', body: JSON.stringify({ plan: 'event' }) }, a.cookie);
    expect((await call(`/a/company/weddings/${slug}/plan`, { method: 'PUT', body: JSON.stringify({ extraEvents: 0 }) }, boss.cookie)).status).toBe(200);
    expect(((await (await call('/a/company/stats', {}, boss.cookie)).json()) as { requests: number }).requests).toBe(0);
  });

  it('feedback: any member sends it; only the company reads it; planned notes show to every couple, never anyone’s words', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const a = await signup('Alex', 'alex@example.com');
    const b = await signup('Bea', 'bea@example.com');
    expect((await call(`/a/w/${a.wid}/feedback`, { method: 'POST', body: JSON.stringify({ kind: 'idea', text: 'Bigger rooms for seating' }) })).status).toBe(401);
    expect((await call(`/a/w/${a.wid}/feedback`, { method: 'POST', body: JSON.stringify({ kind: 'idea', text: 'Bigger rooms for seating' }) }, b.cookie)).status).toBe(404); // not Bea's wedding
    expect((await call(`/a/w/${a.wid}/feedback`, { method: 'POST', body: JSON.stringify({ kind: 'idea', text: 'x' }) }, a.cookie)).status).toBe(400);
    expect((await call(`/a/w/${a.wid}/feedback`, { method: 'POST', body: JSON.stringify({ kind: 'idea', text: 'Bigger rooms for seating', page: 'help' }) }, a.cookie)).status).toBe(200);
    expect((await call('/a/company/feedback', {}, a.cookie)).status).toBe(403);
    const list = (await (await call('/a/company/feedback', {}, boss.cookie)).json()) as { feedback: { id: string; text: string; names: string; email: string; status: string }[]; counts: Record<string, number> };
    expect(list.counts).toEqual({ new: 1 });
    expect(list.feedback[0]).toMatchObject({ text: 'Bigger rooms for seating', email: 'alex@example.com', status: 'new' });
    expect((await call(`/a/company/feedback/${list.feedback[0]!.id}`, { method: 'PUT', body: '{}' }, boss.cookie)).status).toBe(400);
    expect((await call(`/a/company/feedback/${list.feedback[0]!.id}`, { method: 'PUT', body: JSON.stringify({ status: 'planned', note: 'Seating: room sizes up to 4x' }) }, boss.cookie)).status).toBe(200);
    const updates = (await (await call(`/a/w/${b.wid}/feedback/updates`, {}, b.cookie)).json()) as { updates: { text: string; done: boolean }[] };
    expect(updates.updates).toEqual([{ text: 'Seating: room sizes up to 4x', done: false, at: expect.any(String) }]);
    expect(JSON.stringify(updates)).not.toContain('Bigger rooms');
  });
  it('staff: an owner invites by email; each role sees only its part; feedback is taken and worked; removing someone signs them out; all logged', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const a = await signup('Alex', 'alex@example.com');
    const slug = (await t.db.prepare(`SELECT slug FROM wedding WHERE id = ?`).bind(a.wid).first<{ slug: string }>())!.slug;
    const invite = async (email: string, role: string) => {
      const r = (await (await call('/a/company/team/invite', { method: 'POST', body: JSON.stringify({ email, role }) }, boss.cookie)).json()) as { emailed: boolean; link: string };
      expect(r.emailed).toBe(false);
      return new URL(r.link).searchParams.get('t')!;
    };
    // A developer, new here: name and passcode.
    const devToken = await invite('dev@example.com', 'developer');
    expect(await (await call(`/a/staff-join/${devToken}`)).json()).toMatchObject({ email: 'dev@example.com', role: 'developer', hasAccount: false });
    expect((await call(`/a/staff-join/${devToken}`, { method: 'POST', body: JSON.stringify({ passcode: 'long-enough-2' }) })).status).toBe(400); // no name
    const joined = await call(`/a/staff-join/${devToken}`, { method: 'POST', body: JSON.stringify({ passcode: 'long-enough-2', firstName: 'Dev' }) });
    expect(joined.status).toBe(200);
    expect(((await joined.json()) as { user: { staff: string } }).user.staff).toBe('developer');
    const dev = (joined.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await call(`/a/staff-join/${devToken}`)).status).toBe(404); // once only
    // Support: an existing account (a couple's) signs in with its own passcode.
    const supToken = await invite('alex@example.com', 'support');
    expect((await call(`/a/staff-join/${supToken}`, { method: 'POST', body: JSON.stringify({ passcode: 'wrong-passcode' }) })).status).toBe(400);
    const sup = ((await call(`/a/staff-join/${supToken}`, { method: 'POST', body: JSON.stringify({ passcode: 'long-enough-1' }) })).headers.get('set-cookie') ?? '').split(';')[0]!;

    // What each can reach.
    expect((await call('/a/company/stats', {}, dev)).status).toBe(200);
    expect((await call('/a/company/weddings', {}, dev)).status).toBe(403);
    expect((await call('/a/company/promos', {}, dev)).status).toBe(403);
    expect((await call('/a/company/team', {}, dev)).status).toBe(403);
    expect((await call('/a/company/weddings', {}, sup)).status).toBe(200);
    expect((await call('/a/company/settings', { method: 'PUT', body: JSON.stringify({}) }, sup)).status).toBe(403);
    expect((await call('/a/company/team', {}, sup)).status).toBe(403);
    await call(`/a/w/${a.wid}/plan/request`, { method: 'POST', body: JSON.stringify({ plan: 'essentials' }) }, a.cookie);
    expect((await call(`/a/company/weddings/${slug}/paid`, { method: 'POST', body: JSON.stringify({ what: 'essentials', cents: 2800 }) }, sup)).status).toBe(403); // money is a manager's or owner's

    // Feedback: the developer sees the words, not who sent them; takes it and works it.
    await call(`/a/w/${a.wid}/feedback`, { method: 'POST', body: JSON.stringify({ kind: 'problem', text: 'Seating page is slow' }) }, a.cookie);
    const fb = (await (await call('/a/company/feedback', {}, dev)).json()) as { feedback: { id: string; email: string; text: string }[] };
    expect(fb.feedback[0]).toMatchObject({ text: 'Seating page is slow', email: '' });
    const team = (await (await call('/a/company/staff', {}, dev)).json()) as { staff: { id: string; name: string }[]; me: { id: string } };
    expect(team.staff.map((m) => m.name).sort()).toEqual(['Alex', 'Boss', 'Dev']);
    expect((await call(`/a/company/feedback/${fb.feedback[0]!.id}`, { method: 'PUT', body: JSON.stringify({ assignee: 'not-staff' }) }, dev)).status).toBe(400);
    expect((await call(`/a/company/feedback/${fb.feedback[0]!.id}`, { method: 'PUT', body: JSON.stringify({ status: 'in_progress', assignee: team.me.id }) }, dev)).status).toBe(200);
    const after = (await (await call('/a/company/feedback', {}, boss.cookie)).json()) as { feedback: { status: string; assignee: string }[] };
    expect(after.feedback[0]).toMatchObject({ status: 'in_progress', assignee: team.me.id });

    // The founder can't be changed; others can; removing signs them out at once.
    const list = (await (await call('/a/company/team', {}, boss.cookie)).json()) as { staff: { id: string; email: string; founder: boolean }[] };
    const founder = list.staff.find((m) => m.founder)!;
    expect(founder.email).toBe('boss@example.com');
    const devId = list.staff.find((m) => m.email === 'dev@example.com')!.id;
    expect((await call(`/a/company/team/${devId}`, { method: 'PUT', body: JSON.stringify({ role: '' }) }, boss.cookie)).status).toBe(200);
    expect((await call('/a/company/stats', {}, dev)).status).toBe(401);
    expect(((await (await call('/a/company/feedback', {}, boss.cookie)).json()) as { feedback: { assignee: string }[] }).feedback[0]!.assignee).toBe('');

    // Activity: who did what.
    const act = (await (await call('/a/company/activity', {}, boss.cookie)).json()) as { activity: { action: string; who: string }[] };
    expect(act.activity.map((x) => x.action)).toEqual(expect.arrayContaining(['company.team.invite', 'company.team.join', 'company.feedback', 'company.team.remove']));
    expect(act.activity.find((x) => x.action === 'company.feedback')!.who).toBe('Dev');
    expect((await call('/a/company/activity', {}, sup)).status).toBe(403);
  });
  it('money and tax: sales, fees, expenses and what to put aside by quarter; GST only once registered; a spreadsheet', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const a = await signup('Alex', 'alex@example.com');
    const slug = (await t.db.prepare(`SELECT slug FROM wedding WHERE id = ?`).bind(a.wid).first<{ slug: string }>())!.slug;
    await call(`/a/company/weddings/${slug}/paid`, { method: 'POST', body: JSON.stringify({ what: 'essentials', cents: 2800 }) }, boss.cookie);
    expect((await call('/a/company/money/expenses', { method: 'POST', body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), what: 'Domain', kind: 'domain', cents: 1500 }) }, boss.cookie)).status).toBe(200);
    type M = { total: { gross: number; fees: number; spent: number; profit: number; setAside: number; gstOwed: number }; expenses: unknown[] };
    let m = (await (await call('/a/company/money', {}, boss.cookie)).json()) as M;
    expect(m.total).toMatchObject({ gross: 2800, fees: 0, spent: 1500, profit: 1300, setAside: 390, gstOwed: 0 }); // paid by link: no card fee
    // Running costs count every month, in the month-by-month profit.
    await call('/a/company/money/settings', { method: 'PUT', body: JSON.stringify({ monthlyCosts: [{ what: 'Grok business bot', cents: 5000 }] }) }, boss.cookie);
    const mm = (await (await call('/a/company/money', {}, boss.cookie)).json()) as { months: { gross: number; running: number; oneOff: number; profit: number }[]; prices: { essentials: number } };
    expect(mm.months).toHaveLength(12);
    expect(mm.months.at(-1)).toMatchObject({ gross: 2800, running: 5000, oneOff: 1500, profit: -3700 });
    expect(mm.prices.essentials).toBe(8800);
    expect((await call('/a/company/money/settings', { method: 'PUT', body: JSON.stringify({ gstRegistered: true }) }, boss.cookie)).status).toBe(400); // needs the date
    await call('/a/company/money/settings', { method: 'PUT', body: JSON.stringify({ gstRegistered: true, gstFrom: '2020-01-01', setAsidePct: 30 }) }, boss.cookie);
    m = (await (await call('/a/company/money', {}, boss.cookie)).json()) as M;
    expect(m.total.gstOwed).toBe(255); // 2800 / 11
    const csv = await (await call('/a/company/money.csv', {}, boss.cookie)).text();
    expect(csv).toContain('"Sale"');
    expect(csv).toContain('"Domain"');
  });
  it('bots: an owner makes a key with a role; the bot works by its role, never as owner; actions logged under its name; switched off at once', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    expect((await call('/a/company/bots', { method: 'POST', body: JSON.stringify({ name: 'Grok', role: 'owner' }) }, boss.cookie)).status).toBe(400);
    const { id, key } = (await (await call('/a/company/bots', { method: 'POST', body: JSON.stringify({ name: 'Grok', role: 'marketing' }) }, boss.cookie)).json()) as { id: string; key: string };
    const bot = { authorization: `Bearer ${key}` };
    expect((await call('/a/company/stats', { headers: bot })).status).toBe(200);
    expect((await call('/a/company/promos', { headers: bot })).status).toBe(200);
    expect((await call('/a/company/weddings', { headers: bot })).status).toBe(403); // marketing doesn't see couples
    expect((await call('/a/company/bots', { headers: bot })).status).toBe(403); // nor the team
    expect((await call('/a/company/promos', { method: 'PUT', body: JSON.stringify({ codes: [{ code: 'GROK10', percentOff: 10 }] }), headers: bot })).status).toBe(200);
    const act = (await (await call('/a/company/activity', {}, boss.cookie)).json()) as { activity: { action: string; who: string }[] };
    expect(act.activity.find((a) => a.action === 'company.promos')!.who).toBe('Grok');
    expect((await call('/a/company/stats', { headers: { authorization: 'Bearer yl_bot_wrongwrongwrongwrongwrong' } })).status).toBe(401);
    expect((await call(`/a/company/bots/${id}`, { method: 'DELETE' }, boss.cookie)).status).toBe(200);
    expect((await call('/a/company/stats', { headers: bot })).status).toBe(401);
  });
  it('the company assistant drafts from the real numbers (free Workers AI), by role, and says when it is off', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    expect((await call('/a/company/assistant', { method: 'POST', body: JSON.stringify({ task: 'brief' }) }, boss.cookie)).status).toBe(400); // AI off
    const asked: string[] = [];
    env.AI = { run: async (...args: [model: string, input: unknown]) => (asked.push(JSON.stringify(args[1])), { response: 'Two new weddings this week.' }) };
    const r = await call('/a/company/assistant', { method: 'POST', body: JSON.stringify({ task: 'brief' }) }, boss.cookie);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { text: string }).text).toBe('Two new weddings this week.');
    expect(asked[0]).toContain('weddings');
    const { key } = (await (await call('/a/company/bots', { method: 'POST', body: JSON.stringify({ name: 'Dev bot', role: 'developer' }) }, boss.cookie)).json()) as { key: string };
    expect((await call('/a/company/assistant', { method: 'POST', body: JSON.stringify({ task: 'posts' }), headers: { authorization: `Bearer ${key}` } })).status).toBe(403);
  });
  it('connections: an owner pastes a service key in the portal; it is kept encrypted, never shown, and used straight away', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const before = (await (await call('/a/company/connections', {}, boss.cookie)).json()) as { status: Record<string, string> };
    expect(before.status.STRIPE_SECRET_KEY).toBe('deploy'); // this test's env sets it, like a GitHub secret
    expect(before.status.DROPBOX_APP_KEY).toBe('');
    expect((await call('/a/company/connections', { method: 'PUT', body: JSON.stringify({ DROPBOX_APP_KEY: 'dbx-key-123', DROPBOX_APP_SECRET: 'dbx-secret-456' }) }, boss.cookie)).status).toBe(200);
    const after = (await (await call('/a/company/connections', {}, boss.cookie)).json()) as { status: Record<string, string> };
    expect(after.status.DROPBOX_APP_KEY).toBe('saved');
    expect(JSON.stringify(after)).not.toContain('dbx-secret-456');
    const row = await t.db.prepare(`SELECT value FROM platform_setting WHERE key = 'connections'`).first<{ value: string }>();
    expect(row!.value).not.toContain('dbx-secret-456'); // encrypted
    expect(env.DROPBOX_APP_KEY).toBe('dbx-key-123'); // used straight away
    const couple = await signup('Alex', 'alex@example.com');
    expect((await call('/a/company/connections', {}, couple.cookie)).status).toBe(403);
  });
  it('the to-do list: starts with the launch jobs; owners tick (who and when kept); the team can read', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const first = (await (await call('/a/company/todo', {}, boss.cookie)).json()) as { items: { id: string; done: boolean; doneBy: string }[]; canEdit: boolean };
    expect(first.items.find((i) => i.id === 'abn')).toBeTruthy();
    expect(first.canEdit).toBe(true);
    const ticked = first.items.map((i) => (i.id === 'abn' ? { ...i, done: true } : i));
    const saved = (await (await call('/a/company/todo', { method: 'PUT', body: JSON.stringify({ items: ticked }) }, boss.cookie)).json()) as { items: { id: string; done: boolean; doneBy: string }[] };
    expect(saved.items.find((i) => i.id === 'abn')).toMatchObject({ done: true, doneBy: 'boss@example.com' });
    const { key } = (await (await call('/a/company/bots', { method: 'POST', body: JSON.stringify({ name: 'Grok', role: 'marketing' }) }, boss.cookie)).json()) as { key: string };
    const asBot = (await (await call('/a/company/todo', { headers: { authorization: `Bearer ${key}` } })).json()) as { items: { id: string; done: boolean }[]; canEdit: boolean };
    expect(asBot.canEdit).toBe(false);
    expect(asBot.items.find((i) => i.id === 'abn')!.done).toBe(true);
    expect((await call('/a/company/todo', { method: 'PUT', body: JSON.stringify({ items: [] }), headers: { authorization: `Bearer ${key}` } })).status).toBe(403);
  });
  it('ideas: a bot (the Grok scout) adds ideas straight into Feedback as new', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const { key } = (await (await call('/a/company/bots', { method: 'POST', body: JSON.stringify({ name: 'Grok', role: 'developer' }) }, boss.cookie)).json()) as { key: string };
    const r = await call('/a/company/ideas', { method: 'POST', body: JSON.stringify({ text: 'Rivals now offer a QR code on printed save-the-dates', source: 'grok scout' }), headers: { authorization: `Bearer ${key}` } });
    expect(r.status).toBe(200);
    const fb = (await (await call('/a/company/feedback', {}, boss.cookie)).json()) as { feedback: { text: string; status: string; page: string }[] };
    expect(fb.feedback[0]).toMatchObject({ text: 'Rivals now offer a QR code on printed save-the-dates', status: 'new', page: 'grok scout' });
  });
  it('made roles: an owner makes a role with exactly the parts it reaches; a person with it sees just those; a role in use can’t be removed', async () => {
    const boss = await signup('Boss', 'boss@example.com');
    const roles = [{ id: 'bookkeeper', name: 'Bookkeeper', does: 'The books', perms: ['money', 'activity', 'team'] }];
    const saved = (await (await call('/a/company/roles', { method: 'PUT', body: JSON.stringify({ roles }) }, boss.cookie)).json()) as { roles: { perms: string[] }[] };
    expect(saved.roles[0]!.perms).toEqual(['money', 'activity']); // never the team
    const r = (await (await call('/a/company/team/invite', { method: 'POST', body: JSON.stringify({ email: 'books@example.com', role: 'custom:bookkeeper' }) }, boss.cookie)).json()) as { link: string };
    const token = new URL(r.link).searchParams.get('t')!;
    const joined = await call(`/a/staff-join/${token}`, { method: 'POST', body: JSON.stringify({ passcode: 'long-enough-3', firstName: 'Bea' }) });
    expect(((await joined.json()) as { user: { staff: string; perms: string[]; staffName: string } }).user).toMatchObject({ staff: 'custom:bookkeeper', perms: ['money', 'activity'], staffName: 'Bookkeeper' });
    const bea = (joined.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await call('/a/company/money', {}, bea)).status).toBe(200);
    expect((await call('/a/company/weddings', {}, bea)).status).toBe(403);
    expect((await call('/a/company/roles', { method: 'PUT', body: JSON.stringify({ roles: [] }) }, boss.cookie)).status).toBe(400); // Bea still has it
    expect((await call('/a/company/team/invite', { method: 'POST', body: JSON.stringify({ email: 'x@example.com', role: 'custom:nope' }) }, boss.cookie)).status).toBe(400);
  });
});

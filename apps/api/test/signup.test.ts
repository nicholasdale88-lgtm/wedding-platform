import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Signing up from the front page, and what each plan includes (the paywall). */
describe('sign-up and plans', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, cookie = '') => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  const form = { firstName: 'Alex', partnerName: 'Sam', email: 'alex@example.com', passcode: 'long-enough-1', date: '2027-03-14', plan: 'essentials', marketing: true, website: '' };
  const signup = (over: Partial<typeof form> = {}, ip = '1.1.1.1') => call('/a/signup', { method: 'POST', body: JSON.stringify({ ...form, ...over }), headers: { 'CF-Connecting-IP': ip } });

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', SUPER_ADMINS: 'owner@example.com' };
  });
  afterEach(() => t.dispose());

  it('makes the account and the wedding, signed in, on Free (whatever plan was picked: paying comes later)', async () => {
    const res = await signup();
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const body = (await res.json()) as { weddingId: string; weddings: { id: string; slug: string; role: string }[] };
    expect(body.weddings).toEqual([expect.objectContaining({ id: body.weddingId, slug: 'alex-and-sam', role: 'owner' })]);
    const w = (await t.db.prepare(`SELECT plan, name1, name2, monogram, content FROM wedding WHERE id = ?`).bind(body.weddingId).first<{ plan: string; name1: string; name2: string; monogram: string; content: string }>())!;
    expect(w).toMatchObject({ plan: 'free', name1: 'Alex', name2: 'Sam', monogram: 'A&S' });
    expect(JSON.parse(w.content)).toMatchObject({ planChosen: 'essentials' });
    const ev = (await t.db.prepare(`SELECT key, starts_at FROM event WHERE wedding_id = ?`).bind(body.weddingId).first<{ key: string; starts_at: string }>())!;
    expect(ev.key).toBe('wedding');
    expect(ev.starts_at.slice(0, 10)).toBe('2027-03-14');
    // Signed in: the admin overview says Free.
    const ov = (await (await call(`/a/w/${body.weddingId}/overview`, {}, cookie)).json()) as { wedding: { plan: string } };
    expect(ov.wedding.plan).toBe('free');
    // The same email again: sign in instead. The same names: a different address.
    expect((await signup({}, '2.2.2.2')).status).toBe(409);
    const again = (await (await signup({ email: 'other@example.com' }, '3.3.3.3')).json()) as { weddings: { slug: string }[] };
    expect(again.weddings[0]!.slug).toBe('alex-and-sam-2');
  });

  it('refuses a short passcode, says nothing useful to a bot, and limits sign-ups from one place', async () => {
    expect((await signup({ passcode: 'short' })).status).toBe(400);
    const bot = await signup({ website: 'http://spam.example', email: 'bot@example.com' });
    expect(bot.status).toBe(200);
    expect(await t.db.prepare(`SELECT 1 FROM user WHERE email = 'bot@example.com'`).first()).toBeNull();
    for (let i = 0; i < 5; i++) await signup({ email: `n${i}@example.com` }, '9.9.9.9');
    expect((await signup({ email: 'n9@example.com' }, '9.9.9.9')).status).toBe(429);
  });

  it('Free: up to 50 guests, no texts or seating; asking to upgrade is noted; the platform owner switches it on', async () => {
    const res = await signup();
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { weddingId: wid } = (await res.json()) as { weddingId: string };
    const a = (path: string, init: RequestInit = {}, ck = cookie) => call(`/a/w/${wid}${path}`, init, ck);
    // 50 guests fit; the 51st asks to upgrade.
    const rows = Array.from({ length: 50 }, (_, i) => ({ people: [`Guest ${i}`] }));
    expect((await a('/guests/import', { method: 'POST', body: JSON.stringify({ rows }) })).status).toBe(200);
    const more = await a('/guests', { method: 'POST', body: '{}' });
    expect(more.status).toBe(402);
    expect(((await more.json()) as { error: { code: string; feature: string } }).error).toMatchObject({ code: 'upgrade', feature: 'unlimitedGuests' });
    // Texts and seating: Essentials.
    const tx = (await (await a('/texts')).json()) as { campaigns: { id: string }[] };
    if (tx.campaigns[0]) expect((await a(`/texts/${tx.campaigns[0].id}/send`, { method: 'POST', body: '{}' })).status).toBe(402);
    expect((await a('/texts/test', { method: 'POST', body: JSON.stringify({ body: 'hi' }) })).status).toBe(402);
    const s = (await (await a('/seating')).json()) as { version: number; event: { key: string }; aspect: string };
    expect((await a('/seating', { method: 'PUT', headers: { 'If-Match': String(s.version) }, body: JSON.stringify({ event: s.event.key, aspect: s.aspect, tables: [], areas: [], seats: {} }) })).status).toBe(402);
    // Asking to upgrade.
    expect((await a('/plan/request', { method: 'POST', body: JSON.stringify({ plan: 'essentials' }) })).status).toBe(200);
    expect(((await (await a('/overview')).json()) as { wedding: { planRequested: string } }).wedding.planRequested).toBe('essentials');
    // Only the platform owner sets a plan.
    expect((await call('/a/super/plan', { method: 'PUT', body: JSON.stringify({ slug: 'alex-and-sam', plan: 'essentials' }) }, cookie)).status).toBe(403);
    const owner = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    const ownerCookie = (owner.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await call('/a/super/plan', { method: 'PUT', body: JSON.stringify({ slug: 'alex-and-sam', plan: 'essentials' }) }, ownerCookie)).status).toBe(200);
    expect((await a('/guests', { method: 'POST', body: '{}' })).status).toBe(201);
    expect((await a('/texts/test', { method: 'POST', body: JSON.stringify({ body: 'hi' }) })).status).not.toBe(402);
  });

  it("the platform's own wedding and weddings from before plans keep everything", async () => {
    const owner = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    const cookie = (owner.headers.get('set-cookie') ?? '').split(';')[0]!;
    const wid = ((await owner.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    const ov = (await (await call(`/a/w/${wid}/overview`, {}, cookie)).json()) as { wedding: { plan: string } };
    expect(ov.wedding.plan).toBe('complete');
  });
});

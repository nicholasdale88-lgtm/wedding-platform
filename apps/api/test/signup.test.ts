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

  it("a new wedding's invitation has every word, in neutral wording with [placeholders], and nothing from anyone else's wedding", async () => {
    const res = await signup({}, '4.4.4.4');
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { weddings } = (await res.json()) as { weddings: { slug: string }[] };
    const page = await call(`/p/${weddings[0]!.slug}/invite?preview=1`, {}, cookie);
    expect(page.status).toBe(200);
    const text = await page.text();
    const body = JSON.parse(text) as { texts: Record<string, string>; content: { hidden?: Record<string, boolean> } };
    expect(body.content.hidden?.['08 Accommodation']).toBe(true); // starts switched off
    expect(Object.keys(body.texts).length).toBeGreaterThan(200);
    expect(body.texts['inv.f3262251']).toBe('You are invited to celebrate the wedding of');
    expect(body.texts['inv.e257ef55']).toBe('[Ceremony venue]');
    // What they told us is filled in: the date they signed up with, and the start time (3pm until they change it).
    expect(body.texts['inv.5fb81f2d']).toBe('Sunday 14 March 2027');
    expect(body.texts['inv.8edf3058']).toBe('3:00pm');
    expect(body.texts['inv.6fcb1ea3']).toBe('2:30pm');
    expect(text).not.toMatch(/Glenworth|Gosford|Killcare|horse ride/i);
  });

  it('no date at sign-up: the invitation keeps [Day, date] until they set it, then shows it, with the venue and address', async () => {
    const res = await signup({ date: '', email: 'nodate@example.com' }, '5.5.5.5');
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { weddingId, weddings } = (await res.json()) as { weddingId: string; weddings: { slug: string }[] };
    const texts = async () => ((await (await call(`/p/${weddings[0]!.slug}/invite?preview=1`, {}, cookie)).json()) as { texts: Record<string, string> }).texts;
    expect((await texts())['inv.5fb81f2d']).toBe('[Day, date]');
    const ev = (await (await call(`/a/w/${weddingId}/events`, {}, cookie)).json()) as { events: { id: string; version: number }[] };
    const put = await call(`/a/w/${weddingId}/events/${ev.events[0]!.id}`, { method: 'PUT', headers: { 'If-Match': String(ev.events[0]!.version) }, body: JSON.stringify({ startsAt: '2027-04-10T05:00:00.000Z', venue: 'Bellbird Hill', address: '1 Bellbird Road, Yarra Glen VIC' }) }, cookie);
    expect(put.status).toBe(200);
    const t = await texts();
    expect(t['inv.5fb81f2d']).toBe('Saturday 10 April 2027');
    expect(t['inv.e257ef55']).toBe('Bellbird Hill');
    expect(t['inv.8297e5e4']).toBe('Address: 1 Bellbird Road, Yarra Glen VIC. ');
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

  it('a new wedding is private: its pages only open with a guest link or for the couple; switching it off opens them', async () => {
    const res = await signup();
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { weddingId: wid } = (await res.json()) as { weddingId: string };
    const page = (path: string, ck = '') => call(`/p/alex-and-sam${path}`, {}, ck);
    const shut = await page('/invite');
    expect(shut.status).toBe(404);
    expect(((await shut.json()) as { error: { code: string } }).error.code).toBe('private');
    expect((await page('/save-the-date')).status).toBe(404);
    expect((await page('/photos')).status).toBe(404);
    expect((await page('/calendar/wedding.ics')).status).toBe(404);
    expect((await page('/invite', cookie)).status).toBe(200); // the couple previewing
    // A guest with their own link.
    await call(`/a/w/${wid}/guests`, { method: 'POST', body: '{}' }, cookie);
    const tok = (await t.db.prepare(`SELECT token FROM invitation WHERE wedding_id = ?`).bind(wid).first<{ token: string }>())!.token;
    expect((await page(`/invite?g=${tok}`)).status).toBe(200);
    // Switched off: open to anyone with the address.
    expect((await call(`/a/w/${wid}/privacy`, { method: 'PUT', body: JSON.stringify({ private: false }) }, cookie)).status).toBe(200);
    expect((await page('/invite')).status).toBe(200);
    expect((await page('/calendar/wedding.ics')).status).toBe(200);
  });

  it('another event is an add-on: refused (402) until the platform owner grants it', async () => {
    const res = await signup({ email: 'events@example.com' }, '7.7.7.7');
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { weddingId: wid } = (await res.json()) as { weddingId: string };
    const add = () => call(`/a/w/${wid}/events`, { method: 'POST', body: JSON.stringify({ name: 'Recovery brunch', startsAt: '2027-03-15T00:00:00.000Z' }) }, cookie);
    const no = await add();
    expect(no.status).toBe(402);
    expect(((await no.json()) as { error: { feature: string } }).error.feature).toBe('extraEvent');
    expect((await call(`/a/w/${wid}/plan/request`, { method: 'POST', body: JSON.stringify({ plan: 'event' }) }, cookie)).status).toBe(200);
    const owner = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    const ownerCookie = (owner.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await call('/a/super/plan', { method: 'PUT', body: JSON.stringify({ slug: 'alex-and-sam', extraEvents: 1 }) }, ownerCookie)).status).toBe(200);
    expect((await add()).status).toBe(201);
    expect((await add()).status).toBe(402); // that was the one add-on
  });
});

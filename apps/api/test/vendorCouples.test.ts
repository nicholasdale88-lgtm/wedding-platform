import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { testD1 } from './support/d1';

/**
 * A vendor's couples: a couple who signs up through the vendor's link appears among the vendor's couples
 * (date and numbers, no guest names); they message each other in the app; the couple can stop sharing,
 * and then the vendor no longer sees them. Nobody else's wedding is reachable.
 */
describe("vendors' couples and messages", () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  let ip = 0;
  const call = (path: string, init: RequestInit = {}, cookie = '') =>
    app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `7.7.7.${++ip}`, ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]!;
  const json = async <T>(r: Response | Promise<Response>) => (await (await r).json()) as T;

  beforeEach(async () => {
    t = await testD1();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
  });
  afterEach(() => t.dispose());

  const joinVendor = async (name: string, email: string) => {
    const r = await call('/directory/join', {
      method: 'POST',
      body: JSON.stringify({ name, category: 'florist', region: 'sydney', regions: [], contactName: 'Jess Lee', phone: '', website: '', instagram: '', about: '', priceFrom: 0, photos: [], email, passcode: 'long-enough-1', company: '' }),
    });
    expect(r.status).toBe(200);
    return { cookie: cookieOf(r), slug: ((await r.json()) as { slug: string }).slug };
  };
  const signup = async (firstName: string, email: string, ref = '') => {
    const r = await call('/a/signup', { method: 'POST', body: JSON.stringify({ firstName, partnerName: 'Sam', email, passcode: 'long-enough-1', date: '2027-03-14', plan: 'free', marketing: false, website: '', ref }) });
    expect(r.status).toBe(200);
    return { cookie: cookieOf(r), wid: ((await r.json()) as { weddingId: string }).weddingId };
  };

  it('signing up through a vendor’s link: the vendor sees the couple, they message each other, and the couple can stop sharing', async () => {
    const vendor = await joinVendor('Wildflower Studio', 'jess@wildflower.example');
    const couple = await signup('Ava', 'ava@example.com', vendor.slug);
    await signup('Other', 'other@example.com'); // not through the link: never seen by this vendor

    type List = { couples: { id: string; couple: string; date: string; coming: number; invited: number; status: string; via: string; unread: number }[]; unread: number };
    let list = await json<List>(call('/a/vendor/couples', {}, vendor.cookie));
    expect(list.couples).toHaveLength(1);
    expect(list.couples[0]).toMatchObject({ id: couple.wid, couple: 'Ava & Sam', coming: 0, invited: 0, status: 'linked', via: 'Signed up through your link', unread: 0 });
    expect(list.couples[0]!.date).toMatch(/^2027-03-1[34]/);

    // Linked by their link only (not in the couple's planner yet): no details to show, just that they will come.
    expect(await json(call(`/a/vendor/couples/${couple.wid}/details`, {}, vendor.cookie))).toEqual({ couple: 'Ava & Sam', inPlanner: false, details: null });

    // The vendor writes; the couple sees it waiting, reads it and replies.
    expect((await call(`/a/vendor/couples/${couple.wid}/messages`, { method: 'POST', body: JSON.stringify({ body: 'Congratulations! Happy to help with your flowers.' }) }, vendor.cookie)).status).toBe(200);
    expect((await call(`/a/vendor/couples/${couple.wid}/messages`, { method: 'POST', body: JSON.stringify({ body: '   ' }) }, vendor.cookie)).status).toBe(400);
    const linked = await json<{ vendors: { id: string; name: string; unread: number; last: string }[] }>(call(`/a/w/${couple.wid}/vendor-chat`, {}, couple.cookie));
    expect(linked.vendors).toHaveLength(1);
    expect(linked.vendors[0]).toMatchObject({ name: 'Wildflower Studio', unread: 1, last: 'Congratulations! Happy to help with your flowers.' });
    const lid = linked.vendors[0]!.id;
    const th = await json<{ messages: { fromVendor: boolean; body: string }[] }>(call(`/a/w/${couple.wid}/vendor-chat/${lid}`, {}, couple.cookie));
    expect(th.messages.map((m) => m.fromVendor)).toEqual([true]);
    expect((await json<{ vendors: { unread: number }[] }>(call(`/a/w/${couple.wid}/vendor-chat`, {}, couple.cookie))).vendors[0]!.unread).toBe(0);
    await call(`/a/w/${couple.wid}/vendor-chat/${lid}`, { method: 'POST', body: JSON.stringify({ body: 'Thank you! Can we talk peonies?' }) }, couple.cookie);

    list = await json<List>(call('/a/vendor/couples', {}, vendor.cookie));
    expect(list.unread).toBe(1);
    const vt = await json<{ messages: { fromVendor: boolean; body: string }[] }>(call(`/a/vendor/couples/${couple.wid}/messages`, {}, vendor.cookie));
    expect(vt.messages.map((m) => m.body)).toEqual(['Congratulations! Happy to help with your flowers.', 'Thank you! Can we talk peonies?']);
    expect((await json<List>(call('/a/vendor/couples', {}, vendor.cookie))).unread).toBe(0);

    // Another vendor can't reach this couple, and a stranger can't reach the couple's side.
    const other = await joinVendor('Petal Co', 'pat@petal.example');
    expect((await call(`/a/vendor/couples/${couple.wid}/messages`, {}, other.cookie)).status).toBe(404);
    expect((await json<List>(call('/a/vendor/couples', {}, other.cookie))).couples).toEqual([]);
    expect((await call(`/a/w/${couple.wid}/vendor-chat`, {}, other.cookie)).status).toBe(404);

    // The couple stops sharing: the vendor no longer sees them, and can't write.
    expect((await call(`/a/w/${couple.wid}/vendor-chat/${lid}`, { method: 'DELETE' }, couple.cookie)).status).toBe(200);
    expect((await json<List>(call('/a/vendor/couples', {}, vendor.cookie))).couples).toEqual([]);
    expect((await call(`/a/vendor/couples/${couple.wid}/messages`, { method: 'POST', body: JSON.stringify({ body: 'Hello?' }) }, vendor.cookie)).status).toBe(404);
    expect((await json<{ vendors: unknown[] }>(call(`/a/w/${couple.wid}/vendor-chat`, {}, couple.cookie))).vendors).toEqual([]);
  });

  it('a couple’s own vendor (by email) who joins later finds the couple and their quote request waiting; a couple can invite a vendor', async () => {
    const couple = await signup('Ava', 'ava@example.com');
    // The couple has a florist by email, and a quote request out to them, before the florist ever joins.
    const doc = { list: [{ id: 'v1', name: 'Bloom Co', category: 'Florist', email: 'Hello@Bloom.example', status: 'requested' }, { id: 'v2', name: 'Snap', category: 'Photographer', email: 'snap@photo.example' }], rfqs: [{ id: 'r1', title: 'Flowers', vendors: [{ vendorId: 'v1', key: 'k'.repeat(24), sentOn: '2026-11-01' }] }] };
    await t.db.prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?, 'vendors', '', ?, 1, ?)`).bind(couple.wid, JSON.stringify(doc), new Date().toISOString()).run();
    const vendor = await joinVendor('Bloom Co', 'hello@bloom.example');
    const list = await json<{ couples: { id: string; via: string; quotes: { title: string; answered: boolean; link: string }[] }[]; quotesOpen: number }>(call('/a/vendor/couples', {}, vendor.cookie));
    expect(list.couples.map((c) => c.id)).toEqual([couple.wid]);
    expect(list.quotesOpen).toBe(1);
    expect(list.couples[0]!.quotes[0]).toMatchObject({ title: 'Flowers', answered: false });
    expect(list.couples[0]!.quotes[0]!.link).toMatch(/\/quote\?k=k{24}$/);

    // In the couple's planner: their day, numbers and dietary needs, in the vendor's portal, with the live files.
    type Det = { inPlanner: boolean; details: { vendor: { name: string }; guests: { coming: number } | null; dietary: unknown[]; files: { dietary: string; day: string } } };
    const det = await json<Det>(call(`/a/vendor/couples/${couple.wid}/details`, {}, vendor.cookie));
    expect(det.inPlanner).toBe(true);
    expect(det.details.vendor.name).toBe('Bloom Co');
    expect(det.details.dietary).toEqual([]);
    expect(det.details.files.dietary).toMatch(/\/api\/p\/[^/]+\/vendor\/v1\/[^/]{24}\/dietary\.csv$/);
    // Another vendor can't read them.
    const stranger = await joinVendor('Petal Co', 'pat@petal.example');
    expect((await call(`/a/vendor/couples/${couple.wid}/details`, {}, stranger.cookie)).status).toBe(404);

    // The couple invites their photographer: not listed, and email is off here, so nothing is sent yet.
    expect(await json(call(`/a/w/${couple.wid}/vendor-chat/invite/vendor`, { method: 'POST', body: JSON.stringify({ vendorId: 'v2' }) }, couple.cookie))).toEqual({ linked: false, sent: false });
    // Once the photographer has joined, inviting links them straight away.
    const snap = await joinVendor('Snap', 'snap@photo.example');
    expect((await json<{ couples: unknown[] }>(call('/a/vendor/couples', {}, snap.cookie))).couples).toHaveLength(1); // linked on joining, by email
    expect(await json(call(`/a/w/${couple.wid}/vendor-chat/invite/vendor`, { method: 'POST', body: JSON.stringify({ vendorId: 'v2' }) }, couple.cookie))).toEqual({ linked: true, sent: false });
    expect((await call(`/a/w/${couple.wid}/vendor-chat/invite/vendor`, { method: 'POST', body: JSON.stringify({ vendorId: 'nope' }) }, couple.cookie)).status).toBe(404);
  });

  it('inviting a couple by email says so when email is switched off', async () => {
    const vendor = await joinVendor('Wildflower Studio', 'jess@wildflower.example');
    expect(await json(call('/a/vendor/couples/invite', { method: 'POST', body: JSON.stringify({ name: 'Mia', email: 'mia@example.com' }) }, vendor.cookie))).toEqual({ sent: false });
    expect((await call('/a/vendor/couples/invite', { method: 'POST', body: JSON.stringify({ email: 'not-an-email' }) }, vendor.cookie)).status).toBe(400);
  });
});

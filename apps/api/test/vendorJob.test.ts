import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/**
 * The vendor job: a quote with virtual samples, video tasting times and the vendor's own payment or booking link
 * (made safe; we never handle money); a vendor saving the wedding to their dashboard (their Quotes area); and the
 * on-the-day pass (every event, access, check-in and running late).
 */
describe('vendor quotes, samples, tastings, dashboard and the on-the-day pass', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}/planner${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  let n = 0;
  const pub = (path: string, init: RequestInit = {}, extra: Record<string, string> = {}) =>
    app.request(`/api/p/sophie-and-nicholas/rfq${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `10.8.0.${++n}`, ...extra, ...init.headers } }, env, ctx);
  const key = 'k'.repeat(12) + 'Cake_Studio-01';
  // The smallest real JPEG start (enough for the type check) and a PNG one.
  const jpeg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9));
  type Q = { id: string; amount: number; payLink?: string; samples?: { photos: string[]; spin: string[]; videos: { url: string }[]; box: string }; tastings?: { id: string; at: string; bookedOn: string; link: string }[] };
  type Doc = { version: number; data: { list: { id: string; status: string; dirId: string; quotes: Q[]; day?: { state: string; mins: number }; log?: { text: string }[]; access?: string }[] } };
  const doc = async () => (await (await call('/doc/vendors')).json()) as Doc;

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
    const list = [{ id: 'cake', name: 'Cake Studio', category: 'Cake', email: 'hello@cake.example' }];
    const rfq = { id: 'r1', title: 'Wedding cake', service: '', lines: [{ id: 'l1', label: 'Three-tier cake' }], vendors: [{ vendorId: 'cake', key }] };
    expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ list, rfqs: [rfq] }) })).status).toBe(200);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('a quote carries samples, tasting times and a safe pay-or-book link; a booked tasting stays booked when the vendor edits', async () => {
    // Sample photos: real images only, kept with this link, served back by id.
    const up = await pub('/media', { method: 'POST', body: JSON.stringify({ k: key, type: 'image/jpeg', data: jpeg }) });
    expect(up.status).toBe(200);
    const { id: photo } = (await up.json()) as { id: string };
    expect((await pub('/media', { method: 'POST', body: JSON.stringify({ k: key, type: 'image/png', data: jpeg }) })).status).toBe(400);
    expect((await pub('/media', { method: 'POST', body: JSON.stringify({ k: 'z'.repeat(24), type: 'image/jpeg', data: jpeg }) })).status).toBe(404);
    const img = await pub(`/media/${photo}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(img.headers.get('cache-control')).toMatch(/private/);

    // A javascript: or non-web pay link is refused; a bare address is opened over https.
    const answer = (over: Record<string, unknown>) => pub('', { method: 'POST', body: JSON.stringify({ k: key, lines: [{ id: 'l1', amount: 900 }], ...over }) });
    expect((await answer({ payLink: 'javascript:alert(1)' })).status).toBe(400);
    const ok = await answer({
      payLink: 'http://pay.cake.example/book',
      samples: { photos: [photo, 'not-mine'], spin: [], videos: [{ url: 'videos.example/cake', label: 'Cutting it' }, { url: 'javascript:x', label: '' }], box: 'Four flavours posted free.' },
      tastings: [{ at: '2099-03-01T18:00', mins: 30, link: 'call.example/cake' }],
    });
    expect(ok.status).toBe(200);
    let q = (await doc()).data.list[0]!.quotes[0]!;
    expect(q.payLink).toBe('https://pay.cake.example/book');
    expect(q.samples).toEqual({ photos: [photo], spin: [], videos: [{ url: 'https://videos.example/cake', label: 'Cutting it' }], box: 'Four flavours posted free.' });
    expect(q.tastings).toHaveLength(1);
    expect(q.tastings![0]).toMatchObject({ at: '2099-03-01T18:00', link: 'https://call.example/cake', bookedOn: '' });

    // The couple book it (their planner saves the quote); the vendor then changes their price: still booked.
    const d = await doc();
    const booked = { ...d.data.list[0]!, quotes: [{ ...q, tastings: [{ ...q.tastings![0]!, bookedOn: '2099-02-01' }] }] };
    expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': String(d.version) }, body: JSON.stringify({ ...d.data, list: [booked] }) })).status).toBe(200);
    const slotId = q.tastings![0]!.id;
    expect((await answer({ lines: [{ id: 'l1', amount: 850 }], tastings: [{ id: slotId, at: '2099-03-01T18:00', mins: 30, link: '' }] })).status).toBe(200);
    q = (await doc()).data.list[0]!.quotes[0]!;
    expect(q.amount).toBe(850);
    expect(q.tastings![0]!.bookedOn).toBe('2099-02-01');
    // The vendor's page shows it booked.
    const page = (await (await pub(`?k=${key}`)).json()) as { answer: { tastings: { bookedOn: string }[]; payLink: string }; account: unknown };
    expect(page.answer.tastings[0]!.bookedOn).toBe('2099-02-01');
    expect(page.account).toBeNull(); // not signed in to a vendor account here
  });

  it('a signed-in vendor saves the wedding to their dashboard: it shows in their Quotes with what they quoted', async () => {
    const join = await app.request(
      '/api/directory/join',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '7.7.7.7' },
        body: JSON.stringify({ name: 'Cake Studio', category: 'florist', region: 'sydney', regions: ['blue-mountains'], contactName: 'Ana Lee', phone: '0400 000 111', website: 'https://cake.example', instagram: '@cake', about: 'Cakes and flowers, made locally.', priceFrom: 600, photos: ['https://cake.example/a.jpg'], email: 'other@cake.example', passcode: 'long-enough-1', company: '' }),
      },
      env,
      ctx,
    );
    expect(join.status).toBe(200);
    const vendor = (join.headers.get('set-cookie') ?? '').split(';')[0]!;
    // Signed out: can't save.
    expect((await pub('/save', { method: 'POST', body: JSON.stringify({ k: key }) })).status).toBe(401);
    const before = (await (await pub(`?k=${key}`, {}, { cookie: vendor })).json()) as { account: { saved: boolean } };
    expect(before.account).toMatchObject({ saved: false });
    expect((await pub('/save', { method: 'POST', body: JSON.stringify({ k: key }) }, { cookie: vendor })).status).toBe(200);
    expect(((await (await pub(`?k=${key}`, {}, { cookie: vendor })).json()) as { account: { saved: boolean } }).account.saved).toBe(true);
    // The couple's entry now points at their listing, so their Quotes area finds it.
    expect((await doc()).data.list[0]!.dirId).toMatch(/^v:/);
    await pub('', { method: 'POST', body: JSON.stringify({ k: key, lines: [{ id: 'l1', amount: 700 }] }) });
    const mine = (await (await app.request('/api/a/vendor/couples', { headers: { cookie: vendor } }, env, ctx)).json()) as { couples: { quotes: { title: string; answered: boolean; amount: number; closed: boolean }[] }[]; quotesOpen: number };
    expect(mine.couples).toHaveLength(1);
    expect(mine.couples[0]!.quotes[0]).toMatchObject({ title: 'Wedding cake', answered: true, amount: 700, closed: false });
    expect(mine.quotesOpen).toBe(0);
  });

  it('the on-the-day pass: every event, how to get in, check in and running late (shown to the couple, logged)', async () => {
    const d = await doc();
    const v = { ...d.data.list[0]!, status: 'booked', arrival: '1:00pm', access: 'Loading dock off Vine Lane, gate code 2468' };
    expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': String(d.version) }, body: JSON.stringify({ ...d.data, list: [v] }) })).status).toBe(200);
    const u = new URL(((await (await call('/vendors/cake/hub')).json()) as { url: string }).url);
    const api = `/api/p/sophie-and-nicholas/vendor/${u.searchParams.get('v')}/${u.searchParams.get('k')}`;
    const page = (await (await app.request(api, {}, env, ctx)).json()) as { events: { name: string; timeline: unknown[] }[]; access: string; day: unknown };
    expect(page.events.length).toBeGreaterThanOrEqual(1);
    expect(page.access).toBe('Loading dock off Vine Lane, gate code 2468');
    expect(page.day).toBeNull();
    const post = (body: unknown) => app.request(`${api}/status`, { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `10.7.0.${++n}` }, body: JSON.stringify(body) }, env, ctx);
    expect((await post({ state: 'late', mins: 20 })).status).toBe(200);
    let mine = (await doc()).data.list[0]!;
    expect(mine.day).toMatchObject({ state: 'late', mins: 20 });
    expect(mine.log?.[0]?.text).toMatch(/Running about 20 min late/);
    expect((await post({ state: 'here' })).status).toBe(200);
    mine = (await doc()).data.list[0]!;
    expect(mine.day).toMatchObject({ state: 'here', mins: 0 });
    expect((await post({ state: 'clear' })).status).toBe(200);
    expect((await doc()).data.list[0]!.day).toBeUndefined();
    expect((await post({ state: 'gone' })).status).toBe(400);
    expect((await app.request(`${api.replace(/[^/]+$/, 'x'.repeat(24))}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: 'here' }) }, env, ctx)).status).toBe(404);
  });
});

describe('after a change has saved', () => {
  it('a busy moment is tried again, so the page never re-sends a change that already saved; other errors still fail', async () => {
    const { afterCommit } = await import('../src/lib/security');
    let n = 0;
    expect(
      await afterCommit(async () => {
        if (++n < 3) throw new Error('D1_ERROR: database is locked: SQLITE_BUSY');
        return 'read';
      }),
    ).toBe('read');
    expect(n).toBe(3);
    await expect(afterCommit(async () => Promise.reject(new Error('no such table')))).rejects.toThrow('no such table');
    await expect(afterCommit(async () => Promise.reject(new Error('SQLITE_BUSY')), 2)).rejects.toThrow('SQLITE_BUSY');
  });
});

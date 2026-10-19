import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** The wedding party: roles on guests, the party's own run sheet, and what each member sees. */
describe('planner: wedding party', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}/planner${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const personOf = async (name: string) =>
    (await t.db.prepare(`SELECT p.id, i.token FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE p.name = ?`).bind(name).first<{ id: string; token: string }>())!;
  const page = (token: string) => app.request(`/api/p/sophie-and-nicholas/party?g=${token}`, {}, env, ctx);

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
  });
  afterEach(() => t.dispose());

  it('members get roles; each sees only their items, for their events; others are told the page is for the party', async () => {
    const ella = await personOf('Ella Thompson');
    const ann = await personOf('Margaret Bloor');
    expect((await page(ella.token)).status).toBe(404); // not in the party yet
    expect((await call(`/people/${ella.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Bridesmaid' }) })).status).toBe(200);
    await call(`/people/${ann.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'MC' }) });

    const items = [
      { time: '8:00am', title: 'Breakfast', who: ['party'] },
      { time: '9:00am', title: 'Hair and makeup', who: ['p1'] },
      { time: '7:30pm', title: 'Run the speeches', who: ['MC'] },
    ];
    const save = await call('/doc/party-runsheet/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ items, note: 'Be early!' }) });
    expect(save.status).toBe(200);
    expect(((await save.json()) as { version: number }).version).toBe(1);

    const bridesmaid = (await (await page(ella.token)).json()) as { me: { role: string }[]; events: { key: string; items: { title: string }[]; note: string }[] };
    expect(bridesmaid.me[0]!.role).toBe('Bridesmaid');
    expect(bridesmaid.events.find((e) => e.key === 'wedding')!.items.map((i) => i.title)).toEqual(['Breakfast', 'Hair and makeup']);
    const mc = (await (await page(ann.token)).json()) as { events: { key: string; items: { title: string }[] }[]; party: { name: string; role: string }[] };
    expect(mc.events.find((e) => e.key === 'wedding')!.items.map((i) => i.title)).toEqual(['Breakfast', 'Run the speeches']);
    expect(mc.party.map((p) => p.role).sort()).toEqual(['Bridesmaid', 'MC']);
    expect(JSON.stringify(mc)).not.toMatch(/token|phone/); // names and roles only
  });

  it('finds vendors near the venue, nearest first, named ones only, and keeps a budget', async () => {
    let query = '';
    vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
      query = decodeURIComponent(String(init?.body ?? '').replace(/^data=/, ''));
      return new Response(
        JSON.stringify({
          elements: [
            { type: 'node', id: 1, lat: -33.5, lon: 151.3, tags: { name: 'Far Flowers', phone: '02 1111 1111' } },
            { type: 'node', id: 2, lat: -33.38, lon: 151.2, tags: { name: 'Valley Blooms', 'addr:street': 'Main Rd', 'addr:suburb': 'Somersby' } },
            { type: 'way', id: 3, center: { lat: -33.4, lon: 151.2 }, tags: {} }, // no name: skipped
          ],
        }),
        { status: 200 },
      );
    });
    try {
      const r = (await (await call('/vendors/search?category=florist&km=30')).json()) as { results: { name: string; km: number; address: string }[] };
      expect(query).toContain('["shop"="florist"](around:30000,-33.37,151.19)');
      expect(r.results.map((x) => x.name)).toEqual(['Valley Blooms', 'Far Flowers']);
      expect(r.results[0]).toMatchObject({ address: 'Main Rd, Somersby' });
      expect(r.results[0]!.km).toBeLessThan(r.results[1]!.km);
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await call('/vendors/search?category=nonsense')).status).toBe(400);
    const budget = await call('/doc/budget', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ total: 40000, lines: [{ category: 'Cake', estimate: 800, paid: 200, due: '2027-10-01' }] }) });
    expect(((await budget.json()) as { data: { lines: { quote: number }[] } }).data.lines[0]!.quote).toBe(0); // defaults filled in
  });

  it('a stale save is refused with the current version (two people never overwrite each other)', async () => {
    await call('/doc/day-checklist/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ p1: [{ text: 'Breakfast' }], p2: [] }) });
    const stale = await call('/doc/day-checklist/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ p1: [], p2: [] }) });
    expect(stale.status).toBe(409);
    const ok = await call('/doc/day-checklist/wedding', { method: 'PUT', headers: { 'If-Match': '1' }, body: JSON.stringify({ p1: [{ text: 'Breakfast', done: true }], p2: [] }) });
    expect(((await ok.json()) as { data: { p1: { done: boolean }[] }; version: number })).toMatchObject({ version: 2, data: { p1: [{ done: true }] } });
    expect((await call('/doc/nonsense/wedding', { method: 'PUT', body: '{}' })).status).toBe(404);
    expect((await call('/doc/party-runsheet/no-such-event', { method: 'PUT', body: '{}' })).status).toBe(404);
  });
});

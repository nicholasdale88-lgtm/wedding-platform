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
    const save = await call('/doc/party-runsheet/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ items, note: 'Be early!', packing: [{ text: 'The rings', who: ['Best man'] }, { text: 'Charger', who: ['party'] }, { text: 'Dress', who: ['p1'] }] }) });
    await call('/doc/party-setup', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ p1: 'Bride', p2: 'Groom' }) });
    expect(save.status).toBe(200);
    expect(((await save.json()) as { version: number }).version).toBe(1);

    const bridesmaid = (await (await page(ella.token)).json()) as { me: { role: string }[]; sides: { p1: string }; events: { key: string; items: { title: string }[]; packing: { text: string }[]; note: string }[] };
    expect(bridesmaid.me[0]!.role).toBe('Bridesmaid');
    expect(bridesmaid.sides.p1).toBe('Bride');
    expect(bridesmaid.events.find((e) => e.key === 'wedding')!.items.map((i) => i.title)).toEqual(['Breakfast', 'Hair and makeup']);
    expect(bridesmaid.events.find((e) => e.key === 'wedding')!.packing.map((p) => p.text)).toEqual(['Charger', 'Dress']); // not the best man's rings
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

  it("the assistant answers from the wedding's own facts, and says when it is off", async () => {
    expect(((await (await call('/ask', { method: 'POST', body: JSON.stringify({ question: 'What next?' }) })).json()) as { error: { code: string } }).error.code).toBe('off');
    const seen: { input?: { messages: { role: string; content: string }[] } } = {};
    env.AI = {
      run: async (_m: string, input: unknown) => {
        seen.input = input as typeof seen.input;
        return { response: 'Book your celebrant and lodge the NOI.' };
      },
    };
    const r = (await (await call('/ask', { method: 'POST', body: JSON.stringify({ question: 'What next?' }) })).json()) as { answer: string };
    expect(r.answer).toBe('Book your celebrant and lodge the NOI.');
    const system = seen.input!.messages[0]!.content;
    expect(system).toMatch(/invitations, \d+ replied yes/); // real numbers from this wedding
    expect(seen.input!.messages.at(-1)).toEqual({ role: 'user', content: 'What next?' });
  });

  it('files a quote (members only), reads it with the assistant, and compares vendors', async () => {
    const pdf = btoa('%PDF-1.4 quote for flowers, total $2,400, deposit $500');
    // Not what it says it is: refused.
    expect((await call('/files', { method: 'POST', body: JSON.stringify({ name: 'q.pdf', type: 'application/pdf', data: btoa('<html>') }) })).status).toBe(400);
    const up = (await (await call('/files', { method: 'POST', body: JSON.stringify({ name: 'Bloom quote.pdf', type: 'application/pdf', data: pdf }) })).json()) as { id: string };
    const file = await call(`/files/${up.id}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(await file.text()).toContain('total $2,400');
    expect((await app.request(`/api/a/w/${wid}/planner/files/${up.id}`, {}, env, ctx)).status).toBe(401); // signed out

    env.AI = {
      run: async (_m: string, input: unknown) => {
        const sys = (input as { messages: { content: string }[] }).messages[0]!.content;
        return sys.startsWith('You read wedding vendor quotes')
          ? { response: 'Here you go: {"amount": "$2,400", "deposit": 500, "validUntil": "2027-03-01", "includes": "Bouquets, arch", "excludes": "Delivery", "summary": "Flowers."}' }
          : { response: 'Bloom is better value once delivery is added.' };
      },
      toMarkdown: async () => [{ name: 'Bloom quote.pdf', data: 'Quote: flowers. Total $2,400. Deposit $500. Valid until 1 March 2027.' }],
    };
    const read = (await (await call(`/files/${up.id}/read`, { method: 'POST', body: '{}' })).json()) as { amount: number; deposit: number; validUntil: string; excludes: string };
    expect(read).toMatchObject({ amount: 2400, deposit: 500, validUntil: '2027-03-01', excludes: 'Delivery' });

    const vendors = {
      list: [
        { id: 'v1', name: 'Bloom', category: 'Florist', quotes: [{ id: 'q1', amount: 2400, deposit: 500, includes: 'Bouquets', fileId: up.id }] },
        { id: 'v2', name: 'Petal Co', category: 'Florist', quotes: [{ id: 'q2', amount: 2100 }] },
      ],
    };
    expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify(vendors) })).status).toBe(200);
    const cmp = (await (await call('/compare', { method: 'POST', body: JSON.stringify({ vendorIds: ['v1', 'v2'] }) })).json()) as { answer: string };
    expect(cmp.answer).toContain('better value');
    expect((await call('/compare', { method: 'POST', body: JSON.stringify({ vendorIds: ['v1'] }) })).status).toBe(400);
  });

  it('overdue planning tasks and payments due show in Overview → Needs you, opening the planner', async () => {
    await call('/doc/checklist', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ tasks: [{ id: 't1', text: 'Lodge the NOI', before: 800, legal: true }] }) });
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await call('/doc/budget', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ total: 30000, lines: [{ category: 'Cake', item: 'Cake', quote: 900, paid: 200, due: soon }] }) });
    const ov = (await (await app.request(`/api/a/w/${wid}/overview`, { headers: { cookie } }, env, ctx)).json()) as { needsYou: { kind: string; title: string; detail: string; link: string }[] };
    expect(ov.needsYou.find((n) => n.kind === 'plan-overdue')).toMatchObject({ title: 'Overdue: Lodge the NOI', link: 'planner?view=checklist' });
    expect(ov.needsYou.find((n) => n.kind === 'payments-due')).toMatchObject({ detail: 'Cake $700', link: 'planner?view=budget' });
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

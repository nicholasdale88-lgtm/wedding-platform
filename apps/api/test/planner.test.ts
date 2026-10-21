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

  it('someone added straight into the wedding party joins the guest list, and a role set on a guest puts them in the party', async () => {
    const guestsApi = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
    const res = await call('/people', { method: 'POST', body: JSON.stringify({ name: 'Riley Groomsman', mobile: '0412 345 678', role: 'Groomsman' }) });
    expect(res.status).toBe(201);
    const { personId, members } = (await res.json()) as { personId: string; members: { personId: string; role: string; side: string }[] };
    expect(members.find((m) => m.personId === personId)).toMatchObject({ role: 'Groomsman', side: 'p2' });
    // On the guest list: their own invitation, in the Wedding party group, invited to the wedding only, with their mobile.
    const list = (await (await guestsApi('/guests')).json()) as { guests: { id: string; party: string; phone: string | null; invited: string[]; people: { id: string; name: string; role?: string }[] }[] };
    const g = list.guests.find((x) => x.people.some((p) => p.id === personId))!;
    expect(g).toMatchObject({ party: 'Wedding party', phone: '+61412345678' });
    expect(g.invited).toHaveLength(1);
    expect(g.people[0]).toMatchObject({ name: 'Riley Groomsman', role: 'Groomsman' });
    // The other way: a role on a guest puts them in the party; taking it away takes them out.
    const other = list.guests.find((x) => x.id !== g.id && x.people[0] && !x.people[0].role)!.people[0]!;
    expect(((await (await call(`/people/${other.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Bridesmaid' }) })).json()) as { members: { personId: string }[] }).members.some((m) => m.personId === other.id)).toBe(true);
    const after = (await (await guestsApi('/guests')).json()) as { guests: { people: { id: string; role?: string }[] }[] };
    expect(after.guests.flatMap((x) => x.people).find((p) => p.id === other.id)?.role).toBe('Bridesmaid');
    // Checks: a name and role are needed, and the mobile must be Australian.
    expect((await call('/people', { method: 'POST', body: JSON.stringify({ name: '', role: 'MC' }) })).status).toBe(400);
    expect((await call('/people', { method: 'POST', body: JSON.stringify({ name: 'Sam', mobile: '12', role: 'MC' }) })).status).toBe(400);
  });

  it('a party member subscribes to their own calendar: their jobs with a reminder, and their moments on the day', async () => {
    const ella = await personOf('Ella Thompson');
    await call(`/people/${ella.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Bridesmaid' }) });
    await call('/doc/party-runsheet/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ items: [{ time: '9:00am', title: 'Hair and makeup', who: ['p1'] }, { time: '7:30pm', title: 'Speeches', who: ['MC'] }] }) });
    await call('/doc/party-p1', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ tasks: [{ id: 'j1', text: 'Pick up the dresses', person: ella.id, due: '2027-11-10' }, { id: 'j2', text: 'Someone else', person: 'nobody', due: '2027-11-11' }] }) });
    const me = (await (await page(ella.token)).json()) as { mine: { calendar: string }[] };
    const url = new URL(me.mine[0]!.calendar);
    const res = await app.request(url.pathname, {}, env, ctx);
    expect(res.status).toBe(200);
    const ics = await res.text();
    expect(ics).toContain('SUMMARY:Pick up the dresses');
    expect(ics).toContain('DTSTART;VALUE=DATE:20271110');
    expect(ics).toContain('TRIGGER:-PT15H');
    expect(ics).toContain('SUMMARY:Hair and makeup');
    expect(ics).not.toContain('Someone else');
    expect(ics).not.toContain('Speeches'); // the MC's, not hers
    expect((await app.request(url.pathname.replace(/\/[^/]+\.ics$/, '/wrongwrongwrongwrongwron.ics'), {}, env, ctx)).status).toBe(404);
  });

  it('party members tick and add their own to-dos and packing (saved with their side); a paused member is turned away', async () => {
    const ella = await personOf('Ella Thompson');
    await call(`/people/${ella.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Bridesmaid' }) });
    await call('/doc/party-p1', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ tasks: [{ id: 't1', text: 'Order dresses', person: '', due: '', done: false }, { id: 't2', text: 'Not hers', person: 'someone-else', due: '', done: false }] }) });
    const act = (body: object) => app.request('/api/p/sophie-and-nicholas/party', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: ella.token, personId: ella.id, ...body }) }, env, ctx);
    type Mine = { mine: { tasks: { id: string; text: string; done: boolean; mine: boolean }[]; packed: string[]; pack: { text: string }[] }[] };
    const first = (await (await page(ella.token)).json()) as Mine;
    expect(first.mine[0]!.tasks.map((t) => t.id)).toEqual(['t1']); // the side's, not someone else's
    expect((await act({ action: 'task', id: 't1', done: true })).status).toBe(200);
    expect((await act({ action: 'task', id: 't2', done: true })).status).toBe(404);
    expect((await act({ action: 'add-task', text: 'Book my spray tan' })).status).toBe(200);
    expect((await act({ action: 'packed', text: 'Charger', done: true })).status).toBe(200);
    expect((await act({ action: 'add-pack', text: 'Hair ties' })).status).toBe(200);
    const after = ((await (await page(ella.token)).json()) as Mine).mine[0]!;
    expect(after.tasks.find((t) => t.id === 't1')!.done).toBe(true);
    expect(after.tasks.find((t) => t.text === 'Book my spray tan')!.mine).toBe(true);
    expect(after.packed).toEqual(['Charger']);
    expect(after.pack.map((p) => p.text)).toEqual(['Hair ties']);
    // The couple sees it on the side's page.
    const side = (await (await call('/doc/party-p1')).json()) as { data: { tasks: { text: string; person: string }[] } };
    expect(side.data.tasks.find((t) => t.text === 'Book my spray tan')!.person).toBe(ella.id);
    // Paused in Setup → Wedding party access.
    await call('/doc/party-setup', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ access: { [ella.id]: false } }) });
    expect((await page(ella.token)).status).toBe(403);
    expect((await act({ action: 'task', id: 't1', done: false })).status).toBe(403);
  });

  it("who's who shows on guests' invitations only once switched on, by role, names and roles only", async () => {
    const ella = await personOf('Ella Thompson');
    const ann = await personOf('Margaret Bloor');
    await call(`/people/${ella.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Bridesmaid' }) });
    await call(`/people/${ann.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Maid of honour' }) });
    const invite = async (tok: string) => (await (await app.request(`/api/p/sophie-and-nicholas/invite?g=${tok}`, {}, env, ctx)).json()) as { party: { sides: { p1: string }; people: { name: string; role: string; side: string }[] } | null };
    expect((await invite(ella.token)).party).toBeNull(); // off by default
    await call('/doc/party-setup', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ p1: 'Bride', p2: 'Groom', showOnInvite: true }) });
    const p = (await invite(ella.token)).party!;
    expect(p.sides.p1).toBe('Bride');
    expect(p.people.map((x) => x.role)).toEqual(['Maid of honour', 'Bridesmaid']); // role order, not alphabetical
    expect(p.people.every((x) => x.side === 'p1')).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/token|phone|diet/);
    const anon = (await (await app.request('/api/p/sophie-and-nicholas/invite', {}, env, ctx)).json()) as { party?: unknown };
    expect(anon.party ?? null).toBeNull(); // the public page doesn't list the party
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
      expect(query).toContain('["shop"="florist"](around:50000,-33.37,151.19)'); // the area is filled out to 50 km once
      expect(r.results.map((x) => x.name)).toEqual(['Valley Blooms', 'Far Flowers']);
      expect(r.results[0]).toMatchObject({ address: 'Main Rd, Somersby' });
      expect(r.results[0]!.km).toBeLessThan(r.results[1]!.km);
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await call('/vendors/search?category=nonsense')).status).toBe(400);

    // The directory keeps the area: the next search doesn't ask the map, and still works when the map is down.
    let asked = 0;
    vi.stubGlobal('fetch', async () => {
      asked++;
      return new Response('down', { status: 503 });
    });
    try {
      const again = (await (await call('/vendors/search?category=florist&km=30')).json()) as { results: { id: string; name: string; booked: number }[]; price: unknown };
      expect(asked).toBe(0);
      expect(again.results.map((x) => x.name)).toEqual(['Valley Blooms', 'Far Flowers']);
      expect(again.price).toBeNull();
      // A couple books one: the directory counts it (and its price), and lists it first.
      const valley = again.results.find((x) => x.name === 'Valley Blooms')!;
      const far = again.results.find((x) => x.name === 'Far Flowers')!;
      const list = [
        { id: 'v1', name: 'Far Flowers', category: 'Florist', status: 'booked', quote: 2800, dirId: far.id },
        { id: 'v2', name: 'Valley Blooms', category: 'Florist', status: 'quoted', dirId: valley.id },
      ];
      expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ list }) })).status).toBe(200);
      const after = (await (await call('/vendors/search?category=florist&km=30')).json()) as { results: { name: string; booked: number; added: number }[]; price: unknown };
      expect(after.results[0]).toMatchObject({ name: 'Far Flowers', booked: 1, added: 1 });
      expect(after.results[1]).toMatchObject({ name: 'Valley Blooms', booked: 0, added: 1 });
      expect(after.price).toBeNull(); // one wedding's price is never shown
      // Other weddings nearby booked florists: two aren't enough (with this couple's own, it would give theirs away).
      await t.db.prepare(`INSERT INTO vendor_use (wedding_id, dir_id, booked, amount, updated_at) VALUES ('w-x', ?, 1, 2000, '2027-01-01'), ('w-y', ?, 1, 3600, '2027-01-01')`).bind(far.id, valley.id).run();
      expect(((await (await call('/vendors/search?category=florist&km=30')).json()) as { price: unknown }).price).toBeNull();
      // Three other weddings: now a range shows (never which wedding, and never this couple's own price).
      await t.db.prepare(`INSERT INTO vendor_use (wedding_id, dir_id, booked, amount, updated_at) VALUES ('w-z', ?, 1, 3000, '2027-01-01')`).bind(far.id).run();
      const priced = (await (await call('/vendors/search?category=florist&km=30')).json()) as { price: { low: number; typical: number; high: number; weddings: number } };
      expect(priced.price).toEqual({ low: 2000, typical: 3000, high: 3600, weddings: 3 });
      expect(JSON.stringify(priced)).not.toContain('w-x');
      // A booked vendor of their own (not from the directory) joins it for the couples after them.
      const own = [...list, { id: 'v3', name: 'Hill Top Celebrants', category: 'Celebrant', status: 'booked', phone: '0400 000 000' }];
      await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': '1' }, body: JSON.stringify({ list: own }) });
      const cel = (await (await call('/vendors/search?category=celebrant&km=30')).json()) as { results: { name: string; booked: number }[] };
      expect(cel.results).toEqual([expect.objectContaining({ name: 'Hill Top Celebrants', booked: 1 })]);
    } finally {
      vi.unstubAllGlobals();
    }
    const budget = await call('/doc/budget', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ total: 40000, lines: [{ category: 'Cake', estimate: 800, paid: 200, due: '2027-10-01' }] }) });
    expect(((await budget.json()) as { data: { lines: { quote: number }[] } }).data.lines[0]!.quote).toBe(0); // defaults filled in
  });

  it('quote requests: each vendor prices the lines on their own link, side by side; other saves keep the requests; viewers never see the links', async () => {
    const key = 'k'.repeat(10) + 'Abc123_-xyz9';
    const other = 'z'.repeat(24);
    const rfq = { id: 'r1', title: 'Photographer quotes', service: 'photographer', lines: [{ id: 'l1', label: 'Coverage (hours)' }, { id: 'l2', label: 'Album' }], due: '2099-01-01', vendors: [{ vendorId: 'v1', key }, { vendorId: 'v2', key: other }] };
    const list = [{ id: 'v1', name: 'Lens & Light', category: 'Photographer' }, { id: 'v2', name: 'Snap Co', category: 'Photographer' }];
    expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ list, rfqs: [rfq] }) })).status).toBe(200);
    const pub = (path: string, init: RequestInit = {}) => app.request(`/api/p/sophie-and-nicholas/rfq${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers } }, env, ctx);

    // The vendor's page: only what they need, never the other vendor or the couple's full names.
    const page = await pub(`?k=${key}`);
    expect(page.status).toBe(200);
    const text = await page.text();
    const view = JSON.parse(text) as { couple: string; vendor: string; lines: { id: string }[]; answer: unknown };
    expect(view).toMatchObject({ couple: 'Sophie & Nicholas', vendor: 'Lens & Light', answer: null });
    expect(view.lines.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(text).not.toContain('Snap Co');
    expect(text).not.toContain(other);
    expect((await pub('?k=' + 'x'.repeat(24))).status).toBe(404);

    // They price one line and leave the album out; it lands as their quote.
    const answer = { k: key, lines: [{ id: 'l1', amount: 3200 }, { id: 'l2', amount: null }, { id: 'nope', amount: 99 }], deposit: 500, includes: 'Edited gallery' };
    expect((await pub('', { method: 'POST', body: JSON.stringify(answer) })).status).toBe(200);
    type Doc = { version: number; data: { list: { id: string; status: string; quotes: { id: string; rfq: string; amount: number; lines: { id: string; amount: number | null }[] }[] }[]; rfqs: { closed: boolean; vendors: { key: string; vendorId: string; openedOn: string; answeredOn: string; quoteId: string }[] }[] } };
    const doc = (await (await call('/doc/vendors')).json()) as Doc;
    const v1 = doc.data.list.find((v) => v.id === 'v1')!;
    expect(v1.status).toBe('quoted');
    expect(v1.quotes).toHaveLength(1);
    expect(v1.quotes[0]).toMatchObject({ rfq: 'r1', amount: 3200, lines: [{ id: 'l1', amount: 3200 }, { id: 'l2', amount: null }] });
    expect(doc.data.rfqs[0]!.vendors[0]).toMatchObject({ quoteId: v1.quotes[0]!.id });
    expect(doc.data.rfqs[0]!.vendors[0]!.openedOn).not.toBe('');
    // A second answer replaces the first.
    await pub('', { method: 'POST', body: JSON.stringify({ ...answer, lines: [{ id: 'l1', amount: 3000 }, { id: 'l2', amount: 900 }] }) });
    const again = (await (await call('/doc/vendors')).json()) as Doc;
    expect(again.data.list.find((v) => v.id === 'v1')!.quotes.map((q) => q.amount)).toEqual([3900]);

    // Saving the vendor list alone (Payments, the Checklist) keeps the requests.
    expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': String(again.version) }, body: JSON.stringify({ list: again.data.list }) })).status).toBe(200);
    const kept = (await (await call('/doc/vendors')).json()) as Doc;
    expect(kept.data.rfqs[0]!.vendors.map((v) => v.key)).toEqual([key, other]);
    // Viewers see the requests, not the vendors' links.
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    const seen = (await (await call('/doc/vendors')).json()) as Doc;
    expect(seen.data.rfqs[0]!.vendors.map((v) => v.key)).toEqual(['', '']);
    await t.db.prepare(`UPDATE membership SET role = 'owner'`).run();

    // Once decided, a vendor can't change their quote.
    await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': String(kept.version) }, body: JSON.stringify({ list: kept.data.list, rfqs: kept.data.rfqs.map((r) => ({ ...r, closed: true })) }) });
    expect((await pub('', { method: 'POST', body: JSON.stringify(answer) })).status).toBe(409);
  });

  it('a booked vendor has their own page: the day, numbers and dietary counts, never guests by name; it closes when they are declined', async () => {
    const list = [{ id: 'cel', name: 'Celebrant Co', category: 'Celebrant', status: 'booked', arrival: '1:30pm' }];
    expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ list }) })).status).toBe(200);
    const { url } = (await (await call('/vendors/cel/hub')).json()) as { url: string };
    const u = new URL(url);
    const api = `/api/p/sophie-and-nicholas/vendor/${u.searchParams.get('v')}/${u.searchParams.get('k')}`;
    const res = await app.request(api, {}, env, ctx);
    expect(res.status).toBe(200);
    const text = await res.text();
    const page = JSON.parse(text) as { vendor: { name: string; arrival: string }; guests: { coming: number } | null; event: { name: string } | null };
    expect(page.vendor).toMatchObject({ name: 'Celebrant Co', arrival: '1:30pm' });
    expect(page.event).not.toBeNull();
    expect(page.guests).not.toBeNull();
    expect(text).not.toContain('Ella Thompson'); // counts only
    expect((await app.request(api.replace(/[^/]+$/, 'x'.repeat(24)), {}, env, ctx)).status).toBe(404);
    const doc = (await (await call('/doc/vendors')).json()) as { version: number };
    await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': String(doc.version) }, body: JSON.stringify({ list: [{ ...list[0], status: 'declined' }] }) });
    expect((await app.request(api, {}, env, ctx)).status).toBe(404);
  });

  it('a caterer the couple shares the seating with sees each special meal by table and seat; others never see names', async () => {
    const admin = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
    // Seat everyone coming at two tables, one guest with a serious allergy.
    const s0 = (await (await admin('/seating')).json()) as { version: number; event: { key: string }; people: { id: string; name: string; coming: boolean }[] };
    const coming = s0.people.filter((p) => p.coming);
    expect(coming.length).toBeGreaterThan(2);
    const allergic = coming[0]!;
    await t.db.prepare(`UPDATE person SET diet = 'Severe peanut allergy' WHERE id = ?`).bind(allergic.id).run();
    const T1 = '11111111-1111-4111-8111-111111111111';
    const T2 = '22222222-2222-4222-8222-222222222222';
    const tables = [T1, T2].map((id, i) => ({ id, name: String(i + 1), shape: 'round', dir: 'h', len: 30, x: 30 + i * 40, y: 40, seats: 10 }));
    const seats = Object.fromEntries(coming.map((p, i) => [p.id, i % 2 ? T2 : T1]));
    const saved = await admin('/seating', { method: 'PUT', headers: { 'If-Match': String(s0.version) }, body: JSON.stringify({ event: s0.event.key, aspect: '4 / 3', tables, areas: [], seats }) });
    expect(saved.status).toBe(200);
    const v1 = ((await saved.json()) as { version: number }).version;
    expect((await admin('/seating/publish', { method: 'POST', headers: { 'If-Match': String(v1) }, body: JSON.stringify({ event: s0.event.key }) })).status).toBe(200);

    const list = [{ id: 'cat', name: 'Feast Catering', category: 'Caterer', status: 'booked', shareSeating: false }];
    expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ list }) })).status).toBe(200);
    const { url } = (await (await call('/vendors/cat/hub')).json()) as { url: string };
    const u = new URL(url);
    const api = `/api/p/sophie-and-nicholas/vendor/${u.searchParams.get('v')}/${u.searchParams.get('k')}`;
    // Not shared: no seating, no names.
    const before = await (await app.request(api, {}, env, ctx)).text();
    expect(JSON.parse(before).seating).toBeNull();
    expect(before).not.toContain(allergic.name);
    // Shared: the special meal at its table and seat, the table marked.
    const doc = (await (await call('/doc/vendors')).json()) as { version: number };
    await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': String(doc.version) }, body: JSON.stringify({ list: [{ ...list[0], shareSeating: true }] }) });
    const page = (await (await app.request(api, {}, env, ctx)).json()) as {
      seating: { published: boolean; tables: { name: string; special: number; serious: boolean }[]; special: { table: string; seat: number; name: string; diet: string; serious: boolean }[] };
    };
    expect(page.seating.published).toBe(true);
    expect(page.seating.special).toContainEqual({ table: 'Table 1', seat: 1, name: allergic.name, diet: 'Severe peanut allergy', meal: expect.any(Object), serious: true });
    expect(page.seating.tables.find((t) => t.name === 'Table 1')).toMatchObject({ serious: true });
    expect(page.seating.special.every((r) => r.diet || r.serious || r.name)).toBe(true);
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
    expect(ov.needsYou.find((n) => n.kind === 'payments-due')).toMatchObject({ detail: 'Cake $700', link: 'planner?view=payments' });
  });

  it('the couple’s day lists move into the one planning checklist, once: whose, done, time and tip kept, nothing twice', async () => {
    await call('/doc/checklist', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ tasks: [{ id: 'a', text: 'Collect the rings', before: 0, owner: 'p1' }] }) });
    const day = {
      p1: [{ text: 'Collect the rings', phase: 'morning' }, { text: 'Final dress fitting', phase: 'month', done: true }],
      p2: [{ text: 'Pick up the suits', phase: 'eve', time: '3:00pm', note: 'Bring the receipt', id: 'h1', helper: 'jess' }],
      both: [{ text: 'Thank the venue', phase: 'after' }],
    };
    expect((await call('/doc/day-checklist/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify(day) })).status).toBe(200);
    const read = async () => ((await (await call('/doc/checklist')).json()) as { data: { tasks: { text: string; before: number; owner: string; helper: string; done: boolean; note: string }[] } }).data.tasks;
    const tasks = await read();
    expect(tasks.filter((t) => t.text === 'Collect the rings')).toHaveLength(1); // already there: not added twice
    expect(tasks.find((t) => t.text === 'Final dress fitting')).toMatchObject({ before: 30, owner: 'p1', done: true });
    expect(tasks.find((t) => t.text === 'Pick up the suits')).toMatchObject({ before: 1, owner: 'p2', helper: 'jess', note: '3:00pm · Bring the receipt' });
    expect(tasks.find((t) => t.text === 'Thank the venue')).toMatchObject({ before: -1, owner: 'both' });
    // The old lists are emptied, and reading again adds nothing.
    const old = ((await (await call('/doc/day-checklist/wedding')).json()) as { data: { p1: unknown[]; p2: unknown[]; both: unknown[] } }).data;
    expect([old.p1.length, old.p2.length, old.both.length]).toEqual([0, 0, 0]);
    expect((await read()).length).toBe(tasks.length);
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
  it('inviting a bridesmaid with an email sends her a welcome with her set-up link (when email is switched on)', async () => {
    const ella = await personOf('Ella Thompson');
    await call(`/people/${ella.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Bridesmaid' }) });
    const admin = (path: string, body: unknown) => app.request(`/api/a/w/${wid}/party-accounts${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }, env, ctx);
    // Email off: the link comes back to share, nothing is emailed.
    const off = (await (await admin(`/${ella.id}/invite`, { email: 'ella@example.com' })).json()) as { link: string; emailed: boolean };
    expect(off.emailed).toBe(false);
    // Email on: one email to her, with the same kind of link.
    env = { ...env, RESEND_API_KEY: 're_test', EMAIL_FROM: 'Weddings <hello@example.com>' };
    const sent: { to: string[]; subject: string; text: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (String(url).includes('api.resend.com')) {
        sent.push(JSON.parse(String(init!.body)));
        return new Response('{"id":"x"}', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    });
    try {
      const on = (await (await admin(`/${ella.id}/invite`, {})).json()) as { link: string; emailed: boolean; email: string };
      expect(on).toMatchObject({ emailed: true, email: 'ella@example.com' }); // the email she was invited with before
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toEqual(['ella@example.com']);
      expect(sent[0]!.subject).toMatch(/welcome to the wedding party/);
      expect(sent[0]!.text).toContain('Welcome to the wedding party, Ella!');
      expect(sent[0]!.text).toContain(on.link);
      expect(sent[0]!.text).toContain('bridesmaid');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the portal: invite, set a password, sign in, see only what is allowed, a reset signs out, and sign-in needed', async () => {
    const ella = await personOf('Ella Thompson');
    await call(`/people/${ella.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Bridesmaid' }) });
    const items = [{ time: '2pm', until: '', title: 'Photos', detail: '', place: '', who: ['party'] }];
    await call('/doc/party-runsheet/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ items, note: '', packing: [{ text: 'Charger', who: ['party'] }] }) });
    const admin = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}/party-accounts${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
    const portal = (path: string, body?: unknown) => app.request(`/api/p/sophie-and-nicholas/portal${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, env, ctx);

    const inv = (await (await admin(`/${ella.id}/invite`, { method: 'POST', body: JSON.stringify({ email: 'ella@example.com' }) })).json()) as { link: string };
    const t1 = new URL(inv.link).searchParams.get('t')!;
    expect(await (await portal(`/link?t=${t1}`)).json()).toMatchObject({ name: 'Ella Thompson', setUp: false, email: 'ella@example.com' });
    expect((await portal('/password-link', { t: t1, password: 'short' })).status).toBe(400);
    expect((await portal('/password-link', { t: t1, password: 'bridesmaid-27' })).status).toBe(200);
    expect((await portal(`/link?t=${t1}`)).status).toBe(404); // used

    expect((await portal('/login', { email: 'ella@example.com', password: 'wrong-pass' })).status).toBe(401);
    const login = await portal('/login', { email: 'Ella@Example.com', password: 'bridesmaid-27' });
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('Path=/api/p/sophie-and-nicholas/');
    const jar = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const party = () => app.request('/api/p/sophie-and-nicholas/party', { headers: { cookie: jar } }, env, ctx);
    const p1 = (await (await party()).json()) as { account: { name: string }; perms: Record<string, boolean>; events: { items: unknown[] }[]; vendors?: unknown };
    expect(p1.account.name).toBe('Ella Thompson');
    expect(p1.events[0]!.items).toHaveLength(1);
    expect(p1.vendors).toBeUndefined(); // a bridesmaid doesn't see suppliers to start with

    // The couple narrows it (no run sheet, no packing) and opens suppliers.
    expect((await admin(`/${ella.id}/perms`, { method: 'PUT', body: JSON.stringify({ perms: { ...p1.perms, runsheet: false, packing: false, vendors: true } }) })).status).toBe(200);
    const p2 = (await (await party()).json()) as { events: { items: unknown[] }[]; vendors?: unknown[] };
    expect(p2.events.every((e) => !e.items.length)).toBe(true);
    expect(p2.vendors).toEqual([]);
    const pack = await app.request('/api/p/sophie-and-nicholas/party', { method: 'POST', headers: { 'content-type': 'application/json', cookie: jar }, body: JSON.stringify({ personId: ella.id, action: 'add-pack', text: 'Shoes' }) }, env, ctx);
    expect(pack.status).toBe(403);

    // Sign-in needed: the private link alone no longer opens it; signed in still does.
    expect((await page(ella.token)).status).toBe(200);
    await admin('/settings', { method: 'PUT', body: JSON.stringify({ signIn: true }) });
    expect((await page(ella.token)).status).toBe(401);
    expect((await party()).status).toBe(200);

    // A reset link from the couple: a new password, and the old session is signed out.
    const rs = (await (await admin(`/${ella.id}/reset`, { method: 'POST', body: '{}' })).json()) as { link: string };
    expect((await portal('/password-link', { t: new URL(rs.link).searchParams.get('t')!, password: 'new-password-1' })).status).toBe(200);
    expect((await party()).status).toBe(401);
    expect((await portal('/login', { email: 'ella@example.com', password: 'new-password-1' })).status).toBe(200);
    const list = (await (await admin('')).json()) as { signIn: boolean; members: { personId: string; account: { status: string } | null }[] };
    expect(list.signIn).toBe(true);
    expect(list.members.find((m) => m.personId === ella.id)!.account!.status).toBe('active');
  });
});

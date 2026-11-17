import { REGIONS } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { kmBetween } from '../src/lib/directory';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** The vendor directory of vendors who sign up: joining, browsing, enquiries, editing, hiding, and the planner's finder. */
describe('vendor directory', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, cookie = '', ip = '1.1.1.1') =>
    app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]!;
  const listing = {
    name: 'Wildflower Studio',
    category: 'florist',
    region: 'sydney',
    regions: ['blue-mountains'],
    contactName: 'Jess Lee',
    phone: '0400 111 222',
    website: 'https://wildflower.example',
    instagram: '@wildflower',
    about: 'Garden-style wedding flowers, grown locally.',
    priceFrom: 1800,
    photos: ['https://wildflower.example/a.jpg'],
  };
  /** Joining as it really is: the new listing waits for the company's approval. */
  const joinPending = (over: Record<string, unknown> = {}, ip = '1.1.1.1') =>
    call('/directory/join', { method: 'POST', body: JSON.stringify({ ...listing, email: 'jess@wildflower.example', passcode: 'long-enough-1', company: '', ...over }) }, '', ip);
  /** Joining, then approved straight away (as the company portal's Approve does), for the tests about what comes after. */
  const join = async (over: Record<string, unknown> = {}, ip = '1.1.1.1') => {
    const res = await joinPending(over, ip);
    if (res.status === 200) {
      const email = String(over.email ?? 'jess@wildflower.example');
      await t.db.prepare(`UPDATE vendor_listing SET approved_at = '2026-11-18T00:00:00.000Z' WHERE email = ?`).bind(email).run();
      await t.db.prepare(`UPDATE vendor_directory SET hidden = 0 WHERE id IN (SELECT 'v:' || id FROM vendor_listing WHERE email = ?)`).bind(email).run();
    }
    return res;
  };

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', SUPER_ADMINS: 'owner@example.com' };
  });
  afterEach(() => t.dispose());

  it('a vendor joins, is listed once approved, and couples find them by what they do and where (never their email)', async () => {
    const res = await join();
    expect(res.status).toBe(200);
    const { slug } = (await res.json()) as { slug: string };
    expect(slug).toBe('wildflower-studio');
    expect(cookieOf(res)).toMatch(/=/);

    const browse = async (q: string) => ((await (await call(`/directory?${q}`)).json()) as { results: { slug: string }[] }).results.map((r) => r.slug);
    expect(await browse('')).toEqual(['wildflower-studio']);
    expect(await browse('category=florist&region=sydney')).toEqual(['wildflower-studio']);
    expect(await browse('region=blue-mountains')).toEqual(['wildflower-studio']); // where they travel
    expect(await browse('region=perth')).toEqual([]);
    expect(await browse('category=photographer')).toEqual([]);
    expect(await browse('q=garden')).toEqual(['wildflower-studio']);

    const page = await call(`/directory/v/${slug}`);
    const text = await page.text();
    expect(JSON.parse(text)).toMatchObject({ name: 'Wildflower Studio', instagram: 'wildflower', priceFrom: 1800, regions: ['blue-mountains'] });
    expect(text).not.toContain('jess@wildflower.example');
    expect((await call('/directory/v/nobody')).status).toBe(404);

    // The same email again: sign in instead. The same name: another address.
    expect((await join({}, '2.2.2.2')).status).toBe(409);
    const other = (await (await join({ email: 'b@example.com' }, '3.3.3.3')).json()) as { slug: string };
    expect(other.slug).toBe('wildflower-studio-2');
  });

  it('a new listing waits for approval: not in the directory, its page or enquiries until the company portal approves it (YL-13)', async () => {
    const res = await joinPending({}, '8.0.0.1');
    expect(res.status).toBe(200);
    const vendor = cookieOf(res);
    const { slug } = (await res.json()) as { slug: string };
    const listed = async () => ((await (await call('/directory')).json()) as { results: { slug: string }[] }).results.map((r) => r.slug);
    expect(await listed()).toEqual([]);
    expect((await call(`/directory/v/${slug}`)).status).toBe(404);
    expect((await call(`/directory/v/${slug}/enquire`, { method: 'POST', body: JSON.stringify({ name: 'Ava', email: 'ava@example.com', phone: '', date: '2027-05-01', guests: 80, message: 'Free?', company: '' }) })).status).toBe(404);
    // The vendor sees it's under review.
    const mine = (await (await call('/a/vendor', {}, vendor)).json()) as { listing: { pending: boolean } };
    expect(mine.listing.pending).toBe(true);
    // The company portal lists it first, waiting; Approve puts it in the directory.
    const owner = cookieOf(await call('/a/auth/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, '', '8.0.0.2'));
    const all = (await (await call('/a/company/listings', {}, owner)).json()) as { listings: { id: string; slug: string; pending: boolean }[] };
    const row = all.listings.find((l) => l.slug === slug)!;
    expect(row.pending).toBe(true);
    expect((await call(`/a/company/listings/${row.id}`, { method: 'PUT', body: JSON.stringify({ approve: true }) }, owner)).status).toBe(200);
    expect(await listed()).toEqual([slug]);
    expect((await call(`/directory/v/${slug}`)).status).toBe(200);
    expect(((await (await call('/a/vendor', {}, vendor)).json()) as { listing: { pending: boolean } }).listing.pending).toBe(false);
    // The vendor can't approve themselves.
    expect((await call(`/a/company/listings/${row.id}`, { method: 'PUT', body: JSON.stringify({ approve: true }) }, vendor)).status).toBeGreaterThanOrEqual(401);
  });

  it('one email can be a couple and a vendor: the same passcode adds the other, both sign-ins work, the switcher shows both (YL-12)', async () => {
    const couple = { firstName: 'Jess', partnerName: 'Sam', email: 'jess@wildflower.example', passcode: 'long-enough-1', date: '2027-03-14', plan: 'essentials', marketing: false, website: '' };
    const signup = (over: Record<string, unknown> = {}, ip = '6.0.0.1') => call('/a/signup', { method: 'POST', body: JSON.stringify({ ...couple, ...over }) }, '', ip);
    expect((await signup()).status).toBe(200);
    // Joining as a vendor with that email: not with a different passcode (that would take over the account).
    const wrong = await join({ passcode: 'someone-else-9' }, '6.0.0.2');
    expect(wrong.status).toBe(409);
    expect(((await wrong.json()) as { error: { message: string } }).error.message).toMatch(/passcode/);
    // With the account's own passcode: the listing is added to the same account.
    const ok = await join({}, '6.0.0.3');
    expect(ok.status).toBe(200);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM user WHERE email = 'jess@wildflower.example'`).first<{ n: number }>())!.n).toBe(1);
    // One sign-in reaches both: the wedding and the listing.
    const login = await call('/a/auth/login', { method: 'POST', body: JSON.stringify({ email: 'jess@wildflower.example', passcode: 'long-enough-1' }) }, '', '6.0.0.4');
    expect(login.status).toBe(200);
    const me = (await (await call('/a/me', {}, cookieOf(login))).json()) as { weddings: { slug: string }[]; vendor: { slug: string } | null };
    expect(me.weddings.map((w) => w.slug)).toEqual(['jess-and-sam']);
    expect(me.vendor?.slug).toBe('wildflower-studio');
    // A second listing, or a second wedding, still signs in instead.
    expect((await join({}, '6.0.0.5')).status).toBe(409);
    expect((await signup({}, '6.0.0.6')).status).toBe(409);
  });

  it('a vendor can add their own wedding with the same email and passcode (YL-12)', async () => {
    expect((await join({ email: 'kai@example.com' }, '7.0.0.1')).status).toBe(200);
    const signup = (passcode: string, ip: string) =>
      call('/a/signup', { method: 'POST', body: JSON.stringify({ firstName: 'Kai', partnerName: 'Ari', email: 'kai@example.com', passcode, date: '', plan: 'free', marketing: false, website: '' }) }, '', ip);
    expect((await signup('not-the-same-1', '7.0.0.2')).status).toBe(409);
    const res = await signup('long-enough-1', '7.0.0.3');
    expect(res.status).toBe(200);
    const me = (await (await call('/a/me', {}, cookieOf(res))).json()) as { weddings: { slug: string }[]; vendor: { slug: string } | null };
    expect(me.weddings.map((w) => w.slug)).toEqual(['kai-and-ari']);
    expect(me.vendor?.slug).toBe('wildflower-studio');
  });

  it('refuses bad listings, ignores bots, and limits joining from one place', async () => {
    expect((await join({ region: 'atlantis' }, '4.0.0.1')).status).toBe(400);
    expect((await join({ category: 'astrologer' }, '4.0.0.2')).status).toBe(400);
    expect((await join({ website: 'javascript:alert(1)' }, '4.0.0.3')).status).toBe(400);
    expect((await join({ photos: ['http://insecure.example/a.jpg'] }, '4.0.0.4')).status).toBe(400);
    expect((await join({ passcode: 'short' }, '4.0.0.5')).status).toBe(400);
    expect((await join({ company: 'Spam Co', email: 'bot@example.com' }, '4.0.0.6')).status).toBe(200);
    expect(await t.db.prepare(`SELECT 1 FROM user WHERE email = 'bot@example.com'`).first()).toBeNull();
    for (let i = 0; i < 5; i++) await join({ email: `n${i}@example.com` }, '9.9.9.9');
    expect((await join({ email: 'n9@example.com' }, '9.9.9.9')).status).toBe(429);
  });

  it('couples enquire; the vendor reads them, edits the listing, and only their own; the platform owner can hide it', async () => {
    const res = await join();
    const vendor = cookieOf(res);
    const { slug } = (await res.json()) as { slug: string };
    const ask = { name: 'Alex & Sam', email: 'alex@example.com', phone: '', date: '2027-03-14', guests: 90, message: 'Are you free for our garden wedding?', company: '' };
    expect((await call(`/directory/v/${slug}/enquire`, { method: 'POST', body: JSON.stringify(ask) })).status).toBe(200);
    expect((await call(`/directory/v/${slug}/enquire`, { method: 'POST', body: JSON.stringify({ ...ask, message: '' }) })).status).toBe(400);

    const mine = (await (await call('/a/vendor', {}, vendor)).json()) as { listing: { email: string }; enquiries: { id: string; name: string; guests: number; read: boolean }[] };
    expect(mine.listing.email).toBe('jess@wildflower.example');
    expect(mine.enquiries).toEqual([expect.objectContaining({ name: 'Alex & Sam', guests: 90, read: false })]);
    expect((await call(`/a/vendor/enquiries/${mine.enquiries[0]!.id}/read`, { method: 'POST' }, vendor)).status).toBe(200);
    expect(((await (await call('/a/vendor', {}, vendor)).json()) as { enquiries: { read: boolean }[] }).enquiries[0]!.read).toBe(true);
    expect((await call('/a/vendor')).status).toBe(401);

    // Editing: the listing changes, and so does its row in the shared directory.
    expect((await call('/a/vendor', { method: 'PUT', body: JSON.stringify({ ...listing, name: 'Wildflower & Co', region: 'hunter-valley', regions: [] }) }, vendor)).status).toBe(200);
    expect(((await (await call(`/directory/v/${slug}`)).json()) as { name: string; region: string }).name).toBe('Wildflower & Co');
    const dir = await t.db.prepare(`SELECT name, source, hidden FROM vendor_directory WHERE id LIKE 'v:%'`).first<{ name: string; source: string; hidden: number }>();
    expect(dir).toEqual({ name: 'Wildflower & Co', source: 'listed', hidden: 0 });

    // A couple's account has no listing to change.
    const owner = cookieOf(await call('/a/auth/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }));
    expect((await call('/a/vendor', {}, owner)).status).toBe(404);
    // Only the platform owner hides a listing; then it's gone from the directory.
    expect((await call('/a/vendor/super/hidden', { method: 'PUT', body: JSON.stringify({ slug, hidden: true }) }, vendor)).status).toBe(403);
    expect((await call('/a/vendor/super/hidden', { method: 'PUT', body: JSON.stringify({ slug, hidden: true }) }, owner)).status).toBe(200);
    expect((await call(`/directory/v/${slug}`)).status).toBe(404);
    expect(((await (await call('/directory')).json()) as { results: unknown[] }).results).toEqual([]);
  });

  it('a vendor moves enquiries along their pipeline with a note, and keeps the dates they are busy (only their own)', async () => {
    const res = await join();
    const vendor = cookieOf(res);
    const { slug } = (await res.json()) as { slug: string };
    const ask = { name: 'Alex & Sam', email: 'alex@example.com', phone: '', date: '2027-03-14', guests: 90, message: 'Are you free for our garden wedding?', company: '' };
    expect((await call(`/directory/v/${slug}/enquire`, { method: 'POST', body: JSON.stringify(ask) })).status).toBe(200);
    type Mine = { enquiries: { id: string; stage: string; note: string; read: boolean }[]; busy: { date: string; note: string }[] };
    const get = async () => (await (await call('/a/vendor', {}, vendor)).json()) as Mine;
    const before = await get();
    expect(before.enquiries[0]).toMatchObject({ stage: 'new', note: '', read: false });
    expect(before.busy).toEqual([]);
    const id = before.enquiries[0]!.id;
    const put = (body: unknown, cookie = vendor) => call(`/a/vendor/enquiries/${id}`, { method: 'PUT', body: JSON.stringify(body) }, cookie);

    expect((await put({ stage: 'quoted', note: 'Sent the garden package.' })).status).toBe(200);
    expect((await get()).enquiries[0]).toMatchObject({ stage: 'quoted', note: 'Sent the garden package.', read: true });

    // Bad changes are refused.
    expect((await put({ stage: 'maybe' })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect((await put({ note: 'x'.repeat(2001) })).status).toBe(400);
    expect((await call('/a/vendor/enquiries/nope', { method: 'PUT', body: JSON.stringify({ stage: 'booked' }) }, vendor)).status).toBe(404);

    // Another vendor can't touch it.
    const other = cookieOf(await join({ email: 'b@example.com', name: 'Other Blooms' }, '5.5.5.5'));
    expect((await put({ stage: 'lost' }, other)).status).toBe(404);
    expect((await get()).enquiries[0]!.stage).toBe('quoted');

    // Busy dates: replaced as a whole, de-duplicated and sorted.
    const busy = await call('/a/vendor/busy', { method: 'PUT', body: JSON.stringify({ dates: [{ date: '2027-05-01', note: 'Smith wedding' }, { date: '2027-03-14' }, { date: '2027-05-01' }] }) }, vendor);
    expect(busy.status).toBe(200);
    const want = [{ date: '2027-03-14', note: '' }, { date: '2027-05-01', note: 'Smith wedding' }];
    expect(((await busy.json()) as { busy: unknown }).busy).toEqual(want);
    expect((await get()).busy).toEqual(want);
    expect((await call('/a/vendor/busy', { method: 'PUT', body: JSON.stringify({ dates: [{ date: '14/03/2027' }] }) }, vendor)).status).toBe(400);
    // The other vendor's list is their own.
    expect(((await (await call('/a/vendor', {}, other)).json()) as Mine).busy).toEqual([]);
  });

  it('a vendor saves packages (a price list): they see them, couples see them, and bad ones are refused', async () => {
    const res = await join();
    const vendor = cookieOf(res);
    const { slug } = (await res.json()) as { slug: string };
    // Joined without packages: none yet.
    expect(((await (await call(`/directory/v/${slug}`)).json()) as { packages: unknown[] }).packages).toEqual([]);

    const packages = [
      { name: 'Ceremony', price: 1200, includes: ['Bridal bouquet', 'Aisle flowers'] },
      { name: 'Ceremony and reception', price: 85, unit: 'per guest', includes: ['Everything in Ceremony', 'Centrepieces'], popular: true },
    ];
    const save = (body: unknown) => call('/a/vendor', { method: 'PUT', body: JSON.stringify(body) }, vendor);
    expect((await save({ ...listing, priceFrom: 0, packages })).status).toBe(200);
    const want = [
      { name: 'Ceremony', price: 1200, unit: 'total', includes: ['Bridal bouquet', 'Aisle flowers'], popular: false },
      { name: 'Ceremony and reception', price: 85, unit: 'per guest', includes: ['Everything in Ceremony', 'Centrepieces'], popular: true },
    ];
    const mine = (await (await call('/a/vendor', {}, vendor)).json()) as { listing: { packages: unknown; priceFrom: number } };
    expect(mine.listing.packages).toEqual(want);
    expect(mine.listing.priceFrom).toBe(0); // their own setting, untouched
    const page = (await (await call(`/directory/v/${slug}`)).json()) as { packages: unknown; priceFrom: number };
    expect(page.packages).toEqual(want);
    expect(page.priceFrom).toBe(85); // no "from" price: the cheapest package stands in
    const cards = ((await (await call('/directory')).json()) as { results: { priceFrom: number }[] }).results;
    expect(cards[0]!.priceFrom).toBe(85);

    // Bad packages are refused, and nothing changes.
    expect((await save({ ...listing, packages: [{ name: 'Ceremony', price: -1 }] })).status).toBe(400);
    expect((await save({ ...listing, packages: [{ name: '', price: 100 }] })).status).toBe(400);
    expect((await save({ ...listing, packages: [{ name: 'Ceremony', price: 100, unit: 'per kilo' }] })).status).toBe(400);
    expect((await save({ ...listing, packages: Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, price: 100 })) })).status).toBe(400);
    expect(((await (await call(`/directory/v/${slug}`)).json()) as { packages: unknown }).packages).toEqual(want);
  });

  it("the planner's finder shows listed vendors working near the venue first, and leaves the map out when asked", async () => {
    const owner = cookieOf(await call('/a/auth/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }));
    const me = (await (await call('/a/me', {}, owner)).json()) as { weddings: { id: string }[] };
    const wid = me.weddings[0]!.id;
    const search = async () =>
      (await (await call(`/a/w/${wid}/planner/vendors/search?category=florist&km=30&map=0`, {}, owner)).json()) as { venue: { lat: number; lon: number }; listed: { name: string; slug: string }[]; results: unknown[] };
    const before = await search();
    expect(before.listed).toEqual([]);
    expect(before.results).toEqual([]); // no map
    // A florist based in the region nearest the venue.
    const near = [...REGIONS].sort((a, b) => kmBetween(before.venue.lat, before.venue.lon, a.lat, a.lon) - kmBetween(before.venue.lat, before.venue.lon, b.lat, b.lon))[0]!;
    expect((await join({ region: near.slug, regions: [] })).status).toBe(200);
    const after = await search();
    expect(after.listed.map((l) => l.name)).toEqual(['Wildflower Studio']);
    expect(after.results).toEqual([]);
  });
});

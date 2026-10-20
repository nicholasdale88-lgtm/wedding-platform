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
  const join = (over: Record<string, unknown> = {}, ip = '1.1.1.1') =>
    call('/directory/join', { method: 'POST', body: JSON.stringify({ ...listing, email: 'jess@wildflower.example', passcode: 'long-enough-1', company: '', ...over }) }, '', ip);

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', SUPER_ADMINS: 'owner@example.com' };
  });
  afterEach(() => t.dispose());

  it('a vendor joins, is listed straight away, and couples find them by what they do and where (never their email)', async () => {
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

  it('refuses bad listings, ignores bots, and limits joining from one place', async () => {
    expect((await join({ region: 'atlantis' })).status).toBe(400);
    expect((await join({ category: 'astrologer' })).status).toBe(400);
    expect((await join({ website: 'javascript:alert(1)' })).status).toBe(400);
    expect((await join({ photos: ['http://insecure.example/a.jpg'] })).status).toBe(400);
    expect((await join({ passcode: 'short' })).status).toBe(400);
    expect((await join({ company: 'Spam Co', email: 'bot@example.com' })).status).toBe(200);
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

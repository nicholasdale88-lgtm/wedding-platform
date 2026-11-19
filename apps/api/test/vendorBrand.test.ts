import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { testD1 } from './support/d1';

/** A vendor's own look: their logo (real images only, never SVG), their colours and menu, kept with their account. */
describe('vendor brand: logo and look', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, who = cookie) =>
    app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '7.7.7.7', ...(who ? { cookie: who } : {}), ...init.headers } }, env, ctx);
  const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82));
  const svg = btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

  beforeEach(async () => {
    t = await testD1();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const joined = await call(
      '/directory/join',
      { method: 'POST', body: JSON.stringify({ name: 'Bloom & Co', category: 'florist', region: 'sydney', regions: [], contactName: 'Bea', phone: '', website: '', instagram: '', about: '', priceFrom: 0, photos: [], email: 'bea@bloom.example', passcode: 'long-enough-9', company: '' }) },
      '',
    );
    expect(joined.status, await joined.clone().text()).toBe(200);
    cookie = (joined.headers.get('set-cookie') ?? '').split(';')[0]!;
  });
  afterEach(() => t.dispose());

  it('a logo goes up, shows in their account and (once approved) on their public page, and comes off again', async () => {
    expect((await call('/a/vendor/logo', { method: 'PUT', body: JSON.stringify({ type: 'image/svg+xml', data: svg }) })).status).toBe(400);
    expect((await call('/a/vendor/logo', { method: 'PUT', body: JSON.stringify({ type: 'image/png', data: svg }) })).status).toBe(400);
    expect((await call('/a/vendor/logo', { method: 'PUT', body: JSON.stringify({ type: 'image/png', data: png }) }, '')).status).toBe(401);
    const up = await call('/a/vendor/logo', { method: 'PUT', body: JSON.stringify({ type: 'image/png', data: png }) });
    expect(up.status).toBe(200);
    const { logo } = (await up.json()) as { logo: string };
    expect(logo).toMatch(/^\/api\/a\/vendor\/logo\?v=/);
    const mine = (await (await call('/a/vendor')).json()) as { listing: { logo?: string; slug: string; look: { palette: string; bar: string[] } } };
    expect(mine.listing.logo).toBe(logo);
    expect(mine.listing.look.palette).toBe('forest');
    const own = await call('/a/vendor/logo');
    expect(own.status).toBe(200);
    expect(own.headers.get('content-type')).toBe('image/png');
    expect(own.headers.get('cache-control')).toMatch(/private/);
    // Waiting for approval: not on the public site yet.
    const slug = mine.listing.slug;
    expect((await call(`/directory/logo/${slug}`, {}, '')).status).toBe(404);
    await t.db.prepare(`UPDATE vendor_listing SET approved_at = '2026-11-20T00:00:00.000Z'`).run();
    const pub = await call(`/directory/logo/${slug}`, {}, '');
    expect(pub.status).toBe(200);
    expect(pub.headers.get('x-content-type-options')).toBe('nosniff');
    const page = (await (await call(`/directory/v/${slug}`, {}, '')).json()) as { logo?: string };
    expect(page.logo).toMatch(new RegExp(`^/api/directory/logo/${slug}\\?v=`));
    // Hidden by the site: the logo goes too.
    await t.db.prepare(`UPDATE vendor_listing SET hidden = 1`).run();
    expect((await call(`/directory/logo/${slug}`, {}, '')).status).toBe(404);
    expect((await call('/a/vendor/logo/remove', { method: 'POST', body: '{}' })).status).toBe(200);
    expect((await call('/a/vendor/logo')).status).toBe(404);
    expect(((await (await call('/a/vendor')).json()) as { listing: { logo?: string } }).listing.logo).toBeUndefined();
  });

  it('their look is saved and checked: colours, menu, the places that show and the phone bar', async () => {
    const look = { palette: 'custom', colour: '#8a5a9e', side: 'light', compact: true, logoShape: 'wide', tagline: 'Garden flowers, Sydney', hidden: ['proposals'], bar: ['home', 'proposals', 'quotes'] };
    const r = await call('/a/vendor/look', { method: 'PUT', body: JSON.stringify(look) });
    expect(r.status).toBe(200);
    // A hidden place can't sit on the phone bar.
    expect(((await r.json()) as { look: { bar: string[] } }).look.bar).toEqual(['home', 'quotes']);
    const mine = (await (await call('/a/vendor')).json()) as { listing: { look: Record<string, unknown> } };
    expect(mine.listing.look).toMatchObject({ palette: 'custom', colour: '#8a5a9e', side: 'light', compact: true, logoShape: 'wide', tagline: 'Garden flowers, Sydney', hidden: ['proposals'] });
    // Overview and Your listing always show; a custom colour needs a colour; nothing unknown is kept.
    expect((await call('/a/vendor/look', { method: 'PUT', body: JSON.stringify({ hidden: ['home'] }) })).status).toBe(400);
    expect((await call('/a/vendor/look', { method: 'PUT', body: JSON.stringify({ palette: 'custom' }) })).status).toBe(400);
    expect((await call('/a/vendor/look', { method: 'PUT', body: JSON.stringify({ colour: 'red' }) })).status).toBe(400);
    expect((await call('/a/vendor/look', { method: 'PUT', body: JSON.stringify({ css: 'body{}' }) })).status).toBe(400);
    expect((await call('/a/vendor/look', { method: 'PUT', body: JSON.stringify({ bar: ['a', 'b'] }) })).status).toBe(400);
    // A damaged saved value never breaks their account: the standard look shows.
    await t.db.prepare(`UPDATE vendor_listing SET look = 'not json'`).run();
    expect(((await (await call('/a/vendor')).json()) as { listing: { look: { palette: string } } }).listing.look.palette).toBe('forest');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Admin → Photos: guests upload, the couple sees, opens and removes them. Members only. */
describe('photos (admin)', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  let bucket: Map<string, Uint8Array>;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, ck = cookie) => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', cookie: ck, ...init.headers } }, env, ctx);
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  type List = { enabled: boolean; items: { id: string; by: string; url: string }[] };

  beforeEach(async () => {
    bucket = new Map();
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = {
      DB: t.db,
      PUBLIC_BASE_URL: 'https://example.com',
      SESSION_SECRET: 'test-secret-for-sessions-000000',
      MEDIA: {
        put: async (k: string, v: Uint8Array) => void bucket.set(k, v),
        get: async (k: string) => (bucket.has(k) ? { body: new Blob([bucket.get(k)!]).stream() } : null),
        delete: async (k: string) => void bucket.delete(k),
      } as unknown as R2Bucket,
    };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    const tok = (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = 'Ivy Scott'`).first<{ token: string }>())!.token;
    await app.request(`/api/p/sophie-and-nicholas/photos?g=${tok}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'X-Photo-By': 'Ivy' }, body: JPEG }, env, ctx);
  });
  afterEach(() => t.dispose());

  it('lists the album with who sent each photo, and opens a photo for members', async () => {
    const list = (await (await call(`/a/w/${wid}/photos`)).json()) as List;
    expect(list.enabled).toBe(true);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.by).toBe('Ivy');
    const img = await call(list.items[0]!.url.replace('/api', ''));
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(img.headers.get('cache-control')).toMatch(/^private/);
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(JPEG);
  });

  it('guests add videos too (checked by their bytes), kept with the look they chose; other files are refused', async () => {
    const tok = (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = 'Ivy Scott'`).first<{ token: string }>())!.token;
    const mp4 = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode('ftypmp42'), 0, 0, 0, 0, 9, 9, 9, 9]);
    const up = await app.request(`/api/p/sophie-and-nicholas/photos?g=${tok}`, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'X-Photo-By': 'Ivy', 'X-Photo-Look': 'golden' }, body: mp4 }, env, ctx);
    expect(up.status).toBe(200);
    const row = await t.db.prepare(`SELECT kind, content_type, edit FROM media WHERE content_type LIKE 'video/%'`).first<{ kind: string; content_type: string; edit: string }>();
    expect(row).toEqual({ kind: 'video', content_type: 'video/mp4', edit: 'golden' });
    const list = (await (await call(`/a/w/${wid}/photos`)).json()) as { items: { type: string; look: string }[] };
    expect(list.items.find((i) => i.type === 'video/mp4')!.look).toBe('golden');
    const text = await app.request(`/api/p/sophie-and-nicholas/photos?g=${tok}`, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: new TextEncoder().encode('not a video at all') }, env, ctx);
    expect(text.status).toBe(415);
  });

  it('nobody outside the wedding can list or open photos', async () => {
    const list = (await (await call(`/a/w/${wid}/photos`)).json()) as List;
    expect((await call(list.items[0]!.url.replace('/api', ''), {}, '')).status).toBe(401);
    expect((await call(`/a/w/other-wedding/photos`)).status).toBe(404);
  });

  it('removing a photo deletes it from storage too', async () => {
    const list = (await (await call(`/a/w/${wid}/photos`)).json()) as List;
    expect(bucket.size).toBe(1);
    expect((await call(`/a/w/${wid}/photos/${list.items[0]!.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(bucket.size).toBe(0);
    expect(((await (await call(`/a/w/${wid}/photos`)).json()) as List).items).toHaveLength(0);
  });

  it('the couple adds photos to an event album (e.g. from a chat export); the same photo twice is added once', async () => {
    const up = (body: Uint8Array, headers: Record<string, string> = {}, ck = cookie) =>
      app.request(`/api/a/w/${wid}/photos/upload?event=wedding`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'X-Photo-Upload': '1', 'X-Photo-By': encodeURIComponent('Alex (group chat)'), cookie: ck, ...headers }, body }, env, ctx);
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
    const res1 = await up(PNG);
    const text1 = await res1.text();
    expect(res1.status, text1).toBe(200);
    const first = JSON.parse(text1) as { duplicate: boolean };
    expect(first.duplicate).toBe(false);
    expect(((await (await up(PNG)).json()) as { duplicate: boolean }).duplicate).toBe(true);
    const list = (await (await call(`/a/w/${wid}/photos`)).json()) as { items: { by: string; event: string | null }[] };
    expect(list.items.filter((i) => i.by === 'Alex (group chat)')).toEqual([expect.objectContaining({ event: 'wedding' })]);
    expect((await up(new Uint8Array([1, 2, 3, 4]))).status).toBe(415); // not a photo
    expect((await up(PNG, {}, '')).status).toBe(401); // signed out
    expect((await up(PNG, { 'X-Photo-Upload': '' })).status).toBe(415); // without the header it must be JSON
  });

  it('the live photo wall: off by default, on with a secret code (photos and posts), off again stops the code', async () => {
    const screen = (k: string) => app.request(`/api/p/sophie-and-nicholas/live?k=${k}`, {}, env, ctx);
    expect((await screen('x'.repeat(20))).status).toBe(404);
    const on = (await (await call(`/a/w/${wid}/live`, { method: 'PUT', body: JSON.stringify({ on: true }) })).json()) as { on: boolean; code: string };
    expect(on.on).toBe(true);
    const wall = (await (await screen(on.code)).json()) as { photos: { url: string; by: string }[] };
    expect(wall.photos).toHaveLength(1);
    expect(wall.photos[0]!.by).toBe('Ivy');
    const img = await app.request(wall.photos[0]!.url, {}, env, ctx);
    expect(img.status).toBe(200);
    await call(`/a/w/${wid}/live`, { method: 'PUT', body: JSON.stringify({ on: false }) });
    expect((await screen(on.code)).status).toBe(404);
    expect((await app.request(wall.photos[0]!.url, {}, env, ctx)).status).toBe(404);
  });

  it('the shared album: closed until the couple opens it; then guests see and open photos of their events', async () => {
    const tok = (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = 'Ivy Scott'`).first<{ token: string }>())!.token;
    const album = () => app.request(`/api/p/sophie-and-nicholas/album?g=${tok}`, {}, env, ctx);
    expect((await album()).status).toBe(404);
    expect(((await (await call(`/a/w/${wid}/album`, { method: 'PUT', body: JSON.stringify({ on: true }) })).json()) as { on: boolean }).on).toBe(true);
    const a = (await (await album()).json()) as { photos: { url: string; by: string }[] };
    expect(a.photos).toHaveLength(1);
    expect((await app.request(a.photos[0]!.url, {}, env, ctx)).status).toBe(200);
    await call(`/a/w/${wid}/album`, { method: 'PUT', body: JSON.stringify({ on: false }) });
    expect((await app.request(a.photos[0]!.url, {}, env, ctx)).status).toBe(404);
  });

  it('says when storage is not switched on', async () => {
    delete env.MEDIA;
    expect(((await (await call(`/a/w/${wid}/photos`)).json()) as List).enabled).toBe(false);
  });
});

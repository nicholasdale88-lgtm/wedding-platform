import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Song requests: guests ask from their own link; the couple marks them for the DJ and adds their own. */
describe('song requests', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const admin = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}/songs${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const guest = (path: string, init: RequestInit = {}) => app.request(`/api/p/sophie-and-nicholas/songs${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers } }, env, ctx);
  type Song = { id: string; title: string; status: string; by: string };

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

  it('a guest requests a song; the couple sees who asked, marks it, and adds their own', async () => {
    const token = (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = 'Ella Thompson'`).first<{ token: string }>())!.token;
    expect((await guest('', { method: 'POST', body: JSON.stringify({ token: 'x'.repeat(22), title: 'Song' }) })).status).toBe(404);
    expect((await guest('', { method: 'POST', body: JSON.stringify({ token, title: '' }) })).status).toBe(400);
    expect((await guest('', { method: 'POST', body: JSON.stringify({ token, title: 'September', artist: 'Earth, Wind & Fire' }) })).status).toBe(200);
    expect(((await (await guest(`?g=${token}`)).json()) as { songs: { title: string }[] }).songs[0]!.title).toBe('September');
    const list = ((await (await admin('')).json()) as { songs: Song[] }).songs;
    expect(list[0]).toMatchObject({ title: 'September', status: 'new', by: expect.stringContaining('Ella Thompson') });
    const marked = ((await (await admin(`/${list[0]!.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'must' }) })).json()) as { songs: Song[] }).songs;
    expect(marked[0]!.status).toBe('must');
    const mine = ((await (await admin('', { method: 'POST', body: JSON.stringify({ title: 'Chicken Dance', status: 'no' }) })).json()) as { songs: Song[] }).songs;
    expect(mine.find((s) => s.title === 'Chicken Dance')).toMatchObject({ status: 'no', by: 'You' });
  });
});

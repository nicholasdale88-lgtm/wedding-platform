import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** The message board: guests post, heart and reply; the couple approves, hides, pins and replies. */
describe('message board', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const admin = (path: string, init: RequestInit = {}) =>
    app.request(`/api/a/w/${wid}/board${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const guest = (path: string, init: RequestInit = {}) =>
    app.request(`/api/p/sophie-and-nicholas/board${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers } }, env, ctx);
  const tokenOf = async (name: string) =>
    (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = ?`).bind(name).first<{ token: string }>())!.token;
  type Post = { id: string; author: string; body: string; likes: number; liked: boolean; pending: boolean; couple: boolean; replies: Post[] };
  const board = async (token: string) => (await (await guest(`?g=${token}`)).json()) as { on: boolean; posts: Post[] };

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

  it('guests post and heart; everyone with a link sees it; the couple replies under it', async () => {
    const ella = await tokenOf('Ella Thompson');
    const ann = await tokenOf('Margaret Bloor');
    expect((await guest('', { method: 'POST', body: JSON.stringify({ token: ella, body: 'Congratulations you two!' }) })).status).toBe(200);
    const seen = await board(ann);
    expect(seen.posts).toHaveLength(1);
    expect(seen.posts[0]).toMatchObject({ body: 'Congratulations you two!', likes: 0, liked: false, couple: false });
    const like = (await (await guest(`/${seen.posts[0]!.id}/like`, { method: 'POST', body: JSON.stringify({ token: ann }) })).json()) as { liked: boolean; likes: number };
    expect(like).toEqual({ liked: true, likes: 1 });
    const unlike = (await (await guest(`/${seen.posts[0]!.id}/like`, { method: 'POST', body: JSON.stringify({ token: ann }) })).json()) as { liked: boolean; likes: number };
    expect(unlike).toEqual({ liked: false, likes: 0 }); // tap again to take it back
    await admin('', { method: 'POST', body: JSON.stringify({ body: 'Thank you!', parent: seen.posts[0]!.id }) });
    expect((await board(ella)).posts[0]!.replies[0]).toMatchObject({ body: 'Thank you!', couple: true });
  });

  it('with approval on, a post waits (only its author sees it) until the couple shows it; hidden posts disappear', async () => {
    await admin('/settings', { method: 'PUT', body: JSON.stringify({ on: true, approve: true }) });
    const ella = await tokenOf('Ella Thompson');
    const ann = await tokenOf('Margaret Bloor');
    const r = (await (await guest('', { method: 'POST', body: JSON.stringify({ token: ella, body: 'Waiting for approval' }) })).json()) as { pending: boolean };
    expect(r.pending).toBe(true);
    expect((await board(ella)).posts[0]).toMatchObject({ pending: true });
    expect((await board(ann)).posts).toHaveLength(0);
    const all = (await (await admin('')).json()) as { pending: number; posts: { id: string; status: string }[] };
    expect(all.pending).toBe(1);
    await admin(`/${all.posts[0]!.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'shown' }) });
    expect((await board(ann)).posts).toHaveLength(1);
    await admin(`/${all.posts[0]!.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'hidden' }) });
    expect((await board(ann)).posts).toHaveLength(0);
  });

  it('needs a link; nothing empty; guests remove only their own posts; a closed board takes no posts', async () => {
    expect((await guest('?g=' + 'a'.repeat(22))).status).toBe(404);
    const ella = await tokenOf('Ella Thompson');
    const ann = await tokenOf('Margaret Bloor');
    expect((await guest('', { method: 'POST', body: JSON.stringify({ token: ella, body: '  ' }) })).status).toBe(400);
    await guest('', { method: 'POST', body: JSON.stringify({ token: ella, body: 'Mine' }) });
    const id = (await board(ella)).posts[0]!.id;
    expect((await guest(`/${id}`, { method: 'DELETE', body: JSON.stringify({ token: ann }) })).status).toBe(404);
    expect((await guest(`/${id}`, { method: 'DELETE', body: JSON.stringify({ token: ella }) })).status).toBe(200);
    await admin('/settings', { method: 'PUT', body: JSON.stringify({ on: false, approve: false }) });
    expect((await guest('', { method: 'POST', body: JSON.stringify({ token: ella, body: 'Closed?' }) })).status).toBe(403);
    expect((await board(ella)).on).toBe(false);
  });
});

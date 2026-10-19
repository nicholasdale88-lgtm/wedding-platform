import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Admin → Events: add, change and remove the celebrations guests are invited to. */
describe('events API', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`/api/a/w/${wid}/events${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  type Ev = { id: string; key: string; name: string; pendingLabel: string; startsAt: string; version: number; invited: number; coming: number; hasSeating: boolean; questions: unknown[] };
  const list = async () => ((await (await call('')).json()) as { events: Ev[] }).events;

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

  it('lists both events with invited and coming counts', async () => {
    const ev = await list();
    expect(ev.map((e) => e.key)).toEqual(['wedding', '30th']);
    expect(ev[0]!.invited).toBeGreaterThan(0);
  });

  it('adds an event with a plain key, inviting everyone already on the list', async () => {
    const guests = (await t.db.prepare(`SELECT COUNT(*) AS n FROM invitation WHERE deleted_at IS NULL`).first<{ n: number }>())!.n;
    const res = await call('', { method: 'POST', body: JSON.stringify({ name: 'Recovery brunch', startsAt: '2027-11-19T00:00:00.000Z', hasSeating: false, inviteEveryone: true }) });
    expect(res.status).toBe(201);
    const brunch = (await list()).find((e) => e.name === 'Recovery brunch')!;
    expect(brunch).toMatchObject({ key: 'recovery-brunch', pendingLabel: 'the Recovery brunch', invited: guests, coming: 0 });
    // A second with the same name gets its own key.
    await call('', { method: 'POST', body: JSON.stringify({ name: 'Recovery brunch', startsAt: '2027-11-19T00:00:00.000Z' }) });
    expect((await list()).filter((e) => e.name === 'Recovery brunch').map((e) => e.key)).toEqual(['recovery-brunch', 'recovery-brunch-2']);
    // Guests' invitation pages now include it.
    const p = (await (await app.request('/api/p/sophie-and-nicholas/invite', {}, env, ctx)).json()) as { events: { key: string }[] };
    expect(p.events.map((e) => e.key)).toContain('recovery-brunch');
  });

  it('checks what it saves, and refuses a stale edit', async () => {
    expect((await call('', { method: 'POST', body: JSON.stringify({ name: '', startsAt: 'tomorrow' }) })).status).toBe(400);
    expect((await call('', { method: 'POST', body: JSON.stringify({ name: 'X', startsAt: '2027-01-01T00:00:00.000Z', mapUrl: 'javascript:alert(1)' }) })).status).toBe(400);
    const w = (await list())[0]!;
    const ok = await call(`/${w.id}`, { method: 'PUT', headers: { 'If-Match': String(w.version) }, body: JSON.stringify({ name: 'Our wedding', questions: [{ key: 'song', label: 'A song for the dance floor?', type: 'text' }] }) });
    expect(ok.status).toBe(200);
    expect((await list())[0]).toMatchObject({ name: 'Our wedding', questions: [{ key: 'song' }] });
    expect((await call(`/${w.id}`, { method: 'PUT', headers: { 'If-Match': String(w.version) }, body: JSON.stringify({ name: 'Stale' }) })).status).toBe(409);
    expect((await call(`/${w.id}`, { method: 'PUT', body: JSON.stringify({ name: 'No version' }) })).status).toBe(428);
  });

  it('removing an event takes it off every invitation and frees its seats; the last one stays', async () => {
    const [wedding, thirtieth] = await list();
    await t.db.prepare(`UPDATE person SET table_id = (SELECT id FROM seat_table WHERE event_id = ? LIMIT 1)`).bind(wedding!.id).run();
    expect((await call(`/${wedding!.id}`, { method: 'DELETE', headers: { 'If-Match': String(wedding!.version) } })).status).toBe(200);
    expect((await list()).map((e) => e.key)).toEqual(['30th']);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM invite_event WHERE event_id = ?`).bind(wedding!.id).first<{ n: number }>())!.n).toBe(0);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM person WHERE table_id IS NOT NULL`).first<{ n: number }>())!.n).toBe(0);
    const last = await call(`/${thirtieth!.id}`, { method: 'DELETE', headers: { 'If-Match': String(thirtieth!.version) } });
    expect(last.status).toBe(400);
  });
});

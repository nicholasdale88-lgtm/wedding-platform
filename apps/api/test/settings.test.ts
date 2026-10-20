import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import type { EngineDeps } from '../src/sms/engine';
import { testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

/** Admin → SMS setup, backup, and changing your passcode. */
describe('settings API', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const provider = new FakeProvider();
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: fakeClock('2026-10-20T10:00').now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, ck = cookie) =>
    app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', cookie: ck, ...init.headers } }, env, ctx);
  const login = async (passcode: string) => {
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode }) }, env, ctx);
    return { status: res.status, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]!, body: (await res.json()) as { weddings: { id: string }[] } };
  };
  type S = { version: number; live: boolean; sender: string; adminMobile: string; paused: boolean; quietStart: number; quietEnd: number; replies: Record<string, string>; plan: { name: string; costCents: number }[]; planTotalCents: number };
  const get = async () => (await (await call(`/a/w/${wid}/settings`)).json()) as S;
  const put = (body: unknown, v: number) => call(`/a/w/${wid}/settings`, { method: 'PUT', body: JSON.stringify(body), headers: { 'If-Match': String(v) } });

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const l = await login('valley-2027');
    cookie = l.cookie;
    wid = l.body.weddings[0]!.id;
  });
  afterEach(() => t.dispose());

  it('shows the setup and what the whole plan costs', async () => {
    const s = await get();
    expect(s.live).toBe(false);
    expect(s.replies.yes).toContain('{first}');
    expect(s.plan.length).toBeGreaterThan(0);
    expect(s.planTotalCents).toBe(s.plan.reduce((n, p) => n + p.costCents, 0));
  });

  it('saves the sender, your mobile, pause and hours; numbers in any format', async () => {
    const s = await get();
    const res = await put({ sender: '0400 000 999', adminMobile: '+61 400 000 001', paused: true, quietStart: 9, quietEnd: 19, replies: { yes: 'Yay {first}! {link}' } }, s.version);
    expect(res.status).toBe(200);
    const after = (await res.json()) as S;
    expect(after).toMatchObject({ live: true, sender: '0400 000 999', adminMobile: '0400 000 001', paused: true, quietStart: 9, quietEnd: 19 });
    expect(after.replies).toMatchObject({ yes: 'Yay {first}! {link}', no: s.replies.no });
    const row = await t.db.prepare(`SELECT sms_sender, sms_paused FROM wedding`).first();
    expect(row).toEqual({ sms_sender: '+61400000999', sms_paused: 1 });
  });

  it('refuses bad numbers, back-to-front hours and stale saves', async () => {
    const s = await get();
    expect((await put({ sender: '12345' }, s.version)).status).toBe(400);
    expect((await put({ quietStart: 20, quietEnd: 8 }, s.version)).status).toBe(400);
    expect((await put({ quietStart: 22 }, s.version)).status).toBe(400); // after the saved end (20)
    expect((await put({ paused: true }, s.version)).status).toBe(200);
    expect((await put({ paused: false }, s.version)).status).toBe(409);
  });

  it('backup: the whole wedding as a file for the owner, never sessions or passcodes', async () => {
    const res = await call(`/a/w/${wid}/settings/backup`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="sophie-and-nicholas-backup-\d{4}-\d{2}-\d{2}\.json"/);
    const text = await res.text();
    const b = JSON.parse(text) as { format: string; invitations: unknown[]; people: unknown[]; campaigns: unknown[] };
    expect(b.format).toBe('wedding-backup');
    expect(b.invitations).toHaveLength(22);
    expect(b.campaigns.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/pbkdf2|"pass_hash"|"expires_at"|"user_id"/);
    await t.db.prepare(`UPDATE membership SET role = 'editor'`).run();
    expect((await call(`/a/w/${wid}/settings/backup`)).status).toBe(403);
  });

  it('backup has the planner and every other part of the wedding too; daily backups need a linked storage', async () => {
    await call(`/a/w/${wid}/seating/versions`, { method: 'POST', body: JSON.stringify({ event: 'wedding', name: 'Final' }) });
    const b = (await (await call(`/a/w/${wid}/settings/backup`)).json()) as { version: number; seating: { versions: { name: string }[] }; planner: unknown[]; more: Record<string, unknown[]> };
    expect(b.version).toBe(2);
    expect(b.seating.versions.map((v) => v.name)).toEqual(['Final']);
    expect(Array.isArray(b.planner)).toBe(true);
    expect(Object.keys(b.more)).toEqual(expect.arrayContaining(['membership', 'audit']));
    expect(Object.keys(b.more)).not.toContain('session');
    const st = (await (await call(`/a/w/${wid}/settings/backups`)).json()) as { linked: string | null; auto: boolean; last: string | null };
    expect(st).toMatchObject({ linked: null, auto: true, last: null });
    const now = await call(`/a/w/${wid}/settings/backups/now`, { method: 'POST', body: '{}' });
    expect(now.status).toBe(400);
    expect(((await now.json()) as { error: { message: string } }).error.message).toMatch(/Link a Google Drive/);
    expect((await call(`/a/w/${wid}/settings/backups/auto`, { method: 'PUT', body: JSON.stringify({ on: false }) })).status).toBe(200);
    expect(((await (await call(`/a/w/${wid}/settings/backups`)).json()) as { auto: boolean }).auto).toBe(false);
  });

  it('change passcode: needs the current one, a decent new one, and signs out other devices', async () => {
    const other = await login('valley-2027');
    const change = (body: unknown) => call('/a/auth/passcode', { method: 'POST', body: JSON.stringify(body) });
    expect((await change({ current: 'wrong-one', next: 'a-new-passcode' })).status).toBe(400);
    expect((await change({ current: 'valley-2027', next: 'short' })).status).toBe(400);
    expect((await change({ current: 'valley-2027', next: 'a-new-passcode' })).status).toBe(200);
    expect((await call('/a/me')).status).toBe(200); // this device stays signed in
    expect((await call('/a/me', {}, other.cookie)).status).toBe(401); // the other is signed out
    expect((await login('valley-2027')).status).toBe(401);
    expect((await login('a-new-passcode')).status).toBe(200);
  });
});

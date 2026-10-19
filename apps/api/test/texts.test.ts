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

/** Admin → SMS messages, on the real seed with a fake provider (nothing really sends). */
describe('SMS messages API', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  let provider: FakeProvider;
  const clock = fakeClock('2026-10-20T10:00');
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: clock.now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`/api/a/w/${wid}/texts${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) });
  type Camp = { id: string; key: string; name: string; body: string; mode: string; enabled: boolean; custom: boolean; version: number; count: number; audienceLabel: string; slots: { sendAt: string; status: string }[] };
  type Texts = { live: boolean; campaigns: Camp[]; audiences: { key: string; label: string; audience: unknown }[]; people: { id: string; phone: boolean }[]; presets: unknown[]; inbox: unknown[]; history: { name: string; count: number }[] };
  const list = async () => (await (await call('')).json()) as Texts;

  beforeEach(async () => {
    provider = new FakeProvider();
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027'), adminMobile: '0400 000 001' });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    await t.db.prepare(`UPDATE wedding SET sms_sender = '+61400000999'`).run();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
  });
  afterEach(() => t.dispose());

  it('lists every message with who it goes to, when, and plain-English groups built from the events', async () => {
    const p = await list();
    expect(p.live).toBe(true);
    expect(p.campaigns.length).toBe(seedJson.campaigns.length);
    expect(p.campaigns.every((c) => c.count >= 0 && c.version >= 1)).toBe(true);
    expect(p.audiences.map((a) => a.label)).toEqual(expect.arrayContaining(['Everyone with a mobile', 'Still to reply', 'Coming to the wedding']));
    const reminder = p.campaigns.find((c) => c.mode === 'dates')!;
    expect(reminder.slots.length).toBeGreaterThan(0);
    expect(p.people.length).toBe(22);
  });

  it('editing wording and dates never sends; stale edits are refused', async () => {
    const c = (await list()).campaigns.find((x) => x.mode === 'dates')!;
    const patch = (body: unknown, v: number) => call(`/${c.id}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'If-Match': String(v) } });
    expect((await patch({ body: 'Hi {first}, reply here: {link}', dates: ['2027-07-01T00:00:00.000Z', '2027-08-01T00:00:00.000Z'] }, c.version)).status).toBe(200);
    expect((await patch({ body: 'stale' }, c.version)).status).toBe(409);
    const after = (await list()).campaigns.find((x) => x.id === c.id)!;
    expect(after.body).toBe('Hi {first}, reply here: {link}');
    expect(after.slots.filter((s) => s.status === 'pending').map((s) => s.sendAt)).toEqual(['2027-07-01T00:00:00.000Z', '2027-08-01T00:00:00.000Z']);
    expect(provider.calls).toHaveLength(0);
    expect((await patch({ name: 'Renamed' }, after.version)).status).toBe(400); // built-ins keep their names
  });

  it('estimate shows count, cost and a filled-in sample for a draft, without saving or sending', async () => {
    const c = (await list()).campaigns.find((x) => x.enabled)!;
    const e = (await (await post(`/${c.id}/estimate`, { body: 'Hello {first}!' })).json()) as { count: number; parts: number; costCents: number; sample: string; ids: string[] };
    expect(e.count).toBe(e.ids.length);
    if (e.count) expect(e.sample).toMatch(/^Hello [A-Z]/);
    expect((await list()).campaigns.find((x) => x.id === c.id)!.body).toBe(c.body);
    expect(provider.calls).toHaveLength(0);
  });

  it('a message of your own: add, send to chosen guests, delete; built-ins cannot be deleted', async () => {
    const p = await list();
    const everyone = p.audiences.find((a) => a.label === 'Everyone with a mobile')!;
    const { id } = (await (await post('', { name: 'Shuttle times', audience: everyone.audience })).json()) as { id: string };
    const mine = (await list()).campaigns.find((c) => c.id === id)!;
    expect(mine).toMatchObject({ custom: true, enabled: false, mode: 'manual', audienceLabel: 'Everyone with a mobile' });
    await call(`/${id}`, { method: 'PATCH', body: JSON.stringify({ body: 'Shuttle leaves 11pm, {first}' }), headers: { 'If-Match': String(mine.version) } });
    const two = p.people.filter((x) => x.phone).slice(0, 2).map((x) => x.id);
    clock.set('2026-10-20T12:00'); // daytime: not quiet hours
    const sent = (await (await post(`/${id}/send`, { only: two })).json()) as { queued: number; sent: number };
    expect(sent.queued).toBe(2);
    expect(provider.delivered).toHaveLength(2);
    expect(provider.delivered[0]!.message).toMatch(/^Shuttle leaves 11pm, /);
    expect((await list()).history.find((h) => h.name === 'Shuttle times')).toMatchObject({ count: 2 });
    expect((await call(`/${id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await call(`/${p.campaigns[0]!.id}`, { method: 'DELETE' })).status).toBe(400);
  });

  it("'Send me a test' goes to the couple's own mobile only", async () => {
    const res = await post('/test', { body: 'Test from the admin' });
    expect(res.status).toBe(200);
    expect(provider.delivered.map((m) => m.to)).toEqual([expect.stringContaining('400000001')]);
  });

  it('needs a session; viewers cannot edit or send', async () => {
    const saved = cookie;
    cookie = '';
    expect((await call('')).status).toBe(401);
    cookie = saved;
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    const c = (await list()).campaigns[0]!;
    expect((await post(`/${c.id}/send`, {})).status).toBe(403);
    expect((await post('/test', { body: 'x' })).status).toBe(403);
  });
});

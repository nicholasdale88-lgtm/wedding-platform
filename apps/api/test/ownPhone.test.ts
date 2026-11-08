import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { runEmailCampaigns } from '../src/mail/campaigns';
import { textable } from '../src/sms/audience';
import { runAutopilot, type EngineDeps } from '../src/sms/engine';
import { seedD1, testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

type Ready = { via: string; chosen: boolean; ready: { id: string; name: string; phone: string; message: string; body: string }[]; batches: { message: string; count: number }[]; sent: number };

/** "Send from my own phone" (free): nothing goes from the server; each message waits for the couple's own phone. */
describe('own phone', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let provider: FakeProvider;
  let cookie = '';
  const clock = fakeClock('2026-10-20T10:00');
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: clock.now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/w1${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const ready = async () => (await (await call('/own-phone')).json()) as Ready;

  beforeEach(async () => {
    clock.set('2026-10-20T10:00');
    provider = new FakeProvider();
    t = await testD1();
    await seedD1(t.db, 20, { noPhone: [1, 2] });
    await t.db.prepare(`UPDATE wedding SET plan = 'complete'`).run();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const now = new Date().toISOString();
    await t.db.prepare(`INSERT INTO user (id, email, name, pass_hash, created_at) VALUES ('u1', 'owner@example.com', 'Owner', ?, ?)`).bind(await hashPasscode('valley-2027'), now).run();
    await t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES ('w1', 'u1', 'owner')`).run();
    const login = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    vi.stubGlobal('fetch', async () => {
      throw new Error('nothing may be sent from the server');
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('with a texting number and no choice, texts go as before; choosing "my own phone" sends nothing from the server', async () => {
    expect(await ready()).toMatchObject({ via: 'service', chosen: false, ready: [] });
    expect((await call('/own-phone/send-via', { method: 'PUT', body: JSON.stringify({ sendVia: 'phone' }) })).status).toBe(200);
    const { recipients } = await new D1SmsStore(t.db, '').audience('w1');
    expect(recipients.filter((r) => r.phone).every((r) => r.channel === 'phone' && !textable(r))).toBe(true);

    await runEmailCampaigns(env, deps(env));
    await runAutopilot(deps(env));
    expect(provider.calls).toHaveLength(0); // no texts from the texting number
    const r = await ready();
    expect(r.ready).toHaveLength(18); // everyone with a mobile (two have none)
    expect(r.batches).toEqual([{ message: 'invite', count: 18 }]);
    expect(r.ready[0]!.body).toContain('/w/sophie-and-nicholas/?g=');
    expect(r.ready[0]!.phone).toMatch(/^\+614/);
    // The cron again: nothing doubled.
    await runEmailCampaigns(env, deps(env));
    expect((await ready()).ready).toHaveLength(18);
  });

  it('"Sent, next" marks each one sent (counts and later reminders follow); skip takes it off; viewers can’t', async () => {
    await call('/own-phone/send-via', { method: 'PUT', body: JSON.stringify({ sendVia: 'phone' }) });
    await runEmailCampaigns(env, deps(env));
    const first = (await ready()).ready;
    expect((await call(`/own-phone/${first[0]!.id}/sent`, { method: 'POST', body: '{}' })).status).toBe(200);
    expect((await call(`/own-phone/${first[0]!.id}/sent`, { method: 'POST', body: '{}' })).status).toBe(404); // already done
    expect((await call(`/own-phone/${first[1]!.id}/skip`, { method: 'POST', body: '{}' })).status).toBe(200);
    const after = await ready();
    expect(after.ready).toHaveLength(16);
    expect(after.sent).toBe(1);
    // The Overview's "Needs you" says how many are waiting.
    const ov = (await (await call('/overview')).json()) as { needsYou: { kind: string; title: string }[] };
    expect(ov.needsYou.find((n) => n.kind === 'own-phone')?.title).toBe('16 messages ready to send from your phone');

    // The reminder date: only the guest who has had their invitation (sent from the phone) is reminded.
    clock.set('2027-06-18T10:05');
    await runEmailCampaigns(env, deps(env));
    const reminders = (await ready()).ready.filter((m) => m.message === 'reminder');
    expect(reminders).toHaveLength(1);
    expect(provider.calls).toHaveLength(0);

    // A guest set to text instead goes back to the texting number.
    await t.db.prepare(`UPDATE invitation SET channel = 'text' WHERE id = 'i3'`).run();
    const { recipients } = await new D1SmsStore(t.db, '').audience('w1');
    expect(textable(recipients.find((x) => x.id === 'i3')!)).toBe(true);

    // Viewers can look, not change.
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    expect((await call(`/own-phone/${after.ready[0]!.id}/sent`, { method: 'POST', body: '{}' })).status).toBe(403);
    expect((await call('/own-phone/send-via', { method: 'PUT', body: JSON.stringify({ sendVia: 'service' }) })).status).toBe(403);
  });

  it('with no texting number and nothing chosen, it’s your own phone', async () => {
    await t.db.prepare(`UPDATE wedding SET sms_sender = NULL`).run();
    expect(await ready()).toMatchObject({ via: 'phone', chosen: false });
  });
});

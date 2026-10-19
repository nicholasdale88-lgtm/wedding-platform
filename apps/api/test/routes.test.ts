import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp, scheduled } from '../src/index';
import type { EngineDeps } from '../src/sms/engine';
import { seedD1, testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';
import { phoneOf, SENDER } from './support/fixture';

/** The Worker's HTTP surface: webhook security, fast 200s, and the cron entry point. */
describe('Worker routes', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let provider: FakeProvider;
  let clock: ReturnType<typeof fakeClock>;
  let waits: Promise<unknown>[];
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: clock.now, uuid: () => crypto.randomUUID() });
  const ctx = () => ({ waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException: () => {}, props: {} }) as unknown as ExecutionContext;
  const app = () => createApp(deps);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app().request(path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers }, env, ctx());
  const inbound = (body: string, sender = '0' + phoneOf(3).slice(3)) => ({
    to: '0' + SENDER.slice(3), message: body, sender, received_at: '2026-10-20 10:00:00', type: 'inbound', original_message_id: '', original_custom_ref: '',
  });

  beforeEach(async () => {
    t = await testD1();
    await seedD1(t.db);
    provider = new FakeProvider();
    clock = fakeClock('2026-10-20T10:00');
    waits = [];
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', MM_HOOK_SECRET: 'hook-secret' };
  });
  afterEach(() => t.dispose());

  it('health', async () => {
    const res = await app().request('/api/health', {}, env, ctx());
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects a wrong or missing hook key with 401 (docs/05 test 4)', async () => {
    expect((await post('/api/hooks/mm/inbound?k=wrong', inbound('yes'))).status).toBe(401);
    expect((await post('/api/hooks/mm/inbound', inbound('yes'))).status).toBe(401);
    expect((await post('/api/hooks/mm/status?k=nope', {})).status).toBe(401);
  });

  it('answers 200 straight away, then acts on the reply', async () => {
    const res = await post('/api/hooks/mm/inbound?k=hook-secret', inbound('Yes please'));
    expect(res.status).toBe(200);
    await Promise.all(waits);
    const rsvp = await t.db.prepare(`SELECT attending, via FROM rsvp WHERE invitation_id = 'i3'`).first<{ attending: number; via: string }>();
    expect(rsvp).toEqual({ attending: 1, via: 'sms' });
    expect(provider.delivered.at(-1)!.message).toContain("You're down as coming to the wedding");
  });

  it('a retried webhook is acted on once', async () => {
    await post('/api/hooks/mm/inbound?k=hook-secret', inbound('yes'));
    await post('/api/hooks/mm/inbound?k=hook-secret', inbound('yes'));
    await Promise.all(waits);
    const { n } = (await t.db.prepare(`SELECT COUNT(*) AS n FROM sms_in`).first<{ n: number }>())!;
    expect(n).toBe(1);
    expect(provider.delivered).toHaveLength(1);
  });

  it('requires a valid signature when a signing secret is set', async () => {
    env.MM_SIGNING_SECRET = 'sign';
    const raw = JSON.stringify(inbound('yes'));
    expect((await post('/api/hooks/mm/inbound?k=hook-secret', raw)).status).toBe(401);
    const ts = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('sign'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${raw}`)))]
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    expect((await post('/api/hooks/mm/inbound?k=hook-secret', raw, { 'X-MM-Timestamp': ts, 'X-MM-Signature': sig })).status).toBe(200);
  });

  it('malformed payloads get 200 (so the provider stops retrying) and change nothing', async () => {
    expect((await post('/api/hooks/mm/inbound?k=hook-secret', 'not json')).status).toBe(200);
    const { n } = (await t.db.prepare(`SELECT COUNT(*) AS n FROM sms_in`).first<{ n: number }>())!;
    expect(n).toBe(0);
  });

  it('cron finishes a reply whose processing never ran, then runs the autopilot', async () => {
    // Recorded by the webhook, but the Worker was killed before acting on it.
    await new D1SmsStore(t.db, '').insertInbound({
      id: 'in1', weddingId: null, invitationId: null, providerId: 'p1', type: 'inbound', from: phoneOf(3), to: SENDER, body: 'yes',
      action: 'Received', receivedAt: clock.now().toISOString(),
    });
    const report = await scheduled(env, deps);
    expect(report.swept).toBe(1);
    expect(report.sent).toBe(20); // invitations
    const r = await t.db.prepare(`SELECT action FROM sms_in`).first<{ action: string }>();
    expect(r!.action).toBe('RSVP set to yes');
  });

  it('delivery receipts update the message', async () => {
    await scheduled(env, deps);
    const sent = (await t.db.prepare(`SELECT provider_id FROM sms_out LIMIT 1`).first<{ provider_id: string }>())!;
    await post('/api/hooks/mm/status?k=hook-secret', { message_id: sent.provider_id, status: 'delivered', to: '', message: '', sender: '', received_at: '', custom_ref: '', part_number: 1, total_parts: 1 });
    const row = await t.db.prepare(`SELECT status FROM sms_out WHERE provider_id = ?`).bind(sent.provider_id).first<{ status: string }>();
    expect(row!.status).toBe('delivered');
  });
});

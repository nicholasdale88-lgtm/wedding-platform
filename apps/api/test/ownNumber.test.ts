import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { runEmailCampaigns } from '../src/mail/campaigns';
import { runAutopilot, type EngineDeps } from '../src/sms/engine';
import { seedD1, testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

/**
 * "Send from my own number (automatic)", against a stand-in for Mobile Message's /v1/senders: the link is
 * texted, confirmed on the phone, and then every automatic text goes with the couple's own number as sender.
 */
describe('own number (automatic)', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let provider: FakeProvider;
  let cookie = '';
  /** Mobile Message's side: numbers confirmed as senders, what the next POST answers, and what was asked. */
  let confirmed: Set<string>;
  let postStatus = 200;
  let posts: { number: string; label: string }[] = [];
  const MINE = '0411222333';
  const MINE_E164 = '+61411222333';
  const clock = fakeClock('2026-10-20T10:00');
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: clock.now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, method = 'GET', body?: unknown) =>
    app.request(`/api/a/w/w1${path}`, { method, headers: { 'content-type': 'application/json', cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env, ctx);
  const wedding = () => t.db.prepare(`SELECT sms_sender, json_extract(content, '$.sendVia') AS via, json_extract(content, '$.ownNumber.status') AS status FROM wedding WHERE id = 'w1'`).first<{ sms_sender: string | null; via: string | null; status: string | null }>();
  const senders = () => provider.calls.flatMap((c) => c.messages.map((m) => m.sender));
  const setUp = async () => {
    expect((await call('/own-phone/own-number', 'POST', { mobile: MINE })).status).toBe(200);
    confirmed.add(MINE);
    return (await (await call('/own-phone/own-number/check', 'POST', {})).json()) as { status: string };
  };

  beforeEach(async () => {
    clock.set('2026-10-20T10:00');
    provider = new FakeProvider();
    confirmed = new Set();
    postStatus = 200;
    posts = [];
    t = await testD1();
    await seedD1(t.db, 8);
    // Texts are paid for by the couple: this wedding has bought credits (lib/smsAccount.ts).
    await t.db.prepare(`UPDATE wedding SET plan = 'complete', sms_sender = NULL, wallet_credits = 5000`).run();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', MM_USER: 'u', MM_PASS: 'p' };
    const now = new Date().toISOString();
    await t.db.prepare(`INSERT INTO user (id, email, name, pass_hash, created_at) VALUES ('u1', 'owner@example.com', 'Owner', ?, ?)`).bind(await hashPasscode('valley-2027'), now).run();
    await t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES ('w1', 'u1', 'owner')`).run();
    const login = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (String(url) !== 'https://api.mobilemessage.com.au/v1/senders') throw new Error(`unexpected ${url}`);
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ status: postStatus === 200 ? 'verification_sent' : 'error' }), { status: postStatus });
      }
      return new Response(JSON.stringify({ status: 'success', results: [{ sender: 'Weddings', type: 'alpha' }, ...[...confirmed].map((n) => ({ sender: n, type: 'own' }))] }), { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('link texted, confirmed on the phone, then invitations, reminders and Send now all go from their own number', async () => {
    expect((await call('/own-phone/own-number', 'POST', { mobile: MINE })).status).toBe(200);
    expect(posts).toEqual([{ number: MINE, label: 'sophie-and-nicholas' }]);
    // Not tapped yet: still waiting, and nothing is sent from it.
    expect(((await (await call('/own-phone/own-number/check', 'POST', {})).json()) as { status: string }).status).toBe('pending');
    expect((await wedding())!.sms_sender).toBeNull();
    confirmed.add(MINE);
    expect(((await (await call('/own-phone/own-number/check', 'POST', {})).json()) as { status: string }).status).toBe('active');
    expect(await wedding()).toMatchObject({ sms_sender: MINE_E164, via: 'service', status: 'active' });
    expect(((await (await call('/own-phone')).json()) as { ownNumber: { available: boolean; status: string } }).ownNumber).toMatchObject({ available: true, status: 'active' });

    // Invitations (automatic), from their number.
    await runAutopilot(deps(env));
    expect(provider.calls.length).toBeGreaterThan(0);
    expect(new Set(senders())).toEqual(new Set([MINE_E164]));
    // The reminder date.
    const before = provider.calls.length;
    clock.set('2027-06-18T10:05');
    await runAutopilot(deps(env));
    expect(provider.calls.length).toBeGreaterThan(before);
    expect(provider.calls.slice(before).flatMap((c) => c.messages).some((m) => /gentle reminder/.test(m.message))).toBe(true);
    // Send now.
    const now0 = provider.calls.length;
    await t.db.prepare(`INSERT OR REPLACE INTO rsvp (invitation_id, event_id, attending, count, updated_at) VALUES ('i0', 'e1', 1, 1, ?)`).bind(clock.now().toISOString()).run();
    const sent = (await (await call('/texts/c-rain/send', 'POST', {})).json()) as { sent: number };
    expect(sent.sent).toBeGreaterThan(0);
    expect(provider.calls.length).toBeGreaterThan(now0);
    expect(new Set(senders())).toEqual(new Set([MINE_E164]));
  });

  it('verification problems are explained, and an hour-old link expires', async () => {
    expect((await call('/own-phone/own-number', 'POST', { mobile: '12345' })).status).toBe(400);
    postStatus = 429;
    const busy = await call('/own-phone/own-number', 'POST', { mobile: MINE });
    expect(((await busy.json()) as { error: { message: string } }).error.message).toMatch(/last 5 minutes/);
    postStatus = 500;
    expect(((await (await call('/own-phone/own-number', 'POST', { mobile: MINE })).json()) as { error: { message: string } }).error.message).toMatch(/try again/);
    postStatus = 200;
    await call('/own-phone/own-number', 'POST', { mobile: MINE });
    await t.db.prepare(`UPDATE wedding SET content = json_set(content, '$.ownNumber.requestedAt', ?) WHERE id = 'w1'`).bind(new Date(Date.now() - 2 * 3_600_000).toISOString()).run();
    expect(((await (await call('/own-phone/own-number/check', 'POST', {})).json()) as { status: string }).status).toBe('expired');
    expect((await wedding())!.sms_sender).toBeNull();
    // Already a confirmed sender (409): ready straight away.
    postStatus = 409;
    expect(((await (await call('/own-phone/own-number', 'POST', { mobile: MINE })).json()) as { status: string }).status).toBe('active');
    // Without the texting service connected, it isn't offered.
    env = { ...env, MM_USER: undefined };
    expect(((await (await call('/own-phone')).json()) as { ownNumber: { available: boolean } }).ownNumber.available).toBe(false);
  });

  it('a number that stops being a sender falls back to texting from their own phone (by hand), and nothing goes from it', async () => {
    expect((await setUp()).status).toBe('active');
    confirmed.delete(MINE); // deleted at Mobile Message, or the number changed hands
    await runEmailCampaigns(env, deps(env)); // the cron checks first
    expect(await wedding()).toMatchObject({ sms_sender: null, via: 'phone', status: 'lost' });
    // The invitations wait for them on their own phone instead.
    const ready = (await (await call('/own-phone')).json()) as { ready: unknown[]; ownNumber: { status: string } };
    expect(ready.ready.length).toBeGreaterThan(0);
    expect(ready.ownNumber.status).toBe('lost');
    await runAutopilot(deps(env));
    expect(provider.calls).toHaveLength(0);
  });

  it('stop using my number: back to the free, by-hand way', async () => {
    await setUp();
    expect((await call('/own-phone/own-number', 'DELETE', {})).status).toBe(200);
    expect(await wedding()).toMatchObject({ sms_sender: null, via: 'phone', status: null });
  });
});

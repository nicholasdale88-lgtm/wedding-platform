import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import type { EngineDeps } from '../src/sms/engine';
import { seedD1, testD1 } from './support/d1';
import { ADMIN } from './support/fixture';
import { fakeClock, FakeProvider } from './support/fakes';

type Res = { result: string; channel: string; to?: string; phone?: string; message: string; preview: { kind: string; subject?: string; text: string; html?: string }; sample: string };

/** "Send me a test": exactly what a guest gets, to the couple; never touching a guest, the day's limits or the history. */
describe('send me a test', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let provider: FakeProvider;
  let cookie = '';
  let emails: { to: string[]; subject: string; text: string }[] = [];
  const clock = fakeClock('2026-10-20T10:00');
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: clock.now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const test = async (body: unknown) => {
    const r = await app.request('/api/a/w/w1/test-send', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }, env, ctx);
    return { status: r.status, ...((await r.json()) as Res) };
  };
  /** Nothing about the guests changed: no guest messages, no emails queued, no guest's allowance used. */
  const untouched = async () => {
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM sms_out WHERE invitation_id IS NOT NULL`).first<{ n: number }>())!.n).toBe(0);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM email_out`).first<{ n: number }>())!.n).toBe(0);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM inbox_email`).first<{ n: number }>())!.n).toBe(0);
    expect(await t.db.prepare(`SELECT 1 FROM rate_limit WHERE k = 'mail:w1'`).first()).toBeNull();
  };

  beforeEach(async () => {
    clock.set('2026-10-20T10:00');
    provider = new FakeProvider();
    t = await testD1();
    await seedD1(t.db, 6);
    await t.db.prepare(`UPDATE wedding SET plan = 'complete'`).run();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const now = new Date().toISOString();
    await t.db.prepare(`INSERT INTO user (id, email, name, pass_hash, created_at) VALUES ('u1', 'owner@example.com', 'Owner', ?, ?)`).bind(await hashPasscode('valley-2027'), now).run();
    await t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES ('w1', 'u1', 'owner')`).run();
    const login = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    emails = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (String(url).includes('api.resend.com')) {
        emails.push(JSON.parse(String(init!.body)));
        return new Response('{"id":"x"}', { status: 200 });
      }
      throw new Error(`unexpected ${url}`);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('a text test goes to the couple’s own mobile through the texting number, filled in as a real guest, marked TEST', async () => {
    const r = await test({ what: 'campaign', campaignId: 'c-reminder', channel: 'text' });
    expect(r).toMatchObject({ status: 200, result: 'sent', channel: 'text' });
    expect(r.message).toMatch(/^Test sent to 04/);
    expect(provider.calls).toHaveLength(1);
    const sms = provider.calls[0]!.messages[0]!;
    expect(sms.message).toMatch(/^TEST: Hi Guest\d.*a gentle reminder/);
    expect(sms.message).toContain('/w/sophie-and-nicholas/?g=tok');
    await untouched();
    // The words on screen (not saved yet) are what's tested.
    const draft = await test({ what: 'campaign', campaignId: 'c-reminder', channel: 'text', body: 'Hello {first}!' });
    expect(provider.calls.at(-1)!.messages[0]!.message).toMatch(/^TEST: Hello Guest\d/);
    expect(draft.result).toBe('sent');
  });

  it('own phone: a link to text it to yourself; no texting number needed', async () => {
    await t.db.prepare(`UPDATE wedding SET sms_sender = NULL`).run();
    const r = await test({ what: 'campaign', campaignId: 'c-invite' });
    expect(r).toMatchObject({ result: 'link', channel: 'phone', phone: ADMIN });
    expect(r.preview.text).toMatch(/^TEST: Hi Guest\d/);
    expect(provider.calls).toHaveLength(0);
    await untouched();
  });

  it('with nothing connected, the full preview and what to set up; with email on, it goes to your own email', async () => {
    const off = await test({ what: 'invitation' });
    expect(off.result).toBe('preview');
    expect(off.message).toMatch(/Email isn’t switched on/);
    expect(off.preview.html).toMatch(/\/w\/sophie-and-nicholas\/\?g=tok\d{19}/);
    expect(off.preview.subject).toMatch(/^TEST: /);
    expect(emails).toHaveLength(0);

    env = { ...env, RESEND_API_KEY: 're_test', EMAIL_FROM: 'Weddings <hello@site.example>' };
    const on = await test({ what: 'compose', subject: 'Parking', body: 'There is parking.' });
    expect(on).toMatchObject({ result: 'sent', to: 'owner@example.com' });
    expect(emails[0]).toMatchObject({ to: ['owner@example.com'], subject: 'TEST: Parking', text: 'There is parking.' });
    for (const what of ['digest', 'party', 'invitation']) expect((await test({ what })).result).toBe('sent');
    expect((await test({ what: 'campaign', campaignId: 'c-reminder', channel: 'email' })).preview.subject).toBe('TEST: Sophie & Nicholas: reminder');
    await untouched();
  });

  it('tests have their own small daily allowance; viewers can’t send them', async () => {
    await t.db.prepare(`INSERT INTO rate_limit (k, n, reset_at) VALUES ('test:w1', 20, ?)`).bind(new Date(Date.now() + 3_600_000).toISOString()).run();
    const r = await test({ what: 'campaign', campaignId: 'c-reminder', channel: 'text' });
    expect(r.result).toBe('preview');
    expect(r.message).toMatch(/20 tests today/);
    expect(provider.calls).toHaveLength(0);
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    expect((await test({ what: 'digest' })).status).toBe(403);
  });
});

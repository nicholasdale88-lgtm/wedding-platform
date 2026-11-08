import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { runEmailCampaigns, sendNowEmail } from '../src/mail/campaigns';
import { receiveEmail } from '../src/routes/inbox';
import { recipientsFor, textable } from '../src/sms/audience';
import type { EngineDeps } from '../src/sms/engine';
import { replyD1, seedD1, testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

type Sent = { from: string; to: string[]; subject: string; text: string; reply_to?: string[] };

/** Everything the texts do, by email too (free), mirroring the SMS engine's tests. */
describe('the texts’ messages by email', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let sent: Sent[] = [];
  const clock = fakeClock('2026-10-20T10:00');
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider: new FakeProvider(), now: clock.now, uuid: () => crypto.randomUUID() });
  const run = () => runEmailCampaigns(env, deps(env));
  const to = () => sent.map((s) => s.to[0]).sort();
  const setEmail = (id: string, email: string, channel = '') => t.db.prepare(`UPDATE invitation SET email = ?, channel = ? WHERE id = ?`).bind(email, channel, id).run();
  const queued = async () => (await t.db.prepare(`SELECT invitation_id, status FROM email_out WHERE status = 'queued' ORDER BY created_at`).all<{ invitation_id: string }>()).results;

  beforeEach(async () => {
    clock.set('2026-10-20T10:00');
    t = await testD1();
    await seedD1(t.db, 20, { noPhone: [1, 2] });
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', RESEND_API_KEY: 're_test', EMAIL_FROM: 'The Yes List <hello@site.example>', INBOX_DOMAIN: 'mail.example' };
    sent = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (String(url).includes('api.resend.com')) {
        sent.push(JSON.parse(String(init!.body)));
        return new Response('{"id":"x"}', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    });
    // i1, i2: no mobile, so email. i3: a mobile, an email and no choice: automatic is text and email. i4: email only. i5: both.
    await setEmail('i1', 'g1@example.com');
    await setEmail('i2', 'g2@example.com');
    await setEmail('i3', 'g3@example.com');
    await setEmail('i4', 'g4@example.com', 'email');
    await setEmail('i5', 'g5@example.com', 'both');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('invitations go by email to guests who get email, from the wedding address, never twice; email-only guests get no texts', async () => {
    const r = await run();
    expect(r.sent).toBe(5);
    expect(to()).toEqual(['g1@example.com', 'g2@example.com', 'g3@example.com', 'g4@example.com', 'g5@example.com']);
    const g1 = sent.find((s) => s.to[0] === 'g1@example.com')!;
    expect(g1.from).toBe('"Sophie Bloor & Nicholas Dale" <sophie-and-nicholas@mail.example>');
    expect(g1.reply_to).toEqual(['sophie-and-nicholas@mail.example']);
    expect(g1.subject).toBe('Sophie & Nicholas: invite');
    expect(g1.text).toContain(`https://example.com/w/sophie-and-nicholas/?g=tok${'1'.padStart(19, '0')}`);
    expect(g1.text).not.toMatch(/\bSTOP\b/);
    // Again: nothing new.
    sent = [];
    expect((await run()).sent).toBe(0);
    expect(sent).toHaveLength(0);
    // The texts leave out the email-only guest, and still text the one who chose both.
    const { recipients } = await new D1SmsStore(t.db, '').audience('w1');
    const byId = (id: string) => recipients.find((x) => x.id === id)!;
    expect(textable(byId('i4'))).toBe(false);
    expect(textable(byId('i5'))).toBe(true);
    expect(textable(byId('i3'))).toBe(true);
  });

  it('reminders on the texts’ own dates; past today’s allowance the rest wait (not dropped) and go tomorrow, unless they’ve replied', async () => {
    await run(); // invitations by email first: reminders go only to those already invited
    sent = [];
    clock.set('2027-06-18T10:05'); // the reminder slot (s1)
    await t.db.prepare(`DELETE FROM rate_limit`).run();
    await t.db.prepare(`INSERT INTO rate_limit (k, n, reset_at) VALUES ('mail:w1', 38, ?)`).bind(new Date(Date.now() + 3_600_000).toISOString()).run();
    const r = await run();
    expect(r.sent).toBe(2);
    expect(r.waiting).toBe(3);
    expect(sent.every((s) => /gentle reminder/.test(s.text))).toBe(true);
    const waiting = await queued();
    expect(waiting).toHaveLength(3);
    // One of those waiting replies on the website; the next day only the other is reminded.
    await replyD1(t.db, waiting[0]!.invitation_id, 'e1', true, clock.now());
    await replyD1(t.db, waiting[0]!.invitation_id, 'e2', true, clock.now());
    await t.db.prepare(`DELETE FROM rate_limit`).run(); // a new day's allowance
    sent = [];
    clock.set('2027-06-19T09:00');
    await run();
    expect(sent.filter((s) => /gentle reminder/.test(s.text))).toHaveLength(2); // (the one who replied gets the thank-you instead)
    expect(await queued()).toHaveLength(0);
    const cancelled = await t.db.prepare(`SELECT COUNT(*) AS n FROM email_out WHERE status = 'cancelled'`).first<{ n: number }>();
    expect(cancelled!.n).toBe(1);
  });

  it('campaign emails keep quiet hours; the night-before guide goes to those coming', async () => {
    await replyD1(t.db, 'i1', 'e1', true, clock.now());
    clock.set('2026-10-20T23:30'); // quiet hours
    expect((await run()).sent).toBe(0);
    clock.set('2027-11-17T17:05'); // the night-before slot (s2)
    sent = [];
    await run();
    const guide = sent.find((s) => /see you tomorrow/.test(s.text));
    expect(guide?.to).toEqual(['g1@example.com']);
    expect(guide!.text).toContain('/w/sophie-and-nicholas/tomorrow?g=');
  });

  it('"Send now" emails its audience too, and a plan without texts still emails (free)', async () => {
    const now = new Date().toISOString();
    await t.db.prepare(`INSERT INTO user (id, email, name, pass_hash, created_at) VALUES ('u1', 'owner@example.com', 'Owner', ?, ?)`).bind(await hashPasscode('valley-2027'), now).run();
    await t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES ('w1', 'u1', 'owner')`).run();
    await t.db.prepare(`UPDATE wedding SET plan = 'free' WHERE id = 'w1'`).run(); // a plan without texts
    await replyD1(t.db, 'i1', 'e1', true, clock.now());
    await replyD1(t.db, 'i3', 'e1', true, clock.now());
    const app = createApp(deps);
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
    const login = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const call = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/w1/texts${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
    const res = await call('/c-rain/send', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number; email: { sent: number } };
    expect(body.email.sent).toBe(2); // i1 and i3 (coming, with an email; automatic is text and email)
    expect(body.sent).toBe(0); // the Free plan sends no texts
    expect(to()).toEqual(['g1@example.com', 'g3@example.com']);
    const list = (await (await call('')).json()) as { email: { on: boolean }; campaigns: { key: string; count: number; email: { count: number; sent: number } }[]; people: { id: string; email: boolean }[] };
    expect(list.email.on).toBe(true);
    expect(list.campaigns.find((c) => c.key === 'rain')!.email).toMatchObject({ count: 2, sent: 2 });
    expect(list.people.find((p) => p.id === 'i4')!.email).toBe(true);
    // The same send twice within a couple of minutes (a double tap) is the one send.
    sent = [];
    expect((await sendNowEmail(env, deps(env), 'w1', 'c-rain')).queued).toBe(0);
    expect(sent).toHaveLength(0);
    // SMS audiences leave out email-only guests.
    const store = new D1SmsStore(t.db, '');
    const c = (await store.campaigns('w1')).find((x) => x.key === 'invite')!;
    expect(recipientsFor(c, (await store.audience('w1')).recipients, new Set()).some((r) => r.id === 'i4')).toBe(false);
  });

  it('a guest’s email reply is their RSVP (yes, can’t make it), answered from the wedding address; anything else waits for the couple', async () => {
    const mail = (from: string, text: string, id: string) =>
      receiveEmail({ from, to: 'sophie-and-nicholas@mail.example', raw: new Blob([new TextEncoder().encode(`From: ${from}\r\nSubject: Re: invite\r\nMessage-ID: <${id}@x>\r\n\r\n${text.replace(/\n/g, '\r\n')}`)]).stream(), headers: new Headers() }, env);
    await run(); // makes the address and sends the invitations
    sent = [];
    // i3 is invited to the wedding only.
    const yes = await mail('g3@example.com', "Yes! We'll be there.\n\nOn Tue, 20 Oct 2026, Sophie <sophie-and-nicholas@mail.example> wrote:\n> invite", 'y1');
    expect(yes).toMatchObject({ stored: true, action: 'RSVP set to yes' });
    const rsvp = await t.db.prepare(`SELECT attending FROM rsvp WHERE invitation_id = 'i3' AND event_id = 'e1'`).first<{ attending: number }>();
    expect(rsvp!.attending).toBe(1);
    expect(sent.find((s) => s.to[0] === 'g3@example.com')!.text).toContain('coming');
    // i6, wedding only: "can't make it".
    await setEmail('i6', 'g6@example.com', 'email');
    expect(await mail('g6@example.com', "Sorry, can't make it", 'n1')).toMatchObject({ action: 'RSVP set to no' });
    expect((await t.db.prepare(`SELECT attending FROM rsvp WHERE invitation_id = 'i6' AND event_id = 'e1'`).first<{ attending: number }>())!.attending).toBe(0);
    // Something else: kept for the couple, unread.
    const other = await mail('g3@example.com', 'Can we bring our dog along?', 'q1');
    expect(other).toMatchObject({ stored: true, action: 'Needs you' });
    const row = await t.db.prepare(`SELECT read_at FROM inbox_email WHERE id = ?`).bind(other.id).first<{ read_at: string | null }>();
    expect(row!.read_at).toBeNull();
    // Someone else can't answer for a guest by using their name.
    expect((await mail('stranger@example.org', 'Yes', 's1')).action).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { stripQuoted } from '../src/lib/weddingMail';
import { receiveEmail } from '../src/routes/inbox';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

type Sent = { from: string; to: string[]; subject: string; text: string; reply_to?: string[]; headers?: Record<string, string> };

/** The wedding's own address: made for them, sending from it (capped), email invitations, and replying from Outlook. */
describe('wedding email: sending', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  let sent: Sent[] = [];
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) });
  const mail = (raw: string, to = 'sophie-and-nicholas@mail.example', from = 'x@example.com') => {
    const bytes = new TextEncoder().encode(raw.replace(/\n/g, '\r\n'));
    return receiveEmail({ from, to, raw: new Blob([bytes]).stream(), headers: new Headers() }, env);
  };
  const sentList = async () => ((await (await call('/inbox?sent=1')).json()) as { emails: { subject: string; to: string; sent: boolean; kind: string; guest: string | null }[] }).emails;

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = {
      DB: t.db,
      PUBLIC_BASE_URL: 'https://example.com',
      SESSION_SECRET: 'test-secret-for-sessions-000000',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'The Yes List <hello@site.example>',
      INBOX_DOMAIN: 'mail.example',
    };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    sent = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (String(url).includes('api.resend.com')) {
        sent.push(JSON.parse(String(init!.body)));
        return new Response('{"id":"x"}', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('every wedding gets <its address>@INBOX_DOMAIN: made when the inbox opens, and on sign-up; their own choice stays', async () => {
    const list = (await (await call('/inbox')).json()) as { address: string };
    expect(list.address).toBe('sophie-and-nicholas@mail.example');
    // Emails to it now arrive.
    expect((await mail('From: Someone <who@example.org>\nSubject: Hello\n\nHi')).stored).toBe(true);
    // Their own instead; or none (it stays off, never made again).
    await call('/inbox/settings/address', { method: 'PUT', body: JSON.stringify({ address: 'us@ourwedding.example' }) });
    expect(((await (await call('/inbox')).json()) as { address: string }).address).toBe('us@ourwedding.example');
    await call('/inbox/settings/address', { method: 'PUT', body: JSON.stringify({ address: '' }) });
    expect(((await (await call('/inbox')).json()) as { address: string }).address).toBe('');
    // The app's own reply+ addresses can't be taken.
    expect((await call('/inbox/settings/address', { method: 'PUT', body: JSON.stringify({ address: 'reply+x@mail.example' }) })).status).toBe(400);

    // Sign-up: made straight away.
    const r = await app.request('/api/a/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' }, body: JSON.stringify({ firstName: 'Alex', partnerName: 'Sam', email: 'alex@example.com', passcode: 'long-enough-1', website: '' }) }, env, ctx);
    const { weddingId } = (await r.json()) as { weddingId: string };
    const row = await t.db.prepare(`SELECT json_extract(content, '$.inbox.address') AS a FROM wedding WHERE id = ?`).bind(weddingId).first<{ a: string }>();
    expect(row!.a).toBe('alex-and-sam@mail.example');
  });

  it('without INBOX_DOMAIN nothing is made (they type their own, as before)', async () => {
    env = { ...env, INBOX_DOMAIN: undefined };
    expect(((await (await call('/inbox')).json()) as { address: string }).address).toBe('');
    const s = (await (await call('/inbox/settings')).json()) as { domain: string; replyByEmail: boolean; canSend: boolean };
    expect(s).toMatchObject({ domain: '', replyByEmail: false, canSend: false });
  });

  it('writes and replies from the wedding address (From the couple, Reply-To the address), kept in Sent', async () => {
    await call('/inbox');
    const r = await post('/inbox/send', { to: ['Jess@ValleyBlooms.example', 'sam@example.com'], subject: 'Flowers', body: 'Hello!\nCan we chat?' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ sent: 2, failed: [] });
    expect(sent).toHaveLength(2);
    expect(sent.map((s) => s.to[0])).toEqual(['jess@valleyblooms.example', 'sam@example.com']); // one each: nobody sees the others
    expect(sent[0]!.from).toBe('"Sophie Bloor & Nicholas Dale" <sophie-and-nicholas@mail.example>');
    expect(sent[0]!.reply_to).toEqual(['sophie-and-nicholas@mail.example']);
    const out = await sentList();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ subject: 'Flowers', to: 'jess@valleyblooms.example, sam@example.com', sent: true });
    // Sent mail isn't in the inbox.
    expect(((await (await call('/inbox')).json()) as { emails: unknown[] }).emails).toHaveLength(0);

    // A reply: to whoever wrote, Re: the subject, threaded with their Message-ID.
    const got = await mail('From: Ella Thompson <ella@gmail.com>\nSubject: Parking?\nMessage-ID: <p1@gmail.com>\n\nIs there parking?');
    sent = [];
    expect((await post('/inbox/send', { replyTo: got.id, body: 'Yes, plenty.' })).status).toBe(200);
    expect(sent[0]).toMatchObject({ to: ['ella@gmail.com'], subject: 'Re: Parking?', headers: { 'In-Reply-To': '<p1@gmail.com>' } });
    expect((await sentList()).find((e) => e.subject === 'Re: Parking?')).toMatchObject({ kind: 'guest', guest: 'Ella Thompson', to: 'ella@gmail.com' });

    // Bad addresses and empty messages are refused in plain words.
    expect((await post('/inbox/send', { to: ['not-an-email'], body: 'x' })).status).toBe(400);
    expect((await post('/inbox/send', { to: ['a@b.example'], body: '  ' })).status).toBe(400);
  });

  it('caps a wedding at 40 emails a day (the free allowance is shared), and viewers cannot send', async () => {
    await call('/inbox');
    await t.db.prepare(`INSERT INTO rate_limit (k, n, reset_at) VALUES (?, 39, ?)`).bind(`mail:${wid}`, new Date(Date.now() + 3_600_000).toISOString()).run();
    const two = await post('/inbox/send', { to: ['a@b.example', 'c@d.example'], body: 'Hi' });
    expect(two.status).toBe(429);
    expect(((await two.json()) as { error: { message: string } }).error.message).toMatch(/1 more email today/);
    expect((await post('/inbox/send', { to: ['a@b.example'], body: 'Hi' })).status).toBe(200);
    const full = await post('/inbox/send', { to: ['a@b.example'], body: 'Hi' });
    expect(full.status).toBe(429);
    expect(((await full.json()) as { error: { message: string } }).error.message).toMatch(/tomorrow/);
    expect(sent).toHaveLength(1);

    // A viewer can read, not send.
    const now = new Date().toISOString();
    await t.db.prepare(`INSERT INTO user (id, email, name, pass_hash, created_at) VALUES ('v1', 'viewer@example.com', 'Vi', ?, ?)`).bind(await hashPasscode('valley-2027'), now).run();
    await t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES (?, 'v1', 'viewer')`).bind(wid).run();
    const login = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'viewer@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await call('/inbox')).status).toBe(200);
    expect(((await (await call('/inbox/settings')).json()) as { canWrite: boolean }).canWrite).toBe(false);
    expect((await post('/inbox/send', { to: ['a@b.example'], body: 'Hi' })).status).toBe(403);
    expect((await post('/inbox/invitations', {})).status).toBe(403);
  });

  it('emails each guest with an email their own invitation link; skips those without; never twice', async () => {
    const { guests } = (await (await call('/guests')).json()) as { guests: { id: string; version: number; people: { name: string }[] }[] };
    const ella = guests.find((g) => g.people[0]?.name === 'Ella Thompson')!;
    // The email is saved on their invitation (and comes back with the guest).
    const saved = await call(`/guests/${ella.id}`, { method: 'PATCH', headers: { 'If-Match': String(ella.version) }, body: JSON.stringify({ email: 'Ella@Example.com' }) });
    expect(((await saved.json()) as { guest: { email: string } }).guest.email).toBe('ella@example.com');
    expect((await call(`/guests/${ella.id}`, { method: 'PATCH', headers: { 'If-Match': String(ella.version + 1) }, body: JSON.stringify({ email: 'nope' }) })).status).toBe(400);
    const other = guests.find((g) => g.id !== ella.id)!;
    await t.db.prepare(`UPDATE invitation SET email = 'other@example.com' WHERE id = ?`).bind(other.id).run();

    const before = (await (await call('/inbox/invitations')).json()) as { ready: number; without: string[]; canSend: boolean };
    expect(before).toMatchObject({ ready: 2, canSend: true });
    expect(before.without).toHaveLength(guests.length - 2);
    const r = (await (await post('/inbox/invitations', {})).json()) as { sent: number; left: number; without: string[] };
    expect(r).toMatchObject({ sent: 2, left: 0 });
    expect(r.without).toHaveLength(guests.length - 2);
    const toElla = sent.find((s) => s.to[0] === 'ella@example.com')!;
    const token = (await t.db.prepare(`SELECT token FROM invitation WHERE id = ?`).bind(ella.id).first<{ token: string }>())!.token;
    expect(toElla.text).toContain(`https://example.com/w/sophie-and-nicholas/?g=${token}`);
    expect(toElla.text).toContain('You’re invited, Ella!');
    expect(toElla.from).toContain('<sophie-and-nicholas@mail.example>');
    // Pressed again: nobody gets it twice.
    sent = [];
    expect(((await (await post('/inbox/invitations', {})).json()) as { sent: number }).sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect((await sentList()).filter((e) => e.kind === 'guest')).toHaveLength(2);
  });

  it('invitations stop at the day’s cap and say the rest go tomorrow', async () => {
    await t.db.prepare(`UPDATE invitation SET email = 'g' || substr(id, 1, 8) || '@example.com' WHERE wedding_id = ?`).bind(wid).run();
    await call('/inbox');
    await t.db.prepare(`INSERT INTO rate_limit (k, n, reset_at) VALUES (?, 38, ?)`).bind(`mail:${wid}`, new Date(Date.now() + 3_600_000).toISOString()).run();
    const r = (await (await post('/inbox/invitations', {})).json()) as { sent: number; left: number; message: string };
    expect(r.sent).toBe(2);
    expect(r.left).toBeGreaterThan(0);
    expect(r.message).toMatch(/tomorrow/);
  });

  it('copies go to the main account; their Reply from Outlook goes out from the wedding address, checked', async () => {
    await call('/inbox');
    const got = await mail('From: Ella Thompson <ella@gmail.com>\nSubject: Parking?\nMessage-ID: <p1@gmail.com>\n\nIs there parking?');
    expect(got).toMatchObject({ stored: true, copies: 1 });
    const copy = sent[0]!;
    expect(copy.to).toEqual(['owner@example.com']);
    expect(copy.text).toContain('Is there parking?');
    const replyTo = copy.reply_to![0]!;
    expect(replyTo).toMatch(new RegExp(`^reply\\+${got.id}\\.[0-9a-f]{16}@mail\\.example$`));

    const reply = (from: string, to = replyTo, id = '<r1@owner>') =>
      mail(`From: ${from}\nSubject: Re: Parking?\nMessage-ID: ${id}\n\nYes, plenty of parking.\n\nOn Mon, 1 Mar 2027 at 9:00 am, Ella Thompson <ella@gmail.com> wrote:\n> Is there parking?`, to, from);

    // Not a member of the wedding: dropped. A wrong signature: dropped.
    sent = [];
    expect((await reply('stranger@example.com')).stored).toBe(false);
    expect((await reply('owner@example.com', replyTo.replace(/[0-9a-f]@/, (m) => `${m[0] === '0' ? '1' : '0'}@`))).stored).toBe(false);
    expect((await reply('owner@example.com', `reply+${crypto.randomUUID()}.0123456789abcdef@mail.example`)).stored).toBe(false);
    expect(sent).toHaveLength(0);

    // The member's reply: the new part only, to Ella, from the wedding address, kept in Sent.
    expect((await reply('owner@example.com')).stored).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ['ella@gmail.com'], from: '"Sophie Bloor & Nicholas Dale" <sophie-and-nicholas@mail.example>', headers: { 'In-Reply-To': '<p1@gmail.com>' } });
    expect(sent[0]!.text).toBe('Yes, plenty of parking.');
    expect((await sentList())[0]).toMatchObject({ subject: 'Re: Parking?', to: 'ella@gmail.com' });
    // The same reply delivered twice goes once.
    expect((await reply('owner@example.com')).stored).toBe(false);
    expect(sent).toHaveLength(1);

    // Copies off: nothing copied.
    expect((await call('/inbox/settings/copies', { method: 'PUT', body: JSON.stringify({ userIds: [] }) })).status).toBe(200);
    sent = [];
    expect((await mail('From: Jo <jo@example.org>\nSubject: Hi\n\nHello')).copies).toBe(0);
    expect(sent).toHaveLength(0);
    const s = (await (await call('/inbox/settings')).json()) as { copies: { email: string; on: boolean }[]; replyByEmail: boolean };
    expect(s.replyByEmail).toBe(true);
    expect(s.copies.find((p) => p.email === 'owner@example.com')!.on).toBe(false);
  });

  it('takes the quoted old message off a reply', () => {
    expect(stripQuoted('Sounds good!\n\nOn Tue, 2 Mar 2027, Jess <j@x.com> wrote:\n> old')).toBe('Sounds good!');
    expect(stripQuoted('Thanks\r\n\r\nFrom: Jess\r\nSent: Monday\r\nTo: us\r\nold')).toBe('Thanks');
    expect(stripQuoted('See you then\n-----Original Message-----\nold')).toBe('See you then');
    expect(stripQuoted('Yes\nOn Tue, 2 Mar 2027 at 9:00 am, Jess Lee <j@x.com>\nwrote:\n> old')).toBe('Yes');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Account → Messages: guests write from their page, the couple reads and replies, the guest sees the reply. */
describe('messages', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const admin = (path: string, init: RequestInit = {}) =>
    app.request(`/api/a/w/${wid}/messages${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const guest = (path: string, init: RequestInit = {}) =>
    app.request(`/api/p/sophie-and-nicholas${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers } }, env, ctx);
  const tokenOf = async (name: string) =>
    (await t.db.prepare(`SELECT i.id, i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = ?`).bind(name).first<{ id: string; token: string }>())!;

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

  it('a guest writes, the couple sees it unread, replies, and the guest sees the reply', async () => {
    const ella = await tokenOf('Ella Thompson');
    const sent = await guest('/messages', { method: 'POST', body: JSON.stringify({ token: ella.token, body: 'So happy for you both!', kind: 'support' }) });
    expect(sent.status).toBe(200);
    await guest('/messages', { method: 'POST', body: JSON.stringify({ token: ella.token, body: 'Is there parking for a minibus?', kind: 'question' }) });

    const list = (await (await admin('')).json()) as { threads: { invitationId: string; unread: number; kinds: string[]; last: { body: string } }[] };
    const mine = list.threads.find((x) => x.invitationId === ella.id)!;
    expect(mine).toMatchObject({ unread: 2, last: { body: 'Is there parking for a minibus?' } });
    expect(mine.kinds.sort()).toEqual(['question', 'support']);
    const overview = (await (await app.request(`/api/a/w/${wid}/overview`, { headers: { cookie } }, env, ctx)).json()) as { needsYou: { kind: string; link: string }[] };
    expect(overview.needsYou.find((n) => n.kind === 'inbox')).toMatchObject({ link: 'messages' });

    const open = (await (await admin(`/${ella.id}`)).json()) as { messages: { from: string; body: string }[] };
    expect(open.messages.map((m) => m.body)).toEqual(['So happy for you both!', 'Is there parking for a minibus?']);
    expect((((await (await admin('')).json()) as { threads: { invitationId: string; unread: number }[] }).threads.find((x) => x.invitationId === ella.id))!.unread).toBe(0);

    const reply = await admin(`/${ella.id}`, { method: 'POST', body: JSON.stringify({ body: 'Yes, right beside the ceremony.', sms: false }) });
    expect(reply.status).toBe(200);
    const theirs = (await (await guest(`/messages?g=${ella.token}`)).json()) as { messages: { from: string; body: string }[] };
    expect(theirs.messages.at(-1)).toMatchObject({ from: 'couple', body: 'Yes, right beside the ceremony.' });
  });

  it('only with their own link, nothing empty, and an RSVP note joins the conversation', async () => {
    expect((await guest('/messages?g=' + 'a'.repeat(22))).status).toBe(404);
    expect((await guest('/messages', { method: 'POST', body: JSON.stringify({ token: 'a'.repeat(22), body: 'hi' }) })).status).toBe(404);
    const ella = await tokenOf('Ella Thompson');
    expect((await guest('/messages', { method: 'POST', body: JSON.stringify({ token: ella.token, body: '   ' }) })).status).toBe(400);
    await t.db
      .prepare(
        `INSERT INTO rsvp (invitation_id, event_id, attending, count, answers, message, via, updated_at)
         SELECT ?1, id, 1, 1, '{}', 'We will bring a gift', 'invitation', '2027-01-01T00:00:00.000Z' FROM event WHERE key = 'wedding'
         ON CONFLICT (invitation_id, event_id) DO UPDATE SET message = 'We will bring a gift'`,
      )
      .bind(ella.id)
      .run();
    const open = (await (await admin(`/${ella.id}`)).json()) as { messages: { via: string; body: string }[] };
    expect(open.messages.some((m) => m.via === 'rsvp' && m.body === 'We will bring a gift')).toBe(true);
    expect((await admin(`/${ella.id}`, { method: 'POST', body: JSON.stringify({ body: '' }) })).status).toBe(400);
  });
});

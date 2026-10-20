import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { testD1 } from './support/d1';

/** Customer accounts: your own details (CRM-ready, consent logged), changing email, and inviting people to run the wedding. */
describe('customer accounts', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, cookie?: string) =>
    app.request(path, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.1.1.1', ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  const login = async (email: string, passcode: string) => cookieOf(await call('/api/a/auth/login', { method: 'POST', body: JSON.stringify({ email, passcode }) }));
  const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

  beforeEach(async () => {
    t = await testD1();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-session-secret-0123456789' };
    const now = new Date().toISOString();
    await t.db.batch([
      t.db.prepare(`INSERT INTO user (id, email, pass_hash, created_at) VALUES ('u1', 'owner@example.com', ?, ?)`).bind(await hashPasscode('valley-2027'), now),
      t.db.prepare(`INSERT INTO user (id, email, pass_hash, created_at) VALUES ('u2', 'other@example.com', ?, ?)`).bind(await hashPasscode('other-pass-1'), now),
      t.db.prepare(`INSERT INTO wedding (id, slug, name1, name2, created_at, updated_at) VALUES ('w1', 'a-and-b', 'Alex Smith', 'Blair Jones', ?, ?)`).bind(now, now),
      t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES ('w1', 'u1', 'owner')`),
    ]);
  });
  afterEach(() => t.dispose());

  it('signing in records when; your details save, the mobile is normalised, and marketing consent is logged with a time', async () => {
    const owner = await login('owner@example.com', 'valley-2027');
    const first = (await (await call('/api/a/me/profile', {}, owner)).json()) as { profile: { id: string; lastLoginAt: string | null; marketing: { optIn: boolean } } };
    expect(first.profile).toMatchObject({ id: 'u1', marketing: { optIn: false } });
    expect(first.profile.lastLoginAt).toBeTruthy();

    const res = await call('/api/a/me/profile', json('PUT', { firstName: 'Alex', lastName: 'Smith', mobile: '0412 345 678', state: 'NSW', postcode: '2250', heardFrom: 'Instagram', marketingOptIn: true }), owner);
    expect(res.status).toBe(200);
    const { profile } = (await res.json()) as { profile: Record<string, unknown> & { marketing: { optIn: boolean; at: string } } };
    expect(profile).toMatchObject({ firstName: 'Alex', lastName: 'Smith', mobile: '+61412345678', state: 'NSW', postcode: '2250', heardFrom: 'Instagram' });
    expect(profile.marketing.optIn).toBe(true);
    expect(profile.marketing.at).toBeTruthy();
    const log = await t.db.prepare(`SELECT kind, granted, source FROM consent_log WHERE user_id = 'u1'`).all();
    expect(log.results).toEqual([{ kind: 'marketing', granted: 1, source: 'profile' }]);

    // Saving again without changing the choice adds nothing to the log.
    await call('/api/a/me/profile', json('PUT', { firstName: 'Alexandra' }), owner);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM consent_log`).first<{ n: number }>())!.n).toBe(1);

    expect((await call('/api/a/me/profile', json('PUT', { postcode: '22' }), owner)).status).toBe(400);
    expect((await call('/api/a/me/profile', json('PUT', { mobile: '12' }), owner)).status).toBe(400);
    expect((await call('/api/a/me/profile', json('PUT', { isAdmin: true }), owner)).status).toBe(400); // only known fields
    expect((await call('/api/a/me/profile', {})).status).toBe(401);
  });

  it('changing email needs your passcode and an address no one else has', async () => {
    const owner = await login('owner@example.com', 'valley-2027');
    expect((await call('/api/a/me/email', json('POST', { email: 'new@example.com', passcode: 'wrong' }), owner)).status).toBe(400);
    expect((await call('/api/a/me/email', json('POST', { email: 'other@example.com', passcode: 'valley-2027' }), owner)).status).toBe(409);
    expect((await call('/api/a/me/email', json('POST', { email: 'New@Example.com', passcode: 'valley-2027' }), owner)).status).toBe(200);
    expect((await call('/api/a/auth/login', json('POST', { email: 'new@example.com', passcode: 'valley-2027' }))).status).toBe(200);
  });

  it('an owner invites their partner: a one-time link sets up their account and adds them to the wedding', async () => {
    const owner = await login('owner@example.com', 'valley-2027');
    const inv = await call('/api/a/w/w1/members/invite', json('POST', { email: 'partner@example.com', role: 'owner' }), owner);
    expect(inv.status).toBe(200);
    const { link } = (await inv.json()) as { link: string };
    expect(link).toMatch(/^https:\/\/example\.com\/admin\/join\?t=[A-Za-z0-9_-]{43}$/);
    const token = new URL(link).searchParams.get('t')!;
    // Only a hash is stored.
    expect(JSON.stringify((await t.db.prepare(`SELECT * FROM member_invite`).all()).results)).not.toContain(token);

    expect(await (await call(`/api/a/invite/${token}`)).json()).toEqual({ email: 'partner@example.com', role: 'owner', couple: 'Alex & Blair', hasAccount: false });
    expect((await call(`/api/a/invite/${token}`, json('POST', { passcode: 'short', firstName: 'Sam' }))).status).toBe(400);
    const accepted = await call(`/api/a/invite/${token}`, json('POST', { passcode: 'partner-pass-1', firstName: 'Sam', lastName: 'Lee', marketingOptIn: false }));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ user: { email: 'partner@example.com' }, weddings: [{ id: 'w1', role: 'owner' }] });
    expect(cookieOf(accepted)).toMatch(/^wp_session=/);
    // Once only.
    expect((await call(`/api/a/invite/${token}`, json('POST', { passcode: 'partner-pass-1', firstName: 'Sam' }))).status).toBe(410);

    const list = (await (await call('/api/a/w/w1/members', {}, owner)).json()) as { members: { email: string; name: string; role: string }[]; invites: unknown[] };
    expect(list.members).toEqual([
      expect.objectContaining({ email: 'owner@example.com', role: 'owner' }),
      expect.objectContaining({ email: 'partner@example.com', name: 'Sam Lee', role: 'owner' }),
    ]);
    expect(list.invites).toEqual([]);
  });

  it('someone who already has an account joins with their own passcode', async () => {
    const owner = await login('owner@example.com', 'valley-2027');
    const { link } = (await (await call('/api/a/w/w1/members/invite', json('POST', { email: 'other@example.com', role: 'viewer' }), owner)).json()) as { link: string };
    const token = new URL(link).searchParams.get('t')!;
    expect(await (await call(`/api/a/invite/${token}`)).json()).toMatchObject({ hasAccount: true });
    expect((await call(`/api/a/invite/${token}`, json('POST', { passcode: 'not-theirs-1' }))).status).toBe(400);
    expect((await call(`/api/a/invite/${token}`, json('POST', { passcode: 'other-pass-1' }))).status).toBe(200);
    const viewer = await login('other@example.com', 'other-pass-1');
    // Viewers see who's who but not emails, invitations or sign-in times, and can't invite.
    const seen = (await (await call('/api/a/w/w1/members', {}, viewer)).json()) as { members: { email: string; lastLoginAt: string | null }[]; invites: unknown[] };
    expect(seen.members.find((m) => m.email === 'owner@example.com')).toBeUndefined();
    expect(seen.invites).toEqual([]);
    expect((await call('/api/a/w/w1/members/invite', json('POST', { email: 'x@example.com', role: 'owner' }), viewer)).status).toBe(403);
    expect((await call('/api/a/w/w1/members/u1', json('PATCH', { role: 'viewer' }), viewer)).status).toBe(403);
  });

  it('a wedding always keeps an owner; owners change roles and remove people; anyone can leave', async () => {
    const owner = await login('owner@example.com', 'valley-2027');
    expect((await call('/api/a/w/w1/members/u1', json('PATCH', { role: 'editor' }), owner)).status).toBe(409);
    expect((await call('/api/a/w/w1/members/u1', { method: 'DELETE' }, owner)).status).toBe(409);
    await t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES ('w1', 'u2', 'editor')`).run();
    expect((await call('/api/a/w/w1/members/u2', json('PATCH', { role: 'viewer' }), owner)).status).toBe(200);
    const other = await login('other@example.com', 'other-pass-1');
    expect((await call('/api/a/w/w1/members/u1', { method: 'DELETE' }, other)).status).toBe(403);
    expect((await call('/api/a/w/w1/members/u2', { method: 'DELETE' }, other)).status).toBe(200); // leaving
    expect((await call('/api/a/w/w1/members', {}, other)).status).toBe(404);
  });

  it('a stranger or a made-up link learns nothing', async () => {
    expect((await call('/api/a/invite/not-a-real-token-at-all-000')).status).toBe(410);
    expect((await call('/api/a/w/w1/members')).status).toBe(401);
    const other = await login('other@example.com', 'other-pass-1');
    expect((await call('/api/a/w/w1/members', {}, other)).status).toBe(404);
  });
});

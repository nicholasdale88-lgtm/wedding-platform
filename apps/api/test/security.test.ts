import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { MAX_BODY, readJson } from '../src/lib/security';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Attacks we expect, each one tried on every build. */
describe('security', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const req = (path: string, init: RequestInit = {}) => app.request(`/api${path}`, init, env, ctx);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    req(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const login = async () => {
    const res = await post('/a/auth/login', { email: 'owner@example.com', passcode: 'valley-2027' });
    return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]!, wid: ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id, res };
  };
  const tokenOf = async (name: string) =>
    (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = ?`).bind(name).first<{ token: string }>())!.token;

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', MM_HOOK_SECRET: 'hook-key' };
  });
  afterEach(() => t.dispose());

  it('every API response is uncacheable, unframeable and never sniffed', async () => {
    for (const res of [await req('/health'), await req('/p/sophie-and-nicholas/invite'), await req('/nope'), await req('/a/w/x/overview')]) {
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    }
  });

  it('the session cookie is HttpOnly, Secure and SameSite', async () => {
    const { res } = await login();
    const set = res.headers.get('set-cookie') ?? '';
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    expect(set).toMatch(/SameSite=(Lax|Strict)/i);
  });

  it('cross-site writes are refused, even with a valid session (CSRF)', async () => {
    const { cookie, wid } = await login();
    const evil = await post(`/a/w/${wid}/send-one`, { campaignId: 'x' }, { cookie, origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    const guest = await post('/p/sophie-and-nicholas/rsvp', { token: await tokenOf('Ivy Scott'), events: {} }, { origin: 'https://evil.example' });
    expect(guest.status).toBe(403);
    expect((await post('/a/auth/login', { email: 'owner@example.com', passcode: 'valley-2027' }, { origin: 'https://example.com' })).status).toBe(200);
  });

  it('writes must be JSON: a form post (simple request) is refused', async () => {
    const res = await req('/p/sophie-and-nicholas/find', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=Ivy' });
    expect(res.status).toBe(400);
  });

  it('oversized bodies are refused, whether declared or streamed', async () => {
    const big = 'x'.repeat(MAX_BODY + 1);
    const declared = await req('/p/sophie-and-nicholas/find', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(big.length + 12) }, body: JSON.stringify({ name: big }) });
    expect([400, 413]).toContain(declared.status); // 413 when the runtime keeps Content-Length
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify({ name: big }))); c.close(); } });
    const streamed = await req('/p/sophie-and-nicholas/find', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
    expect(streamed.status).toBe(400);
    expect(await readJson(new Request('https://x', { method: 'POST', body: JSON.stringify({ name: big }) }))).toBeNull();
    expect(await readJson(new Request('https://x', { method: 'POST', body: '{"ok":1}' }))).toEqual({ ok: 1 });
  });

  it('a forged or stale session cookie gets nothing', async () => {
    const { wid } = await login();
    for (const cookie of ['wp_session=forged', 'wp_session=', `wp_session=${'A'.repeat(43)}`]) {
      expect((await req(`/a/w/${wid}/guests`, { headers: { cookie } })).status).toBe(401);
    }
  });

  it("one couple can never see another wedding's data (tenant isolation)", async () => {
    const { cookie } = await login();
    await t.db.prepare(`INSERT INTO wedding (id, slug, name1, name2, created_at, updated_at) VALUES ('other', 'other-wedding', 'A', 'B', '2026-01-01', '2026-01-01')`).run();
    for (const path of ['/a/w/other/overview', '/a/w/other/guests', "/a/w/' OR 1=1 --/guests"]) {
      expect((await req(path, { headers: { cookie } })).status).toBe(404);
    }
  });

  it('login brute force is cut off', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await post('/a/auth/login', { email: 'owner@example.com', passcode: `wrong-${i}-guess` })).status;
    expect(last).toBe(429);
  });

  it('webhooks need the secret key', async () => {
    expect((await post('/hooks/mm/inbound', {})).status).toBe(401);
    expect((await post('/hooks/mm/inbound?k=wrong', {})).status).toBe(401);
    expect((await post('/hooks/mm/inbound?k=hook-key', { junk: true })).status).toBe(200);
  });

  it('injection-shaped input is just text', async () => {
    const res = await post('/p/sophie-and-nicholas/find', { name: "x' OR '1'='1" });
    expect(res.status).toBe(404);
    const tok = await tokenOf('Ivy Scott');
    const msg = '<script>alert(1)</script>"; DROP TABLE rsvp; --';
    expect((await post('/p/sophie-and-nicholas/rsvp', { token: tok, events: { wedding: { attending: true } }, message: msg })).status).toBe(200);
    const row = await t.db.prepare(`SELECT r.message FROM rsvp r JOIN invitation i ON i.id = r.invitation_id WHERE i.token = ? AND r.message != ''`).bind(tok).first<{ message: string }>();
    expect(row!.message).toBe(msg.trim());
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM rsvp`).first<{ n: number }>())!.n).toBeGreaterThan(0);
  });

  it('a guest link reveals only that invitation, never other guests', async () => {
    const res = await req(`/p/sophie-and-nicholas/invite?g=${await tokenOf('Ivy Scott')}`);
    const text = await res.text();
    expect(text).toContain('Ivy Scott');
    expect(text).not.toContain('Margaret Bloor');
    const others = await t.db.prepare(`SELECT phone FROM invitation WHERE token != ? AND phone IS NOT NULL`).bind(await tokenOf('Ivy Scott')).all<{ phone: string }>();
    expect(others.results.length).toBeGreaterThan(5);
    for (const { phone } of others.results) expect(text).not.toContain(phone); // no other guest's mobile
  });
});

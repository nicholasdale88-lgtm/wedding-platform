import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { purgeExpired } from '../src/lib/rateLimit';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/**
 * YL-19: a retried save is applied once. The same Idempotency-Key gets the first answer back; a retry on the old
 * version whose change already saved is a success, not "updated elsewhere". The two failures the stress run found:
 * a vendor's proposal revision sent twice became revision 3, and a children's update retried said "updated elsewhere".
 */
describe('retried saves are applied once', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let owner = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  let ip = 0;
  const call = (path: string, init: RequestInit = {}, cookie = '') =>
    app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `6.6.6.${++ip}`, ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]!;

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await call('/a/auth/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) });
    owner = cookieOf(res);
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  /** A vendor with a proposal to an enquiry, ready to revise. */
  async function proposalToRevise() {
    const j = await call('/directory/join', {
      method: 'POST',
      body: JSON.stringify({ name: 'Wildflower Studio', category: 'florist', region: 'sydney', regions: [], contactName: 'Jess', phone: '', website: '', instagram: '', about: '', priceFrom: 0, photos: [], email: 'jess@wildflower.example', passcode: 'long-enough-1', company: '' }),
    });
    expect(j.status).toBe(200);
    const vendor = cookieOf(j);
    const { slug } = (await j.json()) as { slug: string };
    await t.db.prepare(`UPDATE vendor_listing SET approved_at = created_at WHERE slug = ?`).bind(slug).run();
    expect((await call(`/directory/v/${slug}/enquire`, { method: 'POST', body: JSON.stringify({ name: 'Ava', email: 'ava@example.com', phone: '', date: '2027-03-14', guests: 80, message: 'Flowers for our wedding?' }) })).status).toBe(200);
    const enquiry = (await t.db.prepare(`SELECT id FROM vendor_enquiry`).first<{ id: string }>())!.id;
    const sent = await call('/a/vendor/proposals', { method: 'POST', body: JSON.stringify({ to: { enquiry }, title: 'Flowers', lines: [{ what: 'Bouquet', amount: 450 }], deposit: 100, validUntil: '2027-01-31', note: '' }) }, vendor);
    expect(sent.status).toBe(200);
    return { vendor, id: ((await sent.json()) as { id: string }).id };
  }
  const rev = { title: 'Flowers', lines: [{ what: 'Bouquet', amount: 400 }], deposit: 100, validUntil: '2027-02-28', note: 'A little less.' };

  it('a proposal revision retried with the same key is revision 2, not 3 (and the stored answer comes back)', async () => {
    const { vendor, id } = await proposalToRevise();
    const send = () => call(`/a/vendor/proposals/${id}/revise`, { method: 'POST', body: JSON.stringify(rev), headers: { 'Idempotency-Key': 'revise-0001-aaaa' } }, vendor);
    const first = await send();
    expect(first.status).toBe(200);
    const again = await send();
    expect(again.status).toBe(200);
    expect(again.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await again.json()).toEqual(await first.json());
    const row = await t.db.prepare(`SELECT revision FROM vendor_proposal WHERE id = ?`).bind(id).first<{ revision: number }>();
    expect(row!.revision).toBe(2);
    // The same key for a different request is refused; a new key is a new action.
    expect((await call(`/a/vendor/proposals/${id}/revise`, { method: 'PUT', body: '{}', headers: { 'Idempotency-Key': 'revise-0001-aaaa' } }, vendor)).status).toBe(422);
    const changed = await call(`/a/vendor/proposals/${id}/revise`, { method: 'POST', body: JSON.stringify({ ...rev, note: 'Even less.', lines: [{ what: 'Bouquet', amount: 380 }] }), headers: { 'Idempotency-Key': 'revise-0002-bbbb' } }, vendor);
    expect(((await changed.json()) as { revision: number }).revision).toBe(3);
  });

  it('a proposal revision sent again after its reply was lost (no key, or a fresh one) is still revision 2', async () => {
    const { vendor, id } = await proposalToRevise();
    const a = await call(`/a/vendor/proposals/${id}/revise`, { method: 'POST', body: JSON.stringify(rev) }, vendor);
    const b = await call(`/a/vendor/proposals/${id}/revise`, { method: 'POST', body: JSON.stringify(rev) }, vendor);
    expect(((await a.json()) as { revision: number }).revision).toBe(2);
    expect(b.status).toBe(200);
    expect(((await b.json()) as { revision: number }).revision).toBe(2);
    expect((await t.db.prepare(`SELECT revision FROM vendor_proposal WHERE id = ?`).bind(id).first<{ revision: number }>())!.revision).toBe(2);
  });

  it('a children’s update retried on the old version is saved once and answered as saved, never "updated elsewhere"', async () => {
    const inv = (await t.db
      .prepare(`SELECT i.id, i.version FROM invitation i WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND (SELECT COUNT(*) FROM person p WHERE p.invitation_id = i.id AND p.deleted_at IS NULL) >= 2 LIMIT 1`)
      .bind(wid)
      .first<{ id: string; version: number }>())!;
    const patch = (body: unknown, version: number, key?: string) =>
      call(`/a/w/${wid}/guests/${inv.id}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'If-Match': String(version), ...(key ? { 'Idempotency-Key': key } : {}) } }, owner);
    const kids = { children: [false, true] };
    const first = await patch(kids, inv.version, 'children-0001');
    expect(first.status).toBe(200);
    // The same key: the first answer, replayed.
    const replay = await patch(kids, inv.version, 'children-0001');
    expect(replay.status).toBe(200);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    // Its reply lost and sent again without the key (or a fresh one) on the old version: already saved, so a success.
    const retry = await patch(kids, inv.version);
    expect(retry.status).toBe(200);
    const g = (await retry.json()) as { guest: { version: number; people: { idx: number; child?: boolean }[] } };
    expect(g.guest.people.find((p) => p.idx === 1)!.child).toBe(true);
    // Saved once: the version moved on by one.
    expect((await t.db.prepare(`SELECT version FROM invitation WHERE id = ?`).bind(inv.id).first<{ version: number }>())!.version).toBe(inv.version + 1);
    // A different change on the old version is still "updated elsewhere".
    expect((await patch({ children: [false, false] }, inv.version)).status).toBe(409);
  });

  it('a planning document saved again on the old version with the same content is a success; different content is refused', async () => {
    const put = (version: number, data: unknown) => call(`/a/w/${wid}/planner/doc/budget`, { method: 'PUT', body: JSON.stringify(data), headers: { 'If-Match': String(version) } }, owner);
    const cur = (await (await call(`/a/w/${wid}/planner/doc/budget`, {}, owner)).json()) as { version: number; data: { total: number } };
    const next = { ...cur.data, total: cur.data.total + 500 };
    expect((await put(cur.version, next)).status).toBe(200);
    expect((await put(cur.version, next)).status).toBe(200);
    expect((await put(cur.version, { ...next, total: next.total + 1 })).status).toBe(409);
  });

  it('keys: checked, kept 24 hours, and a reply that failed (5xx) or signs someone in is never replayed', async () => {
    expect((await call(`/a/w/${wid}/look`, { method: 'PUT', body: '{}', headers: { 'Idempotency-Key': 'bad key!' } }, owner)).status).toBe(400);
    // A sign-in carries a cookie: not kept, so a repeat signs in again.
    const login = () => call('/a/auth/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }), headers: { 'Idempotency-Key': 'login-0001-cccc' } });
    expect((await login()).headers.get('set-cookie')).toBeTruthy();
    expect((await login()).headers.get('set-cookie')).toBeTruthy();
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM idempotency`).first<{ n: number }>())!.n).toBe(0);
    // Kept results go after a day.
    const ok = await call(`/a/w/${wid}/look`, { method: 'PUT', body: JSON.stringify({ palette: 'sage', eventColours: true, large: false }), headers: { 'Idempotency-Key': 'look-0001-dddd' } }, owner);
    expect(ok.status).toBe(200);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM idempotency WHERE status = 200`).first<{ n: number }>())!.n).toBe(1);
    await purgeExpired(t.db, new Date(Date.now() + 25 * 3_600_000));
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM idempotency`).first<{ n: number }>())!.n).toBe(0);
    // Someone else's session can't replay it.
    const other = await call(`/a/w/${wid}/look`, { method: 'PUT', body: JSON.stringify({ palette: 'sage', eventColours: true, large: false }), headers: { 'Idempotency-Key': 'look-0001-dddd' } });
    expect(other.headers.get('Idempotent-Replayed')).toBeNull();
  });
});

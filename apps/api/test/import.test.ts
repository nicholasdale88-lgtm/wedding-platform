import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Guests → Import: check first, never double anyone, add in whole guests. */
describe('guest import', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const imp = (rows: unknown[], dry = false) =>
    app.request(`/api/a/w/${wid}/guests/import${dry ? '?dry=1' : ''}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ rows }) }, env, ctx);
  type Res = { added: number; wouldAdd: number; skipped: { row: number; reason: string }[]; problems: { row: number; reason: string }[] };
  const count = async () => (await t.db.prepare(`SELECT COUNT(*) AS n FROM invitation WHERE deleted_at IS NULL`).first<{ n: number }>())!.n;

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

  it('a dry run reports what would happen and adds nobody', async () => {
    const before = await count();
    const r = (await (await imp([{ people: ['Alex New', 'Jamie New'], phone: '0412 345 678' }], true)).json()) as Res;
    expect(r).toMatchObject({ added: 0, wouldAdd: 1 });
    expect(await count()).toBe(before);
  });

  it('adds whole guests with their people, events and seats; skips anyone already on the list', async () => {
    const before = await count();
    const rows = [
      { people: ['Alex New', 'Jamie New'], phone: '0412 345 678' },
      { people: ['Pat Solo'], invited: ['wedding'], seats: 2 },
      { people: ['margaret  BLOOR'] }, // already on the list (any case and spacing)
      { people: ['Pat Solo'] }, // twice in the same file
    ];
    const r = (await (await imp(rows)).json()) as Res;
    expect(r.added).toBe(2);
    expect(r.skipped.map((s) => s.row)).toEqual([3, 4]);
    expect(await count()).toBe(before + 2);
    const pat = await t.db.prepare(
      `SELECT i.seats_held, (SELECT GROUP_CONCAT(e.key) FROM invite_event ie JOIN event e ON e.id = ie.event_id WHERE ie.invitation_id = i.id) AS ev
         FROM invitation i JOIN person p ON p.invitation_id = i.id WHERE p.name = 'Pat Solo'`,
    ).first();
    expect(pat).toEqual({ seats_held: 2, ev: 'wedding' });
    const alex = await t.db.prepare(`SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.phone = '+61412345678'`).first<{ n: number }>();
    expect(alex!.n).toBe(2);
  });

  it('any bad row stops the whole import, with the row and the reason', async () => {
    const before = await count();
    const res = await imp([{ people: ['Fine Person'] }, { people: ['Bad Mobile'], phone: '12345' }, { people: ['  '] }, { people: ['Who'], invited: ['brunch'] }]);
    expect(res.status).toBe(400);
    const r = (await res.json()) as Res;
    expect(r.problems.map((p) => p.row)).toEqual([2, 3, 4]);
    expect(r.problems[0]!.reason).toMatch(/doesn't look Australian/);
    expect(await count()).toBe(before);
  });

  it('handles a big list in whole-guest batches', async () => {
    const before = await count();
    const rows = Array.from({ length: 300 }, (_, i) => ({ people: [`Guest ${i}`, `Partner ${i}`], phone: `04${String(10_000_000 + i).padStart(8, '0')}` }));
    const r = (await (await imp(rows)).json()) as Res;
    expect(r.added).toBe(300);
    expect(await count()).toBe(before + 300);
    const orphans = await t.db.prepare(`SELECT COUNT(*) AS n FROM invitation i WHERE NOT EXISTS (SELECT 1 FROM person p WHERE p.invitation_id = i.id)`).first<{ n: number }>();
    expect(orphans!.n).toBe(0);
  });
});

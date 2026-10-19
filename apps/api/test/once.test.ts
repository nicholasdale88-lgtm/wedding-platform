import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import removeSamples from '../../../scripts/once/remove-sample-guests.sql?raw';
import { buildSeed } from '../src/seed/build';
import { statements, testD1 } from './support/d1';

/** scripts/once/*.sql: one-time fixes the deploy runs against the live database. */
describe('one-time: remove the sample guests', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  const run = async () => {
    for (const s of statements(removeSamples)) await t.db.prepare(s).run();
  };
  const live = async () => (await t.db.prepare(`SELECT COUNT(*) AS n FROM invitation WHERE deleted_at IS NULL`).first<{ n: number }>())!.n;

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'o@example.com', ownerPassHash: 'x', now: new Date('2026-10-01T00:00:00Z') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    // A real guest the couple added afterwards.
    await t.db.prepare(`INSERT INTO invitation (id, wedding_id, token, created_at, updated_at) SELECT 'real1', id, 'RRRRRRRRRRRRRRRRRRRRRR', '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z' FROM wedding`).run();
    await t.db.prepare(`INSERT INTO person (id, invitation_id, idx, name) VALUES ('rp1', 'real1', 0, 'Real Guest')`).run();
  });
  afterEach(() => t.dispose());

  it('soft-deletes every sample guest and their fake texts, and keeps guests added later', async () => {
    expect(await live()).toBe(seedJson.sampleGuests.length + 1);
    await run();
    expect(await live()).toBe(1);
    const left = await t.db.prepare(`SELECT id FROM invitation WHERE deleted_at IS NULL`).first<{ id: string }>();
    expect(left!.id).toBe('real1');
    const texts = await t.db.prepare(`SELECT COUNT(*) AS n FROM sms_out o JOIN invitation i ON i.id = o.invitation_id WHERE i.deleted_at IS NOT NULL`).first<{ n: number }>();
    expect(texts!.n).toBe(0);
    const seated = await t.db.prepare(`SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.deleted_at IS NOT NULL AND p.table_id IS NOT NULL`).first<{ n: number }>();
    expect(seated!.n).toBe(0);
    // Recoverable: the rows are still there, just marked deleted.
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM invitation`).first<{ n: number }>())!.n).toBe(seedJson.sampleGuests.length + 1);
  });

  it('runs once only: guests added after it are safe forever', async () => {
    await run();
    await t.db.prepare(`UPDATE invitation SET deleted_at = NULL WHERE id != 'real1'`).run(); // e.g. restored by hand
    await run();
    expect(await live()).toBe(seedJson.sampleGuests.length + 1);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM audit WHERE action = 'cleanup.sample-guests'`).first<{ n: number }>())!.n).toBe(1);
  });

  it('a fresh live seed has no sample guests at all', async () => {
    const t2 = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'o@example.com', ownerPassHash: 'x', sampleGuests: false });
    await t2.db.batch(stmts.map((s) => t2.db.prepare(s.sql).bind(...s.params)));
    expect((await t2.db.prepare(`SELECT COUNT(*) AS n FROM invitation`).first<{ n: number }>())!.n).toBe(0);
    await t2.dispose();
  });
});

import { zonedToUtc } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { runDigests } from '../src/lib/digest';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** The couple's daily summary email: about 6pm their time, once a day, only with news, to the owners. */
describe('daily summary email', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const sent: { to: string[]; subject: string; text: string }[] = [];

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', RESEND_API_KEY: 're_test', EMAIL_FROM: 'Weddings <hello@example.com>' };
    sent.length = 0;
    vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as { to: string[]; subject: string; text: string });
      return new Response('{}', { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('sends who replied since the last one at about 6pm, once a day, and nothing without news', async () => {
    const w = (await t.db.prepare(`SELECT id, timezone FROM wedding LIMIT 1`).first<{ id: string; timezone: string }>())!;
    const evening = zonedToUtc('2027-03-01T18:20', w.timezone);
    const morning = zonedToUtc('2027-03-01T09:00', w.timezone);
    // A reply this afternoon.
    const inv = (await t.db.prepare(`SELECT i.id FROM invitation i WHERE i.wedding_id = ? AND i.deleted_at IS NULL LIMIT 1`).bind(w.id).first<{ id: string }>())!;
    const ev = (await t.db.prepare(`SELECT id FROM event WHERE wedding_id = ? ORDER BY sort LIMIT 1`).bind(w.id).first<{ id: string }>())!;
    await t.db
      .prepare(`INSERT INTO rsvp (invitation_id, event_id, attending, count, updated_at) VALUES (?, ?, 1, 2, ?) ON CONFLICT (invitation_id, event_id) DO UPDATE SET attending = 1, count = 2, updated_at = excluded.updated_at`)
      .bind(inv.id, ev.id, new Date(evening.getTime() - 3 * 3_600_000).toISOString())
      .run();

    expect(await runDigests(env, morning)).toEqual({ due: 0, sent: 0 }); // not before 6pm
    const first = await runDigests(env, evening);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.to).toEqual(['owner@example.com']);
    expect(sent[0]!.text).toMatch(/Yes from .+ \(2 coming\)\./);
    expect(sent[0]!.text).toContain('https://example.com/admin');
    // Once a day.
    expect(await runDigests(env, new Date(evening.getTime() + 30 * 60_000))).toEqual({ due: 0, sent: 0 });
    // The next evening, with no news since: nothing sent.
    sent.length = 0;
    await t.db.prepare(`UPDATE message SET read_at = ? WHERE read_at IS NULL`).bind(evening.toISOString()).run();
    await t.db.prepare(`UPDATE sms_in SET handled = 1`).run();
    await t.db.prepare(`UPDATE wedding SET content = json_set(content, '$.digestAt', ?)`).bind(new Date(evening.getTime() + 86_400_000 - 60_000).toISOString()).run();
    const next = await runDigests(env, new Date(evening.getTime() + 86_400_000));
    expect(next.due).toBe(1);
    expect(sent.filter((m) => /Yes from/.test(m.text))).toEqual([]);
  });

  it('can be switched off, and sends nothing while the site has no email', async () => {
    const w = (await t.db.prepare(`SELECT id, timezone FROM wedding LIMIT 1`).first<{ id: string; timezone: string }>())!;
    const evening = zonedToUtc('2027-03-01T18:20', w.timezone);
    await t.db.prepare(`UPDATE wedding SET content = json_set(content, '$.digestOff', 1)`).run();
    expect(await runDigests(env, evening)).toEqual({ due: 0, sent: 0 });
    await t.db.prepare(`UPDATE wedding SET content = json_set(content, '$.digestOff', 0)`).run();
    expect(await runDigests({ ...env, RESEND_API_KEY: undefined }, evening)).toEqual({ due: 0, sent: 0 });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import { D1SmsStore } from '../src/db/smsStore';
import { runAutopilot } from '../src/sms/engine';
import { renderFor } from '../src/sms/render';
import { buildSeed, toSqlText, type Statement } from '../src/seed/build';
import { testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

/** M1.3: tenant #1 loads from seed/sophie-nicholas.json and the SMS engine runs on it as-is. */
describe('seed', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  beforeEach(async () => { t = await testD1(); });
  afterEach(() => t.dispose());

  const build = () => buildSeed(seedJson, { ownerEmail: 'Owner@Example.com', ownerPassHash: 'pbkdf2$1$x$y', adminMobile: '0411 000 000', now: new Date('2026-10-19T00:00:00Z') });
  const apply = async (stmts: Statement[]) => { await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params))); };
  const count = async (sql: string) => (await t.db.prepare(sql).first<{ n: number }>())!.n;
  const one = <T>(sql: string, ...p: unknown[]) => t.db.prepare(sql).bind(...p).first<T>();

  it('loads the wedding, owner, events, guests, campaigns and seating', async () => {
    await apply(build());
    expect(await count(`SELECT COUNT(*) n FROM wedding`)).toBe(1);
    expect(await one(`SELECT email FROM user`)).toEqual({ email: 'owner@example.com' });
    expect(await one(`SELECT role FROM membership`)).toEqual({ role: 'owner' });
    expect(await count(`SELECT COUNT(*) n FROM event`)).toBe(2);
    expect(await count(`SELECT COUNT(*) n FROM invitation`)).toBe(22);
    expect(await count(`SELECT COUNT(*) n FROM campaign`)).toBe(8);
    expect(await count(`SELECT COUNT(*) n FROM campaign_slot`)).toBe(8); // 3 reminders, 2 ride, 2 night-before, 1 photos
    expect(await count(`SELECT COUNT(*) n FROM seat`)).toBe(Object.keys(seedJson.exampleSeating.seats).length);
    expect(await one(`SELECT pending_label FROM event WHERE sort = 0`)).toEqual({ pending_label: 'the wedding' });
  });

  it('turns local Sydney times into UTC', async () => {
    await apply(build());
    expect(await one(`SELECT starts_at FROM event WHERE sort = 0`)).toEqual({ starts_at: '2027-11-18T03:00:00.000Z' }); // 2pm AEDT
    const night = await one<{ send_at: string }>(`SELECT s.send_at FROM campaign_slot s JOIN campaign c ON c.id = s.campaign_id WHERE c.key = 'nightW'`);
    expect(night!.send_at).toBe('2027-11-17T06:00:00.000Z'); // 5pm AEDT
  });

  it('attaches dietary notes to the person they name, otherwise the main contact', async () => {
    await apply(build());
    const diet = async (name: string) => (await one<{ diet: string }>(`SELECT diet FROM person WHERE name = ?`, name))!.diet;
    expect(await diet('Olivia Chen')).toBe('Olivia is vegetarian');
    expect(await diet('James Dale')).toBe('');
    expect(await diet('Lily Wilson')).toBe('Lily (6) has a severe peanut allergy');
    expect(await diet('Ella Thompson')).toBe('Coeliac, strictly gluten free');
  });

  it('keeps replies per event, with the ride answer on the second event only when attending', async () => {
    await apply(build());
    const rows = (await t.db
      .prepare(`SELECT e.sort, r.attending, r.answers FROM rsvp r JOIN event e ON e.id = r.event_id JOIN person p ON p.invitation_id = r.invitation_id AND p.idx = 0 WHERE p.name = 'Margaret Bloor' ORDER BY e.sort`)
      .all<{ sort: number; attending: number; answers: string }>()).results;
    expect(rows).toEqual([
      { sort: 0, attending: 1, answers: '{}' },
      { sort: 1, attending: 1, answers: '{"ride":"No, not riding"}' },
    ]);
  });

  it('gives every invitation a fresh 22-character token', async () => {
    await apply(build());
    const { results } = await t.db.prepare(`SELECT token FROM invitation`).all<{ token: string }>();
    expect(results.every((r) => /^[A-Za-z0-9_-]{22}$/.test(r.token))).toBe(true);
  });

  it('the autopilot only invites guests the prototype had not texted yet', async () => {
    await apply(build());
    const clock = fakeClock('2026-10-20T09:00');
    const provider = new FakeProvider();
    const store = new D1SmsStore(t.db, 'https://example.com');
    await t.db.prepare(`UPDATE wedding SET sms_sender = '+61400000001', invites_from = '2026-01-01T00:00:00.000Z'`).run(); // invitations already open (the prototype sent them)
    await runAutopilot({ store, provider, now: clock.now, uuid: () => crypto.randomUUID() });
    // Ivy Scott has a mobile and no invite yet; Evie Taylor has no mobile. Recent replies get thank-yous only if within 7 days.
    const invites = provider.delivered.filter((m) => m.message.includes('Your invitation and RSVP'));
    expect(invites.map((m) => m.to)).toEqual(['0429736015']);
  });

  it('night-before texts carry each guest their own guide link, with nothing left unfilled', async () => {
    await apply(build());
    const store = new D1SmsStore(t.db, 'https://example.com');
    const w = (await store.weddings())[0]!;
    const { events, recipients } = await store.audience(w.id);
    const both = recipients.find((r) => r.invited.length === 2)!;
    const body = async (key: string) => (await store.campaigns(w.id)).find((c) => c.key === key)!.body;
    const night = renderFor(await body('nightW'), w, events, both, { footer: true });
    const night30 = renderFor(await body('nightB'), w, events, both, { footer: true });
    expect(night.body).toContain(`https://example.com/w/sophie-and-nicholas/tomorrow?g=${both.token}`);
    expect(night30.body).toContain(`https://example.com/w/sophie-and-nicholas/tomorrow/30th?g=${both.token}`);
    expect([...night.unfilled, ...night30.unfilled]).toEqual([]);
  });

  it('the .sql file version loads identically', async () => {
    const stmts = build();
    for (const line of toSqlText(stmts).split('\n')) await t.db.prepare(line).run();
    expect(await count(`SELECT COUNT(*) n FROM person`)).toBe(stmts.filter((s) => s.sql.includes('INTO person')).length);
    const guide = await one<{ guide: string }>(`SELECT guide FROM wedding`);
    expect(JSON.parse(guide!.guide)).toEqual(seedJson.guide);
  });

  it('rejects a malformed seed file before writing anything', () => {
    expect(() => buildSeed({ wedding: {} }, { ownerEmail: 'a@b.c', ownerPassHash: 'x' })).toThrow();
  });
});

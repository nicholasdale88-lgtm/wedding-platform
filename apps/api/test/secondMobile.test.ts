import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import { estimate, runAutopilot, type EngineDeps } from '../src/sms/engine';
import { handleInbound } from '../src/sms/inbound';
import { seedD1, testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';
import { phoneOf, SENDER } from './support/fixture';

/** Two mobiles on one invitation (each of a couple): both get the texts, each STOP counts alone, either can reply. */
describe('a second mobile', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let d: EngineDeps;
  let provider: FakeProvider;
  let clock: ReturnType<typeof fakeClock>;
  const SECOND = '+61499111222';
  const SECOND4 = '+61499111444';
  const local = (e164: string) => '0' + e164.slice(3);
  const to = (e164: string) => provider.delivered.filter((m) => m.to === local(e164));
  const text = (from: string, body: string, id: string) => handleInbound(d, { from, to: SENDER, body, receivedAt: '', type: 'inbound', providerId: id });

  beforeEach(async () => {
    t = await testD1();
    await seedD1(t.db);
    // i0 (the wedding only, two people) and i4 (both events, two people) each have a second mobile.
    await t.db.batch([
      t.db.prepare(`UPDATE invitation SET phone2 = ? WHERE id = 'i0'`).bind(SECOND),
      t.db.prepare(`UPDATE invitation SET phone2 = ? WHERE id = 'i4'`).bind(SECOND4),
    ]);
    let n = 0;
    clock = fakeClock();
    provider = new FakeProvider();
    d = { store: new D1SmsStore(t.db, 'https://example.com', () => `id${++n}`), provider, now: clock.now, uuid: () => `u${++n}` };
  });
  afterEach(() => t.dispose());

  it('two numbers get two texts: the same invitation, with the household’s own link', async () => {
    clock.set('2026-10-20T09:00');
    await runAutopilot(d);
    expect(provider.delivered).toHaveLength(22); // 20 invitations, two of them to two mobiles
    const [a] = to(phoneOf(0));
    const [b] = to(SECOND);
    expect(a?.message).toBeTruthy();
    expect(b?.message).toBe(a?.message);
    expect(provider.duplicates()).toEqual([]);
    // Counts and costs are texts, not households.
    const { recipients } = await d.store.audience('w1');
    expect(recipients.find((r) => r.id === 'i0')).toMatchObject({ phone: phoneOf(0), phone2: SECOND, optOut2: false });
    const reminder = await estimate(d, 'w1', 'c-reminder');
    expect(reminder.count).toBe(reminder.ids.length + 2);
  });

  it('STOP from one number still texts the other', async () => {
    clock.set('2026-10-20T09:00');
    await runAutopilot(d);
    clock.set('2026-10-21T10:00');
    expect(await text(SECOND, 'STOP', 'p1')).toBe('Opted out');
    expect(await text(phoneOf(4), 'STOP', 'p2')).toBe('Opted out');
    const before = provider.delivered.length;
    clock.set('2027-06-18T10:00');
    await runAutopilot(d);
    const reminders = provider.delivered.slice(before);
    expect(reminders.some((m) => m.to === local(phoneOf(0)))).toBe(true); // i0's first mobile still gets it
    expect(reminders.some((m) => m.to === local(SECOND))).toBe(false); // its second said STOP
    expect(reminders.some((m) => m.to === local(SECOND4))).toBe(true); // i4's first said STOP: the second still gets it
    expect(reminders.some((m) => m.to === local(phoneOf(4)))).toBe(false);
  });

  it('a YES from the second number records the household’s reply and is answered on that number', async () => {
    clock.set('2026-10-20T09:00');
    await runAutopilot(d);
    clock.set('2026-10-20T10:00');
    expect(await text(SECOND, 'Yes we will be there', 'p3')).toBe('RSVP set to yes');
    const r = await t.db.prepare(`SELECT attending, count FROM rsvp WHERE invitation_id = 'i0' AND event_id = 'e1'`).first<{ attending: number; count: number }>();
    expect(r).toEqual({ attending: 1, count: 2 });
    expect(to(SECOND)).toHaveLength(2); // the invitation, then the confirmation
    expect(to(phoneOf(0))).toHaveLength(1);
  });
});

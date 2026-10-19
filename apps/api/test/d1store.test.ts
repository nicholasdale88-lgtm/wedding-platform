import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import { runAutopilot, type EngineDeps } from '../src/sms/engine';
import { handleInbound } from '../src/sms/inbound';
import type { NewOutbox } from '../src/sms/types';
import { replyD1, seedD1, testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';
import { phoneOf, SENDER } from './support/fixture';

/** The production store on a real D1 engine: the SQL must give the same guarantees as the in-memory store. */
describe('D1 SMS store', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let store: D1SmsStore;
  let n = 0;
  const row = (key: string, extra: Partial<NewOutbox> = {}): NewOutbox => ({
    weddingId: 'w1', invitationId: 'i1', campaignId: 'c-invite', dedupeKey: key, kind: 'campaign', to: phoneOf(1), body: 'Hi', parts: 1, ...extra,
  });

  beforeEach(async () => {
    t = await testD1();
    store = new D1SmsStore(t.db, 'https://example.com', () => `id${++n}`);
    await seedD1(t.db);
  });
  afterEach(() => t.dispose());

  it('reads the wedding, events and recipients', async () => {
    const [w] = await store.weddings();
    expect(w).toMatchObject({ id: 'w1', sender: SENDER, paused: false, walletCredits: null, timezone: 'Australia/Sydney' });
    const { events, recipients } = await store.audience('w1');
    expect(events.map((e) => e.key)).toEqual(['wedding', '30th']);
    expect(recipients).toHaveLength(20);
    const i0 = recipients.find((r) => r.id === 'i0')!;
    expect(i0).toMatchObject({ people: ['Guest0 Smith', 'Partner0 Smith'], invited: ['wedding'], seatsHeld: 2, optOut: false });
  });

  it('enqueue ignores duplicate dedupe keys', async () => {
    expect(await store.enqueue([row('a'), row('b')])).toBe(2);
    expect(await store.enqueue([row('a'), row('c')])).toBe(1);
  });

  it('claimQueued is atomic: two concurrent claims never get the same row', async () => {
    await store.enqueue(Array.from({ length: 120 }, (_, i) => row(`k${i}`)));
    const now = new Date().toISOString();
    const [a, b] = await Promise.all([store.claimQueued('w1', ['campaign'], now, now), store.claimQueued('w1', ['campaign'], now, now)]);
    expect(a.length + b.length).toBe(120);
    expect(new Set([...a, ...b].map((r) => r.id)).size).toBe(120);
  });

  it('only claims the kinds asked for, and release puts rows back', async () => {
    await store.enqueue([row('c1'), row('r1', { kind: 'reply' })]);
    const now = new Date().toISOString();
    const urgent = await store.claimQueued('w1', ['reply', 'forward', 'test'], now, now);
    expect(urgent.map((r) => r.dedupeKey)).toEqual(['r1']);
    await store.release(urgent.map((r) => r.id));
    expect((await store.claimQueued('w1', ['reply'], now, now)).map((r) => r.dedupeKey)).toEqual(['r1']);
  });

  it('slot claims are atomic and reclaim a crashed run after 10 minutes', async () => {
    const at = '2027-06-18T01:00:00.000Z';
    const [a, b] = await Promise.all([store.claimDueSlots('w1', at, 5), store.claimDueSlots('w1', at, 5)]);
    expect(a.length + b.length).toBe(1);
    expect(await store.claimDueSlots('w1', '2027-06-18T01:05:00.000Z', 5)).toHaveLength(0);
    expect(await store.claimDueSlots('w1', '2027-06-18T01:11:00.000Z', 5)).toHaveLength(1);
  });

  it('cancelQueued keeps rows already sent to the provider', async () => {
    await store.enqueue([row('slot:s1:i1'), row('slot:s1:i2', { invitationId: 'i2' }), row('slot:s1:i3', { invitationId: 'i3' })]);
    const [r2] = (await store.claimQueued('w1', ['campaign'], 'x', 'x')).filter((r) => r.invitationId === 'i2');
    await store.assignBatch([r2!.id], 'key', new Date().toISOString());
    await store.release((await t.db.prepare(`SELECT id FROM sms_out`).all<{ id: string }>()).results.map((r) => r.id));
    await store.cancelQueued('slot:s1:', new Set(['i1']));
    const rows = (await t.db.prepare(`SELECT dedupe_key, status FROM sms_out ORDER BY dedupe_key`).all<{ dedupe_key: string; status: string }>()).results;
    expect(rows.map((r) => `${r.dedupe_key}=${r.status}`)).toEqual(['slot:s1:i1=queued', 'slot:s1:i2=queued', 'slot:s1:i3=cancelled']);
  });

  it('STOP is platform-wide and shows in the audience', async () => {
    await store.optOut(phoneOf(2), 'STOP reply');
    expect(await store.optedOut([phoneOf(2), phoneOf(3)])).toEqual(new Set([phoneOf(2)]));
    const { recipients } = await store.audience('w1');
    expect(recipients.find((r) => r.id === 'i2')!.optOut).toBe(true);
  });

  it('a malformed audience switches the campaign off rather than texting everyone', async () => {
    await t.db.prepare(`UPDATE campaign SET audience = '{"everyone":1}' WHERE id = 'c-reminder'`).run();
    const c = (await store.campaigns('w1')).find((x) => x.id === 'c-reminder')!;
    expect(c.enabled).toBe(false);
  });

  it('inbound: recorded once, claimed once', async () => {
    const base = { id: 'in1', weddingId: null, invitationId: null, providerId: 'p1', type: 'inbound' as const, from: phoneOf(1), to: SENDER, body: 'yes', action: 'Received', receivedAt: 'x' };
    expect(await store.insertInbound(base)).toBe(true);
    expect(await store.insertInbound({ ...base, id: 'in2' })).toBe(false);
    const now = '2027-01-01T00:00:00.000Z';
    const [a, b] = await Promise.all([store.claimInbound('in1', now, now), store.claimInbound('in1', now, now)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await store.unprocessedInbound(now)).toHaveLength(0);
    expect(await store.unprocessedInbound('2027-01-01T00:03:00.000Z')).toHaveLength(1); // stuck: the sweep retries
  });

  describe('end to end on D1', () => {
    const engine = () => {
      const clock = fakeClock();
      const provider = new FakeProvider();
      let id = 0;
      const d: EngineDeps = { store, provider, now: clock.now, uuid: () => `u${++id}` };
      return { d, clock, provider };
    };

    it('invites once, reminds only those still waiting, and confirms a YES without a second thank-you', async () => {
      const { d, clock, provider } = engine();
      clock.set('2026-10-20T09:00');
      await Promise.all([runAutopilot(d), runAutopilot(d)]);
      expect(provider.delivered).toHaveLength(20);

      // i3 (wedding only) replies by text; i1 replies to both events on the website.
      clock.set('2026-10-20T10:00');
      expect(await handleInbound(d, { from: phoneOf(3), to: SENDER, body: 'Yes', receivedAt: '', type: 'inbound', providerId: 'p-i3' })).toBe('RSVP set to yes');
      await replyD1(t.db, 'i1', 'e1', true, clock.now());
      await replyD1(t.db, 'i1', 'e2', false, clock.now());
      clock.set('2026-10-20T10:30');
      await runAutopilot(d);
      const toI3 = provider.delivered.filter((m) => m.to === '0' + phoneOf(3).slice(3));
      expect(toI3).toHaveLength(2); // invite + confirmation, no extra thank-you
      expect(provider.delivered.filter((m) => m.message.startsWith('Thanks Guest1'))).toHaveLength(1);

      clock.set('2027-06-18T10:00');
      await runAutopilot(d);
      const reminders = provider.delivered.filter((m) => m.message.includes('gentle reminder'));
      expect(reminders).toHaveLength(18);
      expect(reminders.some((m) => m.to === '0' + phoneOf(1).slice(3) || m.to === '0' + phoneOf(3).slice(3))).toBe(false);
      expect(provider.duplicates()).toEqual([]);
    });
  });
});

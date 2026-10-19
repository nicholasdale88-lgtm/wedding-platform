import { beforeEach, describe, expect, it } from 'vitest';
import { estimate, runAutopilot, sendNow } from '../src/sms/engine';
import { deps } from './support/fakes';
import { reply, seedWedding, W } from './support/fixture';

/** docs/05 "Must-pass tests" on a fake clock, 75 invitations. */
describe('SMS autopilot', () => {
  let t: ReturnType<typeof deps>;
  const run = () => runAutopilot(t.d);
  const sent = (key: string) => t.store.sentTo((o) => o.campaignId === `c-${key}`);
  const at = (local: string) => t.clock.set(local);

  /** Invites go out on day one so later tests start from a realistic state. */
  const sendInvites = async () => {
    at('2026-10-20T09:00');
    await run();
  };

  beforeEach(() => {
    t = deps();
    seedWedding(t.store, { noPhone: [74] });
  });

  it('1. quiet hours: no invites at 21:00, 74 at 09:00, none on a second run', async () => {
    at('2026-10-20T21:00');
    await run();
    expect(t.provider.delivered).toHaveLength(0);

    at('2026-10-21T09:00');
    await run();
    expect(sent('invite')).toHaveLength(74);
    expect(t.provider.delivered).toHaveLength(74);

    await run();
    expect(t.provider.delivered).toHaveLength(74);
  });

  it('2. 30 replies give 30 thank-yous after the 10-minute debounce; a changed reply gives one more', async () => {
    await sendInvites();
    at('2026-10-20T09:30');
    for (let i = 0; i < 30; i++) reply(t.store, `i${i}`, t.clock.now(), Object.fromEntries(t.store.recipient(`i${i}`).invited.map((k) => [k, true])));

    at('2026-10-20T09:35');
    await run();
    expect(sent('thanks')).toHaveLength(0);

    at('2026-10-20T09:45');
    await run();
    expect(sent('thanks')).toHaveLength(30);

    await run();
    expect(sent('thanks')).toHaveLength(30);

    at('2026-10-20T10:00');
    reply(t.store, 'i3', t.clock.now(), { wedding: false });
    at('2026-10-20T10:15');
    await run();
    expect(sent('thanks')).toHaveLength(31);
    expect(sent('thanks').filter((o) => o.invitationId === 'i3')).toHaveLength(2);
  });

  it.todo('3. stale admin save gets 409 and keeps the server RSVP (API layer, M3.1)');

  it('5. reminder on 18 Jun goes only to invited, awaiting, opted-in guests; {pending} names only unanswered events; re-run sends 0', async () => {
    await sendInvites();
    for (let i = 1; i <= 20; i++) reply(t.store, `i${i}`, t.clock.now(), Object.fromEntries(t.store.recipient(`i${i}`).invited.map((k) => [k, true])));
    // i23 (invited to both) hasn't replied at all.
    reply(t.store, 'i22', t.clock.now(), { wedding: true }); // i22 invited to both: still awaiting the 30th
    t.store.stopList.add(t.store.recipient('i21').phone!); // i21 texted STOP
    // A guest added after invites went out, with the invite campaign off: never invited, so no reminder.
    t.store.campaignList.find((c) => c.key === 'invite')!.enabled = false;
    t.store.invitations.push({ weddingId: W, deleted: false, r: { ...structuredClone(t.store.recipient('i0')), id: 'late', token: 'late-token-0000000000000', phone: '+61499999999' } });

    at('2027-06-18T10:00');
    await run();

    const got = new Set(sent('reminder').map((o) => o.invitationId));
    for (let i = 1; i <= 20; i++) expect(got.has(`i${i}`)).toBe(false); // replied: never reminded
    expect(got.has('i21')).toBe(false);
    expect(got.has('late')).toBe(false);
    expect(got.has('i74')).toBe(false); // no mobile
    expect(got.size).toBe(74 - 20 - 1); // 74 mobiles, 20 replied, 1 opted out

    const body = (id: string) => sent('reminder').find((o) => o.invitationId === id)!.body;
    expect(body('i22')).toContain("RSVP for Nicholas's 30th by");
    expect(body('i23')).toContain("RSVP for the wedding and Nicholas's 30th by");
    expect(body('i24')).toContain('RSVP for the wedding by'); // wedding-only invitation

    at('2027-06-18T10:15');
    await run();
    expect(sent('reminder')).toHaveLength(got.size);
  });

  it('6. provider 403 sends nothing and fails the slot; the next run after a top-up succeeds once', async () => {
    await sendInvites();
    t.provider.fail('credits', 1);
    at('2027-06-18T10:00');
    await run();
    expect(sent('reminder')).toHaveLength(0);
    expect(t.store.slots.find((s) => s.sendAt.startsWith('2027-06-18'))!.status).toBe('failed');

    at('2027-06-18T10:15');
    await run();
    const n = sent('reminder').length;
    expect(n).toBeGreaterThan(0);
    expect(t.store.slots.find((s) => s.sendAt.startsWith('2027-06-18'))!.status).toBe('done');
    expect(t.provider.duplicates()).toEqual([]);
  });

  it('6b. provider timeout after accepting: the retry replays the same batch and nobody gets two', async () => {
    await sendInvites();
    const before = t.provider.delivered.length;
    t.provider.fail('acceptThenTimeout', 1);
    at('2027-06-18T10:00');
    await run();
    const accepted = t.provider.delivered.length - before;
    expect(sent('reminder')).toHaveLength(0); // we don't know yet

    at('2027-06-18T10:15');
    await run();
    expect(sent('reminder')).toHaveLength(accepted);
    expect(t.provider.delivered.length - before).toBe(accepted);
    expect(t.provider.calls.at(-1)!.key).toBe(t.provider.calls.at(-2)!.key);
  });

  it('6c. provider down (5xx) keeps everything queued; nothing is lost', async () => {
    await sendInvites();
    t.provider.fail('down', 2);
    at('2027-06-18T10:00');
    await run();
    at('2027-06-18T10:15');
    await run();
    expect(sent('reminder')).toHaveLength(0);
    at('2027-06-18T10:30');
    await run();
    expect(sent('reminder').length).toBeGreaterThan(0);
    expect(t.provider.duplicates()).toEqual([]);
  });

  it('7. a slot due in quiet hours (07:00) sends at 08:00 without using up its attempts', async () => {
    await sendInvites();
    t.store.slots.push({ id: 'early', campaignId: 'c-reminder', sendAt: new Date(Date.parse('2027-06-24T21:00:00Z')).toISOString(), status: 'pending', attempts: 0, lastError: null }); // 07:00 Sydney on 25 Jun
    at('2027-06-25T07:00');
    await run();
    at('2027-06-25T07:45');
    await run();
    expect(sent('reminder')).toHaveLength(0);
    expect(t.store.slots.find((s) => s.id === 'early')!.attempts).toBe(0);

    at('2027-06-25T08:00');
    await run();
    expect(sent('reminder').length).toBeGreaterThan(0);
  });

  it('8. night-before goes only to wedding yes guests with their /tomorrow link; photos at 19 Nov 11:00 with /photos', async () => {
    await sendInvites();
    for (let i = 0; i < 75; i++) {
      const r = t.store.recipient(`i${i}`);
      reply(t.store, r.id, t.clock.now(), Object.fromEntries(r.invited.map((k) => [k, i % 2 === 0])));
    }
    at('2026-10-20T10:00');
    await run(); // thank-yous

    at('2027-11-17T17:00');
    await run();
    const night = sent('nightW');
    expect(night.length).toBeGreaterThan(0);
    for (const o of night) {
      const r = t.store.recipient(o.invitationId!);
      expect(r.rsvp.wedding?.attending).toBe(true);
      expect(o.body).toContain(`https://example.com/w/sophie-and-nicholas/tomorrow?g=${r.token}`);
    }
    // The June-August slots were never run (no cron then): over a day late, so cancelled, not sent.
    expect(sent('reminder')).toHaveLength(0);
    expect(t.store.slots.filter((s) => s.status === 'cancelled').length).toBe(5);

    at('2027-11-19T11:00');
    await run();
    for (const o of sent('photos')) expect(o.body).toContain(`/photos?g=${t.store.recipient(o.invitationId!).token}`);
    expect(sent('photos').map((o) => o.invitationId).sort()).toEqual(night.map((o) => o.invitationId).sort());

    at('2027-11-19T17:00');
    await run();
    for (const o of sent('nightB')) {
      const r = t.store.recipient(o.invitationId!);
      expect(r.rsvp['30th']?.attending).toBe(true);
      expect(o.body).toContain(`/tomorrow/30th?g=${r.token}`);
    }
  });

  it.todo('9. 300 invitations x 6 SMS rows: overview, exports and guest list < 500 ms (API layer, M3)');

  it('pause all texts stops everything, and resuming sends what is due', async () => {
    t.store.weddingList[0]!.paused = true;
    at('2026-10-20T09:00');
    await run();
    expect(t.provider.delivered).toHaveLength(0);
    t.store.weddingList[0]!.paused = false;
    await run();
    expect(sent('invite')).toHaveLength(74);
  });

  it('cron firing twice at once sends each text once', async () => {
    at('2026-10-20T09:00');
    await Promise.all([run(), run(), run()]);
    expect(t.provider.delivered).toHaveLength(74);
    expect(t.provider.duplicates()).toEqual([]);
  });

  it('wallet: stops before going negative and resumes after a top-up', async () => {
    t = deps();
    seedWedding(t.store, { noPhone: [74], walletCredits: 0 });
    at('2026-10-20T09:00');
    await run();
    expect(t.provider.delivered).toHaveLength(0);
    t.store.weddingList[0]!.walletCredits = 1000;
    await run();
    expect(sent('invite')).toHaveLength(74);
    expect(t.store.weddingList[0]!.walletCredits).toBe(1000 - sent('invite').reduce((n, o) => n + o.parts, 0));
  });

  it('daily cap holds the rest until tomorrow', async () => {
    t.store.weddingList[0]!.dailyCap = 50;
    at('2026-10-20T09:00');
    await run();
    expect(sent('invite')).toHaveLength(50);
    at('2026-10-21T09:00');
    await run();
    expect(sent('invite')).toHaveLength(74);
  });

  it('send now: shows count and cost first, sends once, waits for the morning in quiet hours', async () => {
    await sendInvites();
    for (let i = 0; i < 10; i++) reply(t.store, `i${i}`, t.clock.now(), { wedding: true });
    t.store.campaignList.find((c) => c.key === 'rain')!.enabled = true;

    at('2027-11-17T22:00');
    const est = await estimate(t.d, W, 'c-rain');
    expect(est.count).toBeGreaterThan(0);
    expect(est.costCents).toBeCloseTo((est.parts * 176) / 100);
    expect(est.quiet).toBe(true);
    await sendNow(t.d, W, 'c-rain');
    expect(sent('rain')).toHaveLength(0); // quiet hours: held

    at('2027-11-18T08:00');
    await run();
    expect(sent('rain')).toHaveLength(est.count);
  });

  it('never sends a message with an unfilled placeholder', async () => {
    t.store.campaignList.find((c) => c.key === 'invite')!.body = 'Hi {first}, table {table}';
    at('2026-10-20T09:00');
    await run();
    expect(t.provider.delivered).toHaveLength(0);
    expect(t.store.outbox.every((o) => o.status === 'failed' && o.error?.includes('{table}'))).toBe(true);
  });
});

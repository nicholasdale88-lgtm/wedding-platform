import { inQuietHours } from '@wp/shared';
import { describe, expect, it } from 'vitest';
import { runAutopilot } from '../src/sms/engine';
import { handleInbound } from '../src/sms/inbound';
import type { OutMessage, SendOutcome } from '../src/sms/provider';
import { deps, FakeProvider, TZ } from './support/fakes';
import { reply, seedWedding, SENDER } from './support/fixture';

/** Seeded PRNG so a failure always reproduces. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/**
 * docs/12 stress pass for the SMS engine: a year of cron runs for 200 invitations with
 * replies arriving, STOPs mid-campaign, a flaky provider and overlapping cron runs.
 * Checked at the moment of every send, not just at the end.
 */
describe('SMS engine stress: the whole schedule, 200 invitations', () => {
  it('never double-sends, never texts in quiet hours, never reminds a guest who replied, never texts after STOP', { timeout: 120_000 }, async () => {
    const random = rng(42);
    const provider = new FakeProvider();
    const t = deps(undefined, undefined, provider);
    seedWedding(t.store, { invitations: 200, noPhone: [7, 77, 177] });
    const stoppedAt = new Map<string, number>();
    const violations: string[] = [];

    // Check every message as it reaches the "provider".
    const realSend = provider.send.bind(provider);
    provider.send = async (messages: OutMessage[], key: string): Promise<SendOutcome> => {
      const now = t.clock.now();
      for (const m of messages) {
        const row = t.store.outbox.find((o) => o.id === m.customRef)!;
        // Retries of an earlier batch must be re-sent as-is, so the rules apply to first attempts.
        const first = row.attemptedAt === now.toISOString();
        if (row.kind === 'campaign' && inQuietHours(now, TZ)) violations.push(`quiet: ${row.dedupeKey}`);
        const stop = stoppedAt.get('+61' + m.to.slice(1));
        if (first && stop !== undefined && stop <= now.getTime()) violations.push(`after STOP: ${row.dedupeKey}`);
        if (first && row.campaignId === 'c-reminder' && row.invitationId) {
          const r = t.store.recipient(row.invitationId);
          if (!r.invited.some((k) => (r.rsvp[k]?.attending ?? null) === null)) violations.push(`reminded after reply: ${row.invitationId}`);
        }
      }
      // A flaky provider: 5% outages, 3% "accepted but the response was lost".
      const roll = random();
      if (roll < 0.05) return { ok: false, reason: 'transient', error: '503' };
      if (roll < 0.08) {
        await realSend(messages, key);
        return { ok: false, reason: 'transient', error: 'timeout' };
      }
      return realSend(messages, key);
    };

    // Cron every 15 minutes is too many ticks for CI; every 45 minutes still hits every send window.
    const start = Date.parse('2026-10-20T00:00:00Z');
    const end = Date.parse('2027-11-21T00:00:00Z');
    for (let ms = start; ms < end; ms += 45 * 60_000) {
      t.clock.setUtc(ms); // UTC steps, so the DST changes in April and October are crossed for real

      if (random() < 0.15) {
        const i = Math.floor(random() * 200);
        const r = t.store.recipient(`i${i}`);
        reply(t.store, r.id, t.clock.now(), Object.fromEntries(r.invited.map((k) => [k, random() < 0.7])), {
          '30th': { ride: ['Yes, I will ride', 'Not sure yet', 'No, not riding'][Math.floor(random() * 3)]! },
        });
      }
      if (random() < 0.004) {
        const r = t.store.recipient(`i${Math.floor(random() * 200)}`);
        if (r.phone && !stoppedAt.has(r.phone)) {
          stoppedAt.set(r.phone, t.clock.now().getTime());
          await handleInbound(t.d, { from: r.phone, to: SENDER, body: 'STOP', receivedAt: t.clock.now().toISOString(), type: 'inbound', providerId: `stop-${r.id}` });
        }
      }
      // Overlapping cron runs.
      if (random() < 0.1) await Promise.all([runAutopilot(t.d), runAutopilot(t.d)]);
      else await runAutopilot(t.d);
    }

    expect(violations).toEqual([]);
    // Ground truth: no outbox row reached a phone twice (provider replays don't count).
    const perRow = new Map<string, number>();
    for (const m of provider.delivered) perRow.set(m.customRef, (perRow.get(m.customRef) ?? 0) + 1);
    expect([...perRow].filter(([, n]) => n > 1)).toEqual([]);
    // Every phone got exactly one invitation.
    const invites = t.store.outbox.filter((o) => o.campaignId === 'c-invite' && o.status === 'sent');
    expect(new Set(invites.map((o) => o.invitationId)).size).toBe(invites.length);
    expect(invites.length).toBeGreaterThanOrEqual(197 - stoppedAt.size);
    // Every dated slot ran (done), none were missed or left hanging.
    expect(t.store.slots.map((s) => s.status)).toEqual(t.store.slots.map(() => 'done'));
    // Nothing left stuck mid-send.
    expect(t.store.outbox.filter((o) => o.status === 'sending')).toEqual([]);
  });
});

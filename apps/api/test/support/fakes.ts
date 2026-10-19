import { zonedToUtc } from '@wp/shared';
import type { EngineDeps } from '../../src/sms/engine';
import type { OutMessage, SendOutcome, SmsProvider } from '../../src/sms/provider';
import { MemoryStore } from './memoryStore';

export const TZ = 'Australia/Sydney';

/** Fake clock in Sydney wall time: clock.set('2027-06-18T10:00'). */
export function fakeClock(start = '2026-10-20T09:00') {
  let now = zonedToUtc(start, TZ);
  return {
    now: () => new Date(now),
    set: (local: string) => { now = zonedToUtc(local, TZ); },
    setUtc: (ms: number) => { now = new Date(ms); },
    advance: (ms: number) => { now = new Date(now.getTime() + ms); },
  };
}

type Mode = 'ok' | 'auth' | 'credits' | 'down' | 'acceptThenTimeout';

/**
 * Behaves like Mobile Message: replays by Idempotency-Key (24 h) and records what a
 * phone would actually receive. `delivered` is the ground truth for "sent twice?".
 */
export class FakeProvider implements SmsProvider {
  mode: Mode = 'ok';
  /** Fail only the next N calls with `mode`, then go back to ok. */
  failCalls = Infinity;
  calls: { key: string; messages: OutMessage[] }[] = [];
  delivered: OutMessage[] = [];
  private replay = new Map<string, SendOutcome>();
  private n = 0;

  fail(mode: Mode, calls = Infinity) { this.mode = mode; this.failCalls = calls; }

  async send(messages: OutMessage[], key: string): Promise<SendOutcome> {
    this.calls.push({ key, messages });
    const mode = this.failCalls > 0 ? this.mode : 'ok';
    if (mode !== 'ok') this.failCalls--;
    if (mode === 'auth') return { ok: false, reason: 'auth', error: '401' };
    if (mode === 'credits') return { ok: false, reason: 'credits', error: '403' };
    if (mode === 'down') return { ok: false, reason: 'transient', error: '503' };
    const seen = this.replay.get(key);
    if (seen) return seen;
    this.delivered.push(...messages);
    const out: SendOutcome = {
      ok: true,
      results: messages.map((m) => ({ customRef: m.customRef, status: 'success', messageId: `mm-${++this.n}`, error: null })),
    };
    this.replay.set(key, out);
    if (mode === 'acceptThenTimeout') return { ok: false, reason: 'transient', error: 'timeout' };
    return out;
  }

  /** Messages each phone received, keyed "to|message". */
  duplicates(): string[] {
    const seen = new Map<string, number>();
    for (const m of this.delivered) seen.set(`${m.to}|${m.message}`, (seen.get(`${m.to}|${m.message}`) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  }
}

export function deps(store = new MemoryStore(), clock = fakeClock(), provider = new FakeProvider()) {
  let id = 0;
  const d: EngineDeps = { store, provider, now: clock.now, uuid: () => `u${++id}` };
  return { d, store, clock, provider };
}

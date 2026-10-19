import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { flush, type EngineDeps } from '../src/sms/engine';
import type { OutMessage } from '../src/sms/provider';
import { texto, verifyTextoSignature } from '../src/sms/texto';
import { seedD1, testD1 } from './support/d1';
import { fakeClock } from './support/fakes';

const msg = (n: number): OutMessage => ({ to: `61412000${String(n).padStart(3, '0')}`, message: `Hello ${n}`, sender: '61400000999', customRef: `r${n}` });

/** A fake Texto: answers per call from a script; records what it was sent. */
function fakeTexto(script: (n: number) => Response | Error) {
  const calls: { body: { to: string; message: string; sender: string }; auth: string | null }[] = [];
  const f = (async (_url: string, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init!.body)), auth: new Headers(init!.headers).get('Authorization') });
    const r = script(calls.length);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { f, calls };
}
const ok = (id: string) => new Response(JSON.stringify({ message_id: id, credits_used: 1, credits_remaining: 99 }), { status: 200 });
const status = (s: number) => new Response(JSON.stringify({ error: 'x', message: `status ${s}` }), { status: s });

describe('Texto SMS adapter', () => {
  it('sends each message with the key, E.164 numbers and the sender', async () => {
    const t = fakeTexto((n) => ok(`m${n}`));
    const out = await texto({ apiKey: 'txt_test', fetch: t.f }).send([msg(1), msg(2)], 'unused');
    expect(out).toEqual({ ok: true, results: [
      { customRef: 'r1', status: 'success', messageId: 'm1', error: null },
      { customRef: 'r2', status: 'success', messageId: 'm2', error: null },
    ] });
    expect(t.calls[0]).toEqual({ body: { to: '+61412000001', message: 'Hello 1', sender: '61400000999' }, auth: 'Bearer txt_test' });
  });

  it('a send with no answer is never retried (it may have gone): marked to check, not resent', async () => {
    const t = fakeTexto((n) => (n === 1 ? new Error('timeout') : ok('m2')));
    const out = await texto({ apiKey: 'k', fetch: t.f }).send([msg(1), msg(2)], 'x');
    expect(out.ok && out.results[0]).toMatchObject({ status: 'error', error: expect.stringMatching(/check Texto before resending/) });
    expect(out.ok && out.results[1]!.status).toBe('success');
  });

  it('out of credits or a bad key stops the run; the rest go back to the queue', async () => {
    for (const [code, reason] of [[402, 'credits'], [401, 'auth']] as const) {
      const t = fakeTexto((n) => (n === 2 ? status(code) : ok(`m${n}`)));
      const out = await texto({ apiKey: 'k', fetch: t.f }).send([msg(1), msg(2), msg(3)], 'x');
      expect(out.ok && out.results.map((r) => r.status)).toEqual(['success', 'unsent', 'unsent']);
      expect(out.ok && out.stopped?.reason).toBe(reason);
      expect(t.calls).toHaveLength(2); // nothing after the stop is attempted
    }
  });

  it('a wrong number is a plain failure for that guest only', async () => {
    const t = fakeTexto((n) => (n === 1 ? status(422) : ok('m2')));
    const out = await texto({ apiKey: 'k', fetch: t.f }).send([msg(1), msg(2)], 'x');
    expect(out.ok && out.results.map((r) => r.status)).toEqual(['error', 'success']);
  });

  it('sends in rounds that fit a Worker run; the rest wait for the next run', async () => {
    const t = fakeTexto((n) => ok(`m${n}`));
    const p = texto({ apiKey: 'k', fetch: t.f, perRun: 2 });
    const out = await p.send([msg(1), msg(2), msg(3)], 'x');
    expect(out.ok && out.results.map((r) => r.status)).toEqual(['success', 'success', 'unsent']);
    expect(out.ok && out.stopped?.reason).toBe('transient');
  });

  it('without a key nothing is sent', async () => {
    const t = fakeTexto(() => ok('m'));
    expect(await texto({ apiKey: '', fetch: t.f }).send([msg(1)], 'x')).toMatchObject({ ok: false, reason: 'auth' });
    expect(t.calls).toHaveLength(0);
  });

  it('webhook signatures: HMAC-SHA256 of the raw body, constant-time', async () => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const body = '{"a":1}';
    const hex = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await verifyTextoSignature('whsec', body, `sha256=${hex}`)).toBe(true);
    expect(await verifyTextoSignature('whsec', body + ' ', `sha256=${hex}`)).toBe(false);
    expect(await verifyTextoSignature('whsec', body, hex)).toBe(false);
    expect(await verifyTextoSignature('whsec', body, null)).toBe(false);
  });
});

describe('engine with a provider that stops part-way', () => {
  let db: Awaited<ReturnType<typeof testD1>>;
  beforeEach(async () => {
    db = await testD1();
    await seedD1(db.db, 4);
  });
  afterEach(() => db.dispose());

  it('records what went, returns what did not to the queue, and sends it next run without doubles', async () => {
    const store = new D1SmsStore(db.db, 'https://example.com');
    const clock = fakeClock('2026-10-20T12:00');
    let budget = 2;
    const t = fakeTexto((n) => ok(`m${n}`));
    const deps = (): EngineDeps => ({ store, provider: texto({ apiKey: 'k', fetch: t.f, perRun: budget }), now: clock.now, uuid: () => crypto.randomUUID() });
    const w = (await store.wedding('w1'))!;
    await store.enqueue([1, 2, 3].map((i) => ({ weddingId: 'w1', invitationId: `i${i}`, campaignId: null, dedupeKey: `t:${i}`, kind: 'campaign' as const, to: `+6141200000${i}`, body: `Hi ${i}`, parts: 1 })));
    const first = await flush(deps(), w);
    expect(first).toMatchObject({ sent: 2, stopped: { reason: 'transient' } });
    budget = 10;
    const second = await flush(deps(), w);
    expect(second).toMatchObject({ sent: 1 });
    expect(t.calls.map((c) => c.body.message).sort()).toEqual(['Hi 1', 'Hi 2', 'Hi 3']); // each exactly once
  });
});

describe('Texto webhooks', () => {
  let db: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  beforeEach(async () => {
    db = await testD1();
    env = { DB: db.db, PUBLIC_BASE_URL: 'https://example.com', MM_HOOK_SECRET: 'hook', TEXTO_WEBHOOK_SECRET: 'whsec' };
  });
  afterEach(() => db.dispose());

  it('need the hook key and a valid signature', async () => {
    const body = JSON.stringify({ event: 'message.inbound', message_id: 'x1', from: '+61412000001', to: '+61400000999', body: 'YES', received_at: '2026-10-20T00:00:00Z' });
    expect((await app.request('/api/hooks/texto/inbound', { method: 'POST', body }, env, ctx)).status).toBe(401);
    expect((await app.request('/api/hooks/texto/inbound?k=hook', { method: 'POST', body, headers: { 'X-Texto-Signature': 'sha256=00' } }, env, ctx)).status).toBe(401);
  });
});

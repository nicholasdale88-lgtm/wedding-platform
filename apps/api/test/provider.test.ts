import { describe, expect, it } from 'vitest';
import { mobileMessage } from '../src/sms/provider';

const msg = (ref: string) => ({ to: '0412345678', message: 'Hi', sender: '0400000001', customRef: ref });

/** A scripted fetch: each call takes the next response. Records requests. */
function scripted(...responses: (Response | Error)[]) {
  const requests: { headers: Headers; body: unknown }[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    requests.push({ headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, requests };
}
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const client = (f: typeof fetch) => mobileMessage({ user: 'u', pass: 'p', fetch: f, sleep: async () => {} });

describe('Mobile Message client', () => {
  it('sends with Basic auth, custom_ref and the Idempotency-Key', async () => {
    const s = scripted(json(200, { status: 'complete', results: [{ status: 'success', custom_ref: 'a', message_id: 'm1' }] }));
    const out = await client(s.fetch).send([msg('a')], 'key-1');
    expect(out).toEqual({ ok: true, results: [{ customRef: 'a', status: 'success', messageId: 'm1', error: null }] });
    expect(s.requests[0]!.headers.get('Authorization')).toBe('Basic ' + btoa('u:p'));
    expect(s.requests[0]!.headers.get('Idempotency-Key')).toBe('key-1');
    expect(s.requests[0]!.body).toEqual({ messages: [{ to: '0412345678', message: 'Hi', sender: '0400000001', custom_ref: 'a' }] });
  });

  it('retries 429, 409, 5xx and network errors with the same key', async () => {
    const s = scripted(json(429), json(409), new Error('reset'), json(200, { results: [{ status: 'success', custom_ref: 'a', message_id: 'm' }] }));
    const out = await client(s.fetch).send([msg('a')], 'k');
    expect(out.ok).toBe(true);
    expect(new Set(s.requests.map((r) => r.headers.get('Idempotency-Key')))).toEqual(new Set(['k']));
  });

  it('gives up as transient after retries', async () => {
    const s = scripted(json(500), json(502), json(503), json(504));
    expect(await client(s.fetch).send([msg('a')], 'k')).toMatchObject({ ok: false, reason: 'transient' });
  });

  it('401 is an auth problem and 403 is no credits, without retrying', async () => {
    expect(await client(scripted(json(401)).fetch).send([msg('a')], 'k')).toMatchObject({ ok: false, reason: 'auth' });
    expect(await client(scripted(json(403)).fetch).send([msg('a')], 'k')).toMatchObject({ ok: false, reason: 'credits' });
  });

  it('maps blocked, errors and structurally invalid items back to the right message', async () => {
    const s = scripted(
      json(200, {
        results: [
          { status: 'blocked', custom_ref: 'b' },
          { status: 'error', error: 'bad number', item: 2 },
          { status: 'success', custom_ref: 'a', message_id: 'm1' },
        ],
      }),
    );
    const out = await client(s.fetch).send([msg('a'), msg('b'), msg('c'), msg('d')], 'k');
    if (!out.ok) throw new Error('expected ok');
    expect(out.results.map((r) => [r.customRef, r.status])).toEqual([
      ['a', 'success'], ['b', 'blocked'], ['c', 'error'], ['d', 'error'],
    ]);
    expect(out.results[2]!.error).toBe('bad number');
  });
});

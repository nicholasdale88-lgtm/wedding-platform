import type { MessageResult, SendOutcome, SmsProvider } from './provider';

/**
 * Texto client (https://texto.com.au/openapi.yaml, checked 19 Oct 2026).
 * - POST https://api.texto.com.au/send, `Authorization: Bearer txt_…`, body {to, message, sender}.
 *   One message per request, answering {message_id, credits_used, credits_remaining}.
 * - 400/422 invalid number, 401 bad key, 402 no credits, 429 rate limited, 5xx server.
 * - No idempotency key and no client reference: a send that times out may or may not have gone.
 *   Those are marked failed with a "check before resending" note and never retried by us, so no guest
 *   is ever texted twice. Anything not attempted goes back to the queue ('unsent').
 * - Each send is one outbound request; a Worker run allows ~50, so at most PER_RUN go per run and
 *   the rest follow at the next run (every 15 minutes).
 */

export const TEXTO_PER_RUN = 40;

interface Options {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  perRun?: number;
  timeoutMs?: number;
}

export function texto(opts: Options): SmsProvider {
  const doFetch = opts.fetch ?? fetch;
  const url = `${opts.baseUrl ?? 'https://api.texto.com.au'}/send`;
  const perRun = opts.perRun ?? TEXTO_PER_RUN;
  let used = 0; // across this run (one provider instance per run)

  return {
    // Texto has no idempotency, so the key is unused; each row is claimed once by the engine instead.
    async send(messages) {
      if (!opts.apiKey) return { ok: false, reason: 'auth', error: 'Texto is not connected yet (TEXTO_API_KEY).' };
      const results: MessageResult[] = [];
      let stopped: Extract<SendOutcome, { ok: true }>['stopped'];
      for (const m of messages) {
        if (stopped || used >= perRun) {
          results.push({ customRef: m.customRef, status: 'unsent', messageId: null, error: null });
          stopped ??= { reason: 'transient', error: `Sending in rounds of ${perRun}; the rest go at the next run.` };
          continue;
        }
        used++;
        let res: Response;
        try {
          res = await doFetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: m.to.startsWith('+') ? m.to : `+${m.to}`, message: m.message, sender: m.sender }),
            signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
          });
        } catch (e) {
          // It may have gone: never resend automatically.
          results.push({ customRef: m.customRef, status: 'error', messageId: null, error: `No answer from Texto (${(e as Error).name}). It may have sent: check Texto before resending.` });
          continue;
        }
        const body = (await res.json().catch(() => ({}))) as { message_id?: string; error?: string; message?: string };
        const why = body.message || body.error || `HTTP ${res.status}`;
        if (res.ok && body.message_id) {
          results.push({ customRef: m.customRef, status: 'success', messageId: body.message_id, error: null });
        } else if (res.status === 401 || res.status === 403) {
          results.push({ customRef: m.customRef, status: 'unsent', messageId: null, error: null });
          stopped = { reason: 'auth', error: 'Texto refused the API key. Check TEXTO_API_KEY.' };
        } else if (res.status === 402) {
          results.push({ customRef: m.customRef, status: 'unsent', messageId: null, error: null });
          stopped = { reason: 'credits', error: 'Texto is out of credits. Top up to keep texts going.' };
        } else if (res.status === 429) {
          results.push({ customRef: m.customRef, status: 'unsent', messageId: null, error: null });
          stopped = { reason: 'transient', error: 'Texto asked us to slow down; the rest go at the next run.' };
        } else if (res.status >= 500 || res.ok) {
          // Server error, or a 2xx without an id: unclear whether it went.
          results.push({ customRef: m.customRef, status: 'error', messageId: null, error: `Texto error (${why}). It may have sent: check Texto before resending.` });
        } else {
          results.push({ customRef: m.customRef, status: 'error', messageId: null, error: `Texto rejected it: ${why}` });
        }
      }
      return { ok: true, results, ...(stopped ? { stopped } : {}) };
    },
  };
}

/** X-Texto-Signature: "sha256=<hex HMAC-SHA256 of the raw body>". Constant-time compare. */
export async function verifyTextoSignature(secret: string, raw: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const want = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  const got = header.slice(7).toLowerCase();
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.max(got.length, want.length); i++) diff |= (got.charCodeAt(i) || 0) ^ (want.charCodeAt(i) || 0);
  return diff === 0;
}

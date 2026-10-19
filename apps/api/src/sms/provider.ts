/**
 * Mobile Message client (https://mobilemessage.com.au/llms-full.txt, checked 19 Oct 2026).
 * - POST /v1/messages, Basic auth, up to 10,000 messages per request.
 * - Idempotency-Key: a replay returns the original response; keys live 24 h.
 * - 401 bad credentials, 403 no credits, 409 same key still processing, 429 > 5 concurrent.
 */

export interface OutMessage {
  to: string;
  message: string;
  sender: string;
  customRef: string;
}

export interface MessageResult {
  customRef: string;
  /** unsent: not attempted this run (it goes back to the queue). */
  status: 'success' | 'error' | 'blocked' | 'unsent';
  messageId: string | null;
  error: string | null;
}

export type SendOutcome =
  /** stopped: some were handled, then sending had to stop (the rest come back as 'unsent'). */
  | { ok: true; results: MessageResult[]; stopped?: { reason: 'auth' | 'credits' | 'transient'; error: string } }
  /** fatal: stop sending this run (auth = check credentials, credits = top up). transient: retry next run. */
  | { ok: false; reason: 'auth' | 'credits' | 'transient' | 'rejected'; error: string };

export interface SmsProvider {
  send(messages: OutMessage[], idempotencyKey: string): Promise<SendOutcome>;
}

interface Options {
  user: string;
  pass: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
  maxRetries?: number;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface RawResult {
  status?: string;
  custom_ref?: string;
  message_id?: string;
  error?: string;
  item?: number;
}

export function mobileMessage(opts: Options): SmsProvider {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? wait;
  const url = `${opts.baseUrl ?? 'https://api.mobilemessage.com.au'}/v1/messages`;
  const auth = 'Basic ' + btoa(`${opts.user}:${opts.pass}`);
  const maxRetries = opts.maxRetries ?? 3;

  return {
    async send(messages, idempotencyKey) {
      const body = JSON.stringify({
        messages: messages.map((m) => ({ to: m.to, message: m.message, sender: m.sender, custom_ref: m.customRef })),
      });
      let lastError = '';
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)));
        let res: Response;
        try {
          res = await doFetch(url, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body,
          });
        } catch (e) {
          lastError = `Network error: ${(e as Error).message}`;
          continue;
        }
        if (res.status === 401) return { ok: false, reason: 'auth', error: 'Mobile Message rejected the API credentials' };
        if (res.status === 403) return { ok: false, reason: 'credits', error: 'No SMS credits left on Mobile Message' };
        if (res.status === 429 || res.status === 409 || res.status >= 500) {
          lastError = `Mobile Message ${res.status}`;
          continue; // same Idempotency-Key, so a retry can never double-send
        }
        if (!res.ok) {
          return { ok: false, reason: 'rejected', error: `Mobile Message ${res.status}: ${(await res.text()).slice(0, 200)}` };
        }
        const json = (await res.json()) as { results?: RawResult[] };
        return { ok: true, results: mapResults(messages, json.results ?? []) };
      }
      return { ok: false, reason: 'transient', error: lastError || 'Mobile Message unavailable' };
    },
  };
}

/** Match results back by custom_ref, or by `item` index for structurally invalid entries. */
function mapResults(sent: OutMessage[], raw: RawResult[]): MessageResult[] {
  const byRef = new Map<string, RawResult>();
  raw.forEach((r, i) => {
    const ref = r.custom_ref ?? sent[r.item ?? i]?.customRef;
    if (ref) byRef.set(ref, r);
  });
  return sent.map((m) => {
    const r = byRef.get(m.customRef);
    const status = r?.status === 'success' || r?.status === 'blocked' ? r.status : 'error';
    return {
      customRef: m.customRef,
      status,
      messageId: r?.message_id ?? null,
      error: status === 'error' ? (r?.error ?? 'No result returned for this message') : null,
    };
  });
}

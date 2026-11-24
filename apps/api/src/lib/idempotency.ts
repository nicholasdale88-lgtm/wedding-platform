import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';
import { SESSION_COOKIE } from './auth';

/**
 * Retried saves are applied once (YL-19). A write (POST, PUT, PATCH, DELETE) may carry an Idempotency-Key: the web
 * client makes one per user action and sends the same one again when it retries after "busy" (503), "slow down"
 * (429) or a lost connection. The first request's result is kept for 24 hours (table idempotency); a repeat of the
 * key gets that result back (Idempotent-Replayed: true) instead of saving the change again.
 *
 * - Keys belong to whoever sent them (their session), so one person's key can never replay another's result. Signed
 *   out (a guest replying), a phone's address can change between tries, so those keys share one space: a random
 *   UUID nobody else can know. A key used again for a different request is refused (422).
 * - While the first request is still running, a repeat is told "busy" (503), so it tries again in a moment and then
 *   gets the result.
 * - Only settled answers are kept: a 5xx or 429 (nothing known to be saved) frees the key for the retry, as does a
 *   reply that signs someone in (its cookie can't be replayed) or one too big to keep.
 * - Without the header nothing changes. If the table itself is busy, the request simply goes ahead.
 */
export const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;
/** A request still running after this long is taken to have died (its key can be used again). */
const STALE_MS = 60_000;
const MAX_KEPT = 256_000;
const KEY = /^[A-Za-z0-9_-]{8,100}$/;
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type Row = { method: string; path: string; status: number | null; body: string | null; content_type: string | null; created_at: string };

async function sha256(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function cookie(header: string | undefined, name: string) {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}
const json = (status: number, code: string, message: string) => new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'content-type': 'application/json' } });

export function idempotency(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const key = c.req.header('Idempotency-Key');
    if (!key || !WRITES.has(c.req.method)) return next();
    if (!KEY.test(key)) return json(400, 'bad_idempotency_key', 'Idempotency-Key must be 8 to 100 letters, digits, - or _.');
    const db = c.env.DB;
    const session = cookie(c.req.header('cookie'), SESSION_COOKIE);
    const who = session ? `s:${session}` : c.req.header('authorization') ? `a:${c.req.header('authorization')}` : 'anon';
    const scope = await sha256(who);
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    const now = new Date();
    const since = new Date(now.getTime() - IDEMPOTENCY_TTL_MS).toISOString();

    let claimed = false;
    try {
      const prior = await db.prepare(`SELECT method, path, status, body, content_type, created_at FROM idempotency WHERE scope = ? AND key = ? AND created_at > ?`).bind(scope, key, since).first<Row>();
      if (prior) {
        if (prior.method !== method || prior.path !== path) return json(422, 'idempotency_key_reused', 'That Idempotency-Key was already used for a different request.');
        if (prior.status !== null)
          return new Response(prior.body ?? '', { status: prior.status, headers: { 'content-type': prior.content_type ?? 'application/json', 'Idempotent-Replayed': 'true' } });
        if (now.getTime() - Date.parse(prior.created_at) < STALE_MS) return json(503, 'busy', 'Still saving that. One moment…');
        // The first attempt died part-way: this one takes the key over.
        const r = await db.prepare(`UPDATE idempotency SET created_at = ? WHERE scope = ? AND key = ? AND status IS NULL AND created_at = ?`).bind(now.toISOString(), scope, key, prior.created_at).run();
        if (!r.meta.changes) return json(503, 'busy', 'Still saving that. One moment…');
        claimed = true;
      } else {
        // New, or an expired one taken over, in one statement. A key that another request claims at this instant
        // loses here and is told busy.
        const r = await db
          .prepare(
            `INSERT INTO idempotency (scope, key, method, path, status, body, content_type, created_at) VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, ?5)
             ON CONFLICT (scope, key) DO UPDATE SET method = excluded.method, path = excluded.path, status = NULL, body = NULL, content_type = NULL, created_at = excluded.created_at
             WHERE idempotency.created_at <= ?6`,
          )
          .bind(scope, key, method, path, now.toISOString(), since)
          .run();
        if (!r.meta.changes) return json(503, 'busy', 'Still saving that. One moment…');
        claimed = true;
      }
    } catch (e) {
      // The table is busy or missing: the request goes ahead as it would without a key.
      console.error('idempotency: claim', String(e));
    }

    await next();
    if (!claimed) return;

    const res = c.res;
    const type = res.headers.get('content-type') ?? '';
    let keep = res.status < 500 && res.status !== 429 && !res.headers.has('set-cookie') && (type.startsWith('application/json') || type.startsWith('text/'));
    let body = '';
    if (keep) {
      body = await res
        .clone()
        .text()
        .catch(() => {
          keep = false;
          return '';
        });
      if (body.length > MAX_KEPT) keep = false;
    }
    const settle = keep
      ? db.prepare(`UPDATE idempotency SET status = ?, body = ?, content_type = ? WHERE scope = ? AND key = ?`).bind(res.status, body, type, scope, key)
      : db.prepare(`DELETE FROM idempotency WHERE scope = ? AND key = ?`).bind(scope, key);
    // Tried a few times: a key left "running" would only make its retry wait a minute.
    for (let i = 0; i < 4; i++) {
      try {
        await settle.run();
        return;
      } catch (e) {
        if (i === 3) console.error('idempotency: settle', String(e));
        else await new Promise((ok) => setTimeout(ok, 50 * (i + 1)));
      }
    }
  };
}

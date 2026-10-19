import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';

/**
 * Defence in depth for every /api response (docs/02 Security). Auth, JSON-only writes and
 * rate limits live with their routes; this layer catches what slips past them.
 */

/** Largest request body we accept. Webhooks and RSVPs are a few KB; imports get their own limit. */
export const MAX_BODY = 100 * 1024;

const HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const json = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'content-type': 'application/json', ...HEADERS } });

const originOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

export const hardening = (): MiddlewareHandler<{ Bindings: Env }> => async (c, next) => {
  const method = c.req.method;
  const write = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  const hook = new URL(c.req.url).pathname.startsWith('/api/hooks/');

  if (write) {
    // Browsers always send Origin on cross-site writes; reject any that isn't us. (Providers' webhooks don't send one.)
    const origin = c.req.header('origin');
    if (origin && !hook && origin !== originOf(c.req.url) && origin !== originOf(c.env.PUBLIC_BASE_URL)) {
      return json('bad_origin', 'Not allowed.', 403);
    }
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > MAX_BODY) return json('too_large', 'That is too large to send.', 413);
  }

  await next();
  for (const [k, v] of Object.entries(HEADERS)) if (!c.res.headers.has(k)) c.res.headers.set(k, v);
};

/** Read a JSON body with a hard size cap, whatever Content-Length claimed. Null if too large or not JSON. */
export async function readJson(req: Request, max = MAX_BODY): Promise<unknown> {
  const text = await readText(req, max);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The raw body as text (webhooks need it exactly, for signatures), capped. Null if too large. */
export async function readText(req: Request, max = MAX_BODY): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const ch of chunks) {
    all.set(ch, at);
    at += ch.byteLength;
  }
  return new TextDecoder().decode(all);
}

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';

/**
 * Defence in depth for every /api response (docs/02 Security). Auth, JSON-only writes and
 * rate limits live with their routes; this layer catches what slips past them.
 */

/** Largest request body we accept. Webhooks and RSVPs are a few KB; imports get their own limit. */
export const MAX_BODY = 100 * 1024;

/** Photo uploads (a guest's, or the couple's own): one photo per request. */
export const MAX_PHOTO = 15 * 1024 * 1024;
/** A guest's video (about a minute from a phone); sent as it is. */
export const MAX_VIDEO = 55 * 1024 * 1024;
const PHOTO_PATH = /^\/api\/(?:p\/[a-z0-9-]+\/photos(?:\/[^/]+\/thumb)?|a\/w\/[^/]+\/photos\/upload)$/;

/** Guest list imports: up to 1,000 rows. */
export const MAX_IMPORT = 1024 * 1024;
const IMPORT_PATH = /^\/api\/a\/w\/[^/]+\/guests\/import$/;

/** Planning files (a quote PDF or photo), sent as base64 in JSON: 1.5 MB of file. */
export const MAX_PLANNER_FILE = 1_500_000;
/** A planner document (200 vendors with quotes and payments is big): under the database's 2 MB per value. */
export const MAX_PLANNER_DOC = 1_900_000;
const FILE_PATH = /^\/api\/(?:a\/w\/[^/]+\/planner\/files|p\/[a-z0-9-]+\/rfq\/file)$/;
const DOC_PATH = /^\/api\/a\/w\/[^/]+\/planner\/doc\//;

/** The body limit for a path. */
export const bodyLimitFor = (path: string) =>
  PHOTO_PATH.test(path) ? MAX_VIDEO : IMPORT_PATH.test(path) ? MAX_IMPORT : FILE_PATH.test(path) ? Math.ceil(MAX_PLANNER_FILE * 1.4) + 4096 : DOC_PATH.test(path) ? MAX_PLANNER_DOC : MAX_BODY;

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
  const path = new URL(c.req.url).pathname;
  const hook = path.startsWith('/api/hooks/');

  if (write) {
    // Browsers always send Origin on cross-site writes; reject any that isn't us. (Providers' webhooks don't send one.)
    const origin = c.req.header('origin');
    if (origin && !hook && origin !== originOf(c.req.url) && origin !== originOf(c.env.PUBLIC_BASE_URL)) {
      return json('bad_origin', 'Not allowed.', 403);
    }
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > bodyLimitFor(path)) return json('too_large', 'That is too large to send.', 413);
  }

  await next();
  for (const [k, v] of Object.entries(HEADERS)) if (!c.res.headers.has(k)) c.res.headers.set(k, v);
};

/** Read a JSON body with a hard size cap, whatever Content-Length claimed. Null if too large or not JSON. */
/** Stored JSON (settings, snapshots): damaged or empty gives the fallback, never a crash. */
export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

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
  const bytes = await readBytes(req, max);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

/** The raw body, capped while reading. Null if too large. */
export async function readBytes(req: Request, max = MAX_BODY): Promise<Uint8Array | null> {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array(0);
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
  return all;
}

/** A database error that only means "busy for a moment" (try again), not a bug. */
export function isBusy(e: unknown): boolean {
  return /SQLITE_BUSY|database is locked|D1_ERROR.*(busy|overloaded|reset|timed? ?out)|Network connection lost|storage operation exceeded timeout|fetch failed|other side closed|UND_ERR_SOCKET/i.test(String((e as Error)?.message ?? e));
}

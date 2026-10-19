import { Hono } from 'hono';
import { readText } from '../lib/security';
import type { EngineDeps } from '../sms/engine';
import { handleReceipt, processInbound, recordInbound } from '../sms/inbound';
import { parseInbound, ReceiptPayload, safeEqual, verifySignature } from '../sms/webhook';
import type { Env } from '../env';

type HookEnv = { Bindings: Env };

/**
 * Mobile Message webhooks. They retry on any non-2xx or after 5 s, so:
 * check the secret, save the text, answer 200, and act on it after responding.
 * If acting fails, the cron sweep finishes the job (sms/inbound.ts sweepInbound).
 */
export function hookRoutes(deps: (env: Env) => EngineDeps) {
  const app = new Hono<HookEnv>();

  app.use('*', async (c, next) => {
    const secret = c.env.MM_HOOK_SECRET;
    if (!secret || !safeEqual(c.req.query('k') ?? '', secret)) return c.json({ error: { code: 'unauthorised', message: 'Bad hook key' } }, 401);
    await next();
  });

  app.post('/mm/inbound', async (c) => {
    const raw = await readText(c.req.raw);
    if (raw === null) return c.json({ ok: true, ignored: true }); // oversized: a retry won't fix it
    if (!(await signatureOk(c.env, raw, c.req.header('X-MM-Timestamp'), c.req.header('X-MM-Signature')))) {
      return c.json({ error: { code: 'unauthorised', message: 'Bad signature' } }, 401);
    }
    const sms = await parseInbound(raw);
    if (!sms) return c.json({ ok: true, ignored: true }); // malformed: a retry won't fix it
    const d = deps(c.env);
    const rec = await recordInbound(d, sms);
    if (rec?.fresh) c.executionCtx.waitUntil(processInbound(d, rec.row).catch((e) => console.error('inbound', rec.row.id, e)));
    return c.json({ ok: true });
  });

  app.post('/mm/status', async (c) => {
    const raw = await readText(c.req.raw);
    if (raw === null) return c.json({ ok: true, ignored: true }); // oversized: a retry won't fix it
    if (!(await signatureOk(c.env, raw, c.req.header('X-MM-Timestamp'), c.req.header('X-MM-Signature')))) {
      return c.json({ error: { code: 'unauthorised', message: 'Bad signature' } }, 401);
    }
    let json: unknown = null;
    try { json = JSON.parse(raw); } catch { /* ignored below */ }
    const receipt = ReceiptPayload.safeParse(json);
    if (receipt.success) await handleReceipt(deps(c.env), receipt.data.message_id, receipt.data.status);
    return c.json({ ok: true });
  });

  return app;
}

async function signatureOk(env: Env, raw: string, ts: string | undefined, sig: string | undefined) {
  if (!env.MM_SIGNING_SECRET) return true;
  return verifySignature(env.MM_SIGNING_SECRET, raw, ts ?? null, sig ?? null, new Date());
}

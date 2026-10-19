import { D1SmsStore } from './db/smsStore';
import type { EngineDeps } from './sms/engine';
import { mobileMessage } from './sms/provider';

/** Bindings and secrets (wrangler.toml + `wrangler secret put`). See docs/SETUP_ACCOUNTS.md. */
export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  PUBLIC_BASE_URL: string;
  MM_USER?: string;
  MM_PASS?: string;
  /** Random string in the webhook URLs (?k=). */
  MM_HOOK_SECRET?: string;
  /** Optional HMAC secret from Mobile Message Settings > API. When set, signatures are required. */
  MM_SIGNING_SECRET?: string;
}

/** Real dependencies for the SMS engine. Tests build their own. */
export function engineDeps(env: Env): EngineDeps {
  return {
    store: new D1SmsStore(env.DB, env.PUBLIC_BASE_URL),
    // Without credentials every send fails as 'auth': nothing goes out, and the admin is told why.
    provider: mobileMessage({ user: env.MM_USER ?? '', pass: env.MM_PASS ?? '' }),
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
  };
}

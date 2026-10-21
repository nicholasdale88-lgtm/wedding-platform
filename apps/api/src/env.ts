import { D1SmsStore } from './db/smsStore';
import type { EngineDeps } from './sms/engine';
import { mobileMessage } from './sms/provider';
import { texto } from './sms/texto';

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
  /** 32+ random bytes; sessions are stored as HMAC(SESSION_SECRET, token). */
  SESSION_SECRET?: string;
  /** Comma-separated emails of platform super-admins. */
  SUPER_ADMINS?: string;
  /** Which SMS provider sends: 'mobilemessage' (default) or 'texto'. */
  SMS_PROVIDER?: string;
  /** Texto API key (txt_…), from app.texto.com.au → settings. */
  TEXTO_API_KEY?: string;
  /** Texto webhook secret; when set, X-Texto-Signature is required on its webhooks. */
  TEXTO_WEBHOOK_SECRET?: string;
  /** Linked photo storage (docs/SETUP_ACCOUNTS.md → "Photo storage links"): each provider's app keys. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  DROPBOX_APP_KEY?: string;
  DROPBOX_APP_SECRET?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  /** Email through Resend (lib/email.ts): the API key, and who it's from ("Name <hello@your-domain>"). */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /**
   * Stripe secret key (sk_live_… or sk_test_…), for paying by card (routes/billing.ts). Card payment is on
   * only when this and STRIPE_WEBHOOK_SECRET are both set; otherwise couples ask for a payment link.
   */
  STRIPE_SECRET_KEY?: string;
  /** Signing secret (whsec_…) of the Stripe webhook pointed at /api/hooks/stripe: it switches plans on once paid. */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Workers AI, for the planning assistant (bound by the deploy only when the account allows it). */
  AI?: {
    run(model: string, input: unknown): Promise<unknown>;
    /** Documents (PDF, images) to Markdown text (used to read vendors' quotes). */
    toMarkdown?(files: { name: string; blob: Blob }[]): Promise<{ name: string; data: string; format?: string }[]>;
  };
}

/** Real dependencies for the SMS engine. Tests build their own. */
export function engineDeps(env: Env): EngineDeps {
  return {
    store: new D1SmsStore(env.DB, env.PUBLIC_BASE_URL),
    // Without credentials every send fails as 'auth': nothing goes out, and the admin is told why.
    provider: env.SMS_PROVIDER === 'texto' ? texto({ apiKey: env.TEXTO_API_KEY ?? '' }) : mobileMessage({ user: env.MM_USER ?? '', pass: env.MM_PASS ?? '' }),
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
  };
}

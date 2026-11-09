import type { Env } from '../env';

/**
 * Who pays for a wedding's texts: the couple, always.
 *
 * Couples buy text credits with their card (Texting → Buy texts, Stripe Checkout; the rate
 * in @wp/shared TEXT_RATE). There's nothing to sign up to and no keys to paste: their texts go out through the site's
 * Mobile Message account, one credit per text part, and stop when the credits run out. The site never pays
 * for a couple's texts: a wedding with no credits texts nothing automatically (sending from their own phone
 * or by email stays free).
 */

export interface SmsAccount {
  user: string;
  pass: string;
}

/** Mobile Message's sign-in header for an account. */
export const mmAuth = (a: SmsAccount) => ({ authorization: 'Basic ' + btoa(`${a.user}:${a.pass}`) });

/** The site's Mobile Message account, if its keys are set (deploy or Company → Connections). */
export const siteAccount = (env: Env): SmsAccount | null => (env.SMS_PROVIDER !== 'texto' && env.MM_USER && env.MM_PASS ? { user: env.MM_USER, pass: env.MM_PASS } : null);

/** The text credits a wedding has left (bought, less what's been sent). */
export async function creditsOf(env: Env, weddingId: string): Promise<number> {
  const w = await env.DB.prepare(`SELECT wallet_credits AS n FROM wedding WHERE id = ?`).bind(weddingId).first<{ n: number | null }>();
  return Math.max(0, Number(w?.n ?? 0));
}

/** The account this wedding's texts go through: the site's, only while the couple has credits they bought. */
export async function smsAccountFor(env: Env, weddingId: string): Promise<SmsAccount | null> {
  const a = siteAccount(env);
  if (!a) return null;
  return (await creditsOf(env, weddingId)) > 0 ? a : null;
}

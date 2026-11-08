import type { Env } from '../env';

/**
 * The site's connections to other services (Google, Dropbox, Stripe, Resend, the texting service), pasted
 * by the owner in the company portal (Settings → Connections) instead of GitHub secrets. Kept encrypted
 * (AES-GCM, a key made from SESSION_SECRET) in platform_setting 'connections', never sent back to the
 * browser, and laid over the Worker's env for each request and cron run. A value set by the deploy (a
 * GitHub secret) always wins, so nothing already working changes.
 */

export const CONNECTION_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'DROPBOX_APP_KEY',
  'DROPBOX_APP_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'INBOX_DOMAIN',
  'MM_USER',
  'MM_PASS',
] as const;
export type ConnectionKey = (typeof CONNECTION_KEYS)[number];
type Stored = Partial<Record<ConnectionKey, string>>;

const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function cryptoKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`${secret}:connections`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(secret: string, data: Stored): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(secret), enc.encode(JSON.stringify(data))));
  return JSON.stringify({ iv: b64(iv), box: b64(box) });
}

async function open(secret: string, value: string): Promise<Stored> {
  try {
    const { iv, box } = JSON.parse(value) as { iv: string; box: string };
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await cryptoKey(secret), unb64(box));
    const v: unknown = JSON.parse(new TextDecoder().decode(plain));
    return v && typeof v === 'object' ? (v as Stored) : {};
  } catch {
    return {};
  }
}

/** The stored connections (decrypted), kept for a minute per database so each request doesn't re-read them. */
const cache = new WeakMap<object, { at: number; data: Stored }>();
export async function readConnections(env: Env): Promise<Stored> {
  if (!env.SESSION_SECRET || !env.DB) return {};
  const hit = cache.get(env.DB);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const row = await env.DB.prepare(`SELECT value FROM platform_setting WHERE key = 'connections'`).first<{ value: string }>().catch(() => null);
  const data = row ? await open(env.SESSION_SECRET, row.value) : {};
  cache.set(env.DB, { at: Date.now(), data });
  return data;
}

/** Which keys this file filled in (so a key the deploy or a test set is never touched). */
const filled = new WeakMap<object, Set<ConnectionKey>>();

/** Lays the stored connections over env, only where nothing else set the key. */
export async function applyConnections(env: Env): Promise<void> {
  if (!env.DB) return;
  const mine = env as unknown as Record<string, string | undefined>;
  const ours = filled.get(env) ?? new Set<ConnectionKey>();
  filled.set(env, ours);
  const stored = await readConnections(env);
  for (const k of CONNECTION_KEYS) {
    if (mine[k] && !ours.has(k)) continue; // set by the deploy (a GitHub secret)
    const v = stored[k];
    if (v) {
      mine[k] = v;
      ours.add(k);
    } else if (ours.has(k)) {
      mine[k] = undefined;
      ours.delete(k);
    }
  }
}

/** For the portal: each key, and whether it's set here, by the deploy, or not at all (never the value). */
export async function connectionStatus(env: Env): Promise<Record<ConnectionKey, 'deploy' | 'saved' | ''>> {
  await applyConnections(env);
  const mine = env as unknown as Record<string, string | undefined>;
  const ours = filled.get(env) ?? new Set<ConnectionKey>();
  return Object.fromEntries(CONNECTION_KEYS.map((k) => [k, ours.has(k) ? 'saved' : mine[k] ? 'deploy' : ''])) as Record<ConnectionKey, 'deploy' | 'saved' | ''>;
}

/** Saves some keys ('' clears one); keys the deploy set are left alone. */
export async function saveConnections(env: Env, patch: Partial<Record<ConnectionKey, string>>): Promise<void> {
  if (!env.SESSION_SECRET) throw new Error('no secret');
  const next: Stored = { ...(await readConnections(env)) };
  for (const [k, v] of Object.entries(patch) as [ConnectionKey, string][]) {
    if (v.trim()) next[k] = v.trim();
    else delete next[k];
  }
  await env.DB.prepare(`INSERT INTO platform_setting (key, value, updated_at) VALUES ('connections', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(await seal(env.SESSION_SECRET, next), new Date().toISOString())
    .run();
  cache.delete(env.DB);
  await applyConnections(env);
}

/**
 * Couple/admin login (docs/02 Auth): email + passcode for now, magic links in M5.
 * - Passcodes: PBKDF2-SHA256, 100,000 iterations (the Workers maximum), random salt.
 * - Sessions: a random token in an HttpOnly cookie; the database stores only HMAC(SESSION_SECRET, token),
 *   so a leaked database can't be used to log in.
 */

const ITERATIONS = 100_000;
const enc = new TextEncoder();

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf: Uint8Array) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function pbkdf2(passcode: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(passcode.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

/** "pbkdf2$100000$<salt>$<hash>" */
export async function hashPasscode(passcode: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(passcode, salt, ITERATIONS))}`;
}

export async function verifyPasscode(passcode: string, stored: string | null): Promise<boolean> {
  const [scheme, iter, salt, hash] = (stored ?? '').split('$');
  // Still do the work when there's no user, so timing doesn't reveal which emails exist.
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) {
    await pbkdf2(passcode, new Uint8Array(16), ITERATIONS);
    return false;
  }
  const got = await pbkdf2(passcode, unb64(salt), Number(iter));
  const want = unb64(hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i]! ^ (want[i] ?? 0);
  return diff === 0;
}

/** Passcodes: at least 8 characters. Plain-English message for the UI. */
export function passcodeProblem(passcode: string): string | null {
  return passcode.length < 8 ? 'Use at least 8 characters.' : null;
}

export const newSessionToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

/** What the database stores for a session token. */
export async function sessionId(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(token))));
}

export const SESSION_COOKIE = 'wp_session';
export const SESSION_DAYS = 30;

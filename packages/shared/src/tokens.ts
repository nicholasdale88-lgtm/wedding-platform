const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** URL-safe random string. 22 chars x 6 bits = 132 bits, unguessable. */
export function randomToken(length = 22): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 63]!;
  return out;
}

/** Short link code for SMS (docs/09 §A). Avoids look-alike characters. */
export function shortCode(length = 6): string {
  const safe = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += safe[b % safe.length]!;
  return out;
}

export const isToken = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(s);

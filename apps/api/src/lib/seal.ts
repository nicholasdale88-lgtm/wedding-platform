/**
 * Sealing secrets we must keep (the couple's storage refresh tokens): AES-256-GCM with a key derived
 * from SESSION_SECRET (HKDF, its own label), so a copy of the database alone can't use them.
 * Format: "v1.<iv>.<ciphertext>" (base64url).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function keyFor(secret: string, label: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('wedding-platform/seal'), info: enc.encode(label) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(secret: string, label: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(secret, label), enc.encode(plain)));
  return `v1.${b64u(iv)}.${b64u(ct)}`;
}

/** The sealed text, or null if it was tampered with or sealed under another secret. */
export async function unseal(secret: string, label: string, sealed: string): Promise<string | null> {
  const [v, iv, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !ct) return null;
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, await keyFor(secret, label), unb64u(ct)));
  } catch {
    return null;
  }
}

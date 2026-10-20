import { sessionId } from './auth';

/**
 * The photo QR code printed on table cards and signs: it opens the photo page without a guest's own
 * link (anyone at the tables can add photos, giving their name). It's derived from the wedding's id and
 * the server secret, so it can't be guessed from the slug, needs nothing stored, and works for every
 * event's album. Uploads through it are rate limited per phone and per wedding.
 */
export async function photoCode(secret: string, weddingId: string): Promise<string> {
  return (await sessionId(`photo-qr:${weddingId}`, secret)).slice(0, 16);
}

export async function isPhotoCode(secret: string | undefined, weddingId: string, code: string): Promise<boolean> {
  if (!secret || !/^[A-Za-z0-9_-]{16}$/.test(code)) return false;
  const want = await photoCode(secret, weddingId);
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= want.charCodeAt(i) ^ code.charCodeAt(i);
  return diff === 0;
}

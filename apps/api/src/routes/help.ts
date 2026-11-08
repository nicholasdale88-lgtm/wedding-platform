import { HELP_VOICE, HELP_VOICE_BACKUP, helpSayLine, speakable } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { allow } from '../lib/rateLimit';
import { requireUser, type AdminEnv } from './auth';

/**
 * Help's narration: GET /api/a/help/voice?id=<guide>&step=<n> (step -1 is the guide's intro). Only the
 * walkthroughs' own lines (HELP_SAY) are ever spoken, never other text, so the free Workers AI allowance
 * can't be spent on anything else. Each line is made once (Deepgram Aura on Workers AI), kept in D1
 * (help_audio, keyed by a hash of model, voice and words) and served from there ever after, with a week's
 * private browser cache. No Workers AI, a busy day or a failure: an error, and the walkthrough reads it
 * with the device's own voice instead.
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 403 | 404 | 429 | 502 | 503, code: string, message: string) => c.json({ error: { code, message } }, status);
const MAX_BYTES = 1_500_000;
/** New lines made per day, in characters: about what the free daily allowance covers (lines once made are free). */
export const HELP_VOICE_DAILY_CHARS = 3500;

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Workers AI hands audio back as a stream (or, depending on the binding, bytes, a Response or base64). */
async function bytesOf(out: unknown): Promise<Uint8Array | null> {
  if (!out) return null;
  if (out instanceof Uint8Array) return out;
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (out instanceof Response) return new Uint8Array(await out.arrayBuffer());
  if (out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer());
  const audio = (out as { audio?: unknown }).audio;
  if (typeof audio === 'string') {
    const bin = atob(audio);
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  }
  return audio ? bytesOf(audio) : null;
}

/** What kind of audio it is, from its first bytes. */
function mimeOf(b: Uint8Array) {
  const head = String.fromCharCode(...b.subarray(0, 4));
  if (head === 'OggS') return 'audio/ogg';
  if (head === 'RIFF') return 'audio/wav';
  if (head === 'fLaC') return 'audio/flac';
  return 'audio/mpeg';
}

const audioResponse = (bytes: Uint8Array, mime: string, from: 'kept' | 'new') =>
  new Response(bytes, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.byteLength),
      // The address carries a fingerprint of the words (v=…), so a week's cache never plays an old line.
      'Cache-Control': 'private, max-age=604800',
      'X-Help-Voice': from,
    },
  });

export function helpRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', requireUser);

  app.get('/voice', async (c) => {
    const id = c.req.query('id') ?? '';
    const step = Number(c.req.query('step') ?? 'x');
    const line = helpSayLine(id, step);
    if (line === null) return err(c, 404, 'unknown', 'There’s no such walkthrough step.');
    // Signed-in couples, planners and helpers (anyone on a wedding), and the company's own staff.
    const user = c.get('user');
    if (!user.staff) {
      const member = await c.env.DB.prepare(`SELECT 1 AS ok FROM membership WHERE user_id = ? LIMIT 1`).bind(user.id).first();
      if (!member) return err(c, 403, 'forbidden', 'Walkthrough voices are for signed-in couples.');
    }
    const text = speakable(line);
    const voices = [HELP_VOICE, HELP_VOICE_BACKUP];
    const keys = await Promise.all(voices.map((v) => sha256(`${v.model}|${v.speaker}|${text}`)));
    for (const key of keys) {
      const kept = await c.env.DB.prepare(`SELECT mime, audio FROM help_audio WHERE key = ?`).bind(key).first<{ mime: string; audio: ArrayBuffer | number[] }>();
      if (kept) return audioResponse(kept.audio instanceof ArrayBuffer ? new Uint8Array(kept.audio) : Uint8Array.from(kept.audio), kept.mime, 'kept');
    }

    if (!c.env.AI) return err(c, 503, 'off', 'The natural voice isn’t switched on for this site.');
    // Keep within the free daily allowance: a cap on new lines a day (site-wide), and per person an hour.
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const today = await c.env.DB.prepare(`SELECT COALESCE(SUM(chars), 0) AS n FROM help_audio WHERE created_at > ?`).bind(since).first<{ n: number }>();
    if ((today?.n ?? 0) + text.length > HELP_VOICE_DAILY_CHARS) return err(c, 429, 'busy', 'The natural voice has done its bit for today.');
    if (!(await allow(c.env.DB, `help-voice:${user.id}`, 60, 60 * 60_000))) return err(c, 429, 'busy', 'The natural voice needs a breather.');

    for (const [i, v] of voices.entries()) {
      try {
        const bytes = await bytesOf(await c.env.AI.run(v.model, { text, speaker: v.speaker }));
        if (!bytes || bytes.byteLength < 200 || bytes.byteLength > MAX_BYTES) continue;
        const mime = mimeOf(bytes);
        await c.env.DB.prepare(`INSERT OR REPLACE INTO help_audio (key, model, speaker, chars, mime, audio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(keys[i]!, v.model, v.speaker, text.length, mime, bytes, new Date().toISOString())
          .run();
        return audioResponse(bytes, mime, 'new');
      } catch (e) {
        console.error('help voice', v.model, e);
      }
    }
    return err(c, 502, 'voice_failed', 'The natural voice isn’t available just now.');
  });

  return app;
}

import type { Env } from '../env';

/**
 * Email, through Resend (resend.com; free for 3,000 a month). On when RESEND_API_KEY and EMAIL_FROM
 * ("Your wedding <hello@your-domain>", a domain verified in Resend) are set; until then nothing is sent
 * and the admin offers the link to copy or text instead.
 */
export const emailReady = (env: Env) => !!(env.RESEND_API_KEY && env.EMAIL_FROM);

const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ENTITY[ch] ?? ch);

/** A short, warm email with one button: plain text and a simple HTML version. */
export function buttonEmail(o: { heading: string; lines: string[]; button: string; link: string; footer?: string }) {
  const text = [o.heading, '', ...o.lines, '', `${o.button}: ${o.link}`, ...(o.footer ? ['', o.footer] : [])].join('\n');
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:28px 20px;color:#33402f;background:#fbf8f2">
<h1 style="font-weight:normal;font-size:28px;margin:0 0 16px">${esc(o.heading)}</h1>
${o.lines.map((l) => `<p style="font-size:17px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(o.link)}" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#33402f;color:#fbf8f2;text-decoration:none;font-family:Arial,sans-serif;font-size:16px">${esc(o.button)}</a></p>
${o.footer ? `<p style="font-size:13px;color:#7a7466;margin:0">${esc(o.footer)}</p>` : ''}
</div>`;
  return { text, html };
}

/** Sends one email; true when Resend took it. Never throws (the caller still has the link to share). */
export async function sendEmail(env: Env, m: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (!emailReady(env)) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

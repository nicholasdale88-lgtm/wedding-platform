import type { Env } from '../env';

/**
 * Email, through Resend (resend.com; free for 3,000 a month). On when RESEND_API_KEY and EMAIL_FROM
 * ("Your wedding <hello@your-domain>", a domain verified in Resend) are set; until then nothing is sent
 * and the admin offers the link to copy or text instead.
 */
export const emailReady = (env: Env) => !!(env.RESEND_API_KEY && env.EMAIL_FROM);

const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ENTITY[ch] ?? ch);

/** A short, warm email with one button: plain text and a simple HTML version. */
export function buttonEmail(o: { heading: string; lines: string[]; button: string; link: string; footer?: string; brand?: boolean }) {
  const tag = 'The Yes List · weddings, beautifully organised';
  const text = [...(o.brand ? ['The Yes List', ''] : []), o.heading, '', ...o.lines, '', `${o.button}: ${o.link}`, ...(o.footer ? ['', o.footer] : []), ...(o.brand ? ['', tag] : [])].join('\n');
  // From The Yes List itself (not a couple's own message): its wordmark at the top and a line at the foot.
  // The rings (the app icon), from the site the button links to.
  let icon = '';
  try {
    icon = `${new URL(o.link).origin}/icons/icon-180.png`;
  } catch {
    icon = '';
  }
  const rings = icon ? `<img src="${esc(icon)}" width="28" height="28" alt="" style="vertical-align:middle;border-radius:7px;margin-right:10px">` : '';
  const mark = o.brand ? `<p style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:#7a7466">${rings}The Yes List</p>\n` : '';
  const foot = o.brand ? `\n<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e2d7bc;font-family:Arial,sans-serif;font-size:12px;color:#7a7466">${tag}</p>` : '';
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:28px 20px;color:#33402f;background:#fbf8f2">
${mark}<h1 style="font-weight:normal;font-size:28px;margin:0 0 16px">${esc(o.heading)}</h1>
${o.lines.map((l) => `<p style="font-size:17px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(o.link)}" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#33402f;color:#fbf8f2;text-decoration:none;font-family:Arial,sans-serif;font-size:16px">${esc(o.button)}</a></p>
${o.footer ? `<p style="font-size:13px;color:#7a7466;margin:0">${esc(o.footer)}</p>` : ''}${foot}
</div>`;
  return { text, html };
}

/** A plain message as simple HTML (line breaks kept, nothing in it treated as markup). */
export const plainHtml = (text: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${esc(text).replace(/\r?\n/g, '<br>')}</div>`;

/**
 * Sends one email; true when Resend took it. Never throws (the caller still has the link to share).
 * `from` is the site's EMAIL_FROM unless given (a couple's own address on a domain verified in Resend);
 * `headers` carries In-Reply-To so replies stay in the same conversation.
 */
export async function sendEmail(
  env: Env,
  m: { to: string; subject: string; text: string; html: string; replyTo?: string[]; from?: string; headers?: Record<string, string> },
): Promise<boolean> {
  if (!emailReady(env)) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: m.from ?? env.EMAIL_FROM,
        to: [m.to],
        subject: m.subject,
        text: m.text,
        html: m.html,
        ...(m.replyTo?.length ? { reply_to: m.replyTo } : {}),
        ...(m.headers && Object.keys(m.headers).length ? { headers: m.headers } : {}),
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

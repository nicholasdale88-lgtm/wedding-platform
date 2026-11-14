/**
 * Amazon SES (the cheaper sender at volume, ~US$0.10 per 1,000): its v2 SendEmail call, signed with AWS
 * Signature Version 4 using Web Crypto (no AWS SDK in the Worker). See docs/GROWTH_PLAN.md → Email.
 */

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}
/** RFC 3986 encoding, as SigV4 wants it (encodeURIComponent leaves !'()* alone). */
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SigV4Input {
  method: string;
  url: string;
  /** Headers to sign besides host and x-amz-date (lower-case names). */
  headers: Record<string, string>;
  body: string;
  service: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  now?: Date;
}

/** The headers to send (x-amz-date and Authorization added) for a SigV4-signed request. */
export async function signV4(i: SigV4Input): Promise<Record<string, string>> {
  const u = new URL(i.url);
  const amzDate = (i.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20150830T123600Z
  const day = amzDate.slice(0, 8);
  const all: Record<string, string> = {};
  for (const [k, v] of Object.entries(i.headers)) all[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ');
  all.host = u.host;
  all['x-amz-date'] = amzDate;
  const names = Object.keys(all).sort();
  const signed = names.join(';');
  const query = [...u.searchParams.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonical = [i.method.toUpperCase(), u.pathname || '/', query, ...names.map((n) => `${n}:${all[n]}`), '', signed, await sha256(i.body)].join('\n');
  const scope = `${day}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  let key = await hmac(enc.encode(`AWS4${i.secretAccessKey}`), day);
  for (const part of [i.region, i.service, 'aws4_request']) key = await hmac(key, part);
  const signature = hex(await hmac(key, toSign));
  const out: Record<string, string> = { ...i.headers, 'x-amz-date': amzDate };
  out.authorization = `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  return out;
}

export interface SesKeys {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/** Sends one email through SES v2; true when SES accepted it. */
export async function sendSes(
  keys: SesKeys,
  m: { from: string; to: string; subject: string; text: string; html: string; replyTo?: string[]; headers?: Record<string, string> },
  now?: Date,
): Promise<boolean> {
  const region = keys.region.trim().toLowerCase();
  if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) return false;
  const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const extra = Object.entries(m.headers ?? {}).map(([Name, Value]) => ({ Name, Value }));
  const body = JSON.stringify({
    FromEmailAddress: m.from,
    Destination: { ToAddresses: [m.to] },
    ...(m.replyTo?.length ? { ReplyToAddresses: m.replyTo } : {}),
    Content: {
      Simple: {
        Subject: { Data: m.subject, Charset: 'UTF-8' },
        Body: { Text: { Data: m.text, Charset: 'UTF-8' }, Html: { Data: m.html, Charset: 'UTF-8' } },
        ...(extra.length ? { Headers: extra } : {}),
      },
    },
  });
  const headers = await signV4({ method: 'POST', url, headers: { 'content-type': 'application/json' }, body, service: 'ses', region, accessKeyId: keys.accessKeyId.trim(), secretAccessKey: keys.secretAccessKey.trim(), now });
  const r = await fetch(url, { method: 'POST', headers, body });
  return r.ok;
}

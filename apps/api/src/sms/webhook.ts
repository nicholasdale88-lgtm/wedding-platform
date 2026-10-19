import { z } from 'zod';
import type { InboundSms } from './inbound';

/** Mobile Message inbound payload (llms-full.txt). All strings. */
const InboundPayload = z.object({
  to: z.string().default(''),
  message: z.string().default(''),
  sender: z.string(),
  received_at: z.string().default(''),
  type: z.enum(['inbound', 'unsubscribe']).catch('inbound'),
});

export const ReceiptPayload = z.object({
  message_id: z.string(),
  status: z.string(),
  custom_ref: z.string().optional(),
});

export async function parseInbound(raw: string): Promise<InboundSms | null> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const p = InboundPayload.safeParse(json);
  if (!p.success) return null;
  const { sender, to, message, received_at, type } = p.data;
  return {
    from: sender,
    to: to || null,
    body: message,
    receivedAt: received_at,
    type,
    // No message id in the payload, so retries are recognised by a hash of what was received.
    providerId: await sha256Hex(`${sender}|${to}|${received_at}|${message}|${type}`),
  };
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/**
 * Optional HMAC signature: X-MM-Signature = hex HMAC-SHA256("{timestamp}.{raw body}").
 * Timestamps more than 5 minutes off are rejected.
 */
export async function verifySignature(
  secret: string,
  raw: string,
  timestamp: string | null,
  signature: string | null,
  now: Date,
): Promise<boolean> {
  if (!timestamp || !signature) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`));
  return safeEqual(toHex(mac), signature.toLowerCase());
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

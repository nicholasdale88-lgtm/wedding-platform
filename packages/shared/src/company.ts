import { z } from 'zod';

/**
 * The company's own settings (the platform owner's portal, /company): social links shown on the front
 * page, a banner (a launch offer, say), whether guest pages carry a small "Made with" link (the app's best
 * advert: every guest sees it), and promo codes couples can use when they pay.
 */

const url = z.string().trim().max(300).default('');

export const SiteSettings = z.object({
  social: z
    .object({ instagram: url, tiktok: url, facebook: url, pinterest: url, youtube: url })
    .default({}),
  supportEmail: z.string().trim().max(200).default(''),
  /** A line across the top of the front page (a launch offer, news); on or off. */
  banner: z.object({ on: z.boolean().default(false), text: z.string().trim().max(160).default(''), link: z.string().trim().max(300).default('') }).default({}),
  /** "Made with The Yes List" at the foot of guest pages, linking to the front page with the wedding as referrer. */
  madeWith: z.boolean().default(true),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

export const PROMO_FOR = ['essentials', 'complete', 'event'] as const;
export const Promo = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,24}$/, 'Codes are 3 to 24 letters, numbers or dashes.'),
  /** Percent off (0 to 100), or a fixed amount off in cents; whichever gives more. */
  percentOff: z.number().int().min(0).max(100).default(0),
  amountOffCents: z.number().int().min(0).max(1_000_000).default(0),
  /** What it's for (empty: anything). */
  plans: z.array(z.enum(PROMO_FOR)).max(3).default([]),
  /** Last day it works (yyyy-mm-dd; empty: no end). */
  expires: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
  /** How many times it can be used (0: no limit). */
  maxUses: z.number().int().min(0).max(100_000).default(0),
  note: z.string().trim().max(120).default(''),
  on: z.boolean().default(true),
});
export type Promo = z.infer<typeof Promo>;
export const Promos = z.object({ codes: z.array(Promo).max(200).default([]) });
export type Promos = z.infer<typeof Promos>;

/**
 * The price with a code: the new amount in cents and how much is off, or why it can't be used. `used` is
 * how many paid purchases have used it; `today` is yyyy-mm-dd.
 */
export function promoPrice(cents: number, promo: Promo | undefined, what: (typeof PROMO_FOR)[number], today: string, used: number): { ok: true; cents: number; off: number } | { ok: false; reason: string } {
  if (!promo || !promo.on) return { ok: false, reason: 'That code isn’t right. Check it and try again.' };
  if (promo.expires && promo.expires < today) return { ok: false, reason: 'That code has finished.' };
  if (promo.maxUses && used >= promo.maxUses) return { ok: false, reason: 'That code has been used up.' };
  if (promo.plans.length && !promo.plans.includes(what)) return { ok: false, reason: 'That code isn’t for this one.' };
  const off = Math.min(cents, Math.max(Math.round((cents * promo.percentOff) / 100), promo.amountOffCents));
  if (off <= 0) return { ok: false, reason: 'That code doesn’t take anything off.' };
  return { ok: true, cents: cents - off, off };
}

/** A referral or campaign source as kept on a sign-up: letters, numbers, dots, dashes, underscores. */
export const cleanRef = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60);

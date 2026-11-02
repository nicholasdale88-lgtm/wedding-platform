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
  /** Payment links (Stripe Payment Links, say) the portal emails a couple who asked for a plan. Company-only. */
  paymentLinks: z.object({ essentials: url, complete: url, event: url }).default({}),
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

/** What a couple tells us (Help → Tell us), and what we do about it (the company portal's Feedback). */
export const FEEDBACK_KINDS = ['idea', 'problem', 'love'] as const;
export const FEEDBACK_STATUS = ['new', 'planned', 'in_progress', 'done', 'not_now'] as const;
export const FeedbackIn = z.object({ kind: z.enum(FEEDBACK_KINDS).default('idea'), text: z.string().trim().min(3, 'A few words, please.').max(2000), page: z.string().trim().max(120).default('') }).strict();
export const FeedbackUpdate = z
  .object({ status: z.enum(FEEDBACK_STATUS).optional(), note: z.string().trim().max(500).optional(), assignee: z.string().max(40).optional() })
  .strict()
  .refine((v) => v.status !== undefined || v.note !== undefined || v.assignee !== undefined, 'A status, a note or who’s on it, please.');

/**
 * The people who run the app (the company portal), each with a role:
 * - owner: everything, including the team and money;
 * - manager: everything but the team;
 * - support: couples (find them, send payment links), feedback, vendors;
 * - developer: feedback (problems and ideas: take one, in progress, done);
 * - marketing: promotions, codes, the marketing list, vendors.
 * The address in SUPER_ADMINS is always an owner (the founder's account; it can't be removed here).
 */
export const STAFF_ROLES = ['owner', 'manager', 'support', 'developer', 'marketing'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_PERMS = ['overview', 'couples', 'money', 'feedback', 'promote', 'vendors', 'settings', 'team', 'activity'] as const;
export type StaffPerm = (typeof STAFF_PERMS)[number];
export const STAFF_CAN: Record<StaffRole, readonly StaffPerm[]> = {
  owner: STAFF_PERMS,
  manager: ['overview', 'couples', 'money', 'feedback', 'promote', 'vendors', 'settings', 'activity'],
  support: ['overview', 'couples', 'feedback', 'vendors'],
  developer: ['overview', 'feedback'],
  marketing: ['overview', 'promote', 'vendors'],
};
export const STAFF_INFO: Record<StaffRole, { name: string; does: string }> = {
  owner: { name: 'Owner', does: 'Everything, including the team, plans and money.' },
  manager: { name: 'Manager', does: 'Everything except adding or removing people.' },
  support: { name: 'Support', does: 'Helps couples: finds weddings, sends payment links, answers feedback, checks vendors.' },
  developer: { name: 'Developer', does: 'Works through feedback: takes problems and ideas, marks them in progress and done.' },
  marketing: { name: 'Marketing', does: 'Promo codes, the front-page banner, campaign links, the marketing list and vendors.' },
};
export const staffCan = (role: StaffRole | null | undefined, perm: StaffPerm) => !!role && STAFF_CAN[role].includes(perm);
export const StaffInviteIn = z.object({ email: z.string().trim().toLowerCase().email().max(200), role: z.enum(STAFF_ROLES) }).strict();


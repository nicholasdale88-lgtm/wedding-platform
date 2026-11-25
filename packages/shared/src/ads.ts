import { z } from 'zod';
import { EVENT_ADDON_CENTS, PLAN_PRICE_CENTS } from './plan';

/**
 * The Ads bot (Company portal → Promote → Ads): Facebook and Instagram ads run through Meta's Marketing API.
 * - A bot (or a person) writes drafts: words plus one of our own ad images.
 * - Nothing spends until a person who can see Money (an owner or manager) approves a draft. Approving puts
 *   it live in the one ad set, under the daily cap.
 * - Once a day the optimiser reads each live ad's spend and clicks, counts the sign-ups and paid weddings that
 *   came from its link (?ref=meta-<id>), pauses the losers and reports to the inbox. It never raises a budget.
 * - The account's own spending limit (set in Meta) is the last guard; the total cap here stops everything
 *   before it.
 */

/** Our own ad images (apps/web/public/ads), made for The Yes List: no third-party art, names or marks. */
export const AD_IMAGES = [
  { id: 'invite-feed', file: '/ads/invite-feed.png', label: 'Wax seal invitation (feed, 4:5)' },
  { id: 'invite-square', file: '/ads/invite-square.png', label: 'Wax seal invitation (square)' },
  { id: 'invite-story', file: '/ads/invite-story.png', label: 'Wax seal invitation (story, 9:16)' },
  { id: 'text-feed', file: '/ads/text-feed.png', label: 'RSVPs sorted by text (feed, 4:5)' },
  { id: 'text-square', file: '/ads/text-square.png', label: 'RSVPs sorted by text (square)' },
  { id: 'text-story', file: '/ads/text-story.png', label: 'RSVPs sorted by text (story, 9:16)' },
] as const;
export type AdImageId = (typeof AD_IMAGES)[number]['id'];
const IMAGE_IDS = AD_IMAGES.map((i) => i.id) as [AdImageId, ...AdImageId[]];

export const AD_CTAS = ['SIGN_UP', 'LEARN_MORE', 'GET_STARTED'] as const;
export const AD_CTA_LABEL: Record<(typeof AD_CTAS)[number], string> = { SIGN_UP: 'Sign up', LEARN_MORE: 'Learn more', GET_STARTED: 'Get started' };

/** A draft: what the ad says and shows. Meta's limits: primary text 125, headline 40, description 30. */
export const AdDraft = z
  .object({
    id: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,24}$/, 'A short name for the link: 2 to 24 letters, numbers or dashes.'),
    name: z.string().trim().min(1, 'A name, please.').max(60),
    primary: z.string().trim().min(10, 'The main words, please.').max(125, 'The main words fit in 125 characters.'),
    headline: z.string().trim().min(3, 'A headline, please.').max(40, 'The headline fits in 40 characters.'),
    description: z.string().trim().max(30, 'The line under the headline fits in 30 characters.').default(''),
    image: z.enum(IMAGE_IDS),
    cta: z.enum(AD_CTAS).default('SIGN_UP'),
  })
  .strict();
export type AdDraft = z.infer<typeof AdDraft>;

export const AD_STATUS = ['draft', 'live', 'paused', 'stopped'] as const;
export const AdStats = z.object({
  spendCents: z.number().int().min(0).default(0),
  impressions: z.number().int().min(0).default(0),
  clicks: z.number().int().min(0).default(0),
  signups: z.number().int().min(0).default(0),
  paid: z.number().int().min(0).default(0),
  at: z.string().max(40).default(''),
});
export type AdStats = z.infer<typeof AdStats>;

export const AdVariant = AdDraft.strip().extend({
  status: z.enum(AD_STATUS).default('draft'),
  /** Who wrote it, who approved it (names, for the card). */
  by: z.string().max(80).default(''),
  approvedBy: z.string().max(80).default(''),
  metaAdId: z.string().max(40).default(''),
  /** Why it was paused or stopped, in plain words. */
  why: z.string().max(200).default(''),
  stats: AdStats.default({}),
  createdAt: z.string().max(40).default(''),
});
export type AdVariant = z.infer<typeof AdVariant>;

export const AdsSettings = z.object({
  /** The most the ads spend a day, all together (A$1 to A$50). */
  dailyCapCents: z.number().int().min(100).max(5000).default(1000),
  /** Everything stops once this much has been spent in total (A$10 to A$1,000). */
  totalCapCents: z.number().int().min(1000).max(100_000).default(28_000),
  ageMin: z.number().int().min(18).max(65).default(24),
  ageMax: z.number().int().min(18).max(65).default(45),
  /** Pause an ad that has spent this much with no sign-ups. */
  pauseNoSignupCents: z.number().int().min(500).max(20_000).default(2500),
  /** Pause an ad whose cost per paid wedding is above this, once it has spent twice this. */
  pauseCostPerSaleCents: z.number().int().min(1000).max(50_000).default(4000),
});
export type AdsSettings = z.infer<typeof AdsSettings>;
export const AdsSettingsIn = AdsSettings.strict().refine((s) => s.ageMin <= s.ageMax, 'The youngest age is above the oldest.');

export const AdsState = z.object({
  settings: AdsSettings.default({}),
  variants: z.array(AdVariant).max(40).default([]),
  campaignId: z.string().max(40).default(''),
  adsetId: z.string().max(40).default(''),
  /** A person (or a bot) pressed Stop all; only a person who can see Money starts them again. */
  stoppedAll: z.boolean().default(false),
  /** The Sydney date the optimiser last ran (yyyy-mm-dd). */
  lastRun: z.string().max(10).default(''),
  log: z.array(z.object({ at: z.string().max(40), text: z.string().max(300) })).max(60).default([]),
});
export type AdsState = z.infer<typeof AdsState>;

/** The link an ad sends people to: the front page, where ?ref= is counted against sign-ups and sales. */
export const adRef = (id: string) => `meta-${id}`;
export const adLink = (base: string, id: string) => `${base.replace(/\/$/, '')}/?ref=${adRef(id)}&utm_source=meta&utm_campaign=ads-bot&utm_content=${id}`;

/** Prices we sell at today (dollars). An ad may only show these. */
export const AD_PRICES = [PLAN_PRICE_CENTS / 100, EVENT_ADDON_CENTS / 100];

/**
 * What's wrong with an ad's words, if anything: Meta's personal-attribute rule, no competitor names, no
 * claims we can't prove, no "free" (there's no free plan), only today's prices, no emoji.
 */
export function adCopyProblems(d: Pick<AdDraft, 'primary' | 'headline' | 'description' | 'name'>): string[] {
  const text = `${d.primary}\n${d.headline}\n${d.description}`;
  const out: string[] = [];
  if (/\b(are you|just|newly|recently|now|you'?re|you are|getting)\s+engaged\b|\byour engagement\b|congrat/i.test(text)) out.push('Meta doesn’t allow ads that say what someone is (“just engaged”, “your engagement”). Say “couples planning a wedding”.');
  if (/wooow|zola|the knot|minted|paperless post|evite|greenvelope|canva|withjoy|\bjoy app\b|riley ?& ?grey|squarespace|wix/i.test(text)) out.push('No other company’s name in an ad.');
  if (/#\s?1\b|number one|\bbest\b|guarantee|cheapest|lowest price|\breviews?\b|rated|★|⭐|award/i.test(text)) out.push('No claims we can’t prove (best, number one, guaranteed, reviews, ratings).');
  if (/\bfree\b/i.test(text)) out.push(`There’s no free plan now: say “$${PLAN_PRICE_CENTS / 100} once”.`);
  for (const m of text.matchAll(/(?:A?\$)\s?(\d+(?:\.\d+)?)/gi)) {
    if (!AD_PRICES.includes(Number(m[1]))) out.push(`$${m[1]} isn’t one of our prices ($${PLAN_PRICE_CENTS / 100} once, $${EVENT_ADDON_CENTS / 100} an extra event).`);
  }
  if (/\p{Extended_Pictographic}/u.test(text)) out.push('No emoji.');
  return out;
}

export type AdDecision = { id: string; pause: boolean; why: string };

/**
 * The daily decisions. Pause an ad that has spent the no-sign-up limit with none, or whose cost per sale is too
 * high once it has spent twice that. Never pause the last live ad on these grounds (the report says to try new
 * words instead); the total cap stops everything.
 */
export function adDecisions(state: AdsState): { decisions: AdDecision[]; stopAll: string } {
  const s = state.settings;
  const live = state.variants.filter((v) => v.status === 'live');
  const spent = state.variants.reduce((a, v) => a + v.stats.spendCents, 0);
  if (spent >= s.totalCapCents) return { decisions: [], stopAll: `Total spend reached the cap ($${(s.totalCapCents / 100).toFixed(0)}).` };
  const decisions: AdDecision[] = [];
  for (const v of live) {
    const st = v.stats;
    if (st.signups === 0 && st.spendCents >= s.pauseNoSignupCents) {
      decisions.push({ id: v.id, pause: true, why: `Spent $${(st.spendCents / 100).toFixed(2)} with no sign-ups.` });
    } else if (st.spendCents >= 2 * s.pauseCostPerSaleCents && (st.paid === 0 || st.spendCents / st.paid > s.pauseCostPerSaleCents)) {
      decisions.push({ id: v.id, pause: true, why: st.paid ? `$${(st.spendCents / st.paid / 100).toFixed(2)} a sale, above the $${(s.pauseCostPerSaleCents / 100).toFixed(0)} limit.` : `Spent $${(st.spendCents / 100).toFixed(2)} with no sales.` });
    }
  }
  if (decisions.length >= live.length && live.length) {
    // Keep the one bringing sign-ups most cheaply running.
    const cost = (v: AdVariant) => (v.stats.signups ? v.stats.spendCents / v.stats.signups : Number.MAX_SAFE_INTEGER - v.stats.clicks);
    const keep = [...live].sort((a, b) => cost(a) - cost(b))[0]!;
    return { decisions: decisions.filter((d) => d.id !== keep.id), stopAll: '' };
  }
  return { decisions, stopAll: '' };
}

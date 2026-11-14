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
  /**
   * Our Google Business "write a review" link. Shown to every couple after they send feedback, with no
   * reward attached and whatever they said (Google forbids rewarded or filtered reviews; the ACCC treats
   * rewarding or filtering for good reviews as misleading).
   */
  googleReview: url,
  /** A line across the top of the front page (a launch offer, news); on or off. */
  banner: z.object({ on: z.boolean().default(false), text: z.string().trim().max(160).default(''), link: z.string().trim().max(300).default('') }).default({}),
  /** "Made with The Yes List" at the foot of guest pages, linking to the front page with the wedding as referrer. */
  madeWith: z.boolean().default(true),
  /** Payment links (Stripe Payment Links, say) the portal emails a couple who asked for a plan. Company-only. */
  paymentLinks: z.object({ essentials: url, complete: url, event: url }).default({}),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

export const PROMO_FOR = ['basic', 'essentials', 'complete', 'event'] as const;
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
  plans: z.array(z.enum(PROMO_FOR)).max(4).default([]),
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

// cleanRef (a referral or campaign source) lives in ./text, so the front page needn't load these schemas.

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

/**
 * The things within a part of the portal that a made role can be kept from: a Bookkeeper who sees Money but
 * can't refund, a helper on Couples who can't email payment links. Each needs its part; having the part
 * gives all of them unless the role switches one off (CustomRole.deny). Built-in roles have all of theirs.
 */
export const STAFF_ABILITIES = {
  'couples.links': { area: 'couples', label: 'Email payment links' },
  'money.paid': { area: 'money', label: 'Mark paid and change plans' },
  'money.refund': { area: 'money', label: 'Refund couples' },
  'money.books': { area: 'money', label: 'Add expenses, change tax settings and targets' },
  'feedback.reply': { area: 'feedback', label: 'Email couples a reply' },
  'promote.codes': { area: 'promote', label: 'Change promo codes and the banner' },
  'promote.list': { area: 'promote', label: 'Download the marketing list' },
  'vendors.invite': { area: 'vendors', label: 'Email vendors invitations and give partner codes' },
} as const satisfies Record<string, { area: StaffPerm; label: string }>;
export type StaffAbility = keyof typeof STAFF_ABILITIES;
export const STAFF_ABILITY_KEYS = Object.keys(STAFF_ABILITIES) as StaffAbility[];
/** A part of the portal, or one thing within it. */
export type StaffAccess = StaffPerm | StaffAbility;
/** The parts given, plus every thing within them that isn't switched off. */
export function withAbilities(areas: readonly StaffPerm[], deny: readonly string[] = []): StaffAccess[] {
  return [...areas, ...STAFF_ABILITY_KEYS.filter((a) => areas.includes(STAFF_ABILITIES[a].area) && !deny.includes(a))];
}
/** A role: a built-in one (owner, manager…) or one the owners made ('custom:<id>'). */
export const StaffInviteIn = z.object({ email: z.string().trim().toLowerCase().email().max(200), role: z.string().trim().max(60) }).strict();


/**
 * Money and tax (company portal → Money): what the business keeps aside. Not tax advice: the numbers an
 * accountant asks for. GST only once registered (from gstFrom); a share of profit set aside for income tax.
 */
export const TaxSettings = z.object({
  abn: z.string().trim().max(20).default(''),
  gstRegistered: z.boolean().default(false),
  /** The day GST registration started (yyyy-mm-dd): sales from then include GST (1/11 of the price). */
  gstFrom: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
  /** How much of profit to put aside for income tax, in percent. */
  setAsidePct: z.number().int().min(0).max(60).default(30),
  /** Card fees: percent and fixed cents per card payment (Stripe Australia: 1.7% + 30c for local cards). */
  feePct: z.number().min(0).max(10).default(1.7),
  feeCents: z.number().int().min(0).max(500).default(30),
  /** What running the business costs every month (Grok, Claude, hosting, email, the domain spread over the year…). */
  monthlyCosts: z.array(z.object({ what: z.string().trim().min(1).max(80), cents: z.number().int().min(0).max(10_000_000) })).max(40).default([]),
  /** The goal: this much profit a month (after running costs, before tax), reached this many months after the start month. */
  targetProfitCents: z.number().int().min(0).max(100_000_000).default(400_000),
  targetMonths: z.number().int().min(1).max(24).default(3),
  /** The first month of the climb (yyyy-mm); empty: this month. */
  targetFrom: z.string().regex(/^(\d{4}-\d{2})?$/).default(''),
  /** The big goal: total profit by a date (the minimum, and the stretch), e.g. $25,000 and $50,000 by 18 Nov 2027. */
  goalCents: z.number().int().min(0).max(1_000_000_000).default(2_500_000),
  stretchCents: z.number().int().min(0).max(1_000_000_000).default(5_000_000),
  /** Where it's heading after that: e.g. $100,000 a year. */
  longTermCents: z.number().int().min(0).max(1_000_000_000).default(10_000_000),
  goalBy: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default('2027-11-18'),
});
export type TaxSettings = z.infer<typeof TaxSettings>;
export const EXPENSE_KINDS = ['hosting', 'domain', 'sms', 'email', 'ads', 'software', 'fees', 'other'] as const;
export const Expense = z.object({
  id: z.string().max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  what: z.string().trim().min(1).max(120),
  kind: z.enum(EXPENSE_KINDS).default('other'),
  cents: z.number().int().min(0).max(100_000_000),
  /** GST included in it (claimable once registered). */
  gstCents: z.number().int().min(0).max(100_000_000).default(0),
});
export type Expense = z.infer<typeof Expense>;
export const Expenses = z.object({ list: z.array(Expense).max(2000).default([]) });

/** The Australian financial year a date falls in: 2027 means 1 July 2026 to 30 June 2027. */
export const financialYear = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 7 ? y + 1 : y;
};
/** The BAS quarter (1 to 4: Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun). */
export const basQuarter = (iso: string) => [3, 3, 3, 4, 4, 4, 1, 1, 1, 2, 2, 2][Number(iso.slice(5, 7)) - 1]!;

/** Who someone helping run a wedding is to the couple (Settings → People). Planners and celebrants are partners too. */
export const MEMBER_RELATIONS = ['partner', 'family', 'planner', 'celebrant', 'venue', 'party', 'friend', 'vendor', 'other'] as const;
export type MemberRelation = (typeof MEMBER_RELATIONS)[number];
export const RELATION_LABEL: Record<MemberRelation, string> = {
  partner: 'Partner (getting married)',
  family: 'Family',
  planner: 'Wedding planner',
  celebrant: 'Celebrant',
  venue: 'Venue coordinator',
  party: 'Wedding party',
  friend: 'Friend helping out',
  vendor: 'Vendor',
  other: 'Someone else',
};

/** The company's own to-do list (Company portal → Overview): the owner's launch jobs, then anything added. */
export const TodoItem = z.object({
  id: z.string().max(40),
  text: z.string().trim().min(1).max(200),
  /** Where to do it (a page on another site, or a tab in the portal like "#settings"). */
  link: z.string().trim().max(300).default(''),
  /** Grouping: Business, Accounts to set up, Marketing, Before you announce… */
  group: z.string().trim().max(40).default(''),
  done: z.boolean().default(false),
  doneAt: z.string().max(40).default(''),
  doneBy: z.string().max(80).default(''),
});
export type TodoItem = z.infer<typeof TodoItem>;
export const Todos = z.object({
  items: z.array(TodoItem).max(200).default([]),
  seeded: z.boolean().default(false),
  /** Jobs from ADDED_TODOS already put on the list: one an owner removed doesn't come back. */
  offered: z.array(z.string().max(40)).max(200).default([]),
});

const t = (id: string, group: string, text: string, link = ''): TodoItem => ({ id, group, text, link, done: false, doneAt: '', doneBy: '' });
/** What the owner has to do to go live (docs/GO_LIVE.md), in order. */
export const LAUNCH_TODOS: TodoItem[] = [
  t('abn', 'Business', 'Get an ABN (free)', 'https://www.abr.gov.au/business-super-funds-charities/applying-abn'),
  t('name', 'Business', 'Register the business name "The Yes List" (about $45 a year)', 'https://connectonline.asic.gov.au'),
  t('domain', 'Business', 'Buy the domain (.com.au needs the ABN), then point it to Cloudflare', 'https://www.cloudflare.com'),
  t('bank', 'Business', 'Open a business bank account for payouts (optional, usually free)'),
  t('sophie', 'Business', 'Invite the second director as an Owner (Team → Invite someone)', '#team'),
  t('gacct', 'Accounts to set up', 'Make a business Google account (its email is shown to couples, not your personal Gmail)', 'https://accounts.google.com/signup'),
  t('google', 'Accounts to set up', 'Google Drive and Photos: register the site with Claude, then paste the 2 keys in Connections', '#settings'),
  t('stripe', 'Accounts to set up', 'Stripe: sign up (ABN, ID, bank), paste the 2 keys in Connections', 'https://dashboard.stripe.com/register'),
  t('resend', 'Accounts to set up', 'Resend: sign up, verify the domain, paste the key and From address in Connections', 'https://resend.com/signup'),
  t('workersai', 'Accounts to set up', 'Cloudflare: give the deploy token the Workers AI permission (natural help voice and the assistant)', 'https://dash.cloudflare.com/profile/api-tokens'),
  t('dropbox', 'Accounts to set up', 'Dropbox (optional): create the app, paste the 2 keys in Connections', 'https://www.dropbox.com/developers/apps/create'),
  t('mm', 'Accounts to set up', 'Automatic texts (optional): Mobile Message, paste the 2 keys in Connections', 'https://mobilemessage.com.au'),
  t('costs', 'Money', 'Enter the running costs (Grok, Claude, domain…) in Money & tax', '#money'),
  t('codes', 'Marketing', 'Make the launch code YES20 and partner codes (Promote)', '#promote'),
  t('socials', 'Marketing', 'Free accounts: Instagram, TikTok, Facebook page, Pinterest, Google Business Profile, Search Console'),
  t('meta', 'Marketing', 'Ads: in Meta Business make the ad account (with a spending limit) and a system user token, paste them in Connections, then approve drafts in Promote → Ads', '#settings'),
  t('videos', 'Marketing', 'Film the 6 short videos (docs/marketing/VIDEO_SCRIPTS.md)'),
  t('partners', 'Marketing', 'Put your ABN and name in the partner emails and send the first 5 (docs/marketing/PARTNER_KIT.md)'),
  t('grok', 'Marketing', 'Make Grok bot keys (Team → Bots) and schedule its jobs (docs/GROK_PLAYBOOK.md)', '#team'),
  t('rival', 'Marketing', 'Recheck the competitor price before running the price-comparison ad', 'https://www.wooowinvites.com/pricing'),
  t('legal', 'Before you announce', 'Check Privacy and Terms show your business name and ABN', '/terms'),
  t('test', 'Before you announce', 'Sign up as a test couple on the live site: invite, reply, seat, pay by card, then refund it', '/'),
  t('own', 'Before you announce', 'Your own wedding and the 30th look right on the live site', '/admin'),
  t('backup', 'Before you announce', 'Check the 12-hourly backup ran (GitHub → Actions → Nightly)', 'https://github.com/nicholasdale88-lgtm/wedding-platform/actions'),
];

/**
 * Owner jobs added after the list was first made (a saved list gets each once, at the end; removing it
 * keeps it gone). Things only the owner can do: accounts, keys, plan upgrades.
 */
export const ADDED_TODOS: TodoItem[] = [
  t('onedrive', 'Accounts to set up', 'OneDrive (optional): register the site with Microsoft, paste the 2 keys in Connections', 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'),
  t('xai', 'Accounts to set up', 'Grok (optional, paid): only if you want Grok instead of the free Cloudflare AI for the bots. xAI API account, pay as you go', 'https://console.x.ai'),
  t('vault', 'Accounts to set up', 'Passwords: put every account’s password in a free password manager (Bitwarden), then fill in Settings → Accounts', 'https://bitwarden.com/go/start-free/'),
  t('cfalerts', 'When you grow', 'Cloudflare: turn on usage email alerts (Notifications) so you hear before any limit', 'https://dash.cloudflare.com/?to=/:account/notifications'),
  t('cfpaid', 'When you grow', 'Upgrade Cloudflare Workers to Paid (US$5 a month) when Overview → Capacity says so', 'https://dash.cloudflare.com/?to=/:account/workers/plans'),
];

/**
 * Every service the business uses, what it costs and when (Money & tax → Start-up and running costs).
 * Prices checked Nov 2026; update here when they change.
 */
export type CostKind = 'free' | 'once' | 'monthly' | 'yearly' | 'per-sale' | 'optional';
export const COST_GUIDE: { group: 'Start-up' | 'Every month' | 'Only when you grow' | 'Optional'; what: string; does: string; cost: string; kind: CostKind }[] = [
  { group: 'Start-up', what: 'ABN', does: 'Needed for the business name, the .com.au domain and Stripe', cost: 'Free', kind: 'free' },
  { group: 'Start-up', what: 'Business name (ASIC)', does: 'Registers "The Yes List"', cost: 'About $45 a year', kind: 'yearly' },
  { group: 'Start-up', what: 'Domain', does: 'The site’s own address and email domain', cost: 'About $15 to $25 a year', kind: 'yearly' },
  { group: 'Start-up', what: 'Bitwarden', does: 'Keeps every account’s password safely (not on the website)', cost: 'Free', kind: 'free' },
  { group: 'Every month', what: 'Cloudflare Workers Paid', does: 'Hosting, database and the 15-minute texting timer. Needed once more than a handful of weddings are active', cost: 'US$5 (about A$8) a month', kind: 'monthly' },
  { group: 'Every month', what: 'Cloudflare AI (Workers AI)', does: 'The planning assistant, help voice, reading quotes, and the business bots', cost: 'Free daily allowance', kind: 'free' },
  { group: 'Every month', what: 'GitHub', does: 'Keeps the code; tests and deploys every change', cost: 'Free', kind: 'free' },
  { group: 'Every month', what: 'Resend', does: 'Sign-in, payment and guest emails', cost: 'Free up to 3,000 emails a month', kind: 'free' },
  { group: 'Every month', what: 'Google, Dropbox and Microsoft keys', does: 'Couples link their own storage; their photos and backups go there', cost: 'Free (couples use their own storage)', kind: 'free' },
  { group: 'Every month', what: 'Stripe', does: 'Card payments from couples', cost: 'No monthly fee; about 1.7% + 30c a sale', kind: 'per-sale' },
  { group: 'Every month', what: 'Mobile Message (texts)', does: 'Texts sent for couples', cost: 'Paid by couples’ text credits (8c each, about 3c kept)', kind: 'per-sale' },
  { group: 'Only when you grow', what: 'Cloudflare Queues', does: 'Lets the timer run each wedding on its own (past about 160 active weddings)', cost: 'Included with Workers Paid (1 million a month)', kind: 'free' },
  { group: 'Only when you grow', what: 'Resend Pro', does: 'More than 3,000 emails a month', cost: 'US$20 a month', kind: 'monthly' },
  { group: 'Optional', what: 'Grok (xAI API)', does: 'A stronger AI for the business bots. Without it, the bots use the free Cloudflare AI', cost: 'About A$10 to $18 a month, pay as you go', kind: 'optional' },
  { group: 'Optional', what: 'Claude', does: 'Building and improving the site', cost: 'Your Claude plan, only while building', kind: 'optional' },
  { group: 'Optional', what: 'Facebook and Instagram ads', does: 'The launch test', cost: 'Your choice (the $10 a day test is about $300 a month)', kind: 'optional' },
];

/**
 * The company's accounts (Settings → Accounts, owners only): which exist, the login email, whether 2-step
 * sign-in is on, and where the password is kept. Never the passwords themselves: those stay in a password
 * manager, so a break-in at the site can't reach Stripe, Google or Cloudflare.
 */
export const ACCOUNT_STATUS = ['todo', 'started', 'done', 'problem'] as const;
export const CompanyAccount = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,30}$/),
  name: z.string().trim().min(1).max(60),
  link: z.string().trim().max(300).default(''),
  login: z.string().trim().max(120).default(''),
  kept: z.string().trim().max(60).default('Bitwarden'),
  twoStep: z.boolean().default(false),
  status: z.enum(ACCOUNT_STATUS).default('todo'),
  note: z.string().trim().max(300).default(''),
});
export type CompanyAccount = z.infer<typeof CompanyAccount>;
export const CompanyAccounts = z.object({ list: z.array(CompanyAccount).max(60).default([]), seeded: z.boolean().default(false) });
const acct = (id: string, name: string, link: string, note = ''): CompanyAccount => ({ id, name, link, login: '', kept: 'Bitwarden', twoStep: false, status: 'todo', note });
export const STARTER_ACCOUNTS: CompanyAccount[] = [
  acct('bitwarden', 'Bitwarden (passwords)', 'https://vault.bitwarden.com', 'Its master password is the one to write down and keep somewhere safe offline'),
  acct('google', 'Google (business account)', 'https://myaccount.google.com'),
  acct('cloudflare', 'Cloudflare', 'https://dash.cloudflare.com', 'Hosting, database, domain'),
  acct('github', 'GitHub', 'https://github.com/settings/security', 'The code and deploys'),
  acct('stripe', 'Stripe', 'https://dashboard.stripe.com'),
  acct('resend', 'Resend', 'https://resend.com'),
  acct('mobilemessage', 'Mobile Message', 'https://mobilemessage.com.au'),
  acct('dropbox', 'Dropbox developer', 'https://www.dropbox.com/developers/apps'),
  acct('microsoft', 'Microsoft (OneDrive app)', 'https://entra.microsoft.com'),
  acct('xai', 'xAI (Grok, optional)', 'https://console.x.ai'),
  acct('asic', 'ASIC Connect (business name)', 'https://connectonline.asic.gov.au'),
  acct('ato', 'ATO / myGov (ABN, GST, BAS)', 'https://my.gov.au'),
  acct('bank', 'Business bank', ''),
  acct('meta', 'Meta Business Suite (Facebook, Instagram)', 'https://business.facebook.com'),
  acct('tiktok', 'TikTok', 'https://www.tiktok.com'),
  acct('pinterest', 'Pinterest', 'https://www.pinterest.com.au'),
  acct('claude', 'Claude', 'https://claude.ai'),
];
/** Looks like a password was typed into a note: refused, so none is ever stored here by mistake. */
export const looksLikeSecret = (s: string) => /pass(word)?\s*[:=]|\bpw\s*[:=]|sk_(live|test)_|whsec_|\bxai-[A-Za-z0-9]{16,}|\bghp_|\bre_[A-Za-z0-9]{16,}/i.test(s);

/** The saved list with any owner jobs it hasn't had yet added at the end (the first time: every job). */
export function todoList(saved: z.infer<typeof Todos>): { items: TodoItem[]; offered: string[] } {
  const base = saved.seeded ? saved.items : LAUNCH_TODOS;
  const have = new Set([...base.map((i) => i.id), ...saved.offered]);
  return { items: [...base, ...ADDED_TODOS.filter((i) => !have.has(i.id))], offered: ADDED_TODOS.map((i) => i.id) };
}

/**
 * Roles the owners make themselves (Team → Roles): a name and exactly which parts of the portal it reaches.
 * Stored as 'custom:<id>' on a person or bot. Only owners manage the team, so a made role never includes it.
 */
export const CustomRole = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,30}$/),
  name: z.string().trim().min(1).max(40),
  does: z.string().trim().max(200).default(''),
  perms: z.array(z.enum(STAFF_PERMS)).max(STAFF_PERMS.length).default([]),
  /** Things within its parts this role can't do (see STAFF_ABILITIES). */
  deny: z.array(z.enum(STAFF_ABILITY_KEYS as [StaffAbility, ...StaffAbility[]])).max(20).default([]),
});
export type CustomRole = z.infer<typeof CustomRole>;
export const CustomRoles = z.object({ roles: z.array(CustomRole).max(20).default([]) });
export const isBuiltInRole = (role: string): role is StaffRole => (STAFF_ROLES as readonly string[]).includes(role);

/** What a role reaches: a built-in role's set, or a made role's (never the team). */
export function staffPermsOf(role: string | null | undefined, custom: readonly CustomRole[]): StaffAccess[] {
  if (!role) return [];
  if (isBuiltInRole(role)) return withAbilities(STAFF_CAN[role]);
  const made = role.startsWith('custom:') ? custom.find((r) => `custom:${r.id}` === role) : undefined;
  return made ? withAbilities(made.perms.filter((p) => p !== 'team'), made.deny ?? []) : [];
}
/** A role's name for people: "Manager", or a made role's own name. */
export function roleName(role: string | null | undefined, custom: readonly CustomRole[]): string {
  if (!role) return '';
  if (isBuiltInRole(role)) return STAFF_INFO[role].name;
  return custom.find((r) => `custom:${r.id}` === role)?.name ?? 'Removed role';
}
/** What each part of the portal is, for choosing a made role's reach. */
export const PERM_INFO: Record<StaffPerm, string> = {
  overview: 'Overview: the numbers and the to-do list',
  couples: 'Couples: find weddings, send payment links',
  money: 'Money: mark paid, change plans, money and tax',
  feedback: 'Feedback: read, assign, plan, reply',
  promote: 'Promote: codes, banner, campaign links, marketing list',
  vendors: 'Vendors: the directory, hide or show',
  settings: 'Settings: payment links, social links, guest pages',
  team: 'Team: people, bots and roles (owners only)',
  activity: 'Activity: who did what',
};

/** Each person's or bot's weekly target (Team → Targets): paying weddings to help win, and the work that gets there. */
export const PersonTarget = z.object({
  userId: z.string().max(40),
  /** Paying weddings a week this person or bot is answerable for (sales: from their outreach and partners). */
  weddings: z.number().int().min(0).max(1000).default(0),
  /** The work a week: e.g. 100 partner emails, 4 posts, every plan request answered within 4 hours. */
  work: z.string().trim().max(200).default(''),
});
export const PersonTargets = z.object({ people: z.array(PersonTarget).max(100).default([]) });

/** A vendor's partner code for their couples: their name, then the discount ("BLOOMCO10"). */
export function vendorCode(name: string, percent = 10): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'VENDOR';
  return `${base}${percent}`.slice(0, 24);
}
/** A vendor we'd like in the directory (Company portal → Vendors → Invite vendors). */
export const VendorProspect = z.object({
  id: z.string().max(40),
  business: z.string().trim().min(1).max(120),
  contact: z.string().trim().max(80).default(''),
  email: z.string().trim().toLowerCase().email().max(200),
  category: z.string().trim().max(60).default(''),
  region: z.string().trim().max(80).default(''),
  website: z.string().trim().max(200).default(''),
  status: z.enum(['new', 'invited', 'joined', 'stopped']).default('new'),
  invitedAt: z.string().max(40).default(''),
  note: z.string().trim().max(300).default(''),
});
export type VendorProspect = z.infer<typeof VendorProspect>;
export const VendorProspects = z.object({ list: z.array(VendorProspect).max(3000).default([]) });

/**
 * A thank-you for a couple's first feedback: free text credits, given for any honest feedback (good or bad)
 * sent privately to us, never for a review or a rating. At least FEEDBACK_REWARD_MIN characters; once per wedding.
 */
export const FEEDBACK_REWARD_CREDITS = 100;
export const FEEDBACK_REWARD_MIN = 20;

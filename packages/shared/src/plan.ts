/**
 * One plan (launch, 26 Nov 2026): The Yes List, paid once (PLAN_PRICE_CENTS). Everything is in it: no tiers,
 * no feature behind a plan, no guest cap, two events. A new sign-up sets everything up first; its invitations
 * go live once it's paid. Text messages are the only extra, bought as credits at cost (TEXT_RATE).
 *
 * Stored values stay as they were so older rows keep working: 'free' = not paid yet (new sign-ups); 'basic',
 * 'essentials', 'complete' = paid (any of the old plans, now all the same); 'trial' = founders' weddings and
 * the platform's own (everything, never charged). Which tools show is the couple's choice (tools.ts), not
 * the plan's.
 */
export type Plan = 'free' | 'essentials' | 'complete';
export type Feature = 'unlimitedGuests' | 'texts' | 'seating' | 'planner' | 'photoQr' | 'partySignIns' | 'dailyBackups' | 'extraEvent';

/** The plan a stored value means: 'free' until it's paid; every paid plan (old ones too) has everything. */
export const planOf = (stored: string | null | undefined): Plan => (stored === 'free' ? 'free' : 'complete');
/** Paid for: anything but a sign-up that hasn't paid for a plan yet. Until then its invitations aren't live. */
export const isPaid = (stored: string | null | undefined) => stored !== 'free';

const NEEDS: Record<Feature, Plan> = {
  unlimitedGuests: 'essentials',
  texts: 'essentials',
  seating: 'essentials',
  planner: 'essentials',
  photoQr: 'complete',
  partySignIns: 'complete',
  dailyBackups: 'complete',
  extraEvent: 'complete',
};

/** Nothing is behind a plan any more: every wedding can use every tool (sending invitations waits for payment). */
export function allows(plan: Plan, f: Feature): boolean {
  void plan;
  void f;
  return true;
}
/** The plan a feature needs. */
export const planFor = (f: Feature): Plan => NEEDS[f];
/** The old Basic guest limit (no longer applied: as many guests as you like). */
export const FREE_GUEST_LIMIT = 50;

/** The one plan's price, in cents (AUD), paid once: the only place it's set. */
export const PLAN_PRICE_CENTS = 8700;
/** The plan's name. */
export const PLAN_NAME = 'The Yes List';
/** The price as shown: "$87". */
export const PLAN_PRICE = `$${PLAN_PRICE_CENTS % 100 ? (PLAN_PRICE_CENTS / 100).toFixed(2) : PLAN_PRICE_CENTS / 100}`;

/** Every stored plan is the one plan now (kept by key so older code and rows keep working). */
export const PLAN_INFO: Record<Plan, { name: string; price: string }> = {
  free: { name: PLAN_NAME, price: PLAN_PRICE },
  essentials: { name: PLAN_NAME, price: PLAN_PRICE },
  complete: { name: PLAN_NAME, price: PLAN_PRICE },
};

/** The price in cents (AUD), for paying by card: the one plan, whichever key. */
export const PRICE_CENTS: Record<Plan, number> = { free: PLAN_PRICE_CENTS, essentials: PLAN_PRICE_CENTS, complete: PLAN_PRICE_CENTS };
export const EVENT_ADDON_CENTS = 3900;

/** What can be bought by card: a plan, or one more event. */
export type Purchase = 'basic' | 'essentials' | 'complete' | 'event';

/**
 * What buying `what` costs a wedding on `current`, in cents: the one plan, once. Null when it's already paid
 * (any of the old plans, or Basic if `basicPaid`): nobody is charged twice.
 */
export function chargeCents(current: Plan, what: Purchase, basicPaid = false): number | null {
  if (what === 'event') return EVENT_ADDON_CENTS;
  if (current !== 'free' || basicPaid) return null;
  return PLAN_PRICE_CENTS;
}

/** What each locked feature is, in a couple's words (for the Upgrade card). */
export const FEATURE_LABEL: Record<Feature, string> = {
  unlimitedGuests: 'More than 50 guests',
  texts: 'Invitations and reminders by text',
  seating: 'The seating plan',
  planner: 'The wedding planner (budget, payments, checklist, vendors and quotes)',
  photoQr: 'Guests’ photos by QR code on each table',
  partySignIns: 'Wedding party sign-ins',
  dailyBackups: 'Daily backups to your own Google Drive or Dropbox',
  extraEvent: 'Another event (welcome drinks, a recovery brunch…)',
};

/** Events the plan includes (the wedding and one more, like welcome drinks); more are an add-on each (EVENT_ADDON). */
export const EVENTS_INCLUDED: Record<Plan, number> = { free: 2, essentials: 2, complete: 2 };
export const EVENT_ADDON = { name: 'Extra event', price: '$39' };

/**
 * Text messages are paid for by the couple, on top of the plan: they buy exactly the text credits they need,
 * by card (one credit per text of up to 160 characters; 161 to 306 characters use 2, and so on). Nothing to
 * sign up to, no keys. Credits never expire. The Yes List never pays for a couple's texts: with no credits,
 * nothing is texted automatically.
 *
 * The rate covers what the site pays Mobile Message plus card fees. Their prices (mobilemessage.com.au/pricing,
 * checked 8 Nov 2026, ex GST): 4c a credit for 500+, 3.5c for 1,000+, 3c for 10,000+ (1.6c only on an
 * account's first purchase). So 4.4c incl. GST at worst, plus Stripe's 1.75% + 30c. Re-check before changing.
 */
export const TEXT_RATE = {
  /** What a couple pays per credit, in cents incl. GST. */
  centsPerCredit: 8,
  /**
   * A service fee on every text purchase, in percent. Australian law: it is part of the price, never a card
   * surcharge (surcharges on Visa, Mastercard and eftpos are banned from 1 Oct 2026), so it's the same
   * however the couple pays; and the one total, fee included, is what's shown first everywhere (no drip
   * pricing). Set 9 Nov 2026: 8c a credit all-in, no separate fee (about 4.4c goes to the texting service, about 3c is ours after card fees).
   */
  serviceFeePct: 0,
  /** The smallest top-up, in cents (A$5): a config value, as the rate is. */
  minTopUpCents: 500,
  /** The fewest credits in one purchase: enough to reach the A$5 minimum at the rate (63 at 8c = $5.04). */
  minCredits: 63,
  maxCredits: 20_000,
  /**
   * Credits a guest's mobile needs if every starter text goes to them (texts go to one mobile per
   * invitation): save the date 2, invitation 2, RSVP reminder 2, last call 2, RSVP thank-you 2, night
   * before 2 and the thank-you after 1 = 13. Each with their personal link runs past 160 characters, so it
   * is 2 credits. A guest who replies early skips the reminders, so this is the most it takes, not less.
   */
  sendCreditsPerGuest: 13,
  /**
   * The back-and-forth, on average per mobile: a guest who texts the number back gets an automatic answer
   * with their link (2 credits); about half send something more, which is forwarded to the couple's phone
   * (1 to 2) and answered from Messages (1). About 4 in all. An allowance, not a count: chatty guests use more.
   */
  replyCreditsPerGuest: 4,
  /** Both together: what to budget per guest's mobile (13 + 4). Used before the guest list is in. */
  creditsPerGuest: 17,
} as const;

/** Credits to buy for this many guests (with a mobile), rounded up to the next 10. */
export function textCreditsForGuests(guests: number): number {
  const n = Math.max(0, Math.round(guests)) * TEXT_RATE.creditsPerGuest;
  return Math.min(TEXT_RATE.maxCredits, Math.max(TEXT_RATE.minCredits, Math.ceil(n / 10) * 10));
}
/** What `credits` cost before the service fee, in cents, all-in. */
export const textCreditsSubtotal = (credits: number) => Math.round(credits) * TEXT_RATE.centsPerCredit;
/** The service fee on that, in cents (rounded up to the cent). */
export const textServiceFee = (credits: number) => Math.ceil((textCreditsSubtotal(credits) * TEXT_RATE.serviceFeePct) / 100);
/** What `credits` cost in all, the service fee included, in cents, all-in. */
export const textCreditsCents = (credits: number) => textCreditsSubtotal(credits) + textServiceFee(credits);

/** The all-in price of one credit, in cents (5.1): what's shown first, the service fee included. */
export const TEXT_CREDIT_ALL_IN = (TEXT_RATE.centsPerCredit * (100 + TEXT_RATE.serviceFeePct)) / 100;

/**
 * How a price speaks of GST. Only a GST-registered business may say "GST included": until the registration
 * in the company portal (Money → GST registered, from its start date) is on, prices say none is charged.
 */
export const gstWords = (registered: boolean) => (registered ? 'GST included' : 'no GST charged');

/** The text notice after its first sentence (budgeting, couples sharing a mobile, the free ways to send). */
const TEXT_COST_REST =
  ' Budget about 17 credits (about $1.36) per guest’s mobile: up to 13 for every text we send (save the date, invitation, two reminders, RSVP thank-you, night before and thank-you after), plus about 4 for the back-and-forth (when a guest texts back we answer with their link, anything that needs you is forwarded to your phone, and your answers from Messages are texts too). A couple on one invitation share one mobile, so they cost the same as one guest: tell us how many guests and we show the total before you pay. Sending invitations and reminders from your own phone or by email is always free.';
/** The notice shown wherever prices are: the sales page, the pricing table, Terms, Help and Texting. */
export const textCostNote = (registered: boolean) =>
  `Text messages (SMS) are not included in the plan. If you choose to send texts, you buy text credits separately at cost: 8c a credit, all-in (${gstWords(registered)}, no other fees).` +
  TEXT_COST_REST;

/** The notice before GST registration: the default everywhere until the company portal says otherwise. */
export const TEXT_COST_NOTE = textCostNote(false);

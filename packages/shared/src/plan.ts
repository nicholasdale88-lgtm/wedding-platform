/**
 * Plans: what each wedding can use. New sign-ups start on Free; paying moves them to Essentials or
 * Deluxe (stored as 'complete'). Weddings made before plans existed (stored as 'trial') and the platform's own wedding have
 * everything. The server enforces this; the admin shows an Upgrade card where a feature is locked.
 */
export type Plan = 'free' | 'essentials' | 'complete';
export type Feature = 'unlimitedGuests' | 'texts' | 'seating' | 'planner' | 'photoQr' | 'partySignIns' | 'dailyBackups' | 'extraEvent';

/** The plan a stored value means: anything that isn't free or essentials has everything. */
export const planOf = (stored: string | null | undefined): Plan => (stored === 'free' ? 'free' : stored === 'essentials' ? 'essentials' : 'complete');

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
const RANK: Record<Plan, number> = { free: 0, essentials: 1, complete: 2 };

export const allows = (plan: Plan, f: Feature) => RANK[plan] >= RANK[NEEDS[f]];
/** The plan a feature needs. */
export const planFor = (f: Feature): Plan => NEEDS[f];
/** Free weddings: up to this many guests (people, not invitations). */
export const FREE_GUEST_LIMIT = 50;

export const PLAN_INFO: Record<Plan, { name: string; price: string }> = {
  free: { name: 'Free', price: '$0' },
  essentials: { name: 'Essentials', price: '$88' },
  // Stored as 'complete'; called Deluxe.
  complete: { name: 'Deluxe', price: '$98' },
};

/** The same prices in cents (AUD), for paying by card. Keep these in step with PLAN_INFO and EVENT_ADDON. */
export const PRICE_CENTS: Record<Plan, number> = { free: 0, essentials: 8800, complete: 9800 };
export const EVENT_ADDON_CENTS = 3900;

/** What can be bought by card: a plan, or one more event. */
export type Purchase = 'essentials' | 'complete' | 'event';

/**
 * What buying `what` costs a wedding on `current`, in cents. Moving from Essentials to Deluxe is only the
 * difference (they've paid for Essentials already). Null when there's nothing to buy: that plan or better.
 */
export function chargeCents(current: Plan, what: Purchase): number | null {
  if (what === 'event') return EVENT_ADDON_CENTS;
  if (RANK[current] >= RANK[what]) return null;
  return PRICE_CENTS[what] - PRICE_CENTS[current];
}

/** What each locked feature is, in a couple's words (for the Upgrade card). */
export const FEATURE_LABEL: Record<Feature, string> = {
  unlimitedGuests: 'More than 50 guests',
  texts: 'Invitations and reminders by text',
  seating: 'The seating plan',
  planner: 'The wedding planner (budget, payments, checklist, vendors and quotes)',
  photoQr: 'Guests’ photos by QR code on each table',
  partySignIns: 'Wedding party sign-ins',
  dailyBackups: 'Daily backups to your own storage',
  extraEvent: 'Another event (welcome drinks, a recovery brunch…)',
};

/** Events each plan includes; more are an add-on each (EVENT_ADDON). */
export const EVENTS_INCLUDED: Record<Plan, number> = { free: 1, essentials: 1, complete: 2 };
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
  centsPerCredit: 5,
  /**
   * A service fee on every text purchase, in percent. Australian law: it is part of the price, never a card
   * surcharge (surcharges on Visa, Mastercard and eftpos are banned from 1 Oct 2026), so it's the same
   * however the couple pays; and the one total, fee included, is what's shown first everywhere (no drip
   * pricing): "5.1c a credit, all-in". The breakdown is shown beside it.
   */
  serviceFeePct: 2,
  minCredits: 100,
  maxCredits: 20_000,
  /**
   * Credits a guest usually needs: the invitation, a reminder or two for those yet to reply, the RSVP
   * thank-you, the night-before guide and the thank-you after (about 4 texts), most of them 2 credits long
   * because of the link. Used before the guest list is in; after that, the planned texts are counted exactly.
   */
  creditsPerGuest: 6,
} as const;

/** Credits to buy for this many guests (with a mobile), rounded up to the next 50. */
export function textCreditsForGuests(guests: number): number {
  const n = Math.max(0, Math.round(guests)) * TEXT_RATE.creditsPerGuest;
  return Math.min(TEXT_RATE.maxCredits, Math.max(TEXT_RATE.minCredits, Math.ceil(n / 50) * 50));
}
/** What `credits` cost before the service fee, in cents incl. GST. */
export const textCreditsSubtotal = (credits: number) => Math.round(credits) * TEXT_RATE.centsPerCredit;
/** The service fee on that, in cents (rounded up to the cent). */
export const textServiceFee = (credits: number) => Math.ceil((textCreditsSubtotal(credits) * TEXT_RATE.serviceFeePct) / 100);
/** What `credits` cost in all, the service fee included, in cents incl. GST. */
export const textCreditsCents = (credits: number) => textCreditsSubtotal(credits) + textServiceFee(credits);

/** The all-in price of one credit, in cents (5.1): what's shown first, the service fee and GST included. */
export const TEXT_CREDIT_ALL_IN = (TEXT_RATE.centsPerCredit * (100 + TEXT_RATE.serviceFeePct)) / 100;

/** The notice shown wherever prices are: the sales page, the pricing table, Terms, Help and Texting. */
export const TEXT_COST_NOTE =
  'Text messages (SMS) are not included in any plan. If you choose to send texts, you buy text credits separately at 5.1c a credit, all-in (5c a credit plus a 2% service fee, GST included; the fee is the same however you pay). It’s about 6 credits a guest for the invitation, reminders and thank-yous: tell us how many guests and we show the total before you pay. Sending invitations and reminders from your own phone or by email is always free.';

/**
 * Plans: what each wedding can use. There is no free version: Basic ($50), Essentials and Deluxe, each paid
 * once. A new sign-up can set everything up first; its invitations go live once a plan is paid. Stored
 * values: 'free' = Basic, not paid yet (new sign-ups); 'basic' = Basic, paid; 'essentials'; 'complete'
 * (called Deluxe). Weddings made before plans existed ('trial') and the platform's own have everything. The
 * server enforces this; the admin shows an Upgrade card where a feature is locked.
 */
export type Plan = 'free' | 'essentials' | 'complete';
export type Feature = 'unlimitedGuests' | 'texts' | 'seating' | 'planner' | 'photoQr' | 'partySignIns' | 'dailyBackups' | 'extraEvent';

/** The plan a stored value means: anything that isn't free or essentials has everything. */
export const planOf = (stored: string | null | undefined): Plan => (stored === 'free' || stored === 'basic' ? 'free' : stored === 'essentials' ? 'essentials' : 'complete');
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
const RANK: Record<Plan, number> = { free: 0, essentials: 1, complete: 2 };

export const allows = (plan: Plan, f: Feature) => RANK[plan] >= RANK[NEEDS[f]];
/** The plan a feature needs. */
export const planFor = (f: Feature): Plan => NEEDS[f];
/** Basic weddings: up to this many guests (people, not invitations). */
export const FREE_GUEST_LIMIT = 50;

export const PLAN_INFO: Record<Plan, { name: string; price: string }> = {
  // Stored as 'free' (not paid yet) or 'basic' (paid); the key stays 'free'.
  free: { name: 'Basic', price: '$50' },
  essentials: { name: 'Essentials', price: '$88' },
  // Stored as 'complete'; called Deluxe.
  complete: { name: 'Deluxe', price: '$98' },
};

/** The same prices in cents (AUD), for paying by card. Keep these in step with PLAN_INFO and EVENT_ADDON. */
export const PRICE_CENTS: Record<Plan, number> = { free: 5000, essentials: 8800, complete: 9800 };
export const EVENT_ADDON_CENTS = 3900;

/** What can be bought by card: a plan, or one more event. */
export type Purchase = 'basic' | 'essentials' | 'complete' | 'event';

/**
 * What buying `what` costs a wedding on `current`, in cents. Moving up is only the difference from what's
 * been paid (Basic, if `basicPaid`, or Essentials). Null when there's nothing to buy: that plan or better.
 */
export function chargeCents(current: Plan, what: Purchase, basicPaid = false): number | null {
  if (what === 'event') return EVENT_ADDON_CENTS;
  const target: Plan = what === 'basic' ? 'free' : what;
  const paid = current !== 'free' || basicPaid;
  if (paid && RANK[current] >= RANK[target]) return null;
  return PRICE_CENTS[target] - (current === 'free' ? (basicPaid ? PRICE_CENTS.free : 0) : PRICE_CENTS[current]);
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
  centsPerCredit: 8,
  /**
   * A service fee on every text purchase, in percent. Australian law: it is part of the price, never a card
   * surcharge (surcharges on Visa, Mastercard and eftpos are banned from 1 Oct 2026), so it's the same
   * however the couple pays; and the one total, fee included, is what's shown first everywhere (no drip
   * pricing). Set 9 Nov 2026: 8c a credit all-in, no separate fee (about 4.4c goes to the texting service, about 3c is ours after card fees).
   */
  serviceFeePct: 0,
  minCredits: 100,
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
  'Text messages (SMS) are not included in any plan. If you choose to send texts, you buy text credits separately at 8c a credit, all-in (GST included, no other fees). Budget about 17 credits (about $1.36) per guest’s mobile: up to 13 for every text we send (save the date, invitation, two reminders, RSVP thank-you, night before and thank-you after), plus about 4 for the back-and-forth (when a guest texts back we answer with their link, anything that needs you is forwarded to your phone, and your answers from Messages are texts too). A couple on one invitation share one mobile, so they cost the same as one guest: tell us how many guests and we show the total before you pay. Sending invitations and reminders from your own phone or by email is always free.';

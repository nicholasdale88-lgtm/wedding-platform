/**
 * Plans: what each wedding can use. New sign-ups start on Free; paying moves them to Essentials or
 * Complete. Weddings made before plans existed (stored as 'trial') and the platform's own wedding have
 * everything. The server enforces this; the admin shows an Upgrade card where a feature is locked.
 */
export type Plan = 'free' | 'essentials' | 'complete';
export type Feature = 'unlimitedGuests' | 'texts' | 'seating' | 'planner' | 'photoQr' | 'partySignIns' | 'dailyBackups';

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
};
const RANK: Record<Plan, number> = { free: 0, essentials: 1, complete: 2 };

export const allows = (plan: Plan, f: Feature) => RANK[plan] >= RANK[NEEDS[f]];
/** The plan a feature needs. */
export const planFor = (f: Feature): Plan => NEEDS[f];
/** Free weddings: up to this many guests (people, not invitations). */
export const FREE_GUEST_LIMIT = 50;

export const PLAN_INFO: Record<Plan, { name: string; price: string }> = {
  free: { name: 'Free', price: '$0' },
  essentials: { name: 'Essentials', price: '$149' },
  complete: { name: 'Complete', price: '$249' },
};

/** What each locked feature is, in a couple's words (for the Upgrade card). */
export const FEATURE_LABEL: Record<Feature, string> = {
  unlimitedGuests: 'More than 50 guests',
  texts: 'Invitations and reminders by text',
  seating: 'The seating plan',
  planner: 'The wedding planner (budget, payments, checklist, vendors and quotes)',
  photoQr: 'Guests’ photos by QR code on each table',
  partySignIns: 'Wedding party sign-ins',
  dailyBackups: 'Daily backups to your own storage',
};

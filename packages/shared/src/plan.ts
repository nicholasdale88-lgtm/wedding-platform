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
  essentials: { name: 'Essentials', price: '$28' },
  // Stored as 'complete'; called Deluxe.
  complete: { name: 'Deluxe', price: '$35' },
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
  extraEvent: 'Another event (welcome drinks, a recovery brunch…)',
};

/** Events each plan includes; more are an add-on each (EVENT_ADDON). */
export const EVENTS_INCLUDED: Record<Plan, number> = { free: 1, essentials: 1, complete: 2 };
export const EVENT_ADDON = { name: 'Extra event', price: '$39' };

import type { Audience, Campaign, Recipient } from './types';

const awaiting = (r: Recipient) => r.invited.some((k) => (r.rsvp[k]?.attending ?? null) === null);
const declinedAll = (r: Recipient) => r.invited.length > 0 && r.invited.every((k) => r.rsvp[k]?.attending === false);

/** Does this invitation match the audience rule? Pure; evaluated at send time. */
export function matches(a: Audience, r: Recipient, invitedBefore: Set<string>): boolean {
  if (a.invitedTo && !r.invited.includes(a.invitedTo)) return false;
  if (a.attending && !(r.invited.includes(a.attending) && r.rsvp[a.attending]?.attending === true)) return false;
  if (a.awaitingAny && !awaiting(r)) return false;
  if (a.declinedAll && !declinedAll(r)) return false;
  if (a.invitedBefore && !invitedBefore.has(r.id)) return false;
  if (a.answer) {
    const v = r.rsvp[a.answer.event]?.answers[a.answer.key];
    if (a.answer.in && !(v !== undefined && a.answer.in.includes(v))) return false;
    if (a.answer.notIn && v !== undefined && a.answer.notIn.includes(v)) return false;
  }
  return true;
}

/** Always required, whatever the campaign: a mobile, not opted out, not excluded. */
export const textable = (r: Recipient, c?: Pick<Campaign, 'excluded'>): boolean =>
  !!r.phone && !r.optOut && !(c?.excluded.includes(r.id) ?? false);

export function recipientsFor(c: Campaign, all: Recipient[], invitedBefore: Set<string>): Recipient[] {
  return all.filter((r) => textable(r, c) && matches(c.audience, r, invitedBefore));
}

import { isSerious, localParts } from '@wp/shared';
import type { AdminEvent, AdminGuest, AdminPerson, WeddingData } from './data';

/**
 * Overview and "Needs you", computed on the server so it is always right (docs/04).
 * Wording follows design/RSVP Admin.dc.html; nothing couple-specific is written here.
 */

export interface NeedsYou {
  kind: string;
  title: string;
  detail: string;
  cta: string;
  /** Admin route to open, relative to /admin/:wid/ (e.g. "guests?filter=awaiting"). */
  link: string;
  /** The section it opens in: "all" (Account) or an event key. */
  event: string;
}

export interface Overview {
  total: number;
  replied: number;
  awaiting: number;
  yesInv: number;
  noInv: number;
  seatsHeld: number;
  events: { key: string; name: string; startsAt: string; venue: string; coming: number }[];
  diet: { people: number; serious: number; mealsSet: number };
  daysToGo: number | null;
  needsYou: NeedsYou[];
  nextUp: { campaignId: string; name: string; sendAt: string }[];
  latest: { id: string; name: string; at: string; summary: string; message: string }[];
  nav: { guests: number; dietary: number; autopilot: number; smsLive: boolean; messages?: number };
  /** The event this overview is about (null: all of them). */
  focus: string | null;
  /** Every event side by side (the "Both events" overview). */
  perEvent: { key: string; name: string; startsAt: string; invited: number; yes: number; no: number; awaiting: number; coming: number; diet: number; seated: number; hasSeating: boolean; catered: boolean }[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const isAwaiting = (g: AdminGuest) => g.invited.some((k) => (g.rsvp[k]?.attending ?? null) === null);
export const attendingAny = (g: AdminGuest) => g.invited.some((k) => g.rsvp[k]?.attending === true);
export const attends = (g: AdminGuest, key: string) => g.invited.includes(key) && g.rsvp[key]?.attending === true;
/** People coming to an event: the first N on the invitation, N = their reply count. */
export const comingPeople = (g: AdminGuest, key: string): AdminPerson[] =>
  attends(g, key) ? g.people.slice(0, Math.max(1, g.rsvp[key]?.count ?? 1)) : [];
/** Given a menu, or courses written for them, at this event. */
const hasMeal = (p: AdminPerson, key: string) => {
  const c = p.meals[key];
  return !!c && !!(c.menu || c.entree.trim() || c.main.trim() || c.dessert.trim());
};
/** "The wedding" -> "wedding", "Alex's 30th" -> "Alex's 30th" (for "N wedding guests not seated"). */
const shortName = (e: AdminEvent) => e.name.replace(/^the\s+/i, '').replace(/^\w/, (c) => c.toLowerCase());

/**
 * With an event key, everything is about that one event (the admin's event switcher): only guests
 * invited to it, their replies to it, its dietary list and seating, and the days until it.
 */
/** Calendar days from today to the day, in the wedding's own timezone (9am today, 10am tomorrow = 1). */
function daysBetween(now: Date, day: Date, tz: string): number {
  if (Number.isNaN(day.getTime())) return 0;
  const a = localParts(now, tz);
  const b = localParts(day, tz);
  return Math.max(0, Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000));
}

export function buildOverview(d: WeddingData, now: Date, focusKey?: string): Overview {
  const focus = d.events.find((e) => e.key === focusKey) ?? null;
  const G = focus ? d.guests.filter((g) => g.invited.includes(focus.key)) : d.guests;
  const tz = d.wedding.timezone;
  const awaitingG = G.filter(focus ? (g: AdminGuest) => (g.rsvp[focus.key]?.attending ?? null) === null : isAwaiting);
  const yesInv = G.filter(focus ? (g: AdminGuest) => attends(g, focus.key) : attendingAny).length;
  const replied = G.length - awaitingG.length;
  const first = focus ?? d.events[0];
  const seatedEvent = focus ?? d.events.find((e) => e.hasSeating) ?? first;
  const cateredEvent = focus ? (focus.catered ? focus : undefined) : (d.events.find((e) => e.catered) ?? first);

  // Dietary: people coming to the catered (first) event who have a requirement.
  const cateredPeople = cateredEvent ? G.flatMap((g) => comingPeople(g, cateredEvent.key)) : [];
  const dietPeople = cateredPeople.filter((p) => p.diet.trim());
  const mealsSet = cateredEvent ? dietPeople.filter((p) => hasMeal(p, cateredEvent.key)).length : 0;

  const day = (iso: string) => {
    const p = localParts(new Date(iso), tz);
    return `${p.day} ${MONTHS[p.month - 1]}`;
  };

  // Messages that belong here: with an event in focus, its own plus those to every event (not the other event's).
  const campaigns = focus ? d.campaigns.filter((c) => [focus.key, null].includes(audienceEvent(c.audience))) : d.campaigns;
  const campaignIds = new Set(campaigns.map((c) => c.id));
  /** Where a link opens: the focused event, else the first event (guest lists, texts and seating live in events). */
  const home = focus?.key ?? d.events[0]?.key ?? 'all';

  const needsYou: NeedsYou[] = [];
  const add = (cond: unknown, item: NeedsYou) => {
    if (cond) needsYou.push(item);
  };

  add(!d.wedding.sender, {
    kind: 'sms-setup', title: 'Texts are not set up yet', detail: 'Add your SMS number under Account so texts really send.', cta: 'Set up', link: 'texts', event: 'all',
  });
  add(d.inboxNeedsYou, {
    kind: 'inbox', title: d.inboxNeedsYou === 1 ? '1 message needs you' : `${d.inboxNeedsYou} messages need you`,
    detail: 'Guests wrote to you, texted a question or posted on the message board.', cta: 'Read', link: 'messages', event: 'all',
  });

  // Upcoming reminder dates: dated, enabled campaigns aimed at guests still to reply.
  const reminderIds = new Set(campaigns.filter((c) => c.enabled && c.mode === 'dates' && /"awaitingAny":true/.test(c.audience)).map((c) => c.id));
  const reminderDates = d.slots
    .filter((s) => reminderIds.has(s.campaignId) && s.status === 'pending' && s.sendAt > now.toISOString())
    .map((s) => s.sendAt)
    .sort();
  add(awaitingG.length, {
    kind: 'awaiting', title: `${plural(awaitingG.length, 'invitation', 'invitations')} still to reply`,
    detail: reminderDates.length
      ? `Reminders go out by themselves on ${listJoin(reminderDates.map(day))}.`
      : 'No reminder texts are scheduled.',
    cta: 'See who', link: focus ? 'guests?filter=awaiting' : 'guests?show=all&filter=awaiting', event: home,
  });

  const noPhone = G.filter((g) => !g.phone).length;
  add(noPhone, {
    kind: 'no-mobile', title: `${noPhone} ${noPhone === 1 ? 'invitation has' : 'invitations have'} no mobile`,
    detail: 'They will not get texts. Add a number or send their link another way.', cta: 'Fix', link: focus ? 'guests?mob=none' : 'guests?show=all&mob=none', event: home,
  });

  const byPhone = new Map<string, string[]>();
  for (const g of G) if (g.phone) byPhone.set(g.phone, [...(byPhone.get(g.phone) ?? []), g.people[0]?.name ?? '']);
  const shared = [...byPhone.values()].filter((names) => names.length > 1);
  add(shared.length, {
    kind: 'shared-mobile', title: `${shared.length} shared ${shared.length === 1 ? 'mobile' : 'mobiles'}`,
    detail: `${shared.slice(0, 2).map((n) => n.join(' & ')).join(', ')}. They would get the same texts twice.`, cta: 'Check', link: 'guests?show=all', event: home,
  });

  if (seatedEvent?.hasSeating) {
    const unseated = G.flatMap((g) => comingPeople(g, seatedEvent.key)).filter((p) => !p.tables[seatedEvent.key]).length;
    add(unseated, {
      kind: 'unseated', title: `${unseated} ${shortName(seatedEvent)} guests not seated`,
      detail: 'Everyone sees their table and tablemates on the night-before guide.', cta: 'Seat', link: 'seating', event: seatedEvent.key,
    });
  }

  const noMeal = dietPeople.length - mealsSet;
  add(noMeal, {
    kind: 'meals', title: `${noMeal} dietary ${noMeal === 1 ? 'meal' : 'meals'} not set`,
    detail: 'Tell each guest what the kitchen will serve them.', cta: 'Set meals', link: 'dietary', event: cateredEvent?.key ?? home,
  });

  const menu = (d.wedding.guide.menu as { a?: string; b?: string }[] | undefined) ?? [];
  add(menu.some((m) => /to be confirmed/i.test(`${m.a ?? ''} ${m.b ?? ''}`)), {
    kind: 'menu', title: 'Menu still to confirm', detail: 'The night-before guide shows "To be confirmed".', cta: 'Edit', link: `pages?page=guide:${home}`, event: home,
  });

  const failed = d.slots.filter((s) => (s.status === 'failed' || s.status === 'cancelled') && campaignIds.has(s.campaignId));
  add(failed.length, {
    kind: 'sms-failed', title: `${failed.length} scheduled ${failed.length === 1 ? 'text' : 'texts'} did not send`,
    detail: failed[0]?.lastError ?? 'Open Texts to see why.', cta: 'See texts', link: 'texts', event: home,
  });

  const nextUp = campaigns
    .filter((c) => c.enabled && c.mode === 'dates')
    .flatMap((c) => {
      const next = d.slots.filter((s) => s.campaignId === c.id && s.status === 'pending' && s.sendAt > now.toISOString()).map((s) => s.sendAt).sort()[0];
      return next ? [{ campaignId: c.id, name: c.name, sendAt: next }] : [];
    })
    .sort((a, b) => a.sendAt.localeCompare(b.sendAt))
    .slice(0, 5);

  const reply = (g: AdminGuest, k: string) => {
    const a = g.rsvp[k]?.attending;
    return a === true ? 'Attending' : a === false ? 'Declined' : 'Awaiting';
  };
  const latest = G.filter((g) => g.repliedAt)
    .sort((a, b) => b.repliedAt!.localeCompare(a.repliedAt!))
    .slice(0, 6)
    .map((g) => {
      const diet = g.people.map((p) => p.diet.trim()).filter(Boolean).join('; ');
      const parts = d.events.filter((e) => g.invited.includes(e.key)).map((e) => `${shortLabel(e)}: ${reply(g, e.key)}`);
      return {
        id: g.id, name: g.people[0]?.name ?? '', at: g.repliedAt!, summary: [...parts, diet].filter(Boolean).join(' · '),
        message: Object.values(g.rsvp).map((r) => r.message).find((m) => m.trim()) ?? '',
      };
    });

  return {
    total: G.length,
    replied,
    awaiting: awaitingG.length,
    yesInv,
    noInv: replied - yesInv,
    seatsHeld: G.reduce((n, g) => n + g.seatsHeld, 0),
    events: d.events.map((e) => ({
      key: e.key, name: e.name, startsAt: e.startsAt, venue: e.venue,
      coming: G.reduce((n, g) => n + (attends(g, e.key) ? Math.max(1, g.rsvp[e.key]?.count ?? 1) : 0), 0),
    })),
    diet: { people: dietPeople.length, serious: dietPeople.filter((p) => isSerious(p.diet)).length, mealsSet },
    daysToGo: first ? daysBetween(now, new Date(first.startsAt), d.wedding.timezone) : null,
    needsYou,
    nextUp,
    latest,
    focus: focus?.key ?? null,
    perEvent: d.events.map((e) => {
      const inv = d.guests.filter((g) => g.invited.includes(e.key));
      const people = inv.flatMap((g) => comingPeople(g, e.key));
      return {
        key: e.key, name: e.name, startsAt: e.startsAt, hasSeating: e.hasSeating, catered: e.catered,
        invited: inv.length,
        yes: inv.filter((g) => g.rsvp[e.key]?.attending === true).length,
        no: inv.filter((g) => g.rsvp[e.key]?.attending === false).length,
        awaiting: inv.filter((g) => (g.rsvp[e.key]?.attending ?? null) === null).length,
        coming: people.length,
        diet: e.catered ? people.filter((p) => p.diet.trim()).length : 0,
        seated: people.filter((p) => p.tables[e.key]).length,
      };
    }),
    nav: {
      guests: d.guests.length,
      dietary: dietPeople.length,
      autopilot: d.campaigns.filter((c) => c.enabled && c.mode !== 'manual').length,
      smsLive: !!d.wedding.sender,
      messages: d.inboxNeedsYou, // unread messages from guests (Account → Messages)
    },
  };
}

/** "Wedding" for "The wedding"; other event names as written. */
export const shortLabel = (e: { name: string }) => {
  const n = e.name.replace(/^the\s+/i, '');
  return n.charAt(0).toUpperCase() + n.slice(1);
};

function listJoin(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** The event a message is aimed at (from its audience JSON), or null when it goes to guests of every event. */
export function audienceEvent(audience: string): string | null {
  try {
    const a = JSON.parse(audience) as { invitedTo?: unknown; attending?: unknown; answer?: { event?: unknown } };
    const e = a.invitedTo ?? a.attending ?? a.answer?.event;
    return typeof e === 'string' ? e : null;
  } catch {
    return null;
  }
}

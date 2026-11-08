import { clockMinutes, defaultInvitesFrom, inQuietHours, localParts, zonedToUtc, type GuideContent, type PartyItem } from '@wp/shared';
import { matches } from '../sms/audience';
import { renderFor } from '../sms/render';
import type { Campaign, EventInfo, Recipient, WeddingCtx } from '../sms/types';

/**
 * The D-Day rehearsal: the whole wedding run as a simulation on the couple's real guests, words and
 * settings, from the invitations going out to the morning after. For each moment it works out which
 * messages would go, what each kind of guest (said yes, said no, not replied) would get and see, what the
 * wedding party and the coordinator see, and what would break or embarrass on the day. Pure: it reads
 * the facts it's given, and nothing is sent or saved.
 */

export type StepKey = 'invites' | 'replies' | 'reminders' | 'rsvp' | 'seating' | 'night' | 'morning' | 'ceremony' | 'reception' | 'after';
export const STEP_LABELS: Record<StepKey, string> = {
  invites: 'Invitations go out',
  replies: 'Replies coming in',
  reminders: 'Reminders',
  rsvp: 'Replies close',
  seating: 'Final seating published',
  night: 'The night before',
  morning: 'The morning',
  ceremony: 'The ceremony',
  reception: 'The reception',
  after: 'The day after',
};
const ORDER = Object.keys(STEP_LABELS) as StepKey[];

export type Level = 'green' | 'amber' | 'red';
export type Area = 'texts' | 'replies' | 'seating' | 'night' | 'day' | 'photos' | 'party';
export const AREA_LABELS: Record<Area, string> = {
  texts: 'Invitations and texts',
  replies: 'Replies',
  seating: 'Seating',
  night: 'The night before',
  day: 'On the day',
  photos: 'Photos',
  party: 'Wedding party and coordinator',
};
/** Where a problem is fixed: an admin tab (in the first event's section when `event`), with a view after "?". */
export interface FixLink {
  tab: string;
  event?: boolean;
  query?: string;
}
export interface Check {
  key: string;
  area: Area;
  level: Exclude<Level, 'green'>;
  title: string;
  detail: string;
  fix: FixLink;
  /** The moment it would show (for the timeline). */
  step: StepKey;
}

export type Persona = 'yes' | 'no' | 'waiting';
export const PERSONA_LABELS: Record<Persona, string> = { yes: 'Said yes', no: 'Said no', waiting: 'Not replied' };
type How = 'text' | 'email' | 'phone' | 'text+email' | 'post' | 'none';
const HOW_WORDS: Record<How, string> = {
  text: 'by text',
  email: 'by email',
  phone: 'from your own phone',
  'text+email': 'by text and email',
  post: 'nothing (invited by post only)',
  none: 'nothing (no mobile or email)',
};

export interface RehearsalEvent {
  id: string;
  key: string;
  name: string;
  startsAt: string;
  venue: string;
  address: string;
  catered: boolean;
  guide: GuideContent | null;
  /** Tables drawn on its seating plan. */
  tables: number;
  /** The plan guests see (Seating → Publish): person id → table id, and the tables' names. */
  published: { seats: Record<string, string>; tables: { id: string; name: string }[] } | null;
}
export interface RehearsalPerson {
  id: string;
  invitationId: string;
  idx: number;
  name: string;
  diet: string;
}
export interface DatedCampaign extends Campaign {
  slots: { sendAt: string; status: string }[];
}
export interface RehearsalFacts {
  now: string;
  wedding: WeddingCtx;
  /** How messages go (Settings → Texting): a texting number, the couple's own phone, or email. */
  via: 'service' | 'phone' | 'email';
  dateToBeSet: boolean;
  events: RehearsalEvent[];
  eventInfo: EventInfo[];
  recipients: Recipient[];
  people: RehearsalPerson[];
  campaigns: DatedCampaign[];
  invitedBefore: Set<string>;
  party: { members: number; signIns: number; runsheet: PartyItem[] };
  coordinator: { on: boolean; name: string };
  /** Somewhere for guests' photos to go (the site's storage, or a linked Drive). */
  photos: boolean;
}

export interface MessageAtStep {
  campaignId: string;
  name: string;
  /** When it goes (null: as each guest is added or replies). */
  sendAt: string | null;
  enabled: boolean;
  sent: boolean;
  quiet: boolean;
  /** Who it would reach as things stand, by how. */
  reach: Partial<Record<How, number>>;
  /** What each kind of guest gets: the words (rendered from the real template), or why they get nothing. */
  gets: { persona: Persona; how: How | null; text: string | null; why: string }[];
}
export interface GuestView {
  persona: Persona;
  name: string;
  /** No real guest has replied this way yet: a guest from your list stands in, shown as if they had. */
  standIn: boolean;
  /** Their page at this moment: path under the site, opened as the couple's preview at this date. */
  page: { kind: 'invitation' | 'guide' | 'photos'; path: string };
  sees: string[];
}
export interface Step {
  key: StepKey;
  label: string;
  at: string;
  past: boolean;
  messages: MessageAtStep[];
  guests: GuestView[];
  party: string[];
  coordinator: string[];
  checks: string[];
}
export interface Rehearsal {
  now: string;
  asOf: string;
  current: StepKey;
  timezone: string;
  steps: Step[];
  /** Messages sent only by hand (the rain plan): never on the timeline. */
  manual: { campaignId: string; name: string }[];
  checks: Check[];
  areas: { area: Area; label: string; level: Level; count: number }[];
}

// ---------------------------------------------------------------- dates

const DAY = 86_400_000;
const ymd = (iso: string, tz: string) => {
  const p = localParts(new Date(iso), tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};
const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const atLocal = (day: string, hm: string, tz: string) => zonedToUtc(`${day}T${hm}`, tz).toISOString();
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
const isReminder = (c: Campaign) => !!c.audience.awaitingAny;
const isNightText = (c: Campaign) => /\{guide/.test(c.body);

/** When each moment falls, from the wedding's own dates (each one no earlier than the one before). */
export function stepTimes(f: RehearsalFacts): Record<StepKey, string> {
  const tz = f.wedding.timezone;
  const first = f.events[0];
  const start = first && !Number.isNaN(Date.parse(first.startsAt)) ? new Date(first.startsAt).toISOString() : plus(f.now, 180 * DAY);
  const day = ymd(start, tz);
  const invites = f.wedding.invitesFrom ?? defaultInvitesFrom(start);
  const rsvpClose = f.wedding.rsvpClose && /^\d{4}-\d{2}-\d{2}$/.test(f.wedding.rsvpClose) ? atLocal(f.wedding.rsvpClose, '17:00', tz) : plus(start, -42 * DAY);
  const pending = (c: DatedCampaign) => c.enabled && c.mode === 'dates';
  const firstReminder = f.campaigns
    .filter((c) => pending(c) && isReminder(c))
    .flatMap((c) => c.slots.map((s) => s.sendAt))
    .sort()[0];
  const nightSlot = f.campaigns
    .filter((c) => pending(c) && isNightText(c))
    .flatMap((c) => c.slots.map((s) => s.sendAt))
    .filter((at) => at < start && at > plus(start, -2 * DAY))
    .sort()[0];
  const replies = plus(invites, 3 * DAY);
  const t: Record<StepKey, string> = {
    invites,
    replies,
    reminders: firstReminder ?? new Date((Date.parse(replies) + Date.parse(rsvpClose)) / 2).toISOString(),
    rsvp: rsvpClose,
    seating: plus(rsvpClose, 7 * DAY),
    night: nightSlot ?? atLocal(shiftDay(day, -1), '17:00', tz),
    morning: atLocal(day, '08:00', tz),
    ceremony: start,
    reception: plus(start, 3 * 3_600_000),
    after: atLocal(shiftDay(day, 1), '11:00', tz),
  };
  // The night before stays the night before; anything earlier never comes after what follows it.
  if (t.seating > t.night) t.seating = plus(t.night, -DAY);
  if (t.morning > t.ceremony) t.morning = plus(t.ceremony, -3_600_000);
  let prev = '';
  for (const k of ORDER) {
    if (t[k] < prev) t[k] = prev;
    prev = t[k];
  }
  return t;
}

/** The moment a date falls in: the last step that has started by then (the first, before any). */
export function stepAt(times: Record<StepKey, string>, iso: string): StepKey {
  let found: StepKey = ORDER[0]!;
  for (const k of ORDER) if (times[k] <= iso) found = k;
  return found;
}

// ---------------------------------------------------------------- guests

const awaiting = (r: Recipient) => r.invited.some((k) => (r.rsvp[k]?.attending ?? null) === null);
const declinedAll = (r: Recipient) => r.invited.length > 0 && r.invited.every((k) => r.rsvp[k]?.attending === false);
const saidYes = (r: Recipient) => r.invited.some((k) => r.rsvp[k]?.attending === true);

/** How a guest hears from the couple. */
export function howOf(r: Recipient, f: Pick<RehearsalFacts, 'via'>): How {
  if (r.post) return 'post';
  const email = !!r.email;
  if (r.channel === 'email') return email ? 'email' : 'none';
  if (r.channel === 'phone') return r.phone ? 'phone' : 'none';
  if (r.channel === 'both') return r.phone ? 'text+email' : email ? 'email' : 'none';
  if (r.phone) return f.via === 'phone' ? 'phone' : f.via === 'email' ? (email ? 'email' : 'phone') : 'text';
  return email ? 'email' : 'none';
}

/** Their reply, as the step sees it: before replies come in, nobody has answered yet. */
function asAt(r: Recipient, persona: Persona, beforeReplies: boolean): Recipient {
  if (beforeReplies || persona === 'waiting') return { ...r, rsvp: persona === 'waiting' && !beforeReplies ? r.rsvp : {}, rsvpUpdatedAt: null };
  return r;
}

interface Pick3 {
  persona: Persona;
  r: Recipient;
  standIn: boolean;
}
/** One real guest of each kind; a guest from the list stands in (marked) when nobody has replied that way yet. */
export function personas(recipients: Recipient[], events: EventInfo[]): Pick3[] {
  const named = recipients.filter((r) => r.people.length);
  const base: Recipient = named[0] ?? {
    id: 'sample', token: '', phone: null, optOut: false, people: ['Sam Sample'], seatsHeld: 2, invited: events.map((e) => e.key), rsvp: {}, rsvpUpdatedAt: null, tableName: null,
  };
  const fake = (persona: Persona): Recipient => ({
    ...base,
    rsvp: persona === 'waiting' ? {} : Object.fromEntries(base.invited.map((k) => [k, { attending: persona === 'yes', count: Math.max(1, Math.min(base.seatsHeld, base.people.length)), answers: {} }])),
  });
  const pick = (persona: Persona, test: (r: Recipient) => boolean): Pick3 => {
    const real = named.find(test);
    return real ? { persona, r: real, standIn: false } : { persona, r: fake(persona), standIn: true };
  };
  return [pick('yes', saidYes), pick('no', declinedAll), pick('waiting', (r) => awaiting(r) && !saidYes(r))];
}

// ---------------------------------------------------------------- the rehearsal

export function rehearse(f: RehearsalFacts, asOfIso?: string): Rehearsal {
  const tz = f.wedding.timezone;
  const times = stepTimes(f);
  const asOf = asOfIso && !Number.isNaN(Date.parse(asOfIso)) ? new Date(asOfIso).toISOString() : f.now;
  const current = stepAt(times, asOf);
  const idx = (k: StepKey) => ORDER.indexOf(k);
  const first = f.events[0];
  const checks = readiness(f, times);
  const picks = personas(f.recipients, f.eventInfo);
  const everyone = new Set(f.recipients.map((r) => r.id).concat(picks.map((p) => p.r.id)));
  const hour = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

  // Each message on the moment it goes.
  const messagesAt = new Map<StepKey, MessageAtStep[]>(ORDER.map((k): [StepKey, MessageAtStep[]] => [k, []]));
  const manual: Rehearsal['manual'] = [];
  for (const c of f.campaigns) {
    const dates: { at: string | null; sent: boolean; step: StepKey }[] = [];
    if (c.trigger === 'invitation_created') dates.push({ at: null, sent: false, step: 'invites' });
    else if (c.trigger === 'rsvp_changed') dates.push({ at: null, sent: false, step: 'replies' });
    else if (c.mode === 'dates') {
      for (const s of c.slots) {
        if (s.status !== 'cancelled') dates.push({ at: s.sendAt, sent: s.status === 'done', step: stepAt(times, s.sendAt) });
      }
    } else {
      manual.push({ campaignId: c.id, name: c.name });
      continue;
    }
    for (const d of dates) {
      const before = idx(d.step) < idx('replies');
      // After the invitations, everyone has had theirs (reminders go only to those who have).
      const invitedBefore = idx(d.step) > idx('invites') ? everyone : f.invitedBefore;
      const reach: MessageAtStep['reach'] = {};
      for (const r of f.recipients) {
        if (c.excluded.includes(r.id) || r.optOut || !matches(c.audience, before ? { ...r, rsvp: {} } : r, invitedBefore)) continue;
        const h = howOf(r, f);
        reach[h] = (reach[h] ?? 0) + 1;
      }
      const gets = picks.map(({ persona, r }) => {
        const who = asAt(r, persona, before);
        if (!matches(c.audience, who, invitedBefore) || c.excluded.includes(r.id)) {
          return { persona, how: null, text: null, why: persona === 'no' && !before ? 'Not sent: they said no.' : persona === 'yes' && !before ? 'Not sent: they’ve replied.' : 'Not sent to them.' };
        }
        const how = howOf(r, f);
        if (how === 'post' || how === 'none') return { persona, how, text: null, why: `Gets ${HOW_WORDS[how]}.` };
        const m = renderFor(c.body, f.wedding, f.eventInfo, who, { footer: how !== 'email' && how !== 'phone' });
        const off = !c.enabled ? ' It’s switched off, so it won’t go.' : '';
        const broken = m.unfilled.length ? ` It has {${m.unfilled.join('}, {')}} left unfilled, so it would not be sent.` : '';
        return { persona, how, text: m.body, why: `Gets it ${HOW_WORDS[how]}.${off}${broken}` };
      });
      messagesAt.get(d.step)!.push({
        campaignId: c.id,
        name: c.name,
        sendAt: d.at,
        enabled: c.enabled,
        sent: d.sent,
        quiet: !!d.at && inQuietHours(new Date(d.at), tz, f.wedding.quietStart, f.wedding.quietEnd),
        reach,
        gets,
      });
    }
  }

  const slug = f.wedding.slug;
  const guideOf = first?.guide ?? null;
  const tablesOf = (r: Recipient, ev: RehearsalEvent) => {
    if (!ev.published) return null;
    const count = Math.max(1, r.rsvp[ev.key]?.count ?? 1);
    const names = f.people
      .filter((p) => p.invitationId === r.id && p.idx < count)
      .map((p) => ev.published!.tables.find((t) => t.id === ev.published!.seats[p.id])?.name ?? '')
      .filter(Boolean);
    return [...new Set(names)];
  };

  const steps: Step[] = ORDER.map((key) => {
    const at = times[key];
    const i = idx(key);
    const before = i < idx('replies');
    const guests: GuestView[] = picks.map(({ persona, r, standIn }) => {
      const who = asAt(r, persona, before);
      const name = r.people.join(' & ') || 'A guest';
      const tok = !standIn && r.token ? `g=${encodeURIComponent(r.token)}&` : '';
      const q = `?${tok}preview=1&asOf=${encodeURIComponent(at)}`;
      const sees: string[] = [];
      const coming = saidYes(who);
      let page: GuestView['page'] = { kind: 'invitation', path: `/w/${slug}/${q}` };
      const how = howOf(r, f);
      sees.push(how === 'post' ? 'Invited by post only: no texts or emails.' : how === 'none' ? 'No mobile or email: nothing you send reaches them.' : `Hears from you ${HOW_WORDS[how]}.`);
      if (before) sees.push('Their invitation, with the reply form ready.');
      else if (persona === 'yes') sees.push(`Their reply: coming${who.invited.length > 1 ? ` to ${f.eventInfo.filter((e) => who.rsvp[e.key]?.attending).map((e) => e.name).join(' and ')}` : ''}. They can change it until replies close.`);
      else if (persona === 'no') sees.push('Their reply: can’t make it. Their page thanks them; nothing else goes to them.');
      else sees.push(i >= idx('rsvp') ? 'Still no reply, after replies closed: you’ll need to call them.' : 'Their page still asks them to reply.');
      if (coming && i >= idx('seating') && first) {
        const t = tablesOf(who, first);
        sees.push(t === null ? 'No table yet: your seating isn’t published.' : standIn ? 'Their table, from your published plan.' : t.length ? `Their table: ${t.join(', ')}.` : 'No table: they aren’t in your published plan.');
      }
      if (coming && i >= idx('night')) {
        const diets = f.people.filter((p) => p.invitationId === r.id && p.diet.trim()).map((p) => `${p.name.split(' ')[0]}: ${p.diet.trim()}`);
        if (diets.length) sees.push(`Dietary noted: ${diets.join('; ')}.`);
        if (guideOf && first) {
          sees.push('Their night-before page: the run sheet, map, menu and their table.');
          if (i < idx('reception')) page = { kind: 'guide', path: `/w/${slug}/tomorrow/${encodeURIComponent(first.key)}${q}` };
        } else sees.push('Night-before page: not set up, so their link says it isn’t ready.');
      }
      if (coming && i >= idx('reception') && first) {
        sees.push(f.photos ? 'The photo page: they add photos straight to your album.' : 'The photo page: uploads aren’t open (nowhere to store photos yet).');
        page = { kind: 'photos', path: `/w/${slug}/photos/${encodeURIComponent(first.key)}${q}` };
      }
      return { persona, name, standIn, page, sees };
    });

    // The wedding party's and the coordinator's view of this moment.
    const party: string[] = [];
    const coordinator: string[] = [];
    if (f.party.members) {
      party.push(`${f.party.members} in the wedding party, each with their own page (${f.party.signIns} with a sign-in of their own).`);
      if (i >= idx('night')) {
        if (!f.party.runsheet.length) party.push('Their run sheet is empty.');
        else if (['morning', 'ceremony', 'reception'].includes(key)) {
          const now = localParts(new Date(at), tz);
          const mins = now.hour * 60 + now.minute;
          const timed = f.party.runsheet.map((it) => ({ it, m: clockMinutes(it.time) })).filter((x): x is { it: PartyItem; m: number } => x.m !== null).sort((a, b) => a.m - b.m);
          const on = timed.filter((x) => x.m <= mins).pop();
          const next = timed.find((x) => x.m > mins);
          party.push(on ? `On now: ${on.it.time} ${on.it.title}.` : 'Nothing on their run sheet yet.');
          if (next) party.push(`Next: ${next.it.time} ${next.it.title}.`);
        } else party.push(`Their run sheet: ${f.party.runsheet.length} ${f.party.runsheet.length === 1 ? 'item' : 'items'}.`);
      }
    } else party.push('No wedding party added yet.');
    if (i >= idx('night')) {
      coordinator.push(f.coordinator.on ? `${f.coordinator.name || 'Your coordinator'} has the day’s run sheet, suppliers and the issues log.` : 'No coordinator link: nobody but you has the run sheet and suppliers’ numbers.');
    }

    return {
      key,
      label: STEP_LABELS[key],
      at,
      past: at <= f.now,
      messages: messagesAt.get(key) ?? [],
      guests,
      party,
      coordinator,
      checks: checks.filter((c) => c.step === key).map((c) => c.key),
    };
  });

  // Quiet hours say when a held text goes instead.
  for (const s of steps)
    for (const m of s.messages)
      for (const g of m.gets) if (m.quiet && g.text) g.why += ` Due in your quiet hours: it waits until ${hour(f.wedding.quietStart)}.`;

  const areas = (Object.keys(AREA_LABELS) as Area[]).map((area) => {
    const mine = checks.filter((c) => c.area === area);
    const level: Level = mine.some((c) => c.level === 'red') ? 'red' : mine.length ? 'amber' : 'green';
    return { area, label: AREA_LABELS[area], level, count: mine.length };
  });
  return { now: f.now, asOf, current, timezone: tz, steps, manual, checks, areas };
}

// ---------------------------------------------------------------- readiness

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** What would break or embarrass on the day, worst first. */
export function readiness(f: RehearsalFacts, times: Record<StepKey, string> = stepTimes(f)): Check[] {
  const out: Check[] = [];
  const add = (c: Check) => out.push(c);
  const w = f.wedding;
  const tz = w.timezone;
  const hour = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
  const hows = f.recipients.map((r) => howOf(r, f));
  const texted = hows.filter((h) => h === 'text' || h === 'text+email').length;

  if (f.dateToBeSet) add({ key: 'date', area: 'texts', level: 'red', step: 'invites', title: 'Your date isn’t set', detail: 'Invitations, the countdown and every reminder are worked out from it.', fix: { tab: 'pages', event: true, query: 'page=details' } });

  // Reaching guests.
  if (f.via === 'service' && !w.sender && texted) {
    add({ key: 'no-texting', area: 'texts', level: 'red', step: 'invites', title: `No texting set up: ${n(texted, 'guest', 'guests')} can’t be reached`, detail: 'Choose how messages go: free from your own phone or by email, or a texting number.', fix: { tab: 'settings', query: 'view=texting' } });
  } else if (f.via === 'service' && w.plan === 'free' && texted) {
    add({ key: 'plan-texts', area: 'texts', level: 'red', step: 'invites', title: `Your plan doesn’t include texts: ${n(texted, 'guest', 'guests')} would get nothing`, detail: 'Send from your own phone or by email (free), or upgrade.', fix: { tab: 'settings', query: 'view=texting' } });
  }
  if (w.paused) add({ key: 'paused', area: 'texts', level: 'red', step: 'invites', title: 'All texts are paused', detail: 'Nothing goes out until you resume.', fix: { tab: 'settings', query: 'view=texting' } });
  const none = hows.filter((h) => h === 'none').length;
  if (none) add({ key: 'unreachable', area: 'texts', level: 'amber', step: 'invites', title: `${n(none, 'invitation has', 'invitations have')} no mobile or email`, detail: 'They won’t get the invitation, reminders or the night-before text. Add one, or mark them as invited by post.', fix: { tab: 'guests', event: true } });
  if (!w.adminMobile) add({ key: 'my-mobile', area: 'texts', level: 'amber', step: 'invites', title: 'Your own mobile isn’t saved', detail: 'You can’t text yourself a test, and you won’t hear if a text can’t go.', fix: { tab: 'settings', query: 'view=texting' } });

  // Each message that would go.
  const live = f.campaigns.filter((c) => c.enabled);
  const sample = f.recipients.find((r) => r.people.length);
  for (const c of live) {
    const r = sample ?? null;
    const m = r ? renderFor(c.body, w, f.eventInfo, { ...r, tableName: r.tableName ?? 'Table 1' }) : null;
    const s0 = c.slots[0];
    const at: StepKey = c.trigger === 'invitation_created' ? 'invites' : c.trigger === 'rsvp_changed' ? 'replies' : s0 ? stepAt(times, s0.sendAt) : 'invites';
    if (m?.unfilled.length) add({ key: `unfilled:${c.id}`, area: 'texts', level: 'red', step: at, title: `“${c.name}” has a blank to fill: {${m.unfilled.join('}, {')}}`, detail: 'A message with an unfilled blank is never sent. Fix the words.', fix: { tab: 'texts', event: true } });
    for (const s of c.mode === 'dates' ? c.slots.filter((x) => x.status === 'pending' && x.sendAt > f.now) : []) {
      if (inQuietHours(new Date(s.sendAt), tz, w.quietStart, w.quietEnd)) {
        const p = localParts(new Date(s.sendAt), tz);
        add({ key: `quiet:${c.id}:${s.sendAt}`, area: 'texts', level: 'amber', step: stepAt(times, s.sendAt), title: `“${c.name}” is due at ${hour(p.hour)}${p.minute ? `:${String(p.minute).padStart(2, '0')}` : ''}, inside your quiet hours`, detail: `It would wait until ${hour(w.quietStart)}. Move it, or change your quiet hours.`, fix: { tab: 'texts', event: true } });
      }
    }
  }
  const biggest = Math.max(0, ...live.map((c) => f.recipients.filter((r) => matches(c.audience, r, new Set(f.recipients.map((x) => x.id)))).length));
  if (f.via === 'service' && w.sender && biggest > w.dailyCap) add({ key: 'cap', area: 'texts', level: 'amber', step: 'invites', title: `A message goes to ${biggest} but your daily limit is ${w.dailyCap}`, detail: 'The rest would go the next day.', fix: { tab: 'settings', query: 'view=texting' } });

  // Replies.
  const waiting = f.recipients.filter(awaiting).length;
  if (!w.rsvpClose) add({ key: 'rsvp-date', area: 'replies', level: 'amber', step: 'rsvp', title: 'No reply-by date', detail: 'Guests aren’t told when to reply by, and {rsvp_by} reads “the RSVP date”.', fix: { tab: 'pages', event: true } });
  const reminder = live.some((c) => c.mode === 'dates' && isReminder(c) && c.slots.some((s) => s.status === 'pending' && s.sendAt > f.now));
  if (!reminder && waiting) add({ key: 'no-reminder', area: 'replies', level: 'amber', step: 'reminders', title: `No reminder scheduled for the ${n(waiting, 'invitation', 'invitations')} still to reply`, detail: 'Add a reminder, or a last call a week before replies close.', fix: { tab: 'texts', event: true } });
  if (waiting && f.now > times.rsvp) add({ key: 'late', area: 'replies', level: 'amber', step: 'rsvp', title: `${n(waiting, 'invitation is', 'invitations are')} still to reply, after replies closed`, detail: 'Call or message them: your caterer needs final numbers.', fix: { tab: 'guests', event: true, query: 'filter=awaiting' } });

  // Each event: seating, the night-before page and its text.
  f.events.forEach((ev, i) => {
    const start = ev.startsAt;
    const coming = f.recipients.filter((r) => r.invited.includes(ev.key) && r.rsvp[ev.key]?.attending === true);
    const comingPeople = coming.flatMap((r) => f.people.filter((p) => p.invitationId === r.id && p.idx < Math.max(1, r.rsvp[ev.key]?.count ?? 1)));
    const of = f.events.length > 1 ? ` (${ev.name})` : '';
    if (ev.tables) {
      if (!ev.published) add({ key: `unpublished:${ev.key}`, area: 'seating', level: 'amber', step: 'seating', title: `Seating isn’t published${of}`, detail: 'Guests see their table only once you publish it.', fix: { tab: 'seating', event: true } });
      else {
        const missing = comingPeople.filter((p) => !ev.published!.seats[p.id]).length;
        if (missing) add({ key: `no-table:${ev.key}`, area: 'seating', level: 'red', step: 'seating', title: `${n(missing, 'guest has', 'guests have')} no table${of}`, detail: 'They said yes but aren’t in your published plan: seat them, then publish again.', fix: { tab: 'seating', event: true } });
      }
    } else if (i === 0 && ev.catered && coming.length) add({ key: `no-plan:${ev.key}`, area: 'seating', level: 'amber', step: 'seating', title: `No seating plan${of}`, detail: 'Guests won’t have a table on their night-before page.', fix: { tab: 'seating', event: true } });

    const g = ev.guide;
    if (!g) add({ key: `no-guide:${ev.key}`, area: 'night', level: 'amber', step: 'night', title: `No night-before page${of}`, detail: 'The night-before text links to it: guests would see “not ready yet”.', fix: { tab: 'pages', event: true, query: 'page=guide:' + ev.key } });
    else {
      const gaps: string[] = [];
      if (g.style === 'reception' && !g.parking?.trim() && !g.parkDirections?.trim() && !g.parkVideo?.trim()) gaps.push('parking info');
      if (!g.address?.trim() && !ev.address.trim()) gaps.push('an address');
      if (!g.runsheet?.length) gaps.push('a run sheet');
      if (!g.contacts?.length) gaps.push('someone to call');
      if (gaps.length) add({ key: `guide-gaps:${ev.key}`, area: 'night', level: 'amber', step: 'night', title: `The night-before page has no ${gaps.join(', ')}${of}`, detail: 'It’s the first thing guests will open on the day.', fix: { tab: 'pages', event: true, query: 'page=guide:' + ev.key } });
    }
    const night = live.some((c) => c.mode === 'dates' && c.slots.some((s) => s.status === 'pending' && s.sendAt < start && s.sendAt > plus(start, -2 * DAY)) && (c.audience.attending === ev.key || (isNightText(c) && !c.audience.attending)));
    if (!night && coming.length) add({ key: `no-night-text:${ev.key}`, area: 'night', level: 'amber', step: 'night', title: `No night-before text${of}`, detail: 'Guests coming won’t be sent their page (table, map, menu) the evening before.', fix: { tab: 'texts', event: true } });
    if (!ev.address.trim() && !ev.venue.trim()) add({ key: `no-place:${ev.key}`, area: 'day', level: 'amber', step: 'morning', title: `No venue or address${of}`, detail: 'The invitation, calendar entries and the map have nowhere to point.', fix: { tab: 'pages', event: true, query: 'page=details' } });
  });

  // On the day.
  if (!f.photos) add({ key: 'photos', area: 'photos', level: 'amber', step: 'reception', title: 'Guests’ photos have nowhere to go', detail: 'Connect Google Drive, Dropbox or OneDrive (free), so the table QR codes work.', fix: { tab: 'photos', event: true } });
  if (f.party.members && !f.party.runsheet.length) add({ key: 'party-runsheet', area: 'party', level: 'amber', step: 'morning', title: 'The wedding party’s run sheet is empty', detail: 'Each of them sees only their part of it on the day.', fix: { tab: 'party', event: true } });
  if (!f.coordinator.on) add({ key: 'coordinator', area: 'party', level: 'amber', step: 'morning', title: 'No day-of coordinator', detail: 'Give one trusted person the run sheet, suppliers and the issues log, so you’re not the one answering questions.', fix: { tab: 'party', event: true } });

  const rank = { red: 0, amber: 1 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level] || ORDER.indexOf(a.step) - ORDER.indexOf(b.step));
}

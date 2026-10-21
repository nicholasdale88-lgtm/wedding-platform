import type { DayChecklist, Enquiry, GuideContent, InvitationContent, Listing, ListingCard, ListingFields, PartyRunsheet, PartySetup, PlannerKind, Side, TableShape, TaskTotals } from '@wp/shared';
/** Typed client for the Worker API (same origin, cookies included). Errors carry the server's plain-English message. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    const go = () =>
      fetch(`/api${path}`, {
        credentials: 'same-origin',
        ...init,
        headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
      });
    res = await go();
    // Briefly busy (503): nothing was saved, so try again quietly before saying anything.
    for (let i = 0; i < 3 && res.status === 503; i++) {
      await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
      res = await go();
    }
  } catch {
    throw new ApiError(0, 'offline', "Can't reach the server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'error', body?.error?.message ?? 'Something went wrong. Please try again.');
  }
  return body as T;
}

const send = <T>(method: string, path: string, body?: unknown, version?: number) =>
  request<T>(path, {
    method,
    body: JSON.stringify(body ?? {}),
    headers: version === undefined ? {} : { 'If-Match': String(version) },
  });

export type Role = 'owner' | 'editor' | 'viewer';
export interface Me {
  user: { id: string; email: string; superAdmin: boolean };
  weddings: { id: string; slug: string; name1: string; name2: string; role: Role }[];
}

export interface EventInfo {
  id: string;
  key: string;
  name: string;
  pendingLabel: string;
  startsAt: string;
  sort: number;
  hasSeating: boolean;
  catered: boolean;
  questions: { key: string; label: string; type: string; options?: string[] }[];
}

export interface Person {
  id: string;
  idx: number;
  name: string;
  diet: string;
  table: string | null;
  meal: { entree: string; main: string; dessert: string };
  /** Their meal at each event: a special menu's id ('' the set menu) and any course changed just for them. */
  meals?: Record<string, { menu: string; entree: string; main: string; dessert: string }>;
  /** Their wedding party role ('' when they aren't in it). */
  role?: string;
}

export interface Reply {
  attending: boolean | null;
  count: number;
  answers: Record<string, string>;
  message: string;
  via: string;
  updatedAt: string;
}

export interface Guest {
  id: string;
  phone: string | null;
  phoneDisplay: string;
  seatsHeld: number;
  party: string;
  optOut: boolean;
  version: number;
  createdAt: string;
  openedAt: string | null;
  people: Person[];
  invited: string[];
  rsvp: Record<string, Reply>;
  repliedAt: string | null;
  lastSms: { name: string; at: string; status: string } | null;
}

export interface GuestDetail {
  guest: Guest;
  link: string;
  sms: { name: string; at: string; status: string }[];
  events: EventInfo[];
  campaigns: { id: string; name: string }[];
}

export interface Overview {
  wedding: { id: string; slug: string; name1: string; name2: string; monogram?: string; theme?: string; timezone: string; adminName: string; adminLook?: { palette?: string; eventColours?: boolean; large?: boolean }; plan?: 'free' | 'essentials' | 'complete'; planRequested?: string; private?: boolean };
  total: number;
  replied: number;
  awaiting: number;
  /** About how many guests they expect (0 = not set). */
  expectedGuests?: number;
  yesInv: number;
  noInv: number;
  seatsHeld: number;
  events: { key: string; name: string; startsAt: string; venue: string; coming: number }[];
  diet: { people: number; serious: number; mealsSet: number };
  daysToGo: number | null;
  needsYou: { kind: string; title: string; detail: string; cta: string; link: string; event?: string }[];
  nextUp: { campaignId: string; name: string; sendAt: string }[];
  latest: { id: string; name: string; at: string; summary: string; message: string }[];
  nav: { guests: number; dietary: number; autopilot: number; smsLive: boolean; messages?: number };
  /** What the wedding party's sides are called ("Bride", "Groom" unless changed). */
  partySides?: { p1: string; p2: string };
  /** The event these figures are about (the admin's event switcher), or null for all. */
  focus?: string | null;
  perEvent?: { key: string; name: string; startsAt: string; invited: number; yes: number; no: number; awaiting: number; coming: number; diet: number; seated: number; hasSeating: boolean; catered: boolean }[];
}

export interface GuestPatch {
  people?: string[];
  phone?: string | null;
  seatsHeld?: number;
  party?: string;
  invited?: string[];
  table?: string | null;
  /** The event the table is for (the section it was typed in). */
  tableEvent?: string;
}
export interface RsvpPut {
  events: Record<string, { attending: boolean | null; answers?: Record<string, string> }>;
  count?: number;
  diet?: string;
  message?: string;
}

const w = (wid: string) => `/a/w/${encodeURIComponent(wid)}`;

export const api = {
  me: () => request<Me>('/a/me'),
  login: (email: string, passcode: string) => send<Me>('POST', '/a/auth/login', { email, passcode }),
  logout: () => send<{ ok: true }>('POST', '/a/auth/logout'),
  /** Forgot your passcode: emailed: false when the site can't send email yet. */
  forgot: (email: string) => send<{ ok: true; emailed: boolean }>('POST', '/a/auth/forgot', { email }),
  reset: (token: string, passcode: string) => send<Me>('POST', '/a/auth/reset', { token, passcode }),
  /** Private: the wedding's pages open only with each guest's own link. */
  setPrivate: (wid: string, on: boolean) => send<{ ok: true; private: boolean }>('PUT', `${w(wid)}/privacy`, { private: on }),
  /** Ask to upgrade (the platform owner sends a payment link). */
  requestPlan: (wid: string, plan: 'essentials' | 'complete' | 'event') => send<{ ok: true; requested: string }>('POST', `${w(wid)}/plan/request`, { plan }),
  /** Whether paying by card (Stripe Checkout) is switched on. */
  planCard: (wid: string) => request<{ on: boolean }>(`${w(wid)}/plan/card`),
  /** Opens a Stripe Checkout page for a plan or another event; the browser goes to `url` to pay. */
  checkout: (wid: string, what: 'essentials' | 'complete' | 'event', code = '') => send<{ url: string }>('POST', `${w(wid)}/plan/checkout`, { what, code }),
  /** What a promo code makes the price. */
  promo: (wid: string, what: 'essentials' | 'complete' | 'event', code: string) => send<{ cents: number; off: number; code: string }>('POST', `${w(wid)}/plan/promo`, { what, code }),
  /** From the front page: a new account and wedding, signed in. */
  signup: (b: { firstName: string; partnerName: string; email: string; passcode: string; date: string; guests?: number; plan: 'free' | 'essentials' | 'complete'; marketing: boolean; website: string; ref?: string }) =>
    send<Me & { weddingId: string }>('POST', '/a/signup', b),

  overview: (wid: string, event?: string) => request<Overview>(`${w(wid)}/overview${event ? `?event=${encodeURIComponent(event)}` : ''}`),
  guests: (wid: string) => request<{ events: EventInfo[]; guests: Guest[]; links?: Record<string, string> }>(`${w(wid)}/guests`),
  guest: (wid: string, id: string) => request<GuestDetail>(`${w(wid)}/guests/${id}`),
  /** A new guest; `invited` limits them to those events (added from inside an event). */
  addGuest: (wid: string, invited?: string[]) => send<GuestDetail>('POST', `${w(wid)}/guests`, invited ? { invited } : {}),
  patchGuest: (wid: string, g: Pick<Guest, 'id' | 'version'>, patch: GuestPatch) => send<GuestDetail>('PATCH', `${w(wid)}/guests/${g.id}`, patch, g.version),
  putRsvp: (wid: string, g: Pick<Guest, 'id' | 'version'>, body: RsvpPut) => send<GuestDetail>('PUT', `${w(wid)}/guests/${g.id}/rsvp`, body, g.version),
  removeGuest: (wid: string, id: string) => send<{ ok: true }>('DELETE', `${w(wid)}/guests/${id}`),
  restoreGuest: (wid: string, id: string) => send<GuestDetail>('POST', `${w(wid)}/guests/${id}/restore`),
  estimateOne: (wid: string, id: string, campaignId: string) =>
    send<{ count: number; parts: number; costCents: number; sample: string | null; quiet: boolean }>('POST', `${w(wid)}/guests/${id}/send?dry=1`, { campaignId }),
  importGuests: (wid: string, rows: unknown[], dry: boolean) => send<ImportResult>('POST', `${w(wid)}/guests/import${dry ? '?dry=1' : ''}`, { rows }),
  setAdminLook: (wid: string, look: { palette: string; eventColours: boolean; large: boolean }) => send<{ ok: true }>('PUT', `${w(wid)}/look`, look),
  setAdminName: (wid: string, name: string) => send<{ ok: true; name: string }>('PUT', `${w(wid)}/admin-name`, { name }),
  /** A person's meal at an event: a special menu (id, '' the set menu) and courses changed just for them. */
  setMeal: (wid: string, personId: string, meal: { event?: string; menu?: string; entree: string; main: string; dessert: string }) => send<{ ok: true }>('PUT', `${w(wid)}/people/${personId}/meal`, meal),
  sendOne: (wid: string, id: string, campaignId: string) =>
    send<{ queued: number; sent: number; failed: number; stopped?: { reason: string; error: string } }>('POST', `${w(wid)}/guests/${id}/send`, { campaignId }),
};

// ---------------------------------------------------------------- Guest pages

export interface PagesData {
  version: number;
  slug: string;
  theme: string;
  /** The couple's names and monogram (the invitation, texts and the admin's title all use them). */
  names?: PageNames;
  /** The secret preview code for sharing (null: sharing is off). */
  share?: string | null;
  events: { key: string; name: string }[];
  invitation: InvitationContent;
  guides: Record<string, GuideContent>;
  texts: Record<string, string>;
  /** The starting wording's placeholders as guests see them, filled from the events (the date, the venue). */
  filled?: Record<string, string>;
  samples: { token: string; label: string; invited: string[] }[];
}
export interface PageNames {
  name1: string;
  name2: string;
  monogram: string;
}
export type PagesPut = Partial<{ names: PageNames; theme: string; invitation: InvitationContent; guides: Record<string, GuideContent>; texts: Record<string, string> }>;

export const pagesApi = {
  get: (wid: string) => request<PagesData>(`${w(wid)}/pages`),
  save: (wid: string, version: number, body: PagesPut) => send<PagesData>('PUT', `${w(wid)}/pages`, body, version),
  /** Turn the preview link on (a new secret code) or off (every shared link stops working). */
  share: (wid: string, on: boolean) => send<PagesData>('POST', `${w(wid)}/pages/share`, { on }),
};

// ---------------------------------------------------------------- SMS messages

export type Audience = Record<string, unknown>;
export interface Campaign {
  id: string;
  key: string;
  name: string;
  body: string;
  mode: 'auto' | 'dates' | 'manual';
  enabled: boolean;
  trigger: 'invitation_created' | 'rsvp_changed' | null;
  audience: Audience;
  audienceLabel: string;
  excluded: string[];
  custom: boolean;
  version: number;
  count: number;
  slots: { id: string; sendAt: string; status: string; error: string | null }[];
}
export interface TextsData {
  live: boolean;
  /** Texts due in the next two days that won't go as planned, and why. */
  upcoming?: { slotId: string; campaign: string; sendAt: string; problems: string[]; codes: string[] }[];
  sender: string | null;
  paused: boolean;
  adminMobile: string | null;
  timezone: string;
  /** When invitations start going out (null: no events yet). */
  invitesFrom: string | null;
  invitesFromCustom: boolean;
  quiet: { start: number; end: number };
  events: { key: string; name: string }[];
  audiences: { key: string; label: string; audience: Audience }[];
  presets: { k: string; label: string; text: string }[];
  people: { id: string; name: string; phone: boolean; optOut: boolean }[];
  campaigns: Campaign[];
  inbox: { id: string; at: string; name: string; body: string; action: string; handled: boolean }[];
  history: { at: string; name: string; count: number; sent: number; failed: number; sample: string }[];
}
export interface Estimate {
  count: number;
  ids: string[];
  parts: number;
  costCents: number;
  sample: string | null;
  quiet: boolean;
}
export interface SendResult {
  queued: number;
  sent: number;
  failed: number;
  stopped?: { reason: string; error: string };
}
export type CampaignPatch = Partial<{ name: string; body: string; enabled: boolean; audience: Audience; excluded: string[]; dates: string[] }>;

export const textsApi = {
  get: (wid: string) => request<TextsData>(`${w(wid)}/texts`),
  add: (wid: string, name: string, audience: Audience, body?: string, dates?: string[]) =>
    send<{ id: string }>('POST', `${w(wid)}/texts`, { name, audience, ...(body ? { body } : {}), ...(dates?.length ? { dates } : {}) }),
  patch: (wid: string, c: Pick<Campaign, 'id' | 'version'>, patch: CampaignPatch) => send<{ ok: true; version: number }>('PATCH', `${w(wid)}/texts/${c.id}`, patch, c.version),
  remove: (wid: string, id: string) => send<{ ok: true }>('DELETE', `${w(wid)}/texts/${id}`),
  estimate: (wid: string, id: string, draft: Partial<{ body: string; audience: Audience; excluded: string[]; only: string[] }> = {}) =>
    send<Estimate>('POST', `${w(wid)}/texts/${id}/estimate`, draft),
  sendNow: (wid: string, id: string, only?: string[]) => send<SendResult>('POST', `${w(wid)}/texts/${id}/send`, only ? { only } : {}),
  test: (wid: string, body: string) => send<SendResult>('POST', `${w(wid)}/texts/test`, { body }),
  invitesFrom: (wid: string, date: string | null) => send<{ invitesFrom: string | null; invitesFromCustom: boolean }>('PUT', `${w(wid)}/texts/invites-from`, { date }),
};

// ---------------------------------------------------------------- SMS setup

export interface SettingsData {
  version: number;
  /** Which SMS service sends (set by the platform: SMS_PROVIDER). */
  provider: string;
  live: boolean;
  sender: string;
  adminMobile: string;
  paused: boolean;
  dailyCap: number;
  quietStart: number;
  quietEnd: number;
  optOutFooter: string;
  replies: { yes: string; no: string; multi: string };
  rateX100: number;
  timezone: string;
  plan: { name: string; detail: string; costCents: number; auto: boolean; fixed?: boolean }[];
  planTotalCents: number;
}
export type SettingsPut = Partial<Omit<SettingsData, 'version' | 'live' | 'timezone' | 'plan' | 'planTotalCents' | 'replies'> & { replies: Partial<SettingsData['replies']> }>;

export const settingsApi = {
  /** About how many guests they expect. */
  setExpected: (wid: string, guests: number) => send<{ guests: number }>('PUT', `${w(wid)}/settings/expected`, { guests }),
  get: (wid: string) => request<SettingsData>(`${w(wid)}/settings`),
  save: (wid: string, version: number, body: SettingsPut) => send<SettingsData>('PUT', `${w(wid)}/settings`, body, version),
  backupUrl: (wid: string) => `/api${w(wid)}/settings/backup`,
  changePasscode: (current: string, next: string) => send<{ ok: true }>('POST', '/a/auth/passcode', { current, next }),
};

// ---------------------------------------------------------------- Your account and the people who run the wedding

/** You, as a customer: what Settings → Your details shows and saves (user.id is the customer id). */
export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mobile: string;
  state: string;
  postcode: string;
  heardFrom: string;
  marketing: { optIn: boolean; at: string | null };
  createdAt: string;
  lastLoginAt: string | null;
}
export type ProfilePut = Partial<Pick<Profile, 'firstName' | 'lastName' | 'mobile' | 'state' | 'postcode' | 'heardFrom'> & { marketingOptIn: boolean }>;
export interface Member {
  id: string;
  email: string;
  name: string;
  role: Role;
  lastLoginAt: string | null;
}
export interface Members {
  /** `main`: you're the main account (the plan and billing are yours). */
  you: { id: string; role: Role; main?: boolean };
  /** The main account's user id: the person who signed up (payments). */
  main?: string | null;
  members: Member[];
  invites: { id: string; email: string; role: Role; expiresAt: string }[];
}
export const accountApi = {
  profile: () => request<{ profile: Profile; states: string[]; heardFrom: string[] }>('/a/me/profile'),
  saveProfile: (body: ProfilePut) => send<{ profile: Profile }>('PUT', '/a/me/profile', body),
  changeEmail: (email: string, passcode: string) => send<{ ok: true; email: string }>('POST', '/a/me/email', { email, passcode }),
  members: (wid: string) => request<Members>(`${w(wid)}/members`),
  invite: (wid: string, email: string, role: Role) => send<{ link: string; expiresAt: string }>('POST', `${w(wid)}/members/invite`, { email, role }),
  cancelInvite: (wid: string, id: string) => send<{ ok: true }>('DELETE', `${w(wid)}/members/invites/${encodeURIComponent(id)}`),
  setRole: (wid: string, uid: string, role: Role) => send<{ ok: true }>('PATCH', `${w(wid)}/members/${encodeURIComponent(uid)}`, { role }),
  remove: (wid: string, uid: string) => send<{ ok: true }>('DELETE', `${w(wid)}/members/${encodeURIComponent(uid)}`),
  inviteInfo: (token: string) => request<{ email: string; role: Role; couple: string; hasAccount: boolean }>(`/a/invite/${encodeURIComponent(token)}`),
  acceptInvite: (token: string, body: { passcode: string; firstName?: string; lastName?: string; marketingOptIn?: boolean }) => send<Me>('POST', `/a/invite/${encodeURIComponent(token)}`, body),
};

// ---------------------------------------------------------------- Seating

export interface SeatTable {
  id: string;
  name: string;
  shape: TableShape;
  dir: 'h' | 'v';
  len: number;
  x: number;
  y: number;
  seats: number;
  /** Long and head tables: 2 both sides, 1 the top/left side only, -1 the bottom/right side only. */
  sides?: number;
}
export interface SeatArea {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface SeatingData {
  /** The plan guests see; null until first published. changes = edits saved since. */
  published: { at: string; changes: number } | null;
  /** Named versions, newest first. */
  versions?: { id: string; name: string; at: string; tables: number; seated: number }[];
  /** The version nominated as the current arrangement, and saved edits since. */
  current?: { id: string; name: string; changes: number } | null;
  version: number;
  event: { key: string; name: string };
  events: { key: string; name: string }[];
  aspect: string;
  planImg: string;
  tables: SeatTable[];
  areas: SeatArea[];
  people: { id: string; invitationId: string; name: string; party: string; role?: string; diet: string; meal: { e: string; m: string; d: string }; tableId: string | null; coming: boolean }[];
}
export interface SeatingSave {
  event: string;
  aspect: string;
  tables: SeatTable[];
  areas: SeatArea[];
  seats: Record<string, string | null>;
}

export const seatingApi = {
  get: (wid: string, event?: string) => request<SeatingData>(`${w(wid)}/seating${event ? `?event=${encodeURIComponent(event)}` : ''}`),
  save: (wid: string, version: number, body: SeatingSave) => send<SeatingData>('PUT', `${w(wid)}/seating`, body, version),
  publish: (wid: string, version: number, event: string) => send<SeatingData>('POST', `${w(wid)}/seating/publish`, { event }, version),
  saveVersion: (wid: string, event: string, name: string) => send<SeatingData>('POST', `${w(wid)}/seating/versions`, { event, name }),
  version: (wid: string, id: string) => request<{ id: string; name: string; aspect: string; tables: SeatTable[]; areas: SeatArea[]; seats: Record<string, string> }>(`${w(wid)}/seating/versions/${encodeURIComponent(id)}`),
  renameVersion: (wid: string, id: string, name: string) => send<SeatingData>('PATCH', `${w(wid)}/seating/versions/${encodeURIComponent(id)}`, { name }),
  deleteVersion: (wid: string, id: string) => send<SeatingData>('DELETE', `${w(wid)}/seating/versions/${encodeURIComponent(id)}`, {}),
  makeCurrent: (wid: string, version: number, id: string) => send<SeatingData>('POST', `${w(wid)}/seating/versions/${encodeURIComponent(id)}/current`, {}, version),
};

// ---------------------------------------------------------------- Photos

export interface PhotosData {
  enabled: boolean;
  items: { id: string; by: string; at: string; bytes: number; type: string; url: string; event?: string | null; look?: string; thumb?: string | null; original?: string | null }[];
}
export interface PhotoLink {
  id: string;
  provider: 'gdrive' | 'gphotos' | 'dropbox' | 'onedrive';
  name: string;
  account: string;
  ok: boolean;
  problem: string | null;
  copied: number;
  waiting: number;
  failed: number;
  since: string;
  /** Planning files (quotes, contracts, menus) are kept here too. */
  docs?: boolean;
  /** Everything is filed in one "<couple> wedding" folder (Photos, Planning files, Signs and print, Backups). */
  filed?: boolean;
  /** Where to see it in their own storage (Google Drive: the wedding's folder). */
  openUrl?: string;
}
export interface PhotoLinks {
  siteStorage: boolean;
  redirectUri: string;
  /** Whoever runs the site (a super-admin) sees how to switch each service on; couples never do. */
  canSetUp?: boolean;
  providers: { key: PhotoLink['provider']; name: string; ready: boolean }[];
  links: PhotoLink[];
}
/** Linked photo storage: the couple's own Google Drive, Google Photos, Dropbox or OneDrive. */
export const photoLinksApi = {
  get: (wid: string) => request<PhotoLinks>(`${w(wid)}/photo-links`),
  connect: (wid: string, provider: PhotoLink['provider']) => send<{ url: string }>('POST', `${w(wid)}/photo-links/connect`, { provider }),
  remove: (wid: string, id: string) => send<{ ok: true }>('DELETE', `${w(wid)}/photo-links/${id}`),
  copyAll: (wid: string, id: string) => send<{ ok: true; queued: number }>('POST', `${w(wid)}/photo-links/${id}/copy-all`),
  setDocs: (wid: string, id: string, on: boolean) => send<{ ok: true }>('PUT', `${w(wid)}/photo-links/${id}/docs`, { on }),
  setUpFolders: (wid: string, id: string) => send<{ ok: true; folders: string[] }>('POST', `${w(wid)}/photo-links/${id}/folders`),
};
/** Automatic daily backups to the linked storage (owners). */
export interface BackupStatus {
  last: string | null;
  where: string | null;
  problem: string | null;
  auto: boolean;
  /** The linked storage backups go to (null: none linked yet). */
  linked: string | null;
}
/** The system check: each outside service, and whether it's working. */
export interface CheckItem {
  key: string;
  name: string;
  state: 'ok' | 'warn' | 'off';
  detail: string;
  fix: string;
}
export const backupsApi = {
  check: (wid: string) => request<{ at: string; items: CheckItem[] }>(`${w(wid)}/settings/check`),
  /** The daily summary email (about 6pm, only with news). */
  digest: (wid: string) => request<{ on: boolean; email: boolean }>(`${w(wid)}/settings/digest`),
  setDigest: (wid: string, on: boolean) => send<{ on: boolean; email: boolean }>('PUT', `${w(wid)}/settings/digest`, { on }),
  get: (wid: string) => request<BackupStatus>(`${w(wid)}/settings/backups`),
  now: (wid: string) => send<{ ok: true; at: string; where: string }>('POST', `${w(wid)}/settings/backups/now`),
  auto: (wid: string, on: boolean) => send<{ ok: true; auto: boolean }>('PUT', `${w(wid)}/settings/backups/auto`, { on }),
};

/** A vendor who's signed up to the directory, near the venue. */
export type ListedHit = ListingCard & { id: string; km: number; phone: string; website: string };

/** The vendor directory: vendors who've signed up (public), and a vendor's own listing (signed in). */
export interface MyListing {
  listing: Listing & { email: string; hidden: boolean };
  enquiries: { id: string; name: string; email: string; phone: string; date: string; guests: number; message: string; read: boolean; at: string }[];
}
export const directoryApi = {
  browse: (p: { category?: string; region?: string; q?: string }) =>
    request<{ results: ListingCard[] }>(`/directory?${new URLSearchParams(Object.entries(p).filter(([, v]) => !!v) as [string, string][]).toString()}`),
  listing: (slug: string) => request<Listing>(`/directory/v/${encodeURIComponent(slug)}`),
  enquire: (slug: string, e: Enquiry) => send<{ ok: true }>('POST', `/directory/v/${encodeURIComponent(slug)}/enquire`, e),
  join: (f: ListingFields & { email: string; passcode: string; company: string }) => send<{ slug: string }>('POST', '/directory/join', f),
  mine: () => request<MyListing>('/a/vendor'),
  save: (f: ListingFields) => send<{ ok: true; slug: string }>('PUT', '/a/vendor', f),
  read: (id: string) => send<{ ok: true }>('POST', `/a/vendor/enquiries/${encodeURIComponent(id)}/read`),
};

export interface VendorHit {
  /** Its id in the shared vendor directory. */
  id?: string;
  /** How many weddings added it, and booked it. */
  added?: number;
  booked?: number;
  osm: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  km: number;
  lat: number;
  lon: number;
}
export interface PartyMember {
  personId: string;
  invitationId: string;
  name: string;
  role: string;
  side: Side;
  token: string | null;
  /** Their invitation's mobile ('' when there isn't one), for "Text it". */
  phone?: string;
}
export interface PartyData {
  slug: string;
  names: { p1: string; p2: string };
  roles: { role: string; side: Side }[];
  events: { key: string; name: string; startsAt: string }[];
  event: string | null;
  members: PartyMember[];
  runsheet: { data: PartyRunsheet; version: number } | null;
  checklist: { data: DayChecklist; version: number } | null;
  /** What the two sides are called ("Bride", "Groom" by default). */
  setup?: { data: PartySetup; version: number };
}
/** The planner: wedding party roles, its run sheet, the on-the-day checklists (versioned documents). */
export const plannerApi = {
  party: (wid: string, event?: string) => request<PartyData>(`${w(wid)}/planner/party${event ? `?event=${encodeURIComponent(event)}` : ''}`),
  setRole: (wid: string, personId: string, role: string) => send<{ ok: true; members: PartyMember[] }>('PUT', `${w(wid)}/planner/people/${personId}/role`, { role }),
  /** Someone new in the wedding party: they join the guest list too (invited to the wedding). */
  addMember: (wid: string, name: string, mobile: string, role: string) =>
    send<{ ok: true; personId: string; members: PartyMember[] }>('POST', `${w(wid)}/planner/people`, { name, mobile, role }),
  saveDoc: <T>(wid: string, kind: PlannerKind, scope: string, data: T, version: number) =>
    send<{ data: T; version: number }>('PUT', `${w(wid)}/planner/doc/${kind}${scope ? `/${encodeURIComponent(scope)}` : ''}`, data, version),
  aiStatus: (wid: string) => request<{ on: boolean; readsFiles: boolean }>(`${w(wid)}/planner/ask`),
  ask: (wid: string, question: string, history: { role: 'user' | 'assistant'; text: string }[]) => send<{ answer: string }>('POST', `${w(wid)}/planner/ask`, { question, history }),
  /** File a quote (PDF or photo, up to 1.5 MB). */
  uploadFile: async (wid: string, file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return send<{ id: string; name: string; where?: string }>('POST', `${w(wid)}/planner/files`, { name: file.name.slice(0, 160), type: file.type, data: btoa(bin) });
  },
  fileUrl: (wid: string, id: string) => `/api${w(wid)}/planner/files/${encodeURIComponent(id)}`,
  readQuote: (wid: string, id: string) =>
    send<{ amount: number; deposit: number; validUntil: string; date: string; includes: string; excludes: string; extract: string }>('POST', `${w(wid)}/planner/files/${encodeURIComponent(id)}/read`, {}),
  compare: (wid: string, vendorIds: string[]) => send<{ answer: string }>('POST', `${w(wid)}/planner/compare`, { vendorIds }),
  /** Whether quote requests can be emailed from the site (email is set up). */
  rfqEmail: (wid: string) => request<{ on: boolean }>(`${w(wid)}/planner/rfq/email`),
  /** Email a quote request (or a reminder) to these vendors, each with their own link. */
  sendRfq: (wid: string, id: string, vendorIds: string[], remind = false) => send<{ sent: string[]; skipped: string[] }>('POST', `${w(wid)}/planner/rfq/${encodeURIComponent(id)}/send`, { vendorIds, remind }),
  /** A per-event planning document (e.g. that event's shuttles). */
  docFor: <T>(wid: string, kind: PlannerKind, scope: string) => request<{ data: T; version: number }>(`${w(wid)}/planner/doc/${kind}/${encodeURIComponent(scope)}`),
  doc: <T>(wid: string, kind: PlannerKind) => request<{ data: T; version: number }>(`${w(wid)}/planner/doc/${kind}`),
  /** A vendor's own page (the details they need, always up to date). */
  vendorHub: (wid: string, vendorId: string) => request<{ url: string }>(`${w(wid)}/planner/vendors/${encodeURIComponent(vendorId)}/hub`),
  /** Vendors near the venue: those listed in the directory first, then (with `map`) places from the map. */
  searchVendors: (wid: string, category: string, km: number, map = false) =>
    request<{ venue: { event: string; lat: number; lon: number }; km: number; category: string; listed?: ListedHit[]; results: VendorHit[]; price?: { low: number; typical: number; high: number; weddings: number } | null }>(
      `${w(wid)}/planner/vendors/search?category=${encodeURIComponent(category)}&km=${km}&map=${map ? 1 : 0}`,
    ),
};

/** The shared album (guests see everyone's photos from their events, once switched on). */
export const albumApi = {
  get: (wid: string) => request<{ on: boolean }>(`${w(wid)}/album`),
  set: (wid: string, on: boolean) => send<{ on: boolean }>('PUT', `${w(wid)}/album`, { on }),
};

/** The live photo wall (a secret link to a full-screen slideshow). */
export const liveApi = {
  get: (wid: string) => request<{ on: boolean; code: string | null; slug: string }>(`${w(wid)}/live`),
  set: (wid: string, on: boolean) => send<{ on: boolean; code: string | null; slug: string }>('PUT', `${w(wid)}/live`, { on }),
};

export interface SongRow {
  id: string;
  title: string;
  artist: string;
  note: string;
  status: 'new' | 'must' | 'maybe' | 'no';
  at: string;
  by: string;
}
/** Song requests and the couple's own picks, for the DJ. */
export const songsApi = {
  list: (wid: string) => request<{ songs: SongRow[] }>(`${w(wid)}/songs`),
  add: (wid: string, title: string, artist: string, status: 'must' | 'maybe' | 'no') => send<{ songs: SongRow[] }>('POST', `${w(wid)}/songs`, { title, artist, status }),
  mark: (wid: string, id: string, status: SongRow['status']) => send<{ songs: SongRow[] }>('PATCH', `${w(wid)}/songs/${id}`, { status }),
  remove: (wid: string, id: string) => send<{ songs: SongRow[] }>('DELETE', `${w(wid)}/songs/${id}`),
};

/** Who has booked shuttle seats, by run. */
export const shuttlesApi = {
  bookings: (wid: string) => request<{ bookings: Record<string, { names: string; seats: number }[]> }>(`${w(wid)}/shuttles`),
};

export interface PhotoLooksCfg {
  frames?: string[];
  looks?: string[];
  def?: string;
}
export const photosApi = {
  list: (wid: string) => request<PhotosData>(`${w(wid)}/photos`),
  /** The table-card QR code for the photo page (/w/:slug/photos?t=<code>). */
  qr: (wid: string) => request<{ code: string }>(`${w(wid)}/photos/qr`),
  looks: (wid: string) => request<PhotoLooksCfg>(`${w(wid)}/photos/looks`),
  setLooks: (wid: string, cfg: Required<PhotoLooksCfg>) => send<PhotoLooksCfg>('PUT', `${w(wid)}/photos/looks`, cfg),
  remove: (wid: string, id: string) => send<{ ok: true }>('DELETE', `${w(wid)}/photos/${id}`),
  /** Add one photo to an event's album as the couple (sends the image itself; the header marks it as an upload). */
  upload: (wid: string, photo: Blob, by: string, event: string) =>
    request<{ ok: true; id: string; duplicate: boolean }>(`${w(wid)}/photos/upload${event ? `?event=${encodeURIComponent(event)}` : ''}`, {
      method: 'PUT',
      body: photo,
      headers: { 'content-type': photo.type || 'application/octet-stream', 'X-Photo-Upload': '1', 'X-Photo-By': encodeURIComponent(by) },
    }),
};

export interface ImportResult {
  added: number;
  wouldAdd: number;
  dry: boolean;
  skipped: { row: number; name: string; reason: string }[];
  problems: { row: number; name: string; reason: string }[];
}

// ---------------------------------------------------------------- Events

export interface EventQuestion {
  key: string;
  label: string;
  type: 'choice' | 'text';
  options?: string[];
}
export interface EventFull {
  id: string;
  key: string;
  name: string;
  pendingLabel: string;
  startsAt: string;
  venue: string;
  address: string;
  mapUrl: string;
  catered: boolean;
  hasSeating: boolean;
  questions: EventQuestion[];
  sort: number;
  version: number;
  invited: number;
  coming: number;
}
export type EventFields = Omit<EventFull, 'id' | 'key' | 'version' | 'invited' | 'coming'>;
export interface EventsData {
  timezone: string;
  events: EventFull[];
}

export const eventsApi = {
  list: (wid: string) => request<EventsData>(`${w(wid)}/events`),
  add: (wid: string, body: Partial<EventFields> & { name: string; startsAt: string; inviteEveryone?: boolean }) =>
    send<{ events: EventFull[]; added: string }>('POST', `${w(wid)}/events`, body),
  save: (wid: string, id: string, version: number, body: Partial<EventFields>) => send<{ events: EventFull[] }>('PUT', `${w(wid)}/events/${id}`, body, version),
  remove: (wid: string, id: string, version: number) => send<{ events: EventFull[] }>('DELETE', `${w(wid)}/events/${id}`, {}, version),
};

// ---------------------------------------------------------------- Messages

export interface MessageThread {
  invitationId: string;
  name: string;
  canText: boolean;
  last: { body: string; at: string; from: 'guest' | 'couple' };
  unread: number;
  kinds: string[];
}
export interface ThreadMessage {
  id: string;
  from: 'guest' | 'couple';
  body: string;
  at: string;
  via: 'page' | 'rsvp' | 'sms' | 'reply';
  kind: 'message' | 'support' | 'question';
  sentSms: boolean;
}
export interface Conversation {
  invitationId: string;
  name: string;
  canText: boolean;
  messages: ThreadMessage[];
}

export interface AdminBoardPost {
  id: string;
  parentId: string | null;
  invitationId: string | null;
  author: string;
  body: string;
  at: string;
  pinned: boolean;
  couple: boolean;
  status: 'shown' | 'pending' | 'hidden';
  likes: number;
  replies: AdminBoardPost[];
}
export interface AdminBoard {
  settings: { on: boolean; approve: boolean };
  pending: number;
  posts: AdminBoardPost[];
}
/** The message board on guests' pages: settings and moderation. */
export const boardApi = {
  get: (wid: string) => request<AdminBoard>(`${w(wid)}/board`),
  settings: (wid: string, on: boolean, approve: boolean) => send<AdminBoard>('PUT', `${w(wid)}/board/settings`, { on, approve }),
  post: (wid: string, body: string, parent?: string) => send<AdminBoard>('POST', `${w(wid)}/board`, { body, ...(parent ? { parent } : {}) }),
  update: (wid: string, id: string, change: { status?: 'shown' | 'hidden'; pinned?: boolean }) => send<AdminBoard>('PATCH', `${w(wid)}/board/${id}`, change),
  remove: (wid: string, id: string) => send<AdminBoard>('DELETE', `${w(wid)}/board/${id}`),
};

export interface InsightsData {
  /** The plan's tasks: by status, overdue and due soon, by person, done per week (12 Mondays), the next eight. */
  tasks: TaskTotals;
  events: { key: string; name: string; startsAt: string; venue: string; invited: number; yes: number; no: number; awaiting: number; people: number; seats: number }[];
  opened: { invitations: number; opened: number };
  repliesByDay: { day: string; n: number }[];
  groups: { group: string; invited: number; yes: number; no: number }[];
  texts: { sent: number; parts: number; failed: number };
  /** Each message: sent, arrived, failed, and guests who replied within three days of it. */
  byMessage: { name: string; sent: number; delivered: number; failed: number; replied: number }[];
  catering: { people: number; withNeeds: number; diets: [string, number][]; mains: [string, number][] };
  seating: { tables: number; seats: number; seated: number };
  shuttles: { runs: number; capacity: number; booked: number };
  rsvpClose: string;
  /** Still to reply to the wedding: when they opened it (null: not yet), whether they can be texted, the last text. */
  chase: { id: string; name: string; opened: string | null; phone: boolean; texted: string | null }[];
  guests: { photos: number; board: number; songs: number; emails: number; vendorEmails: number; guestEmails: number; party: number };
}
/** The day-of coordinator's private link. */
export const coordinatorApi = {
  get: (wid: string) => request<{ on: boolean; name: string; url: string }>(`${w(wid)}/coordinator`),
  set: (wid: string, body: { on: boolean; name?: string; fresh?: boolean }) => send<{ on: boolean; name: string; url: string }>('PUT', `${w(wid)}/coordinator`, body),
};
/** The plan as a private calendar link to subscribe to. */
export const plannerCalendarApi = {
  get: (wid: string) => request<{ url: string }>(`${w(wid)}/planner-calendar`),
  set: (wid: string, on: boolean) => send<{ url: string }>('PUT', `${w(wid)}/planner-calendar`, { on }),
};
/** The wedding party portal: each member's sign-in, what they can see and do, and resets. */
export type PartyPermKey = 'runsheet' | 'tasks' | 'addTasks' | 'sideTasks' | 'packing' | 'speeches' | 'people' | 'vendors' | 'guests' | 'seating';
export interface PortalMember {
  personId: string;
  name: string;
  role: string;
  side: string;
  hasMobile: boolean;
  paused: boolean;
  account: { status: 'invited' | 'active'; email: string; lastLogin: string | null; inviteExpires: string | null; locked: boolean } | null;
  perms: Record<PartyPermKey, boolean>;
}
export const partyAccountsApi = {
  list: (wid: string) => request<{ signIn: boolean; members: PortalMember[] }>(`${w(wid)}/party-accounts`),
  settings: (wid: string, signIn: boolean) => send<{ signIn: boolean }>('PUT', `${w(wid)}/party-accounts/settings`, { signIn }),
  invite: (wid: string, pid: string, email?: string) => send<{ link: string; expires: string; phone: string; emailed?: boolean; email?: string }>('POST', `${w(wid)}/party-accounts/${encodeURIComponent(pid)}/invite`, email ? { email } : {}),
  perms: (wid: string, pid: string, perms: Record<PartyPermKey, boolean>) => send<{ perms: Record<PartyPermKey, boolean> }>('PUT', `${w(wid)}/party-accounts/${encodeURIComponent(pid)}/perms`, { perms }),
  reset: (wid: string, pid: string) => send<{ link: string; phone: string; emailed?: boolean; email?: string }>('POST', `${w(wid)}/party-accounts/${encodeURIComponent(pid)}/reset`, {}),
  signOut: (wid: string, pid: string) => send<{ ok: true }>('POST', `${w(wid)}/party-accounts/${encodeURIComponent(pid)}/signout`, {}),
  remove: (wid: string, pid: string) => send<{ ok: true }>('DELETE', `${w(wid)}/party-accounts/${encodeURIComponent(pid)}`),
};
/** Payment reminders by text to the couple's own mobile (off until switched on). */
export interface PayReminders {
  on: boolean;
  days: number;
  hasMobile: boolean;
  costCents: number;
}
export const payRemindersApi = {
  get: (wid: string) => request<PayReminders>(`${w(wid)}/pay-reminders`),
  set: (wid: string, body: { on: boolean; days: number }) => send<PayReminders>('PUT', `${w(wid)}/pay-reminders`, body),
};
export const insightsApi = { get: (wid: string) => request<InsightsData>(`${w(wid)}/insights`) };

export interface InboxEmail {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  preview: string;
  kind: 'guest' | 'vendor' | 'other';
  invitationId: string | null;
  guest: string | null;
  vendorId: string | null;
  vendor: string | null;
  files: { id: string; name: string; type: string }[];
  /** The vendor a quote from it was filed under ('' when none). */
  filed: string;
  receivedAt: string;
  read: boolean;
}
/** The event's own email address: what arrived, sorted into guests, vendors and other. */
export const inboxApi = {
  list: (wid: string, archived = false) => request<{ address: string; emails: InboxEmail[] }>(`${w(wid)}/inbox${archived ? '?archived=1' : ''}`),
  get: (wid: string, id: string) => request<{ body: string }>(`${w(wid)}/inbox/${encodeURIComponent(id)}`),
  update: (wid: string, id: string, patch: { kind?: InboxEmail['kind']; vendorId?: string | null; archived?: boolean; read?: boolean }) =>
    send<{ ok: true }>('PUT', `${w(wid)}/inbox/${encodeURIComponent(id)}`, patch),
  file: (wid: string, id: string, vendorId: string, fileId: string) => send<{ ok: true }>('POST', `${w(wid)}/inbox/${encodeURIComponent(id)}/file`, { vendorId, fileId }),
  setAddress: (wid: string, address: string) => send<{ address: string }>('PUT', `${w(wid)}/inbox/settings/address`, { address }),
};

export const messagesApi = {
  list: (wid: string) => request<{ threads: MessageThread[] }>(`${w(wid)}/messages`),
  open: (wid: string, inv: string) => request<Conversation>(`${w(wid)}/messages/${inv}`),
  reply: (wid: string, inv: string, body: string, sms: boolean) => send<{ ok: true; sentSms: boolean; smsLater?: boolean; messages: ThreadMessage[] }>('POST', `${w(wid)}/messages/${inv}`, { body, sms }),
};

/** The company portal (super admins only). */
export interface CompanyStats {
  weddings: number;
  signups: { last7: number; last30: number; weekly: { weekOf: string; n: number }[] };
  plans: Record<string, number>;
  revenue: { total: number; thisMonth: number; payments: number };
  requests: number;
  guests: number;
  replies: number;
  directory: { listings: number; enquiries: number };
  quoteRequests: number;
  referrals: { ref: string; n: number; paid: number }[];
  optIns: number;
}
export interface CompanyWedding { id: string; slug: string; names: string; plan: string; createdAt: string; requested: string; extraEvents: number; ref: string; day: string; guests: number; email: string }
export interface CompanyListing { id: string; slug: string; name: string; category: string; region: string; email: string; hidden: boolean; created_at: string; enquiries: number }
export interface CompanySettings {
  social: { instagram: string; tiktok: string; facebook: string; pinterest: string; youtube: string };
  supportEmail: string;
  banner: { on: boolean; text: string; link: string };
  madeWith: boolean;
}
export interface CompanyPromo { code: string; percentOff: number; amountOffCents: number; plans: ('essentials' | 'complete' | 'event')[]; expires: string; maxUses: number; note: string; on: boolean; used: number }
export const companyApi = {
  stats: () => request<CompanyStats>('/a/company/stats'),
  weddings: (q: string, requests = false) => request<{ weddings: CompanyWedding[] }>(`/a/company/weddings?q=${encodeURIComponent(q)}${requests ? '&requests=1' : ''}`),
  setPlan: (slug: string, body: { plan?: 'free' | 'essentials' | 'complete'; extraEvents?: number }) => send<{ ok: true }>('PUT', `/a/company/weddings/${encodeURIComponent(slug)}/plan`, body),
  listings: () => request<{ listings: CompanyListing[] }>('/a/company/listings'),
  hideListing: (id: string, hidden: boolean) => send<{ ok: true }>('PUT', `/a/company/listings/${encodeURIComponent(id)}`, { hidden }),
  settings: () => request<CompanySettings>('/a/company/settings'),
  saveSettings: (s: CompanySettings) => send<CompanySettings>('PUT', '/a/company/settings', s),
  promos: () => request<{ codes: CompanyPromo[] }>('/a/company/promos'),
  savePromos: (codes: CompanyPromo[]) => send<{ codes: CompanyPromo[] }>('PUT', '/a/company/promos', { codes }),
  optInsUrl: '/api/a/company/optins.csv',
};

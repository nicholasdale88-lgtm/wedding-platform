import type { GuideContent, InvitationContent, TableShape } from '@wp/shared';
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
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    });
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
  wedding: { id: string; slug: string; name1: string; name2: string; monogram?: string; theme?: string; timezone: string; adminName: string };
  total: number;
  replied: number;
  awaiting: number;
  yesInv: number;
  noInv: number;
  seatsHeld: number;
  events: { key: string; name: string; startsAt: string; coming: number }[];
  diet: { people: number; serious: number; mealsSet: number };
  daysToGo: number | null;
  needsYou: { kind: string; title: string; detail: string; cta: string; link: string; event?: string }[];
  nextUp: { campaignId: string; name: string; sendAt: string }[];
  latest: { id: string; name: string; at: string; summary: string; message: string }[];
  nav: { guests: number; dietary: number; autopilot: number; smsLive: boolean; messages?: number };
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
  setMeal: (wid: string, personId: string, meal: { entree: string; main: string; dessert: string }) => send<{ ok: true }>('PUT', `${w(wid)}/people/${personId}/meal`, meal),
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
  add: (wid: string, name: string, audience: Audience, body?: string) => send<{ id: string }>('POST', `${w(wid)}/texts`, { name, audience, ...(body ? { body } : {}) }),
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
  get: (wid: string) => request<SettingsData>(`${w(wid)}/settings`),
  save: (wid: string, version: number, body: SettingsPut) => send<SettingsData>('PUT', `${w(wid)}/settings`, body, version),
  backupUrl: (wid: string) => `/api${w(wid)}/settings/backup`,
  changePasscode: (current: string, next: string) => send<{ ok: true }>('POST', '/a/auth/passcode', { current, next }),
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
  version: number;
  event: { key: string; name: string };
  events: { key: string; name: string }[];
  aspect: string;
  planImg: string;
  tables: SeatTable[];
  areas: SeatArea[];
  people: { id: string; invitationId: string; name: string; party: string; diet: string; meal: { e: string; m: string; d: string }; tableId: string | null; coming: boolean }[];
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
};

// ---------------------------------------------------------------- Photos

export interface PhotosData {
  enabled: boolean;
  items: { id: string; by: string; at: string; bytes: number; type: string; url: string; event?: string | null }[];
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
}
export interface PhotoLinks {
  siteStorage: boolean;
  redirectUri: string;
  providers: { key: PhotoLink['provider']; name: string; ready: boolean }[];
  links: PhotoLink[];
}
/** Linked photo storage: the couple's own Google Drive, Google Photos, Dropbox or OneDrive. */
export const photoLinksApi = {
  get: (wid: string) => request<PhotoLinks>(`${w(wid)}/photo-links`),
  connect: (wid: string, provider: PhotoLink['provider']) => send<{ url: string }>('POST', `${w(wid)}/photo-links/connect`, { provider }),
  remove: (wid: string, id: string) => send<{ ok: true }>('DELETE', `${w(wid)}/photo-links/${id}`),
  copyAll: (wid: string, id: string) => send<{ ok: true; queued: number }>('POST', `${w(wid)}/photo-links/${id}/copy-all`),
};

export const photosApi = {
  list: (wid: string) => request<PhotosData>(`${w(wid)}/photos`),
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

export const messagesApi = {
  list: (wid: string) => request<{ threads: MessageThread[] }>(`${w(wid)}/messages`),
  open: (wid: string, inv: string) => request<Conversation>(`${w(wid)}/messages/${inv}`),
  reply: (wid: string, inv: string, body: string, sms: boolean) => send<{ ok: true; sentSms: boolean; messages: ThreadMessage[] }>('POST', `${w(wid)}/messages/${inv}`, { body, sms }),
};

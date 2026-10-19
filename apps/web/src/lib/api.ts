import type { GuideContent, InvitationContent } from '@wp/shared';
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
  wedding: { id: string; slug: string; name1: string; name2: string; timezone: string; adminName: string };
  total: number;
  replied: number;
  awaiting: number;
  yesInv: number;
  noInv: number;
  seatsHeld: number;
  events: { key: string; name: string; startsAt: string; coming: number }[];
  diet: { people: number; serious: number; mealsSet: number };
  daysToGo: number | null;
  needsYou: { kind: string; title: string; detail: string; cta: string; link: string }[];
  nextUp: { campaignId: string; name: string; sendAt: string }[];
  latest: { id: string; name: string; at: string; summary: string; message: string }[];
  nav: { guests: number; dietary: number; autopilot: number; smsLive: boolean };
}

export interface GuestPatch {
  people?: string[];
  phone?: string | null;
  seatsHeld?: number;
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

  overview: (wid: string) => request<Overview>(`${w(wid)}/overview`),
  guests: (wid: string) => request<{ events: EventInfo[]; guests: Guest[] }>(`${w(wid)}/guests`),
  guest: (wid: string, id: string) => request<GuestDetail>(`${w(wid)}/guests/${id}`),
  addGuest: (wid: string) => send<GuestDetail>('POST', `${w(wid)}/guests`),
  patchGuest: (wid: string, g: Pick<Guest, 'id' | 'version'>, patch: GuestPatch) => send<GuestDetail>('PATCH', `${w(wid)}/guests/${g.id}`, patch, g.version),
  putRsvp: (wid: string, g: Pick<Guest, 'id' | 'version'>, body: RsvpPut) => send<GuestDetail>('PUT', `${w(wid)}/guests/${g.id}/rsvp`, body, g.version),
  removeGuest: (wid: string, id: string) => send<{ ok: true }>('DELETE', `${w(wid)}/guests/${id}`),
  restoreGuest: (wid: string, id: string) => send<GuestDetail>('POST', `${w(wid)}/guests/${id}/restore`),
  estimateOne: (wid: string, id: string, campaignId: string) =>
    send<{ count: number; parts: number; costCents: number; sample: string | null; quiet: boolean }>('POST', `${w(wid)}/guests/${id}/send?dry=1`, { campaignId }),
  setMeal: (wid: string, personId: string, meal: { entree: string; main: string; dessert: string }) => send<{ ok: true }>('PUT', `${w(wid)}/people/${personId}/meal`, meal),
  sendOne: (wid: string, id: string, campaignId: string) =>
    send<{ queued: number; sent: number; failed: number; stopped?: { reason: string; error: string } }>('POST', `${w(wid)}/guests/${id}/send`, { campaignId }),
};

// ---------------------------------------------------------------- Guest pages

export interface PagesData {
  version: number;
  slug: string;
  theme: string;
  events: { key: string; name: string }[];
  invitation: InvitationContent;
  guides: Record<string, GuideContent>;
  texts: Record<string, string>;
  samples: { token: string; label: string; invited: string[] }[];
}
export type PagesPut = Partial<{ theme: string; invitation: InvitationContent; guides: Record<string, GuideContent>; texts: Record<string, string> }>;

export const pagesApi = {
  get: (wid: string) => request<PagesData>(`${w(wid)}/pages`),
  save: (wid: string, version: number, body: PagesPut) => send<PagesData>('PUT', `${w(wid)}/pages`, body, version),
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
  add: (wid: string, name: string, audience: Audience) => send<{ id: string }>('POST', `${w(wid)}/texts`, { name, audience }),
  patch: (wid: string, c: Pick<Campaign, 'id' | 'version'>, patch: CampaignPatch) => send<{ ok: true; version: number }>('PATCH', `${w(wid)}/texts/${c.id}`, patch, c.version),
  remove: (wid: string, id: string) => send<{ ok: true }>('DELETE', `${w(wid)}/texts/${id}`),
  estimate: (wid: string, id: string, draft: Partial<{ body: string; audience: Audience; excluded: string[]; only: string[] }> = {}) =>
    send<Estimate>('POST', `${w(wid)}/texts/${id}/estimate`, draft),
  sendNow: (wid: string, id: string, only?: string[]) => send<SendResult>('POST', `${w(wid)}/texts/${id}/send`, only ? { only } : {}),
  test: (wid: string, body: string) => send<SendResult>('POST', `${w(wid)}/texts/test`, { body }),
};

// ---------------------------------------------------------------- SMS setup

export interface SettingsData {
  version: number;
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
  plan: { name: string; detail: string; costCents: number; auto: boolean }[];
  planTotalCents: number;
}
export type SettingsPut = Partial<Omit<SettingsData, 'version' | 'live' | 'timezone' | 'plan' | 'planTotalCents' | 'replies'> & { replies: Partial<SettingsData['replies']> }>;

export const settingsApi = {
  get: (wid: string) => request<SettingsData>(`${w(wid)}/settings`),
  save: (wid: string, version: number, body: SettingsPut) => send<SettingsData>('PUT', `${w(wid)}/settings`, body, version),
  backupUrl: (wid: string) => `/api${w(wid)}/settings/backup`,
  changePasscode: (current: string, next: string) => send<{ ok: true }>('POST', '/a/auth/passcode', { current, next }),
};

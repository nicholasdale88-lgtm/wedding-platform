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

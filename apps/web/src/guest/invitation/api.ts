/** Guest API: the invitation, the night-before guides and the photo page. */
import type { DayoutGuide, Forecast, ReceptionGuide, TableShape, TimelineItem } from '@wp/shared';

export interface GuestInvitation {
  token: string;
  people: { idx: number; name: string; diet: string }[];
  seatsHeld: number;
  invited: string[];
  rsvp: Record<string, { attending: boolean | null; count: number; answers: Record<string, string> }>;
  message: string;
  repliedAt: string | null;
  /** Someone on this invitation is in the wedding party (they have a run sheet of their own). */
  party?: boolean;
}

export interface InvitePayload {
  wedding: { slug: string; name1: string; name2: string; monogram: string; theme: string; timezone: string };
  content: {
    initials?: string; rsvpBy?: string; rideTime?: string; directionsUrl?: string; registryUrl?: string; giftAccount?: string;
    giftAccountLabel?: string; audioUrl?: string; rsvpEmail?: string; seal?: 'Sandstone' | 'Dusty rose' | 'Daphne blue';
    images?: Record<string, string>;
    hidden?: Record<string, boolean>;
    lists?: Record<string, { q: string; a: string[] }[]>;
    timeline?: TimelineItem[];
    timelines?: Record<string, TimelineItem[]>;
  };
  texts: Record<string, string>;
  events: { key: string; name: string; startsAt: string; slot: number; questions: { key: string; label: string; type: string; options?: string[] }[] }[];
  invitation: GuestInvitation | null;
}

export interface RsvpBody {
  token: string;
  events: Record<string, { attending: boolean; answers?: Record<string, string> }>;
  count: number;
  diet: string;
  message: string;
}

export interface GuidePayload {
  wedding: { slug: string; name1: string; name2: string; monogram: string; theme: string; timezone: string };
  images: Record<string, string>;
  event: { key: string; name: string; startsAt: string; slot: number };
  guide: ReceptionGuide | DayoutGuide;
  texts: Record<string, string>;
  guest: {
    token: string;
    people: { idx: number; name: string; diet: string; tableId: string | null; meals: { e: string; m: string; d: string } }[];
    attending: boolean | null;
    answers: Record<string, string>;
  };
  seating: {
    aspect: string;
    planImg: string;
    tables: { id: string; name: string; shape: TableShape; dir: 'h' | 'v'; len: number; x: number; y: number }[];
    features: { label: string; x: number; y: number; w: number; h: number }[];
  } | null;
  mates: Record<string, string[]>;
  weather: Forecast | null;
  photoUrl: string;
}

export interface PhotoEvent {
  key: string;
  name: string;
  startsAt: string;
  slot: number;
}
export interface PhotoPagePayload {
  wedding: { slug: string; name1: string; name2: string; theme: string; monogram?: string; timezone?: string };
  /** Every event (each has its own album); `event` is the one this page is for, if the link names one. */
  events?: PhotoEvent[];
  event?: PhotoEvent | null;
  images: Record<string, string>;
  name: string;
  linked: boolean;
  open: boolean;
  texts: Record<string, string>;
}

export class GuestApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined });
  const body = (await res.json().catch(() => null)) as (T & { error?: { message: string } }) | null;
  if (!res.ok) throw new GuestApiError(res.status, body?.error?.message ?? 'Something went wrong.');
  return body as T;
}

export const guestApi = {
  invite: (slug: string, token: string | null, preview: boolean) =>
    call<InvitePayload>(`/p/${encodeURIComponent(slug)}/invite${token ? `?g=${encodeURIComponent(token)}${preview ? '&preview=1' : ''}` : ''}`),
  /** Finds a guest by name; their link is texted to their own mobile (never shown here). */
  find: (slug: string, name: string) => call<{ found: true; texted: boolean; ending?: string }>(`/p/${encodeURIComponent(slug)}/find`, { method: 'POST', body: JSON.stringify({ name }) }),
  rsvp: (slug: string, body: RsvpBody) => call<{ ok: true; invitation: GuestInvitation }>(`/p/${encodeURIComponent(slug)}/rsvp`, { method: 'POST', body: JSON.stringify(body) }),
  guide: (slug: string, token: string, event?: string, preview = false, share = '') =>
    call<GuidePayload>(
      `/p/${encodeURIComponent(slug)}/guide?g=${encodeURIComponent(token)}${event ? `&event=${encodeURIComponent(event)}` : ''}${preview ? '&preview=1' : ''}${share ? `&share=${encodeURIComponent(share)}` : ''}`,
    ),
  photos: (slug: string, token: string, event = '') =>
    call<PhotoPagePayload>(`/p/${encodeURIComponent(slug)}/photos?g=${encodeURIComponent(token)}${event ? `&event=${encodeURIComponent(event)}` : ''}`),
  /** Their conversation with the couple (needs their own link). */
  messages: (slug: string, token: string) =>
    call<{ couple: string; messages: { id: string; from: 'guest' | 'couple'; kind: string; body: string; at: string }[] }>(`/p/${encodeURIComponent(slug)}/messages?g=${encodeURIComponent(token)}`),
  /** A wedding party member's own run sheet (needs their own link). */
  party: (slug: string, token: string) => call<PartyPayload>(`/p/${encodeURIComponent(slug)}/party?g=${encodeURIComponent(token)}`),
  /** The message board (a public wall; needs their own link). */
  board: (slug: string, token: string) => call<BoardPayload>(`/p/${encodeURIComponent(slug)}/board?g=${encodeURIComponent(token)}`),
  boardPost: (slug: string, token: string, body: string, parent?: string) =>
    call<{ ok: true; pending: boolean }>(`/p/${encodeURIComponent(slug)}/board`, { method: 'POST', body: JSON.stringify({ token, body, ...(parent ? { parent } : {}) }) }),
  boardLike: (slug: string, token: string, id: string) =>
    call<{ liked: boolean; likes: number }>(`/p/${encodeURIComponent(slug)}/board/${encodeURIComponent(id)}/like`, { method: 'POST', body: JSON.stringify({ token }) }),
  boardRemove: (slug: string, token: string, id: string) =>
    call<{ ok: true }>(`/p/${encodeURIComponent(slug)}/board/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ token }) }),
  sendMessage: (slug: string, token: string, body: string, kind: 'message' | 'support' | 'question') =>
    call<{ ok: true }>(`/p/${encodeURIComponent(slug)}/messages`, { method: 'POST', body: JSON.stringify({ token, body, kind }) }),
  /** One photo, into an event's album; the server checks it really is one. */
  uploadPhoto: async (slug: string, token: string, by: string, photo: Blob, event = '') => {
    const res = await fetch(`/api/p/${encodeURIComponent(slug)}/photos?g=${encodeURIComponent(token)}${event ? `&event=${encodeURIComponent(event)}` : ''}`, {
      method: 'PUT',
      headers: { 'content-type': photo.type || 'image/jpeg', 'X-Photo-By': encodeURIComponent(by) },
      body: photo,
    });
    if (!res.ok) throw new GuestApiError(res.status, ((await res.json().catch(() => null)) as { error?: { message: string } } | null)?.error?.message ?? 'Upload failed');
  },
};

export interface BoardPost {
  id: string;
  parentId: string | null;
  author: string;
  body: string;
  at: string;
  pinned: boolean;
  couple: boolean;
  mine: boolean;
  pending: boolean;
  likes: number;
  liked: boolean;
  replies: BoardPost[];
}
export interface PartyPayload {
  couple: string;
  names: { p1: string; p2: string };
  theme: string;
  me: { name: string; role: string }[];
  /** What the two sides are called ("Bride", "Groom" by default). */
  sides?: { p1: string; p2: string };
  party: { name: string; role: string; side: 'p1' | 'p2' | '' }[];
  events: {
    key: string;
    name: string;
    startsAt: string;
    note: string;
    items: { time: string; until: string; title: string; detail: string; place: string; who: string[] }[];
    packing?: { text: string; who: string[] }[];
  }[];
}
export interface BoardPayload {
  on: boolean;
  approve: boolean;
  couple: string;
  me: string;
  posts: BoardPost[];
}

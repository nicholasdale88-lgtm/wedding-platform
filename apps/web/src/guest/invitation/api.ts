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
    custom?: { paper?: string; ink?: string; accent?: string; soft?: string; envelope?: string; names?: 'script' | 'caps' | 'vibes' | 'parisienne' | 'playfair' };
    images?: Record<string, string>;
    hidden?: Record<string, boolean>;
    lists?: Record<string, { q: string; a: string[] }[]>;
    timeline?: TimelineItem[];
    timelines?: Record<string, TimelineItem[]>;
  };
  texts: Record<string, string>;
  events: { key: string; name: string; startsAt: string; slot: number; questions: { key: string; label: string; type: string; options?: string[] }[]; shuttles?: boolean }[];
  invitation: GuestInvitation | null;
  /** "Who's who" in the wedding party, when the couple shows it (side '' is neither side). */
  party?: { sides: { p1: string; p2: string }; people: { name: string; role: string; side: 'p1' | 'p2' | '' }[] } | null;
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
  /** The couple has shared the album (everyone's photos). */
  album?: boolean;
  /** The frames and looks the couple offers, and the look to start on (all of them when not set). */
  looks?: { frames?: string[]; looks?: string[]; def?: string } | null;
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
  /** A party member ticks or adds their own things (saved with the couple's plan). */
  partyAct: (slug: string, body: PartyAct) => call<{ ok: true }>(`/p/${encodeURIComponent(slug)}/party`, { method: 'POST', body: JSON.stringify(body) }),
  /** Shuttle runs for their events, seats left, and theirs. */
  shuttles: (slug: string, token: string) => call<ShuttlePayload>(`/p/${encodeURIComponent(slug)}/shuttles?g=${encodeURIComponent(token)}`),
  bookShuttle: (slug: string, token: string, shuttleId: string, seats: number) =>
    call<ShuttlePayload>(`/p/${encodeURIComponent(slug)}/shuttles`, { method: 'POST', body: JSON.stringify({ token, shuttleId, seats }) }),
  /** Ask for a song (the couple passes requests to the DJ). */
  requestSong: (slug: string, token: string, title: string, artist: string) =>
    call<{ ok: true }>(`/p/${encodeURIComponent(slug)}/songs`, { method: 'POST', body: JSON.stringify({ token, title, artist }) }),
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
  uploadPhoto: async (slug: string, token: string, by: string, photo: Blob, event = '', look = '') => {
    const res = await fetch(`/api/p/${encodeURIComponent(slug)}/photos?g=${encodeURIComponent(token)}${event ? `&event=${encodeURIComponent(event)}` : ''}`, {
      method: 'PUT',
      // A video keeps its look as a setting (shown when it plays); a photo has it drawn in already.
      headers: { 'content-type': photo.type || 'image/jpeg', 'X-Photo-By': encodeURIComponent(by), ...(look ? { 'X-Photo-Look': look } : {}) },
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
export interface ShuttlePayload {
  party: number;
  events: { key: string; name: string; startsAt: string; runs: { id: string; time: string; from: string; to: string; note: string; left: number; mine: number }[] }[];
}
export interface PartyAct {
  token: string;
  personId: string;
  action: 'task' | 'add-task' | 'remove-task' | 'packed' | 'add-pack' | 'own-pack' | 'remove-pack';
  id?: string;
  text?: string;
  done?: boolean;
}
export interface PartyMine {
  personId: string;
  name: string;
  role: string;
  tasks: { id: string; text: string; due: string; done: boolean; mine: boolean }[];
  packed: string[];
  pack: { text: string; done: boolean }[];
}

export interface PartyPayload {
  /** Each member on this link: their to-dos and what they've packed. */
  mine?: PartyMine[];
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
    /** The speaking order, and what this member holds on the day. */
    speeches?: { who: string; minutes: number }[];
    holding?: string[];
  }[];
}
export interface BoardPayload {
  on: boolean;
  /** The wedding's theme (the board's colours come with it: no second request). */
  theme?: string;
  approve: boolean;
  couple: string;
  me: string;
  posts: BoardPost[];
}

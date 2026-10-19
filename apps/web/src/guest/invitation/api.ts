/** Guest API: the invitation, the night-before guides and the photo page. */
import type { DayoutGuide, Forecast, ReceptionGuide, TableShape } from '@wp/shared';

export interface GuestInvitation {
  token: string;
  people: { idx: number; name: string; diet: string }[];
  seatsHeld: number;
  invited: string[];
  rsvp: Record<string, { attending: boolean | null; count: number; answers: Record<string, string> }>;
  message: string;
  repliedAt: string | null;
}

export interface InvitePayload {
  wedding: { slug: string; name1: string; name2: string; monogram: string; theme: string; timezone: string };
  content: {
    initials?: string; rsvpBy?: string; rideTime?: string; directionsUrl?: string; registryUrl?: string; giftAccount?: string;
    giftAccountLabel?: string; audioUrl?: string; rsvpEmail?: string; seal?: 'Sandstone' | 'Dusty rose' | 'Daphne blue';
    images?: Record<string, string>;
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

export interface PhotoPagePayload {
  wedding: { slug: string; name1: string; name2: string; theme: string };
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
  find: (slug: string, name: string) => call<InvitePayload>(`/p/${encodeURIComponent(slug)}/find`, { method: 'POST', body: JSON.stringify({ name }) }),
  rsvp: (slug: string, body: RsvpBody) => call<{ ok: true; invitation: GuestInvitation }>(`/p/${encodeURIComponent(slug)}/rsvp`, { method: 'POST', body: JSON.stringify(body) }),
  guide: (slug: string, token: string, event?: string) =>
    call<GuidePayload>(`/p/${encodeURIComponent(slug)}/guide?g=${encodeURIComponent(token)}${event ? `&event=${encodeURIComponent(event)}` : ''}`),
  photos: (slug: string, token: string) => call<PhotoPagePayload>(`/p/${encodeURIComponent(slug)}/photos?g=${encodeURIComponent(token)}`),
  /** One photo; the server checks it really is one. */
  uploadPhoto: async (slug: string, token: string, by: string, photo: Blob) => {
    const res = await fetch(`/api/p/${encodeURIComponent(slug)}/photos?g=${encodeURIComponent(token)}`, {
      method: 'PUT',
      headers: { 'content-type': photo.type || 'image/jpeg', 'X-Photo-By': encodeURIComponent(by) },
      body: photo,
    });
    if (!res.ok) throw new GuestApiError(res.status, ((await res.json().catch(() => null)) as { error?: { message: string } } | null)?.error?.message ?? 'Upload failed');
  },
};

/** Guest API for the invitation page. */

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
};

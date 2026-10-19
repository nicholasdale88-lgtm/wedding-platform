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

export type Role = 'owner' | 'editor' | 'viewer';
export interface Me {
  user: { id: string; email: string; superAdmin: boolean };
  weddings: { id: string; slug: string; name1: string; name2: string; role: Role }[];
}

export const api = {
  me: () => request<Me>('/a/me'),
  login: (email: string, passcode: string) => request<Me>('/a/auth/login', { method: 'POST', body: JSON.stringify({ email, passcode }) }),
  logout: () => request<{ ok: true }>('/a/auth/logout', { method: 'POST', body: '{}' }),
};

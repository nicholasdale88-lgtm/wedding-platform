/** Small per-device conveniences. Storage can be blocked (private mode), so every access is guarded. */

const KEY = 'wp-admin-last';

interface Last {
  email: string;
  /** "Sophie & Nicholas": the name shown on the sign-in screen next time. */
  name: string;
}

export function readLast(): Last | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Last> | null;
    return v && typeof v.email === 'string' && typeof v.name === 'string' ? { email: v.email, name: v.name } : null;
  } catch {
    return null;
  }
}

export function writeLast(v: Last): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* not essential */
  }
}

const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;
export const coupleName = (w: { name1: string; name2: string }) => `${first(w.name1)} & ${first(w.name2)}`;

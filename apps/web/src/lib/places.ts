import type { Me } from './api';
import { coupleName } from './remember';

/**
 * Everywhere one account can go, from one sign-in: each wedding it helps run, the company portal (for the
 * people who run the site) and a vendor's own listing. The profile screen lists them; the switcher in each
 * header moves between them.
 */
export interface Place {
  key: string;
  kind: 'wedding' | 'company' | 'vendor';
  title: string;
  detail: string;
  to: string;
}

const ROLE: Record<string, string> = { owner: 'You run it', editor: 'You can edit', viewer: 'You can view' };

export function placesOf(me: Me): Place[] {
  const out: Place[] = me.weddings.map((w) => ({ key: `w:${w.id}`, kind: 'wedding', title: coupleName(w), detail: `Wedding admin · ${ROLE[w.role] ?? w.role}`, to: `/admin/${w.id}` }));
  if (me.user.superAdmin) out.push({ key: 'company', kind: 'company', title: 'Company portal', detail: 'Sign-ups, plans and money, promotions, the vendor directory', to: '/company' });
  if (me.vendor) out.push({ key: 'vendor', kind: 'vendor', title: me.vendor.name, detail: 'Your vendor listing and enquiries', to: '/vendors/me' });
  return out;
}

const KEY = 'wp-place';
/** The place last chosen on this device (opened straight after signing in next time). */
export function lastPlace(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
export function rememberPlace(key: string): void {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* not essential */
  }
}

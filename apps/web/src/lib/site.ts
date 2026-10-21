import { cleanRef } from '@wp/shared';
import { useEffect, useState } from 'react';

/**
 * The company's public settings (set in the company portal): social links, the front-page banner, and
 * whether guest pages carry the small "Made with" link. Fetched once per visit.
 */
export interface Site {
  social: { instagram: string; tiktok: string; facebook: string; pinterest: string; youtube: string };
  supportEmail: string;
  banner: { text: string; link: string } | null;
  madeWith: boolean;
}
let cache: Promise<Site | null> | null = null;
export function useSite() {
  const [site, setSite] = useState<Site | null>(null);
  useEffect(() => {
    cache ??= fetch('/api/site')
      .then((r) => (r.ok ? (r.json() as Promise<Site>) : null))
      .catch(() => null);
    let live = true;
    void cache.then((s) => live && setSite(s));
    return () => {
      live = false;
    };
  }, []);
  return site;
}

const KEY = 'yl.ref';
/** Where this visitor came from (?ref= from a wedding's "Made with" link or a post, else ?utm_source=), kept for sign-up. */
export function rememberRef() {
  try {
    const p = new URLSearchParams(window.location.search);
    const ref = cleanRef(p.get('ref') || p.get('utm_source'));
    if (ref) localStorage.setItem(KEY, ref);
  } catch {
    /* private browsing: no referral, no harm */
  }
}
export function savedRef() {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

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
  /** GST registered (company portal → Money): prices say "GST included". Until then they say none is charged. */
  gst?: boolean;
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
    // A vendor's partner code (?code=, on the link they give their couples): filled in when the couple upgrades.
    const code = cleanCode(p.get('code'));
    if (code) localStorage.setItem(CODE_KEY, code);
  } catch {
    /* private browsing: no referral, no harm */
  }
}
const CODE_KEY = 'yl.code';
/** A promo code as typed on a link: letters and digits, upper case. */
export const cleanCode = (s: string | null | undefined) => (s ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
/** The partner code this visitor arrived with ('' none). */
export function savedCode() {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
}
export function savedRef() {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

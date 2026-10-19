import { fillTags, type Forecast } from '@wp/shared';
import { useEffect, useState } from 'react';
import { url } from '../sx';

/** Shared by both night-before guides. */

export const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;

/** "Ann", "Ann & Bob", "Ann, Bob & Cy" (joiner from the catalogue). */
export const joinNames = (xs: string[], and: string) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`;

/** Phone numbers dial; an email address in a phone field opens mail. */
export const contactHref = (phone: string) => (/@/.test(phone) ? `mailto:${phone.trim()}` : `tel:${phone.replace(/[^\d+]/g, '')}`);

/** A catalogue sentence with its {tags} filled. */
export const say = (t: (k: string) => string) => (key: string, vars: Record<string, string | number> = {}) => fillTags(t(key), vars);

/** Sections fade up as they scroll in (design: data-reveal, threshold .15, after 300 ms). */
export function useReveal(): Record<string, 1> {
  const [rv, setRv] = useState<Record<string, 1>>({});
  useEffect(() => {
    let io: IntersectionObserver | undefined;
    const timer = setTimeout(() => {
      const els = document.querySelectorAll('[data-reveal]');
      if (typeof IntersectionObserver === 'undefined') {
        const all: Record<string, 1> = {};
        els.forEach((el) => (all[el.getAttribute('data-reveal')!] = 1));
        return setRv(all);
      }
      io = new IntersectionObserver(
        (entries) => {
          const add: Record<string, 1> = {};
          for (const x of entries) {
            if (!x.isIntersecting) continue;
            add[x.target.getAttribute('data-reveal')!] = 1;
            io!.unobserve(x.target);
          }
          if (Object.keys(add).length) setRv((s) => ({ ...s, ...add }));
        },
        { threshold: 0.15 },
      );
      els.forEach((el) => io!.observe(el));
    }, 300);
    return () => {
      clearTimeout(timer);
      io?.disconnect();
    };
  }, []);
  return rv;
}

/** YouTube / Google Drive links play in a frame; anything else as a file. */
export function videoOf(link: string | undefined) {
  const v = String(link ?? '').trim();
  const yt = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/.exec(v);
  const dr = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(v);
  const src = yt ? `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&playsinline=1` : dr ? `https://drive.google.com/file/d/${dr[1]}/preview` : v;
  const frame = !!(yt || dr);
  return { vidSrc: src, vidIsFrame: frame && !!src, vidIsFile: !frame && !!src };
}

/** "Updated 3:05pm" in the wedding's timezone. */
export function updatedAt(w: Forecast | null, tz: string) {
  if (!w) return '';
  return new Date(w.updated).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: tz }).replace(/\s/g, '').toLowerCase();
}

export function setPageClass(page: string) {
  document.documentElement.classList.add(`pg-${page}`);
  return () => document.documentElement.classList.remove(`pg-${page}`);
}

/** An editable image link going inside CSS url('…'): safe scheme, and nothing that could close the quote. */
export const cssUrl = (u: string | undefined) => (url(u) ?? '').replace(/['"()\\\s]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

/**
 * The design's own photos (v.asset('lookout.jpg')): the wedding's uploaded picture for that slot
 * ("lookout"), else the design's default.
 */
export const assetOf = (images: Record<string, string> | undefined) => (name: string) =>
  cssUrl(images?.[name.replace(/\.\w+$/, '')] || `/seed-media/${name}`);

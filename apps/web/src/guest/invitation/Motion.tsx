import type { Motion } from '@wp/shared';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Look } from '../themeKit';

/**
 * Moving scenes over the opening of the invitation (falling petals, drifting leaves, fairy lights, gold
 * sparkle, confetti, snow, sunlight shimmer), all drawn here, plus the couple's own film behind their names.
 * Placed into the welcome section once it's on the page. Still for anyone who prefers reduced motion.
 */
const LOOK_MOTION: Record<Look, Exclude<Motion, 'auto'>> = { classic: 'none', romantic: 'petals', garden: 'leaves', coastal: 'shimmer', luxe: 'sparkle', modern: 'none' };

/** A Dropbox share link plays as a file (?raw=1); other links are used as given. */
export const filmSrc = (url: string) => (/dropbox\.com/.test(url) ? url.replace(/([?&])dl=0/, '$1raw=1').replace(/^(?!.*[?&]raw=1)(.*)$/, (m) => (m.includes('?') ? `${m}&raw=1` : `${m}?raw=1`)) : url);

const CSS = `
.yl-motion { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3; }
.yl-motion i { position: absolute; display: block; will-change: transform, opacity; }
@keyframes yl-fall { 0% { transform: translate3d(0,-10vh,0) rotate(0deg) rotateX(0deg); opacity: 0 } 10% { opacity: .95 } 50% { transform: translate3d(calc(var(--dx) * .35),50vh,0) rotate(calc(var(--rot) * .5)) rotateX(var(--fx)) } 90% { opacity: .9 } 100% { transform: translate3d(var(--dx),110vh,0) rotate(var(--rot)) rotateX(calc(var(--fx) * 2)); opacity: 0 } }
@keyframes yl-twinkle { 0%,100% { opacity: .15; transform: scale(.6) } 50% { opacity: 1; transform: scale(1) } }
@keyframes yl-shimmer { 0% { transform: translateX(-60%) rotate(18deg); opacity: 0 } 30% { opacity: .55 } 70% { opacity: .35 } 100% { transform: translateX(160%) rotate(18deg); opacity: 0 } }
.yl-m-fall { top: 0; animation: yl-fall var(--t) linear var(--d) infinite; }
/* Petals and leaves: real shapes (three of each, our own), shaded, fluttering as they fall (they turn over in 3D: transform only). Colours can be set per invitation (--yl-p1/--yl-p2, --yl-l1/--yl-l2). */
.yl-m-petals i { width: var(--s); height: var(--s); background: radial-gradient(circle at 34% 28%, var(--yl-p1, #fde8e6), var(--yl-p2, #e6a9ad) 78%); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M20 3C31 7 38 19 34 30C31 37 23 39 20 35C17 39 9 37 6 30C2 19 9 7 20 3Z'/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M20 3C31 7 38 19 34 30C31 37 23 39 20 35C17 39 9 37 6 30C2 19 9 7 20 3Z'/%3E%3C/svg%3E") center / contain no-repeat; }
.yl-m-petals i:nth-child(3n+2) { -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M20 1C33 10 35 28 20 39C5 28 7 10 20 1Z'/%3E%3C/svg%3E"); mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M20 1C33 10 35 28 20 39C5 28 7 10 20 1Z'/%3E%3C/svg%3E"); }
.yl-m-petals i:nth-child(3n) { -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M8 6C20 0 36 8 36 22C36 32 28 38 18 36C24 30 24 20 16 16C12 14 8 12 8 6Z'/%3E%3C/svg%3E"); mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M8 6C20 0 36 8 36 22C36 32 28 38 18 36C24 30 24 20 16 16C12 14 8 12 8 6Z'/%3E%3C/svg%3E"); }
.yl-m-leaves i { width: var(--s); height: var(--s); background: linear-gradient(135deg, var(--yl-l1, #b3c49a), var(--yl-l2, #6a7d51)); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M20 2C31 2 38 11 38 20C38 30 30 38 20 38C10 38 2 30 2 20C2 11 9 2 20 2ZM19 38L19 40L21 40L21 38Z'/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M20 2C31 2 38 11 38 20C38 30 30 38 20 38C10 38 2 30 2 20C2 11 9 2 20 2ZM19 38L19 40L21 40L21 38Z'/%3E%3C/svg%3E") center / contain no-repeat; }
.yl-m-leaves i:nth-child(3n+2) { -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M2 20C10 9 26 7 38 20C26 31 10 30 2 20Z'/%3E%3C/svg%3E"); mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M2 20C10 9 26 7 38 20C26 31 10 30 2 20Z'/%3E%3C/svg%3E"); }
.yl-m-leaves i:nth-child(3n) { -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M20 2C26 8 28 16 20 22C12 16 14 8 20 2ZM8 18C15 18 20 24 19 32C11 31 6 25 8 18ZM32 18C34 25 29 31 21 32C20 24 25 18 32 18Z'/%3E%3C/svg%3E"); mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M20 2C26 8 28 16 20 22C12 16 14 8 20 2ZM8 18C15 18 20 24 19 32C11 31 6 25 8 18ZM32 18C34 25 29 31 21 32C20 24 25 18 32 18Z'/%3E%3C/svg%3E"); }
.yl-m-confetti i { width: calc(var(--s) * .5); height: calc(var(--s) * .9); border-radius: 2px; background: var(--c); }
.yl-m-snow i { width: calc(var(--s) * .5); height: calc(var(--s) * .5); border-radius: 50%; background: rgba(255,255,255,.95); box-shadow: 0 0 6px rgba(255,255,255,.8); }
.yl-m-twinkle { animation: yl-twinkle var(--t) ease-in-out var(--d) infinite; }
.yl-m-lights i { width: calc(var(--s) * .55); height: calc(var(--s) * .55); border-radius: 50%; background: radial-gradient(circle, #fff6d8 0%, #ffd27a 45%, rgba(255,200,110,0) 72%); }
.yl-m-sparkle i { width: var(--s); height: var(--s); background: #e6cf9e; clip-path: polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%); }
.yl-m-shimmer i { top: -20%; width: 28%; height: 140%; background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.45), rgba(255,255,255,0)); animation: yl-shimmer var(--t) ease-in-out var(--d) infinite; }
.yl-film-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; pointer-events: none; }
.yl-has-film > div:first-child { opacity: .6; }
@media (prefers-reduced-motion: reduce) { .yl-motion { display: none } .yl-film-video { display: none } .yl-has-film > div:first-child { opacity: 1 } }
`;

const CONFETTI = ['#e6cf9e', '#b39563', '#a7b88f', '#e9b8b5', '#fbf8f2'];

function Pieces({ kind }: { kind: Exclude<Motion, 'auto' | 'none'> }) {
  const falling = kind === 'petals' || kind === 'leaves' || kind === 'confetti' || kind === 'snow';
  const n = kind === 'shimmer' ? 3 : kind === 'lights' ? 26 : kind === 'sparkle' ? 18 : kind === 'snow' ? 34 : 18;
  return (
    <div className={`yl-motion yl-m-${kind}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        // Spread out, but the same every time (no jumping about on re-render).
        const r = (k: number) => ((Math.sin((i + 1) * 9301 + k * 49297) + 1) / 2) % 1;
        const left = `${(r(1) * 100).toFixed(1)}%`;
        const style: Record<string, string> = {
          left,
          '--s': `${Math.round((kind === 'snow' ? 8 : 12) + r(2) * (kind === 'confetti' ? 10 : 12))}px`,
          '--t': `${(falling ? 9 + r(3) * 8 : kind === 'shimmer' ? 7 + i * 2 : 2.4 + r(3) * 3).toFixed(2)}s`,
          '--d': `${(-r(4) * (falling ? 16 : 6)).toFixed(2)}s`,
          '--dx': `${Math.round((r(5) - 0.5) * 140)}px`,
          '--rot': `${Math.round(180 + r(6) * 540)}deg`,
          // The flutter: how far it turns over on its way down.
          '--fx': `${Math.round(240 + r(8) * 420)}deg`,
          '--c': CONFETTI[i % CONFETTI.length]!,
        };
        if (!falling && kind !== 'shimmer') style.top = kind === 'lights' ? `${(4 + r(7) * 22).toFixed(1)}%` : `${(r(7) * 90).toFixed(1)}%`;
        return <i key={i} className={falling ? 'yl-m-fall' : kind === 'shimmer' ? '' : 'yl-m-twinkle'} style={style as React.CSSProperties} />;
      })}
    </div>
  );
}

/** The scene (and film) for this invitation, placed into its welcome section. */
export function MotionPortal({ motion, film, look }: { motion?: Motion; film?: string; look: Look }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let timer = 0;
    const find = () => {
      const el = document.querySelector<HTMLElement>('#inv-scroll section[data-screen-label="01 Welcome"]');
      if (el) setHost(el);
      else timer = window.setTimeout(find, 250);
    };
    find();
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!host) return;
    host.classList.toggle('yl-has-film', !!film);
    return () => host.classList.remove('yl-has-film');
  }, [host, film]);
  const kind = motion && motion !== 'auto' ? motion : LOOK_MOTION[look];
  if (!host || (kind === 'none' && !film)) return null;
  return createPortal(
    <>
      <style>{CSS}</style>
      {film && <video className="yl-film-video" src={filmSrc(film)} autoPlay muted loop playsInline preload="metadata" aria-hidden />}
      {kind !== 'none' && <Pieces kind={kind} />}
    </>,
    host,
  );
}

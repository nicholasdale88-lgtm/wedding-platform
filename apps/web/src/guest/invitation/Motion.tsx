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
@keyframes yl-fall { 0% { transform: translate3d(0,-10vh,0) rotate(0deg); opacity: 0 } 10% { opacity: .95 } 90% { opacity: .9 } 100% { transform: translate3d(var(--dx),110vh,0) rotate(var(--rot)); opacity: 0 } }
@keyframes yl-twinkle { 0%,100% { opacity: .15; transform: scale(.6) } 50% { opacity: 1; transform: scale(1) } }
@keyframes yl-shimmer { 0% { transform: translateX(-60%) rotate(18deg); opacity: 0 } 30% { opacity: .55 } 70% { opacity: .35 } 100% { transform: translateX(160%) rotate(18deg); opacity: 0 } }
.yl-m-fall { top: 0; animation: yl-fall var(--t) linear var(--d) infinite; }
.yl-m-petals i { width: var(--s); height: calc(var(--s) * .72); border-radius: 70% 0 70% 0; background: radial-gradient(circle at 30% 30%, #fbe1e1, #e9aeb3 70%); box-shadow: 0 1px 2px rgba(120,60,70,.15); }
.yl-m-leaves i { width: var(--s); height: calc(var(--s) * .45); border-radius: 50% 0 50% 0; background: linear-gradient(135deg, #9fb183, #6f8256); }
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

import { useState, type ReactNode } from 'react';
import { contrast } from '../sales/tokens';
import { coverOf } from './covers';
import { nearestWax, WaxSeal } from './invitation/WaxSeal';
import type { themeOf } from './themeKit';

/**
 * A design's cover still (its closed envelope or scene, a 3:4 portrait), loaded only as it scrolls near (lazy)
 * unless it's the one showing or in the first rows (eager). Until a still exists for a design, `fallback` is
 * drawn instead (EnvelopePortrait, never a thin chip).
 */
export function CoverImage({ name, active = false, eager = false, className = '', fallback }: { name: string; active?: boolean; eager?: boolean; className?: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={coverOf(name)}
      alt=""
      width={300}
      height={400}
      loading={active || eager ? 'eager' : 'lazy'}
      decoding="async"
      {...({ fetchpriority: active ? 'high' : 'low' } as Record<string, string>)}
      onError={() => setFailed(true)}
      className={`block w-full aspect-[3/4] object-cover object-center ${className}`}
    />
  );
}

/** Ink or cream, whichever reads on this background (never cream on a pale envelope: VS-04). */
export function readableOn(bg: string, ink = '#2e2430', cream = '#fbf8f2') {
  return /^#[0-9a-f]{6}$/i.test(bg) && contrast(cream, bg) > contrast(ink, bg) ? cream : ink;
}

/**
 * A design without its own still yet, as a 3:4 portrait of its closed envelope in its own colours: the paper,
 * the top flap with its shadow, a fine foil rule and the wax seal, and the sample couple's names in a colour that
 * reads on that paper.
 */
export function EnvelopePortrait({ t }: { t: ReturnType<typeof themeOf> }) {
  const env = [t.e1 ?? t.b2 ?? '#e6dcc4', t.e2 ?? t.b2 ?? '#d9cdb0', t.e3 ?? '#c6b794'];
  const flap = [t.t1 ?? env[0], t.t2 ?? env[1], t.t3 ?? env[2]];
  const acc = t.acc ?? '#c8a46a';
  return (
    <span aria-hidden className="relative block w-full h-full aspect-[3/4] overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]" style={{ background: `linear-gradient(0deg, ${env[2]}, ${env[0]})` }}>
      <span className="absolute inset-0" style={{ background: `linear-gradient(0deg, ${env[1]}, ${env[0]})`, clipPath: 'polygon(0 100%, 50% 56%, 100% 100%)' }} />
      <span className="absolute inset-0" style={{ background: 'rgba(40,28,14,.16)', clipPath: 'polygon(0 0, 100% 0, 50% 54%)', transform: 'translateY(3px)' }} />
      <span className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${flap[0]}, ${flap[2]})`, clipPath: 'polygon(0 0, 100% 0, 50% 52%)' }} />
      <svg viewBox="0 0 100 133" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <path d="M8 0 L46 62 M92 0 L54 62" stroke={acc} strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" opacity=".9" />
      </svg>
      <span className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 w-[38px] h-[38px]" style={{ filter: 'drop-shadow(0 1px 1.5px rgba(40,25,10,.45))' }}>
        <WaxSeal colour={nearestWax(acc)} words="H & T" px={38} still />
      </span>
      <span className="absolute left-0 right-0 bottom-[12%] text-center font-script text-[20px] leading-none" style={{ color: readableOn(env[1]!) }}>
        Harriet &amp; Theo
      </span>
    </span>
  );
}

import type { EnvelopePaper } from '@wp/shared';
import { useEffect, useState, type CSSProperties } from 'react';
import { prefersLessMotion } from './openings';

/**
 * The envelope's finishing touches, drawn over the design's envelope and moving with it:
 * - a patterned liner on the underside of the flap, seen as it swings open (floral, eucalyptus, gold
 *   stripes, confetti, gold foil);
 * - the guest's name written across the front, and a gold-foil sprig above the seal;
 * - a silk ribbon or twine around it (with a gap for the seal), and a slow gold shimmer across the paper;
 * - depth: the flaps' soft shadows and lit edges, the seal's contact shadow, light and shade, paper grain.
 * Phases are the envelope's: 0 closed, 1 tapped, 2 opening, 3 card out, 4 gone.
 */
export interface EnvelopeOptions {
  liner?: 'none' | 'floral' | 'eucalyptus' | 'stripes' | 'confetti' | 'foil';
  name?: boolean;
  /** Gold-foil leaves above the seal (on unless switched off). */
  sprig?: boolean;
  ribbon?: 'none' | 'silk' | 'twine';
  /** The paper's finish: smooth (default), linen or cotton. */
  finish?: 'smooth' | 'linen' | 'cotton';
  shimmer?: boolean;
  /** The envelope's paper colour by name (ENVELOPE_PAPERS); the look's own when unset. */
  paper?: EnvelopePaper;
}
interface Colours {
  paper: string;
  ink: string;
  accent: string;
  soft: string;
  envelope: string;
}

const svg = (body: string, w: number, h: number) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

/** The liner's pattern, in the wedding's colours. */
function linerBackground(kind: NonNullable<EnvelopeOptions['liner']>, c: Colours): string {
  if (kind === 'stripes') return `repeating-linear-gradient(90deg, ${c.accent} 0 10px, ${c.paper} 10px 22px)`;
  // Brushed foil: fine streaks (a 120px map, public/textures/foil.svg) over the gold's light and shade.
  if (kind === 'foil') return `url('/textures/foil.svg') 0 0 / 120px 120px, linear-gradient(120deg, #a77b2c 0%, #f3dc9a 22%, #b98a36 40%, #f8e7b4 58%, #9c7128 78%, #e9c97c 100%)`;
  if (kind === 'confetti') {
    const dots = [
      [8, 10, c.accent, 3],
      [30, 24, c.soft, 4],
      [50, 6, c.ink, 2],
      [18, 42, c.ink, 2.5],
      [44, 40, c.accent, 3.5],
      [58, 28, c.soft, 2],
    ]
      .map(([x, y, f, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${f}'/>`)
      .join('');
    return `${svg(dots, 64, 52)}, ${c.paper}`;
  }
  if (kind === 'eucalyptus') {
    const leaf = (x: number, y: number, a: number, f: string) => `<ellipse cx='${x}' cy='${y}' rx='7' ry='3.6' transform='rotate(${a} ${x} ${y})' fill='${f}' opacity='.85'/>`;
    const body = `<path d='M10 70 Q40 40 70 10' stroke='${c.accent}' stroke-width='1' fill='none'/>${leaf(20, 56, -40, c.soft)}${leaf(30, 50, 40, c.ink)}${leaf(38, 40, -40, c.soft)}${leaf(48, 34, 40, c.ink)}${leaf(55, 24, -40, c.soft)}${leaf(64, 18, 40, c.soft)}`;
    return `${svg(body, 80, 80)}, ${c.paper}`;
  }
  // Floral: little five-petal flowers and buds.
  const flower = (x: number, y: number, r: number, f: string) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = (i * 72 * Math.PI) / 180;
      return `<circle cx='${(x + Math.cos(a) * r).toFixed(1)}' cy='${(y + Math.sin(a) * r).toFixed(1)}' r='${(r * 0.75).toFixed(1)}' fill='${f}'/>`;
    }).join('') + `<circle cx='${x}' cy='${y}' r='${(r * 0.5).toFixed(1)}' fill='${c.accent}'/>`;
  const body = `${flower(14, 14, 5, c.soft)}${flower(48, 40, 6, c.soft)}<circle cx='44' cy='12' r='2' fill='${c.accent}'/><circle cx='16' cy='46' r='2.4' fill='${c.ink}' opacity='.5'/>`;
  return `${svg(body, 64, 60)}, ${c.paper}`;
}

/**
 * Heavy cotton paper, as a fine stationer's envelope is made: the felted surface lit from the top left (a
 * real relief, not a pattern), long cotton fibres lying in it, and a soft cloudiness through the sheet.
 * Each is a tile drawn once; they lie over any colour of envelope.
 */
const rndP = (i: number, k: number) => {
  const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
// Light and shade only (white and brown with their own transparency), so it lies on the envelope without
// blending modes, which can't reach through to the envelope from this layer.
const FELT = svg(
  "<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='.95' numOctaves='3' seed='9' stitchTiles='stitch' result='n'/><feDiffuseLighting in='n' surfaceScale='1.1' lighting-color='#fff' result='L'><feDistantLight azimuth='225' elevation='52'/></feDiffuseLighting><feColorMatrix in='L' type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 .97  2.6 0 0 0 -2.05' result='hi'/><feColorMatrix in='L' type='matrix' values='0 0 0 0 .22  0 0 0 0 .16  0 0 0 0 .1  -2.6 0 0 0 2.05' result='lo'/><feMerge><feMergeNode in='lo'/><feMergeNode in='hi'/></feMerge></filter><rect width='100%' height='100%' filter='url(#f)'/>",
  240,
  240,
);
const FIBRES = svg(
  Array.from({ length: 46 }, (_, i) => {
    const x = rndP(i, 1) * 420;
    const y = rndP(i, 2) * 420;
    const a = rndP(i, 3) * Math.PI * 2;
    const L = 10 + rndP(i, 4) * 26;
    const bend = (rndP(i, 5) - 0.5) * 10;
    const x2 = x + Math.cos(a) * L;
    const y2 = y + Math.sin(a) * L;
    const lightOne = i % 3 !== 0;
    return `<path d='M${x.toFixed(1)} ${y.toFixed(1)} Q${((x + x2) / 2 + bend).toFixed(1)} ${((y + y2) / 2 - bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}' fill='none' stroke='${lightOne ? '#fffdf6' : '#5a4630'}' stroke-opacity='${lightOne ? 0.55 : 0.12}' stroke-width='${(0.35 + rndP(i, 6) * 0.45).toFixed(2)}' stroke-linecap='round'/>`;
  }).join(''),
  420,
  420,
);
const CLOUD = svg(
  "<filter id='c' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.006' numOctaves='3' seed='21' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 .98  0 0 0 0 .94  0 0 0 .9 -.38'/></filter><rect width='100%' height='100%' filter='url(#c)'/>",
  700,
  700,
);

/** The window's size (the deckled edges are drawn in real pixels, so their tearing isn't stretched). */
function useViewport() {
  const read = () => ({ w: typeof window === 'undefined' ? 390 : window.innerWidth, h: typeof window === 'undefined' ? 844 : window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

/** Light writing on a dark envelope, dark on a light one. */
const lightOn = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 140;
};

/**
 * A fine gold-foil rule along the closed flap, a little inside its two edges, as fine stationers press one:
 * it runs from the top of the envelope towards the seal and stops with a dot short of the sprig. In real pixels.
 */
function FoilRule({ vw, vh, seal }: { vw: number; vh: number; seal: number }) {
  const tip = vh * 0.56;
  const inset = Math.max(16, Math.min(28, vw * 0.045));
  const dx = inset / Math.sin(Math.atan2(tip, vw / 2));
  const stop = tip - seal * 0.95;
  const x = (vw / 2) * (stop / tip) + dx;
  // The bottom flap's edges run from the bottom corners up to its point (47% down); the rule sits the same
  // distance inside them, and ends below the seal, "Tap to open" and the names.
  const rise = vh * 0.53;
  const slope = rise / (vw / 2);
  const dy = inset / Math.cos(Math.atan(slope));
  const by1 = Math.max(vh * 0.8, tip + seal * 1.35 + 40);
  const bx0 = dy / slope;
  const bx1 = (vh + dy - by1) / slope;
  return (
    <svg width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`} className="absolute inset-0">
      <defs>
        <linearGradient id="envRule" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a77b2c" />
          <stop offset=".3" stopColor="#f3dc9a" />
          <stop offset=".5" stopColor="#b98a36" />
          <stop offset=".72" stopColor="#f8e7b4" />
          <stop offset="1" stopColor="#9c7128" />
        </linearGradient>
      </defs>
      <g fill="url(#envRule)" stroke="url(#envRule)" strokeWidth="1.3" style={{ filter: 'drop-shadow(0 1px 0 rgba(255,255,255,.35)) drop-shadow(0 -0.5px 0 rgba(90,60,20,.35))' }}>
        <path d={`M${dx.toFixed(1)} 0 L${x.toFixed(1)} ${stop.toFixed(1)}`} fill="none" />
        <path d={`M${(vw - dx).toFixed(1)} 0 L${(vw - x).toFixed(1)} ${stop.toFixed(1)}`} fill="none" />
        <circle cx={x} cy={stop} r="2.2" stroke="none" />
        <circle cx={vw - x} cy={stop} r="2.2" stroke="none" />
        {/* The same rule along the bottom flap, from each corner up its edge, stopping well below the names. */}
        {by1 < vh - 40 && (
          <>
        <path d={`M${bx0.toFixed(1)} ${vh} L${bx1.toFixed(1)} ${by1.toFixed(1)}`} fill="none" />
        <path d={`M${(vw - bx0).toFixed(1)} ${vh} L${(vw - bx1).toFixed(1)} ${by1.toFixed(1)}`} fill="none" />
        <circle cx={bx1} cy={by1} r="2.2" stroke="none" />
        <circle cx={vw - bx1} cy={by1} r="2.2" stroke="none" />
          </>
        )}
      </g>
    </svg>
  );
}

export function EnvelopeExtras({ phase, opts, colours, guestName, music = false, opening = 'classic' }: { phase: number; opts: EnvelopeOptions; colours: Colours; guestName: string; music?: boolean; opening?: string }) {
  const { w: vw, h: vh } = useViewport();
  if (phase >= 4) return null;
  const closed = phase < 2;
  const front: CSSProperties = { opacity: closed ? 1 : 0, transition: 'opacity .6s ease' };
  const writing = lightOn(colours.envelope) ? '#fbf6ea' : colours.ink;
  const liner = opts.liner ?? 'floral';
  const finish = opts.finish ?? 'smooth';
  // "Ribbon untie" needs a ribbon to untie: a silk one unless they chose twine.
  const untie = opening === 'ribbon';
  const ribbon = untie && (opts.ribbon ?? 'none') === 'none' ? 'silk' : (opts.ribbon ?? 'none');
  // The seal's size in the design (a gap is left for it in the ribbon).
  const seal = 'clamp(96px,24vmin,150px)';
  const sealPx = Math.min(150, Math.max(96, Math.min(vw, vh) * 0.24));
  const dark = lightOn(colours.envelope);
  const hole = `radial-gradient(circle at 50% 56%, transparent calc(${seal} / 2 + 2px), #000 calc(${seal} / 2 + 4px))`;
  return (
    <div aria-hidden className="fixed inset-0 z-[1] pointer-events-none overflow-hidden" style={{ perspective: 1100 }}>
      {/* Depth while it's closed: the flaps' overlaps cast soft shadows, their folded edges catch the
          light, the seal sits on the paper with a shadow under it, light falls from the top left, and the
          paper has a fine grain. */}
      <div className="absolute inset-0" style={{ opacity: closed ? 1 : 0, transition: 'opacity .5s ease' }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          // The seal sits on top of the flap: no fold shadow across it.
          style={{ WebkitMaskImage: hole, maskImage: hole }}
        >
          <defs>
            <filter id="envSoft" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation=".45" />
            </filter>
            <filter id="envSofter" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="1.4" />
            </filter>
          </defs>
          {/* The top flap lies over everything: its shadow falls just below its edges. */}
          <g style={{ mixBlendMode: 'multiply' }}>
            <path d="M0 0.5 L50 56.9 L100 0.5" fill="none" stroke="rgba(0,0,0,.2)" strokeWidth=".7" filter="url(#envSoft)" />
            <path d="M0 1.4 L50 58.2 L100 1.4" fill="none" stroke="rgba(0,0,0,.09)" strokeWidth="2.2" filter="url(#envSofter)" />
            {/* The bottom panel overlaps the sides: the same crisp shadow and soft spread as the top flap's, just
                above its edges, so the two halves read as one folded envelope. */}
            <path d="M0 99.1 L50 46.1 L100 99.1" fill="none" stroke="rgba(0,0,0,.2)" strokeWidth=".7" filter="url(#envSoft)" />
            <path d="M0 98.2 L50 45.2 L100 98.2" fill="none" stroke="rgba(0,0,0,.09)" strokeWidth="2.2" filter="url(#envSofter)" />
          </g>
          {/* Folded paper edges catch the light. */}
          <g style={{ mixBlendMode: 'screen' }}>
            <path d="M0 0 L50 56 L100 0" fill="none" stroke="rgba(255,248,230,.5)" strokeWidth=".35" vectorEffect="non-scaling-stroke" />
            <path d="M0 100 L50 47 L100 100" fill="none" stroke="rgba(255,248,230,.5)" strokeWidth=".35" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
        {/* The seal pressed onto the paper: a contact shadow just below its rim. */}
        <div
          className="absolute inset-0"
          style={{
            mixBlendMode: 'multiply',
            background: `radial-gradient(circle at 50% calc(56% + 7px), transparent calc(${seal} / 2 - 4px), rgba(0,0,0,.24) calc(${seal} / 2 + 1px), rgba(0,0,0,.07) calc(${seal} / 2 + 8px), transparent calc(${seal} / 2 + 20px))`,
          }}
        />
        {/* Light from the top left, and the corners falling into shade. */}
        <div className="absolute inset-0" style={{ mixBlendMode: 'soft-light', background: `linear-gradient(170deg, rgba(255,255,255,${dark ? 0.18 : 0.55}) 0%, rgba(255,255,255,${dark ? 0.05 : 0.15}) 45%, rgba(0,0,0,.06) 100%)` }} />
        <div className="absolute inset-0" style={{ mixBlendMode: 'multiply', background: 'radial-gradient(140% 100% at 50% 35%, transparent 70%, rgba(60,40,20,.07) 100%)' }} />
        {/* A light envelope reads as warm ivory in soft daylight, not grey: a gentle warm lift (not over the seal). */}
        {!dark && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,250,238,.32), rgba(255,244,222,.18) 60%, rgba(255,240,215,.1))', WebkitMaskImage: hole, maskImage: hole }} />}
        {/* A fine gold-foil rule pressed along the flap, just inside its edges, ending in a dot before the sprig. */}
        {opts.sprig !== false && <FoilRule vw={vw} vh={vh} seal={sealPx} />}
        {/* Cotton paper only: the top flap's deckled edge, torn cotton, a ragged fringe a few millimetres past the
            fold, its fibres catching the light, with a soft shadow beneath. Drawn in real pixels so it isn't stretched. */}
        {finish === 'cotton' && (
        <svg width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`} className="absolute inset-0" style={{ WebkitMaskImage: hole, maskImage: hole }}>
          <defs>
            <linearGradient id="dkFlap" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={vh * 0.56}>
              <stop offset="0" style={{ stopColor: 'var(--t1,#e9dfca)' }} />
              <stop offset=".55" style={{ stopColor: 'var(--t2,#e2d7bf)' }} />
              <stop offset="1" style={{ stopColor: 'var(--t3,#d9cdb3)' }} />
            </linearGradient>
            <filter id="dkTear" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="17" result="t" />
              <feDisplacementMap in="SourceGraphic" in2="t" scale="9" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id="dkShade" x="-5%" y="-5%" width="110%" height="115%">
              <feGaussianBlur stdDeviation="2.2" />
            </filter>
            {/* The torn fringe fades into the real flap a little way in from its edge. */}
            <filter id="dkSoftEdge">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <mask id="dkEdge" maskUnits="userSpaceOnUse" x={-40} y={-40} width={vw + 80} height={vh + 80}>
              <path d={`M-20 -20 L${(vw / 2).toFixed(1)} ${(vh * 0.56 + 6).toFixed(1)} L${vw + 20} -20`} fill="none" stroke="#fff" strokeWidth="26" filter="url(#dkSoftEdge)" />
            </mask>
          </defs>
          {(() => {
            const tipY = vh * 0.56;
            const fringe = `M-20 -20 H${vw + 20} L${(vw / 2).toFixed(1)} ${(tipY + 6).toFixed(1)} Z`;
            return (
              <>
                <path d={fringe} fill="rgba(40,28,14,.28)" transform="translate(0 3)" filter="url(#dkShade)" style={{ mixBlendMode: 'multiply' }} />
                <g filter="url(#dkTear)" mask="url(#dkEdge)">
                  <path d={fringe} fill="url(#dkFlap)" />
                  <path d={`M-20 -20 L${(vw / 2).toFixed(1)} ${(tipY + 6).toFixed(1)} L${vw + 20} -20`} fill="none" stroke="rgba(255,252,244,.75)" strokeWidth="1.2" />
                </g>
              </>
            );
          })()}
        </svg>
        )}
        {/* The paper's finish. Smooth (the default): a soft light across a fine sheet, only a whisper of grain.
            Linen: a fine woven texture. Cotton: a gently felted surface with a few fibres. */}
        {finish === 'cotton' && (
          <>
            <div className="absolute inset-0" style={{ opacity: 0.16, background: FELT, WebkitMaskImage: hole, maskImage: hole }} />
            <div className="absolute inset-0" style={{ opacity: 0.22, background: FIBRES, WebkitMaskImage: hole, maskImage: hole }} />
          </>
        )}
        {finish === 'linen' && (
          <div
            className="absolute inset-0"
            style={{
              opacity: 0.5,
              background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.10) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(90,70,40,.06) 0 1px, transparent 1px 3px)',
              WebkitMaskImage: hole,
              maskImage: hole,
            }}
          />
        )}
        <div className="absolute inset-0" style={{ opacity: dark ? 0.06 : 0.28, background: CLOUD, WebkitMaskImage: hole, maskImage: hole }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, rgba(255,255,255,${dark ? 0.07 : 0.22}) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,.05) 100%)`, WebkitMaskImage: hole, maskImage: hole }} />
        {/* Paper grain: fine, and quiet. */}
        <div
          className="absolute inset-0"
          style={{
            mixBlendMode: 'multiply',
            opacity: finish === 'smooth' ? 0.06 : 0.1,
            background: svg("<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='3'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .45 0 0 0 0 .38 0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/>", 180, 180),
          }}
        />
      </div>

      {/* The liner: on the underside of the flap, it swings up into view as the envelope opens. */}
      {liner !== 'none' && (
        <div
          className="absolute inset-0"
          style={{
            transformOrigin: '50% 0',
            transform: closed ? 'rotateX(0deg)' : 'rotateX(-165deg)',
            opacity: closed ? 0 : 1,
            transition: closed ? 'none' : 'transform 3.6s cubic-bezier(.22,1.2,.36,1), opacity 1.4s ease 2.6s',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: 'rotateX(180deg)',
              backfaceVisibility: 'hidden',
              clipPath: 'polygon(0 100%,100% 100%,50% 44%)',
              background: `${FELT}, ${linerBackground(liner, colours)}`,
              boxShadow: 'inset 0 0 40px rgba(0,0,0,.18)',
            }}
          />
        </div>
      )}

      {/* A ribbon or twine around the envelope, either side of the seal. */}
      {ribbon !== 'none' &&
        (['left', 'right'] as const).map((side) => (
          <div
            key={side}
            className="absolute"
            style={{
              ...front,
              top: `calc(56% - ${ribbon === 'silk' ? 11 : 3}px)`,
              height: ribbon === 'silk' ? 22 : 6,
              [side]: 0,
              width: `calc(50% - ${seal} / 2 + 6px)`,
              background:
                ribbon === 'silk'
                  ? `linear-gradient(180deg, rgba(255,255,255,.35), ${colours.accent} 35%, ${colours.accent} 65%, rgba(0,0,0,.25))`
                  : `repeating-linear-gradient(115deg, #b89466 0 3px, #8e6c45 3px 6px)`,
              boxShadow: '0 2px 4px rgba(0,0,0,.25)',
              borderRadius: ribbon === 'twine' ? 3 : 0,
              // Untied: each half slips away to its side as soon as the envelope is tapped.
              ...(untie && !prefersLessMotion() ? { transform: phase >= 1 ? `translateX(${side === 'left' ? '-' : ''}105%)` : 'none', transition: 'transform 1.6s cubic-bezier(.5,0,.3,1), opacity .6s ease' } : {}),
            }}
          />
        ))}

      {/* The guest's name, written across the front below the seal. */}
      {opts.name !== false && guestName && (
        <div className="absolute left-0 right-0 text-center px-6" style={{ ...front, top: '74%', color: writing, fontFamily: "'Great Vibes', 'Pinyon Script', cursive", fontSize: 'clamp(26px,6.4vmin,48px)', lineHeight: 1.1, textShadow: '0 1px 1px rgba(0,0,0,.15)' }}>
          {guestName}
        </div>
      )}

      {/* A gold-foil sprig pressed into the flap above the seal. */}
      {opts.sprig !== false && (
        <div className="absolute left-1/2" style={{ ...front, top: `calc(56% - ${seal} / 2 - clamp(78px,19vmin,126px))`, width: 'clamp(150px,36vmin,240px)', transform: 'translateX(-50%)' }}>
          <svg viewBox="0 0 200 100" className="w-full h-auto" style={{ filter: 'drop-shadow(0 1px 0 rgba(255,255,255,.25)) drop-shadow(0 -1px 0 rgba(0,0,0,.25))' }}>
            <defs>
              <linearGradient id="envFoil" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#a77b2c" />
                <stop offset=".3" stopColor="#f3dc9a" />
                <stop offset=".5" stopColor="#b98a36" />
                <stop offset=".72" stopColor="#f8e7b4" />
                <stop offset="1" stopColor="#9c7128" />
              </linearGradient>
            </defs>
            <g fill="url(#envFoil)" stroke="url(#envFoil)">
              {/* Two stems curving out from the centre, leaves along each, a small bloom where they meet. */}
              {([1, -1] as const).map((d) => (
                <g key={d} transform={d === 1 ? undefined : 'translate(200 0) scale(-1 1)'}>
                  <path d="M100 92 C 120 70, 150 52, 190 44" fill="none" strokeWidth="1.6" strokeLinecap="round" />
                  {[
                    [116, 76, -35],
                    [132, 63, -25],
                    [150, 54, -18],
                    [168, 48, -12],
                    [124, 80, 30],
                    [142, 68, 32],
                    [160, 59, 34],
                    [180, 51, 36],
                  ].map(([x, y, r]) => (
                    <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="8" ry="3.2" transform={`rotate(${r} ${x} ${y})`} stroke="none" />
                  ))}
                  <circle cx="190" cy="44" r="2.4" stroke="none" />
                </g>
              ))}
              {Array.from({ length: 6 }, (_, i) => {
                const a = (i * 60 * Math.PI) / 180;
                return <ellipse key={i} cx={100 + Math.cos(a) * 6} cy={88 + Math.sin(a) * 6} rx="5" ry="3" transform={`rotate(${i * 60} ${100 + Math.cos(a) * 6} ${88 + Math.sin(a) * 6})`} stroke="none" />;
              })}
              <circle cx="100" cy="88" r="3" fill="#fff4d2" stroke="none" />
            </g>
          </svg>
        </div>
      )}

      {/* The invitation has music: a gentle reminder to turn the sound up before tapping. */}
      {music && phase === 0 && (
        <div
          className="absolute left-1/2 flex items-center gap-2 py-[7px] px-4 rounded-full"
          style={{
            top: 'max(18px, env(safe-area-inset-top))',
            transform: 'translateX(-50%)',
            background: 'rgba(251,248,242,.88)',
            color: '#33402f',
            boxShadow: '0 4px 14px rgba(0,0,0,.18)',
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 'clamp(15px,4vmin,18px)',
            whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden>🔊</span> Turn your sound up, then tap to open
        </div>
      )}

      {/* A slow gold shimmer across the paper while it waits to be opened. */}
      {opts.shimmer !== false && closed && (
        <div className="absolute inset-0 env-shimmer" style={{ mixBlendMode: 'soft-light', background: 'linear-gradient(105deg, transparent 35%, rgba(255,236,190,.55) 48%, rgba(255,255,255,.7) 50%, rgba(255,236,190,.5) 52%, transparent 65%)', backgroundSize: '250% 100%' }} />
      )}
      <style>{`.env-shimmer{animation:envShimmer 5.5s ease-in-out 1.2s infinite}@keyframes envShimmer{0%{background-position:130% 0}55%,100%{background-position:-30% 0}}@media (prefers-reduced-motion: reduce){.env-shimmer{animation:none;opacity:0}}`}</style>
    </div>
  );
}

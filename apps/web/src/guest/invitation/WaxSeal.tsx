import { ENVELOPE_PAPER_INFO, type EnvelopePaper, type SealColour, type SealLetters, type SealStyle } from '@wp/shared';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { mix } from '../themeKit';

/**
 * The wax seal, drawn as one lit SVG (no pictures to download): the wax pooled in a soft uneven puddle, a
 * raised lip, the pressed well, and what's pressed into it: the couple's initials, a flower, initials in a
 * wreath, one letter, a heart or the date. Used for every seal: the invitation, the front page, the swatches.
 * Also the envelope's paper colours.
 */

interface Wax {
  /** The drips around the edge. */
  drip: string;
  /** The seal's face: highlight, middle, shade. */
  body: [string, string, string];
  /** The pressed disc in the middle. */
  inner: [string, string, string];
  /** The raised letters and motif. */
  ink: string;
  /** A metallic finish: a brighter sheen. */
  metal?: boolean;
}

export const WAX: Record<SealColour, Wax> = {
  // The originals, exactly as the design draws them.
  Sandstone: { drip: '#b4935c', body: ['#e9d3a6', '#c3a26b', '#8d6f40'], inner: ['#c09f68', '#b19159', '#9f8049'], ink: '#fff3dc' },
  'Dusty rose': { drip: '#c4848f', body: ['#f0c4cb', '#cf929c', '#8e4f5c'], inner: ['#c98b95', '#b9737f', '#a3626e'], ink: '#fff5f6' },
  'Daphne blue': { drip: '#8fb0cc', body: ['#a7c4dc', '#7e9fbe', '#b9d1e5'], inner: ['#8fb0cc', '#6d8fb0', '#c7dbec'], ink: '#ffffff' },
  'Rose gold': { drip: '#b97f6e', body: ['#f7d6c9', '#d39a87', '#8f5646'], inner: ['#dcab9a', '#c48a77', '#a76a58'], ink: '#fff1ea', metal: true },
  Gold: { drip: '#ad8736', body: ['#fbe7a6', '#d4ad53', '#86661f'], inner: ['#e0bd66', '#c9a14a', '#a7832f'], ink: '#fff7dc', metal: true },
  Silver: { drip: '#9aa0a8', body: ['#f6f8fa', '#bfc5cc', '#79808a'], inner: ['#d0d5db', '#b2b8c0', '#959ca5'], ink: '#ffffff', metal: true },
  Champagne: { drip: '#bea781', body: ['#f7ecd6', '#d9c39b', '#9a835e'], inner: ['#e2cfaa', '#cdb68d', '#b19a72'], ink: '#fffaf0', metal: true },
  'Pearl white': { drip: '#e0d9cc', body: ['#ffffff', '#efeae1', '#c4bba9'], inner: ['#f4f0e9', '#e6e0d5', '#d4ccbe'], ink: '#a89c86', metal: true },
  Burgundy: { drip: '#6a1d2a', body: ['#b4505f', '#7d2333', '#480e19'], inner: ['#8a2d3d', '#76212f', '#5f1824'], ink: '#f3d9c8' },
  'Forest green': { drip: '#2d4834', body: ['#6f9078', '#38573f', '#1b2f21'], inner: ['#43644a', '#365640', '#294433'], ink: '#eadcbc' },
  Sage: { drip: '#8c9c7e', body: ['#cdd8bf', '#9aab8b', '#5f6f58'], inner: ['#a8b79a', '#93a485', '#7c8d6f'], ink: '#f8f6ec' },
  Navy: { drip: '#202d49', body: ['#5d6f95', '#2b3a5c', '#121a2f'], inner: ['#364770', '#2c3b5e', '#20304d'], ink: '#e9d9b2' },
  Black: { drip: '#19191b', body: ['#5c5c62', '#26262a', '#0a0a0b'], inner: ['#333337', '#26262a', '#1a1a1d'], ink: '#dcc38c' },
  Terracotta: { drip: '#a2573a', body: ['#e9a684', '#bf6a48', '#77361f'], inner: ['#c9795a', '#b8664a', '#9c5238'], ink: '#fff0e4' },
  Lilac: { drip: '#a594bc', body: ['#e5dbf1', '#b8a7cf', '#786793'], inner: ['#c4b5d8', '#b0a0c8', '#9a8ab4'], ink: '#ffffff' },
};

/** The wax finish nearest a colour (for a design shown in its accent colour). */
export function nearestWax(hex: string): SealColour {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return 'Sandstone';
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best: SealColour = 'Sandstone';
  let d0 = Infinity;
  for (const [k, w] of Object.entries(WAX) as [SealColour, Wax][]) {
    const m = parseInt(w.body[1].slice(1), 16);
    const d = (((m >> 16) & 255) - c[0]!) ** 2 + (((m >> 8) & 255) - c[1]!) ** 2 + ((m & 255) - c[2]!) ** 2;
    if (d < d0) [best, d0] = [k, d];
  }
  return best;
}

/** The colour a swatch shows for each finish. */
export const sealSwatch = (c: SealColour) => (WAX[c] ?? WAX.Sandstone).body[1];

const ORIGINAL_COLOURS: readonly string[] = ['Sandstone', 'Dusty rose', 'Daphne blue'];

export interface SealDesign {
  style?: SealStyle;
  letters?: SealLetters;
  text?: string;
}

/** The design's own seal (drawn by the generated view, as it always was): an original colour with classic italic initials. */
export const isDesignSeal = (seal: string | undefined, d: SealDesign | undefined) =>
  ORIGINAL_COLOURS.includes(seal ?? 'Sandstone') && (d?.style ?? 'classic') === 'classic' && (d?.letters ?? 'script') === 'script' && !d?.text?.trim();

/** The two initials: from the monogram ("O&J"), else the first letters of their names. */
export function initialsOf(monogram: string | undefined, name1: string, name2: string): [string, string] {
  const m = /^\s*(\S)\S*\s*&\s*(\S)/.exec(monogram ?? '');
  return m ? [m[1]!, m[2]!] : [name1.trim().charAt(0), name2.trim().charAt(0)];
}

/** The wedding date as a seal reads it: "20.03.27", in the wedding's own time zone. */
export function sealDate(startsAt: string | undefined, timeZone?: string): string {
  const d = new Date(startsAt ?? '');
  if (Number.isNaN(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-AU', { timeZone: timeZone || undefined, day: '2-digit', month: '2-digit', year: '2-digit' }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${g('day')}.${g('month')}.${g('year')}`;
  } catch {
    return '';
  }
}

/** What the seal says: their own words, else their initials (one for the single initial, the date for the date seal). */
export function sealWords(d: SealDesign | undefined, initials: [string, string], date: string): string {
  const own = d?.text?.trim();
  if (own) return own;
  const style = d?.style ?? 'classic';
  if (style === 'floral' || style === 'heart') return '';
  if (style === 'single') return initials[0] || initials[1];
  if (style === 'date' && date) return date;
  return initials[0] && initials[1] ? `${initials[0]} & ${initials[1]}` : initials[0] || initials[1];
}

/** The envelope paper's colour (none: the look's own). */
export const paperHex = (paper: string | undefined) => ENVELOPE_PAPER_INFO[paper as EnvelopePaper]?.hex;

const dark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 140;
};

/** The design's envelope colour settings for a chosen paper (nothing when it's the look's own). */
export function paperVars(paper: string | undefined, ink: string): Record<string, string> {
  const e = paperHex(paper);
  if (!e) return {};
  return {
    e1: e,
    e2: mix(e, '#000000', 0.07),
    e3: mix(e, '#000000', 0.16),
    t1: mix(e, '#ffffff', 0.1),
    t2: mix(e, '#ffffff', 0.04),
    t3: mix(e, '#000000', 0.05),
    // "Tap to open" under the seal: light on a dark paper.
    hint: dark(e) ? '#f6efdf' : ink,
  };
}

/**
 * The wax as it pools under the stamp: one soft, uneven outline (a few gentle swells, never stuck-on blobs),
 * the same for every seal so it looks like the same wax everywhere.
 */
const PUDDLE = (() => {
  const n = 36;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 44.5 + 1.6 * Math.sin(3 * a + 1.3) + 1.1 * Math.sin(5 * a + 3) + 0.7 * Math.sin(8 * a + 0.9) + Math.max(0, Math.sin(2 * a + 2.2)) ** 6 * 2.2;
    return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r] as const;
  });
  const f = (v: number) => v.toFixed(2);
  let d = `M${f(pts[0]![0])} ${f(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n]!, pts[i]!, pts[(i + 1) % n]!, pts[(i + 2) % n]!];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
})();

const abs = (s: CSSProperties): CSSProperties => ({ position: 'absolute', ...s });

const leaf = (x: number, y: number, a: number, rx = 4.2, ry = 1.9) => <ellipse key={`${x}-${y}-${a}`} cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${a} ${x} ${y})`} />;

/** A five-petal bloom with a second row and leaves. */
function Bloom() {
  const petals = (r: number, pr: number, turn: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = ((i * 72 + turn) * Math.PI) / 180;
      return <circle key={`${r}-${i}`} cx={50 + Math.cos(a) * r} cy={50 + Math.sin(a) * r} r={pr} />;
    });
  return (
    <>
      {[45, 135, 225, 315].map((a) => {
        const rad = (a * Math.PI) / 180;
        return leaf(50 + Math.cos(rad) * 21, 50 + Math.sin(rad) * 21, a, 6.5, 2.6);
      })}
      {petals(10, 7.2, -90)}
      <circle cx={50} cy={50} r={9.5} fill="rgba(0,0,0,.08)" />
      {petals(5.2, 4.4, -54)}
      <circle cx={50} cy={50} r={3} />
    </>
  );
}

/** Two leafy branches around the middle, open at the top. */
function Wreath() {
  const r = 26;
  const out: ReactNode[] = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const deg = 100 + i * 21; // from just right of the bottom, round to the top
      const a = ((90 + side * (deg - 90)) * Math.PI) / 180;
      const x = 50 + Math.cos(a) * r;
      const y = 50 + Math.sin(a) * r;
      const tangent = (Math.atan2(Math.sin(a), Math.cos(a)) * 180) / Math.PI + 90;
      out.push(leaf(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, tangent - side * 35));
      out.push(leaf(x - Math.cos(a) * 2.2, y - Math.sin(a) * 2.2, tangent + side * 35));
    }
  }
  const at = (deg: number) => `${(50 + Math.cos((deg * Math.PI) / 180) * r).toFixed(2)} ${(50 + Math.sin((deg * Math.PI) / 180) * r).toFixed(2)}`;
  return (
    <>
      {/* The stems: bottom round the left to the top left, and bottom round the right to the top right. */}
      <path d={`M ${at(95)} A ${r} ${r} 0 0 1 ${at(232)}`} fill="none" strokeWidth={0.9} />
      <path d={`M ${at(85)} A ${r} ${r} 0 0 0 ${at(-52)}`} fill="none" strokeWidth={0.9} />
      {out}
      <circle cx={50} cy={50 + r + 1} r={1.6} />
    </>
  );
}

const HEART = 'M50 68 C 44 62, 32 55, 32 45 C 32 38, 37 33, 43 33 C 46.5 33, 49 35, 50 38 C 51 35, 53.5 33, 57 33 C 63 33, 68 38, 68 45 C 68 55, 56 62, 50 68 Z';

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** About how many screen pixels the seal is drawn across (the light and shade are worked out in pixels). */
const shownPx = (px?: number) => {
  if (px) return px;
  if (typeof window === 'undefined') return 130;
  return Math.max(96, Math.min(150, 0.24 * Math.min(window.innerWidth || 600, window.innerHeight || 600)));
};

/** The words, as SVG text: "&" set smaller, as on a real stamp. */
function SealText({ words, letters, size }: { words: string; letters: SealLetters; size: number }) {
  const parts = words.split('&');
  const serif = letters === 'serif';
  return (
    <text
      x={50}
      y={50 + size * (serif ? 0.36 : 0.32)}
      textAnchor="middle"
      fontFamily="'Cormorant Garamond', Georgia, serif"
      fontStyle={serif ? 'normal' : 'italic'}
      fontWeight={serif ? 700 : 600}
      fontSize={size}
      letterSpacing={serif ? size * 0.05 : 0}
      style={serif ? { textTransform: 'uppercase' } : undefined}
    >
      {parts.map((p, i) => (
        <tspan key={i}>
          {i > 0 && (
            <tspan fontSize={size * 0.68} dx={size * 0.12}>
              &amp;
            </tspan>
          )}
          {i > 0 ? <tspan dx={size * 0.12}>{p.trim()}</tspan> : p.trim()}
        </tspan>
      ))}
    </text>
  );
}

/**
 * A real pressed wax seal, drawn as one SVG: the wax pooled in a soft uneven puddle, a raised lip where the
 * stamp squeezed it out, the pressed well, and the initials (or flower, wreath, heart, date) standing up in
 * it. The colour is the wax's own; a height map of all of it is then lit from the top left, so every edge has
 * real light and shade, with a tight gloss (brighter on the metallic finishes).
 */
export function WaxSeal({
  colour,
  design,
  words,
  px,
  still = false,
}: {
  colour: SealColour;
  design?: SealDesign;
  /** What it says (see sealWords). */
  words: string;
  /** Drawn this many pixels across (a swatch); the invitation's own size when unset. */
  px?: number;
  /** No gleam (swatches). */
  still?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const w = WAX[colour] ?? WAX.Sandstone;
  const style = design?.style ?? 'classic';
  // Drawn small (a swatch, the header): clear capitals, a little larger (a fine script can't be read that small).
  const small = !!px && px < 64;
  const letters = small ? 'serif' : (design?.letters ?? 'script');
  const [hi, mid, lo] = w.body;
  const len = Math.max(1, words.replace(/\s/g, '').length);
  const scale = (style === 'single' ? 1.7 : style === 'date' ? 0.62 : style === 'wreath' ? 0.78 : 1) * Math.min(1, (style === 'date' ? 8 : 3.4) / Math.max(style === 'date' ? 8 : 3, len));
  const size = 22 * scale * (small ? 1.2 : 1);
  const rings = style === 'classic' || style === 'single' || style === 'heart';
  // The lighting works in device pixels, so its depth follows the size it's shown at.
  const dpr = typeof window === 'undefined' ? 1 : Math.min(3, window.devicePixelRatio || 1);
  const depth = ((3.6 * shownPx(px) * dpr) / 100).toFixed(2);
  const sh = rgb(lo).map((v) => ((v * 0.45) / 255).toFixed(3));
  const motif = (
    <>
      {style === 'floral' && <Bloom />}
      {style === 'wreath' && <Wreath />}
      {style === 'heart' && <path d={HEART} />}
      {style === 'date' && (
        <>
          <circle cx={50} cy={50} r={25.5} fill="none" strokeWidth={0.8} />
          {[-1, 1].map((d) => (
            <g key={d}>
              <path d={`M ${50 - 9} ${50 + d * 12} L ${50 + 9} ${50 + d * 12}`} fill="none" strokeWidth={0.8} />
              <circle cx={50} cy={50 + d * 12} r={1.4} />
            </g>
          ))}
        </>
      )}
      {words && style !== 'floral' && style !== 'heart' && <SealText words={words} letters={letters} size={size} />}
    </>
  );
  return (
    <div aria-hidden style={abs({ inset: 0 })}>
      <svg viewBox="0 0 100 100" style={abs({ inset: 0, width: '100%', height: '100%', overflow: 'visible' })}>
        <defs>
          <radialGradient id={`wb${id}`} cx=".36" cy=".3" r=".85">
            <stop offset="0" stopColor={hi} />
            <stop offset=".5" stopColor={mid} />
            <stop offset="1" stopColor={lo} />
          </radialGradient>
          <radialGradient id={`ww${id}`} cx=".6" cy=".66" r=".75">
            <stop offset="0" stopColor={mid} />
            <stop offset="1" stopColor={lo} stopOpacity=".9" />
          </radialGradient>
          <filter id={`wr${id}`} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="h" />
            <feDiffuseLighting in="h" surfaceScale={depth} diffuseConstant={0.7071} lightingColor="#fff" result="l">
              <feDistantLight azimuth={225} elevation={45} />
            </feDiffuseLighting>
            <feColorMatrix in="l" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.2 0 0 0 -1.1" result="hl" />
            <feColorMatrix in="l" type="matrix" values={`0 0 0 0 ${sh[0]}  0 0 0 0 ${sh[1]}  0 0 0 0 ${sh[2]}  -2.2 0 0 0 1.05`} result="sh" />
            <feSpecularLighting in="h" surfaceScale={depth} specularConstant={w.metal ? 1 : 0.75} specularExponent={w.metal ? 18 : 34} lightingColor="#fff" result="sp">
              <feDistantLight azimuth={225} elevation={50} />
            </feSpecularLighting>
            <feComposite in="sp" in2="SourceAlpha" operator="in" result="sp2" />
            <feMerge>
              <feMergeNode in="sh" />
              <feMergeNode in="hl" />
              <feMergeNode in="sp2" />
            </feMerge>
          </filter>
          <filter id={`we${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.8" />
          </filter>
          <clipPath id={`wc${id}`}>
            <path d={PUDDLE} />
          </clipPath>
        </defs>
        {/* The wax's colour: the puddle, the pressed well a little deeper, and the motif catching the light. */}
        <path d={PUDDLE} fill={`url(#wb${id})`} />
        <circle cx={50} cy={50} r={29.6} fill={`url(#ww${id})`} opacity={0.9} />
        <g fill={hi} stroke={hi} strokeWidth={0} opacity={0.55}>
          {motif}
        </g>
        {/* Its shape, lit: the rounded edge, the lip, the rings and the raised motif. */}
        <g clipPath={`url(#wc${id})`}>
          <g filter={`url(#wr${id})`} fill="#fff" stroke="#fff" strokeWidth={0}>
            <path d={PUDDLE} fillOpacity={0.6} filter={`url(#we${id})`} />
            <circle cx={50} cy={50} r={31.6} fill="none" strokeOpacity={0.9} strokeWidth={5.5} />
            {rings && (
              <>
                <circle cx={50} cy={50} r={26.6} fill="none" strokeOpacity={0.35} strokeWidth={1} />
                {style !== 'single' && <circle cx={50} cy={50} r={24.3} fill="none" strokeOpacity={0.3} strokeWidth={0.9} strokeDasharray=".05 2" strokeLinecap="round" />}
              </>
            )}
            <g fillOpacity={0.95} strokeOpacity={0.95}>
              {motif}
            </g>
          </g>
        </g>
      </svg>
      {/* A slow gleam across the face (transform only; none for those who ask for less motion). */}
      {!still && (
        <div style={abs({ left: '6%', top: '6%', width: '88%', height: '88%', borderRadius: '50%', overflow: 'hidden' })}>
          <div className="wax-gleam" style={abs({ top: 0, bottom: 0, left: '-70%', width: '60%', mixBlendMode: 'soft-light', background: `linear-gradient(105deg, rgba(255,255,255,0), rgba(255,255,255,${w.metal ? 0.85 : 0.5}), rgba(255,255,255,0))` })} />
        </div>
      )}
    </div>
  );
}

/** Where the invitation's seal is and how it moves (the design's own values, from the opening style). */
export interface SealShown {
  colour: SealColour;
  design?: SealDesign;
  words: string;
  /** The seal's transform and opacity, and the envelope's zoom and fade, as the design moves them. */
  t: string;
  op: number;
  zoom: string;
  envOp: number;
}

/** The seal over the envelope, in exactly the design's place and movement (the design's own one is hidden). */
export function SealOverlay({ seal, phase }: { seal: SealShown; phase: number }) {
  if (phase >= 4) return null;
  const size = 'clamp(96px,24vmin,150px)';
  return (
    <div aria-hidden className="fixed inset-0 z-[1] pointer-events-none" style={{ transform: seal.zoom, opacity: seal.envOp, transition: 'transform 3.2s cubic-bezier(.3,0,.2,1), opacity 2s ease .3s' }}>
      <div
        data-testid="wax-seal"
        style={abs({
          left: '50%',
          top: '56%',
          width: size,
          height: size,
          transform: seal.t,
          opacity: seal.op,
          willChange: 'transform, opacity',
          transition: 'transform 3s cubic-bezier(.6,-0.35,.3,1.3), opacity 1.6s ease 1.2s',
          filter: 'drop-shadow(0 5px 8px rgba(50,30,10,.45)) drop-shadow(0 0 14px var(--gl1,rgba(255,214,140,.55)))',
        })}
      >
        <WaxSeal colour={seal.colour} design={seal.design} words={seal.words} />
      </div>
      <style>{`.wax-gleam{animation:waxGleam 5.5s ease-in-out 1.5s infinite}@keyframes waxGleam{0%{transform:translateX(0)}45%,100%{transform:translateX(330%)}}@media (prefers-reduced-motion: reduce){.wax-gleam{animation:none;opacity:0}}`}</style>
    </div>
  );
}

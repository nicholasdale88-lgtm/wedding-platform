import { ENVELOPE_PAPER_INFO, type EnvelopePaper, type SealColour, type SealLetters, type SealStyle } from '@wp/shared';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { mix } from '../themeKit';

/**
 * The wax seal, drawn in CSS and SVG (no pictures to download): an uneven drip edge, the pressed disc with
 * light and shade, a gloss (a brighter sheen on the metallic finishes), and what's pressed into it: the
 * couple's initials, a flower, initials in a wreath, one letter, a heart or the date. Also the envelope's
 * paper colours. The design's own seal (the three original colours with classic italic initials) is still
 * drawn by the generated view; anything else is drawn here, over it, moving exactly as it would.
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

// The drips around the edge (the design's own shapes): left, top, width, height, corners.
const DRIPS: [string, string, string, string, string][] = [
  ['-3%', '18%', '30%', '26%', '58% 42% 50% 50% / 46% 54% 46% 54%'],
  ['68%', '-2%', '28%', '24%', '44% 56% 52% 48% / 55% 45% 55% 45%'],
  ['76%', '60%', '24%', '26%', '52% 48% 40% 60% / 50% 50% 50% 50%'],
  ['14%', '78%', '28%', '22%', '46% 54% 60% 40% / 40% 60% 40% 60%'],
  ['44%', '85%', '16%', '14%', '50% 50% 46% 54% / 60% 40% 60% 40%'],
  ['-2%', '54%', '14%', '18%', '56% 44% 50% 50% / 50% 50% 50% 50%'],
];

const abs = (s: CSSProperties): CSSProperties => ({ position: 'absolute', ...s });

/** A motif raised out of the wax: lit from the top left, shaded bottom right. */
function Raised({ children, fill }: { children: ReactNode; fill: string }) {
  return (
    <>
      <g transform="translate(.8 .9)" fill="rgba(0,0,0,.42)" stroke="rgba(0,0,0,.42)" strokeWidth={0}>
        {children}
      </g>
      <g transform="translate(-.6 -.6)" fill="rgba(255,255,255,.4)" stroke="rgba(255,255,255,.4)" strokeWidth={0}>
        {children}
      </g>
      <g fill={fill} stroke={fill} strokeWidth={0}>
        {children}
      </g>
    </>
  );
}

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

/** Words on the seal; "&" set smaller, as on the design's seal. */
function Words({ words, letters, size, ink }: { words: string; letters: SealLetters; size: string; ink: string }) {
  const parts = words.split('&');
  return (
    <div
      style={abs({
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontStyle: letters === 'serif' ? 'normal' : 'italic',
        fontWeight: letters === 'serif' ? 600 : 500,
        textTransform: letters === 'serif' ? 'uppercase' : undefined,
        letterSpacing: letters === 'serif' ? '.05em' : '.02em',
        fontSize: size,
        lineHeight: 1,
        backgroundImage: `linear-gradient(150deg, #ffffff 0%, ${ink} 40%, ${ink} 70%, ${mix(ink, '#000000', 0.12)} 100%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
        filter: 'drop-shadow(-1px -1px 0 rgba(255,255,255,.3)) drop-shadow(1px 1px 1px rgba(0,0,0,.5))',
      })}
    >
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span style={{ fontSize: '.7em', margin: '0 3px' }}>&amp;</span>}
          {p.trim()}
        </span>
      ))}
    </div>
  );
}

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
  const letters = design?.letters ?? 'script';
  const [hi, mid, lo] = w.body;
  const [i1, i2, i3] = w.inner;
  const len = Math.max(1, words.replace(/\s/g, '').length);
  const scale = (style === 'single' ? 1.7 : style === 'date' ? 0.62 : style === 'wreath' ? 0.78 : 1) * Math.min(1, (style === 'date' ? 8 : 3.4) / Math.max(style === 'date' ? 8 : 3, len));
  const size = px ? `${(px * 0.22 * scale).toFixed(1)}px` : `calc(clamp(20px,5.4vmin,34px) * ${scale.toFixed(3)})`;
  const rings = style === 'classic' || style === 'single' || style === 'heart';
  const fill = `url(#wx${id})`;
  return (
    <div aria-hidden style={abs({ inset: 0 })}>
      {DRIPS.map(([left, top, width, height, borderRadius], i) => (
        <div key={i} style={abs({ left, top, width, height, borderRadius, background: w.drip })} />
      ))}
      <div
        style={abs({
          left: '4%',
          top: '4%',
          width: '92%',
          height: '92%',
          borderRadius: '48% 52% 46% 54% / 53% 47% 55% 45%',
          background: `radial-gradient(circle at 32% 28%, ${hi} 0%, ${mid} 45%, ${lo} 100%)`,
          boxShadow: 'inset -3px -4px 7px rgba(0,0,0,.28),inset 2px 2px 5px rgba(255,255,255,.22)',
        })}
      />
      <div style={abs({ inset: '15%', borderRadius: '50%', background: `radial-gradient(circle, ${i1} 0%, ${i2} 70%, ${i3} 100%)` })} />
      {/* A metallic finish catches the light round its rim. */}
      {w.metal && (
        <div
          style={abs({
            left: '4%',
            top: '4%',
            width: '92%',
            height: '92%',
            borderRadius: '48% 52% 46% 54% / 53% 47% 55% 45%',
            mixBlendMode: 'soft-light',
            background: 'conic-gradient(from 200deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.75) 45deg, rgba(255,255,255,0) 95deg, rgba(0,0,0,.18) 150deg, rgba(255,255,255,0) 200deg, rgba(255,255,255,.55) 250deg, rgba(255,255,255,0) 300deg)',
          })}
        />
      )}
      {/* The wax's gloss. */}
      <div style={abs({ left: '16%', top: '11%', width: '30%', height: '15%', borderRadius: '50%', transform: 'rotate(-28deg)', background: `radial-gradient(closest-side, rgba(255,255,255,${w.metal ? 0.7 : 0.45}), rgba(255,255,255,0))` })} />
      <div style={abs({ inset: '15%', borderRadius: '50%', boxShadow: 'inset 3px 4px 7px rgba(0,0,0,.45),inset -2px -2px 4px rgba(255,255,255,.28),0 0 0 2px rgba(255,255,255,.12),0 0 0 4px rgba(0,0,0,.12)' })} />
      {rings && (
        <>
          <div
            style={abs({
              inset: '19%',
              borderRadius: '50%',
              background: 'repeating-conic-gradient(rgba(255,255,255,.32) 0 4deg, transparent 4deg 12deg)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 0 66%, #000 67% 72%, transparent 73%)',
              maskImage: 'radial-gradient(circle, transparent 0 66%, #000 67% 72%, transparent 73%)',
            })}
          />
          {style !== 'single' && <div style={abs({ inset: '27%', borderRadius: '50%', border: '1px solid rgba(255,255,255,.22)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' })} />}
        </>
      )}
      {(style === 'floral' || style === 'wreath' || style === 'heart' || style === 'date') && (
        <svg viewBox="0 0 100 100" style={abs({ inset: 0, width: '100%', height: '100%', overflow: 'visible' })}>
          <defs>
            <linearGradient id={`wx${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset=".4" stopColor={w.ink} />
              <stop offset="1" stopColor={mix(w.ink, '#000000', 0.15)} />
            </linearGradient>
          </defs>
          <Raised fill={fill}>
            {style === 'floral' && <Bloom />}
            {style === 'wreath' && <Wreath />}
            {style === 'heart' && <path d={HEART} />}
            {style === 'date' && (
              <>
                <circle cx={50} cy={50} r={29} fill="none" strokeWidth={0.8} />
                <circle cx={50} cy={50} r={26.5} fill="none" strokeWidth={0.4} />
                {[-1, 1].map((d) => (
                  <g key={d}>
                    <path d={`M ${50 - 9} ${50 + d * 12} L ${50 + 9} ${50 + d * 12}`} fill="none" strokeWidth={0.7} />
                    <circle cx={50} cy={50 + d * 12} r={1.4} />
                  </g>
                ))}
              </>
            )}
          </Raised>
        </svg>
      )}
      {words && style !== 'floral' && style !== 'heart' && <Words words={words} letters={letters} size={size} ink={w.ink} />}
      {/* A slow gleam across the face (transform only; none for those who ask for less motion). */}
      {!still && (
        <div style={abs({ left: '4%', top: '4%', width: '92%', height: '92%', borderRadius: '50%', overflow: 'hidden' })}>
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

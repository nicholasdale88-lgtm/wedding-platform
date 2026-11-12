import type { Scene } from '@wp/shared';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { mix } from '../themeKit';
import { prefersLessMotion } from './openings';

/**
 * Opening scenes: the whole screen is a scene the guest opens with a tap, in place of the envelope. Our own
 * artwork, drawn here in SVG and coloured from the design's palette, so every design can have any scene:
 * - doors: tall panelled doors with a pressed floral relief and a wax seal across the seam; the seal
 *   splits and the doors swing open;
 * - bow: satin paper tied with a satin ribbon and a pearl; the bow unties and the ribbons slide away;
 * - curtain: velvet theatre curtains under a swagged pelmet; they draw apart;
 * - lanterns: a garden at night with paper lanterns; they rise into the sky.
 *
 * Each piece is drawn once as an image (an SVG relief made with lighting filters), then only moved
 * (transform and opacity), so it stays smooth on a phone. The tap itself is the invitation's own (the
 * scene lets it through). Phases are the envelope's: 0 closed, 1 tapped, 2 opening, 3 card out, 4 gone.
 */

export interface SceneColours {
  paper: string;
  ink: string;
  accent: string;
  soft: string;
  envelope: string;
}

const svgUrl = (body: string, w: number, h: number, ratio = 'xMidYMid slice') =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' preserveAspectRatio='${ratio}'>${body}</svg>`)}")`;
const dark = (c: string, t: number) => mix(c, '#000000', t);
const light = (c: string, t: number) => mix(c, '#ffffff', t);
/** The same spread every time (no jumping about on re-render). */
const rnd = (i: number, k: number) => {
  const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const f1 = (n: number) => n.toFixed(1);

/**
 * A pressed relief: whatever is drawn inside (white, its opacity the height) is lit from the top left, and
 * only the light and the shade are kept, so it lies on any colour beneath.
 */
const RELIEF = (id: string, depth = 5, strength = 1.5) => `
<filter id='${id}' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
  <feGaussianBlur in='SourceAlpha' stdDeviation='1.4' result='h'/>
  <feDiffuseLighting in='h' surfaceScale='${depth}' diffuseConstant='0.7071' lighting-color='#fff' result='l'><feDistantLight azimuth='225' elevation='45'/></feDiffuseLighting>
  <feColorMatrix in='l' type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${2 * strength} 0 0 0 ${-strength}' result='hi'/>
  <feColorMatrix in='l' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${-2 * strength} 0 0 0 ${strength}' result='lo'/>
  <feMerge><feMergeNode in='lo'/><feMergeNode in='hi'/></feMerge>
</filter>`;
/** Fine grain over a surface (velvet, leather, satin). */
const GRAIN = (id: string, freq = 0.9, alpha = 0.08) => `
<filter id='${id}' x='0' y='0' width='100%' height='100%'>
  <feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='2' seed='7' result='n'/>
  <feColorMatrix in='n' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha * 4} ${-alpha}'/>
</filter>`;

// ------------------------------------------------------------------------------------------------ flowers

/** One petal pointing up from its base: broad, with a soft notch at the tip. */
const petal = (l: number, w: number) =>
  `M0 0 C${f1(-w)} ${f1(-l * 0.25)} ${f1(-w * 1.05)} ${f1(-l * 0.85)} ${f1(-w * 0.45)} ${f1(-l)} Q0 ${f1(-l * 0.9)} ${f1(w * 0.45)} ${f1(-l)} C${f1(w * 1.05)} ${f1(-l * 0.85)} ${f1(w)} ${f1(-l * 0.25)} 0 0Z`;
/** A full bloom: rings of petals, each ring a little higher (more opaque), and a centre of stamens. */
function bloom(cx: number, cy: number, r: number, turn = 0): string {
  const rings = [
    { n: 9, l: r, w: r * 0.42, o: 0.32 },
    { n: 8, l: r * 0.8, w: r * 0.38, o: 0.34 },
    { n: 7, l: r * 0.6, w: r * 0.32, o: 0.36 },
    { n: 6, l: r * 0.4, w: r * 0.24, o: 0.4 },
  ];
  let out = '';
  rings.forEach((ring, k) => {
    for (let i = 0; i < ring.n; i++) {
      const a = turn + (i * 360) / ring.n + k * 17;
      out += `<path d='${petal(ring.l, ring.w)}' fill='#fff' fill-opacity='${ring.o}' transform='translate(${f1(cx)} ${f1(cy)}) rotate(${f1(a)}) translate(0 ${f1(-r * 0.04)})'/>`;
    }
  });
  for (let i = 0; i < 14; i++) {
    const a = (i * 137.5 * Math.PI) / 180;
    const d = r * 0.16 * Math.sqrt((i + 1) / 14);
    out += `<circle cx='${f1(cx + Math.cos(a) * d)}' cy='${f1(cy + Math.sin(a) * d)}' r='${f1(r * 0.035)}' fill='#fff' fill-opacity='.7'/>`;
  }
  return out;
}
/** A bud: three closed petals. */
const bud = (cx: number, cy: number, r: number, a: number) =>
  [-22, 22, 0].map((d, i) => `<path d='${petal(r, r * 0.42)}' fill='#fff' fill-opacity='${0.35 + i * 0.1}' transform='translate(${f1(cx)} ${f1(cy)}) rotate(${a + d})'/>`).join('');
/** A leaf with a raised vein. */
const leaf = (x: number, y: number, l: number, a: number) =>
  `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})'><path d='M0 0 Q${f1(l * 0.32)} ${f1(-l * 0.5)} 0 ${f1(-l)} Q${f1(-l * 0.32)} ${f1(-l * 0.5)} 0 0Z' fill='#fff' fill-opacity='.38'/><path d='M0 0 L0 ${f1(-l * 0.92)}' stroke='#fff' stroke-opacity='.4' stroke-width='2'/></g>`;
/** A stem with leaves along it. */
function vine(d: string, leaves: [number, number, number, number][]) {
  return `<path d='${d}' fill='none' stroke='#fff' stroke-opacity='.42' stroke-width='5' stroke-linecap='round'/>${leaves.map(([x, y, l, a]) => leaf(x, y, l, a)).join('')}`;
}

// ------------------------------------------------------------------------------------------------ doors

/** A door (the right one the left's mirror image, lit from the same side): tall and narrow like a phone, panelled, with a pressed floral relief. */
function doorArt(c: SceneColours, mirror = false): string {
  const door = c.envelope;
  const relief = `
    <rect x='14' y='18' width='272' height='964' rx='4' fill='none' stroke='#fff' stroke-opacity='.5' stroke-width='10'/>
    <rect x='30' y='34' width='240' height='932' rx='3' fill='none' stroke='#fff' stroke-opacity='.65' stroke-width='2.5'/>
    <path d='M48 940 V250 A102 102 0 0 1 252 250 V940 Z' fill='none' stroke='#fff' stroke-opacity='.55' stroke-width='7'/>
    <path d='M62 926 V252 A88 88 0 0 1 238 252 V926 Z' fill='none' stroke='#fff' stroke-opacity='.7' stroke-width='2'/>
    ${vine('M150 915 C118 840 186 780 146 690 S104 560 150 470', [
      [130, 860, 52, -60],
      [172, 800, 48, 55],
      [122, 720, 44, -70],
      [166, 640, 46, 40],
      [126, 575, 40, -50],
    ])}
    ${vine('M92 915 C86 860 72 830 84 780', [
      [88, 880, 34, -40],
      [76, 820, 30, 30],
    ])}
    ${vine('M210 915 C220 870 236 840 224 790', [
      [218, 880, 32, 45],
      [232, 830, 30, -20],
    ])}
    ${bloom(150, 380, 84, 8)}
    ${bloom(94, 690, 44, 30)}
    ${bloom(210, 735, 38, 12)}
    ${bud(198, 230, 26, 30)}
    ${bud(104, 238, 23, -35)}
    ${leaf(214, 450, 52, 120)}
    ${leaf(86, 450, 50, -125)}
    ${leaf(222, 310, 42, 70)}
    ${leaf(78, 312, 40, -70)}
    ${bloom(150, 116, 30, 0)}
    ${leaf(196, 120, 34, 95)}
    ${leaf(104, 120, 34, -95)}`;
  return svgUrl(
    `<defs>${RELIEF('r', 6, 1.6)}${GRAIN('g', 0.75, 0.07)}
      <linearGradient id='sh' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.12'/><stop offset='.55' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.2'/></linearGradient>
      <linearGradient id='seam' x1='${mirror ? 1 : 0}' x2='${mirror ? 0 : 1}'><stop offset='.84' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.34'/></linearGradient>
    </defs>
    <rect width='300' height='1000' fill='${door}'/>
    <rect width='300' height='1000' fill='url(#sh)'/>
    <g filter='url(#r)'><g transform='${mirror ? 'translate(300 0) scale(-1 1)' : ''}'>${relief}</g></g>
    <rect width='300' height='1000' filter='url(#g)'/>
    <rect width='300' height='1000' fill='url(#seam)'/>`,
    300,
    1000,
  );
}

/** A wax seal (pressed with their initials), as one image: each door shows its own half. */
function sealArt(colour: string, initials: string): string {
  const pts = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    const r = 96 + (rnd(i, 3) - 0.5) * 9 + (i % 2 ? 3 : -2);
    return `${f1(110 + Math.cos(a) * r)},${f1(110 + Math.sin(a) * r)}`;
  }).join(' ');
  const text = initials.replace(/&/g, '&amp;').replace(/</g, '');
  return svgUrl(
    `<defs>${RELIEF('sr', 4, 1.8)}
      <radialGradient id='w' cx='.38' cy='.32' r='.8'><stop offset='0' stop-color='${light(colour, 0.35)}'/><stop offset='.6' stop-color='${colour}'/><stop offset='1' stop-color='${dark(colour, 0.32)}'/></radialGradient>
      <filter id='ds' x='-20%' y='-20%' width='140%' height='140%'><feDropShadow dx='0' dy='5' stdDeviation='5' flood-color='#000' flood-opacity='.4'/></filter>
    </defs>
    <polygon points='${pts}' fill='url(#w)' filter='url(#ds)'/>
    <g filter='url(#sr)'>
      <polygon points='${pts}' fill='#fff' fill-opacity='.35'/>
      <circle cx='110' cy='110' r='68' fill='none' stroke='#fff' stroke-opacity='.7' stroke-width='5'/>
      <circle cx='110' cy='110' r='60' fill='#fff' fill-opacity='.25'/>
      <text x='110' y='126' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='46' fill='#fff' fill-opacity='.85'>${text}</text>
    </g>`,
    220,
    220,
    'xMidYMid meet',
  );
}

// ------------------------------------------------------------------------------------------------ bow

/** Satin: bands of light and shade across a ribbon (as a CSS gradient, across its width). */
const satin = (c: string, dir = '90deg') =>
  `linear-gradient(${dir}, ${dark(c, 0.28)} 0%, ${c} 14%, ${light(c, 0.55)} 30%, ${light(c, 0.2)} 42%, ${dark(c, 0.08)} 58%, ${light(c, 0.38)} 74%, ${c} 86%, ${dark(c, 0.3)} 100%)`;

/** A satin bow: two full loops (their insides in shade), two tails cut in a V, the knot and a pearl. */
function bowArt(c: string): string {
  const loop = (flip: number) => `<g transform='scale(${flip} 1)'>
      <path d='M0 -6 C30 -84 168 -126 196 -54 C212 -12 182 40 124 36 C74 32 32 16 0 6Z' fill='url(#lg)'/>
      <path d='M16 -4 C52 -52 146 -84 168 -46 C178 -24 158 6 116 6 C76 6 44 4 16 -4Z' fill='url(#ins)'/>
      <path d='M20 -14 C60 -76 160 -108 186 -56' fill='none' stroke='${light(c, 0.75)}' stroke-opacity='.85' stroke-width='4' stroke-linecap='round'/>
      <path d='M118 34 C150 34 186 18 194 -18' fill='none' stroke='${dark(c, 0.35)}' stroke-opacity='.5' stroke-width='3' stroke-linecap='round'/>
      <path d='M0 -6 L26 -2 L0 6Z' fill='${dark(c, 0.4)}' fill-opacity='.55'/>
    </g>`;
  const tail = (flip: number) => `<g transform='scale(${flip} 1)'>
      <path d='M-4 8 C18 70 44 140 92 214 L62 200 L50 232 C18 160 -6 90 -22 16Z' fill='url(#tg)'/>
      <path d='M-4 8 C18 70 44 140 92 214' fill='none' stroke='${light(c, 0.65)}' stroke-opacity='.7' stroke-width='2.5'/>
      <path d='M-16 30 C2 90 22 150 50 230' fill='none' stroke='${dark(c, 0.3)}' stroke-opacity='.35' stroke-width='2'/>
    </g>`;
  return svgUrl(
    `<defs>
      <linearGradient id='lg' x1='0' y1='-1' x2='.35' y2='.7'><stop offset='0' stop-color='${light(c, 0.6)}'/><stop offset='.3' stop-color='${light(c, 0.15)}'/><stop offset='.55' stop-color='${light(c, 0.45)}'/><stop offset='.8' stop-color='${c}'/><stop offset='1' stop-color='${dark(c, 0.3)}'/></linearGradient>
      <radialGradient id='ins' cx='.3' cy='.55' r='.8'><stop offset='0' stop-color='${dark(c, 0.45)}'/><stop offset='.7' stop-color='${dark(c, 0.2)}'/><stop offset='1' stop-color='${c}'/></radialGradient>
      <linearGradient id='tg' x1='0' y1='0' x2='1' y2='.3'><stop offset='0' stop-color='${dark(c, 0.25)}'/><stop offset='.35' stop-color='${light(c, 0.45)}'/><stop offset='.65' stop-color='${c}'/><stop offset='1' stop-color='${dark(c, 0.3)}'/></linearGradient>
      <radialGradient id='kg' cx='.4' cy='.3' r='.75'><stop offset='0' stop-color='${light(c, 0.55)}'/><stop offset='.6' stop-color='${c}'/><stop offset='1' stop-color='${dark(c, 0.35)}'/></radialGradient>
      <radialGradient id='pearl' cx='.36' cy='.32' r='.75'><stop offset='0' stop-color='#ffffff'/><stop offset='.45' stop-color='#f3efe8'/><stop offset='.85' stop-color='#c9c2b6'/><stop offset='1' stop-color='#a69f93'/></radialGradient>
      <filter id='bs' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='10' stdDeviation='9' flood-color='#000' flood-opacity='.3'/></filter>
    </defs>
    <g transform='translate(220 150)' filter='url(#bs)'>
      ${tail(-1)}${tail(1)}${loop(-1)}${loop(1)}
      <path d='M-28 -24 C-10 -32 10 -32 28 -24 C34 -6 34 10 26 26 C8 32 -8 32 -26 26 C-34 10 -34 -6 -28 -24Z' fill='url(#kg)'/>
      <path d='M-20 -18 C-6 -24 6 -24 20 -18' fill='none' stroke='${light(c, 0.7)}' stroke-opacity='.7' stroke-width='2'/>
      <circle cx='0' cy='0' r='16' fill='url(#pearl)'/>
      <ellipse cx='-5' cy='-6' rx='5' ry='3.4' fill='#fff' fill-opacity='.95'/>
    </g>`,
    440,
    400,
    'xMidYMid meet',
  );
}

/** Satin paper with a faint pressed damask. */
function satinPaper(c: SceneColours): string {
  const base = light(c.soft, 0.35);
  let damask = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) damask += bloom(x * 220 + (y % 2) * 110, y * 240 + 60, 46, y * 11);
  return svgUrl(
    `<defs>${RELIEF('d', 3, 0.9)}${GRAIN('g', 1.1, 0.05)}
      <linearGradient id='sheen' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.35'/><stop offset='.4' stop-color='#fff' stop-opacity='0'/><stop offset='.62' stop-color='#fff' stop-opacity='.22'/><stop offset='1' stop-color='#000' stop-opacity='.08'/></linearGradient>
    </defs>
    <rect width='500' height='1000' fill='${base}'/>
    <g filter='url(#d)'>${damask}</g>
    <rect width='500' height='1000' fill='url(#sheen)'/>
    <rect width='500' height='1000' filter='url(#g)'/>`,
    500,
    1000,
  );
}

// ------------------------------------------------------------------------------------------------ curtains

function curtainArt(c: SceneColours, side: 1 | -1): string {
  const v = c.envelope;
  // Folds: uneven, each with its shade, ridge and shade.
  let x = 0;
  let folds = '';
  let i = 0;
  while (x < 520) {
    const w = 46 + rnd(i, side > 0 ? 1 : 2) * 34;
    folds += `<rect x='${f1(x)}' y='0' width='${f1(w + 1)}' height='1000' fill='url(#fold)'/>`;
    x += w;
    i++;
  }
  const fringe = Array.from({ length: 64 }, (_, k) => `<rect x='${k * 8}' y='952' width='3' height='${f1(30 + rnd(k, 9) * 8)}' rx='1.5' fill='${c.accent}'/>`).join('');
  return svgUrl(
    `<defs>${GRAIN('g', 0.95, 0.09)}
      <linearGradient id='fold' x1='0' x2='1'><stop offset='0' stop-color='${dark(v, 0.45)}'/><stop offset='.32' stop-color='${dark(v, 0.08)}'/><stop offset='.5' stop-color='${light(v, 0.22)}'/><stop offset='.68' stop-color='${v}'/><stop offset='1' stop-color='${dark(v, 0.5)}'/></linearGradient>
      <linearGradient id='fall' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#000' stop-opacity='.35'/><stop offset='.25' stop-color='#000' stop-opacity='0'/><stop offset='.85' stop-color='#000' stop-opacity='.05'/><stop offset='1' stop-color='#000' stop-opacity='.4'/></linearGradient>
      <linearGradient id='gold' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${light(c.accent, 0.45)}'/><stop offset='.5' stop-color='${c.accent}'/><stop offset='1' stop-color='${dark(c.accent, 0.35)}'/></linearGradient>
    </defs>
    ${folds}
    <rect width='520' height='1000' fill='url(#fall)'/>
    <rect width='520' height='1000' filter='url(#g)'/>
    <rect x='0' y='938' width='520' height='16' fill='url(#gold)'/>
    ${fringe}`,
    500,
    1000,
    side > 0 ? 'xMinYMid slice' : 'xMaxYMid slice',
  );
}

function pelmetArt(c: SceneColours, initials: string): string {
  const v = dark(c.envelope, 0.12);
  const swag = (x0: number, w: number) =>
    `<path d='M${x0} 0 H${x0 + w} V120 Q${x0 + w / 2} 230 ${x0} 120Z' fill='url(#sw)'/>
     <path d='M${x0 + 8} 128 Q${x0 + w / 2} 222 ${x0 + w - 8} 128' fill='none' stroke='${dark(v, 0.4)}' stroke-opacity='.55' stroke-width='6'/>
     <path d='M${x0 + 18} 100 Q${x0 + w / 2} 190 ${x0 + w - 18} 100' fill='none' stroke='${light(v, 0.25)}' stroke-opacity='.35' stroke-width='4'/>
     <path d='M${x0} 120 Q${x0 + w / 2} 230 ${x0 + w} 120' fill='none' stroke='url(#gold)' stroke-width='7'/>`;
  const tassel = (x: number) =>
    `<g transform='translate(${x} 128)'><circle r='9' fill='url(#gold)'/><path d='M-8 6 L-11 52 Q0 58 11 52 L8 6Z' fill='url(#gold)'/><path d='M-6 14 V50 M0 14 V54 M6 14 V50' stroke='${dark(c.accent, 0.35)}' stroke-width='1.4'/></g>`;
  const text = initials.replace(/&/g, '&amp;').replace(/</g, '');
  return svgUrl(
    `<defs>${GRAIN('g', 0.95, 0.09)}
      <linearGradient id='sw' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${dark(v, 0.35)}'/><stop offset='.45' stop-color='${v}'/><stop offset='.8' stop-color='${light(v, 0.12)}'/><stop offset='1' stop-color='${dark(v, 0.3)}'/></linearGradient>
      <linearGradient id='gold' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${light(c.accent, 0.5)}'/><stop offset='.5' stop-color='${c.accent}'/><stop offset='1' stop-color='${dark(c.accent, 0.35)}'/></linearGradient>
      <filter id='ps' x='-5%' y='-5%' width='110%' height='130%'><feDropShadow dx='0' dy='10' stdDeviation='10' flood-color='#000' flood-opacity='.45'/></filter>
    </defs>
    <g filter='url(#ps)'>
      <rect x='0' y='0' width='1000' height='70' fill='${dark(v, 0.2)}'/>
      ${swag(0, 340)}${swag(330, 340)}${swag(660, 340)}
      <rect x='0' y='58' width='1000' height='10' fill='url(#gold)'/>
    </g>
    ${tassel(335)}${tassel(665)}
    <text x='500' y='48' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='34' fill='url(#gold)'>${text}</text>
    <rect width='1000' height='240' filter='url(#g)'/>`,
    1000,
    240,
    'xMidYMin slice',
  );
}

// ------------------------------------------------------------------------------------------------ lanterns

/** A garden at night: stars, a crescent moon, fairy lights on a string, a glowing arbour among the trees. */
function nightArt(c: SceneColours): string {
  const sky = dark(c.envelope, 0.35);
  const glow = mix(c.accent, c.envelope, 0.25);
  const stars = Array.from({ length: 90 }, (_, i) => `<circle cx='${f1(rnd(i, 1) * 500)}' cy='${f1(rnd(i, 2) * 640)}' r='${f1(0.5 + rnd(i, 3) * 1.4)}' fill='#fff' fill-opacity='${f1(0.35 + rnd(i, 4) * 0.6)}'/>`).join('');
  const far = mix(dark(c.envelope, 0.55), glow, 0.12);
  const near = dark(c.envelope, 0.72);
  const bulbs = Array.from({ length: 15 }, (_, i) => {
    const t = i / 14;
    const x = -10 + t * 520;
    const y = 120 + Math.sin(t * Math.PI) * 70 + (t > 0.5 ? (t - 0.5) * 40 : 0);
    return `<circle cx='${f1(x)}' cy='${f1(y + 8)}' r='14' fill='url(#bulb)'/><circle cx='${f1(x)}' cy='${f1(y + 8)}' r='3' fill='#fff8e0'/>`;
  }).join('');
  const cypress = (x: number, h: number) => `<path d='M${x} 900 C${x - 16} ${900 - h * 0.4} ${x - 10} ${900 - h * 0.85} ${x} ${900 - h} C${x + 10} ${900 - h * 0.85} ${x + 16} ${900 - h * 0.4} ${x} 900Z' fill='${near}'/>`;
  const canopy = (x: number, y: number, r: number) =>
    `<rect x='${x - 4}' y='${y}' width='8' height='${900 - y}' fill='${near}'/>` +
    ([[-0.6, 0.1, 0.62], [0.55, 0.15, 0.6], [0, -0.35, 0.7], [-0.25, 0.3, 0.55], [0.3, 0.32, 0.55]] as [number, number, number][]).map(([dx, dy, k]) => `<circle cx='${f1(x + dx * r)}' cy='${f1(y + dy * r)}' r='${f1(r * k)}' fill='${near}'/>`).join('');
  // Little lights along the arbour.
  const arcLights = Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI + (i / 12) * Math.PI;
    return `<circle cx='${f1(250 + Math.cos(a) * 92)}' cy='${f1(800 + Math.sin(a) * 92)}' r='5' fill='url(#bulb)'/><circle cx='${f1(250 + Math.cos(a) * 92)}' cy='${f1(800 + Math.sin(a) * 92)}' r='1.6' fill='#fff8e0'/>`;
  }).join('');
  return svgUrl(
    `<defs>
      <linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${dark(sky, 0.35)}'/><stop offset='.55' stop-color='${sky}'/><stop offset='.82' stop-color='${mix(sky, glow, 0.45)}'/><stop offset='1' stop-color='${mix(sky, glow, 0.6)}'/></linearGradient>
      <radialGradient id='hz' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='${light(glow, 0.2)}' stop-opacity='.75'/><stop offset='1' stop-color='${glow}' stop-opacity='0'/></radialGradient>
      <radialGradient id='moonglow' cx='.5' cy='.5' r='.5'><stop offset='.4' stop-color='#fffbe9' stop-opacity='.35'/><stop offset='1' stop-color='#fffbe9' stop-opacity='0'/></radialGradient>
      <radialGradient id='bulb' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff3c4' stop-opacity='.95'/><stop offset='.35' stop-color='${light(c.accent, 0.3)}' stop-opacity='.55'/><stop offset='1' stop-color='${c.accent}' stop-opacity='0'/></radialGradient>
      <radialGradient id='arch' cx='.5' cy='.7' r='.6'><stop offset='0' stop-color='#fff1c8' stop-opacity='.95'/><stop offset='.45' stop-color='${light(c.accent, 0.2)}' stop-opacity='.6'/><stop offset='1' stop-color='${c.accent}' stop-opacity='0'/></radialGradient>
      <mask id='cres'><rect width='500' height='1000' fill='#fff'/><circle cx='402' cy='236' r='32' fill='#000'/></mask>
    </defs>
    <rect width='500' height='1000' fill='url(#sky)'/>
    ${stars}
    <circle cx='384' cy='250' r='90' fill='url(#moonglow)'/>
    <circle cx='384' cy='250' r='36' fill='#fffbe9' mask='url(#cres)'/>
    <path d='M-10 112 Q250 230 510 140' fill='none' stroke='${dark(c.envelope, 0.7)}' stroke-width='2'/>
    ${bulbs}
    <ellipse cx='250' cy='800' rx='420' ry='170' fill='url(#hz)'/>
    <path d='M0 820 C70 790 130 800 200 785 C260 772 320 790 380 778 C430 770 470 784 500 780 V1000 H0Z' fill='${far}'/>
    ${canopy(120, 720, 70)}${canopy(390, 735, 62)}
    ${cypress(40, 280)}${cypress(70, 230)}${cypress(440, 270)}${cypress(468, 220)}
    <ellipse cx='250' cy='830' rx='110' ry='120' fill='url(#arch)'/>
    <path d='M150 905 V800 A100 100 0 0 1 350 800 V905 H334 V802 A84 84 0 0 0 166 802 V905Z' fill='${near}'/>
    ${arcLights}
    <path d='M0 905 C60 890 120 912 180 900 C250 886 320 910 380 896 C430 888 470 900 500 896 V1000 H0Z' fill='${dark(near, 0.2)}'/>
    <path d='M226 1000 L240 905 H260 L274 1000Z' fill='${light(c.accent, 0.1)}' fill-opacity='.18'/>`,
    500,
    1000,
    'xMidYMax slice',
  );
}

// ------------------------------------------------------------------------------------------------ the scene

const LAYER: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };

export function SceneOverlay({ kind, phase: p, colours: c, initials, guestName }: { kind: Exclude<Scene, 'auto' | 'none'>; phase: number; colours: SceneColours; initials: string; guestName: string }) {
  const still = useMemo(() => prefersLessMotion(), []);
  const art = useMemo(() => {
    if (kind === 'doors') return { door: doorArt(c), door2: doorArt(c, true), seal: sealArt(mix(c.soft, c.accent, 0.35), initials) };
    if (kind === 'bow') return { paper: satinPaper(c), bow: bowArt(mix(c.soft, c.ink, 0.18)) };
    if (kind === 'curtain') return { left: curtainArt(c, 1), right: curtainArt(c, -1), pelmet: pelmetArt(c, initials) };
    return { night: nightArt(c) };
  }, [kind, c, initials]);
  if (p >= 3) return null;
  const open = p >= 1;
  const gone = p >= 2;
  const ease = 'cubic-bezier(.62,.04,.28,1)';
  const t = (s: number, delay = 0) => (still ? 'opacity .4s ease' : `transform ${s}s ${ease} ${delay}s, opacity ${Math.min(s, 0.9)}s ease ${delay}s`);
  let body: ReactNode = null;

  if (kind === 'doors') {
    // Hinged at the screen's edges, both swinging toward the guest.
    const doorStyle = (side: 'left' | 'right'): CSSProperties => ({
      position: 'absolute',
      top: 0,
      bottom: 0,
      [side]: 0,
      width: '50.2%',
      transform: `rotateY(${open && !still ? (side === 'left' ? -108 : 108) : 0}deg)`,
      transformOrigin: side === 'left' ? 'left center' : 'right center',
      transition: t(2.3, 0.35),
      boxShadow: open ? '0 0 60px rgba(0,0,0,.45)' : 'none',
      overflow: 'hidden',
      willChange: 'transform',
      backfaceVisibility: 'hidden',
    });
    // The right door is drawn as the left one's mirror image (flipping it on screen can show black on some phones).
    const panel = (mirror: boolean): CSSProperties => ({ position: 'absolute', inset: 0, backgroundImage: mirror ? art.door2 : art.door, backgroundSize: 'cover', backgroundPosition: 'center' });
    // The seal sits across the seam: each door shows its own half, so it splits as they open.
    const half = (side: 'left' | 'right'): CSSProperties => ({
      position: 'absolute',
      top: '50%',
      [side === 'left' ? 'right' : 'left']: 0,
      width: 'min(30vw,128px)',
      height: 'min(30vw,128px)',
      transform: `translate(${side === 'left' ? '50%' : '-50%'},-50%) scale(${p === 1 ? 1.06 : 1})`,
      backgroundImage: art.seal,
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      transition: 'transform .3s ease',
    });
    body = (
      <div style={{ ...LAYER, perspective: '1600px', background: `radial-gradient(circle at 50% 45%, ${light(c.paper, 0.4)}, ${c.paper} 60%)` }}>
        <div style={doorStyle('left')}>
          <div style={panel(false)} />
          <div style={half('left')} />
        </div>
        <div style={doorStyle('right')}>
          <div style={panel(true)} />
          <div style={half('right')} />
        </div>
      </div>
    );
  } else if (kind === 'bow') {
    const ribbon = mix(c.soft, c.ink, 0.18);
    body = (
      <div style={{ ...LAYER, backgroundImage: art.paper, backgroundSize: 'cover', transform: open && !still ? 'translateY(-104%)' : 'none', transition: t(1.5, 1.05) }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 58, marginLeft: -29, background: satin(ribbon), boxShadow: '0 0 14px rgba(0,0,0,.18)', transform: open && !still ? 'translateY(100%)' : 'none', transition: t(1.1, 0.45) }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '44%', height: 58, marginTop: -29, background: satin(ribbon, '180deg'), boxShadow: '0 0 14px rgba(0,0,0,.18)', transform: open && !still ? 'translateX(100%)' : 'none', transition: t(1.1, 0.5) }} />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '44%',
            width: 'min(96vw,460px)',
            aspectRatio: '440 / 400',
            transform: `translate(-50%,-37.5%) scale(${open && !still ? 0.15 : p === 1 ? 1.04 : 1}) rotate(${open && !still ? -25 : 0}deg)`,
            opacity: open ? 0 : 1,
            backgroundImage: art.bow,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            transition: t(0.9, 0),
          }}
        />
      </div>
    );
  } else if (kind === 'curtain') {
    const side = (s: 'left' | 'right'): CSSProperties => ({
      position: 'absolute',
      top: 0,
      bottom: 0,
      [s]: 0,
      width: '52%',
      backgroundImage: s === 'left' ? art.left : art.right,
      backgroundSize: 'cover',
      transform: open && !still ? `translateX(${s === 'left' ? -86 : 86}%) scaleX(.55)` : 'none',
      transformOrigin: s === 'left' ? 'left center' : 'right center',
      transition: t(2.4, 0.2),
      boxShadow: s === 'left' ? '8px 0 24px rgba(0,0,0,.35)' : '-8px 0 24px rgba(0,0,0,.35)',
      willChange: 'transform',
    });
    body = (
      <div style={{ ...LAYER, background: `radial-gradient(ellipse at 50% 38%, ${light(c.paper, 0.5)} 0%, ${mix(c.paper, c.envelope, 0.25)} 45%, ${dark(c.envelope, 0.55)} 100%)` }}>
        <div style={side('left')} />
        <div style={side('right')} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 'min(26vh,240px)', backgroundImage: art.pelmet, backgroundSize: 'cover', backgroundPosition: 'center top', transform: open && !still ? 'translateY(-110%)' : 'none', transition: t(1.2, 1.4) }} />
      </div>
    );
  } else {
    const lanterns = Array.from({ length: 9 }, (_, i) => {
      const left = 8 + ((i * 37) % 84);
      const size = 34 + rnd(i, 5) * 26;
      const bottom = 6 + rnd(i, 6) * 26;
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${left}%`,
            bottom: `${bottom}%`,
            width: size,
            height: size * 1.25,
            borderRadius: '42% 42% 34% 34%',
            background: `radial-gradient(circle at 50% 62%, #fff7d6 0%, ${light(c.accent, 0.35)} 32%, ${c.accent} 62%, ${dark(c.accent, 0.35)} 100%)`,
            boxShadow: `0 0 ${f1(size * 0.9)}px ${f1(size * 0.3)}px ${light(c.accent, 0.2)}88`,
            transform: open && !still ? `translate(${f1((rnd(i, 7) - 0.5) * 120)}px, -${f1(110 + rnd(i, 8) * 40)}vh) scale(.55)` : 'none',
            transition: still ? 'opacity .4s ease' : `transform ${f1(2.6 + rnd(i, 9) * 1.2)}s cubic-bezier(.45,0,.4,1) ${f1(rnd(i, 10) * 0.6)}s`,
            animation: open || still ? undefined : `ylBob ${f1(3 + rnd(i, 11) * 2)}s ease-in-out ${f1(-rnd(i, 12) * 3)}s infinite`,
          }}
        />
      );
    });
    body = (
      <div style={{ ...LAYER, backgroundImage: art.night, backgroundSize: 'cover', backgroundPosition: 'center bottom' }}>
        {lanterns}
        <div style={{ ...LAYER, background: `linear-gradient(to top, ${light(c.accent, 0.5)}, transparent 70%)`, opacity: open ? 0.55 : 0, transition: 'opacity 2s ease .6s' }} />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-scene={kind}
      style={{ position: 'fixed', inset: 0, zIndex: 25, pointerEvents: 'none', overflow: 'hidden', opacity: gone ? 0 : 1, transition: 'opacity .9s ease' }}
    >
      <style>{`@keyframes ylBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } } @keyframes ylHint { 0%,100% { opacity: .65 } 50% { opacity: 1 } }`}</style>
      {body}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 'calc(9vh + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          color: kind === 'bow' ? c.ink : '#fbf6ea',
          textShadow: kind === 'bow' ? 'none' : '0 2px 10px rgba(0,0,0,.45)',
          opacity: open ? 0 : 1,
          transition: 'opacity .5s ease',
        }}
      >
        {guestName && <span style={{ fontFamily: "'Pinyon Script', cursive", fontSize: 'clamp(28px,8vw,40px)', lineHeight: 1.1 }}>{guestName}</span>}
        <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: 'italic', fontSize: 19, letterSpacing: '.06em', animation: still ? undefined : 'ylHint 2.4s ease-in-out infinite' }}>Tap to open</span>
      </div>
    </div>
  );
}

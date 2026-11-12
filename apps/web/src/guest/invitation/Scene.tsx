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

/** One petal pointing up from its base: broad, with a ruffled tip (three soft scallops). */
const petal = (l: number, w: number) =>
  `M0 0 C${f1(-w)} ${f1(-l * 0.25)} ${f1(-w * 1.05)} ${f1(-l * 0.82)} ${f1(-w * 0.55)} ${f1(-l * 0.96)} Q${f1(-w * 0.32)} ${f1(-l * 1.04)} ${f1(-w * 0.16)} ${f1(-l * 0.93)} Q0 ${f1(-l * 1.03)} ${f1(w * 0.16)} ${f1(-l * 0.93)} Q${f1(w * 0.32)} ${f1(-l * 1.04)} ${f1(w * 0.55)} ${f1(-l * 0.96)} C${f1(w * 1.05)} ${f1(-l * 0.82)} ${f1(w)} ${f1(-l * 0.25)} 0 0Z`;
/** A petal's fine veins, fanning from its base. */
const veins = (l: number, w: number) =>
  [-0.5, -0.22, 0, 0.22, 0.5].map((k) => `<path d='M0 ${f1(-l * 0.08)} Q${f1(w * k * 0.6)} ${f1(-l * 0.5)} ${f1(w * k)} ${f1(-l * 0.86)}' fill='none' stroke='#fff' stroke-opacity='.22' stroke-width='.9'/>`).join('');
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
      const at = `translate(${f1(cx)} ${f1(cy)}) rotate(${f1(a)}) translate(0 ${f1(-r * 0.04)})`;
      out += `<path d='${petal(ring.l, ring.w)}' fill='#fff' fill-opacity='${ring.o}' transform='${at}'/>`;
      if (k < 2 && r > 40) out += `<g transform='${at}'>${veins(ring.l, ring.w)}</g>`;
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
  `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})'><path d='M0 0 Q${f1(l * 0.32)} ${f1(-l * 0.5)} 0 ${f1(-l)} Q${f1(-l * 0.32)} ${f1(-l * 0.5)} 0 0Z' fill='#fff' fill-opacity='.38'/><path d='M0 0 L0 ${f1(-l * 0.92)}' stroke='#fff' stroke-opacity='.4' stroke-width='2'/>${[0.25, 0.42, 0.58, 0.74]
    .map((t) => `<path d='M0 ${f1(-l * t)} L${f1(l * 0.13)} ${f1(-l * (t + 0.1))} M0 ${f1(-l * t)} L${f1(-l * 0.13)} ${f1(-l * (t + 0.1))}' stroke='#fff' stroke-opacity='.25' stroke-width='1'/>`)
    .join('')}</g>`;
/** A stem with leaves along it. */
function vine(d: string, leaves: [number, number, number, number][]) {
  return `<path d='${d}' fill='none' stroke='#fff' stroke-opacity='.42' stroke-width='5' stroke-linecap='round'/>${leaves.map(([x, y, l, a]) => leaf(x, y, l, a)).join('')}`;
}

// ------------------------------------------------------------------------------------------------ doors

/** A door (the right one the left's mirror image, lit from the same side): tall and narrow like a phone, panelled, with a pressed floral relief, a gilt hairline and a brass keyhole plate. */
function doorArt(c: SceneColours, mirror = false): string {
  const door = c.envelope;
  const gold = c.accent;
  // Beads along the outer moulding.
  const beads = Array.from({ length: 46 }, (_, i) => `<circle cx='22' cy='${f1(40 + i * 20.4)}' r='2.6' fill='#fff' fill-opacity='.55'/><circle cx='278' cy='${f1(40 + i * 20.4)}' r='2.6' fill='#fff' fill-opacity='.55'/>`).join('');
  const relief = `
    <rect x='10' y='14' width='280' height='972' rx='4' fill='none' stroke='#fff' stroke-opacity='.45' stroke-width='8'/>
    ${beads}
    <rect x='32' y='34' width='236' height='932' rx='3' fill='none' stroke='#fff' stroke-opacity='.65' stroke-width='2.5'/>
    <rect x='38' y='40' width='224' height='920' rx='2' fill='none' stroke='#fff' stroke-opacity='.3' stroke-width='1'/>
    <path d='M50 942 V250 A100 100 0 0 1 250 250 V942 Z' fill='none' stroke='#fff' stroke-opacity='.55' stroke-width='7'/>
    <path d='M64 928 V252 A86 86 0 0 1 236 252 V928 Z' fill='none' stroke='#fff' stroke-opacity='.7' stroke-width='2'/>
    <path d='M50 960 H250' stroke='#fff' stroke-opacity='.45' stroke-width='4'/>
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
    ${([[120, 520], [185, 560], [100, 610], [205, 655], [140, 770]] as [number, number][]).map(([x, y]) => `<circle cx='${x}' cy='${y}' r='4' fill='#fff' fill-opacity='.5'/><circle cx='${x + 7}' cy='${y - 5}' r='3' fill='#fff' fill-opacity='.45'/><circle cx='${x - 6}' cy='${y - 6}' r='2.6' fill='#fff' fill-opacity='.45'/>`).join('')}
    ${bloom(150, 112, 30, 0)}
    ${leaf(196, 116, 34, 95)}
    ${leaf(104, 116, 34, -95)}
    ${Array.from({ length: 9 }, (_, i) => `<path d='M${f1(70 + i * 20)} 960 l10 -12 l10 12' fill='none' stroke='#fff' stroke-opacity='.4' stroke-width='2'/>`).join('')}`;
  // The brass keyhole plate, by the seam.
  const plate = `<g transform='translate(${mirror ? 34 : 266} 640)'>
      <path d='M-15 -46 Q0 -60 15 -46 V46 Q0 60 -15 46Z' fill='url(#brass)' stroke='${dark(gold, 0.45)}' stroke-width='1'/>
      <path d='M-10 -38 Q0 -48 10 -38 V38 Q0 48 -10 38Z' fill='none' stroke='${light(gold, 0.6)}' stroke-opacity='.7' stroke-width='1'/>
      <circle cx='0' cy='-6' r='4.4' fill='${dark(door, 0.6)}'/><path d='M-2.4 -4 L-3.6 10 H3.6 L2.4 -4Z' fill='${dark(door, 0.6)}'/>
      <circle cx='0' cy='-36' r='2' fill='${light(gold, 0.5)}'/><circle cx='0' cy='36' r='2' fill='${light(gold, 0.5)}'/>
    </g>`;
  const flip = mirror ? 'translate(300 0) scale(-1 1)' : '';
  return svgUrl(
    `<defs>${RELIEF('r', 6, 1.6)}${GRAIN('g', 0.75, 0.07)}
      <filter id='brush' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.55 0.012' numOctaves='2' seed='3'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .22 -.07'/></filter>
      <linearGradient id='sh' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.12'/><stop offset='.55' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.2'/></linearGradient>
      <linearGradient id='seam' x1='${mirror ? 1 : 0}' x2='${mirror ? 0 : 1}'><stop offset='.84' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.34'/></linearGradient>
      <linearGradient id='gilt' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${light(gold, 0.55)}'/><stop offset='.3' stop-color='${gold}'/><stop offset='.55' stop-color='${light(gold, 0.4)}'/><stop offset='1' stop-color='${dark(gold, 0.3)}'/></linearGradient>
      <linearGradient id='brass' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${light(gold, 0.5)}'/><stop offset='.45' stop-color='${gold}'/><stop offset='.7' stop-color='${light(gold, 0.25)}'/><stop offset='1' stop-color='${dark(gold, 0.4)}'/></linearGradient>
    </defs>
    <rect width='300' height='1000' fill='${door}'/>
    <rect width='300' height='1000' filter='url(#brush)'/>
    <rect width='300' height='1000' fill='url(#sh)'/>
    <g filter='url(#r)'><g transform='${flip}'>${relief}</g></g>
    <g transform='${flip}' fill='none' stroke='url(#gilt)'>
      <path d='M57 935 V251 A93 93 0 0 1 243 251 V935 Z' stroke-width='1.6' stroke-opacity='.9'/>
      <rect x='35' y='37' width='230' height='926' rx='2.5' stroke-width='1' stroke-opacity='.75'/>
    </g>
    ${plate}
    <rect width='300' height='1000' filter='url(#g)'/>
    <rect width='300' height='1000' fill='url(#seam)'/>
    <rect x='${mirror ? 0 : 0}' y='0' width='300' height='3' fill='#fff' fill-opacity='.18'/>`,
    300,
    1000,
  );
}

/** A wax seal pressed with their initials: an uneven rim with drips, a beaded ring, a sprig either side, and a gloss. */
function sealArt(colour: string, initials: string): string {
  const pts = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2;
    const drip = [5, 13, 22, 31].includes(i) ? 7 : 0;
    const r = 96 + (rnd(i, 3) - 0.5) * 8 + drip;
    return `${f1(110 + Math.cos(a) * r)},${f1(110 + Math.sin(a) * r)}`;
  }).join(' ');
  const beads = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    return `<circle cx='${f1(110 + Math.cos(a) * 74)}' cy='${f1(110 + Math.sin(a) * 74)}' r='2.3' fill='#fff' fill-opacity='.7'/>`;
  }).join('');
  const sprig = (flip: number) =>
    `<g transform='translate(110 110) scale(${flip} 1)'>${[0, 1, 2, 3].map((k) => `<ellipse cx='${-46 + k * 3}' cy='${-18 + k * 14}' rx='7' ry='3' transform='rotate(${-60 + k * 30} ${-46 + k * 3} ${-18 + k * 14})' fill='#fff' fill-opacity='.55'/>`).join('')}<path d='M-40 -26 Q-54 6 -38 34' fill='none' stroke='#fff' stroke-opacity='.6' stroke-width='1.6'/></g>`;
  const text = initials.replace(/&/g, '&amp;').replace(/</g, '');
  return svgUrl(
    `<defs>${RELIEF('sr', 4, 1.8)}
      <radialGradient id='w' cx='.38' cy='.32' r='.8'><stop offset='0' stop-color='${light(colour, 0.35)}'/><stop offset='.6' stop-color='${colour}'/><stop offset='1' stop-color='${dark(colour, 0.32)}'/></radialGradient>
      <radialGradient id='gloss' cx='.32' cy='.26' r='.35'><stop offset='0' stop-color='#fff' stop-opacity='.55'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient>
      <filter id='ds' x='-20%' y='-20%' width='140%' height='140%'><feDropShadow dx='0' dy='5' stdDeviation='5' flood-color='#000' flood-opacity='.4'/></filter>
    </defs>
    <polygon points='${pts}' fill='url(#w)' filter='url(#ds)' stroke-linejoin='round'/>
    <g filter='url(#sr)'>
      <polygon points='${pts}' fill='#fff' fill-opacity='.35'/>
      <circle cx='110' cy='110' r='84' fill='#fff' fill-opacity='.18'/>
      ${beads}
      <circle cx='110' cy='110' r='64' fill='none' stroke='#fff' stroke-opacity='.75' stroke-width='3'/>
      <circle cx='110' cy='110' r='58' fill='#fff' fill-opacity='.25'/>
      ${sprig(1)}${sprig(-1)}
      <text x='110' y='124' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='40' fill='#fff' fill-opacity='.9'>${text}</text>
    </g>
    <ellipse cx='84' cy='76' rx='38' ry='24' fill='url(#gloss)'/>`,
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

// ------------------------------------------------------------------------------------------------ daytime

/** A clear morning sky, soft sun and a few clouds. */
const daySky = (w: number, h: number, horizon: number) => `
  <linearGradient id='day' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#9fc6e6'/><stop offset='.6' stop-color='#d4e7f3'/><stop offset='1' stop-color='#f6efe0'/></linearGradient>
  <radialGradient id='sun' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fffbe8'/><stop offset='.25' stop-color='#fff4cf' stop-opacity='.9'/><stop offset='1' stop-color='#fff4cf' stop-opacity='0'/></radialGradient>
  <filter id='cloud' x='-20%' y='-40%' width='140%' height='180%'><feTurbulence type='fractalNoise' baseFrequency='.012 .03' numOctaves='4' seed='5'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.2 -1.15'/><feGaussianBlur stdDeviation='1.2'/></filter>
  <clipPath id='skyclip'><rect width='${w}' height='${horizon}'/></clipPath>`;
const daySkyBody = (w: number, horizon: number) => `
  <rect width='${w}' height='${horizon + 2}' fill='url(#day)'/>
  <circle cx='${w * 0.78}' cy='${horizon * 0.22}' r='${w * 0.32}' fill='url(#sun)'/>
  <rect y='${horizon * 0.06}' width='${w}' height='${horizon * 0.5}' filter='url(#cloud)' clip-path='url(#skyclip)' opacity='.9'/>`;

/** Planks of timber with grain, knots and nail heads: one barn door (the right one mirrored), with an X brace and iron straps. */
function barnArt(c: SceneColours, mirror = false): string {
  const wood = c.envelope;
  const planks = Array.from({ length: 5 }, (_, i) => {
    const x = i * 60;
    const tone = mix(wood, i % 2 ? '#000000' : '#ffffff', 0.04 + rnd(i, 4) * 0.06);
    const knots = [0, 1].map((k) => `<ellipse cx='${f1(x + 16 + rnd(i, k + 5) * 28)}' cy='${f1(120 + rnd(i, k + 8) * 760)}' rx='${f1(5 + rnd(i, k) * 4)}' ry='${f1(9 + rnd(i, k) * 6)}' fill='${dark(wood, 0.35)}' fill-opacity='.55'/><ellipse cx='${f1(x + 16 + rnd(i, k + 5) * 28)}' cy='${f1(120 + rnd(i, k + 8) * 760)}' rx='${f1(9 + rnd(i, k) * 5)}' ry='${f1(16 + rnd(i, k) * 8)}' fill='none' stroke='${dark(wood, 0.3)}' stroke-opacity='.35' stroke-width='1.2'/>`).join('');
    return `<rect x='${x}' y='0' width='60' height='1000' fill='${tone}'/>${knots}<rect x='${x}' y='0' width='2.2' height='1000' fill='${dark(wood, 0.5)}'/><rect x='${x + 2.2}' y='0' width='1' height='1000' fill='${light(wood, 0.35)}' fill-opacity='.5'/>`;
  }).join('');
  const nail = (x: number, y: number) => `<circle cx='${x}' cy='${y}' r='3.4' fill='#2a2724'/><circle cx='${x - 0.8}' cy='${y - 0.8}' r='1.2' fill='#8d8780'/>`;
  const brace = (d: string) => `<path d='${d}' stroke='${dark(wood, 0.45)}' stroke-width='52' stroke-opacity='.35' fill='none'/><path d='${d}' stroke='${light(wood, 0.12)}' stroke-width='44' fill='none'/><path d='${d}' stroke='url(#grainB)' stroke-width='44' fill='none'/>`;
  const strap = (y: number) => `<rect x='0' y='${y}' width='300' height='22' fill='#2b2826'/><rect x='0' y='${y}' width='300' height='3' fill='#5a5550'/>${[24, 92, 160, 228, 280].map((x) => nail(x, y + 11)).join('')}`;
  const flip = mirror ? 'translate(300 0) scale(-1 1)' : '';
  return svgUrl(
    `<defs>
      <filter id='grain' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.9 .012' numOctaves='3' seed='11'/><feColorMatrix type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 -.18'/></filter>
      <pattern id='grainB' width='300' height='1000' patternUnits='userSpaceOnUse'><rect width='300' height='1000' filter='url(#grain)'/></pattern>
      <linearGradient id='lit' x1='0' y1='0' x2='1' y2='.4'><stop offset='0' stop-color='#fff' stop-opacity='.16'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.2'/></linearGradient>
    </defs>
    <g transform='${flip}'>
      ${planks}
      <rect width='300' height='1000' filter='url(#grain)'/>
      ${brace('M30 190 L270 810')}
      <rect x='18' y='160' width='264' height='46' fill='${light(wood, 0.1)}'/><rect x='18' y='160' width='264' height='46' filter='url(#grain)'/><rect x='18' y='204' width='264' height='3' fill='${dark(wood, 0.45)}' fill-opacity='.6'/>
      <rect x='18' y='794' width='264' height='46' fill='${light(wood, 0.1)}'/><rect x='18' y='794' width='264' height='46' filter='url(#grain)'/><rect x='18' y='838' width='264' height='3' fill='${dark(wood, 0.45)}' fill-opacity='.6'/>
      ${strap(110)}${strap(880)}
      <rect x='262' y='420' width='14' height='160' rx='7' fill='#2b2826'/><rect x='264' y='424' width='4' height='150' rx='2' fill='#5a5550'/>
    </g>
    <rect width='300' height='1000' fill='url(#lit)'/>`,
    300,
    1000,
  );
}

/** The sunlit view through the barn: a lawn, an arbour and the hills. */
function fieldArt(c: SceneColours): string {
  const hill1 = mix('#9db37f', c.soft, 0.3);
  const hill2 = mix('#7f9a64', c.ink, 0.15);
  return svgUrl(
    `<defs>${daySky(500, 1000, 560)}
      <linearGradient id='lawn' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${mix('#a7bf88', c.soft, 0.2)}'/><stop offset='1' stop-color='${mix('#7e9c5e', c.ink, 0.1)}'/></linearGradient>
    </defs>
    ${daySkyBody(500, 560)}
    <path d='M0 560 C90 520 170 540 250 515 C340 490 420 530 500 510 V640 H0Z' fill='${hill1}'/>
    <path d='M0 600 C110 570 200 600 300 575 C390 555 450 585 500 575 V700 H0Z' fill='${hill2}'/>
    <rect y='640' width='500' height='360' fill='url(#lawn)'/>
    <path d='M190 1000 L238 650 H262 L310 1000Z' fill='#efe6d3' fill-opacity='.75'/>
    <path d='M190 700 V600 A60 60 0 0 1 310 600 V700' fill='none' stroke='#f7f1e3' stroke-width='9'/>
    ${Array.from({ length: 18 }, (_, i) => { const a = Math.PI + (i / 17) * Math.PI; return `<circle cx='${f1(250 + Math.cos(a) * 60)}' cy='${f1(600 + Math.sin(a) * 60)}' r='${f1(7 + rnd(i, 2) * 5)}' fill='${i % 3 ? '#f4d6d6' : '#fffaf2'}'/>`; }).join('')}
    ${Array.from({ length: 10 }, (_, i) => `<rect x='${f1(60 + (i % 5) * 26)}' y='${f1(760 + Math.floor(i / 5) * 60)}' width='16' height='34' rx='3' fill='#f7f1e3'/><rect x='${f1(330 + (i % 5) * 26)}' y='${f1(760 + Math.floor(i / 5) * 60)}' width='16' height='34' rx='3' fill='#f7f1e3'/>`).join('')}`,
    500,
    1000,
    'xMidYMid slice',
  );
}

/** A eucalyptus wreath with a twine bow and a little tag: hung across the barn doors' seam. */
function wreathArt(c: SceneColours, initials: string): string {
  const leaves = Array.from({ length: 46 }, (_, i) => {
    const a = (i / 46) * Math.PI * 2;
    const r = 78 + (i % 2 ? 6 : -6);
    const x = 110 + Math.cos(a) * r;
    const y = 110 + Math.sin(a) * r;
    const g = i % 3 === 0 ? '#9fb3a0' : i % 3 === 1 ? '#7f9784' : '#b7c6b2';
    return `<ellipse cx='${f1(x)}' cy='${f1(y)}' rx='${f1(9 + rnd(i, 1) * 4)}' ry='${f1(14 + rnd(i, 2) * 4)}' transform='rotate(${f1((a * 180) / Math.PI + 30 + rnd(i, 3) * 40)} ${f1(x)} ${f1(y)})' fill='${g}' stroke='#5f7564' stroke-width='.6'/>`;
  }).join('');
  const berries = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    return `<circle cx='${f1(110 + Math.cos(a) * 80)}' cy='${f1(110 + Math.sin(a) * 80)}' r='3.2' fill='#f2ece0' stroke='#c7bba3' stroke-width='.6'/>`;
  }).join('');
  const text = initials.replace(/&/g, '&amp;').replace(/</g, '');
  return svgUrl(
    `<defs><filter id='ws' x='-20%' y='-20%' width='140%' height='140%'><feDropShadow dx='0' dy='6' stdDeviation='5' flood-color='#000' flood-opacity='.35'/></filter></defs>
    <g filter='url(#ws)'>
      <circle cx='110' cy='110' r='78' fill='none' stroke='#6a5338' stroke-width='5'/>
      ${leaves}${berries}
      <path d='M110 34 C90 18 78 30 96 40 M110 34 C130 18 142 30 124 40' fill='none' stroke='#cdb68c' stroke-width='3'/>
      <path d='M108 38 L98 62 M112 38 L124 60' stroke='#cdb68c' stroke-width='2.4'/>
      <rect x='86' y='132' width='48' height='30' rx='3' fill='${light(c.paper, 0.4)}' stroke='#b9a37c' stroke-width='1'/>
      <text x='110' y='152' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='14' fill='${c.ink}'>${text}</text>
    </g>`,
    220,
    220,
    'xMidYMid meet',
  );
}

/** A storybook's cover: cloth in the design's colour, a gilt frame with corner flourishes, a castle in a cartouche, and the title. */
function bookArt(c: SceneColours, initials: string): string {
  const cover = c.envelope;
  const gold = c.accent;
  const corner = (x: number, y: number, sx: number, sy: number) =>
    `<g transform='translate(${x} ${y}) scale(${sx} ${sy})' fill='none' stroke='url(#gilt)' stroke-width='2.4'><path d='M0 60 C0 20 20 0 60 0'/><path d='M8 52 C10 26 26 10 52 8'/><path d='M14 14 C34 18 40 30 30 40 C22 46 14 38 20 32 C26 26 34 34 28 38'/><circle cx='18' cy='18' r='3' fill='url(#gilt)'/><path d='M60 0 C70 6 76 4 82 -2'/><path d='M0 60 C6 70 4 76 -2 82'/></g>`;
  const castle = `<g fill='url(#gilt)'>
      <rect x='-46' y='-6' width='92' height='52'/>
      <rect x='-70' y='-26' width='26' height='72'/><path d='M-74 -26 L-57 -66 L-40 -26Z'/>
      <rect x='44' y='-26' width='26' height='72'/><path d='M40 -26 L57 -66 L74 -26Z'/>
      <rect x='-16' y='-46' width='32' height='92'/><path d='M-21 -46 L0 -98 L21 -46Z'/>
      <path d='M0 -98 V-112 L14 -106 L0 -101' />
      ${[-40, -28, -16, 4, 16, 28].map((x) => `<rect x='${x}' y='-14' width='8' height='8'/>`).join('')}
    </g>
    <g fill='${cover}'><path d='M-10 46 V24 A10 10 0 0 1 10 24 V46Z'/><rect x='-62' y='-6' width='8' height='12' rx='4'/><rect x='52' y='-6' width='8' height='12' rx='4'/><rect x='-4' y='-30' width='8' height='14' rx='4'/></g>`;
  const stars = Array.from({ length: 14 }, (_, i) => `<path transform='translate(${f1(60 + rnd(i, 1) * 180)} ${f1(250 + rnd(i, 2) * 90)}) scale(${f1(0.6 + rnd(i, 3) * 0.6)})' d='M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5Z' fill='url(#gilt)'/>`).join('');
  const text = initials.replace(/&/g, '&amp;').replace(/</g, '');
  return svgUrl(
    `<defs>${GRAIN('g', 1.2, 0.08)}
      <filter id='cloth' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.8 .8' numOctaves='2' seed='2'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .18 -.06'/></filter>
      <linearGradient id='gilt' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${light(gold, 0.55)}'/><stop offset='.35' stop-color='${gold}'/><stop offset='.6' stop-color='${light(gold, 0.35)}'/><stop offset='1' stop-color='${dark(gold, 0.35)}'/></linearGradient>
      <linearGradient id='spine' x1='0' x2='1'><stop offset='0' stop-color='#000' stop-opacity='.45'/><stop offset='.06' stop-color='#000' stop-opacity='.1'/><stop offset='.1' stop-color='#fff' stop-opacity='.12'/><stop offset='.16' stop-color='#000' stop-opacity='0'/></linearGradient>
      <radialGradient id='vig' cx='.5' cy='.45' r='.75'><stop offset='.6' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.35'/></radialGradient>
    </defs>
    <rect width='300' height='620' fill='${cover}'/>
    <rect width='300' height='620' filter='url(#cloth)'/>
    <rect width='300' height='620' fill='url(#vig)'/>
    <rect x='22' y='22' width='256' height='576' rx='6' fill='none' stroke='url(#gilt)' stroke-width='3'/>
    <rect x='32' y='32' width='236' height='556' rx='4' fill='none' stroke='url(#gilt)' stroke-width='1'/>
    ${corner(36, 36, 1, 1)}${corner(264, 36, -1, 1)}${corner(36, 584, 1, -1)}${corner(264, 584, -1, -1)}
    <ellipse cx='150' cy='250' rx='92' ry='118' fill='${dark(cover, 0.18)}' stroke='url(#gilt)' stroke-width='3'/>
    <ellipse cx='150' cy='250' rx='84' ry='110' fill='none' stroke='url(#gilt)' stroke-width='1'/>
    ${stars}
    <g transform='translate(150 280) scale(.95)'>${castle}</g>
    <text x='150' y='420' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='30' fill='url(#gilt)'>Once upon a time</text>
    <path d='M96 438 H204' stroke='url(#gilt)' stroke-width='1.2'/><circle cx='150' cy='438' r='3' fill='url(#gilt)'/>
    <text x='150' y='482' text-anchor='middle' font-family='Georgia, serif' font-size='26' letter-spacing='4' fill='url(#gilt)'>${text}</text>
    <rect width='300' height='620' fill='url(#spine)'/>
    <rect width='300' height='620' filter='url(#g)'/>`,
    300,
    620,
  );
}

/** The storybook's first page: a sunlit castle on a hill, painted softly. */
function pageArt(c: SceneColours): string {
  return svgUrl(
    `<defs>${daySky(300, 620, 380)}${GRAIN('pg', 1.4, 0.05)}
      <linearGradient id='hillA' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#a9c08c'/><stop offset='1' stop-color='#7f9b66'/></linearGradient>
    </defs>
    <rect width='300' height='620' fill='#fbf5e8'/>
    <g transform='translate(30 40)'><rect width='240' height='400' rx='4' fill='#fff'/>
      <svg width='240' height='400' viewBox='0 0 300 620' preserveAspectRatio='xMidYMid slice'>${daySkyBody(300, 380)}
        <path d='M0 420 C60 360 120 330 170 350 C220 370 260 340 300 330 V620 H0Z' fill='url(#hillA)'/>
        <g transform='translate(170 300)' fill='${light(c.envelope, 0.55)}'>
          <rect x='-30' y='0' width='60' height='50'/><rect x='-46' y='-14' width='18' height='64'/><rect x='28' y='-14' width='18' height='64'/><rect x='-10' y='-34' width='20' height='84'/>
          <path d='M-50 -14 L-37 -44 L-24 -14Z M24 -14 L37 -44 L50 -14Z M-14 -34 L0 -72 L14 -34Z' fill='${mix(c.accent, c.envelope, 0.4)}'/>
        </g>
        <path d='M0 500 C80 470 160 520 300 480 V620 H0Z' fill='#93ad78'/>
        ${Array.from({ length: 30 }, (_, i) => `<circle cx='${f1(rnd(i, 1) * 300)}' cy='${f1(500 + rnd(i, 2) * 110)}' r='${f1(2 + rnd(i, 3) * 2.5)}' fill='${i % 2 ? '#f6d2dc' : '#fff8e8'}'/>`).join('')}
      </svg>
      <rect width='240' height='400' rx='4' fill='none' stroke='${c.accent}' stroke-width='1.5'/>
    </g>
    <text x='150' y='500' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='24' fill='${c.ink}'>Once upon a time…</text>
    <rect width='300' height='620' filter='url(#pg)'/>`,
    300,
    620,
  );
}

/** A wrought-iron garden gate (the right one mirrored): bars with spear tips, scrolls, an arched rail and a monogram plate. */
function gateArt(c: SceneColours, initials: string, mirror = false): string {
  const iron = dark(c.envelope, 0.1);
  const bars = Array.from({ length: 9 }, (_, i) => {
    const x = 26 + i * 31;
    const top = 150 + Math.pow((x - 300) / 300, 2) * -60 + 60;
    return `<rect x='${x - 3}' y='${f1(top)}' width='6' height='${f1(940 - top)}' fill='url(#ironG)'/><path d='M${x} ${f1(top - 26)} L${x + 7} ${f1(top - 4)} L${x} ${f1(top + 2)} L${x - 7} ${f1(top - 4)}Z' fill='url(#ironG)'/>`;
  }).join('');
  const scroll = (x: number, y: number, s: number, f = 1) => `<g transform='translate(${x} ${y}) scale(${s * f} ${s})' fill='none' stroke='url(#ironG)' stroke-width='${f1(5 / s)}' stroke-linecap='round'><path d='M0 0 C0 -30 40 -30 40 0 C40 18 18 22 14 8 C11 -2 24 -4 24 4'/><path d='M0 0 C0 30 -40 30 -40 0 C-40 -18 -18 -22 -14 -8 C-11 2 -24 4 -24 -4'/></g>`;
  const text = initials.replace(/&/g, '&amp;').replace(/</g, '');
  // The monogram plate across the meeting bars: each gate has its half.
  const plate = `<g transform='translate(${mirror ? 0 : 300} 520)'><circle r='46' fill='${iron}' stroke='url(#ironG)' stroke-width='4'/><circle r='38' fill='none' stroke='${light(c.accent, 0.2)}' stroke-width='1.6'/><text y='9' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='24' fill='${light(c.accent, 0.2)}'>${text}</text></g>`;
  const flip = mirror ? 'translate(300 0) scale(-1 1)' : '';
  return svgUrl(
    `<defs>
      <linearGradient id='ironG' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${dark(iron, 0.45)}'/><stop offset='.45' stop-color='${light(iron, 0.35)}'/><stop offset='1' stop-color='${dark(iron, 0.5)}'/></linearGradient>
      <filter id='gs' x='-10%' y='-10%' width='120%' height='120%'><feDropShadow dx='3' dy='6' stdDeviation='4' flood-color='#000' flood-opacity='.4'/></filter>
    </defs>
    <g transform='${flip}' filter='url(#gs)'>
      <path d='M0 210 Q150 120 300 150' fill='none' stroke='url(#ironG)' stroke-width='12'/>
      <path d='M0 250 Q150 165 300 195' fill='none' stroke='url(#ironG)' stroke-width='6'/>
      ${bars}
      <rect x='0' y='600' width='300' height='12' fill='url(#ironG)'/>
      <rect x='0' y='900' width='300' height='14' fill='url(#ironG)'/>
      <rect x='0' y='160' width='14' height='800' fill='url(#ironG)'/>
      ${scroll(90, 300, 1.1)}${scroll(210, 290, 1.1, -1)}${scroll(150, 690, 1.3)}${scroll(80, 800, 0.9, -1)}${scroll(220, 810, 0.9)}
      ${Array.from({ length: 7 }, (_, i) => `<circle cx='${36 + i * 40}' cy='606' r='7' fill='url(#ironG)'/>`).join('')}
    </g>
    ${plate}`,
    300,
    1000,
  );
}

/** Beyond the gates: a sunny garden path between clipped hedges and roses, to a fountain. */
function gardenArt(c: SceneColours): string {
  const hedge = mix('#5f7f4e', c.ink, 0.12);
  const roses = Array.from({ length: 60 }, (_, i) => {
    const left = i % 2 === 0;
    const y = 640 + rnd(i, 1) * 300;
    const x = left ? 20 + rnd(i, 2) * (160 - (y - 640) * 0.3) : 480 - rnd(i, 2) * (160 - (y - 640) * 0.3);
    const col = [light(c.soft, 0.2), '#f3c6cf', '#fff8ee', c.soft][i % 4];
    return `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(4 + rnd(i, 3) * 4)}' fill='${col}'/><circle cx='${f1(x - 1)}' cy='${f1(y - 1)}' r='${f1(1.5 + rnd(i, 3) * 1.5)}' fill='#fff' fill-opacity='.6'/>`;
  }).join('');
  return svgUrl(
    `<defs>${daySky(500, 1000, 600)}
      <linearGradient id='path' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#e8dcc2'/><stop offset='1' stop-color='#d6c5a2'/></linearGradient>
      <linearGradient id='hedgeG' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${light(hedge, 0.18)}'/><stop offset='1' stop-color='${dark(hedge, 0.25)}'/></linearGradient>
    </defs>
    ${daySkyBody(500, 600)}
    <path d='M0 600 C100 570 180 590 250 575 C330 560 410 585 500 570 V660 H0Z' fill='${mix('#8fa978', c.soft, 0.25)}'/>
    <rect y='640' width='500' height='360' fill='${mix('#93ae78', c.soft, 0.15)}'/>
    <path d='M200 1000 L240 650 H260 L300 1000Z' fill='url(#path)'/>
    <path d='M0 640 H200 L150 1000 H0Z' fill='url(#hedgeG)'/>
    <path d='M500 640 H300 L350 1000 H500Z' fill='url(#hedgeG)'/>
    <g transform='translate(250 640)'><ellipse cx='0' cy='14' rx='34' ry='8' fill='#e6ecee'/><rect x='-5' y='-30' width='10' height='44' fill='#eef0ee'/><ellipse cx='0' cy='-30' rx='18' ry='5' fill='#f4f6f4'/><path d='M0 -34 C-6 -50 -18 -40 -22 -24 M0 -34 C6 -50 18 -40 22 -24' stroke='#d9ecf3' stroke-width='2' fill='none'/></g>
    ${roses}`,
    500,
    1000,
    'xMidYMid slice',
  );
}

/** A beach at midday: sky, a sparkling sea, wet and dry sand, their initials and a heart drawn in it, and shells. */
function beachArt(c: SceneColours, initials: string): string {
  const sea = mix('#3f8fb0', c.ink, 0.2);
  const sand = mix('#ead9b8', c.envelope, 0.35);
  const sparkles = Array.from({ length: 40 }, (_, i) => `<rect x='${f1(rnd(i, 1) * 500)}' y='${f1(470 + rnd(i, 2) * 120)}' width='${f1(4 + rnd(i, 3) * 10)}' height='1.6' fill='#fff' fill-opacity='${f1(0.4 + rnd(i, 4) * 0.5)}'/>`).join('');
  const shell = (x: number, y: number, s: number, a: number) => `<g transform='translate(${x} ${y}) rotate(${a}) scale(${s})'><path d='M0 0 C-14 -4 -16 -22 0 -26 C16 -22 14 -4 0 0Z' fill='#f6e8dc' stroke='#d8bfa8' stroke-width='.8'/>${[-10, -5, 0, 5, 10].map((d) => `<path d='M0 -1 L${d} -23' stroke='#dcc3ad' stroke-width='.7'/>`).join('')}</g>`;
  const text = initials.replace(/&/g, '&amp;').replace(/</g, '');
  return svgUrl(
    `<defs>${daySky(500, 1000, 470)}
      <linearGradient id='sea' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${dark(sea, 0.15)}'/><stop offset='.6' stop-color='${sea}'/><stop offset='1' stop-color='${light(sea, 0.35)}'/></linearGradient>
      <linearGradient id='sand' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${dark(sand, 0.08)}'/><stop offset='.25' stop-color='${sand}'/><stop offset='1' stop-color='${light(sand, 0.25)}'/></linearGradient>
      <filter id='grit' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='1.3' numOctaves='2' seed='4'/><feColorMatrix type='matrix' values='0 0 0 0 .4  0 0 0 0 .3  0 0 0 0 .2  0 0 0 .5 -.18'/></filter>
      <filter id='dug' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur in='SourceAlpha' stdDeviation='1.5' result='b'/><feOffset dx='1.5' dy='2' in='b' result='o'/><feComposite in='SourceGraphic' in2='o' operator='over'/></filter>
    </defs>
    ${daySkyBody(500, 470)}
    <rect y='466' width='500' height='150' fill='url(#sea)'/>
    <rect y='466' width='500' height='3' fill='${dark(sea, 0.3)}' fill-opacity='.6'/>
    ${sparkles}
    <path d='M0 600 C80 590 160 612 250 600 C340 588 420 610 500 598 V1000 H0Z' fill='url(#sand)'/>
    <path d='M0 600 C80 590 160 612 250 600 C340 588 420 610 500 598 V640 C420 652 340 630 250 642 C160 654 80 632 0 642Z' fill='${dark(sand, 0.12)}' fill-opacity='.6'/>
    <path d='M0 600 C80 590 160 612 250 600 C340 588 420 610 500 598' fill='none' stroke='#fff' stroke-width='4' stroke-opacity='.85'/>
    <rect y='600' width='500' height='400' filter='url(#grit)'/>
    <g filter='url(#dug)' fill='none' stroke='${dark(sand, 0.28)}' stroke-width='4' stroke-linecap='round'>
      <path d='M250 840 C210 805 200 770 225 760 C240 754 250 768 250 775 C250 768 260 754 275 760 C300 770 290 805 250 840Z'/>
    </g>
    <text x='250' y='740' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='44' fill='${dark(sand, 0.3)}' fill-opacity='.85'>${text}</text>
    ${shell(110, 900, 1.8, -20)}${shell(390, 880, 1.5, 25)}${shell(170, 965, 1.2, 10)}`,
    500,
    1000,
    'xMidYMid slice',
  );
}

// ------------------------------------------------------------------------------------------------ the scene

/** A scene's pictures, each a CSS background image (drawn once). */
export function sceneArt(kind: Exclude<Scene, 'auto' | 'none'>, c: SceneColours, initials: string): Record<string, string> {
  if (kind === 'doors') return { door: doorArt(c), door2: doorArt(c, true), seal: sealArt(mix(c.soft, c.accent, 0.35), initials) };
  if (kind === 'bow') return { paper: satinPaper(c), bow: bowArt(mix(c.soft, c.ink, 0.18)) };
  if (kind === 'curtain') return { left: curtainArt(c, 1), right: curtainArt(c, -1), pelmet: pelmetArt(c, initials) };
  if (kind === 'barn') return { field: fieldArt(c), left: barnArt(c), right: barnArt(c, true), wreath: wreathArt(c, initials) };
  if (kind === 'book') return { cover: bookArt(c, initials), page: pageArt(c) };
  if (kind === 'gates') return { garden: gardenArt(c), left: gateArt(c, initials), right: gateArt(c, initials, true) };
  if (kind === 'beach') return { beach: beachArt(c, initials) };
  return { night: nightArt(c) };
}

const LAYER: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };

export function SceneOverlay({ kind, phase: p, colours: c, initials, guestName }: { kind: Exclude<Scene, 'auto' | 'none'>; phase: number; colours: SceneColours; initials: string; guestName: string }) {
  const still = useMemo(() => prefersLessMotion(), []);
  // Drawn once for these colours (the page re-renders as it opens; new pictures would be decoded again).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const art = useMemo(() => sceneArt(kind, c, initials), [kind, c.paper, c.ink, c.accent, c.soft, c.envelope, initials]);
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
  } else if (kind === 'barn') {
    // Timber doors on a rail: they roll apart, and the wreath across them parts with them.
    const door = (s: 'left' | 'right'): CSSProperties => ({
      position: 'absolute',
      top: '5%',
      bottom: 0,
      [s]: 0,
      width: '50.2%',
      backgroundImage: s === 'left' ? art.left : art.right,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      transform: open && !still ? `translateX(${s === 'left' ? -101 : 101}%)` : 'none',
      transition: t(2.2, 0.3),
      overflow: 'hidden',
      boxShadow: s === 'left' ? '6px 0 18px rgba(0,0,0,.35)' : '-6px 0 18px rgba(0,0,0,.35)',
      willChange: 'transform',
    });
    const half = (s: 'left' | 'right'): CSSProperties => ({
      position: 'absolute',
      top: '30%',
      [s === 'left' ? 'right' : 'left']: 0,
      width: 'min(58vw,240px)',
      height: 'min(58vw,240px)',
      transform: `translate(${s === 'left' ? '50%' : '-50%'},-50%)`,
      backgroundImage: art.wreath,
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
    });
    body = (
      <div style={{ ...LAYER, backgroundImage: art.field, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div style={{ ...LAYER, background: 'radial-gradient(ellipse at 50% 40%, rgba(255,250,230,.0), rgba(255,250,230,.0) 40%, rgba(0,0,0,.25))' }} />
        <div style={door('left')}>
          <div style={half('left')} />
        </div>
        <div style={door('right')}>
          <div style={half('right')} />
        </div>
        {/* The rail and its rollers. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(5% - 16px)', height: 16, background: 'linear-gradient(#4a4642, #23201e)', boxShadow: '0 4px 10px rgba(0,0,0,.35)' }} />
        {[18, 32, 68, 82].map((x, i) => (
          <div key={x} style={{ position: 'absolute', top: 'calc(5% - 22px)', left: `${x}%`, width: 22, height: 22, marginLeft: -11, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #8d8780, #2a2724 70%)', transform: open && !still ? `translateX(${i < 2 ? '-50vw' : '50vw'})` : 'none', transition: t(2.2, 0.3) }} />
        ))}
      </div>
    );
  } else if (kind === 'book') {
    // A storybook on the table: its cover swings open to the first page.
    const size: CSSProperties = { position: 'absolute', left: '50%', top: '50%', width: 'min(84vw,52vh,440px)', aspectRatio: '300 / 620', transform: 'translate(-50%,-52%)' };
    body = (
      <div style={{ ...LAYER, perspective: '1800px', background: `radial-gradient(ellipse at 50% 40%, ${light(c.paper, 0.5)} 0%, ${mix(c.paper, c.soft, 0.6)} 55%, ${mix(c.soft, c.ink, 0.25)} 100%)` }}>
        <div style={{ ...size, borderRadius: 6, boxShadow: '0 30px 60px rgba(0,0,0,.28), 0 8px 18px rgba(0,0,0,.18)', backgroundImage: art.page, backgroundSize: 'cover' }} />
        <div
          style={{
            ...size,
            borderRadius: '4px 8px 8px 4px',
            backgroundImage: art.cover,
            backgroundSize: 'cover',
            transformOrigin: 'left center',
            transform: `translate(-50%,-52%) rotateY(${open && !still ? -168 : 0}deg)`,
            transition: t(2.2, 0.25),
            backfaceVisibility: 'hidden',
            boxShadow: '0 30px 60px rgba(0,0,0,.3), inset -3px 0 0 rgba(255,255,255,.12)',
            willChange: 'transform',
          }}
        />
      </div>
    );
  } else if (kind === 'gates') {
    // Garden gates swing away, and the garden comes closer.
    const gate = (s: 'left' | 'right'): CSSProperties => ({
      position: 'absolute',
      top: 0,
      bottom: 0,
      [s]: 0,
      width: '50.2%',
      backgroundImage: s === 'left' ? art.left : art.right,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      transform: `rotateY(${open && !still ? (s === 'left' ? 82 : -82) : 0}deg)`,
      transformOrigin: s === 'left' ? 'left center' : 'right center',
      transition: t(2.3, 0.3),
      willChange: 'transform',
    });
    body = (
      <div style={{ ...LAYER, perspective: '1400px' }}>
        <div style={{ ...LAYER, backgroundImage: art.garden, backgroundSize: 'cover', backgroundPosition: 'center', transform: open && !still ? 'scale(1.3)' : 'scale(1)', transition: t(2.6, 0.5) }} />
        <div style={gate('left')} />
        <div style={gate('right')} />
      </div>
    );
  } else if (kind === 'beach') {
    // A wave washes up over the sand.
    const sea = mix('#3f8fb0', c.ink, 0.2);
    body = (
      <div style={{ ...LAYER, backgroundImage: art.beach, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div
          style={{
            position: 'absolute',
            left: '-10%',
            right: '-10%',
            top: 0,
            height: '130%',
            borderRadius: '50% 50% 0 0 / 40px 40px 0 0',
            background: `linear-gradient(to bottom, rgba(255,255,255,.96) 0, rgba(255,255,255,.75) 2.5%, ${light(sea, 0.45)}cc 7%, ${light(sea, 0.2)}ee 30%, ${sea} 100%)`,
            boxShadow: '0 -6px 20px rgba(255,255,255,.6)',
            transform: open && !still ? 'translateY(-8%)' : 'translateY(102%)',
            transition: t(1.9, 0.2),
            willChange: 'transform',
          }}
        />
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
          color: kind === 'bow' || kind === 'book' ? c.ink : '#fbf6ea',
          textShadow: kind === 'bow' || kind === 'book' ? '0 1px 0 rgba(255,255,255,.6)' : '0 2px 10px rgba(0,0,0,.45)',
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

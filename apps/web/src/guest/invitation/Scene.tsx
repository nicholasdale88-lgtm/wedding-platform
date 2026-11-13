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
    `<defs>${RELIEF('r', 3.4, 1.05)}${GRAIN('g', 0.9, 0.035)}
      <linearGradient id='lac' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#000' stop-opacity='.22'/><stop offset='.18' stop-color='#fff' stop-opacity='.03'/><stop offset='.34' stop-color='#fff' stop-opacity='.13'/><stop offset='.42' stop-color='#fff' stop-opacity='.05'/><stop offset='.7' stop-color='#000' stop-opacity='.04'/><stop offset='1' stop-color='#000' stop-opacity='.2'/></linearGradient>
      <radialGradient id='key' cx='.3' cy='.18' r='.95'><stop offset='0' stop-color='#fff' stop-opacity='.14'/><stop offset='.55' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.28'/></radialGradient>
      <linearGradient id='sh' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.12'/><stop offset='.55' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.2'/></linearGradient>
      <linearGradient id='seam' x1='${mirror ? 1 : 0}' x2='${mirror ? 0 : 1}'><stop offset='.84' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.34'/></linearGradient>
      <linearGradient id='gilt' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${light(gold, 0.55)}'/><stop offset='.3' stop-color='${gold}'/><stop offset='.55' stop-color='${light(gold, 0.4)}'/><stop offset='1' stop-color='${dark(gold, 0.3)}'/></linearGradient>
      <linearGradient id='brass' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${light(gold, 0.5)}'/><stop offset='.45' stop-color='${gold}'/><stop offset='.7' stop-color='${light(gold, 0.25)}'/><stop offset='1' stop-color='${dark(gold, 0.4)}'/></linearGradient>
    </defs>
    <rect width='300' height='1000' fill='${door}'/>
    <rect width='300' height='1000' fill='url(#lac)'/>
    <rect width='300' height='1000' fill='url(#sh)'/>
    <g filter='url(#r)'><g transform='${flip}'>${relief}</g></g>
    <g transform='${flip}' fill='none' stroke='url(#gilt)'>
      <path d='M57 935 V251 A93 93 0 0 1 243 251 V935 Z' stroke-width='1.6' stroke-opacity='.9'/>
      <rect x='35' y='37' width='230' height='926' rx='2.5' stroke-width='1' stroke-opacity='.75'/>
      ${giltBotanical()}
    </g>
    ${plate}
    <rect width='300' height='1000' filter='url(#g)'/>
    <rect width='300' height='1000' fill='url(#key)'/>
    <rect width='300' height='1000' fill='url(#seam)'/>
    <rect x='${mirror ? 0 : 0}' y='0' width='300' height='3' fill='#fff' fill-opacity='.18'/>`,
    300,
    1000,
  );
}

/**
 * Fine gilt line work for the door's arch: one climbing stem with paired leaves, tendrils, small open
 * blossoms and a crowning flower, all drawn as hairlines (no relief), so it reads as gold leaf on lacquer.
 */
function giltBotanical(): string {
  const leafAt = (x: number, y: number, len: number, a: number) =>
    `<g transform='translate(${x} ${y}) rotate(${a})'><path d='M0 0 Q${f1(len * 0.38)} ${f1(-len * 0.2)} ${len} 0 Q${f1(len * 0.38)} ${f1(len * 0.2)} 0 0Z' fill='#fff' fill-opacity='.04' stroke-width='1.1'/><path d='M2 0 H${f1(len * 0.82)}' stroke-width='.6' stroke-opacity='.7'/></g>`;
  const blossom = (x: number, y: number, r: number, turn = 0) =>
    `<g transform='translate(${x} ${y}) rotate(${turn})'>${[0, 72, 144, 216, 288].map((k) => `<ellipse cx='0' cy='${f1(-r * 0.55)}' rx='${f1(r * 0.32)}' ry='${f1(r * 0.55)}' transform='rotate(${k})' stroke-width='1'/>`).join('')}<circle r='${f1(r * 0.16)}' fill='url(#gilt)' stroke='none'/>${[0, 72, 144, 216, 288].map((k) => `<path d='M0 0 L0 ${f1(-r * 0.32)}' transform='rotate(${k + 36})' stroke-width='.5' stroke-opacity='.8'/>`).join('')}</g>`;
  const curl = (x: number, y: number, k: number) => `<path d='M${x} ${y} c${8 * k} -6 ${14 * k} -2 ${12 * k} 6 c${-2 * k} 6 ${-9 * k} 6 ${-9 * k} 1' stroke-width='.8'/>`;
  return `
    <path d='M150 918 C128 860 170 812 150 752 C132 700 168 650 150 592 C134 540 166 488 150 432 C138 392 158 352 150 318' stroke-width='1.5'/>
    ${leafAt(150, 860, 34, -38)}${leafAt(150, 846, 30, 210)}
    ${leafAt(152, 770, 32, -30)}${leafAt(148, 742, 30, 204)}
    ${leafAt(152, 668, 30, -34)}${leafAt(148, 640, 28, 206)}
    ${leafAt(152, 560, 28, -30)}${leafAt(148, 532, 26, 208)}
    ${leafAt(152, 462, 24, -36)}${leafAt(148, 436, 22, 210)}
    ${curl(156, 806, 1)}${curl(144, 702, -1)}${curl(157, 606, 1)}${curl(143, 500, -1)}
    <path d='M150 640 C176 628 196 600 196 572' stroke-width='1'/>${blossom(196, 560, 22, 10)}
    <path d='M150 742 C122 734 104 712 102 688' stroke-width='1'/>${blossom(102, 676, 20, -12)}
    <path d='M150 532 C126 520 112 498 112 474' stroke-width='1'/>${blossom(112, 462, 16, 20)}
    <path d='M150 846 C176 842 192 826 196 806' stroke-width='1'/>${blossom(198, 796, 14, 4)}
    ${blossom(150, 300, 30, 0)}
    ${leafAt(150, 318, 26, -150)}${leafAt(150, 318, 26, -30)}
    <path d='M96 930 Q150 900 204 930' stroke-width='.8' stroke-opacity='.8'/>`;
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
    </g>
    <text x='110' y='125.5' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='38' fill='#fff' fill-opacity='.6'>${text}</text>
    <text x='110' y='124' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='38' fill='${dark(colour, 0.55)}' fill-opacity='1'>${text}</text>
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
      <path d='M20 -14 C60 -76 160 -108 186 -56' fill='none' stroke='${light(c, 0.8)}' stroke-opacity='.55' stroke-width='2' stroke-linecap='round'/>
      <path d='M8 -2 C50 -30 110 -40 150 -30' fill='none' stroke='${dark(c, 0.3)}' stroke-opacity='.35' stroke-width='1.6' stroke-linecap='round'/>
      <path d='M10 2 C54 -8 100 -6 132 14' fill='none' stroke='${dark(c, 0.3)}' stroke-opacity='.28' stroke-width='1.4' stroke-linecap='round'/>
      <path d='M30 -30 C70 -70 130 -86 166 -66' fill='none' stroke='#fff' stroke-opacity='.35' stroke-width='6' stroke-linecap='round' filter='url(#soft2)'/>
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
      <linearGradient id='lg' x1='0' y1='-1' x2='.35' y2='.7'><stop offset='0' stop-color='${light(c, 0.35)}'/><stop offset='.22' stop-color='${dark(c, 0.06)}'/><stop offset='.34' stop-color='${light(c, 0.62)}'/><stop offset='.42' stop-color='${light(c, 0.12)}'/><stop offset='.62' stop-color='${c}'/><stop offset='.74' stop-color='${light(c, 0.38)}'/><stop offset='.86' stop-color='${dark(c, 0.1)}'/><stop offset='1' stop-color='${dark(c, 0.32)}'/></linearGradient>
      <filter id='soft2' x='-10%' y='-30%' width='120%' height='160%'><feGaussianBlur stdDeviation='3'/></filter>
      <filter id='satTex' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='2 .3' numOctaves='1' seed='5' result='n'/><feColorMatrix in='n' type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .22 -.08' result='w'/><feComposite in='w' in2='SourceAlpha' operator='in' result='w2'/><feMerge><feMergeNode in='SourceGraphic'/><feMergeNode in='w2'/></feMerge></filter>
      <radialGradient id='ins' cx='.3' cy='.55' r='.8'><stop offset='0' stop-color='${dark(c, 0.45)}'/><stop offset='.7' stop-color='${dark(c, 0.2)}'/><stop offset='1' stop-color='${c}'/></radialGradient>
      <linearGradient id='tg' x1='0' y1='0' x2='1' y2='.3'><stop offset='0' stop-color='${dark(c, 0.25)}'/><stop offset='.35' stop-color='${light(c, 0.45)}'/><stop offset='.65' stop-color='${c}'/><stop offset='1' stop-color='${dark(c, 0.3)}'/></linearGradient>
      <radialGradient id='kg' cx='.4' cy='.3' r='.75'><stop offset='0' stop-color='${light(c, 0.55)}'/><stop offset='.6' stop-color='${c}'/><stop offset='1' stop-color='${dark(c, 0.35)}'/></radialGradient>
      <radialGradient id='pearl' cx='.36' cy='.32' r='.75'><stop offset='0' stop-color='#ffffff'/><stop offset='.45' stop-color='#f3efe8'/><stop offset='.85' stop-color='#c9c2b6'/><stop offset='1' stop-color='#a69f93'/></radialGradient>
      <filter id='bs' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='10' stdDeviation='9' flood-color='#000' flood-opacity='.3'/></filter>
    </defs>
    <g transform='translate(220 150)' filter='url(#bs)'><g filter='url(#satTex)'>
      ${tail(-1)}${tail(1)}${loop(-1)}${loop(1)}
      <path d='M-28 -24 C-10 -32 10 -32 28 -24 C34 -6 34 10 26 26 C8 32 -8 32 -26 26 C-34 10 -34 -6 -28 -24Z' fill='url(#kg)'/>
      <path d='M-20 -18 C-6 -24 6 -24 20 -18' fill='none' stroke='${light(c, 0.7)}' stroke-opacity='.7' stroke-width='2'/>
      <circle cx='0' cy='0' r='16' fill='url(#pearl)'/>
      <ellipse cx='-5' cy='-6' rx='5' ry='3.4' fill='#fff' fill-opacity='.95'/>
    </g></g>`,
    440,
    400,
    'xMidYMid meet',
  );
}

/** Heavy silk paper: a fine weave, a soft moire (watered silk) and a broad sheen. No pattern to fight the bow. */
function satinPaper(c: SceneColours): string {
  const base = light(c.soft, 0.38);
  return svgUrl(
    `<defs>${GRAIN('g', 1.6, 0.035)}
      <filter id='moire' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.004 .045' numOctaves='3' seed='12' result='n'/><feColorMatrix in='n' type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.6 0 0 0 -.62'/></filter>
      <filter id='weave' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='1.8 .25' numOctaves='1' seed='4' result='n'/><feColorMatrix in='n' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .18 -.07'/></filter>
      <linearGradient id='sheen' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.4'/><stop offset='.35' stop-color='#fff' stop-opacity='0'/><stop offset='.58' stop-color='#fff' stop-opacity='.24'/><stop offset='.7' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.1'/></linearGradient>
    </defs>
    <rect width='500' height='1000' fill='${base}'/>
    <rect width='500' height='1000' filter='url(#moire)' opacity='.5'/>
    <rect width='500' height='1000' filter='url(#weave)'/>
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

/**
 * Real-looking timber as a filter over a flat colour: long figure streaks (stretched noise), fine fibre
 * catching the light, and the colour's own variation. freq is "across along" (vertical grain: '.17 .0035').
 */
const woodFilter = (id: string, freq: string, seed: number, streak: string) => `
<filter id='${id}' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
  <feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='4' seed='${seed}' result='n'/>
  <feColorMatrix in='n' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.3' result='g'/>
  <feFlood flood-color='${streak}' flood-opacity='.55' result='f'/>
  <feComposite in='f' in2='g' operator='in' result='streaks'/>
  <feTurbulence type='fractalNoise' baseFrequency='${freq.split(' ').map((v) => String(Number(v) * 5.5)).join(' ')}' numOctaves='2' seed='${seed + 3}' result='fib'/>
  <feDiffuseLighting in='fib' surfaceScale='1.1' diffuseConstant='1' lighting-color='#fff' result='lit'><feDistantLight azimuth='225' elevation='58'/></feDiffuseLighting>
  <feComposite in='SourceGraphic' in2='lit' operator='arithmetic' k1='1.12' k2='0' k3='0' k4='0' result='base'/>
  <feMerge result='m'><feMergeNode in='base'/><feMergeNode in='streaks'/></feMerge>
  <feComposite in='m' in2='SourceAlpha' operator='in'/>
</filter>`;

/**
 * One barn door (the right one mirrored), built like a real one: tongue-and-groove planks with running
 * grain, knots and weathering, a framed edge of thicker boards with bevelled edges, a diagonal brace, forged
 * strap hinges with rivets, and a pull handle. Lit from the top left, with contact shadows under every board.
 */
function barnArt(c: SceneColours, mirror = false): string {
  const wood = c.envelope;
  const W = 300;
  // The second door: its own boards and grain (it is mirrored on screen, not here: lighting filters go dark when flipped).
  const o = mirror ? 50 : 0;
  const H = 1000;
  // Six planks, each its own tone, with a rounded (lit) face and fine grain running its length.
  const planks = Array.from({ length: 6 }, (_, i) => {
    const x = i * 50;
    const tone = mix(wood, i % 2 ? '#000000' : '#ffffff', 0.03 + rnd(i + o, 4) * 0.07);
    const knots = [0, 1, 2]
      .filter((k) => rnd(i + o, k + 30) > 0.35)
      .map((k) => {
        const kx = x + 12 + rnd(i + o, k + 5) * 26;
        const ky = 60 + rnd(i + o, k + 8) * 880;
        const rx = 3 + rnd(i + o, k) * 3;
        return `<g transform='translate(${f1(kx)} ${f1(ky)})'>${[3.2, 2.3, 1.6, 1].map((m, j) => `<ellipse rx='${f1(rx * m)}' ry='${f1(rx * m * 2.1)}' fill='${j === 3 ? dark(tone, 0.5) : 'none'}' stroke='${dark(tone, 0.38)}' stroke-opacity='${f1(0.25 + j * 0.12)}' stroke-width='.9'/>`).join('')}<ellipse cx='-1' cy='-2' rx='${f1(rx * 0.4)}' ry='${f1(rx * 0.8)}' fill='#fff' fill-opacity='.12'/></g>`;
      })
      .join('');
    // Weathering: a few short end checks (cracks) near the top and bottom.
    const checks = [0, 1].map((k) => `<path d='M${f1(x + 10 + rnd(i + o, k + 40) * 30)} ${k ? H - 4 : 4} l${f1((rnd(i + o, k + 41) - 0.5) * 3)} ${k ? -(18 + rnd(i + o, k) * 30) : 18 + rnd(i + o, k) * 30}' stroke='${dark(tone, 0.55)}' stroke-opacity='.5' stroke-width='1'/>`).join('');
    return `<rect x='${x}' y='0' width='50' height='${H}' fill='${tone}' filter='url(#wv${(i + (mirror ? 1 : 0)) % 3})'/><rect x='${x}' y='0' width='50' height='${H}' fill='url(#plankRound)'/>${knots}${checks}
      <rect x='${x}' y='0' width='3' height='${H}' fill='${dark(wood, 0.62)}'/><rect x='${x + 3}' y='0' width='4' height='${H}' fill='#000' fill-opacity='.14'/><rect x='${x + 48.6}' y='0' width='1.4' height='${H}' fill='${light(wood, 0.4)}' fill-opacity='.45'/>`;
  }).join('');
  // A thick board with bevelled edges: lit top and left, shaded bottom and right, a soft shadow beneath.
  const board = (x: number, y: number, w: number, h: number, k: number) => {
    const tone = light(wood, 0.08 + rnd(k, 61) * 0.05);
    return `<rect x='${x + 3}' y='${y + 6}' width='${w}' height='${h}' fill='#000' fill-opacity='.38' filter='url(#soft)'/>
      <rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${tone}' filter='url(#${w > h ? 'wh' : 'wv1'})'/>
      <rect x='${x}' y='${y}' width='${w}' height='${h}' fill='url(#boardLit)'/>
      <rect x='${x}' y='${y}' width='${w}' height='2.4' fill='#fff' fill-opacity='.32'/><rect x='${x}' y='${y}' width='2' height='${h}' fill='#fff' fill-opacity='.2'/>
      <rect x='${x}' y='${y + h - 3}' width='${w}' height='3' fill='#000' fill-opacity='.4'/><rect x='${x + w - 2.4}' y='${y}' width='2.4' height='${h}' fill='#000' fill-opacity='.3'/>`;
  };
  const rivet = (x: number, y: number, r = 4) => `<circle cx='${x}' cy='${y + 1.5}' r='${r}' fill='#000' fill-opacity='.45'/><circle cx='${x}' cy='${y}' r='${r}' fill='url(#iron)'/><circle cx='${f1(x - r * 0.35)}' cy='${f1(y - r * 0.35)}' r='${f1(r * 0.35)}' fill='#fff' fill-opacity='.55'/>`;
  // A forged strap hinge: tapering, with a spear-and-scroll end.
  const strap = (y: number) => `<g>
      <path d='M0 ${y + 6} H178 L200 ${y - 4} L232 ${y + 15} L200 ${y + 34} L178 ${y + 24} H0Z' fill='#000' fill-opacity='.4' filter='url(#soft)' transform='translate(3 6)'/>
      <path d='M0 ${y} H178 L200 ${y - 10} L232 ${y + 15} L200 ${y + 40} L178 ${y + 30} H0Z' fill='url(#iron)'/>
      <path d='M0 ${y} H178 L200 ${y - 10} L232 ${y + 15}' fill='none' stroke='#fff' stroke-opacity='.28' stroke-width='1.4'/>
      <path d='M206 ${y + 15} m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0' fill='${dark(wood, 0.2)}' fill-opacity='.6'/>
      ${[26, 74, 122, 166].map((x) => rivet(x, y + 15)).join('')}
    </g>`;
  const flip = '';
  // The brace: one board from the lower hinge side up to the latch side (the strongest way to brace a door).
  const len = Math.hypot(220, 560);
  const ang = (Math.atan2(560, 220) * 180) / Math.PI;
  return svgUrl(
    `<defs>
      <filter id='soft' x='-10%' y='-10%' width='120%' height='130%'><feGaussianBlur stdDeviation='4'/></filter>
      ${[0, 1, 2].map((n) => woodFilter(`wv${n}`, '.17 .0035', 4 + n * 7 + o, dark(wood, 0.55))).join('')}
      ${woodFilter('wh', '.0035 .17', 19, dark(wood, 0.55))}
      <filter id='grain' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.85 .01' numOctaves='3' seed='11'/><feColorMatrix type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 -.2'/></filter>
      <linearGradient id='plankRound' x1='0' x2='1'><stop offset='0' stop-color='#000' stop-opacity='.16'/><stop offset='.35' stop-color='#fff' stop-opacity='.07'/><stop offset='.7' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.12'/></linearGradient>
      <linearGradient id='boardLit' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.12'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.16'/></linearGradient>
      <linearGradient id='iron' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6d6762'/><stop offset='.45' stop-color='#3a3633'/><stop offset='1' stop-color='#1d1b1a'/></linearGradient>
      <linearGradient id='lit' x1='${mirror ? 1 : 0}' y1='0' x2='${mirror ? 0 : 1}' y2='.5'><stop offset='0' stop-color='#ffe8c0' stop-opacity='.2'/><stop offset='.45' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.28'/></linearGradient>
      <radialGradient id='ao' cx='.5' cy='.5' r='.75'><stop offset='.62' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.4'/></radialGradient>
    </defs>
    <g transform='${flip}'>
      ${planks}
      <g transform='translate(150 500) rotate(${f1(ang)})'>${board(-len / 2, -23, len, 46, 7)}</g>
      ${board(0, 0, W, 64, 1)}
      ${board(0, 210, W, 54, 2)}
      ${board(0, 736, W, 54, 3)}
      ${board(0, 936, W, 64, 4)}
      ${board(0, 0, 40, H, 5)}
      ${board(W - 40, 0, 40, H, 6)}
      ${strap(120)}${strap(846)}
      <rect x='${W - 74}' y='436' width='26' height='14' rx='3' fill='url(#iron)'/><rect x='${W - 74}' y='552' width='26' height='14' rx='3' fill='url(#iron)'/>
      <rect x='${W - 66}' y='436' width='10' height='130' rx='5' fill='#000' fill-opacity='.35' filter='url(#soft)' transform='translate(4 6)'/>
      <rect x='${W - 66}' y='440' width='10' height='122' rx='5' fill='url(#iron)'/><rect x='${W - 64}' y='446' width='2.5' height='110' rx='1' fill='#fff' fill-opacity='.3'/>
      ${rivet(W - 68, 443, 2.6)}${rivet(W - 54, 443, 2.6)}${rivet(W - 68, 559, 2.6)}${rivet(W - 54, 559, 2.6)}
    </g>
    <rect width='${W}' height='${H}' fill='url(#lit)'/>
    <rect width='${W}' height='${H}' fill='url(#ao)'/>`,
    W,
    H,
  );
}

/**
 * Through the barn doors: the ceremony at golden hour. A low sun over a tree line, rolling hills, the lawn
 * striped with light, rows of cross-back chairs down an aisle of petals, and a timber arbour draped in
 * chiffon with flowers at its corners.
 */
function fieldArt(c: SceneColours): string {
  const hill1 = mix('#a7b47f', c.soft, 0.25);
  const hill2 = mix('#86996a', c.ink, 0.12);
  const trees = Array.from({ length: 26 }, (_, i) => `<circle cx='${f1(i * 20 + rnd(i, 1) * 10)}' cy='${f1(520 - rnd(i, 2) * 26)}' r='${f1(16 + rnd(i, 3) * 14)}'/>`).join('');
  // Chairs: rows either side of the aisle, smaller (further away) towards the arbour.
  const chairs = Array.from({ length: 6 }, (_, row) => {
    const t = row / 5;
    const y = 690 + t * 250;
    const s = 0.55 + t * 0.75;
    const aisle = 22 + t * 34;
    return Array.from({ length: 4 }, (_, k) =>
      [-1, 1]
        .map((side) => {
          const x = 250 + side * (aisle + k * 26 * s + 12 * s);
          return `<g transform='translate(${f1(x)} ${f1(y)}) scale(${f1(s)})'><ellipse cx='0' cy='26' rx='11' ry='3' fill='#000' fill-opacity='.18'/><rect x='-9' y='-16' width='18' height='4' rx='1' fill='${mix('#9a7b58', c.envelope, 0.3)}'/><path d='M-8 -14 L8 2 M8 -14 L-8 2' stroke='${mix('#8a6c4c', c.envelope, 0.3)}' stroke-width='2'/><rect x='-10' y='2' width='20' height='5' rx='1.5' fill='${mix('#b08f69', c.envelope, 0.3)}'/><path d='M-8 7 V26 M8 7 V26' stroke='${mix('#7c6046', c.envelope, 0.3)}' stroke-width='2.2'/></g>`;
        })
        .join(''),
    ).join('');
  }).join('');
  const petals = Array.from({ length: 70 }, (_, i) => {
    const t = rnd(i, 1);
    const y = 690 + t * 310;
    const x = 250 + (rnd(i, 2) - 0.5) * (30 + t * 70);
    return `<ellipse cx='${f1(x)}' cy='${f1(y)}' rx='${f1(1.5 + t * 2.5)}' ry='${f1(1 + t * 1.5)}' fill='${i % 3 ? '#f6d9dc' : '#fffaf2'}' transform='rotate(${f1(rnd(i, 3) * 180)} ${f1(x)} ${f1(y)})'/>`;
  }).join('');
  const bloomAt = (x: number, y: number, r: number) =>
    Array.from({ length: 9 }, (_, i) => `<circle cx='${f1(x + (rnd(i, 4) - 0.5) * r * 2)}' cy='${f1(y + (rnd(i, 5) - 0.5) * r * 1.4)}' r='${f1(r * (0.32 + rnd(i, 6) * 0.25))}' fill='${['#fffaf2', '#f6d9dc', light(c.soft, 0.3), '#eef1e6'][i % 4]}'/>`).join('') +
    Array.from({ length: 6 }, (_, i) => `<ellipse cx='${f1(x + (rnd(i, 7) - 0.5) * r * 2.6)}' cy='${f1(y + (rnd(i, 8) - 0.2) * r * 1.4)}' rx='${f1(r * 0.35)}' ry='${f1(r * 0.16)}' fill='#7f9478' transform='rotate(${f1(rnd(i, 9) * 180)} ${f1(x)} ${f1(y)})'/>`).join('');
  return svgUrl(
    `<defs>
      <linearGradient id='gsky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#8fb3cf'/><stop offset='.45' stop-color='#f3d9b5'/><stop offset='.8' stop-color='#f7c991'/><stop offset='1' stop-color='#f9e4c0'/></linearGradient>
      <radialGradient id='gsun' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff8dc'/><stop offset='.18' stop-color='#ffe9b0' stop-opacity='.95'/><stop offset='1' stop-color='#ffd890' stop-opacity='0'/></radialGradient>
      <linearGradient id='lawnG' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${mix('#b3bf83', c.soft, 0.15)}'/><stop offset='1' stop-color='${mix('#738e55', c.ink, 0.12)}'/></linearGradient>
      <linearGradient id='haze' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff1d6' stop-opacity='0'/><stop offset='1' stop-color='#fff1d6' stop-opacity='.55'/></linearGradient>
      <linearGradient id='chif' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.95'/><stop offset='1' stop-color='#fff' stop-opacity='.55'/></linearGradient>
      <filter id='blurT' x='-5%' y='-20%' width='110%' height='140%'><feGaussianBlur stdDeviation='2.5'/></filter>
    </defs>
    <rect width='500' height='600' fill='url(#gsky)'/>
    <circle cx='330' cy='505' r='190' fill='url(#gsun)'/>
    <g fill='${mix('#6f7f5a', c.ink, 0.25)}' fill-opacity='.75' filter='url(#blurT)'>${trees}</g>
    <rect y='470' width='500' height='80' fill='url(#haze)'/>
    <path d='M0 555 C90 520 170 540 250 520 C340 498 420 535 500 515 V660 H0Z' fill='${hill1}'/>
    <path d='M0 600 C110 575 200 602 300 580 C390 560 450 590 500 580 V700 H0Z' fill='${hill2}'/>
    <rect y='640' width='500' height='360' fill='url(#lawnG)'/>
    ${Array.from({ length: 7 }, (_, i) => `<path d='M${250 - 40 - i * 90} 1000 L248 640 H252 L${250 + 40 + i * 90} 1000' fill='#fff' fill-opacity='${i % 2 ? 0.04 : 0}'/>`).join('')}
    <path d='M222 1000 L246 650 H254 L278 1000Z' fill='#f4ece0' fill-opacity='.85'/>
    ${petals}
    <g transform='translate(250 600)'>
      <ellipse cx='0' cy='52' rx='70' ry='8' fill='#000' fill-opacity='.18'/>
      <rect x='-52' y='-70' width='7' height='122' fill='#7b5d42'/><rect x='45' y='-70' width='7' height='122' fill='#6c5039'/>
      <rect x='-62' y='-78' width='124' height='9' fill='#87684b'/><rect x='-62' y='-78' width='124' height='2' fill='#fff' fill-opacity='.3'/>
      <path d='M-60 -70 C-40 -30 -20 -30 0 -60 C20 -30 40 -30 60 -70 L60 -62 C40 -24 20 -24 0 -52 C-20 -24 -40 -24 -60 -62Z' fill='url(#chif)'/>
      <path d='M-52 -66 C-62 -20 -44 10 -58 52 L-46 52 C-38 14 -54 -20 -46 -66Z' fill='url(#chif)'/>
      <path d='M52 -66 C62 -20 44 10 58 52 L46 52 C38 14 54 -20 46 -66Z' fill='url(#chif)'/>
      ${bloomAt(-50, -74, 16)}${bloomAt(52, -74, 13)}${bloomAt(-48, 44, 12)}
    </g>
    ${chairs}
    <rect width='500' height='1000' fill='#ffcf8a' fill-opacity='.08'/>`,
    500,
    1000,
    'xMidYMid slice',
  );
}

/** Festoon lights strung above the barn: warm bulbs on two swags, glowing. */
function festoonArt(): string {
  const swag = (y: number, sag: number, n: number, k: number) => {
    const pts = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      return { x: t * 500, y: y + Math.sin(t * Math.PI) * sag };
    });
    const wire = `<path d='M0 ${y} Q250 ${y + sag * 2} 500 ${y}' fill='none' stroke='#1d1b1a' stroke-width='1.6'/>`;
    const bulbs = pts
      .slice(1, -1)
      .map((p, i) => `<g transform='translate(${f1(p.x)} ${f1(p.y)})'><circle cy='14' r='${f1(18 + rnd(i + k, 3) * 6)}' fill='url(#halo)'/><rect x='-2.4' y='0' width='4.8' height='6' fill='#2a2724'/><ellipse cy='13' rx='5' ry='7' fill='url(#bulb)'/><ellipse cx='-1.6' cy='10.5' rx='1.3' ry='2.4' fill='#fff' fill-opacity='.85'/></g>`)
      .join('');
    return wire + bulbs;
  };
  return svgUrl(
    `<defs>
      <radialGradient id='bulb' cx='.45' cy='.4' r='.65'><stop offset='0' stop-color='#fffbe6'/><stop offset='.5' stop-color='#ffe2a0'/><stop offset='1' stop-color='#f0b45c'/></radialGradient>
      <radialGradient id='halo' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#ffe6a8' stop-opacity='.6'/><stop offset='1' stop-color='#ffe6a8' stop-opacity='0'/></radialGradient>
    </defs>
    ${swag(30, 46, 11, 0)}${swag(10, 70, 13, 5)}`,
    500,
    180,
    'xMidYMin slice',
  );
}

/**
 * A eucalyptus wreath that looks gathered by hand, not drawn: eighteen cut stems laid round a twig base, each
 * with its own run of waxy silver-dollar leaves (bigger near the cut, small at the tip, some turned edge-on),
 * the leaves textured with their powdery bloom and shaded where the layers overlap. Waxflower sprigs, three
 * cream roses built petal by petal, a linen bow with frayed tails, and a little kraft tag. The whole ring is
 * then lit as one rounded form (bright at the top left, falling into shadow at the bottom right).
 */
function wreathArt(c: SceneColours, initials: string): string {
  const S = 260;
  const C0 = S / 2;
  const R = 82;
  // One stem: an arc that follows the ring, drifting a little in or out, with leaves in pairs along it.
  const stem = (k: number, layer: number) => {
    const a0 = (k / 18) * Math.PI * 2 + layer * 0.17 + rnd(k + layer * 30, 1) * 0.12;
    const span = 0.45 + rnd(k + layer * 30, 2) * 0.5;
    const r0 = R + (layer - 1) * 7 + (rnd(k + layer * 30, 3) - 0.5) * 8;
    const dr = (rnd(k + layer * 30, 4) - 0.5) * (layer === 2 ? 52 : 34);
    const at = (t: number) => {
      const a = a0 + t * span;
      const r = r0 + dr * t * t;
      return { x: C0 + Math.cos(a) * r, y: C0 + Math.sin(a) * r, a };
    };
    const pts = Array.from({ length: 7 }, (_, i) => at(i / 6));
    const path = `<path d='M${pts.map((p) => `${f1(p.x)} ${f1(p.y)}`).join(' L')}' fill='none' stroke='#7a5a4a' stroke-width='${f1(1.6 - layer * 0.25)}' stroke-linecap='round' stroke-linejoin='round'/>`;
    let leaves = '';
    // The top layer is sparser, so the outline is airy, not a solid ring of bubbles.
    const gap = layer === 2 ? 0.17 : 0.12;
    for (let j = 0; j < 9; j++) {
      const t = 0.08 + j * gap;
      if (t > 1.02) break;
      const p = at(Math.min(1, t));
      const side = j % 2 ? 1 : -1;
      const sz = (11 - t * 7.5) * (0.7 + rnd(k * 9 + j + layer * 99, 5) * 0.55);
      const tang = (p.a * 180) / Math.PI + 90;
      const turn = tang + side * (55 + rnd(k * 9 + j, 6) * 30);
      const edge = rnd(k * 9 + j + layer * 7, 7) < 0.16;
      const tone = (k + j + layer) % 4;
      const ox = Math.cos(((turn - 90) * Math.PI) / 180) * sz * 0.9;
      const oy = Math.sin(((turn - 90) * Math.PI) / 180) * sz * 0.9;
      leaves += `<g transform='translate(${f1(p.x + ox)} ${f1(p.y + oy)}) rotate(${f1(turn)})'><path d='M0 ${f1(sz * 0.95)} L0 ${f1(sz * 1.5)}' stroke='#8a6656' stroke-width='.9'/><ellipse rx='${f1(edge ? sz * 0.3 : sz)}' ry='${f1(sz * 0.93)}' fill='url(#lf${tone})' stroke='#e8efe9' stroke-opacity='.35' stroke-width='.5'/>${edge ? '' : `<path d='M0 ${f1(sz * 0.9)} Q${f1(sz * 0.08)} 0 0 ${f1(-sz * 0.8)}' fill='none' stroke='#5d7366' stroke-opacity='.45' stroke-width='.55'/>`}</g>`;
    }
    return path + leaves;
  };
  // Seeded-eucalyptus sprigs: long narrow leaves that break the outline.
  const sprigs = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + 0.3 + rnd(i, 40) * 0.3;
    const r0 = R + (rnd(i, 41) - 0.3) * 18;
    const x = C0 + Math.cos(a) * r0;
    const y = C0 + Math.sin(a) * r0;
    const dir = (a * 180) / Math.PI + 90 + (rnd(i, 42) - 0.5) * 40;
    const len = 26 + rnd(i, 43) * 16;
    return `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(dir)})'><path d='M0 0 Q${f1(len * 0.1)} ${f1(-len * 0.5)} 0 ${f1(-len)}' fill='none' stroke='#6f5a4a' stroke-width='.9'/>${[0.25, 0.45, 0.65, 0.85]
      .map((t, j) => `<path transform='translate(0 ${f1(-len * t)}) rotate(${j % 2 ? 38 : -38})' d='M0 0 C2.2 -3 2.2 -9 0 -13 C-2.2 -9 -2.2 -3 0 0Z' fill='url(#lf${(i + j) % 4})'/>`)
      .join('')}${[0, 1, 2].map((j) => `<circle cx='${f1((j - 1) * 2.2)}' cy='${f1(-len - 2 - (j % 2) * 2)}' r='1.6' fill='#7f8c6c'/>`).join('')}</g>`;
  }).join('');
  const layer = (n: number) => `<g filter='url(#lift)'><g filter='url(#bloomTex)'>${Array.from({ length: 18 }, (_, k) => stem(k, n)).join('')}</g></g>`;
  const twigs = Array.from({ length: 22 }, (_, i) => {
    const a0 = (i / 22) * Math.PI * 2 + rnd(i, 1) * 0.2;
    const r = R - 4 + rnd(i, 2) * 10;
    const x1 = C0 + Math.cos(a0) * r;
    const y1 = C0 + Math.sin(a0) * r;
    const x2 = C0 + Math.cos(a0 + 0.55) * (r + 3);
    const y2 = C0 + Math.sin(a0 + 0.55) * (r + 3);
    return `<path d='M${f1(x1)} ${f1(y1)} Q${f1(C0 + Math.cos(a0 + 0.28) * (r + 10))} ${f1(C0 + Math.sin(a0 + 0.28) * (r + 10))} ${f1(x2)} ${f1(y2)}' fill='none' stroke='${i % 2 ? '#5e4636' : '#76594a'}' stroke-width='${f1(1.4 + rnd(i, 3) * 1.8)}' stroke-linecap='round'/>`;
  }).join('');
  // Waxflower: tiny five-petalled flowers in small clusters.
  const wax = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + 0.5;
    const r = R + (rnd(i, 8) - 0.5) * 22;
    const cx = C0 + Math.cos(a) * r;
    const cy = C0 + Math.sin(a) * r;
    return Array.from({ length: 4 }, (_, j) => {
      const x = cx + (rnd(i * 4 + j, 9) - 0.5) * 12;
      const y = cy + (rnd(i * 4 + j, 10) - 0.5) * 12;
      return `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rnd(i * 4 + j, 11) * 72)})'>${[0, 72, 144, 216, 288].map((d) => `<ellipse cy='-2.1' rx='1.4' ry='2.1' transform='rotate(${d})' fill='#fbf6f2'/>`).join('')}<circle r='1' fill='#c99aa0'/></g>`;
    }).join('');
  }).join('');
  // A garden rose, built from its petals: outer cupped petals, a tighter ring, and the furled centre.
  const rose = (x: number, y: number, r: number, turn: number) => {
    const ring = (n: number, rr: number, w: number, off: number, grad: string) =>
      Array.from({ length: n }, (_, i) => {
        const a = off + (i * 360) / n;
        return `<path transform='rotate(${f1(a)})' d='M0 0 C${f1(-w)} ${f1(-rr * 0.3)} ${f1(-w * 0.95)} ${f1(-rr * 0.95)} 0 ${f1(-rr)} C${f1(w * 0.95)} ${f1(-rr * 0.95)} ${f1(w)} ${f1(-rr * 0.3)} 0 0Z' fill='url(#${grad})' stroke='#cfb39b' stroke-opacity='.5' stroke-width='.4'/>`;
      }).join('');
    return `<g transform='translate(${x} ${y}) rotate(${turn})' filter='url(#lift)'>
      ${ring(5, r, r * 0.62, 10, 'pet')}${ring(5, r * 0.74, r * 0.5, 46, 'pet')}${ring(4, r * 0.5, r * 0.38, 20, 'pet2')}
      <path d='M${f1(-r * 0.28)} 0 A${f1(r * 0.28)} ${f1(r * 0.28)} 0 1 1 ${f1(r * 0.2)} ${f1(r * 0.2)}' fill='none' stroke='#b89a82' stroke-width='.9'/>
      <path d='M${f1(-r * 0.12)} 0 A${f1(r * 0.13)} ${f1(r * 0.13)} 0 1 0 ${f1(r * 0.1)} ${f1(-r * 0.08)}' fill='none' stroke='#a98b74' stroke-width='.8'/>
      <circle r='${f1(r * 0.07)}' fill='#a98b74'/>
    </g>`;
  };
  const text = initials.replace(/&/g, '&amp;').replace(/</g, '');
  const linen = light(c.paper, 0.15);
  return svgUrl(
    `<defs>
      <radialGradient id='lf0' cx='.36' cy='.32' r='.75'><stop offset='0' stop-color='#d3ddd5'/><stop offset='.45' stop-color='#9fb2a6'/><stop offset='1' stop-color='#6e8679'/></radialGradient>
      <radialGradient id='lf1' cx='.36' cy='.32' r='.75'><stop offset='0' stop-color='#c5d3cb'/><stop offset='.5' stop-color='#8ea397'/><stop offset='1' stop-color='#5f776b'/></radialGradient>
      <radialGradient id='lf2' cx='.36' cy='.32' r='.75'><stop offset='0' stop-color='#d8e0dc'/><stop offset='.5' stop-color='#a9b8b1'/><stop offset='1' stop-color='#7d8f8a'/></radialGradient>
      <radialGradient id='lf3' cx='.36' cy='.32' r='.75'><stop offset='0' stop-color='#cdd5d0'/><stop offset='.55' stop-color='#97a49d'/><stop offset='1' stop-color='#7c7480'/></radialGradient>
      <radialGradient id='pet' cx='.5' cy='.95' r='1'><stop offset='0' stop-color='#fbf3ea'/><stop offset='.6' stop-color='#f1e2d2'/><stop offset='1' stop-color='#dcc2ab'/></radialGradient>
      <radialGradient id='pet2' cx='.5' cy='.95' r='1'><stop offset='0' stop-color='#efdccb'/><stop offset='1' stop-color='#d2b59c'/></radialGradient>
      <linearGradient id='lin' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${light(linen, 0.3)}'/><stop offset='.5' stop-color='${linen}'/><stop offset='1' stop-color='${dark(linen, 0.12)}'/></linearGradient>
      <filter id='bloomTex' x='-5%' y='-5%' width='110%' height='110%'>
        <feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' seed='3' result='n'/>
        <feColorMatrix in='n' type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 -.22' result='speck'/>
        <feComposite in='speck' in2='SourceAlpha' operator='in' result='s2'/>
        <feMerge><feMergeNode in='SourceGraphic'/><feMergeNode in='s2'/></feMerge>
      </filter>
      <filter id='lift' x='-10%' y='-10%' width='120%' height='125%'><feDropShadow dx='1.2' dy='2.4' stdDeviation='1.6' flood-color='#1d2a22' flood-opacity='.45'/></filter>
      <filter id='form' x='-10%' y='-10%' width='120%' height='130%' color-interpolation-filters='sRGB'>
        <feGaussianBlur in='SourceAlpha' stdDeviation='9' result='b'/>
        <feDiffuseLighting in='b' surfaceScale='7' diffuseConstant='1.05' lighting-color='#fff' result='l'><feDistantLight azimuth='225' elevation='38'/></feDiffuseLighting>
        <feComposite in='SourceGraphic' in2='l' operator='arithmetic' k1='1.15' k2='0' k3='0' k4='0' result='lit'/>
        <feComposite in='lit' in2='SourceAlpha' operator='in' result='shape'/>
        <feDropShadow in='shape' dx='3' dy='10' stdDeviation='7' flood-color='#000' flood-opacity='.45'/>
      </filter>
      <filter id='weave' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='1.6 .4' numOctaves='2' seed='9' result='n'/><feColorMatrix in='n' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 -.18' result='d'/><feComposite in='d' in2='SourceAlpha' operator='in' result='d2'/><feMerge><feMergeNode in='SourceGraphic'/><feMergeNode in='d2'/></feMerge></filter>
    </defs>
    <g filter='url(#form)'>
      ${twigs}
      ${layer(0)}${layer(1)}<g filter='url(#lift)'>${sprigs}</g>${layer(2)}
      ${wax}
      ${rose(76, 192, 15, 10)}${rose(98, 208, 11.5, -30)}${rose(62, 168, 10, 40)}
    </g>
    <g filter='url(#lift)'>
      <g filter='url(#weave)'>
        <path d='M128 52 C104 26 82 40 106 56 C112 58 120 57 128 54Z M132 52 C156 26 178 40 154 56 C148 58 140 57 132 54Z' fill='url(#lin)'/>
        <path d='M126 56 C118 82 112 108 98 136 L104 133 L106 139 C120 110 126 84 130 58Z M134 56 C142 84 148 108 164 134 L158 132 L156 138 C142 110 136 84 130 58Z' fill='url(#lin)'/>
        <ellipse cx='130' cy='54' rx='7' ry='6' fill='url(#lin)'/>
      </g>
      <path d='M126 52 C110 38 98 40 104 50 C110 54 118 54 126 53Z M134 52 C150 38 162 40 156 50 C150 54 142 54 134 53Z' fill='#000' fill-opacity='.14'/>
      <path d='M106 56 C114 58 122 57 127 54' fill='none' stroke='#000' stroke-opacity='.18' stroke-width='1.2'/><path d='M154 56 C146 58 138 57 133 54' fill='none' stroke='#000' stroke-opacity='.18' stroke-width='1.2'/>
      <path d='M126 58 C122 74 118 90 112 104 L116 105 C121 92 125 76 128 60Z' fill='#000' fill-opacity='.12'/><path d='M136 60 C140 78 146 96 152 110 L156 108 C150 94 144 78 134 58Z' fill='#000' fill-opacity='.08'/>
      <path d='M124 50 C127 56 133 56 136 50' fill='none' stroke='#000' stroke-opacity='.22' stroke-width='1'/><path d='M126 58 C128 55 132 55 134 58' fill='none' stroke='#fff' stroke-opacity='.5' stroke-width='.8'/>
      <path d='M98 136 l2 -2 l1 3 l2 -2 l2 2 M158 132 l2 2 l1 -3 l2 2 l1 -2' fill='none' stroke='#cdbf9f' stroke-width='.7'/>
      <path d='M118 40 C112 44 110 50 114 54 M142 40 C148 44 150 50 146 54' fill='none' stroke='#000' stroke-opacity='.12' stroke-width='1.2'/>
      <path d='M130 60 V156' stroke='#a88c64' stroke-width='.9'/>
      <g transform='translate(130 172) rotate(-5)'><path d='M-30 -15 H30 V15 H-30 Z' fill='#cdb08a'/><path d='M-30 -15 H30 V15 H-30 Z' fill='#fff' fill-opacity='.08' filter='url(#weave)'/><circle cx='-22' cy='0' r='2.4' fill='#8e734f'/><text x='5' y='6' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='15' fill='#3b2c1d'>${text}</text></g>
    </g>`,
    S,
    S,
    'xMidYMid meet',
  );
}

/**
 * The stage behind the curtain: a dark house, floorboards running away from us in perspective, a
 * spotlight cone from above and its warm pool on the boards.
 */
function stageArt(c: SceneColours): string {
  const boards = Array.from({ length: 15 }, (_, i) => {
    const x = (i / 14) * 900 - 200;
    return `<path d='M250 640 L${f1(x)} 1000' stroke='#000' stroke-opacity='.35' stroke-width='1.2'/>`;
  }).join('');
  const rows = Array.from({ length: 9 }, (_, i) => {
    const y = 640 + Math.pow(i / 8, 1.8) * 360;
    return `<path d='M0 ${f1(y)} H500' stroke='#000' stroke-opacity='${f1(0.03 + i * 0.008)}' stroke-width='.8'/>`;
  }).join('');
  return svgUrl(
    `<defs>
      <linearGradient id='wall' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0d0a09'/><stop offset='1' stop-color='${dark(c.envelope, 0.75)}'/></linearGradient>
      <linearGradient id='floor' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3a2618'/><stop offset='1' stop-color='#6b4529'/></linearGradient>
      <linearGradient id='cone' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff4da' stop-opacity='.5'/><stop offset='1' stop-color='#fff4da' stop-opacity='.05'/></linearGradient>
      <radialGradient id='pool' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#ffe9bf' stop-opacity='.85'/><stop offset='.6' stop-color='#ffd99a' stop-opacity='.35'/><stop offset='1' stop-color='#ffd99a' stop-opacity='0'/></radialGradient>
      <filter id='sb' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='8'/></filter>
      <filter id='wd' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.01 .5' numOctaves='3' seed='6'/><feColorMatrix type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .45 -.15'/></filter>
    </defs>
    <rect width='500' height='660' fill='url(#wall)'/>
    <rect y='640' width='500' height='360' fill='url(#floor)'/>
    <rect y='640' width='500' height='360' filter='url(#wd)'/>
    ${boards}${rows}
    <rect y='636' width='500' height='6' fill='${c.accent}' fill-opacity='.5'/>
    <path d='M215 0 L285 0 L360 760 L140 760Z' fill='url(#cone)' filter='url(#sb)'/>
    <ellipse cx='250' cy='770' rx='150' ry='42' fill='url(#pool)'/>`,
    500,
    1000,
    'xMidYMid slice',
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

/**
 * The storybook's first page, as a fine edition prints it: laid cream paper, a gilt double rule, an engraved
 * headpiece, a large gilt drop cap opening "Once upon a time", lines of type, and a small tailpiece.
 */
function pageArt(c: SceneColours): string {
  const gold = c.accent;
  const ink = mix(c.ink, '#3a3128', 0.4);
  const lines = Array.from({ length: 11 }, (_, i) => {
    const y = 338 + i * 17;
    const w = (i === 10 ? 0.45 : 0.9 + rnd(i, 3) * 0.1) * 204;
    return `<rect x='48' y='${y}' width='${f1(w)}' height='3' rx='1.5' fill='${ink}' fill-opacity='.2'/>`;
  }).join('');
  const scroll = (x: number, y: number, f: number) => `<g transform='translate(${x} ${y}) scale(${f} 1)' fill='none' stroke='url(#gp)' stroke-width='1.3' stroke-linecap='round'><path d='M6 0 C20 -12 40 -12 52 0 C62 10 76 8 80 -2 C82 -8 76 -12 72 -8'/><path d='M16 -4 C22 -14 30 -16 36 -10'/><path d='M52 0 C46 8 52 14 58 10'/><circle cx='80' cy='-2' r='1.6' fill='url(#gp)'/></g>`;
  return svgUrl(
    `<defs>${GRAIN('pg', 1.4, 0.045)}
      <filter id='laid' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.02 .9' numOctaves='2' seed='3'/><feColorMatrix type='matrix' values='0 0 0 0 .5  0 0 0 0 .4  0 0 0 0 .3  0 0 0 .12 -.03'/></filter>
      <linearGradient id='gp' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${light(gold, 0.5)}'/><stop offset='.4' stop-color='${gold}'/><stop offset='.65' stop-color='${light(gold, 0.3)}'/><stop offset='1' stop-color='${dark(gold, 0.3)}'/></linearGradient>
      <linearGradient id='gutter' x1='0' x2='1'><stop offset='0' stop-color='#000' stop-opacity='.22'/><stop offset='.12' stop-color='#000' stop-opacity='0'/></linearGradient>
    </defs>
    <rect width='300' height='620' fill='${mix('#fbf5e8', c.paper, 0.4)}'/>
    <rect width='300' height='620' filter='url(#laid)'/>
    <rect x='24' y='24' width='252' height='572' fill='none' stroke='url(#gp)' stroke-width='1.6'/>
    <rect x='30' y='30' width='240' height='560' fill='none' stroke='url(#gp)' stroke-width='.6'/>
    ${scroll(150, 118, 1)}${scroll(150, 118, -1)}
    <path d='M0 0 L4 -4 L8 0 L4 4Z' transform='translate(146 118)' fill='url(#gp)'/>
    <text x='150' y='170' text-anchor='middle' font-family='Georgia, serif' font-size='11' letter-spacing='4' fill='${ink}' fill-opacity='.7'>CHAPTER THE FIRST</text>
    <text x='150' y='214' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='26' fill='${ink}'>Once upon a time</text>
    <path d='M110 232 H190' stroke='url(#gp)' stroke-width='.8'/>
    <rect x='48' y='258' width='56' height='64' fill='${dark(c.envelope, 0.05)}'/>
    <rect x='51' y='261' width='50' height='58' fill='none' stroke='url(#gp)' stroke-width='1'/>
    <text x='76' y='310' text-anchor='middle' font-family='Georgia, serif' font-size='52' fill='url(#gp)'>O</text>
    <rect x='114' y='266' width='138' height='3' rx='1.5' fill='${ink}' fill-opacity='.2'/>
    <rect x='114' y='283' width='126' height='3' rx='1.5' fill='${ink}' fill-opacity='.2'/>
    <rect x='114' y='300' width='134' height='3' rx='1.5' fill='${ink}' fill-opacity='.2'/>
    <rect x='114' y='317' width='120' height='3' rx='1.5' fill='${ink}' fill-opacity='.2'/>
    ${lines}
    <g transform='translate(150 548)' fill='url(#gp)'><path d='M-30 0 H-8 M8 0 H30' stroke='url(#gp)' stroke-width='.8'/><path d='M0 -7 L5 0 L0 7 L-5 0Z'/></g>
    <rect width='300' height='620' fill='url(#gutter)'/>
    <rect width='300' height='620' filter='url(#pg)'/>`,
    300,
    620,
  );
}

/** A wrought-iron garden gate (the right one mirrored): bars with spear tips, scrolls, an arched rail and a monogram plate. */
function gateArt(c: SceneColours, mirror = false): string {
  const iron = dark(c.envelope, 0.1);
  const bars = Array.from({ length: 9 }, (_, i) => {
    const x = 26 + i * 31;
    const top = 150 + Math.pow((x - 300) / 300, 2) * -60 + 60;
    return `<rect x='${x - 3}' y='${f1(top)}' width='6' height='${f1(940 - top)}' fill='url(#ironG)'/><path d='M${x} ${f1(top - 26)} L${x + 7} ${f1(top - 4)} L${x} ${f1(top + 2)} L${x - 7} ${f1(top - 4)}Z' fill='url(#ironG)'/>`;
  }).join('');
  const scroll = (x: number, y: number, s: number, f = 1) => `<g transform='translate(${x} ${y}) scale(${s * f} ${s})' fill='none' stroke='url(#ironG)' stroke-width='${f1(5 / s)}' stroke-linecap='round'><path d='M0 0 C0 -30 40 -30 40 0 C40 18 18 22 14 8 C11 -2 24 -4 24 4'/><path d='M0 0 C0 30 -40 30 -40 0 C-40 -18 -18 -22 -14 -8 C-11 2 -24 4 -24 -4'/></g>`;
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
`,
    300,
    1000,
  );
}

/**
 * Beyond the gates: a formal garden in morning light. A gravel walk between clipped box hedges (leafy,
 * textured, lit on top), topiary balls in stone urns, roses along the beds, tall cypresses fading into the
 * haze, and a stone fountain at the end of the walk.
 */
function gardenArt(c: SceneColours): string {
  const hedge = mix('#4f6f40', c.ink, 0.1);
  const roses = Array.from({ length: 70 }, (_, i) => {
    const left = i % 2 === 0;
    const t = rnd(i, 1);
    const y = 690 + t * 280;
    const x = left ? 168 - t * 60 + (rnd(i, 2) - 0.5) * 24 : 332 + t * 60 + (rnd(i, 2) - 0.5) * 24;
    const r0 = 2.5 + t * 4;
    const col = [light(c.soft, 0.25), '#f1c5cd', '#fff8ee', '#f4d9c8'][i % 4];
    return `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(r0)}' fill='${col}'/><circle cx='${f1(x - r0 * 0.3)}' cy='${f1(y - r0 * 0.3)}' r='${f1(r0 * 0.45)}' fill='#fff' fill-opacity='.55'/><circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(r0 * 0.25)}' fill='#000' fill-opacity='.12'/>`;
  }).join('');
  const cypress = (x: number, h: number, o: number) => `<path d='M${x} 642 C${x - 14} ${640 - h * 0.4} ${x - 8} ${640 - h * 0.85} ${x} ${640 - h} C${x + 8} ${640 - h * 0.85} ${x + 14} ${640 - h * 0.4} ${x} 642Z' fill='${mix('#3f5a3a', '#cfdbe0', o)}' filter='url(#leafy)'/>`;
  const topiary = (x: number, y: number, r: number) => `<g><ellipse cx='${x}' cy='${f1(y + r * 1.9)}' rx='${f1(r * 1.1)}' ry='${f1(r * 0.25)}' fill='#000' fill-opacity='.2'/><path d='M${f1(x - r * 0.55)} ${f1(y + r * 0.9)} H${f1(x + r * 0.55)} L${f1(x + r * 0.4)} ${f1(y + r * 1.85)} H${f1(x - r * 0.4)}Z' fill='#d9d2c4'/><path d='M${f1(x - r * 0.55)} ${f1(y + r * 0.9)} H${f1(x + r * 0.55)}' stroke='#fff' stroke-opacity='.6' stroke-width='1.5'/><circle cx='${x}' cy='${y}' r='${r}' fill='url(#ball)' filter='url(#leafy)'/></g>`;
  return svgUrl(
    `<defs>${daySky(500, 1000, 600)}
      <linearGradient id='gravel' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#e9dfc9'/><stop offset='1' stop-color='#cfbf9d'/></linearGradient>
      <linearGradient id='hedgeG' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${light(hedge, 0.3)}'/><stop offset='.2' stop-color='${hedge}'/><stop offset='1' stop-color='${dark(hedge, 0.35)}'/></linearGradient>
      <radialGradient id='ball' cx='.38' cy='.32' r='.75'><stop offset='0' stop-color='${light(hedge, 0.35)}'/><stop offset='1' stop-color='${dark(hedge, 0.35)}'/></radialGradient>
      <filter id='leafy' x='-5%' y='-5%' width='110%' height='110%' color-interpolation-filters='sRGB'>
        <feTurbulence type='fractalNoise' baseFrequency='.95' numOctaves='3' seed='8' result='n'/>
        <feDiffuseLighting in='n' surfaceScale='1.3' lighting-color='#fff' result='l'><feDistantLight azimuth='235' elevation='55'/></feDiffuseLighting>
        <feComposite in='SourceGraphic' in2='l' operator='arithmetic' k1='1.25' k2='0' k3='0' k4='0' result='lit'/>
        <feComposite in='lit' in2='SourceAlpha' operator='in'/>
      </filter>
      <filter id='grav' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' seed='2'/><feColorMatrix type='matrix' values='0 0 0 0 .3  0 0 0 0 .25  0 0 0 0 .2  0 0 0 .55 -.2'/></filter>
      <linearGradient id='mist' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f3f1ea' stop-opacity='0'/><stop offset='1' stop-color='#f3f1ea' stop-opacity='.6'/></linearGradient>
    </defs>
    ${daySkyBody(500, 600)}
    ${[40, 95, 150, 350, 405, 460].map((x, i) => cypress(x, 150 + (i % 3) * 40, 0.45)).join('')}
    <rect y='540' width='500' height='110' fill='url(#mist)'/>
    ${[70, 130, 370, 430].map((x, i) => cypress(x, 210 + (i % 2) * 50, 0.12)).join('')}
    <rect y='636' width='500' height='364' fill='${mix('#86a06b', c.soft, 0.12)}'/>
    <path d='M205 1000 L242 640 H258 L295 1000Z' fill='url(#gravel)'/>
    <path d='M205 1000 L242 640 H258 L295 1000Z' filter='url(#grav)'/>
    <path d='M0 650 H226 L172 1000 H0Z' fill='url(#hedgeG)' filter='url(#leafy)'/>
    <path d='M500 650 H274 L328 1000 H500Z' fill='url(#hedgeG)' filter='url(#leafy)'/>
    <path d='M0 650 H226' stroke='${light(hedge, 0.45)}' stroke-width='3'/><path d='M500 650 H274' stroke='${light(hedge, 0.45)}' stroke-width='3'/>
    ${topiary(196, 690, 14)}${topiary(304, 690, 14)}${topiary(160, 800, 24)}${topiary(340, 800, 24)}
    ${roses}
    <g transform='translate(250 636)'>
      <ellipse cx='0' cy='16' rx='42' ry='9' fill='#c9ced0'/><ellipse cx='0' cy='13' rx='36' ry='6.5' fill='#a9c4cf'/>
      <rect x='-4' y='-34' width='8' height='46' fill='#e3e1da'/><ellipse cx='0' cy='-34' rx='20' ry='5' fill='#ebe9e2'/><ellipse cx='0' cy='-36' rx='16' ry='3' fill='#b9d2dc'/>
      <path d='M0 -40 C-6 -60 -20 -50 -24 -34 M0 -40 C6 -60 20 -50 24 -34 M0 -40 V-58' stroke='#e6f3f8' stroke-width='1.8' fill='none' stroke-linecap='round'/>
    </g>`,
    500,
    1000,
    'xMidYMid slice',
  );
}

/**
 * A beach at golden hour: a warm sky, the sun low over a headland with its light laid across the water,
 * layered swell and lace-edged foam, glistening wet sand, a driftwood arbour draped in chiffon, footprints,
 * shells, and their initials written in the sand.
 */
function beachArt(c: SceneColours, initials: string): string {
  const sea = mix('#3b86a6', c.ink, 0.18);
  const sand = mix('#ecd8b2', c.envelope, 0.3);
  const glints = Array.from({ length: 70 }, (_, i) => {
    const y = 486 + rnd(i, 2) * 110;
    const spread = 18 + (y - 486) * 0.9;
    return `<rect x='${f1(330 + (rnd(i, 1) - 0.5) * spread * 2)}' y='${f1(y)}' width='${f1(3 + rnd(i, 3) * 12)}' height='1.6' fill='#fff6d8' fill-opacity='${f1(0.45 + rnd(i, 4) * 0.5)}'/>`;
  }).join('');
  const swell = Array.from({ length: 6 }, (_, i) => {
    const y = 500 + i * 16;
    return `<path d='M0 ${y} C60 ${y - 4} 120 ${y + 4} 180 ${y} S300 ${y - 4} 360 ${y} S460 ${y + 3} 500 ${y}' fill='none' stroke='#fff' stroke-opacity='${f1(0.08 + i * 0.03)}' stroke-width='${f1(1 + i * 0.4)}'/>`;
  }).join('');
  const lace = Array.from({ length: 3 }, (_, k) => {
    const y = 602 + k * 9;
    return `<path d='M0 ${y} C50 ${y - 7} 90 ${y + 8} 140 ${y + 1} C190 ${y - 6} 230 ${y + 9} 290 ${y + 2} C350 ${y - 6} 400 ${y + 8} 450 ${y} C470 ${y - 3} 490 ${y + 2} 500 ${y}' fill='none' stroke='#fff' stroke-opacity='${f1(0.9 - k * 0.28)}' stroke-width='${f1(3.4 - k)}' stroke-dasharray='${k ? '14 6 4 6' : 'none'}'/>`;
  }).join('');
  const shell = (x: number, y: number, s: number, a: number) => `<g transform='translate(${x} ${y}) rotate(${a}) scale(${s})'><ellipse cx='1' cy='2' rx='14' ry='5' fill='#000' fill-opacity='.15'/><path d='M0 0 C-14 -4 -16 -22 0 -26 C16 -22 14 -4 0 0Z' fill='#f8ebdf' stroke='#d8bfa8' stroke-width='.8'/>${[-10, -5, 0, 5, 10].map((d) => `<path d='M0 -1 L${d} -23' stroke='#dcc3ad' stroke-width='.7'/>`).join('')}</g>`;
  const foot = (x: number, y: number, a: number, s: number) => `<g transform='translate(${x} ${y}) rotate(${a}) scale(${s})' fill='${dark(sand, 0.16)}' fill-opacity='.5'><ellipse rx='5' ry='9'/><ellipse cy='-14' rx='4' ry='3.6'/></g>`;
  const text = initials.replace(/&/g, '&amp;').replace(/</g, '');
  return svgUrl(
    `<defs>
      <linearGradient id='bsky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#7fa8c9'/><stop offset='.5' stop-color='#efcfae'/><stop offset='.85' stop-color='#f6c48c'/><stop offset='1' stop-color='#fbe3bd'/></linearGradient>
      <radialGradient id='bsun' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fffbe8'/><stop offset='.14' stop-color='#ffeab4'/><stop offset='1' stop-color='#ffd38e' stop-opacity='0'/></radialGradient>
      <linearGradient id='sea' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${dark(sea, 0.2)}'/><stop offset='.55' stop-color='${sea}'/><stop offset='1' stop-color='${light(sea, 0.4)}'/></linearGradient>
      <linearGradient id='sand' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${dark(sand, 0.1)}'/><stop offset='.2' stop-color='${sand}'/><stop offset='1' stop-color='${light(sand, 0.2)}'/></linearGradient>
      <linearGradient id='wet' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${dark(sand, 0.25)}' stop-opacity='.75'/><stop offset='1' stop-color='${dark(sand, 0.1)}' stop-opacity='0'/></linearGradient>
      <linearGradient id='chif2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.95'/><stop offset='1' stop-color='#fff' stop-opacity='.5'/></linearGradient>
      <filter id='grit' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='1.3' numOctaves='2' seed='4'/><feColorMatrix type='matrix' values='0 0 0 0 .4  0 0 0 0 .3  0 0 0 0 .2  0 0 0 .5 -.18'/></filter>
      <filter id='bl' x='-5%' y='-20%' width='110%' height='140%'><feGaussianBlur stdDeviation='1.6'/></filter>
      <filter id='dug' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur in='SourceAlpha' stdDeviation='1.5' result='b'/><feOffset dx='1.5' dy='2' in='b' result='o'/><feComposite in='SourceGraphic' in2='o' operator='over'/></filter>
    </defs>
    <rect width='500' height='490' fill='url(#bsky)'/>
    ${Array.from({ length: 5 }, (_, i) => `<ellipse cx='${f1(60 + i * 100 + rnd(i, 9) * 40)}' cy='${f1(170 + rnd(i, 8) * 160)}' rx='${f1(60 + rnd(i, 7) * 50)}' ry='${f1(6 + rnd(i, 6) * 5)}' fill='#fff2df' fill-opacity='.5' filter='url(#bl)'/>`).join('')}
    <circle cx='330' cy='470' r='170' fill='url(#bsun)'/>
    <path d='M-10 486 C40 440 90 430 130 452 C160 468 190 470 220 486Z' fill='${mix('#7c7a74', c.ink, 0.3)}' fill-opacity='.75' filter='url(#bl)'/>
    <path d='M380 486 C410 466 450 460 510 470 V486Z' fill='${mix('#8a8780', c.ink, 0.3)}' fill-opacity='.6' filter='url(#bl)'/>
    <rect y='484' width='500' height='130' fill='url(#sea)'/>
    ${swell}${glints}
    <path d='M0 600 C80 590 160 612 250 600 C340 588 420 610 500 598 V1000 H0Z' fill='url(#sand)'/>
    <path d='M0 600 C80 590 160 612 250 600 C340 588 420 610 500 598 V680 H0Z' fill='url(#wet)'/>
    <rect x='290' y='606' width='80' height='60' fill='#ffe6b0' fill-opacity='.25' filter='url(#bl)'/>
    ${lace}
    <rect y='600' width='500' height='400' filter='url(#grit)'/>
    <g transform='translate(400 700)'>
      <ellipse cx='0' cy='92' rx='70' ry='9' fill='#000' fill-opacity='.16'/>
      <path d='M-46 92 C-50 40 -42 -10 -48 -60' stroke='#9c8466' stroke-width='7' fill='none' stroke-linecap='round'/><path d='M46 92 C50 40 42 -10 48 -60' stroke='#8d7558' stroke-width='7' fill='none' stroke-linecap='round'/>
      <path d='M-62 -58 C-20 -70 20 -66 62 -60' stroke='#a68d6e' stroke-width='7' fill='none' stroke-linecap='round'/>
      <path d='M-58 -58 C-40 -20 -54 30 -40 90 L-30 90 C-44 30 -30 -20 -46 -58Z' fill='url(#chif2)'/>
      <path d='M58 -58 C40 -20 54 30 40 90 L30 90 C44 30 30 -20 46 -58Z' fill='url(#chif2)'/>
      <path d='M-60 -60 C-30 -30 30 -30 60 -60 C30 -40 -30 -40 -60 -60Z' fill='#fff' fill-opacity='.85'/>
      ${Array.from({ length: 10 }, (_, i) => `<circle cx='${f1(-56 + rnd(i, 3) * 22)}' cy='${f1(-64 + rnd(i, 4) * 16)}' r='${f1(3 + rnd(i, 5) * 3)}' fill='${['#fffaf2', '#f6d9dc', '#f3e6d6'][i % 3]}'/>`).join('')}
      ${Array.from({ length: 5 }, (_, i) => `<ellipse cx='${f1(-50 + rnd(i, 6) * 26)}' cy='${f1(-58 + rnd(i, 7) * 14)}' rx='6' ry='2.4' fill='#86a08b' transform='rotate(${f1(rnd(i, 8) * 180)} -40 -58)'/>`).join('')}
    </g>
    ${foot(120, 980, -8, 1.3)}${foot(140, 940, 6, 1.2)}${foot(124, 900, -6, 1.1)}${foot(142, 864, 8, 1)}${foot(130, 830, -4, 0.9)}
    <g filter='url(#dug)' fill='none' stroke='${dark(sand, 0.3)}' stroke-width='4' stroke-linecap='round'>
      <path d='M220 790 C180 755 170 720 195 710 C210 704 220 718 220 725 C220 718 230 704 245 710 C270 720 260 755 220 790Z'/>
    </g>
    <text x='220' y='690' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='44' fill='${dark(sand, 0.32)}' fill-opacity='.85'>${text}</text>
    ${shell(90, 900, 1.8, -20)}${shell(300, 930, 1.5, 25)}${shell(250, 980, 1.2, 10)}
    <rect width='500' height='1000' fill='#ffc27a' fill-opacity='.07'/>`,
    500,
    1000,
    'xMidYMid slice',
  );
}

/** A stone gate pillar (the right one mirrored), with a capstone and ball finial, ivy and climbing roses. */
function pillarArt(c: SceneColours, mirror = false): string {
  const stone = mix('#d9d2c4', c.paper, 0.3);
  const blocks = Array.from({ length: 12 }, (_, i) => {
    const y = 140 + i * 72;
    const tone = mix(stone, i % 2 ? '#000000' : '#ffffff', 0.04 + rnd(i, 1) * 0.05);
    return `<rect x='10' y='${y}' width='100' height='70' fill='${tone}'/><rect x='10' y='${y}' width='100' height='2.5' fill='#fff' fill-opacity='.45'/><rect x='10' y='${y + 67}' width='100' height='3' fill='#000' fill-opacity='.22'/>${rnd(i, 2) > 0.5 ? `<path d='M${f1(20 + rnd(i, 3) * 60)} ${y + 10} l${f1(rnd(i, 4) * 12)} ${f1(14 + rnd(i, 5) * 20)}' stroke='#000' stroke-opacity='.15' stroke-width='.8'/>` : ''}`;
  }).join('');
  const ivy = Array.from({ length: 60 }, (_, i) => {
    const t = rnd(i, 6);
    const y = 150 + t * 820;
    const x = 96 + Math.sin(t * 9) * 14 + (rnd(i, 7) - 0.5) * 22;
    const g = ['#4f6b45', '#5f7d52', '#6e8b5d', '#435d3c'][i % 4];
    return `<path transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rnd(i, 8) * 360)}) scale(${f1(0.7 + rnd(i, 9) * 0.6)})' d='M0 0 C-8 -4 -10 -12 -4 -14 C-2 -16 0 -14 0 -12 C0 -14 2 -16 4 -14 C10 -12 8 -4 0 0Z' fill='${g}'/>`;
  }).join('');
  const roses = Array.from({ length: 12 }, (_, i) => {
    const t = rnd(i, 10);
    const y = 170 + t * 600;
    const x = 100 + Math.sin(t * 9) * 12 + (rnd(i, 11) - 0.5) * 14;
    const col = [light(c.soft, 0.25), '#f3cdd3', '#fff8ee'][i % 3];
    return `<g transform='translate(${f1(x)} ${f1(y)})'><circle r='7' fill='${col}'/><circle r='4.4' fill='none' stroke='#000' stroke-opacity='.12'/><circle r='2' fill='#000' fill-opacity='.1'/><circle cx='-2' cy='-2' r='2.5' fill='#fff' fill-opacity='.5'/></g>`;
  }).join('');
  const flip = mirror ? 'translate(130 0) scale(-1 1)' : '';
  return svgUrl(
    `<defs>
      <linearGradient id='pl' x1='0' x2='1'><stop offset='0' stop-color='#fff' stop-opacity='.18'/><stop offset='.6' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.3'/></linearGradient>
      <radialGradient id='ball' cx='.35' cy='.35' r='.7'><stop offset='0' stop-color='${light(stone, 0.5)}'/><stop offset='1' stop-color='${dark(stone, 0.3)}'/></radialGradient>
      <filter id='ps' x='-20%' y='-5%' width='140%' height='110%'><feDropShadow dx='4' dy='0' stdDeviation='6' flood-color='#000' flood-opacity='.4'/></filter>
    </defs>
    <g transform='${flip}' filter='url(#ps)'>
      <rect x='10' y='140' width='100' height='860' fill='${stone}'/>
      ${blocks}
      <rect x='10' y='140' width='100' height='860' fill='url(#pl)'/>
      <rect x='0' y='112' width='120' height='30' fill='${light(stone, 0.12)}'/><rect x='0' y='112' width='120' height='3' fill='#fff' fill-opacity='.5'/><rect x='0' y='139' width='120' height='4' fill='#000' fill-opacity='.25'/>
      <rect x='30' y='92' width='60' height='22' fill='${stone}'/>
      <circle cx='60' cy='62' r='32' fill='url(#ball)'/>
      ${ivy}${roses}
    </g>`,
    130,
    1000,
    'xMidYMid slice',
  );
}

// ------------------------------------------------------------------------------------------------ vellum

/** A sheet of vellum: frosted, with a torn (deckled) edge and something printed faintly on it. */
function vellumArt(c: SceneColours, k: number): string {
  // The deckled edge: a ragged outline, the same every time.
  const edge = Array.from({ length: 64 }, (_, i) => {
    const side = Math.floor(i / 16);
    const t = (i % 16) / 16;
    const j = (rnd(i + k * 70, 31) - 0.5) * 5;
    if (side === 0) return `${f1(8 + t * 284)},${f1(8 + j)}`;
    if (side === 1) return `${f1(292 + j)},${f1(8 + t * 584)}`;
    if (side === 2) return `${f1(292 - t * 284)},${f1(592 + j)}`;
    return `${f1(8 + j)},${f1(592 - t * 584)}`;
  }).join(' ');
  const ink = mix(c.accent, c.ink, 0.25);
  const print = [
    // The top sheet: a fine botanical sprig in the corner and the guest's name.
    `<g fill='none' stroke='${ink}' stroke-opacity='.5' stroke-width='1'>
      <path d='M232 70 C214 92 214 120 228 146'/><path d='M232 70 C252 86 262 108 258 132'/>
      ${[0, 1, 2, 3].map((n) => `<ellipse cx='${226 + n * 6}' cy='${92 + n * 14}' rx='9' ry='3.6' transform='rotate(${-40 + n * 22} ${226 + n * 6} ${92 + n * 14})'/>`).join('')}
    </g>
    <path d='M120 470 H180' stroke='${ink}' stroke-opacity='.35' stroke-width='.8'/><circle cx='150' cy='470' r='2' fill='${ink}' fill-opacity='.4'/>`,
    // The middle sheet: a ring of tiny dots around a blank centre.
    `<g fill='${ink}' fill-opacity='.35'>${Array.from({ length: 60 }, (_, i) => `<circle cx='${f1(150 + Math.cos((i / 60) * Math.PI * 2) * 96)}' cy='${f1(300 + Math.sin((i / 60) * Math.PI * 2) * 96)}' r='1.3'/>`).join('')}</g>`,
    // The last sheet: a fine oval frame with a leaf at its crown.
    `<g fill='none' stroke='${ink}' stroke-opacity='.3'><ellipse cx='150' cy='300' rx='118' ry='176' stroke-width='.9'/><ellipse cx='150' cy='300' rx='112' ry='170' stroke-width='.5'/><path d='M150 118 q-10 -14 0 -26 q10 12 0 26z' stroke-width='.9'/></g>`,
  ][k] ?? '';
  return svgUrl(
    `<defs>
      <linearGradient id='vs' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.5'/><stop offset='.5' stop-color='#fff' stop-opacity='.3'/><stop offset='1' stop-color='${light(c.soft, 0.4)}' stop-opacity='.42'/></linearGradient>
      <clipPath id='ve'><polygon points='${edge}'/></clipPath>
    </defs>
    <g clip-path='url(#ve)'>
      <rect width='300' height='600' fill='url(#vs)'/>
      ${print}
    </g>
    <polygon points='${edge}' fill='none' stroke='#fff' stroke-opacity='.8' stroke-width='1.2'/>`,
    300,
    600,
    'xMidYMid meet',
  );
}

/** The card under the vellum: heavy cotton paper with a gilt border and their initials in gold. */
function vellumCardArt(c: SceneColours, initials: string): string {
  const gold = c.accent;
  return svgUrl(
    `<defs>${GRAIN('cg', 0.85, 0.04)}
      <linearGradient id='gl' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${light(gold, 0.5)}'/><stop offset='.4' stop-color='${gold}'/><stop offset='.6' stop-color='${light(gold, 0.35)}'/><stop offset='1' stop-color='${dark(gold, 0.3)}'/></linearGradient>
    </defs>
    <rect width='300' height='600' fill='${light(c.paper, 0.3)}'/>
    <rect width='300' height='600' filter='url(#cg)'/>
    <rect x='18' y='18' width='264' height='564' fill='none' stroke='url(#gl)' stroke-width='1.4'/>
    <rect x='24' y='24' width='252' height='552' fill='none' stroke='url(#gl)' stroke-width='.6'/>
    <text x='150' y='318' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='58' fill='url(#gl)'>${initials.replace(/&/g, '&amp;').replace(/</g, '')}</text>
    <path d='M108 344 H192' stroke='url(#gl)' stroke-width='1'/>`,
    300,
    600,
    'xMidYMid meet',
  );
}

// ------------------------------------------------------------------------------------------------ their photograph

/**
 * The mount for their photograph: a linen table and a print with a soft white border. With no photo yet,
 * the print holds their initials, so the opening still looks finished.
 */
function photoMountArt(c: SceneColours): string {
  const linen = mix(c.ink, '#1b1a18', 0.55);
  return svgUrl(
    `<defs>
      <filter id='ln' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.9 .06' numOctaves='2' seed='4'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .1 -.02'/></filter>
      <radialGradient id='lt' cx='.35' cy='.25' r='.9'><stop offset='0' stop-color='#fff' stop-opacity='.12'/><stop offset='1' stop-color='#000' stop-opacity='.35'/></radialGradient>
    </defs>
    <rect width='300' height='600' fill='${linen}'/>
    <rect width='300' height='600' filter='url(#ln)'/>
    <rect width='300' height='600' fill='url(#lt)'/>`,
    300,
    600,
  );
}

// ------------------------------------------------------------------------------------------------ the scene

/** A scene's pictures, each a CSS background image (drawn once). */
export function sceneArt(kind: Exclude<Scene, 'auto' | 'none'>, c: SceneColours, initials: string): Record<string, string> {
  if (kind === 'doors') return { door: doorArt(c), door2: doorArt(c, true), seal: sealArt(mix(c.soft, c.accent, 0.35), initials) };
  if (kind === 'bow') return { paper: satinPaper(c), bow: bowArt(mix(c.soft, c.ink, 0.18)) };
  if (kind === 'curtain') return { left: curtainArt(c, 1), right: curtainArt(c, -1), pelmet: pelmetArt(c, initials), stage: stageArt(c) };
  if (kind === 'barn') return { field: fieldArt(c), left: barnArt(c), right: barnArt(c, true), wreath: wreathArt(c, initials), lights: festoonArt() };
  if (kind === 'book') return { cover: bookArt(c, initials), page: pageArt(c) };
  if (kind === 'gates') return { garden: gardenArt(c), left: gateArt(c), right: gateArt(c, true), pillarL: pillarArt(c), pillarR: pillarArt(c, true) };
  if (kind === 'beach') return { beach: beachArt(c, initials) };
  if (kind === 'vellum') return { card: vellumCardArt(c, initials), s0: vellumArt(c, 0), s1: vellumArt(c, 1), s2: vellumArt(c, 2) };
  if (kind === 'photo') return { mount: photoMountArt(c) };
  return { night: nightArt(c) };
}

const LAYER: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };
/** Scenes on light paper (the name sits in the ink colour on a light scrim). */
const light3: string[] = ['bow', 'book', 'beach'];

/** Specks of light drifting up through an opening (each its own path and pace, the same every time). */
function Motes({ colour, from = 0.5, n = 16 }: { colour: string; from?: number; n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const size = 2 + rnd(i, 21) * 4;
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${f1(30 + rnd(i, 22) * 40)}%`,
              top: `${f1(42 + rnd(i, 23) * 30)}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: colour,
              boxShadow: `0 0 ${f1(size * 3)}px ${colour}`,
              opacity: 0,
              ['--dx' as string]: `${f1((rnd(i, 24) - 0.5) * 120)}px`,
              animation: `ylMote ${f1(2.2 + rnd(i, 25) * 1.6)}s ease-out ${f1(from + rnd(i, 26) * 1.1)}s both`,
            }}
          />
        );
      })}
    </>
  );
}

export function SceneOverlay({
  kind,
  phase: p,
  colours: c,
  initials,
  guestName,
  photo,
  contained = false,
}: {
  kind: Exclude<Scene, 'auto' | 'none'>;
  phase: number;
  colours: SceneColours;
  initials: string;
  guestName: string;
  /** Their photograph (the photo scene; Setup → Extras → Photo). */
  photo?: string;
  contained?: boolean;
}) {
  const still = useMemo(() => prefersLessMotion(), []);
  // Drawn once for these colours (the page re-renders as it opens; new pictures would be decoded again).
  const art = useMemo(() => sceneArt(kind, c, initials), [kind, c.paper, c.ink, c.accent, c.soft, c.envelope, initials]);
  if (p >= 3) return null;
  const open = p >= 1;
  const gone = p >= 2;
  const ease = 'cubic-bezier(.62,.04,.28,1)';
  const t = (s: number, delay = 0) => (still ? 'opacity .4s ease' : `transform ${s}s ${ease} ${delay}s, opacity ${Math.min(s, 0.9)}s ease ${delay}s`);
  let body: ReactNode = null;

  if (kind === 'doors') {
    // Hinged at the screen's edges, both swinging toward the guest after a small press, the camera easing in.
    const doorStyle = (side: 'left' | 'right'): CSSProperties => ({
      position: 'absolute',
      top: 0,
      bottom: 0,
      [side]: 0,
      width: '50.2%',
      transform: `rotateY(${open && !still ? (side === 'left' ? -112 : 112) : 0}deg)`,
      transformOrigin: side === 'left' ? 'left center' : 'right center',
      transition: still ? 'opacity .4s ease' : `transform 2.4s cubic-bezier(.55,.02,.2,1) .42s`,
      overflow: 'hidden',
      willChange: 'transform',
      backfaceVisibility: 'hidden',
    });
    // The right door is drawn as the left one's mirror image (flipping it on screen can show black on some phones).
    const panel = (mirror: boolean): CSSProperties => ({ position: 'absolute', inset: 0, backgroundImage: mirror ? art.door2 : art.door, backgroundSize: 'cover', backgroundPosition: 'center' });
    // As a door turns away from the light it darkens (so it reads as turning, not shrinking).
    const turnShade = (side: 'left' | 'right'): CSSProperties => ({
      ...LAYER,
      background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, rgba(0,0,0,.15), rgba(0,0,0,.55))`,
      opacity: open && !still ? 1 : 0,
      transition: 'opacity 1.6s ease .6s',
    });
    // The seal sits across the seam: each door shows its own half; they break apart and fall away.
    const half = (side: 'left' | 'right'): CSSProperties => {
      const k = side === 'left' ? -1 : 1;
      return {
        position: 'absolute',
        top: '50%',
        [side === 'left' ? 'right' : 'left']: 0,
        width: 'min(30cqw,128px)',
        height: 'min(30cqw,128px)',
        transform: open && !still ? `translate(${side === 'left' ? '50%' : '-50%'},-50%) translate(${k * 14}px, 46px) rotate(${k * 16}deg)` : `translate(${side === 'left' ? '50%' : '-50%'},-50%) scale(${p === 1 ? 1.05 : 1})`,
        opacity: open && !still ? 0 : 1,
        backgroundImage: art.seal,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        transition: 'transform .7s cubic-bezier(.4,0,.7,.2) .12s, opacity .45s ease .4s',
      };
    };
    body = (
      <div style={{ ...LAYER, transform: open && !still ? 'scale(1.07)' : 'scale(1)', transition: 'transform 3s cubic-bezier(.3,0,.2,1) .3s' }}>
        <div style={{ ...LAYER, perspective: '1500px', background: `radial-gradient(circle at 50% 46%, #fffaf0 0%, ${light(c.paper, 0.35)} 30%, ${mix(c.paper, c.envelope, 0.3)} 100%)`, animation: open && !still ? 'ylPress .42s cubic-bezier(.3,0,.3,1)' : undefined }}>
          {/* The light behind the doors, flooding out as they part. */}
          <div style={{ ...LAYER, background: 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(255,246,222,.95), rgba(255,246,222,0) 70%)', opacity: open && !still ? 1 : 0, transition: 'opacity 1.4s ease .5s' }} />
          {open && !still && <Motes colour="#fff3d6" from={0.7} />}
          <div style={doorStyle('left')}>
            <div style={panel(false)} />
            <div style={turnShade('left')} />
            <div style={half('left')} />
          </div>
          <div style={doorStyle('right')}>
            <div style={panel(true)} />
            <div style={turnShade('right')} />
            <div style={half('right')} />
          </div>
        </div>
      </div>
    );
  } else if (kind === 'bow') {
    const ribbon = mix(c.soft, c.ink, 0.18);
    body = (
      <div style={{ ...LAYER, backgroundImage: art.paper, backgroundSize: 'cover', transform: open && !still ? 'translateY(-104%)' : 'none', transition: t(1.5, 1.05) }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 58, marginLeft: -29, background: satin(ribbon), boxShadow: '0 0 14px rgba(0,0,0,.18)', transform: open && !still ? 'translateY(115%)' : 'none', opacity: open && !still ? 0 : 1, transition: still ? 'opacity .4s ease' : `transform 1.1s ${ease} .45s, opacity .5s ease 1s` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '44%', height: 58, marginTop: -29, background: satin(ribbon, '180deg'), boxShadow: '0 0 14px rgba(0,0,0,.18)', transform: open && !still ? 'translateX(115%)' : 'none', opacity: open && !still ? 0 : 1, transition: still ? 'opacity .4s ease' : `transform 1.1s ${ease} .5s, opacity .5s ease 1.05s` }} />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '44%',
            width: 'min(96cqw,460px)',
            aspectRatio: '440 / 400',
            transform: open && !still ? 'translate(-50%,-62%) scale(1.14) rotate(-5deg)' : `translate(-50%,-37.5%) scale(${p === 1 ? 1.04 : 1})`,
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
      <div style={{ ...LAYER, backgroundImage: art.stage, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        {/* Behind the curtain: the stage, a spotlight on the boards, and dust in the beam. */}
        <div style={{ ...LAYER, background: 'linear-gradient(170deg, rgba(255,244,214,0) 30%, rgba(255,244,214,.22) 48%, rgba(255,244,214,0) 62%)', opacity: open ? 1 : 0, transition: 'opacity 1.4s ease .6s' }} />
        {open && !still && <Motes colour="#fff3d6" from={0.8} n={12} />}
        <div style={side('left')} />
        <div style={side('right')} />
        {/* Footlights: warm light washing up the velvet from the front of the stage. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30cqh', background: `linear-gradient(to top, ${light(c.accent, 0.3)}55, rgba(255,220,160,.18) 35%, rgba(255,220,160,0))`, mixBlendMode: 'screen', opacity: open ? 0 : 1, transition: 'opacity .8s ease' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 'min(26cqh,240px)', backgroundImage: art.pelmet, backgroundSize: 'cover', backgroundPosition: 'center top', transform: open && !still ? 'translateY(-110%)' : 'none', transition: t(1.2, 1.4) }} />
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
      transform: `${open && !still ? `translateX(${s === 'left' ? -101 : 101}%)` : ''}${s === 'right' ? ' scaleX(-1)' : ''}` || 'none',
      transition: t(2.2, 0.3),
      overflow: 'hidden',
      // (The right door is mirrored, so its shadow is written the same way round.)
      boxShadow: '6px 0 18px rgba(0,0,0,.35)',
      willChange: 'transform',
    });
    const half = (s: 'left' | 'right'): CSSProperties => ({
      position: 'absolute',
      top: '30%',
      [s === 'left' ? 'right' : 'left']: 0,
      width: 'min(82cqw,350px)',
      height: 'min(82cqw,350px)',
      transform: `translate(${s === 'left' ? '50%' : '-50%'},-50%)`,
      backgroundImage: art.wreath,
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
    });
    body = (
      <div style={{ ...LAYER, backgroundImage: art.field, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div style={{ ...LAYER, background: 'radial-gradient(ellipse at 50% 40%, rgba(255,250,230,.0), rgba(255,250,230,.0) 40%, rgba(0,0,0,.25))' }} />
        <div style={door('right')} />
        <div style={{ ...door('left'), overflow: 'visible', zIndex: 1 }}>
          <div style={half('left')} />
        </div>
        {/* Warm light spills through the gap as the doors part. */}
        <div style={{ ...LAYER, background: 'radial-gradient(ellipse 40% 60% at 50% 55%, rgba(255,226,170,.55), rgba(255,226,170,0) 70%)', opacity: open && !still ? 1 : 0, transition: 'opacity 1.2s ease .5s', zIndex: 1 }} />
        {open && !still && <Motes colour="#fff1cf" from={0.6} />}
        {/* The header beam, the rail and its rollers, and festoon lights strung above. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 'calc(5% - 12px)', zIndex: 2, background: `linear-gradient(${dark(c.envelope, 0.35)}, ${dark(c.envelope, 0.55)})`, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.35), 0 6px 14px rgba(0,0,0,.35)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(5% - 16px)', height: 16, zIndex: 2, background: 'linear-gradient(#4a4642, #23201e)', boxShadow: '0 4px 10px rgba(0,0,0,.35)' }} />
        <div style={{ position: 'absolute', left: '-4%', right: '-4%', top: 'calc(5% - 6px)', height: '19cqh', zIndex: 2, backgroundImage: art.lights, backgroundSize: '100% 100%', transform: open && !still ? 'translateY(-26cqh)' : 'none', transition: t(1.8, 0.9), filter: 'drop-shadow(0 0 6px rgba(255,214,140,.6))' }} />
        {[18, 32, 68, 82].map((x, i) => (
          <div key={x} style={{ position: 'absolute', zIndex: 2, top: 'calc(5% - 22px)', left: `${x}%`, width: 22, height: 22, marginLeft: -11, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #8d8780, #2a2724 70%)', transform: open && !still ? `translateX(${i < 2 ? '-50cqw' : '50cqw'})` : 'none', transition: t(2.2, 0.3) }} />
        ))}
      </div>
    );
  } else if (kind === 'book') {
    // A storybook on the table: its cover swings open to the first page.
    const size: CSSProperties = { position: 'absolute', left: '50%', top: '44%', width: 'min(68cqw,36cqh,360px)', aspectRatio: '300 / 620', transform: 'translate(-50%,-52%)' };
    body = (
      <div style={{ ...LAYER, perspective: '1800px', background: `radial-gradient(ellipse at 50% 40%, ${light(c.paper, 0.5)} 0%, ${mix(c.paper, c.soft, 0.6)} 55%, ${mix(c.soft, c.ink, 0.25)} 100%)` }}>
        <div style={{ ...size, borderRadius: 6, boxShadow: `1px 1px 0 #f4ead2, 2px 2px 0 ${light(c.accent, 0.35)}, 3px 3px 0 #efe3c6, 4px 4px 0 ${c.accent}, 5px 5px 0 #eadcbc, 6px 6px 0 ${dark(c.accent, 0.1)}, 0 30px 60px rgba(0,0,0,.3), 0 8px 18px rgba(0,0,0,.2)`, backgroundImage: art.page, backgroundSize: 'cover' }} />
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
        {/* Their monogram on a round iron plate where the gates meet; it lifts away as they open. */}
        <div style={{ position: 'absolute', left: '50%', top: '47%', width: 'min(24cqw,110px)', aspectRatio: '1', transform: `translate(-50%,-50%) scale(${open && !still ? 0.85 : 1})`, opacity: open ? 0 : 1, transition: 'opacity .5s ease .1s, transform .5s ease', borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${light(dark(c.envelope, 0.1), 0.3)}, ${dark(c.envelope, 0.35)} 70%)`, boxShadow: `0 0 0 3px ${dark(c.envelope, 0.4)}, inset 0 0 0 5px ${dark(c.envelope, 0.2)}, inset 0 0 0 6.5px ${light(c.accent, 0.2)}, 0 8px 18px rgba(0,0,0,.45)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: light(c.accent, 0.25), fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 'min(6.5cqw,28px)', textShadow: '0 1px 0 rgba(0,0,0,.5)' }}>
          {initials}
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '-4cqw', width: '17cqw', backgroundImage: art.pillarL, backgroundSize: 'cover', backgroundPosition: 'right center' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: '-4cqw', width: '17cqw', backgroundImage: art.pillarR, backgroundSize: 'cover', backgroundPosition: 'left center' }} />
      </div>
    );
  } else if (kind === 'vellum') {
    // Three sheets of vellum over a gilt card: each lifts from its top corner in turn, light catching it as it goes.
    const sheet = (k: number): CSSProperties => ({
      position: 'absolute',
      left: '50%',
      top: '47%',
      width: 'min(78cqw,46cqh,420px)',
      aspectRatio: '300 / 600',
      transform: open && !still ? `translate(-50%,-50%) translate(${-30 - k * 6}cqw, -16cqh) rotate(${-24 - k * 6}deg)` : `translate(-50%,-50%) rotate(${(k - 1) * 1.2}deg)`,
      transformOrigin: '0% 0%',
      opacity: open && !still ? 0 : 1,
      backgroundImage: art[`s${k}`],
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.12))',
      transition: still ? 'opacity .4s ease' : `transform 1.3s cubic-bezier(.5,0,.25,1) ${0.15 + (2 - k) * 0.32}s, opacity .6s ease ${0.8 + (2 - k) * 0.32}s`,
      willChange: 'transform',
    });
    body = (
      <div style={{ ...LAYER, background: `radial-gradient(ellipse at 40% 30%, ${mix(c.soft, c.paper, 0.3)}, ${mix(c.soft, c.ink, 0.22)} 62%, ${mix(c.soft, c.ink, 0.45)})` }}>
        <div style={{ position: 'absolute', left: '50%', top: '47%', width: 'min(78cqw,46cqh,420px)', aspectRatio: '300 / 600', transform: `translate(-50%,-50%) scale(${open && !still ? 1.04 : 1})`, transition: 'transform 2.2s cubic-bezier(.3,0,.2,1) .2s', backgroundImage: art.card, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', filter: 'drop-shadow(0 18px 30px rgba(0,0,0,.18))' }} />
        {/* A soft band of light that sweeps across as the sheets lift. */}
        <div style={{ ...LAYER, background: 'linear-gradient(115deg, rgba(255,255,255,0) 35%, rgba(255,255,255,.55) 50%, rgba(255,255,255,0) 65%)', backgroundSize: '250% 100%', backgroundPosition: open && !still ? '0% 0' : '100% 0', transition: 'background-position 2s ease .15s' }} />
        <div style={sheet(2)} />
        <div style={sheet(1)} />
        <div style={sheet(0)} />
      </div>
    );
  } else if (kind === 'photo') {
    // Their photograph, pale as if just printed, develops into full colour as the guest taps; then it is drawn
    // up and away like a print from its sleeve, and the invitation is there beneath it.
    const src = photo && /^(https:\/\/|\/|data:image\/(jpeg|png|webp);base64,)/.test(photo) ? photo : '';
    const developed = open && !still;
    body = (
      <div style={LAYER}>
        <div style={{ ...LAYER, backgroundImage: art.mount, backgroundSize: 'cover', opacity: developed ? 0 : 1, transition: still ? 'opacity .4s ease' : 'opacity .3s ease 1.55s' }} />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '46%',
            width: developed ? '100cqw' : 'min(78cqw,420px)',
            height: developed ? '100cqh' : 'min(98cqw,58cqh)',
            transform: developed ? 'translate(-50%,-46%) rotate(0deg) translateY(-104%)' : `translate(-50%,-50%) rotate(-2.2deg) scale(${p === 1 ? 1.02 : 1})`,
            padding: developed ? 0 : 'min(3.4cqw,16px) min(3.4cqw,16px) min(13cqw,64px)',
            background: '#f7f4ee',
            boxShadow: '0 22px 50px rgba(0,0,0,.45), 0 3px 8px rgba(0,0,0,.3)',
            transition: still ? 'opacity .4s ease' : 'width .8s cubic-bezier(.5,0,.2,1) .85s, height .8s cubic-bezier(.5,0,.2,1) .85s, padding .8s ease .85s, transform .75s cubic-bezier(.6,0,.3,1) 1.65s',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundImage: src ? `url("${src.replace(/["\\\n\r]/g, '')}")` : `linear-gradient(160deg, ${light(c.soft, 0.25)}, ${mix(c.soft, c.accent, 0.35)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: dark(c.accent, 0.2),
              fontFamily: "'Pinyon Script', cursive",
              fontSize: 'clamp(28px,14cqw,64px)',
              // Undeveloped: milky and soft; it clears to full colour after the tap.
              filter: developed ? 'none' : 'grayscale(.8) sepia(.3) brightness(1.6) contrast(.45) blur(1.5px)',
              transition: 'filter 1.2s ease .1s',
            }}
          >
            {!src && initials}
          </div>
        </div>
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
            borderRadius: '46% 46% 40% 40% / 50% 50% 44% 44%',
            // A ribbed paper lantern: wire ribs across glowing paper, brighter round the flame, darker caps.
            background: `linear-gradient(to bottom, ${dark(c.accent, 0.55)} 0 7%, transparent 7% 93%, ${dark(c.accent, 0.55)} 93%), repeating-linear-gradient(to bottom, rgba(90,50,10,.0) 0 9%, rgba(90,50,10,.28) 9% 10.2%), linear-gradient(to right, rgba(80,40,0,.35), rgba(80,40,0,0) 28%, rgba(80,40,0,0) 72%, rgba(80,40,0,.35)), radial-gradient(ellipse 55% 50% at 50% 60%, #fffbe8 0%, #ffe7a8 30%, ${light(c.accent, 0.25)} 62%, ${c.accent} 100%)`,
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
      /* Sized by its box (cqw, cqh): the same scene fills a phone's screen, or a little phone on the front page. */
      style={{ position: contained ? 'absolute' : 'fixed', inset: 0, zIndex: 25, pointerEvents: 'none', overflow: 'hidden', containerType: 'size', opacity: gone ? 0 : 1, transition: 'opacity .9s ease' }}
    >
      <style>{`@keyframes ylBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } } @keyframes ylHint { 0%,100% { opacity: .65 } 50% { opacity: 1 } } @keyframes ylPress { 0% { transform: scale(1) } 35% { transform: scale(.982) } 100% { transform: scale(1) } } @keyframes ylMote { 0% { transform: translate(0,0); opacity: 0 } 20% { opacity: .9 } 100% { transform: translate(var(--dx), -38cqh); opacity: 0 } }`}</style>
      {body}
      {/* Light and depth over every scene: a warm key light from the top left and a soft vignette, so it
          reads as a lit place rather than a flat picture. It lifts as the scene opens. */}
      {kind !== 'photo' && (
        <div
          style={{
            ...LAYER,
            zIndex: 1,
            background: light3.includes(kind) || kind === 'vellum'
              ? 'radial-gradient(110% 70% at 18% 8%, rgba(255,244,220,.22), rgba(255,244,220,0) 55%), radial-gradient(150% 110% at 50% 42%, rgba(0,0,0,0) 58%, rgba(40,30,20,.22))'
              : 'radial-gradient(110% 70% at 18% 8%, rgba(255,236,200,.2), rgba(255,236,200,0) 55%), radial-gradient(150% 110% at 50% 42%, rgba(0,0,0,0) 52%, rgba(0,0,0,.45))',
            opacity: open ? 0 : 1,
            transition: 'opacity 1.2s ease .4s',
          }}
        />
      )}
      {/* A soft scrim at the foot of the scene, under the name. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '34cqh',
          zIndex: 2,
          background: light3.includes(kind) ? 'linear-gradient(to top, rgba(255,255,255,.72), rgba(255,255,255,0))' : 'linear-gradient(to top, rgba(10,8,6,.62), rgba(10,8,6,0))',
          opacity: open ? 0 : 1,
          transition: 'opacity .5s ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 'calc(9cqh + env(safe-area-inset-bottom))',
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          color: light3.includes(kind) ? c.ink : '#fbf6ea',
          textShadow: light3.includes(kind) ? '0 1px 0 rgba(255,255,255,.6)' : '0 2px 12px rgba(0,0,0,.55)',
          opacity: open ? 0 : 1,
          transition: 'opacity .5s ease',
        }}
      >
        {guestName && <span style={{ fontFamily: "'Pinyon Script', cursive", fontSize: 'clamp(16px,8cqw,40px)', lineHeight: 1.1 }}>{guestName}</span>}
        <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: 'italic', fontSize: 'clamp(12px,4.8cqw,19px)', letterSpacing: '.06em', animation: still ? undefined : 'ylHint 2.4s ease-in-out infinite' }}>Tap to open</span>
      </div>
    </div>
  );
}

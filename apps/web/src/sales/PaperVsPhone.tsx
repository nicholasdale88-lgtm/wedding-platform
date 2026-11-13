import { useMemo } from 'react';
import { tableTop } from './Stills';

/**
 * Paper or phone: one invitation two ways, side by side on a tabletop. On the left, a letterpress card on
 * cotton paper (the leaf border pressed into it, the names in gold foil) leaning on a kraft envelope; on the
 * right, the same invitation on a phone, with flowers and an RSVP button. Under each, what it's like to live
 * with. Drawn by us in code: no photos, no one else's artwork. The SVG sits in the page itself (not an image),
 * so its lettering is the page's own Cormorant Garamond and Great Vibes.
 */

const f1 = (n: number) => n.toFixed(1);
const rnd = (i: number, k: number) => {
  const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const SERIF = `'Cormorant Garamond', Georgia, serif`;
const SCRIPT = `'Great Vibes', 'Pinyon Script', cursive`;

/** Shared paints. Ids start pv so they can't meet any other drawing on the page. */
const DEFS = `
  <linearGradient id='pvFoil' x1='0' y1='0' x2='1' y2='1'>
    <stop offset='0' stop-color='#8c6a33'/><stop offset='.22' stop-color='#e6cb8a'/><stop offset='.42' stop-color='#a8834a'/>
    <stop offset='.6' stop-color='#f4e1ab'/><stop offset='.8' stop-color='#9a7640'/><stop offset='1' stop-color='#d7b974'/>
  </linearGradient>
  <filter id='pvPaper' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
    <feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='7' result='n'/>
    <feDiffuseLighting in='n' surfaceScale='.25' lighting-color='#fff' result='l'><feDistantLight azimuth='225' elevation='64'/></feDiffuseLighting>
    <feComposite in='SourceGraphic' in2='l' operator='arithmetic' k1='1.06' k2='0' k3='0' k4='0' result='lit'/>
    <feComposite in='lit' in2='SourceAlpha' operator='in'/>
  </filter>
  <filter id='pvEmboss' x='-5%' y='-5%' width='110%' height='110%' color-interpolation-filters='sRGB'>
    <feGaussianBlur in='SourceAlpha' stdDeviation='1.3' result='b'/>
    <feSpecularLighting in='b' surfaceScale='3.2' specularConstant='.95' specularExponent='16' lighting-color='#fffdf7' result='s'><feDistantLight azimuth='225' elevation='38'/></feSpecularLighting>
    <feComposite in='s' in2='SourceAlpha' operator='in' result='s2'/>
    <feOffset in='SourceAlpha' dx='.9' dy='1.3' result='o'/><feGaussianBlur in='o' stdDeviation='.9' result='ob'/>
    <feFlood flood-color='#6b5131' flood-opacity='.6'/><feComposite in2='ob' operator='in' result='sh'/>
    <feMerge><feMergeNode in='sh'/><feMergeNode in='SourceGraphic'/><feMergeNode in='s2'/></feMerge>
  </filter>
  <filter id='pvFoilLift' x='-5%' y='-10%' width='110%' height='130%'>
    <feOffset in='SourceAlpha' dx='.5' dy='.8' result='o'/><feGaussianBlur in='o' stdDeviation='.5' result='ob'/>
    <feFlood flood-color='#4a3518' flood-opacity='.45'/><feComposite in2='ob' operator='in' result='sh'/>
    <feMerge><feMergeNode in='sh'/><feMergeNode in='SourceGraphic'/></feMerge>
  </filter>
  <filter id='pvLift' x='-20%' y='-20%' width='140%' height='150%' color-interpolation-filters='sRGB'>
    <feGaussianBlur in='SourceAlpha' stdDeviation='2' result='a'/><feOffset in='a' dx='2' dy='3' result='a2'/>
    <feFlood flood-color='#2b1810' flood-opacity='.3'/><feComposite in2='a2' operator='in' result='s1'/>
    <feGaussianBlur in='SourceAlpha' stdDeviation='16' result='b'/><feOffset in='b' dx='14' dy='24' result='b2'/>
    <feFlood flood-color='#2b1810' flood-opacity='.28'/><feComposite in2='b2' operator='in' result='s2'/>
    <feMerge><feMergeNode in='s2'/><feMergeNode in='s1'/><feMergeNode in='SourceGraphic'/></feMerge>
  </filter>
  <radialGradient id='pvPetal' cx='.5' cy='.85' r='.9'><stop offset='0' stop-color='#fffdf9'/><stop offset='.6' stop-color='#fbf2ea'/><stop offset='1' stop-color='#efd7cc'/></radialGradient>
  <radialGradient id='pvLeaf' cx='.3' cy='.4' r='.9'><stop offset='0' stop-color='#b9c6a8'/><stop offset='.6' stop-color='#8a9c78'/><stop offset='1' stop-color='#5f7354'/></radialGradient>
  <radialGradient id='pvLeaf2' cx='.3' cy='.4' r='.9'><stop offset='0' stop-color='#cdd3b2'/><stop offset='.6' stop-color='#a3ad86'/><stop offset='1' stop-color='#717c58'/></radialGradient>
  <radialGradient id='pvLight' cx='.2' cy='.1' r='1.1'><stop offset='0' stop-color='#fff8ec' stop-opacity='.35'/><stop offset='.6' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#3a2418' stop-opacity='.16'/></radialGradient>`;

/** A pointed leaf of length L, its base at (x, y), pointing along `deg`. */
const leaf = (x: number, y: number, deg: number, L: number, extra = '') =>
  `<path d='M0 0 Q${f1(L * 0.5)} ${f1(-L * 0.34)} ${f1(L)} 0 Q${f1(L * 0.5)} ${f1(L * 0.34)} 0 0Z' transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(deg)})' ${extra}/>`;

/**
 * A pressed leaf border round a w × h card, `inset` in from its edges: a wavy stem down each side with leaves
 * either side, a fan of bigger leaves at each corner. Returns [pressed, foil]: most of it is blind-embossed
 * (white on ivory, lit from the top left), a few berries and stems are gold foil.
 */
function leafBorder(w: number, h: number, inset: number): [string, string] {
  let pressed = '';
  let foil = '';
  const corners: [number, number][] = [
    [inset, inset],
    [w - inset, inset],
    [w - inset, h - inset],
    [inset, h - inset],
  ];
  corners.forEach(([x0, y0], side) => {
    const [x1, y1] = corners[(side + 1) % 4]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const dir = (Math.atan2(uy, ux) * 180) / Math.PI;
    // Inward is to the right of the direction of travel (clockwise round the card).
    const nx = -uy;
    const ny = ux;
    let stem = '';
    const steps = Math.round(len / 9);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wave = Math.sin(t * Math.PI * (len / 70)) * 3;
      const px = x0 + ux * len * t + nx * wave;
      const py = y0 + uy * len * t + ny * wave;
      stem += `${i ? 'L' : 'M'}${f1(px)} ${f1(py)}`;
      // Leaves every other step, away from the corners (those get their own fan).
      if (t > 0.08 && t < 0.92) {
        const s = i % 2 === 0 ? 1 : -1;
        const L = 12 + rnd(i + side * 40, 3) * 8;
        pressed += leaf(px, py, dir + s * (34 + rnd(i, side) * 22), L);
        if (i % 3 === 0) pressed += leaf(px, py, dir + 180 - s * 40, L * 0.6);
        if (rnd(i + side * 17, 9) > 0.8) foil += `<circle cx='${f1(px + nx * 9 * s)}' cy='${f1(py + ny * 9 * s)}' r='2'/>`;
      }
    }
    pressed += `<path d='${stem}' fill='none' stroke='#000' stroke-width='1.6'/>`;
    // The corner's fan: seven leaves opening inward, three foil berries.
    const inDeg = dir + 45;
    for (let j = 0; j < 9; j++) pressed += leaf(x0, y0, inDeg - 72 + j * 18, 20 + (j % 2 ? 6 : 14));
    for (let j = 0; j < 5; j++) pressed += leaf(x0 + Math.cos(((inDeg - 40 + j * 20) * Math.PI) / 180) * 26, y0 + Math.sin(((inDeg - 40 + j * 20) * Math.PI) / 180) * 26, inDeg - 40 + j * 20, 12);
    for (let j = 0; j < 4; j++) {
      const a = ((inDeg - 30 + j * 20) * Math.PI) / 180;
      foil += `<circle cx='${f1(x0 + Math.cos(a) * 42)}' cy='${f1(y0 + Math.sin(a) * 42)}' r='2.6'/>`;
    }
  });
  return [pressed, foil];
}

/** A small upright sprig (under the names, on the card and the phone). */
function sprig(x: number, y: number, s: number): string {
  let d = `<path d='M${x} ${y + 16 * s} V${y - 16 * s}' fill='none' stroke='#000' stroke-width='${f1(1.2 * s)}'/>`;
  for (let i = 0; i < 4; i++) {
    const yy = y + (10 - i * 8) * s;
    d += leaf(x, yy, -50, (11 - i * 1.5) * s) + leaf(x, yy, -130, (11 - i * 1.5) * s);
  }
  return d;
}

/** The letterpress card leaning on its kraft envelope. */
function paperArt(names: [string, string], place: string): string {
  const W = 330;
  const H = 460;
  const [pressed, foil] = leafBorder(W, H, 24);
  const cx = W / 2;
  const caps = `font-family="${SERIF}" font-weight='600' letter-spacing='3.2' text-anchor='middle' fill='#8a7457'`;
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 440 560' width='100%' height='100%'>
    <defs>${DEFS}</defs>
    <g transform='translate(78 34) rotate(7)' filter='url(#pvLift)'>
      <rect width='330' height='470' rx='4' fill='#c9a87e' filter='url(#pvPaper)'/>
      <path d='M2 2 L165 168 L328 2' fill='none' stroke='#9c7c55' stroke-width='1.2' stroke-opacity='.7'/>
      <path d='M2 6 L165 172 L328 6' fill='none' stroke='#e6cfae' stroke-width='1' stroke-opacity='.6'/>
    </g>
    <g transform='translate(30 52) rotate(-4)' filter='url(#pvLift)'>
      <rect width='${W}' height='${H}' fill='#f3e8d6' filter='url(#pvPaper)'/>
      <g fill='#fcf5e8' filter='url(#pvEmboss)'>${pressed.replace(/stroke='#000'/g, "stroke='#fcf5e8'")}</g>
      <g fill='url(#pvFoil)' filter='url(#pvFoilLift)'>${foil}</g>
      <text x='${cx}' y='92' font-size='10' ${caps}>TOGETHER</text>
      <text x='${cx}' y='107' font-size='10' ${caps}>WITH THEIR FAMILIES</text>
      <g fill='url(#pvFoil)' filter='url(#pvFoilLift)' font-family="${SCRIPT}" text-anchor='middle'>
        <text x='${cx}' y='172' font-size='58'>${names[0]}</text>
        <text x='${cx}' y='216' font-size='34'>&amp;</text>
        <text x='${cx}' y='268' font-size='58'>${names[1]}</text>
      </g>
      <path d='M${cx - 62} 205 H${cx - 18} M${cx + 18} 205 H${cx + 62}' stroke='#b8955a' stroke-width='1'/>
      <text x='${cx}' y='306' font-size='9.5' ${caps}>INVITE YOU TO CELEBRATE</text>
      <text x='${cx}' y='321' font-size='9.5' ${caps}>THEIR WEDDING</text>
      <path d='M${cx - 46} 344 H${cx + 46}' stroke='#b8955a' stroke-width='.9'/>
      <g fill='#fcf5e8' filter='url(#pvEmboss)'>${sprig(cx, 368, 1.1).replace(/stroke='#000'/g, "stroke='#fcf5e8'")}</g>
      <text x='${cx}' y='404' font-size='9.5' ${caps}>${place}</text>
      <rect width='${W}' height='${H}' fill='url(#pvLight)'/>
    </g>
  </svg>`;
}

/** A five-petal blossom with a gold heart. */
function blossom(x: number, y: number, r: number, k: number): string {
  let p = '';
  for (let i = 0; i < 5; i++) {
    const a = i * 72 + k * 13;
    p += `<ellipse cx='0' cy='${f1(-r * 0.52)}' rx='${f1(r * 0.42)}' ry='${f1(r * 0.56)}' transform='rotate(${a})' fill='url(#pvPetal)' stroke='#e7d3c2' stroke-width='.6'/>`;
  }
  let dots = '';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    dots += `<circle cx='${f1(Math.cos(a) * r * 0.2)}' cy='${f1(Math.sin(a) * r * 0.2)}' r='${f1(r * 0.05)}' fill='#a8834a'/>`;
  }
  return `<g transform='translate(${f1(x)} ${f1(y)})'>
    <g transform='translate(1.5 2.5)' opacity='.18' filter='url(#pvSoft)'><circle r='${f1(r)}' fill='#5a3a2a'/></g>
    ${p}<circle r='${f1(r * 0.22)}' fill='#ecc779'/>${dots}</g>`;
}

/** A corner posy for the phone: three blossoms, leaves and buds, fanned from (x, y) toward `deg`. */
function posy(x: number, y: number, deg: number, k: number, size = 1): string {
  let leaves = '';
  for (let i = 0; i < 11; i++) {
    const a = deg - 80 + i * 16 + (rnd(i, k) - 0.5) * 14;
    const L = (34 + rnd(i + 3, k) * 30) * size;
    leaves += leaf(x, y, a, L, `fill='url(#${i % 2 ? 'pvLeaf' : 'pvLeaf2'})' stroke='#56694a' stroke-opacity='.35' stroke-width='.6'`);
  }
  let flowers = '';
  for (let i = 0; i < 5; i++) {
    const a = ((deg - 50 + i * 25) * Math.PI) / 180;
    const d = (14 + (i % 2) * 22 + rnd(i, k + 5) * 10) * size;
    flowers += blossom(x + Math.cos(a) * d, y + Math.sin(a) * d, (15 + rnd(i, k + 2) * 7) * size, k + i);
  }
  let buds = '';
  for (let i = 0; i < 8; i++) {
    const a = ((deg - 60 + rnd(i, k + 7) * 120) * Math.PI) / 180;
    const d = (50 + rnd(i, k + 8) * 30) * size;
    buds += `<circle cx='${f1(x + Math.cos(a) * d)}' cy='${f1(y + Math.sin(a) * d)}' r='${f1(2.5 + rnd(i, k) * 1.6)}' fill='#fffaf3' stroke='#e2cfbd' stroke-width='.6'/>`;
  }
  return leaves + buds + flowers;
}

/** The same invitation on a phone's screen (300 × 640). */
function phoneArt(names: [string, string], place: string): string {
  const cx = 150;
  const caps = `font-family="${SERIF}" font-weight='600' letter-spacing='2.6' text-anchor='middle' fill='#7c6a52'`;
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 640' width='100%' height='100%' preserveAspectRatio='xMidYMid slice'>
    <defs>${DEFS}<filter id='pvSoft' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='2'/></filter></defs>
    <rect width='300' height='640' fill='#fbf6ee' filter='url(#pvPaper)'/>
    ${posy(10, 46, 40, 1, 1.25)}${posy(290, 46, 140, 2, 1.25)}${posy(10, 606, -40, 3, 1.25)}${posy(290, 606, -140, 4, 1.25)}
    ${posy(-4, 330, 0, 5, 0.75)}${posy(304, 300, 180, 6, 0.75)}
    <g fill='url(#pvFoil)' font-family="${SCRIPT}" text-anchor='middle'>
      <text x='${cx}' y='112' font-size='56'>${names[0].charAt(0)}</text>
    </g>
    <g fill='url(#pvFoil)'>${sprig(cx, 132, 0.7).replace(/stroke='#000'/g, "stroke='#a8834a'")}</g>
    <text x='${cx}' y='176' font-size='9' ${caps}>TOGETHER</text>
    <text x='${cx}' y='190' font-size='9' ${caps}>WITH THEIR FAMILIES</text>
    <g fill='url(#pvFoil)' font-family="${SCRIPT}" text-anchor='middle'>
      <text x='${cx}' y='246' font-size='44'>${names[0]}</text>
      <text x='${cx}' y='284' font-size='28'>&amp;</text>
      <text x='${cx}' y='328' font-size='44'>${names[1]}</text>
    </g>
    <path d='M${cx - 52} 275 H${cx - 16} M${cx + 16} 275 H${cx + 52}' stroke='#b8955a' stroke-width='1'/>
    <text x='${cx}' y='364' font-size='8.5' ${caps}>INVITE YOU TO CELEBRATE</text>
    <text x='${cx}' y='378' font-size='8.5' ${caps}>THEIR WEDDING</text>
    <path d='M${cx - 40} 398 H${cx + 40}' stroke='#b8955a' stroke-width='.8'/>
    <text x='${cx}' y='428' font-size='8.5' ${caps}>${place}</text>
    <rect x='${cx - 64}' y='470' width='128' height='40' rx='20' fill='url(#pvFoil)' filter='url(#pvFoilLift)'/>
    <text x='${cx - 8}' y='495' font-family="${SERIF}" font-weight='700' font-size='14' letter-spacing='3' text-anchor='middle' fill='#fffaf2'>RSVP</text>
    <path d='M${cx + 22} 490 h14 m-5 -5 l5 5 l-5 5' fill='none' stroke='#fffaf2' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/>
  </svg>`;
}

const PAPER_LIST = ['Printing and postage, weeks ahead', 'Replies by phone, text and memory', 'A change means reprinting', 'Dietary needs on scraps of paper'];
const OURS_LIST = ['Replies land in your guest list', 'Change anything, any time, free', 'Each guest gets their own link', 'Gentle reminders for anyone who hasn’t replied'];

export function PaperVsPhone({ ink, soft, gold, serif, script, fromPrice }: { ink: string; soft: string; gold: string; serif: string; script: string; fromPrice: string }) {
  const backdrop = useMemo(() => tableTop(), []);
  const paper = useMemo(() => paperArt(['Harriet', 'Theo'], 'BERRIMA · NEW SOUTH WALES'), []);
  const phone = useMemo(() => phoneArt(['Harriet', 'Theo'], 'BERRIMA · NEW SOUTH WALES'), []);
  const pill = (label: string, on: boolean) => (
    <span
      className="self-center py-[7px] px-5 rounded-[8px] text-[13px] font-semibold tracking-[.18em] uppercase shadow-[0_6px_14px_rgba(70,40,40,.12)]"
      style={on ? { background: 'linear-gradient(135deg,#c9a46a,#a8834a)', color: '#fffaf2' } : { background: '#e9dfd2', color: ink }}
    >
      {label}
    </span>
  );
  const list = (items: string[], on: boolean) => (
    <ul className="m-0 p-0 list-none flex flex-col gap-3 text-[17px] self-center">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-3" style={{ color: on ? ink : soft }}>
          {on ? (
            <span aria-hidden className="flex-none w-[26px] h-[26px] rounded-full flex items-center justify-center shadow-[0_4px_10px_rgba(168,131,74,.35)]" style={{ background: 'linear-gradient(135deg,#d6b373,#a8834a)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fffaf2" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          ) : (
            <span aria-hidden className="flex-none w-[14px] h-[14px] mx-[6px] rounded-full" style={{ background: '#ddd2c4' }} />
          )}
          <span className="sr-only">{on ? 'With The Yes List: ' : 'On paper: '}</span>
          {t}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-labelledby="paper-or-phone" className="relative overflow-hidden py-16 md:py-24 px-4">
      <img aria-hidden alt="" src={backdrop} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      <span aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(60% 70% at 50% 50%, rgba(251,245,240,.9), rgba(251,245,240,.35) 75%, rgba(251,245,240,0))' }} />
      <div className="relative max-w-[1060px] mx-auto flex flex-col gap-10">
        <div className="text-center flex flex-col items-center gap-4">
          <span className="text-[12px] font-semibold tracking-[.28em] uppercase" style={{ color: gold }}>
            Paper or The Yes List
          </span>
          <h2 id="paper-or-phone" className="m-0 text-[clamp(38px,6vw,66px)] leading-[1.02] font-medium" style={{ fontFamily: serif, color: ink }}>
            Every bit as{' '}
            <span className="font-normal" style={{ fontFamily: script, color: gold, fontSize: '1.1em' }}>
              beautiful
            </span>
            .<br />
            None of the chasing.
          </h2>
          <span aria-hidden className="flex items-center gap-3 w-full max-w-[560px]">
            <span className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${gold})` }} />
            <span className="w-[9px] h-[9px] rotate-45" style={{ background: gold }} />
            <span className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${gold}, transparent)` }} />
          </span>
        </div>

        <div className="grid gap-12 md:gap-6 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
          <div className="flex flex-col gap-7">
            {pill('Paper', false)}
            <div
              role="img"
              aria-label="A letterpress invitation on cotton paper with a pressed leaf border and the couple's names in gold foil, leaning on a kraft envelope"
              className="w-full max-w-[400px] mx-auto aspect-[440/560]"
              dangerouslySetInnerHTML={{ __html: paper }}
            />
            {list(PAPER_LIST, false)}
          </div>
          <span aria-hidden className="hidden md:block w-px" style={{ background: `linear-gradient(180deg, transparent, ${gold} 15%, ${gold} 85%, transparent)` }} />
          <div className="flex flex-col gap-7">
            {pill('The Yes List', true)}
            <a href="/demo" aria-label="Open the sample invitation" className="block mx-auto my-auto w-[230px] sm:w-[250px] no-underline">
              <span className="relative block p-[10px] rounded-[46px] shadow-[0_40px_70px_rgba(46,30,36,.32),0_10px_20px_rgba(46,30,36,.18)]" style={{ background: 'linear-gradient(145deg,#3a3a3d,#0f0f10 40%,#26262a)' }}>
                <span className="relative block rounded-[37px] overflow-hidden aspect-[300/640] ring-1 ring-black/60">
                  <span className="block w-full h-full" dangerouslySetInnerHTML={{ __html: phone }} />
                  <span aria-hidden className="absolute top-[10px] left-1/2 -translate-x-1/2 w-[34%] h-[22px] rounded-full bg-black" />
                  <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(125deg, rgba(255,255,255,.18), rgba(255,255,255,0) 32%)' }} />
                </span>
              </span>
            </a>
            {list(OURS_LIST, true)}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 text-center">
          <span aria-hidden className="w-full max-w-[760px] h-px" style={{ background: `linear-gradient(90deg, transparent, ${gold}, transparent)` }} />
          <p className="m-0 text-[clamp(26px,4vw,40px)] leading-[1.1]" style={{ fontFamily: serif, color: ink }}>
            From <span style={{ color: gold }}>{fromPrice}</span>, paid once.
          </p>
          <p className="m-0 text-[15px]" style={{ color: soft }}>
            No subscription · No printing · No postage · Australian owned
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-1">
            <a href="/demo" className="py-[13px] px-7 rounded-full no-underline text-[16px] font-semibold border bg-white/70" style={{ color: ink, borderColor: '#dcc2b4' }}>
              Open the sample invitation
            </a>
            <a href="#start" className="py-[13px] px-7 rounded-full no-underline text-[16px] font-semibold shadow-[0_12px_26px_rgba(46,36,48,.22)]" style={{ background: ink, color: '#fbf1e8' }}>
              Start your wedding
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

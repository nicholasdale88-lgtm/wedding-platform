/**
 * The front page's still lifes, drawn by us in code (no photos, no one else's artwork): envelopes of soft
 * cotton paper with a pressed botanical, a wax seal with pressed initials, laid on linen and lit from the top
 * left like a product photograph. Plain SVG strings, so they cost no scripts and scale to any screen.
 */

const f1 = (n: number) => n.toFixed(1);
const rnd = (i: number, k: number) => {
  const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
const light = (c: string, t: number) => mix(c, '#ffffff', t);
const dark = (c: string, t: number) => mix(c, '#000000', t);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Shared filters: paper fibre, a pressed (blind-embossed) relief, linen, and soft shadows. */
const DEFS = `
  <filter id='paper' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
    <feTurbulence type='fractalNoise' baseFrequency='1.3' numOctaves='2' seed='3' result='n'/>
    <feDiffuseLighting in='n' surfaceScale='.4' lighting-color='#fff' result='l'><feDistantLight azimuth='225' elevation='62'/></feDiffuseLighting>
    <feComposite in='SourceGraphic' in2='l' operator='arithmetic' k1='1.08' k2='0' k3='0' k4='0' result='lit'/>
    <feComposite in='lit' in2='SourceAlpha' operator='in'/>
  </filter>
  <filter id='press' x='-5%' y='-5%' width='110%' height='110%' color-interpolation-filters='sRGB'>
    <feGaussianBlur in='SourceAlpha' stdDeviation='1.3' result='h'/>
    <feDiffuseLighting in='h' surfaceScale='3.2' diffuseConstant='.75' lighting-color='#fff' result='l'><feDistantLight azimuth='225' elevation='42'/></feDiffuseLighting>
    <feColorMatrix in='l' type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.6 0 0 0 -1.4' result='hi'/>
    <feColorMatrix in='l' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.7 0 0 0 .8' result='lo'/>
    <feMerge result='m'><feMergeNode in='lo'/><feMergeNode in='hi'/></feMerge>
    <feMorphology in='SourceAlpha' operator='dilate' radius='3' result='near'/>
    <feComposite in='m' in2='near' operator='in'/>
  </filter>
  <filter id='wax' x='-20%' y='-20%' width='140%' height='140%' color-interpolation-filters='sRGB'>
    <feGaussianBlur in='SourceAlpha' stdDeviation='3.4' result='b'/>
    <feSpecularLighting in='b' surfaceScale='6' specularConstant='.9' specularExponent='22' lighting-color='#fff' result='s'><feDistantLight azimuth='225' elevation='48'/></feSpecularLighting>
    <feComposite in='s' in2='SourceAlpha' operator='in' result='s2'/>
    <feDiffuseLighting in='b' surfaceScale='6' diffuseConstant='1' lighting-color='#fff' result='d'><feDistantLight azimuth='225' elevation='48'/></feDiffuseLighting>
    <feComposite in='SourceGraphic' in2='d' operator='arithmetic' k1='1.1' k2='0' k3='0' k4='0' result='lit'/>
    <feComposite in='lit' in2='SourceAlpha' operator='in' result='lit2'/>
    <feMerge><feMergeNode in='lit2'/><feMergeNode in='s2'/></feMerge>
  </filter>
  <filter id='linen' x='0' y='0' width='100%' height='100%'>
    <feTurbulence type='fractalNoise' baseFrequency='.9 .07' numOctaves='2' seed='5' result='a'/>
    <feTurbulence type='fractalNoise' baseFrequency='.07 .9' numOctaves='2' seed='9' result='b'/>
    <feComposite in='a' in2='b' operator='arithmetic' k2='.5' k3='.5'/>
    <feColorMatrix type='matrix' values='0 0 0 0 .3  0 0 0 0 .25  0 0 0 0 .2  0 0 0 .5 -.18'/>
  </filter>
  <filter id='drop' x='-20%' y='-20%' width='140%' height='150%'><feDropShadow dx='10' dy='22' stdDeviation='16' flood-color='#3a2a22' flood-opacity='.28'/></filter>
  <radialGradient id='key' cx='.2' cy='.1' r='1'><stop offset='0' stop-color='#fff6e8' stop-opacity='.55'/><stop offset='.6' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#3a2a22' stop-opacity='.22'/></radialGradient>`;

/**
 * A pressed botanical spray (drawn white: the relief filter keeps only its light and shade): a curving main
 * stem with side stems, paired almond leaves and small five-petalled flowers.
 */
function sprig(x: number, y: number, s: number, turn: number, k: number): string {
  const leaf = (lx: number, ly: number, len: number, a: number) =>
    `<path transform='translate(${f1(lx)} ${f1(ly)}) rotate(${f1(a)})' d='M0 0 C${f1(len * 0.3)} ${f1(-len * 0.34)} ${f1(len * 0.75)} ${f1(-len * 0.32)} ${len} 0 C${f1(len * 0.75)} ${f1(len * 0.32)} ${f1(len * 0.3)} ${f1(len * 0.34)} 0 0Z' fill='#fff'/>`;
  const flower = (fx: number, fy: number, fr: number) =>
    `<g transform='translate(${f1(fx)} ${f1(fy)})'>${[0, 72, 144, 216, 288].map((d) => `<ellipse cy='${f1(-fr * 0.55)}' rx='${f1(fr * 0.36)}' ry='${f1(fr * 0.55)}' transform='rotate(${d})' fill='#fff'/>`).join('')}</g>`;
  const at = (t: number) => ({ x: Math.sin(t * 2.6) * 18 * (1 - t), y: -t * 210 });
  let out = `<path d='M0 0 ${Array.from({ length: 12 }, (_, i) => { const p = at((i + 1) / 12); return `L${f1(p.x)} ${f1(p.y)}`; }).join(' ')}' fill='none' stroke='#fff' stroke-width='3.2' stroke-linecap='round'/>`;
  for (let i = 0; i < 9; i++) {
    const t = 0.1 + i * 0.095;
    const p = at(t);
    const side = i % 2 ? 1 : -1;
    const len = 30 - i * 2.2;
    out += leaf(p.x, p.y, len, side > 0 ? -38 - rnd(i + k, 1) * 14 : 218 + rnd(i + k, 2) * 14);
    if (i === 2 || i === 5) {
      // A side stem ending in a flower.
      const ex = p.x + side * 38;
      const ey = p.y - 26;
      out += `<path d='M${f1(p.x)} ${f1(p.y)} Q${f1(p.x + side * 22)} ${f1(p.y - 2)} ${f1(ex)} ${f1(ey)}' fill='none' stroke='#fff' stroke-width='2'/>${flower(ex, ey, 11)}`;
    }
  }
  const top = at(1);
  out += flower(top.x, top.y - 6, 13);
  return `<g transform='translate(${x} ${y}) rotate(${turn}) scale(${s})' filter='url(#press)'>${out}</g>`;
}

/** A wax seal: a pooled, uneven edge, a raised rim and the initials pressed in. */
function seal(x: number, y: number, r: number, colour: string, initials: string, k: number): string {
  const pts = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    const rr = r * (1 + (rnd(i + k * 31, 2) - 0.5) * 0.12 + (i % 2 ? 0.03 : -0.02));
    return `${f1(x + Math.cos(a) * rr)},${f1(y + Math.sin(a) * rr)}`;
  }).join(' ');
  return `<g>
    <ellipse cx='${x + 4}' cy='${y + 7}' rx='${f1(r * 1.02)}' ry='${f1(r * 0.98)}' fill='#2a1a14' fill-opacity='.35' filter='url(#soft)'/>
    <polygon points='${pts}' fill='${colour}' filter='url(#wax)'/>
    <circle cx='${x}' cy='${y}' r='${f1(r * 0.7)}' fill='${dark(colour, 0.08)}' filter='url(#wax)'/>
    <circle cx='${x}' cy='${y}' r='${f1(r * 0.62)}' fill='none' stroke='${light(colour, 0.25)}' stroke-opacity='.5' stroke-width='1.2'/>
    <text x='${x}' y='${f1(y + r * 0.2)}' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='${f1(r * 0.5)}' font-weight='bold' fill='${dark(colour, 0.5)}'>${esc(initials)}</text>
    <text x='${x - 0.8}' y='${f1(y + r * 0.2 - 1)}' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-size='${f1(r * 0.5)}' font-weight='bold' fill='${light(colour, 0.45)}' fill-opacity='.6'>${esc(initials)}</text>
  </g>`;
}

/** One envelope, flap closed and sealed, at (x, y) turned by `turn` degrees. */
function envelope(x: number, y: number, turn: number, paper: string, wax: string, initials: string, k: number, w = 300, h = 420): string {
  const flapDepth = h * 0.46;
  return `<g transform='translate(${x} ${y}) rotate(${turn})' filter='url(#drop)'>
    <rect width='${w}' height='${h}' rx='6' fill='${paper}' filter='url(#paper)'/>
    <path d='M0 ${h} L${w / 2} ${h * 0.58} L${w} ${h}' fill='none' stroke='${dark(paper, 0.12)}' stroke-opacity='.5' stroke-width='1.2'/>
    <path d='M0 0 H${w} L${w / 2} ${f1(flapDepth)} Z' fill='${light(paper, 0.06)}' filter='url(#paper)'/>
    <path d='M0 0 L${w / 2} ${f1(flapDepth)} L${w} 0' fill='none' stroke='${dark(paper, 0.18)}' stroke-opacity='.55' stroke-width='1.4'/>
    <path d='M2 2 L${w / 2} ${f1(flapDepth + 6)} L${w - 2} 2' fill='none' stroke='#000' stroke-opacity='.08' stroke-width='6'/>
    ${sprig(w * 0.3, h * 0.98, 0.95, -14, k)}${sprig(w * 0.72, h * 0.99, 0.8, 18, k + 5)}
    ${seal(w / 2, flapDepth, 44, wax, initials, k)}
    <rect width='${w}' height='${h}' rx='6' fill='url(#key)'/>
  </g>`;
}

const url = (body: string, w: number, h: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' preserveAspectRatio='xMidYMid slice'><defs>${DEFS}<filter id='soft' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='4'/></filter></defs>${body}</svg>`)}`;

/** The flat lay: four envelopes in sage, blush, ivory and taupe on linen, each with its seal. */
export function flatLay(initials = 'H & T'): string {
  const linen = '#efe7de';
  return url(
    `<rect width='1000' height='900' fill='${linen}'/>
    <rect width='1000' height='900' filter='url(#linen)'/>
    ${envelope(60, 40, -14, '#b3bba3', '#a87a34', initials, 1)}
    ${envelope(560, -40, 9, '#ecd3cb', '#a4525a', initials, 2)}
    ${envelope(330, 300, -3, '#f6f1e9', '#9c7432', initials, 3)}
    ${envelope(700, 420, 13, '#bfae9f', '#62202c', initials, 4)}
    <rect width='1000' height='900' fill='url(#key)'/>`,
    1000,
    900,
  );
}

/** One envelope alone, close up (a feature tile). */
export function envelopeClose(paper = '#ecd3cb', wax = '#a4525a', initials = 'H & T'): string {
  return url(
    `<rect width='600' height='600' fill='#efe7de'/>
    <rect width='600' height='600' filter='url(#linen)'/>
    ${envelope(150, 60, -6, paper, wax, initials, 7)}
    <rect width='600' height='600' fill='url(#key)'/>`,
    600,
    600,
  );
}

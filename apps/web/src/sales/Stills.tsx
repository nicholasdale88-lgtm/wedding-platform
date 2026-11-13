/**
 * The front page's still lifes, drawn by us in code (no photos, no one else's artwork), set like a product
 * photograph: soft window light from the top left, leaf shadows falling across from a window, linen underneath.
 * Envelopes of cotton paper wrapped in a silk ribbon, a sprig of eucalyptus and baby's breath tucked under it,
 * and a deep wax seal with a laurel ring and the couple's initials standing up out of the wax.
 * Plain SVG strings, so they cost no scripts and scale to any screen.
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
type P = [number, number];

/** A closed, smooth outline through the points (Catmull-Rom as cubic curves). */
function smooth(pts: P[]): string {
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n]!;
  let d = `M${f1(pts[0]![0])} ${f1(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return `${d}Z`;
}

/** Shared filters and paints: paper fibre, linen, silk, wax, deckled edges and layered shadows. */
const DEFS = `
  <filter id='paper' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
    <feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' seed='3' result='n'/>
    <feDiffuseLighting in='n' surfaceScale='.22' lighting-color='#fff' result='l'><feDistantLight azimuth='225' elevation='66'/></feDiffuseLighting>
    <feComposite in='SourceGraphic' in2='l' operator='arithmetic' k1='1.05' k2='0' k3='0' k4='0' result='lit'/>
    <feComposite in='lit' in2='SourceAlpha' operator='in'/>
  </filter>
  <filter id='deckle' x='-3%' y='-3%' width='106%' height='106%' color-interpolation-filters='sRGB'>
    <feTurbulence type='fractalNoise' baseFrequency='.08' numOctaves='3' seed='11' result='t'/>
    <feDisplacementMap in='SourceGraphic' in2='t' scale='7' xChannelSelector='R' yChannelSelector='G'/>
  </filter>
  <filter id='linen' x='0' y='0' width='100%' height='100%'>
    <feTurbulence type='fractalNoise' baseFrequency='1.1 .05' numOctaves='2' seed='5' result='a'/>
    <feTurbulence type='fractalNoise' baseFrequency='.05 1.1' numOctaves='2' seed='9' result='b'/>
    <feComposite in='a' in2='b' operator='arithmetic' k2='.5' k3='.5'/>
    <feColorMatrix type='matrix' values='0 0 0 0 .22  0 0 0 0 .17  0 0 0 0 .14  0 0 0 .62 -.24'/>
  </filter>
  <filter id='silk' x='0' y='0' width='100%' height='100%'>
    <feTurbulence type='fractalNoise' baseFrequency='.09 .004' numOctaves='2' seed='4'/>
    <feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.6 0 0 0 -.72'/>
  </filter>
  <filter id='wax' x='-15%' y='-15%' width='130%' height='130%' color-interpolation-filters='sRGB'>
    <feGaussianBlur in='SourceAlpha' stdDeviation='5' result='b'/>
    <feSpecularLighting in='b' surfaceScale='7' specularConstant='.75' specularExponent='26' lighting-color='#fff4ea' result='s'><feDistantLight azimuth='225' elevation='42'/></feSpecularLighting>
    <feComposite in='s' in2='SourceAlpha' operator='in' result='s2'/>
    <feDiffuseLighting in='b' surfaceScale='7' diffuseConstant='1.05' lighting-color='#fff' result='d'><feDistantLight azimuth='225' elevation='42'/></feDiffuseLighting>
    <feComposite in='SourceGraphic' in2='d' operator='arithmetic' k1='1.12' k2='0' k3='0' k4='0' result='lit'/>
    <feComposite in='lit' in2='SourceAlpha' operator='in' result='lit2'/>
    <feMerge><feMergeNode in='lit2'/><feMergeNode in='s2'/></feMerge>
  </filter>
  <filter id='well' x='-5%' y='-5%' width='110%' height='110%' color-interpolation-filters='sRGB'>
    <feComponentTransfer in='SourceAlpha' result='inv'><feFuncA type='table' tableValues='1 0'/></feComponentTransfer>
    <feOffset in='inv' dx='3' dy='4' result='o'/><feGaussianBlur in='o' stdDeviation='3' result='ob'/>
    <feFlood flood-color='#1a0508' flood-opacity='.75'/><feComposite in2='ob' operator='in' result='sh'/>
    <feComposite in='sh' in2='SourceAlpha' operator='in' result='inner'/>
    <feOffset in='inv' dx='-2' dy='-2.5' result='o2'/><feGaussianBlur in='o2' stdDeviation='1.6' result='ob2'/>
    <feFlood flood-color='#ffd9d4' flood-opacity='.32'/><feComposite in2='ob2' operator='in' result='hl'/>
    <feComposite in='hl' in2='SourceAlpha' operator='in' result='inner2'/>
    <feMerge><feMergeNode in='SourceGraphic'/><feMergeNode in='inner'/><feMergeNode in='inner2'/></feMerge>
  </filter>
  <filter id='raise' x='-10%' y='-10%' width='120%' height='120%' color-interpolation-filters='sRGB'>
    <feOffset in='SourceAlpha' dx='1.6' dy='2' result='o'/><feGaussianBlur in='o' stdDeviation='1' result='ob'/>
    <feFlood flood-color='#14030a' flood-opacity='.8'/><feComposite in2='ob' operator='in' result='sh'/>
    <feOffset in='SourceAlpha' dx='-1' dy='-1.2' result='h'/><feGaussianBlur in='h' stdDeviation='.5' result='hb'/>
    <feFlood flood-color='#ffcfc8' flood-opacity='.55'/><feComposite in2='hb' operator='in' result='hi'/>
    <feMerge><feMergeNode in='sh'/><feMergeNode in='hi'/><feMergeNode in='SourceGraphic'/></feMerge>
  </filter>
  <filter id='lift' x='-25%' y='-25%' width='150%' height='160%' color-interpolation-filters='sRGB'>
    <feGaussianBlur in='SourceAlpha' stdDeviation='2.2' result='a'/><feOffset in='a' dx='2' dy='3' result='a2'/>
    <feFlood flood-color='#2b1810' flood-opacity='.42'/><feComposite in2='a2' operator='in' result='s1'/>
    <feGaussianBlur in='SourceAlpha' stdDeviation='20' result='b'/><feOffset in='b' dx='18' dy='30' result='b2'/>
    <feFlood flood-color='#2b1810' flood-opacity='.34'/><feComposite in2='b2' operator='in' result='s2'/>
    <feMerge><feMergeNode in='s2'/><feMergeNode in='s1'/><feMergeNode in='SourceGraphic'/></feMerge>
  </filter>
  <filter id='soft' x='-40%' y='-40%' width='180%' height='180%'><feGaussianBlur stdDeviation='3'/></filter>
  <filter id='gobo' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='13'/></filter>
  <radialGradient id='key' cx='.18' cy='.08' r='1.05'><stop offset='0' stop-color='#fff4e2' stop-opacity='.5'/><stop offset='.55' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#26140e' stop-opacity='.38'/></radialGradient>
  <radialGradient id='euc' cx='.32' cy='.28' r='.85'><stop offset='0' stop-color='#c3cfbf'/><stop offset='.55' stop-color='#8fa293'/><stop offset='1' stop-color='#5d7366'/></radialGradient>
  <radialGradient id='euc2' cx='.32' cy='.28' r='.85'><stop offset='0' stop-color='#b4c4c0'/><stop offset='.55' stop-color='#7f9590'/><stop offset='1' stop-color='#566a66'/></radialGradient>
  <radialGradient id='euc3' cx='.32' cy='.28' r='.85'><stop offset='0' stop-color='#cdd6c4'/><stop offset='.6' stop-color='#9cab95'/><stop offset='1' stop-color='#6c7d68'/></radialGradient>
  <radialGradient id='bud' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='#ffffff'/><stop offset='.7' stop-color='#f4efe6'/><stop offset='1' stop-color='#d9cfc1'/></radialGradient>
  <radialGradient id='petal' cx='.3' cy='.3' r='.9'><stop offset='0' stop-color='#efcfc8'/><stop offset='.7' stop-color='#d7a7a1'/><stop offset='1' stop-color='#b98581'/></radialGradient>`;

/** A sprig of round eucalyptus leaves along a curving stem, with its shadow. Returns [shadow, sprig]. */
function eucalyptus(x: number, y: number, len: number, turn: number, k: number, scale = 1): [string, string] {
  const at = (t: number): P => [t * len, Math.sin(t * 3.1 + k) * len * 0.06];
  let leaves = '';
  let shade = '';
  const n = Math.max(5, Math.round(len / 34));
  for (let i = 0; i < n; i++) {
    const t = 0.12 + (i / n) * 0.86;
    const [px, py] = at(t);
    for (const side of [-1, 1]) {
      const r = (21 - t * 10) * (0.8 + rnd(i + k, side + 3) * 0.4);
      const a = side * (50 + rnd(i * 3 + k, side) * 40) + (i % 2 ? 8 : -8);
      const rad = (a * Math.PI) / 180;
      const cx = px + Math.cos(rad) * r * 0.86;
      const cy = py + Math.sin(rad) * r * 0.86;
      const tilt = a + (rnd(i + k, 7) - 0.5) * 50;
      const paint = ['euc', 'euc2', 'euc3'][Math.floor(rnd(i * 5 + k, side + 9) * 3)];
      const leaf = `<ellipse cx='${f1(cx)}' cy='${f1(cy)}' rx='${f1(r)}' ry='${f1(r * 0.84)}' transform='rotate(${f1(tilt)} ${f1(cx)} ${f1(cy)})'`;
      shade += `${leaf} fill='#000'/>`;
      leaves += `${leaf} fill='url(#${paint})' stroke='#4e6258' stroke-opacity='.35' stroke-width='.8'/>`;
      // The silvery bloom, and the faint vein from the stem.
      leaves += `<ellipse cx='${f1(cx - r * 0.2)}' cy='${f1(cy - r * 0.25)}' rx='${f1(r * 0.55)}' ry='${f1(r * 0.4)}' fill='#fff' fill-opacity='.13'/>`;
      leaves += `<path d='M${f1(px)} ${f1(py)} Q${f1((px + cx) / 2 + 2)} ${f1((py + cy) / 2 - 2)} ${f1(cx + Math.cos(rad) * r * 0.75)} ${f1(cy + Math.sin(rad) * r * 0.75)}' fill='none' stroke='#e2e8dc' stroke-opacity='.5' stroke-width='1'/>`;
    }
  }
  const stem = `<path d='M0 0 ${Array.from({ length: 10 }, (_, i) => { const [sx, sy] = at((i + 1) / 10); return `L${f1(sx)} ${f1(sy)}`; }).join(' ')}' fill='none' stroke='#7c5a4b' stroke-width='2.6' stroke-linecap='round'/>`;
  const g = `transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(turn)}) scale(${scale})'`;
  return [`<g ${g}>${stem}${shade}</g>`, `<g ${g}>${stem}${leaves}</g>`];
}

/** A small cloud of baby's breath: tiny white flowers on fine stems. Returns [shadow, flowers]. */
function babysBreath(x: number, y: number, turn: number, k: number): [string, string] {
  let stems = '';
  let buds = '';
  let shade = '';
  for (let i = 0; i < 7; i++) {
    const a = -1.1 + rnd(i + k, 1) * 2.2;
    const d = 26 + rnd(i + k, 2) * 44;
    const tx = Math.cos(a) * d;
    const ty = Math.sin(a) * d * 0.75;
    stems += `<path d='M0 0 Q${f1(tx * 0.5)} ${f1(ty * 0.5 + 7)} ${f1(tx)} ${f1(ty)}' fill='none' stroke='#9b9474' stroke-width='1'/>`;
    for (let j = 0; j < 5; j++) {
      const bx = tx + (rnd(i * 7 + j, k) - 0.5) * 16;
      const by = ty + (rnd(i * 7 + j, k + 1) - 0.5) * 14;
      const r = 3 + rnd(i * 7 + j, k + 2) * 2.4;
      stems += `<path d='M${f1(tx)} ${f1(ty)} L${f1(bx)} ${f1(by)}' stroke='#a39c7c' stroke-width='.6'/>`;
      shade += `<circle cx='${f1(bx)}' cy='${f1(by)}' r='${f1(r)}' fill='#000'/>`;
      buds += `<circle cx='${f1(bx)}' cy='${f1(by)}' r='${f1(r)}' fill='url(#bud)'/><circle cx='${f1(bx + r * 0.12)}' cy='${f1(by + r * 0.12)}' r='${f1(r * 0.26)}' fill='#d6caa9'/>`;
    }
  }
  const g = `transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(turn)})'`;
  return [`<g ${g}>${stems}${shade}</g>`, `<g ${g}>${stems}${buds}</g>`];
}

/** A fallen rose petal, cupped, with its shadow. */
function petal(x: number, y: number, s: number, a: number): string {
  const d = `M0 ${f1(s * 0.95)} C${f1(-s * 1.1)} ${f1(s * 0.3)} ${f1(-s * 0.95)} ${f1(-s * 0.95)} ${f1(-s * 0.3)} ${f1(-s * 0.9)} Q0 ${f1(-s * 0.7)} ${f1(s * 0.3)} ${f1(-s * 0.92)} C${f1(s * 0.95)} ${f1(-s * 0.95)} ${f1(s * 1.1)} ${f1(s * 0.3)} 0 ${f1(s * 0.95)}Z`;
  return `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})'>
    <path d='${d}' fill='#2b1810' fill-opacity='.3' transform='translate(3 5)' filter='url(#soft)'/>
    <path d='${d}' fill='url(#petal)' stroke='#f6e2dc' stroke-opacity='.7' stroke-width='1.4'/>
    <path d='M0 ${f1(-s * 0.7)} Q${f1(s * 0.25)} 0 0 ${f1(s * 0.7)}' fill='none' stroke='#fff' stroke-opacity='.25' stroke-width='1.2'/>
  </g>`;
}

/** A deep wax seal: a pooled, uneven edge, a pressed well with a laurel ring and the initials standing up. */
function seal(x: number, y: number, r: number, colour: string, initials: string, k: number): string {
  const edge: P[] = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2;
    const rr = r * (1 + (rnd(i + k * 31, 2) - 0.5) * 0.16 + (rnd(i + k, 5) > 0.82 ? 0.09 : 0));
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
  });
  const well = r * 0.7;
  // The laurel ring: two branches of small leaves meeting at the bottom.
  let laurel = '';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 + side * (0.35 + i * 0.29);
      const lx = x + Math.cos(a) * well * 0.8;
      const ly = y + Math.sin(a) * well * 0.8;
      const deg = (a * 180) / Math.PI + (side > 0 ? 90 : -90);
      for (const out of [-1, 1]) {
        const L = r * 0.12;
        laurel += `<path d='M0 0 Q${f1(L * 0.45)} ${f1(-L * 0.5)} 0 ${f1(-L)} Q${f1(-L * 0.45)} ${f1(-L * 0.5)} 0 0Z' transform='translate(${f1(lx)} ${f1(ly)}) rotate(${f1(deg + out * 40 * side - 90 * side)})' fill='${colour}'/>`;
      }
    }
  }
  const [a, b] = initials.split('&').map((t) => t.trim());
  const mono = b
    ? `<text x='${f1(x - r * 0.25)}' y='${f1(y + r * 0.16)}' text-anchor='middle' font-family='Georgia, "Times New Roman", serif' font-size='${f1(r * 0.46)}' fill='${colour}'>${esc(a!)}</text>
       <text x='${f1(x + r * 0.25)}' y='${f1(y + r * 0.16)}' text-anchor='middle' font-family='Georgia, "Times New Roman", serif' font-size='${f1(r * 0.46)}' fill='${colour}'>${esc(b)}</text>
       <text x='${x}' y='${f1(y + r * 0.1)}' text-anchor='middle' font-family='Georgia, "Times New Roman", serif' font-style='italic' font-size='${f1(r * 0.22)}' fill='${colour}'>&amp;</text>`
    : `<text x='${x}' y='${f1(y + r * 0.18)}' text-anchor='middle' font-family='Georgia, "Times New Roman", serif' font-size='${f1(r * 0.55)}' fill='${colour}'>${esc(initials)}</text>`;
  return `<g>
    <ellipse cx='${f1(x + 7)}' cy='${f1(y + 11)}' rx='${f1(r * 1.02)}' ry='${f1(r)}' fill='#1e0d08' fill-opacity='.42' filter='url(#soft)'/>
    <path d='${smooth(edge)}' fill='${colour}' filter='url(#wax)'/>
    <circle cx='${x}' cy='${y}' r='${f1(well)}' fill='${dark(colour, 0.06)}' filter='url(#well)'/>
    <g filter='url(#raise)'>${laurel}${mono}</g>
    <path d='M${f1(x - r * 0.62)} ${f1(y - r * 0.5)} Q${f1(x - r * 0.25)} ${f1(y - r * 0.93)} ${f1(x + r * 0.3)} ${f1(y - r * 0.86)}' fill='none' stroke='#fff' stroke-opacity='.32' stroke-width='${f1(r * 0.07)}' stroke-linecap='round' filter='url(#soft)'/>
  </g>`;
}

/** A silk ribbon wrapped around the envelope from top to bottom, at `cx` (envelope coordinates). */
function ribbon(cx: number, h: number, width: number, colour: string): string {
  const x0 = cx - width / 2;
  return `<linearGradient id='rib${colour.slice(1)}' x1='0' x2='1'>
      <stop offset='0' stop-color='${dark(colour, 0.12)}'/><stop offset='.08' stop-color='${colour}'/>
      <stop offset='.35' stop-color='${light(colour, 0.14)}'/><stop offset='.62' stop-color='${colour}'/>
      <stop offset='.93' stop-color='${dark(colour, 0.03)}'/><stop offset='1' stop-color='${dark(colour, 0.14)}'/>
    </linearGradient>
    <rect x='${f1(x0 + 3)}' y='0' width='${width}' height='${h}' fill='#2b1810' fill-opacity='.22' filter='url(#soft)'/>
    <rect x='${f1(x0)}' y='-1' width='${width}' height='${h + 2}' fill='url(#rib${colour.slice(1)})'/>
    <rect x='${f1(x0)}' y='-1' width='${width}' height='${h + 2}' filter='url(#silk)' opacity='.38'/>
    <path d='M${f1(x0 + 1.5)} 0 V${h} M${f1(x0 + width - 1.5)} 0 V${h}' stroke='${light(colour, 0.35)}' stroke-opacity='.6' stroke-width='1'/>
    <rect x='${f1(x0)}' y='-1' width='${width}' height='5' fill='#000' fill-opacity='.2'/>
    <rect x='${f1(x0)}' y='${h - 4}' width='${width}' height='5' fill='#000' fill-opacity='.24'/>`;
}

interface Env {
  paper: string;
  wax: string;
  ribbon?: string;
  initials: string;
  k: number;
  w: number;
  h: number;
  greens?: boolean;
}

/** One envelope seen from the back: flap closed, a ribbon round it, greenery tucked under, sealed. */
function envelope(x: number, y: number, turn: number, e: Env): string {
  const { w, h, paper, k } = e;
  const tipY = h * 0.56;
  const cx = w / 2;
  const sr = Math.min(w, h) * 0.19;
  const tuck: [string, string][] = e.greens
    ? [
        eucalyptus(cx - 6, tipY - 8, w * 0.42, 196, k),
        eucalyptus(cx - 10, tipY + 4, w * 0.3, 160, k + 6, 0.85),
        eucalyptus(cx + 4, tipY + 6, w * 0.36, 16, k + 3, 0.95),
        babysBreath(cx + sr * 0.9, tipY - sr * 0.8, -40, k),
        babysBreath(cx - sr * 1.1, tipY + sr * 0.7, 140, k + 9),
        babysBreath(cx + sr * 1.3, tipY + sr * 0.5, 20, k + 4),
      ]
    : [];
  const flap = `M0 0 H${w} L${f1(cx + 16)} ${f1(tipY - 6)} Q${f1(cx)} ${f1(tipY + 4)} ${f1(cx - 16)} ${f1(tipY - 6)} Z`;
  return `<g transform='translate(${x} ${y}) rotate(${turn})' filter='url(#lift)'>
    <rect width='${w}' height='${h}' rx='5' fill='${paper}' filter='url(#paper)'/>
    <!-- The bottom and side flaps' seams, pressed into the paper. -->
    <path d='M2 ${h - 2} L${f1(cx - 30)} ${f1(h * 0.5)} M${w - 2} ${h - 2} L${f1(cx + 30)} ${f1(h * 0.5)}' fill='none' stroke='${dark(paper, 0.16)}' stroke-opacity='.5' stroke-width='1.2'/>
    <path d='M3 ${h} L${f1(cx - 28)} ${f1(h * 0.5 + 2)} M${w - 1} ${h} L${f1(cx + 32)} ${f1(h * 0.5 + 2)}' fill='none' stroke='#fff' stroke-opacity='.55' stroke-width='1'/>
    <!-- The flap, casting a soft shadow onto the body. -->
    <path d='${flap}' fill='#2b1810' fill-opacity='.2' transform='translate(2 5)' filter='url(#soft)'/>
    <path d='${flap}' fill='${light(paper, 0.08)}' filter='url(#paper)'/>
    <path d='M1 1 H${w - 1}' stroke='#fff' stroke-opacity='.7' stroke-width='1.2'/>
    <rect x='.5' y='.5' width='${w - 1}' height='${h - 1}' rx='5' fill='none' stroke='${dark(paper, 0.2)}' stroke-opacity='.35'/>
    ${tuck.map((t) => `<g filter='url(#soft)' opacity='.3' transform='translate(3 5)'>${t[0]}</g>`).join('')}
    ${tuck.map((t) => t[1]).join('')}
    ${e.ribbon ? ribbon(cx, h, w * 0.1, e.ribbon) : ''}
    ${seal(cx, tipY, sr, e.wax, e.initials, k)}
  </g>`;
}

/** The invitation card itself, peeking out from behind an envelope: deckled cotton paper, letterpress type. */
function card(x: number, y: number, turn: number, w: number, h: number, ink: string): string {
  const serif = `font-family='Georgia, "Times New Roman", serif'`;
  return `<g transform='translate(${x} ${y}) rotate(${turn})' filter='url(#lift)'>
    <g filter='url(#deckle)'><rect width='${w}' height='${h}' fill='#fbf7ef' filter='url(#paper)'/></g>
    <g ${serif} text-anchor='middle' fill='${ink}'>
      <text x='${w / 2}' y='${f1(h * 0.13)}' font-size='11' letter-spacing='4' fill-opacity='.75'>TOGETHER WITH THEIR FAMILIES</text>
      <text x='${w / 2}' y='${f1(h * 0.3)}' font-size='44' font-style='italic'>Harriet <tspan font-size='30'>&amp;</tspan> Theo</text>
      <text x='${w / 2}' y='${f1(h * 0.41)}' font-size='11' letter-spacing='4' fill-opacity='.75'>REQUEST THE PLEASURE OF YOUR COMPANY</text>
      <path d='M${w / 2 - 40} ${f1(h * 0.47)} H${w / 2 + 40}' stroke='${ink}' stroke-opacity='.35'/>
    </g>
  </g>`;
}

/** Leaf shadows from a window out of frame, falling across the top right of the picture. */
function windowShadow(x: number, y: number, s: number): string {
  let leaves = '';
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const bx = -t * 380;
    const by = t * 260 + Math.sin(t * 5) * 20;
    for (const side of [-1, 1]) {
      const a = -35 + side * (40 + rnd(i, side + 2) * 25);
      leaves += `<ellipse cx='${f1(bx)}' cy='${f1(by)}' rx='70' ry='17' transform='rotate(${f1(a)} ${f1(bx)} ${f1(by)}) translate(60 0)' />`;
    }
  }
  return `<g transform='translate(${x} ${y}) scale(${s})' fill='#2b1a10' opacity='.16' filter='url(#gobo)'>
    <path d='M0 0 Q-190 110 -400 270' fill='none' stroke='#2b1a10' stroke-width='9'/>${leaves}</g>`;
}

const url = (body: string, w: number, h: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' preserveAspectRatio='xMidYMid slice'><defs>${DEFS}</defs>${body}</svg>`)}`;

const LINEN = '#d8ccc0';
const linen = (w: number, h: number) => `<rect width='${w}' height='${h}' fill='${LINEN}'/><rect width='${w}' height='${h}' filter='url(#linen)'/>`;

/** The flat lay: envelopes in sage, blush, ivory and taupe on linen, each ribboned and sealed. */
export function flatLay(initials = 'H & T'): string {
  const env = (paper: string, wax: string, rib: string, k: number, greens = false): Env => ({ paper, wax, ribbon: rib, initials, k, w: 300, h: 420, greens });
  return url(
    `${linen(1000, 900)}
    ${envelope(60, 40, -14, env('#b6bea7', '#7a1f2e', '#efe6d6', 1))}
    ${envelope(560, -40, 9, env('#ecd5cd', '#8a5a2b', '#a8838a', 2))}
    ${envelope(700, 420, 13, env('#c4b3a4', '#5e1a2a', '#f1e7da', 4))}
    ${envelope(330, 300, -3, env('#f7f2ea', '#6e1a2b', '#d9b3ad', 3, true))}
    ${windowShadow(1060, -80, 1.3)}
    <rect width='1000' height='900' fill='url(#key)'/>`,
    1000,
    900,
  );
}

/**
 * One envelope, close up (a feature picture): the invitation card peeking out behind it, a ribbon, eucalyptus
 * and baby's breath tucked under a deep burgundy seal, a few fallen petals, and window light.
 */
export function envelopeClose(paper = '#f7f2ea', wax = '#6e1a2b', initials = 'H & T'): string {
  const [s1, e1] = eucalyptus(-30, 860, 300, -38, 21, 1.1);
  return url(
    `${linen(900, 900)}
    <g filter='url(#soft)' opacity='.3' transform='translate(4 7)'>${s1}</g>${e1}
    ${card(205, 120, 6, 520, 360, '#4a1f2b')}
    ${envelope(150, 330, -5, { paper, wax, ribbon: '#d9b3ad', initials, k: 7, w: 600, h: 410, greens: true })}
    ${petal(760, 790, 26, 30)}${petal(812, 742, 20, -60)}${petal(700, 850, 17, 110)}
    ${windowShadow(990, -60, 1.25)}
    <rect width='900' height='900' fill='url(#key)'/>`,
    900,
    900,
  );
}

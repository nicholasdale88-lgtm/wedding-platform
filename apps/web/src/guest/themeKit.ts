import { THEMES } from './generated/themes';

/**
 * Invitation themes. The design's five hand-made themes, plus looks built from five colours (paper, ink,
 * metallic accent, a soft tint, the envelope): every one of the design's ~60 colour settings is worked
 * out from those, so a new look (or the couple's own colours) is complete and in tune everywhere.
 */

export interface Palette {
  paper: string;
  ink: string;
  accent: string;
  soft: string;
  envelope: string;
}
/** The couple's own touches on top of any theme. */
export interface ThemeCustom {
  paper?: string;
  ink?: string;
  accent?: string;
  soft?: string;
  envelope?: string;
  /** How the names are set: a script, classic spaced capitals, or an elegant serif. */
  names?: NamesStyle;
}

export type NamesStyle = 'script' | 'caps' | 'vibes' | 'parisienne' | 'playfair';
/** How the names can be set: the font, size, spacing and case for each. */
export const NAMES_STYLES: Record<NamesStyle, { label: string; font: string; vars?: Record<string, string> }> = {
  script: { label: 'Classic script', font: "'Pinyon Script', cursive" },
  vibes: { label: 'Flowing script', font: "'Great Vibes', cursive", vars: { nf: "'Great Vibes',cursive", nsz: 'clamp(40px,11vw,54px)', nls: '0', ntt: 'none' } },
  parisienne: { label: 'Handwritten', font: "'Parisienne', cursive", vars: { nf: "'Parisienne',cursive", nsz: 'clamp(34px,9.5vw,46px)', nls: '0', ntt: 'none' } },
  caps: { label: 'Spaced capitals', font: "'Cormorant Garamond', serif", vars: { nf: "'Cormorant Garamond',serif", nls: '.2em', ntt: 'uppercase', nsz: 'clamp(22px,6vw,31px)' } },
  playfair: { label: 'Modern serif', font: "'Playfair Display', Georgia, serif", vars: { nf: "'Playfair Display',Georgia,serif", nsz: 'clamp(30px,8vw,40px)', nls: '.02em', ntt: 'none' } },
};

/** The most-chosen invitation styles, as palettes (the design's own five stay as they are). */
export const PRESETS: Record<string, Palette & { style: string }> = {
  'Classic Ivory & Gold': { paper: '#fbf7ee', ink: '#3a3226', accent: '#b8955a', soft: '#ece2cf', envelope: '#efe6d3', style: 'Timeless and formal' },
  'Modern Minimal': { paper: '#fbfbf9', ink: '#1f1f1f', accent: '#8c8c86', soft: '#e7e6e1', envelope: '#ecebe6', style: 'Clean lines, lots of white' },
  'Rustic Eucalyptus': { paper: '#f4efe4', ink: '#3b4a3c', accent: '#a07b4f', soft: '#c9d3bf', envelope: '#d9c9a8', style: 'Kraft, greenery, country' },
  'Boho Terracotta': { paper: '#f8efe6', ink: '#5b3426', accent: '#c07a4f', soft: '#ecc9b2', envelope: '#e7cbb4', style: 'Warm, earthy, dried flowers' },
  'Coastal Dusty Blue': { paper: '#f6f7f6', ink: '#2f4256', accent: '#a5946a', soft: '#cbd8e3', envelope: '#dfe6ec', style: 'Beach and harbour' },
  'Moody Burgundy': { paper: '#f7efed', ink: '#4a1e27', accent: '#b8915a', soft: '#e3c3c6', envelope: '#e9d6d3', style: 'Deep, romantic, evening' },
  'Emerald & Gold': { paper: '#f5f3ec', ink: '#1f4a3c', accent: '#c2a061', soft: '#c7dacf', envelope: '#dfe5dc', style: 'Jewel tones, luxe' },
  'Navy & Gold': { paper: '#f7f5ef', ink: '#1e2b45', accent: '#c2a061', soft: '#d3d9e6', envelope: '#e2e5ec', style: 'Classic black-tie colours' },
  'Lavender Garden': { paper: '#faf8fb', ink: '#3f3654', accent: '#a99ab9', soft: '#e3dcee', envelope: '#ece6f2', style: 'Soft spring garden' },
  'Black Tie': { paper: '#f6f4ef', ink: '#141414', accent: '#b8955a', soft: '#dcd8cf', envelope: '#e4e0d7', style: 'Black, white and gold' },
  'Autumn Harvest': { paper: '#f8f1e6', ink: '#4a2f1c', accent: '#b5712f', soft: '#e7cfa9', envelope: '#e8d6b8', style: 'Rust, amber, golden fields' },
};

const hex = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1]!, 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: number[]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
/** a → b by t (0 = a, 1 = b). */
export const mix = (a: string, b: string, t: number) => {
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
};
const darker = (a: string, t: number) => mix(a, '#000000', t);
export const isHex = (s: string | undefined): s is string => !!s && /^#[0-9a-f]{6}$/i.test(s);

/** Every colour setting the design uses, worked out from a palette (laid over a hand-made base theme). */
function fromPalette(p: Palette, onto?: Record<string, string>): Record<string, string> {
  const base = onto ?? THEMES['Cream & Sage'] ?? {};
  const { paper, ink, accent, soft, envelope } = p;
  const v: Record<string, string> = {
    b1: paper,
    b3: mix(paper, soft, 0.15),
    b5: mix(paper, soft, 0.08),
    iv: paper,
    l1: paper,
    l2: paper,
    inkbg: paper,
    btx: paper,
    b2: mix(paper, soft, 0.35),
    b4: mix(paper, soft, 0.45),
    b6: mix(paper, soft, 0.6),
    l3: mix(paper, soft, 0.3),
    reg: mix(paper, soft, 0.25),
    hb1: mix(paper, soft, 0.2),
    hb2: mix(paper, soft, 0.45),
    bacc: mix(soft, accent, 0.3),
    dg: ink,
    mg: mix(ink, paper, 0.1),
    sg: mix(ink, paper, 0.3),
    htx: ink,
    hint: ink,
    inkc: ink,
    hsub: mix(ink, paper, 0.4),
    acc: accent,
    acc2: darker(accent, 0.12),
    fgo: accent,
    gcap: mix(accent, paper, 0.4),
    e1: envelope,
    e2: darker(envelope, 0.07),
    e3: darker(envelope, 0.16),
    t1: mix(paper, envelope, 0.6),
    t2: mix(paper, envelope, 0.85),
    t3: darker(envelope, 0.05),
    fl1: mix(soft, ink, 0.2),
    fl2: soft,
    fl3: mix(soft, paper, 0.3),
    g1: soft,
    g2: mix(soft, paper, 0.5),
    g3: mix(soft, ink, 0.25),
    wat: soft,
    wy: mix(soft, accent, 0.3),
    clf: mix(ink, soft, 0.4),
  };
  // Only settings the design has: the rest of the base theme (shapes, shadows, images) stays.
  return { ...base, ...Object.fromEntries(Object.entries(v).filter(([k]) => k in base || /^(b[1-6]|iv|dg|acc)$/.test(k))) };
}

/** The palette a theme is built on (the hand-made ones read back from their own settings). */
export function paletteOf(name: string): Palette {
  const p = PRESETS[name];
  if (p) return p;
  const t = THEMES[name] ?? THEMES['Cream & Sage'] ?? {};
  return { paper: t.b1 ?? '#f6f0e2', ink: t.dg ?? '#33402f', accent: t.acc ?? '#b39563', soft: t.b2 ?? '#cfd8bb', envelope: t.e1 ?? '#e6dcc4' };
}

/** Every theme name, the design's own first. */
export const THEME_NAMES = [...Object.keys(THEMES), ...Object.keys(PRESETS)];

/** A theme's full settings, with the couple's own colours and names style on top. */
export function themeOf(name: string | undefined, custom?: ThemeCustom): Record<string, string> {
  const n = name ?? '';
  const own = custom && (isHex(custom.paper) || isHex(custom.ink) || isHex(custom.accent) || isHex(custom.soft) || isHex(custom.envelope));
  let t: Record<string, string>;
  if (own) {
    const p = paletteOf(n);
    const pick = (k: keyof Palette) => (isHex(custom![k]) ? custom![k]! : p[k]);
    // A hand-made theme keeps its own images and shapes; only its colours change.
    t = fromPalette({ paper: pick('paper'), ink: pick('ink'), accent: pick('accent'), soft: pick('soft'), envelope: pick('envelope') }, THEMES[n]);
  } else {
    t = THEMES[n] ?? (PRESETS[n] ? fromPalette(PRESETS[n]) : (THEMES['Cream & Sage'] ?? {}));
  }
  const vars = custom?.names ? NAMES_STYLES[custom.names]?.vars : undefined;
  if (vars) t = { ...t, ...vars };
  if (custom?.names === 'script') {
    const { nf: _nf, nls: _nls, ntt: _ntt, nsz: _nsz, ...rest } = t;
    void _nf;
    void _nls;
    void _ntt;
    void _nsz;
    t = rest;
  }
  return t;
}

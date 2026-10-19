import type { SIGN_BORDERS, SIGN_FONTS, SIGN_SIZES, SignBlock, SignDesign, SignLook } from '@wp/shared';
import qrcode from 'qrcode-generator';

/**
 * Signs, drawn: one renderer (a canvas) for the preview, the printout and the PDF saved to the couple's
 * linked storage, so all three match. A sign is a look (paper size, colours, fonts, border) and blocks,
 * top to bottom; the templates are starting points, and every word, size and colour can be changed.
 */

export type SignFont = (typeof SIGN_FONTS)[number];
export type SignSize = (typeof SIGN_SIZES)[number];
export type SignBorder = (typeof SIGN_BORDERS)[number];

export const FONTS: Record<SignFont, { label: string; family: string; italic?: boolean; weight?: number }> = {
  pinyon: { label: 'Classic script', family: "'Pinyon Script'" },
  vibes: { label: 'Flowing script', family: "'Great Vibes'" },
  parisienne: { label: 'Handwritten', family: "'Parisienne'" },
  playfair: { label: 'Modern serif', family: "'Playfair Display'" },
  cormorant: { label: 'Elegant serif', family: "'Cormorant Garamond'", weight: 500 },
  'cormorant-italic': { label: 'Elegant italic', family: "'Cormorant Garamond'", italic: true, weight: 500 },
  sans: { label: 'Clean sans', family: "'DM Sans Variable', 'DM Sans'", weight: 500 },
};
export const BORDERS: Record<SignBorder, string> = { none: 'None', line: 'Fine line', double: 'Double line', corners: 'Corners', arch: 'Arch', dots: 'Dotted' };
/** Paper sizes in millimetres (portrait). */
export const PAPER: Record<SignSize, [number, number]> = { A6: [105, 148], A5: [148, 210], A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841] };
export const BLOCK_LABEL: Record<SignBlock['kind'], string> = { small: 'Small heading', heading: 'Big line', text: 'Words', rule: 'Line', list: 'List', qr: 'QR code', space: 'Gap' };

let n = 0;
const id = () => `b${Date.now().toString(36)}${(n++).toString(36)}`;
const b = (kind: SignBlock['kind'], text = '', more: Partial<SignBlock> = {}): SignBlock => ({ id: id(), kind, text, size: 1, font: '', colour: '', italic: false, ...more });
const look = (more: Partial<SignLook> = {}): SignLook => ({ size: 'A3', landscape: false, paper: '', ink: '', accent: '', heading: 'pinyon', body: 'cormorant', border: 'line', align: 'center', valign: 'middle', ...more });

export interface Template {
  id: string;
  name: string;
  hint: string;
  /** Made once per table (with {table}). */
  perTable?: boolean;
  design: () => SignDesign;
}
/** The usual wedding signs, most-used first. */
export const TEMPLATES: Template[] = [
  { id: 'welcome', name: 'Welcome sign', hint: 'At the entrance, on an easel.', design: () => ({ look: look(), blocks: [b('small', 'Welcome to the wedding of'), b('heading', '{name1}'), b('text', '&', { italic: true, size: 1.6 }), b('heading', '{name2}'), b('rule'), b('text', '{date}')] }) },
  { id: 'tables', name: 'Table numbers', hint: 'One for each table, from your seating plan.', perTable: true, design: () => ({ look: look({ size: 'A5' }), blocks: [b('small', 'Table'), b('heading', '{table}', { size: 1.5 }), b('rule'), b('text', '{couple}', { italic: true, size: 0.8 })] }) },
  { id: 'seating-welcome', name: 'Find your seat', hint: 'A header for a seating chart you lay out yourself.', design: () => ({ look: look({ landscape: true }), blocks: [b('heading', 'Find your seat'), b('rule'), b('text', 'Please take your seat at the table shown beside your name', { italic: true, size: 0.8 })] }) },
  { id: 'order', name: 'Order of the day', hint: 'The day at a glance: edit the times and moments.', design: () => ({ look: look({ size: 'A2' }), blocks: [b('heading', 'Order of the day', { size: 0.8 }), b('rule'), b('list', '{timeline}', { size: 1.5 }), b('text', '{couple}', { italic: true, size: 0.8 })] }) },
  { id: 'unplugged', name: 'Unplugged ceremony', hint: 'Phones away for the ceremony.', design: () => ({ look: look(), blocks: [b('small', 'Welcome to our'), b('heading', 'Unplugged ceremony', { size: 0.8 }), b('rule'), b('text', 'We invite you to be fully present with us. Please put away your phones and cameras: our photographer has it covered.')] }) },
  { id: 'cards', name: 'Cards and gifts', hint: 'Beside the wishing well or gift table.', design: () => ({ look: look({ size: 'A4' }), blocks: [b('heading', 'Cards & gifts', { size: 0.9 }), b('rule'), b('text', 'Your presence is the greatest gift of all. If you would like to leave a card, please pop it here.')] }) },
  { id: 'bar', name: 'Bar menu', hint: 'Signature drinks and what’s on.', design: () => ({ look: look({ size: 'A3' }), blocks: [b('small', 'From the bar'), b('heading', 'Signature drinks', { size: 0.8 }), b('rule'), b('list', 'Hers: Elderflower spritz\nHis: Old fashioned\nBeer, wine and soft drinks', { size: 1.1 })] }) },
  { id: 'photos', name: 'Share your photos', hint: 'With a QR code to your wedding page.', design: () => ({ look: look({ size: 'A4' }), blocks: [b('heading', 'Share the love', { size: 0.8 }), b('text', 'Scan to see our wedding page and share your photos with us'), b('qr', '{website}'), b('small', '{couple}')] }) },
  { id: 'guestbook', name: 'Guest book', hint: 'Beside the book or the polaroid table.', design: () => ({ look: look({ size: 'A4' }), blocks: [b('small', 'Please sign our'), b('heading', 'Guest book'), b('rule'), b('text', 'Leave us a note, a wish or a little advice', { italic: true })] }) },
  { id: 'reserved', name: 'Reserved', hint: 'For family rows or tables.', design: () => ({ look: look({ size: 'A5', landscape: true }), blocks: [b('small', 'Reserved for'), b('heading', 'Family')] }) },
  { id: 'favours', name: 'Favours', hint: 'A thank-you beside the favours.', design: () => ({ look: look({ size: 'A5' }), blocks: [b('heading', 'Thank you'), b('text', 'Please take one as a small token of our thanks', { italic: true })] }) },
  { id: 'directions', name: 'This way', hint: 'Point guests to the ceremony, reception or bar.', design: () => ({ look: look({ size: 'A3', landscape: true }), blocks: [b('heading', 'Ceremony'), b('text', '→', { size: 2 }), b('small', 'This way')] }) },
];
export const blankDesign = (): SignDesign => ({ look: look(), blocks: [b('heading', 'Your sign'), b('rule'), b('text', 'Write anything here')] });
export const newBlock = (kind: SignBlock['kind']) => b(kind, kind === 'heading' ? 'A big line' : kind === 'text' ? 'Some words' : kind === 'small' ? 'A small heading' : kind === 'list' ? 'One thing\nAnother thing' : kind === 'qr' ? '{website}' : '');

/** The words on a sign, with the wedding's details filled in. */
export type SignVars = Record<string, string>;
export const fill = (text: string, vars: SignVars) => text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

export interface Palette {
  paper: string;
  ink: string;
  accent: string;
  soft: string;
}

/** Load the fonts a sign uses (a canvas draws only fonts that are ready). */
export async function fontsFor(d: SignDesign) {
  if (!document.fonts) return;
  const used = new Set<SignFont>([d.look.heading, d.look.body, 'sans', ...d.blocks.map((x) => x.font).filter((f): f is SignFont => !!f)]);
  await Promise.all([...used].map((f) => document.fonts.load(`${FONTS[f].italic ? 'italic ' : ''}${FONTS[f].weight ?? 400} 40px ${FONTS[f].family}`).catch(() => [])));
}

/** A page's size in mm, the way round it's set. */
export const pageMm = (l: SignLook): [number, number] => {
  const [w, h] = PAPER[l.size];
  return l.landscape ? [h, w] : [w, h];
};

/**
 * Draw one sign onto a canvas `pxPerMm` pixels to the millimetre. The words are laid out top to bottom
 * and shrunk to fit if there are too many.
 */
export function drawSign(g: CanvasRenderingContext2D, d: SignDesign, pal: Palette, vars: SignVars, pxPerMm: number) {
  const [mmW, mmH] = pageMm(d.look);
  const W = mmW * pxPerMm;
  const H = mmH * pxPerMm;
  const short = Math.min(W, H);
  g.save();
  g.fillStyle = pal.paper;
  g.fillRect(0, 0, W, H);
  border(g, d.look.border, W, H, short, pal);

  // Base sizes, as a share of the page's short side (so an A5 and an A1 look alike).
  const base: Record<SignBlock['kind'], number> = { small: 0.028, heading: 0.15, text: 0.055, list: 0.065, rule: 0, qr: 0.42, space: 0.05 };
  const padX = W * 0.14;
  const padY = H * 0.1;
  const width = W - padX * 2;
  const avail = H - padY * 2;
  const fontOf = (x: SignBlock): SignFont => x.font || (x.kind === 'heading' ? d.look.heading : x.kind === 'small' ? 'sans' : d.look.body);
  const css = (f: SignFont, px: number, italic: boolean) => `${FONTS[f].italic || italic ? 'italic ' : ''}${x700(f)} ${px}px ${FONTS[f].family}, serif`;
  const x700 = (f: SignFont) => (f === 'sans' ? 600 : FONTS[f].weight ?? 400);

  type Laid = { x: SignBlock; px: number; lines: string[]; h: number };
  const layout = (shrink: number): Laid[] =>
    d.blocks.map((x) => {
      const px = short * base[x.kind] * x.size * shrink;
      if (x.kind === 'rule') return { x, px, lines: [], h: short * 0.05 };
      if (x.kind === 'space') return { x, px, lines: [], h: px };
      if (x.kind === 'qr') return { x, px, lines: [], h: Math.min(px, width) + short * 0.03 };
      const f = fontOf(x);
      g.font = css(f, px, x.italic);
      const words = fill(x.text, vars);
      const text = x.kind === 'small' ? words.toUpperCase() : words;
      const lines = (x.kind === 'list' ? text.split('\n') : text.split('\n')).flatMap((para) => wrap(g, para, width, x.kind === 'small' ? px * 0.3 : 0));
      const lh = x.kind === 'heading' ? 1.08 : x.kind === 'small' ? 1.6 : 1.35;
      return { x, px, lines, h: lines.length * px * lh + px * (x.kind === 'list' ? 0.35 : 0.25) };
    });
  let laid = layout(1);
  for (let i = 0; i < 4; i++) {
    const total = laid.reduce((a, l) => a + l.h, 0);
    if (total <= avail) break;
    laid = layout((avail / total) * 0.98 * (i ? 0.97 : 1));
  }
  const total = laid.reduce((a, l) => a + l.h, 0);
  let y = d.look.valign === 'top' ? padY : padY + Math.max(0, (avail - total) / 2);
  const left = d.look.align === 'left';
  const cx = left ? padX : W / 2;
  g.textAlign = left ? 'left' : 'center';
  g.textBaseline = 'alphabetic';
  for (const l of laid) {
    const colour = l.x.colour === 'accent' ? pal.accent : l.x.colour === 'soft' ? mixHex(pal.ink, pal.paper, 0.35) : l.x.kind === 'small' ? mixHex(pal.ink, pal.paper, 0.25) : pal.ink;
    if (l.x.kind === 'rule') {
      g.fillStyle = pal.accent;
      const rw = short * 0.13 * l.x.size;
      g.fillRect(left ? padX : W / 2 - rw / 2, y + l.h / 2 - short * 0.0012, rw, Math.max(1, short * 0.0024));
    } else if (l.x.kind === 'qr') {
      const size = Math.min(l.px, width);
      drawQr(g, fill(l.x.text, vars), left ? padX : W / 2 - size / 2, y + short * 0.015, size, pal.ink, pal.paper);
    } else if (l.x.kind !== 'space') {
      g.fillStyle = colour;
      g.font = css(fontOf(l.x), l.px, l.x.italic);
      const lh = l.x.kind === 'heading' ? 1.08 : l.x.kind === 'small' ? 1.6 : 1.35;
      setSpacing(g, l.x.kind === 'small' ? l.px * 0.3 : 0);
      l.lines.forEach((line, i) => g.fillText(line, cx, y + l.px * (i * lh + (l.x.kind === 'heading' ? 0.92 : 1))));
      setSpacing(g, 0);
    }
    y += l.h;
  }
  g.restore();
}

const setSpacing = (g: CanvasRenderingContext2D, px: number) => {
  const c = g as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
};
function wrap(g: CanvasRenderingContext2D, text: string, width: number, spacing: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  const w = (s: string) => g.measureText(s).width + spacing * s.length;
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && w(next) > width) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  out.push(cur);
  return out;
}
function drawQr(g: CanvasRenderingContext2D, url: string, x: number, y: number, size: number, ink: string, paper: string) {
  try {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    const count = q.getModuleCount();
    const cell = size / (count + 2);
    g.fillStyle = paper;
    g.fillRect(x, y, size, size);
    g.fillStyle = ink;
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (q.isDark(r, c)) g.fillRect(x + (c + 1) * cell, y + (r + 1) * cell, Math.ceil(cell), Math.ceil(cell));
  } catch {
    /* a link too long for a code: leave the space */
  }
}
function border(g: CanvasRenderingContext2D, kind: SignBorder, W: number, H: number, short: number, pal: Palette) {
  const inset = short * 0.045;
  const lw = Math.max(1, short * 0.0022);
  g.strokeStyle = pal.accent;
  g.lineWidth = lw;
  if (kind === 'line' || kind === 'double') {
    g.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    if (kind === 'double') g.strokeRect(inset + short * 0.012, inset + short * 0.012, W - (inset + short * 0.012) * 2, H - (inset + short * 0.012) * 2);
  } else if (kind === 'dots') {
    g.setLineDash([lw, lw * 3]);
    g.lineCap = 'round';
    g.lineWidth = lw * 1.6;
    g.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    g.setLineDash([]);
  } else if (kind === 'corners') {
    const len = short * 0.12;
    for (const [x, y, dx, dy] of [
      [inset, inset, 1, 1],
      [W - inset, inset, -1, 1],
      [inset, H - inset, 1, -1],
      [W - inset, H - inset, -1, -1],
    ] as const) {
      g.beginPath();
      g.moveTo(x, y + dy * len);
      g.lineTo(x, y);
      g.lineTo(x + dx * len, y);
      g.stroke();
      g.beginPath();
      g.arc(x + dx * short * 0.02, y + dy * short * 0.02, lw * 1.5, 0, Math.PI * 2);
      g.fillStyle = pal.accent;
      g.fill();
    }
  } else if (kind === 'arch') {
    const x0 = inset * 1.4;
    const x1 = W - inset * 1.4;
    const r = (x1 - x0) / 2;
    g.beginPath();
    g.moveTo(x0, H - inset);
    g.lineTo(x0, inset + r);
    g.arc(W / 2, inset + r, r, Math.PI, 0);
    g.lineTo(x1, H - inset);
    g.closePath();
    g.fillStyle = mixHex(pal.paper, pal.soft, 0.35);
    g.fill();
    g.stroke();
  }
}

const hexRgb = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const v = m ? parseInt(m[1]!, 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
export const mixHex = (a: string, b2: string, t: number) => {
  const x = hexRgb(a);
  const y = hexRgb(b2);
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/** Pages as JPEGs, `dpi` dots to the inch. */
export async function renderPages(d: SignDesign, pal: Palette, pages: SignVars[], dpi: number, quality = 0.88): Promise<{ jpeg: Uint8Array; url: string; wPx: number; hPx: number }[]> {
  await fontsFor(d);
  const [mmW, mmH] = pageMm(d.look);
  const pxPerMm = dpi / 25.4;
  const out = [];
  for (const vars of pages) {
    const c = document.createElement('canvas');
    c.width = Math.round(mmW * pxPerMm);
    c.height = Math.round(mmH * pxPerMm);
    drawSign(c.getContext('2d')!, d, pal, vars, pxPerMm);
    const url = c.toDataURL('image/jpeg', quality);
    const bin = atob(url.split(',')[1] ?? '');
    const jpeg = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
    out.push({ jpeg, url, wPx: c.width, hPx: c.height });
  }
  return out;
}

/** A PDF of full-page images (one per page), each page `mmW` × `mmH`. Small and print-ready. */
export function imagesToPdf(pages: { jpeg: Uint8Array; wPx: number; hPx: number }[], mmW: number, mmH: number): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const pt = (mm: number) => ((mm / 25.4) * 72).toFixed(2);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (x: Uint8Array | string) => {
    const bytes = typeof x === 'string' ? enc.encode(x) : x;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (num: number, body: (string | Uint8Array)[]) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
    body.forEach(push);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`]);
  pages.forEach((p, i) => {
    const page = 3 + i * 3;
    const content = `q ${pt(mmW)} 0 0 ${pt(mmH)} 0 0 cm /Im${i} Do Q`;
    obj(page, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(mmW)} ${pt(mmH)}] /Resources << /XObject << /Im${i} ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`]);
    obj(page + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(page + 2, [`<< /Type /XObject /Subtype /Image /Width ${p.wPx} /Height ${p.hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

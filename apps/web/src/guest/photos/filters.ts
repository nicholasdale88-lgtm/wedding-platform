/**
 * Event filters for guests' photos (like Snapchat's geofilters), drawn onto the photo itself so they
 * travel with it: the event's name and date in the invitation's script, the couple's wax seal, a
 * framed border, and for the second celebration a big "30"-style number badge in its blue. Each event
 * offers its own set, in the wedding's colours.
 */

import { applyLook, type LookKey } from './looks';

export type FilterKey = 'none' | 'names' | 'seal' | 'frame' | 'number' | 'polaroid' | 'stamp' | 'sprig' | 'hashtag' | 'balloons' | 'confetti' | 'cheers' | 'snapshot' | 'partytag' | 'bdayframe';

export interface FilterInfo {
  /** "The wedding", "Alex's 30th" */
  title: string;
  /** "Thursday 18 November 2027" */
  date: string;
  /** "Alex & Sam" */
  couple: string;
  /** "A&S" */
  monogram: string;
  /** The theme's dark ink and gold. */
  ink: string;
  gold: string;
  /** 0: the first event (wedding look), 1: the second (its blue). */
  slot: number;
}

export const FILTER_LABEL: Record<FilterKey, string> = {
  none: 'No frame',
  names: 'Names',
  seal: 'Wax seal',
  frame: 'Frame',
  number: 'Big number',
  polaroid: 'Polaroid',
  stamp: 'Date stamp',
  sprig: 'Botanical',
  hashtag: 'Hashtag',
  balloons: 'Balloons',
  confetti: 'Confetti',
  cheers: 'Cheers',
  snapshot: 'Polaroid',
  partytag: 'Hashtag',
  bdayframe: 'Frame',
};
/** The birthday's frames (its own, so choosing them never changes the wedding's). */
export const BIRTHDAY_FRAMES: FilterKey[] = ['number', 'balloons', 'confetti', 'cheers', 'snapshot', 'partytag', 'bdayframe'];
export const WEDDING_FRAMES: FilterKey[] = ['names', 'polaroid', 'seal', 'sprig', 'frame', 'stamp', 'hashtag'];
/** A birthday (the second celebration, with an age in its name: "Alex's 30th"). */
export const isBirthday = (info: Pick<FilterInfo, 'slot' | 'title'>) => info.slot === 1 && /\d|birthday|bday/i.test(info.title);
/** "Alex's 30th" → the age ("30th", "30") and whose it is ("Alex"). */
const age = (title: string) => {
  const m = /(\d+)(st|nd|rd|th)?/i.exec(title);
  return { n: m?.[1] ?? '', nth: m ? `${m[1]}${m[2] ?? ''}` : '', who: title.split(/['’]s\b|\s/)[0]?.trim() ?? '' };
};
/**
 * The frames the couple offers for this event: what they chose, or (until they choose any of this
 * event's frames) all of them.
 */
export function framesOn(all: FilterKey[], chosen: string[] | undefined): FilterKey[] {
  if (!chosen || !all.some((k) => chosen.includes(k))) return all;
  return all.filter((k) => chosen.includes(k));
}

/** The filters an event offers, best first. */
export function filtersFor(info: Pick<FilterInfo, 'slot' | 'title'>): FilterKey[] {
  return ['none', ...(isBirthday(info) ? BIRTHDAY_FRAMES : WEDDING_FRAMES)];
}

const SCRIPT = '"Pinyon Script", "Snell Roundhand", cursive';
const SERIF = '"Cormorant Garamond", Georgia, serif';

/** The fonts the filters use, ready before anything is drawn (a first frame in a fallback font looks wrong). */
export async function filterFontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`64px ${SCRIPT}`),
      document.fonts.load(`32px ${SERIF}`),
      document.fonts.load(`italic 32px ${SERIF}`),
      document.fonts.load(`600 32px ${SERIF}`),
      document.fonts.load(`italic 500 32px ${SERIF}`),
    ]);
  } catch {
    /* draw with what the browser has */
  }
}

function fitText(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, start: number): number {
  let px = start;
  g.font = font(px);
  while (px > 10 && g.measureText(text).width > maxW) {
    px -= 2;
    g.font = font(px);
  }
  return px;
}

/** Draw the filter over whatever is already on the canvas (a photo, or nothing for the live camera overlay). */
export function drawFilter(g: CanvasRenderingContext2D, w: number, h: number, key: FilterKey, info: FilterInfo) {
  if (key === 'none') return;
  const u = Math.min(w, h); // filters scale with the shorter side, so they look the same portrait or landscape
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  if (key === 'names') {
    const band = g.createLinearGradient(0, h * 0.68, 0, h);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = band;
    g.fillRect(0, h * 0.68, w, h * 0.32);
    g.fillStyle = '#ffffff';
    g.shadowColor = 'rgba(0,0,0,.35)';
    g.shadowBlur = u * 0.01;
    fitText(g, info.couple, (px) => `${px}px ${SCRIPT}`, w * 0.86, Math.round(u * 0.11));
    g.fillText(info.couple, w / 2, h - u * 0.12);
    g.shadowBlur = 0;
    small(g, `${info.title} · ${info.date}`, w / 2, h - u * 0.05, u, w);
  }

  if (key === 'seal') {
    const r = u * 0.1;
    const cx = w - r - u * 0.05;
    const cy = h - r - u * 0.05;
    seal(g, cx, cy, r, info);
    g.fillStyle = '#ffffff';
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowBlur = u * 0.012;
    g.textAlign = 'right';
    fitText(g, info.title, (px) => `${px}px ${SCRIPT}`, w - r * 2 - u * 0.14, Math.round(u * 0.07));
    g.fillText(info.title, cx - r - u * 0.03, cy + u * 0.02);
  }

  if (key === 'frame') {
    const m = u * 0.035;
    g.strokeStyle = 'rgba(255,255,255,.92)';
    g.lineWidth = Math.max(2, u * 0.006);
    g.strokeRect(m, m, w - m * 2, h - m * 2);
    g.strokeStyle = info.gold;
    g.lineWidth = Math.max(1, u * 0.003);
    g.strokeRect(m * 1.6, m * 1.6, w - m * 3.2, h - m * 3.2);
    // A cream label at the foot of the frame, the invitation's card.
    const lw = Math.min(w * 0.7, u * 0.9);
    const lh = u * 0.15;
    const lx = (w - lw) / 2;
    const ly = h - m * 1.6 - lh - u * 0.03;
    g.fillStyle = 'rgba(251,248,242,.94)';
    g.fillRect(lx, ly, lw, lh);
    g.strokeStyle = info.gold;
    g.strokeRect(lx + u * 0.008, ly + u * 0.008, lw - u * 0.016, lh - u * 0.016);
    g.fillStyle = info.ink;
    fitText(g, info.title, (px) => `${px}px ${SCRIPT}`, lw * 0.86, Math.round(lh * 0.5));
    g.fillText(info.title, w / 2, ly + lh * 0.55);
    g.font = `600 ${Math.round(lh * 0.16)}px ${SERIF}`;
    g.fillText(spaced(info.date.toUpperCase()), w / 2, ly + lh * 0.82);
  }

  if (key === 'polaroid') {
    // A white instant-photo border, wide at the foot, with the names written on it.
    const m = u * 0.045;
    const foot = u * 0.2;
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, w, m);
    g.fillRect(0, 0, m, h);
    g.fillRect(w - m, 0, m, h);
    g.fillRect(0, h - foot, w, foot);
    g.fillStyle = info.ink;
    fitText(g, info.couple, (px) => `${px}px ${SCRIPT}`, w * 0.8, Math.round(foot * 0.5));
    g.fillText(info.couple, w / 2, h - foot * 0.42);
    g.fillStyle = 'rgba(0,0,0,.55)';
    fitText(g, info.date, (px) => `italic ${px}px ${SERIF}`, w * 0.8, Math.round(foot * 0.17));
    g.fillText(info.date, w / 2, h - foot * 0.14);
  }

  if (key === 'stamp') {
    // The orange date in the corner of a disposable camera's photo.
    const d = /(\d{1,2}) (\w+) (\d{4})/.exec(info.date);
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const mm = d ? String(months.indexOf(d[2]!.toLowerCase()) + 1).padStart(2, '0') : '';
    const text = d ? `'${d[3]!.slice(2)}  ${mm}  ${d[1]!.padStart(2, '0')}` : info.date;
    g.textAlign = 'right';
    g.font = `600 ${Math.round(u * 0.05)}px "Courier New", ui-monospace, monospace`;
    g.fillStyle = '#ff8a2a';
    g.shadowColor = 'rgba(255,120,30,.9)';
    g.shadowBlur = u * 0.012;
    g.fillText(text, w - u * 0.05, h - u * 0.05);
    g.shadowBlur = 0;
  }

  if (key === 'sprig') {
    // Greenery in two corners, and the names small at the foot.
    sprig(g, u * 0.02, u * 0.02, Math.PI * 0.2, u * 0.32, info);
    sprig(g, w - u * 0.02, h - u * 0.02, Math.PI * 1.2, u * 0.32, info);
    const band = g.createLinearGradient(0, h * 0.8, 0, h);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(1, 'rgba(0,0,0,.4)');
    g.fillStyle = band;
    g.fillRect(0, h * 0.8, w, h * 0.2);
    g.fillStyle = '#ffffff';
    fitText(g, info.couple, (px) => `${px}px ${SCRIPT}`, w * 0.6, Math.round(u * 0.08));
    g.fillText(info.couple, w / 2, h - u * 0.06);
  }

  if (key === 'hashtag') {
    const tag = `#${info.couple.replace(/&/g, 'And').replace(/[^A-Za-z0-9]/g, '')}${(/\d{4}/.exec(info.date)?.[0] ?? '')}`;
    g.font = `600 ${Math.round(u * 0.045)}px ${SERIF}`;
    const tw = g.measureText(tag).width;
    const ph = u * 0.075;
    const x = u * 0.05;
    const y = h - u * 0.05 - ph;
    g.fillStyle = 'rgba(251,248,242,.92)';
    g.beginPath();
    g.roundRect(x, y, tw + ph, ph, ph / 2);
    g.fill();
    g.fillStyle = info.ink;
    g.textAlign = 'left';
    g.fillText(tag, x + ph / 2, y + ph * 0.68);
  }

  if (key === 'balloons') {
    // A bunch of balloons in the corner, strings trailing; the event and date across the foot.
    const { nth } = age(info.title);
    const colours = [info.gold, info.ink, '#e8d9b5', '#c9d4e6', info.gold];
    const spots: [number, number, number][] = [
      [0.8, 0.13, 0.085],
      [0.9, 0.2, 0.075],
      [0.7, 0.21, 0.07],
      [0.83, 0.3, 0.065],
      [0.93, 0.07, 0.06],
    ];
    spots.forEach(([fx, fy, fr], i) => {
      const x = w * fx;
      const y = u * fy + u * 0.03;
      const r = u * fr;
      g.strokeStyle = 'rgba(255,255,255,.75)';
      g.lineWidth = Math.max(1, u * 0.002);
      g.beginPath();
      g.moveTo(x, y + r * 1.15);
      g.quadraticCurveTo(x - r * 0.6, y + r * 2.2, x - r * 0.2, y + r * 3.4);
      g.stroke();
      const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.15);
      grad.addColorStop(0, 'rgba(255,255,255,.85)');
      grad.addColorStop(0.35, colours[i % colours.length]!);
      grad.addColorStop(1, colours[i % colours.length]!);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, r * 0.9, r * 1.12, 0, 0, Math.PI * 2);
      g.fill();
    });
    const band = g.createLinearGradient(0, h * 0.72, 0, h);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = band;
    g.fillRect(0, h * 0.72, w, h * 0.28);
    g.fillStyle = '#ffffff';
    fitText(g, `Happy ${nth}!`, (px) => `${px}px ${SCRIPT}`, w * 0.8, Math.round(u * 0.11));
    g.fillText(`Happy ${nth}!`, w / 2, h - u * 0.11);
    small(g, `${info.title} · ${info.date}`, w / 2, h - u * 0.045, u, w);
  }

  if (key === 'confetti') {
    // Confetti falling across the top and bottom edges, "Happy 30th" across the middle of the foot.
    const { nth, who } = age(info.title);
    const colours = [info.gold, '#ffffff', '#c9d4e6', info.ink, '#e8d9b5'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const top = i % 2 === 0;
      const x = rnd() * w;
      const y = top ? rnd() * h * 0.22 : h - rnd() * h * 0.12;
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * Math.PI);
      g.fillStyle = colours[i % colours.length]!;
      g.globalAlpha = 0.9;
      if (i % 3 === 0) {
        g.beginPath();
        g.arc(0, 0, u * 0.008, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(-u * 0.012, -u * 0.004, u * 0.024, u * 0.008);
      g.restore();
    }
    g.fillStyle = '#ffffff';
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowBlur = u * 0.015;
    fitText(g, `Happy ${nth}${who ? `, ${who}` : ''}`, (px) => `${px}px ${SCRIPT}`, w * 0.86, Math.round(u * 0.1));
    g.fillText(`Happy ${nth}${who ? `, ${who}` : ''}`, w / 2, h - u * 0.15);
    g.shadowBlur = 0;
  }

  if (key === 'cheers') {
    // "Cheers to 30 years", big, over a dark band, with the date.
    const { n, who } = age(info.title);
    const band = g.createLinearGradient(0, h * 0.6, 0, h);
    band.addColorStop(0, 'rgba(20,24,36,0)');
    band.addColorStop(1, 'rgba(20,24,36,.75)');
    g.fillStyle = band;
    g.fillRect(0, h * 0.6, w, h * 0.4);
    g.fillStyle = info.gold;
    small(g, 'CHEERS TO', w / 2, h - u * 0.26, u, w);
    g.fillStyle = '#ffffff';
    fitText(g, `${n} years`, (px) => `${px}px ${SCRIPT}`, w * 0.8, Math.round(u * 0.14));
    g.fillText(`${n} years`, w / 2, h - u * 0.12);
    g.fillStyle = '#e6d79e';
    small(g, `${who ? `${who.toUpperCase()} · ` : ''}${info.date}`, w / 2, h - u * 0.05, u, w);
  }

  if (key === 'snapshot') {
    // An instant photo with the birthday written on it.
    const m = u * 0.045;
    const foot = u * 0.2;
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, w, m);
    g.fillRect(0, 0, m, h);
    g.fillRect(w - m, 0, m, h);
    g.fillRect(0, h - foot, w, foot);
    g.fillStyle = info.ink;
    fitText(g, info.title, (px) => `${px}px ${SCRIPT}`, w * 0.8, Math.round(foot * 0.5));
    g.fillText(info.title, w / 2, h - foot * 0.42);
    g.fillStyle = 'rgba(0,0,0,.55)';
    fitText(g, info.date, (px) => `italic ${px}px ${SERIF}`, w * 0.8, Math.round(foot * 0.17));
    g.fillText(info.date, w / 2, h - foot * 0.14);
  }

  if (key === 'partytag') {
    const { n, who } = age(info.title);
    const tag = `#${who.replace(/[^A-Za-z0-9]/g, '')}${n}`;
    g.font = `600 ${Math.round(u * 0.05)}px ${SERIF}`;
    const tw = g.measureText(tag).width;
    const ph = u * 0.08;
    const x = u * 0.05;
    const y = h - u * 0.05 - ph;
    g.fillStyle = info.ink;
    g.beginPath();
    g.roundRect(x, y, tw + ph, ph, ph / 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'left';
    g.fillText(tag, x + ph / 2, y + ph * 0.68);
  }

  if (key === 'bdayframe') {
    drawFilter(g, w, h, 'frame', info);
  }

  if (key === 'number') {
    const n = /\d+/.exec(info.title)?.[0] ?? '';
    const band = g.createLinearGradient(0, h * 0.55, 0, h);
    band.addColorStop(0, 'rgba(47,61,92,0)');
    band.addColorStop(1, 'rgba(47,61,92,.78)');
    g.fillStyle = band;
    g.fillRect(0, h * 0.55, w, h * 0.45);
    g.font = `300 ${Math.round(u * 0.34)}px ${SERIF}`;
    g.lineWidth = Math.max(2, u * 0.006);
    g.strokeStyle = '#ffffff';
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillText(n, w / 2, h - u * 0.2);
    g.strokeText(n, w / 2, h - u * 0.2);
    g.fillStyle = '#e6d79e';
    small(g, info.title.toUpperCase(), w / 2, h - u * 0.11, u, w);
    g.fillStyle = '#ffffff';
    small(g, info.date, w / 2, h - u * 0.05, u, w);
  }
  g.restore();
}

const spaced = (s: string) => s.split('').join(' ');

/** A sprig of leaves from a corner: a curved stem, leaves either side, in the theme's greens and gold. */
function sprig(g: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, info: FilterInfo) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.strokeStyle = info.gold;
  g.lineWidth = Math.max(1, size * 0.012);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(size * 0.5, size * 0.12, size, 0);
  g.stroke();
  const greens = ['#6f7b58', '#8a9670', '#a9b48d'];
  for (let i = 1; i <= 7; i++) {
    const t = i / 8;
    const px = size * t;
    const py = size * 0.12 * 4 * t * (1 - t) * 0.5;
    for (const side of [-1, 1]) {
      g.save();
      g.translate(px, py);
      g.rotate(side * 0.7 - 0.2);
      g.fillStyle = greens[(i + (side > 0 ? 1 : 0)) % greens.length]!;
      g.globalAlpha = 0.92;
      g.beginPath();
      g.ellipse(0, side * size * 0.045, size * 0.075 * (1 - t * 0.4), size * 0.028, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  g.restore();
}

function small(g: CanvasRenderingContext2D, text: string, x: number, y: number, u: number, w: number) {
  fitText(g, spaced(text), (px) => `600 ${px}px ${SERIF}`, w * 0.9, Math.round(u * 0.034));
  g.fillText(spaced(text), x, y);
}

function seal(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, info: FilterInfo) {
  const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#fff3dc');
  grad.addColorStop(0.45, info.gold);
  grad.addColorStop(1, info.ink);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,.6)';
  g.lineWidth = Math.max(1, r * 0.04);
  g.beginPath();
  g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, info.monogram, (px) => `italic 500 ${px}px ${SERIF}`, r * 1.4, Math.round(r * 0.62));
  g.fillText(info.monogram, cx, cy + r * 0.04);
  g.textBaseline = 'alphabetic';
}

/**
 * A photo (from the camera roll or a camera frame) shrunk for upload (longest side 2400px) with the filter
 * drawn on, as a JPEG. A format the browser can't draw (e.g. HEIC on some phones) is sent as it is, unfiltered.
 */
export function renderPhoto(source: Blob, key: FilterKey, info: FilterInfo | null, look: LookKey = 'original'): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const u = URL.createObjectURL(source);
    img.onload = () => {
      const k = Math.min(1, 2400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const g = c.getContext('2d');
      if (g) {
        g.drawImage(img, 0, 0, c.width, c.height);
        applyLook(g, c.width, c.height, look); // the colour grade first, then the frame on top
        if (info) drawFilter(g, c.width, c.height, key, info);
      }
      URL.revokeObjectURL(u);
      c.toBlob((b) => resolve(b ?? source), 'image/jpeg', 0.88);
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      resolve(source);
    };
    img.src = u;
  });
}

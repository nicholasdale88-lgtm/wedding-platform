/**
 * Looks for guests' photos and videos: wedding-style colour grades (golden hour, film, classic black and
 * white…). On a photo the look is drawn into the pixels before it's sent (so it travels with the photo,
 * on every phone); on a video it's kept with the video and shown when it plays (the same look in CSS).
 */

export type LookKey = 'original' | 'golden' | 'film' | 'classic' | 'blush' | 'moody' | 'airy' | 'vintage';

interface Grade {
  label: string;
  /** The same look as a CSS filter, for previews and for videos. */
  css: string;
  /** brightness, contrast, saturation (1 = unchanged), warmth (-1..1), black and white (0..1), sepia (0..1), faded blacks (0..1), vignette (0..1), grain (0..1) */
  b: number;
  c: number;
  s: number;
  warm: number;
  mono: number;
  sepia: number;
  fade: number;
  vignette: number;
  grain: number;
}

export const LOOKS: Record<LookKey, Grade> = {
  original: { label: 'Original', css: 'none', b: 1, c: 1, s: 1, warm: 0, mono: 0, sepia: 0, fade: 0, vignette: 0, grain: 0 },
  golden: { label: 'Golden hour', css: 'sepia(.22) saturate(1.25) brightness(1.05) contrast(1.04)', b: 1.05, c: 1.04, s: 1.2, warm: 0.45, mono: 0, sepia: 0.12, fade: 0, vignette: 0.25, grain: 0 },
  film: { label: 'Film', css: 'contrast(.9) saturate(.85) brightness(1.06) sepia(.08)', b: 1.05, c: 0.88, s: 0.85, warm: 0.15, mono: 0, sepia: 0.06, fade: 0.35, vignette: 0.2, grain: 0.35 },
  classic: { label: 'Classic B&W', css: 'grayscale(1) contrast(1.12)', b: 1.02, c: 1.12, s: 1, warm: 0, mono: 1, sepia: 0, fade: 0.08, vignette: 0.3, grain: 0.15 },
  blush: { label: 'Blush', css: 'saturate(1.08) brightness(1.06) hue-rotate(-6deg)', b: 1.06, c: 0.97, s: 1.05, warm: 0.2, mono: 0, sepia: 0, fade: 0.15, vignette: 0.1, grain: 0 },
  moody: { label: 'Moody', css: 'contrast(1.15) brightness(.92) saturate(.78)', b: 0.93, c: 1.16, s: 0.75, warm: -0.1, mono: 0, sepia: 0, fade: 0.05, vignette: 0.45, grain: 0.1 },
  airy: { label: 'Bright & airy', css: 'brightness(1.12) contrast(.9) saturate(.95)', b: 1.12, c: 0.9, s: 0.95, warm: 0.05, mono: 0, sepia: 0, fade: 0.2, vignette: 0, grain: 0 },
  vintage: { label: 'Vintage', css: 'sepia(.55) contrast(.95) brightness(1.03)', b: 1.03, c: 0.95, s: 0.9, warm: 0.2, mono: 0, sepia: 0.5, fade: 0.3, vignette: 0.35, grain: 0.3 },
};
export const LOOK_KEYS = Object.keys(LOOKS) as LookKey[];
export const isLook = (k: string | null | undefined): k is LookKey => !!k && k in LOOKS;

/** Draw a look onto what's on the canvas (pixel by pixel, so it works where canvas filters don't). */
export function applyLook(g: CanvasRenderingContext2D, w: number, h: number, key: LookKey) {
  const L = LOOKS[key];
  if (key === 'original') return;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const lift = L.fade * 38;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]! * L.b;
    let gr = d[i + 1]! * L.b;
    let bl = d[i + 2]! * L.b;
    r = (r - 128) * L.c + 128;
    gr = (gr - 128) * L.c + 128;
    bl = (bl - 128) * L.c + 128;
    const lum = 0.299 * r + 0.587 * gr + 0.114 * bl;
    r = lum + (r - lum) * L.s;
    gr = lum + (gr - lum) * L.s;
    bl = lum + (bl - lum) * L.s;
    if (L.mono) {
      r = r + (lum - r) * L.mono;
      gr = gr + (lum - gr) * L.mono;
      bl = bl + (lum - bl) * L.mono;
    }
    if (L.sepia) {
      const sr = 0.393 * r + 0.769 * gr + 0.189 * bl;
      const sg = 0.349 * r + 0.686 * gr + 0.168 * bl;
      const sb = 0.272 * r + 0.534 * gr + 0.131 * bl;
      r += (sr - r) * L.sepia;
      gr += (sg - gr) * L.sepia;
      bl += (sb - bl) * L.sepia;
    }
    r += L.warm * 18;
    bl -= L.warm * 18;
    if (lift) {
      r = lift + r * (1 - lift / 255);
      gr = lift + gr * (1 - lift / 255);
      bl = lift + bl * (1 - lift / 255);
    }
    if (L.grain) {
      const n = (Math.random() - 0.5) * L.grain * 36;
      r += n;
      gr += n;
      bl += n;
    }
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = gr < 0 ? 0 : gr > 255 ? 255 : gr;
    d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
  }
  g.putImageData(img, 0, 0);
  if (L.vignette) {
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${0.55 * L.vignette})`);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }
}

/** A video file the page can send (the server checks the bytes too). */
export const isVideo = (f: Blob) => /^video\//.test(f.type);
/** The largest video a guest can add (bigger ones are best shared another way). */
export const MAX_VIDEO_MB = 55;

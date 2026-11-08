import { OPENINGS, type Opening } from '@wp/shared';

/**
 * How the envelope opens. Every style moves the same pieces the design already draws (the flaps, the seal,
 * the card, the sparkle burst and the falling petals), only differently, so a new style costs no download
 * and no extra work on a phone: CSS transitions on transform and opacity only.
 *
 * Phases are the envelope's: 0 closed, 1 tapped, 2 opening, 3 card out, 4 gone.
 * A guest whose phone asks for less motion gets a quick, still fade whatever the style.
 */

export const openingOf = (s: string | undefined): Opening => ((OPENINGS as readonly string[]).includes(s ?? '') ? (s as Opening) : 'classic');

/** When each phase starts after the tap (ms): the design's slow, theatrical timing, or quick and still. */
export const openingTimes = (reduced: boolean): [number, number, number] => (reduced ? [60, 500, 1500] : [2400, 4600, 7400]);

export const prefersLessMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface OpeningColours {
  paper: string;
  ink: string;
  accent: string;
  soft: string;
}
interface Burst {
  size: string;
  m: string;
  c: string;
  r: string;
  t: string;
  o: number;
  d: string;
  d2: string;
}
interface Petal {
  x: string;
  w: string;
  h: string;
  c: string;
  dur: string;
  del: string;
  sx: string;
}
/** The view values an opening style changes (the rest stay the design's). */
export interface OpeningValues {
  topT?: string;
  topOp?: number;
  sealT?: string;
  sealOp?: number;
  leftT?: string;
  rightT?: string;
  bottomT?: string;
  panelOp?: number;
  envZoom?: string;
  cardScale?: string;
  isP1?: boolean;
  burst?: Burst[];
  petals?: Petal[];
}

const C = 'translate(-50%,-50%)';

/** Falling pieces: n of them, in these colours, this size (px) and how slow (s). */
function fall(n: number, colours: string[], size: [number, number], slow: number, square = false): Petal[] {
  return Array.from({ length: n }, (_, i) => {
    const w = size[0] + ((i * 7) % (size[1] - size[0] + 1));
    return {
      x: `${(i * 41 + 7) % 100}%`,
      w: `${w}px`,
      h: `${square ? w : Math.round(w * 1.5)}px`,
      c: colours[i % colours.length]!,
      dur: `${(slow + ((i * 13) % 10) / 8).toFixed(2)}s`,
      del: `${(((i * 17) % 14) / 10).toFixed(2)}s`,
      sx: `${(i % 2 ? 1 : -1) * (14 + ((i * 9) % 46))}px`,
    };
  });
}
/** The sparkle burst, recoloured (or hidden). */
const recolour = (burst: Burst[], colours: string[] | null): Burst[] =>
  burst.map((b, i) => (colours ? { ...b, c: colours[i % colours.length]! } : { ...b, o: 0 }));

export function openingValues(style: Opening, p: number, c: OpeningColours, base: { burst: Burst[] }, reduced: boolean): OpeningValues {
  if (reduced) {
    // No movement at all: the envelope simply fades and the card is there.
    const still = 'none';
    return { topT: still, leftT: still, rightT: still, bottomT: still, sealT: C, sealOp: p >= 2 ? 0 : 1, topOp: p >= 2 ? 0 : 1, panelOp: p >= 2 ? 0 : 1, envZoom: 'scale(1)', cardScale: 'none', isP1: false, burst: recolour(base.burst, null), petals: [] };
  }
  const open = p >= 2;
  switch (style) {
    case 'classic':
      return {};
    case 'crack':
      // The seal splits and drops (wax chips fly), then the flaps.
      return {
        sealT: open ? `${C} translateY(70vh) rotate(38deg) scale(.7)` : p === 1 ? `${C} rotate(-7deg) scale(1.06)` : C,
        burst: recolour(base.burst, [c.accent, '#7a4b2e', '#a8683e']),
        petals: [],
      };
    case 'stamp':
      // Pressed down, then it melts away where it sits.
      return { sealT: open ? `${C} scale(1.5)` : p === 1 ? `${C} scale(.84)` : C, burst: recolour(base.burst, null), petals: [] };
    case 'gatefold':
      // The sides open like doors; top and bottom slip away; the card unfolds from the middle.
      return {
        leftT: open ? 'rotateY(178deg)' : 'rotateY(0deg)',
        rightT: open ? 'rotateY(-178deg)' : 'rotateY(0deg)',
        topT: open ? 'translateY(-105%)' : 'translateY(0)',
        bottomT: open ? 'translateY(105%)' : 'translateY(0)',
        sealT: open ? `${C} scale(.2)` : p === 1 ? `${C} scale(1.15)` : C,
        cardScale: open ? 'scaleX(1)' : 'scaleX(.12)',
        petals: [],
      };
    case 'slide':
      // The top flap lifts, the envelope drops away, and the card slides up out of it.
      return {
        leftT: open ? 'translateY(110%)' : 'translateY(0)',
        rightT: open ? 'translateY(110%)' : 'translateY(0)',
        bottomT: open ? 'translateY(110%)' : 'translateY(0)',
        sealT: open ? `${C} translateY(-70vh) scale(.9)` : p === 1 ? `${C} scale(1.12)` : C,
        cardScale: open ? 'translateY(0)' : 'translateY(65vh)',
        petals: [],
      };
    case 'letterpress':
      // Quiet: nothing flies; the envelope lifts away and the card presses into view.
      return {
        topT: 'rotateX(0deg)',
        leftT: 'rotateY(0deg)',
        rightT: 'rotateY(0deg)',
        bottomT: 'rotateX(0deg)',
        topOp: open ? 0 : 1,
        sealT: open ? `${C} scale(.92)` : p === 1 ? `${C} scale(.96)` : C,
        envZoom: open ? 'scale(1.05)' : 'scale(1)',
        cardScale: open ? 'scale(1)' : 'scale(.95)',
        isP1: false,
        burst: recolour(base.burst, null),
        petals: [],
      };
    case 'ribbon':
      // The ribbon slips away (drawn by the envelope's extras), then the classic opening.
      return { burst: recolour(base.burst, [c.accent, c.soft]) };
    case 'petals':
      return { petals: fall(30, [c.soft, c.accent, c.paper, c.soft], [7, 14], 2.8) };
    case 'confetti':
      return {
        burst: recolour(base.burst, [c.accent, c.soft, c.ink, '#f2c14e', '#e98fa6', '#7cc4c0']),
        petals: fall(36, [c.accent, c.soft, c.ink, '#f2c14e', '#e98fa6', '#7cc4c0'], [6, 9], 2.4, true),
      };
    case 'golddust':
      return {
        burst: recolour(base.burst, ['#fff4d6', '#e7c98c', '#c9a46a', '#f8e7b4']),
        petals: fall(40, ['#e7c98c', '#c9a46a', '#f8e7b4', '#fff4d6'], [3, 5], 3.4, true),
      };
    case 'stars':
      return {
        burst: recolour(base.burst, ['#ffffff', '#e6ebf5', '#c9d2e3']),
        petals: fall(34, ['#ffffff', '#e6ebf5', '#c9d2e3', c.accent], [3, 4], 5.5, true),
      };
  }
}

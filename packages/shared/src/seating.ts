/**
 * Floor-plan geometry shared by the admin's seating designer and each guest's night-before guide.
 * Positions are % of the plan (x of its width, y of its height); `aspect` is the plan's "W / H".
 */

export const TABLE_SHAPES = ['round', 'oval', 'square', 'long', 'head', 'sweetheart'] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

export const SHAPE_LABEL: Record<TableShape, string> = {
  round: 'Round',
  oval: 'Oval',
  square: 'Square',
  long: 'Long banquet',
  head: 'Head table (one side)',
  sweetheart: 'Sweetheart (two)',
};

/** Sensible seats when a table is created or its shape changes. */
export const DEFAULT_SEATS: Record<TableShape, number> = { round: 10, oval: 12, square: 8, long: 16, head: 10, sweetheart: 2 };

/** Shapes with a length (they stretch along a line). */
export const STRETCHES = (s: TableShape) => s === 'long' || s === 'head';

export interface TableGeom {
  shape: TableShape;
  dir: 'h' | 'v';
  len: number;
  x: number;
  y: number;
}

/**
 * The room: its shape ("4 / 3") and, after it, how big it is ("4 / 3 x2": twice the size, so every table is
 * half as big on the plan and twice as many fit). Plain "4 / 3" is the usual size.
 */
export const ROOM_SHAPES: { aspect: string; label: string }[] = [
  { aspect: '1 / 1', label: 'Square' },
  { aspect: '4 / 3', label: 'Standard' },
  { aspect: '16 / 9', label: 'Wide' },
  { aspect: '2 / 1', label: 'Long' },
  { aspect: '3 / 4', label: 'Deep' },
];
export const ROOM_SIZES: { scale: number; label: string }[] = [
  { scale: 1, label: 'Standard (up to about 15 tables)' },
  { scale: 1.5, label: 'Large (about 30 tables)' },
  { scale: 2, label: 'Very large (about 50 tables)' },
  { scale: 3, label: 'Huge (100+ tables)' },
];
const SIZE = /\s*x(\d+(?:\.\d+)?)\s*$/;
/** "4 / 3 x2" -> 2 (1 when not given). */
export const roomScale = (aspect: string) => {
  const n = Number(SIZE.exec(aspect)?.[1] ?? 1);
  return n >= 1 && n <= 4 ? n : 1;
};
/** "4 / 3 x2" -> "4 / 3". */
export const roomShape = (aspect: string) => aspect.replace(SIZE, '').trim() || '4 / 3';
/** The stored room: its shape, plus its size when bigger than usual. */
export const roomAspect = (shape: string, scale: number) => (scale > 1 ? `${roomShape(shape)} x${scale}` : roomShape(shape));
/** For CSS aspect-ratio: "4/3". */
export const cssAspect = (aspect: string) => roomShape(aspect).replace(/\s/g, '');

/** "4 / 3" -> 4/3 (the room's size doesn't change its shape). */
export const aspectRatio = (aspect: string) => {
  const [w, h] = roomShape(aspect).split('/').map((n) => Number(n.trim()));
  return w && h ? w / h : 4 / 3;
};

/**
 * The table's box in % of the plan: width (of plan width) and height (of plan height), and its corner
 * radius. Round and square tables stay round and square whatever the plan's shape.
 */
export function tableBox(t: Pick<TableGeom, 'shape' | 'dir' | 'len'>, aspect: string) {
  const r = aspectRatio(aspect);
  const k = 1 / roomScale(aspect); // a bigger room: every table smaller on the plan
  const thick = 5.5;
  const box = (w: number, h: number, radius: string) => ({ w: w * k, h: h * k, radius });
  switch (t.shape) {
    case 'oval':
      return box(13, 8 * r, '50%');
    case 'square':
      return box(8.5, 8.5 * r, '4px');
    case 'long':
    case 'head':
      return t.dir === 'v' ? box(t.shape === 'head' ? thick - 1 : thick, t.len, '4px') : box(t.len, (t.shape === 'head' ? thick - 1 : thick) * r, '4px');
    case 'sweetheart':
      return box(8, 4.5 * r, '999px 999px 6px 6px');
    default:
      return box(9, 9 * r, '50%');
  }
}

/** Keep the whole table inside the plan. */
export function clampTable<T extends TableGeom>(t: T, aspect: string): T {
  const { w, h } = tableBox(t, aspect);
  const lim = (v: number, half: number) => Math.min(100 - half - 1, Math.max(half + 1, v));
  return { ...t, x: lim(t.x, w / 2), y: lim(t.y, h / 2) };
}

/**
 * Where each chair sits, in % of the table's own box (can go a little outside it, as chairs do).
 * Round/oval: evenly round the edge. Square: round all four sides. Long: both long sides.
 * Head and sweetheart: one side only, facing the room.
 */
export function seatSpots(t: Pick<TableGeom, 'shape' | 'dir'> & { sides?: number }, seats: number): { x: number; y: number }[] {
  const n = Math.max(0, Math.min(60, Math.floor(seats)));
  const along = (count: number, fixed: number, vertical: boolean) =>
    Array.from({ length: count }, (_, i) => {
      const p = ((i + 0.5) / count) * 100;
      return vertical ? { x: fixed, y: p } : { x: p, y: fixed };
    });
  const v = t.dir === 'v';
  switch (t.shape) {
    case 'long': {
      // One side only (a banquet facing the stage), or both.
      if (t.sides === 1) return along(n, v ? -22 : -38, v);
      if (t.sides === -1) return along(n, v ? 122 : 138, v);
      const a = Math.ceil(n / 2);
      return [...along(a, v ? -22 : -38, v), ...along(n - a, v ? 122 : 138, v)];
    }
    case 'head':
    case 'sweetheart':
      return t.sides === -1 ? along(n, v ? 122 : 138, v) : along(n, v ? -22 : -38, v);
    case 'square': {
      const side = [0, 0, 0, 0].map((_, i) => Math.floor(n / 4) + (i < n % 4 ? 1 : 0));
      const [top = 0, right = 0, bottom = 0, left = 0] = side;
      return [...along(top, -16, false), ...along(right, 116, true), ...along(bottom, 116, false).reverse(), ...along(left, -16, true).reverse()];
    }
    default:
      return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return { x: 50 + 62 * Math.cos(a), y: 50 + 62 * Math.sin(a) };
      });
  }
}

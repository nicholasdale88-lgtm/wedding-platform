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
  long: 'Long banquet (both sides)',
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

/** "4 / 3" -> 4/3 */
export const aspectRatio = (aspect: string) => {
  const [w, h] = aspect.split('/').map((n) => Number(n.trim()));
  return w && h ? w / h : 4 / 3;
};

/**
 * The table's box in % of the plan: width (of plan width) and height (of plan height), and its corner
 * radius. Round and square tables stay round and square whatever the plan's shape.
 */
export function tableBox(t: Pick<TableGeom, 'shape' | 'dir' | 'len'>, aspect: string) {
  const r = aspectRatio(aspect);
  const thick = 5.5;
  switch (t.shape) {
    case 'oval':
      return { w: 13, h: 8 * r, radius: '50%' };
    case 'square':
      return { w: 8.5, h: 8.5 * r, radius: '4px' };
    case 'long':
    case 'head':
      return t.dir === 'v' ? { w: t.shape === 'head' ? thick - 1 : thick, h: t.len, radius: '4px' } : { w: t.len, h: (t.shape === 'head' ? thick - 1 : thick) * r, radius: '4px' };
    case 'sweetheart':
      return { w: 8, h: 4.5 * r, radius: '999px 999px 6px 6px' };
    default:
      return { w: 9, h: 9 * r, radius: '50%' };
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
export function seatSpots(t: Pick<TableGeom, 'shape' | 'dir'>, seats: number): { x: number; y: number }[] {
  const n = Math.max(0, Math.min(60, Math.floor(seats)));
  const along = (count: number, fixed: number, vertical: boolean) =>
    Array.from({ length: count }, (_, i) => {
      const p = ((i + 0.5) / count) * 100;
      return vertical ? { x: fixed, y: p } : { x: p, y: fixed };
    });
  const v = t.dir === 'v';
  switch (t.shape) {
    case 'long': {
      const a = Math.ceil(n / 2);
      return [...along(a, v ? -22 : -38, v), ...along(n - a, v ? 122 : 138, v)];
    }
    case 'head':
    case 'sweetheart':
      return along(n, v ? -22 : -38, v);
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

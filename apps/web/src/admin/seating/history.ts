import type { SeatArea, SeatTable } from '../../lib/api';

/** The plan being edited, with undo/redo. A pure reducer: every change is one step back. */
export type Snapshot = { tables: SeatTable[]; areas: SeatArea[]; seats: Record<string, string | null> };
type Hist = { doc: Snapshot; past: Snapshot[]; future: Snapshot[]; dirty: boolean };
type Act =
  | { type: 'reset'; doc: Snapshot }
  | { type: 'change'; fn: (d: Snapshot) => Snapshot; record: boolean }
  | { type: 'checkpoint' }
  | { type: 'undo' }
  | { type: 'redo' };
const MAX_HISTORY = 80;

export function history(h: Hist, a: Act): Hist {
  switch (a.type) {
    case 'reset':
      return { doc: a.doc, past: [], future: [], dirty: false };
    case 'change':
      return { doc: a.fn(h.doc), past: a.record ? [...h.past.slice(-MAX_HISTORY + 1), h.doc] : h.past, future: a.record ? [] : h.future, dirty: true };
    case 'checkpoint':
      return { ...h, past: [...h.past.slice(-MAX_HISTORY + 1), h.doc], future: [] };
    case 'undo':
      return h.past.length ? { doc: h.past[h.past.length - 1]!, past: h.past.slice(0, -1), future: [h.doc, ...h.future], dirty: true } : h;
    case 'redo':
      return h.future.length ? { doc: h.future[0]!, past: [...h.past, h.doc], future: h.future.slice(1), dirty: true } : h;
  }
}
export const emptyHistory: Hist = { doc: { tables: [], areas: [], seats: {} }, past: [], future: [], dirty: false };

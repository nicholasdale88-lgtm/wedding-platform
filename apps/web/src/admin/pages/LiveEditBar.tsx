import type { InvitationContent } from '@wp/shared';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { SECTIONS } from '../../guest/generated/InvitationView.meta';
import { photoData, type ToAdmin, type ToCard } from '../../guest/invitation/LiveEdit';
import { Pill } from '../ui';

/**
 * Setup → Invitation → "Edit on the invitation", like Edit seating: the preview becomes the editor. Words
 * and the photo are changed on the card itself (guest/invitation/LiveEdit); here, beside it: the sections
 * (drag, or the arrows, to reorder; switch on or off), the names' size, a photo to choose, undo and redo,
 * and Done. Every change saves like any other edit in Setup.
 */

/** One step that can be undone: wording, or invitation settings (what they were and what they became). */
export type Step = { kind: 'text'; key: string; from: string; to: string } | { kind: 'inv'; from: Partial<InvitationContent>; to: Partial<InvitationContent>; tag?: string };

/** Undo and redo over steps; a run of the same slider's changes is one step. */
export function makeHistory() {
  const done: Step[] = [];
  const undone: Step[] = [];
  return {
    push(s: Step) {
      const last = done[done.length - 1];
      if (s.kind === 'inv' && s.tag && last?.kind === 'inv' && last.tag === s.tag) last.to = s.to;
      else done.push(s);
      undone.length = 0;
    },
    undo: () => {
      const s = done.pop();
      if (s) undone.push(s);
      return s;
    },
    redo: () => {
      const s = undone.pop();
      if (s) done.push(s);
      return s;
    },
    get canUndo() {
      return done.length > 0;
    },
    get canRedo() {
      return undone.length > 0;
    },
  };
}

/** The empty value of each setting the editor changes. */
const EMPTY: Record<string, unknown> = { order: [], images: {}, hidden: {}, custom: {} };

/** The welcome and the RSVP are the invitation itself: they can't be switched off. */
const ALWAYS_ON = /^\d+\w?\s+(welcome|rsvp)$/i;
const sectionName = (s: string) => s.replace(/^\d+\w?\s+/, '');
/** The sections in the couple's order: theirs first (known ones only), then any they haven't placed. */
export const orderOf = (order: string[] | undefined) => {
  const known = (order ?? []).filter((s) => SECTIONS.includes(s));
  return [...known, ...SECTIONS.filter((s) => !known.includes(s))];
};
export const move = <T,>(xs: T[], from: number, to: number) => {
  const out = [...xs];
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x!);
  return out;
};

export function LiveEditBar({
  inv,
  texts,
  original,
  setInv,
  setText,
  onDone,
}: {
  inv: InvitationContent;
  texts: Record<string, string>;
  original: Record<string, string>;
  setInv: (p: Partial<InvitationContent>) => void;
  setText: (key: string, value: string) => void;
  onDone: () => void;
}) {
  const steps = useRef(makeHistory());
  const [, redraw] = useState(0);
  const card = useRef<MessageEventSource | null>(null);
  const latest = useRef({ inv, texts });
  latest.current = { inv, texts };

  const record = useCallback((s: Step) => {
    steps.current.push(s);
    redraw((n) => n + 1);
  }, []);
  const changeInv = useCallback(
    (to: Partial<InvitationContent>, tag?: string) => {
      const now = latest.current.inv as Record<string, unknown>;
      // Something never set goes back to empty (a saved page only takes values, so undefined would undo nothing).
      const from = Object.fromEntries(Object.keys(to).map((k) => [k, now[k] ?? EMPTY[k]])) as Partial<InvitationContent>;
      record({ kind: 'inv', from, to, tag });
      setInv(to);
    },
    [record, setInv],
  );
  const apply = (s: Step | undefined, back: boolean) => {
    if (!s) return;
    if (s.kind === 'text') setText(s.key, back ? s.from : s.to);
    else setInv(back ? s.from : s.to);
    redraw((n) => n + 1);
  };
  const undo = () => apply(steps.current.undo(), true);
  const redo = () => apply(steps.current.redo(), false);

  // The card asks for the state when it loads, and sends each change made on it.
  useEffect(() => {
    const hear = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const m = e.data as ToAdmin | undefined;
      if (m?.wp !== 'inv-edit') return;
      card.current = e.source;
      if (m.kind === 'ready') {
        const state: ToCard = { wp: 'inv-live', state: { texts: latest.current.texts, invitation: latest.current.inv as Record<string, unknown> } };
        (e.source as Window | null)?.postMessage(state, window.location.origin);
      } else if (m.kind === 'text' && typeof m.key === 'string' && typeof m.value === 'string') {
        const from = latest.current.texts[m.key] ?? original[m.key] ?? '';
        if (from === m.value) return;
        record({ kind: 'text', key: m.key, from, to: m.value });
        setText(m.key, m.value.slice(0, 4000));
      } else if (m.kind === 'image' && typeof m.slot === 'string' && typeof m.value === 'string') {
        changeInv({ images: { ...latest.current.inv.images, [m.slot]: m.value } });
      }
    };
    window.addEventListener('message', hear);
    return () => window.removeEventListener('message', hear);
  }, [changeInv, original, record, setText]);
  // Every change (here, on the card, undo or redo) goes back to the card, so it shows exactly what's saved.
  const stateKey = JSON.stringify([inv, texts]);
  useEffect(() => {
    const state: ToCard = { wp: 'inv-live', state: { texts, invitation: inv as Record<string, unknown> } };
    (card.current as Window | null)?.postMessage(state, window.location.origin);
  }, [stateKey]);
  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, as in seating (not while typing in a box).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // ---------------------------------------------------------------- sections: drag (mouse or finger), arrows, switches
  const order = orderOf(inv.order);
  const list = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= order.length) return;
    changeInv({ order: move(order, from, to) });
  };
  const overIndex = (y: number) => {
    const rows = Array.from(list.current?.children ?? []) as HTMLElement[];
    const i = rows.findIndex((r) => y < r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2);
    return i < 0 ? rows.length - 1 : i;
  };
  const grab = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ from: i, over: i });
  };
  const slide = (e: ReactPointerEvent<HTMLButtonElement>) => drag && setDrag({ ...drag, over: overIndex(e.clientY) });
  const drop = () => {
    if (drag) reorder(drag.from, drag.over);
    setDrag(null);
  };

  const size = inv.custom?.nameSize ?? 1;
  const chooser = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const choosePhoto = async (f: File | undefined) => {
    if (!f) return;
    const data = await photoData(f);
    if (!data) return setNote('That photo couldn’t be used. Try a JPEG or PNG.');
    setNote('');
    changeInv({ images: { ...inv.images, lookout: data } });
  };

  return (
    <div role="region" aria-label="Edit on the invitation" className="flex flex-col gap-3 p-3 rounded-[14px] border border-[#b39563] bg-[#fbf3e1]">
      <div className="flex gap-2 flex-wrap items-center">
        <Pill size="sm" onClick={undo} disabled={!steps.current.canUndo} aria-label="Undo">
          ↶ Undo
        </Pill>
        <Pill size="sm" onClick={redo} disabled={!steps.current.canRedo} aria-label="Redo">
          ↷ Redo
        </Pill>
        <Pill size="sm" kind="primary" onClick={onDone} className="ml-auto">
          Done editing
        </Pill>
      </div>
      <p className="m-0 text-[13px] text-[var(--adm-muted,#5b6a52)]">Tap any words on the card to change them, or drop a photo onto its photo. Words you’ve written stay yours: only what you change here changes.</p>

      <label className="flex items-center gap-3 text-[13px] text-[var(--adm-ink,#33402f)]">
        Names size
        <input
          type="range"
          min={0.7}
          max={1.4}
          step={0.05}
          value={size}
          aria-valuetext={`${Math.round(size * 100)}%`}
          onChange={(e) => changeInv({ custom: { ...inv.custom, nameSize: Number(e.target.value) } }, 'nameSize')}
          className="flex-1 accent-[#5d6b47]"
        />
        <span className="w-10 text-right tabular-nums">{Math.round(size * 100)}%</span>
      </label>

      <div className="flex gap-2 items-center flex-wrap text-[13px]">
        <Pill size="sm" kind="dashed" onClick={() => chooser.current?.click()}>
          Choose a photo
        </Pill>
        <input
          ref={chooser}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void choosePhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {note && <span role="alert" className="text-[#7a4a37]">{note}</span>}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-[var(--adm-ink,#33402f)]">Sections: drag to reorder, switch off what you don’t need</span>
        <ol ref={list} aria-label="Sections" className="m-0 p-0 list-none flex flex-col gap-1">
          {order.map((s, i) => {
            const on = !inv.hidden?.[s];
            const fixed = ALWAYS_ON.test(s);
            const lifted = drag?.from === i;
            const target = drag && drag.over === i && drag.from !== i;
            return (
              <li
                key={s}
                className={`flex items-center gap-2 py-1 px-2 rounded-[10px] border bg-white ${lifted ? 'opacity-60 border-[#b39563]' : target ? 'border-[#33402f]' : 'border-[var(--adm-line,#e2d7bc)]'}`}
              >
                <button
                  type="button"
                  aria-label={`Drag ${sectionName(s)}`}
                  onPointerDown={grab(i)}
                  onPointerMove={slide}
                  onPointerUp={drop}
                  onPointerCancel={() => setDrag(null)}
                  className="w-8 h-8 rounded-[8px] border-0 bg-transparent text-[18px] cursor-grab touch-none select-none"
                >
                  ⠿
                </button>
                <span className={`flex-1 text-[14px] ${on ? '' : 'line-through opacity-60'}`}>{sectionName(s)}</span>
                <button type="button" aria-label={`Move ${sectionName(s)} up`} disabled={i === 0} onClick={() => reorder(i, i - 1)} className="w-8 h-8 rounded-full border border-[var(--adm-line,#d3c6a4)] bg-transparent cursor-pointer disabled:opacity-40">
                  ↑
                </button>
                <button type="button" aria-label={`Move ${sectionName(s)} down`} disabled={i === order.length - 1} onClick={() => reorder(i, i + 1)} className="w-8 h-8 rounded-full border border-[var(--adm-line,#d3c6a4)] bg-transparent cursor-pointer disabled:opacity-40">
                  ↓
                </button>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`Show ${sectionName(s)}`}
                  checked={on}
                  disabled={fixed}
                  onChange={() => changeInv({ hidden: { ...inv.hidden, [s]: on } })}
                  className="w-[20px] h-[20px] accent-[#5d6b47]"
                />
              </li>
            );
          })}
        </ol>
        {inv.order?.length ? (
          <button type="button" onClick={() => changeInv({ order: [] })} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#7a4a37]">
            Back to the design’s order
          </button>
        ) : null}
      </div>
    </div>
  );
}

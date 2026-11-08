import { PHOTO_MAX } from '@wp/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SECTIONS } from '../generated/InvitationView.meta';

/**
 * Editing on the invitation itself (Setup → "Edit on the invitation"). The admin's preview opens the page
 * with &edit=1: then every piece of wording can be tapped (or reached with Tab and Enter) and changed in
 * place, and a photo can be dropped (or chosen) onto the card's photo. Nothing is saved here: each change
 * goes to the admin page (postMessage, same site only), which saves it, keeps undo and redo, and sends the
 * whole state back so the card always shows exactly what's saved.
 *
 * Finding which words were tapped without changing the generated page: while editing, each piece of
 * wording carries an invisible mark (zero-width characters spelling its number), read back from the text
 * under the finger.
 */

/** What the admin sends: the couple's wording and invitation settings as they are now. */
export interface LiveState {
  texts: Record<string, string>;
  invitation: Record<string, unknown>;
}
export type ToAdmin = { wp: 'inv-edit'; kind: 'ready' } | { wp: 'inv-edit'; kind: 'text'; key: string; value: string } | { wp: 'inv-edit'; kind: 'image'; slot: string; value: string };
export type ToCard = { wp: 'inv-live'; state: LiveState };

const B0 = '​';
const B1 = '‌';
const EDGE = '⁠';
const MARK = /⁠([​‌]+)⁠/;
/** The invisible mark for the n-th piece of wording. */
export const markOf = (n: number) => `${EDGE}${n.toString(2).replace(/0/g, B0).replace(/1/g, B1)}${EDGE}`;
/** The number in the first mark in a piece of text, if any. */
export function readMark(s: string): number | null {
  const m = MARK.exec(s);
  return m ? parseInt(m[1]!.replace(new RegExp(B0, 'g'), '0').replace(new RegExp(B1, 'g'), '1'), 2) : null;
}
/** Text without its marks (what to show in the editor). */
export const unmark = (s: string) => s.replace(/⁠[​‌]+⁠/g, '');

/** Wording lookup that marks each piece with its key's number (keys numbered as they're first asked for). */
export function markedT(t: (k: string) => string, keys: string[]): (k: string) => string {
  return (k) => {
    let n = keys.indexOf(k);
    if (n < 0) n = keys.push(k) - 1;
    const s = t(k);
    return s ? `${markOf(n)}${s}` : s;
  };
}

/** The CSS that puts the sections in the couple's order (none when they keep the design's). Only known section names. */
export function orderCss(order: string[] | undefined): string {
  const known = (order ?? []).filter((s) => SECTIONS.includes(s));
  if (!known.length) return '';
  const all = [...known, ...SECTIONS.filter((s) => !known.includes(s))];
  const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `#inv-scroll{display:flex;flex-direction:column}#inv-scroll>*{order:999}${all.map((s, i) => `#inv-scroll>section[data-screen-label="${q(s)}"]{order:${i + 1}}`).join('')}`;
}

/** A photo made small enough to keep with the invitation: at most 900px across, JPEG, under PHOTO_MAX. */
export async function photoData(file: Blob): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = no;
      i.src = src;
    });
    for (const [px, q] of [
      [900, 0.8],
      [900, 0.65],
      [720, 0.6],
      [560, 0.55],
      [420, 0.5],
    ] as const) {
      const k = Math.min(1, px / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d');
      if (!g) return null;
      g.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', q);
      if (out.length <= PHOTO_MAX && out.startsWith('data:image/jpeg')) return out;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(src);
  }
}

const toAdmin = (m: ToAdmin) => window.parent?.postMessage(m, window.location.origin);
/** The photo slot an image on the card shows ("…#wp-slot=lookout" while editing). */
const slotOf = (el: Element | null) => (el instanceof HTMLImageElement ? /#wp-slot=([\w-]+)$/.exec(el.getAttribute('src') ?? '')?.[1] : undefined);

/** The admin's latest state for the card (null until it arrives). */
export function useLiveState(on: boolean): [LiveState | null, (s: LiveState) => void] {
  const [live, setLive] = useState<LiveState | null>(null);
  useEffect(() => {
    if (!on) return;
    const hear = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const m = e.data as ToCard | undefined;
      if (m?.wp === 'inv-live' && m.state) setLive(m.state);
    };
    window.addEventListener('message', hear);
    toAdmin({ wp: 'inv-edit', kind: 'ready' });
    return () => window.removeEventListener('message', hear);
  }, [on]);
  return [live, setLive];
}

/** The editing layer on the card: tap or Enter on words to change them; drop or tap a photo to replace it. */
export function LiveEditor({ keys, text, onText }: { keys: string[]; text: (k: string) => string; onText: (k: string, v: string) => void }) {
  const [open, setOpen] = useState<{ key: string; value: string } | null>(null);
  const [note, setNote] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const slot = useRef('');
  const panel = useRef<HTMLDivElement>(null);

  const edit = useCallback(
    (n: number | null) => {
      const key = n === null ? undefined : keys[n];
      if (key) setOpen({ key, value: unmark(text(key)) });
    },
    [keys, text],
  );
  const photo = useCallback(async (file: Blob | undefined, at: string) => {
    if (!file) return;
    setNote('Getting your photo ready…');
    const data = await photoData(file);
    if (!data) return setNote('That photo couldn’t be used. Try a JPEG or PNG.');
    toAdmin({ wp: 'inv-edit', kind: 'image', slot: at, value: data });
    setNote('');
  }, []);

  useEffect(() => {
    const inPanel = (el: EventTarget | null) => el instanceof Node && !!panel.current?.contains(el);
    // Every tap on the card edits instead of acting (no RSVP sent, no links followed).
    const tap = (e: MouseEvent) => {
      if (inPanel(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as Element | null;
      const at = slotOf(target);
      if (at) {
        slot.current = at;
        picker.current?.click();
        return;
      }
      // The words right under the finger, else the first in what was tapped.
      const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null };
      const node = doc.caretPositionFromPoint?.(e.clientX, e.clientY)?.offsetNode ?? document.caretRangeFromPoint?.(e.clientX, e.clientY)?.startContainer;
      const n = (node?.nodeType === Node.TEXT_NODE ? readMark(node.textContent ?? '') : null) ?? readMark(target?.textContent ?? '');
      edit(n);
    };
    const key = (e: KeyboardEvent) => {
      if (inPanel(e.target)) return;
      const el = e.target as HTMLElement | null;
      if ((e.key === 'Enter' || e.key === ' ') && el?.dataset.wpEdit !== undefined) {
        e.preventDefault();
        edit(Number(el.dataset.wpEdit));
      }
    };
    const over = (e: DragEvent) => {
      if (slotOf(e.target as Element)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const at = slotOf(e.target as Element);
      if (!at) return;
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) return void photo(file, at);
      const link = (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '').split('\n')[0]!.trim();
      if (/^https:\/\/\S+$/.test(link) && link.length <= 500) toAdmin({ wp: 'inv-edit', kind: 'image', slot: at, value: link });
    };
    document.addEventListener('click', tap, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('dragover', over, true);
    document.addEventListener('drop', drop, true);
    return () => {
      document.removeEventListener('click', tap, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('dragover', over, true);
      document.removeEventListener('drop', drop, true);
    };
  }, [edit, photo]);

  // Each piece of wording can be reached with the keyboard: its element is focusable and says what it is.
  useEffect(() => {
    const root = document.getElementById('inv-scroll');
    if (!root) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const i = readMark(n.textContent ?? '');
      const el = n.parentElement;
      if (i === null || !el || el.dataset.wpEdit !== undefined) continue;
      el.dataset.wpEdit = String(i);
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Change: ${unmark(n.textContent ?? '').trim().slice(0, 60)}`);
    }
  });
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  const save = () => {
    if (!open) return;
    onText(open.key, open.value);
    toAdmin({ wp: 'inv-edit', kind: 'text', key: open.key, value: open.value });
    setOpen(null);
  };
  return (
    <>
      <style>{`[data-wp-edit]{outline:1px dashed rgba(120,100,60,.45);outline-offset:3px;cursor:text}[data-wp-edit]:hover,[data-wp-edit]:focus-visible{outline:2px solid #b39563}img[src*="#wp-slot="]{outline:2px dashed #b39563;outline-offset:-6px;cursor:copy}`}</style>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void photo(e.target.files?.[0], slot.current);
          e.target.value = '';
        }}
      />
      <div ref={panel} className="fixed z-[80] inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] mx-auto max-w-[520px] font-sans">
        {open ? (
          <div role="dialog" aria-label="Change the words" className="flex flex-col gap-2 p-3 rounded-[16px] bg-[#fbf8f2] text-[#33402f] shadow-[0_12px_30px_rgba(0,0,0,.3)] border border-[#d3c6a4]">
            <label className="flex flex-col gap-1 text-[13px]">
              Change the words
              <textarea
                ref={box}
                rows={Math.min(5, Math.max(2, Math.ceil(open.value.length / 50)))}
                value={open.value}
                onChange={(e) => setOpen({ ...open, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(null);
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
                }}
                className="py-2 px-3 border border-[#d3c6a4] rounded-[10px] bg-white text-[16px]"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setOpen(null)} className="py-2 px-4 rounded-full border border-[#c6b794] bg-transparent text-[14px] cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={save} className="py-2 px-4 rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[14px] cursor-pointer">
                Save
              </button>
            </div>
          </div>
        ) : (
          <p role="status" className="m-0 py-2 px-4 rounded-full bg-[#33402f] text-[#fbf8f2] text-[13px] text-center shadow-[0_6px_18px_rgba(0,0,0,.25)]">
            {note || 'Editing: tap any words to change them. Drop or tap a photo to replace it.'}
          </p>
        )}
      </div>
    </>
  );
}

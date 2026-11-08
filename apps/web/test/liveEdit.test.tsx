import { InvitationContent } from '@wp/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveEditBar, makeHistory, move, orderOf } from '../src/admin/pages/LiveEditBar';
import { SECTIONS } from '../src/guest/generated/InvitationView.meta';
import { markedT, markOf, orderCss, readMark, unmark } from '../src/guest/invitation/LiveEdit';
import { themeOf } from '../src/guest/themeKit';

describe('editing on the invitation: finding the words', () => {
  it('each piece of wording carries an invisible mark that reads back to its key', () => {
    for (const n of [0, 1, 7, 300, 1023]) expect(readMark(`x${markOf(n)}Hello`)).toBe(n);
    const keys: string[] = [];
    const t = markedT((k) => ({ 'inv.a': 'Will you join us?', 'inv.b': 'Kindly reply' })[k] ?? '', keys);
    const a = t('inv.a');
    const b = t('inv.b');
    expect(unmark(a)).toBe('Will you join us?');
    expect(keys[readMark(a)!]).toBe('inv.a');
    expect(keys[readMark(b)!]).toBe('inv.b');
    expect(t('inv.missing')).toBe(''); // nothing to show, nothing marked
    expect(readMark('plain words')).toBeNull();
  });
});

describe('sections in the couple’s order', () => {
  it('the design’s order by default (no CSS at all, so nothing in the layout changes)', () => {
    expect(orderCss(undefined)).toBe('');
    expect(orderCss([])).toBe('');
    expect(orderCss(['Not a section'])).toBe('');
    expect(orderOf(undefined)).toEqual(SECTIONS);
  });
  it('their order first, the rest after; only known sections', () => {
    const o = orderOf(['11 FAQ', 'bogus', '01 Welcome']);
    expect(o.slice(0, 2)).toEqual(['11 FAQ', '01 Welcome']);
    expect(o).toHaveLength(SECTIONS.length);
    const css = orderCss(['11 FAQ', '01 Welcome']);
    expect(css).toContain('section[data-screen-label="11 FAQ"]{order:1}');
    expect(css).not.toContain('bogus');
    expect(move(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });
  it('saves as part of the invitation', () => {
    expect(InvitationContent.safeParse({ order: orderOf(undefined), custom: { nameSize: 1.2 } }).success).toBe(true);
    expect(InvitationContent.safeParse({ custom: { nameSize: 3 } }).success).toBe(false);
    expect(InvitationContent.safeParse({ images: { lookout: 'data:image/jpeg;base64,AAAA' } }).success).toBe(true);
    expect(InvitationContent.safeParse({ images: { lookout: 'data:text/html;base64,AAAA' } }).success).toBe(false);
  });
  it('the names size scales the style’s own size', () => {
    expect(themeOf('Cream & Sage', { nameSize: 1.2 }).nsz).toBe('calc(clamp(38px,10.5vw,50px) * 1.2)');
    expect(themeOf('Cream & Sage', { nameSize: 1 }).nsz).toBeUndefined();
  });
});

describe('undo and redo', () => {
  it('a run of one slider is one step; undo then redo', () => {
    const h = makeHistory();
    h.push({ kind: 'inv', from: { custom: {} }, to: { custom: { nameSize: 1.1 } }, tag: 'nameSize' });
    h.push({ kind: 'inv', from: { custom: { nameSize: 1.1 } }, to: { custom: { nameSize: 1.2 } }, tag: 'nameSize' });
    const s = h.undo();
    expect(s).toMatchObject({ from: { custom: {} }, to: { custom: { nameSize: 1.2 } } });
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toBe(s);
  });

  it('the bar: reorder with the arrows, switch a part off, undo puts it back', () => {
    const setInv = vi.fn();
    const props = { texts: {}, original: {}, setText: vi.fn(), onDone: vi.fn(), setInv };
    const { rerender } = render(<LiveEditBar inv={{}} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Countdown up' }));
    expect(setInv).toHaveBeenLastCalledWith({ order: move(SECTIONS, 1, 0) });
    rerender(<LiveEditBar inv={{ order: move(SECTIONS, 1, 0) }} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(setInv).toHaveBeenLastCalledWith({ order: [] }); // never set before: back to the design's order
    expect(screen.getByRole('switch', { name: 'Show Welcome' })).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Show FAQ' }));
    expect(setInv).toHaveBeenLastCalledWith({ hidden: { '11 FAQ': true } });
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    expect(props.onDone).toHaveBeenCalled();
  });
});

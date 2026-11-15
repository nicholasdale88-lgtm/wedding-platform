import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatThread } from '../src/lib/ChatThread';

const real = Element.prototype.scrollIntoView;
afterEach(() => {
  Element.prototype.scrollIntoView = real;
});

describe('a conversation between a vendor and a couple', () => {
  // Newer Chrome returns a promise from scrollIntoView; an effect returning it crashed the page.
  it('keeps working when scrolling returns a promise, as new messages arrive and when it closes', () => {
    Element.prototype.scrollIntoView = (() => Promise.resolve()) as unknown as typeof real;
    const m = (id: string, fromVendor: boolean, body: string) => ({ id, fromVendor, body, at: '2026-11-15T01:00:00.000Z', read: true });
    const send = async () => {};
    const { rerender, unmount } = render(<ChatThread messages={[m('1', true, 'Hello')]} mine="couple" other="Bloom" onSend={send} empty="None" />);
    rerender(<ChatThread messages={[m('1', true, 'Hello'), m('2', false, 'Hi!')]} mine="couple" other="Bloom" onSend={send} empty="None" />);
    expect(screen.getByRole('log', { name: 'Messages with Bloom' })).toHaveTextContent('Hi!');
    expect(() => unmount()).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { assistantActions } from '../src/assistant';

describe('the assistant’s buttons', () => {
  it('takes the buttons off the end of the answer', () => {
    const r = assistantActions('Six guests haven’t replied yet.\n\n[[open:texts]]\n[[todo:Send a reminder to the six]]');
    expect(r.answer).toBe('Six guests haven’t replied yet.');
    expect(r.actions).toEqual([
      { kind: 'open', screen: 'texts', label: 'Texts' },
      { kind: 'todo', text: 'Send a reminder to the six' },
    ]);
  });

  it('drops screens that don’t exist, repeats, and anything past two', () => {
    const r = assistantActions('Hi [[open:admin]] [[open:Guests]] [[open:guests]] [[todo:A]] [[todo:Book the cake]] [[todo:Book the band]]');
    expect(r.actions).toEqual([
      { kind: 'open', screen: 'guests', label: 'Guest list' },
      { kind: 'todo', text: 'Book the cake' },
    ]);
    expect(r.answer).toBe('Hi');
  });

  it('an answer with no buttons is left as it is', () => {
    expect(assistantActions('Just words.')).toEqual({ answer: 'Just words.', actions: [] });
  });
});

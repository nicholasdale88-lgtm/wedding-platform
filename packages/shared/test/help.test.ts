import { describe, expect, it } from 'vitest';
import { HELP, searchHelp } from '../src/help';

/** Help: the guides answer what people ask, in their words. */
describe('help', () => {
  it('finds the right guide for everyday questions', () => {
    expect(searchHelp('how do I send reminders')[0]?.id).toBe('invitations');
    expect(searchHelp('seating versions')[0]?.id).toBe('seating');
    expect(searchHelp('compare quotes from florists')[0]?.id).toBe('quotes');
    expect(searchHelp('where are our backups')[0]?.id).toBe('backup');
    expect(searchHelp('bridesmaids sign in')[0]?.id).toBe('party');
    expect(searchHelp('xyzzy')).toEqual([]);
  });

  it('every guide has steps and somewhere to go', () => {
    const ids = new Set(HELP.map((a) => a.id));
    expect(ids.size).toBe(HELP.length);
    for (const a of HELP) {
      expect(a.steps.length).toBeGreaterThan(0);
      expect(a.go.tab).toMatch(/^[a-z]+$/);
    }
  });
});

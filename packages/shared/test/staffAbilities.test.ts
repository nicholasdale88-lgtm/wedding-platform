import { describe, expect, it } from 'vitest';
import { STAFF_ABILITIES, STAFF_ABILITY_KEYS, STAFF_CAN, staffPermsOf, withAbilities } from '../src/company';

/** Fine permissions: the things within each part of the portal, on by default, switched off per made role. */
describe('staff abilities', () => {
  it('built-in roles keep everything within their parts', () => {
    const owner = staffPermsOf('owner', []);
    for (const a of STAFF_ABILITY_KEYS) expect(owner).toContain(a);
    const support = staffPermsOf('support', []);
    expect(support).toContain('couples.links');
    expect(support).toContain('feedback.reply');
    expect(support).not.toContain('money.refund');
    // Every ability belongs to a real part.
    for (const a of STAFF_ABILITY_KEYS) expect(STAFF_CAN.owner).toContain(STAFF_ABILITIES[a].area);
  });

  it('a made role can switch one thing off, and never reaches a part it was not given', () => {
    const books = { id: 'books', name: 'Bookkeeper', does: '', perms: ['money', 'activity'] as const, deny: ['money.refund'] as const };
    const perms = staffPermsOf('custom:books', [{ ...books, perms: [...books.perms], deny: [...books.deny] }]);
    expect(perms).toEqual(['money', 'activity', 'money.paid', 'money.books']);
    expect(withAbilities(['feedback'], ['money.paid'])).toEqual(['feedback', 'feedback.reply']);
    // Older saved roles (no deny list) get everything within their parts.
    expect(staffPermsOf('custom:old', [{ id: 'old', name: 'Old', does: '', perms: ['promote'], deny: [] }])).toEqual(['promote', 'promote.codes', 'promote.list']);
  });
});

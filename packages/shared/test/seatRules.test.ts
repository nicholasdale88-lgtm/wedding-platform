import { describe, expect, it } from 'vitest';
import { SeatRules } from '../src/planner';
import { autoSeat, seatProblems, type RulePerson, type RuleTable } from '../src/seatRules';

const person = (id: string, inv: string, party = '', role = '', coming = true): RulePerson => ({ id, invitationId: inv, name: `${id[0]!.toUpperCase()}${id.slice(1)} Smith`, party, role, coming });
const table = (id: string, seats: number, shape = 'round', name = id): RuleTable => ({ id, name, seats, shape });
const rules = (r: Partial<SeatRules> = {}) => SeatRules.parse(r);
const together = (seats: Record<string, string | null>, ids: string[]) => new Set(ids.map((id) => seats[id])).size === 1;

describe('seating rules', () => {
  it('old rule docs get every preset on', () => {
    expect(SeatRules.parse({ pairs: [] }).presets).toEqual({ invite: true, groups: true, head: true, fill: true });
  });

  it('people invited together sit together; someone who said no is never seated', () => {
    const people = [person('ann', 'g1'), person('bob', 'g1'), person('cat', 'g2'), person('dan', 'g2'), person('eve', 'g3', '', '', false)];
    const r = autoSeat(people, [table('t1', 3), table('t2', 3)], {}, rules());
    expect(together(r.seats, ['ann', 'bob'])).toBe(true);
    expect(together(r.seats, ['cat', 'dan'])).toBe(true);
    expect(r.seats.eve).toBeNull();
    expect(r).toMatchObject({ seated: 4, left: 0 });
  });

  it('someone joining a seated partner goes to their table', () => {
    const people = [person('ann', 'g1'), person('bob', 'g1'), person('cat', 'g2')];
    const r = autoSeat(people, [table('t1', 4), table('t2', 4)], { ann: 't2' }, rules());
    expect(r.seats.bob).toBe('t2');
    expect(r.seats.ann).toBe('t2'); // seats already given are kept
  });

  it('never seats people you keep apart at one table, and keeps "with" pairs together', () => {
    const people = [person('ann', 'g1'), person('bob', 'g2'), person('cat', 'g3'), person('dan', 'g4')];
    const r = autoSeat(people, [table('t1', 4), table('t2', 4)], {}, rules({ pairs: [{ a: 'ann', b: 'bob', kind: 'apart' }, { a: 'cat', b: 'dan', kind: 'together' }] }));
    expect(r.seats.ann).not.toBe(r.seats.bob);
    expect(r.seats.cat).toBe(r.seats.dan);
    expect(seatProblems(people, [table('t1', 4), table('t2', 4)], r.seats, rules({ pairs: [{ a: 'ann', b: 'bob', kind: 'apart' }] }))).toEqual([]);
  });

  it('the wedding party goes to the head table, and other guests stay off it', () => {
    const people = [person('ann', 'g1', '', 'Bridesmaid'), person('bob', 'g2', '', 'Best man'), person('cat', 'g3'), person('dan', 'g4')];
    const tables = [table('t1', 10), table('head', 6, 'head', 'Head table')];
    const r = autoSeat(people, tables, {}, rules());
    expect([r.seats.ann, r.seats.bob]).toEqual(['head', 'head']);
    expect([r.seats.cat, r.seats.dan]).toEqual(['t1', 't1']);
    // Off: anyone anywhere, and no check for it.
    const moved = { ...r.seats, ann: 't1' };
    expect(seatProblems(people, tables, moved, rules())).toEqual(['Ann is in the wedding party but not at the head table.']);
    expect(seatProblems(people, tables, moved, rules({ presets: { invite: true, groups: true, head: false, fill: true } }))).toEqual([]);
  });

  it('groups stay at their tables, so nobody is the only one they know', () => {
    const people = [
      ...['a1', 'a2', 'a3'].map((id, i) => person(id, `ga${i}`, 'Uni friends')),
      ...['b1', 'b2', 'b3'].map((id, i) => person(id, `gb${i}`, 'Work')),
    ];
    const tables = [table('t1', 4), table('t2', 4)];
    const r = autoSeat(people, tables, {}, rules());
    expect(together(r.seats, ['a1', 'a2', 'a3'])).toBe(true);
    expect(together(r.seats, ['b1', 'b2', 'b3'])).toBe(true);
    expect(seatProblems(people, tables, { ...r.seats, a3: r.seats.b1! }, rules())).toEqual([`A3 is the only one from Uni friends at Table ${r.seats.b1}.`.replace('Table t', 't')]);
  });

  it('says what it could not do: no seats, or a family too big for any table', () => {
    const people = [person('ann', 'g1'), person('bob', 'g1'), person('cat', 'g1'), person('dan', 'g2')];
    const r = autoSeat(people, [table('t1', 2), table('t2', 1)], {}, rules());
    expect(r.left).toBe(1);
    expect(r.notes.join(' ')).toMatch(/split up/);
    expect(r.notes.join(' ')).toMatch(/1 still needs a seat/);
  });

  it('a "with" pair that would seat someone beside a person they are kept apart from is refused and said', () => {
    const people = [person('ann', 'g1'), person('bob', 'g1'), person('cat', 'g2')];
    const r = autoSeat(people, [table('t1', 3), table('t2', 3)], {}, rules({ pairs: [{ a: 'bob', b: 'cat', kind: 'apart' }, { a: 'ann', b: 'cat', kind: 'together' }] }));
    expect(r.seats.bob).not.toBe(r.seats.cat);
    expect(r.notes[0]).toMatch(/kept apart/);
  });

  it('stress: 300 guests in 140 invitations, 12 groups, 40 apart and 30 together rules, over and over: no rule ever breaks when there is room', () => {
    let seed = 11;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    for (let run = 0; run < 25; run++) {
      const people: RulePerson[] = [];
      for (let g = 0; people.length < 300; g++) {
        const size = 1 + rnd(4);
        const party = rnd(5) ? `Group ${rnd(12)}` : '';
        for (let k = 0; k < size; k++) people.push(person(`p${people.length}x`, `g${g}`, party, rnd(40) ? '' : 'Groomsman', rnd(10) > 0));
      }
      const coming = people.filter((p) => p.coming);
      const pairs: SeatRules['pairs'] = [];
      for (let i = 0; i < 40; i++) {
        const a = coming[rnd(coming.length)]!;
        const b = coming[rnd(coming.length)]!;
        if (a.invitationId !== b.invitationId) pairs.push({ a: a.id, b: b.id, kind: 'apart' });
      }
      for (let i = 0; i < 30; i++) {
        const a = coming[rnd(coming.length)]!;
        const b = coming[rnd(coming.length)]!;
        if (a.id !== b.id) pairs.push({ a: a.id, b: b.id, kind: 'together' });
      }
      const tables = [table('head', 14, 'head', 'Head table'), ...Array.from({ length: 32 }, (_, i) => table(`t${i}`, 10))]; // room to spare
      const rs = rules({ pairs });
      const r = autoSeat(people, tables, {}, rs);
      // Everyone who said yes is seated, nobody who didn't, and no table is over.
      expect(r.left).toBe(0);
      for (const p of people) expect(!!r.seats[p.id]).toBe(p.coming);
      for (const t of tables) expect(Object.values(r.seats).filter((x) => x === t.id).length).toBeLessThanOrEqual(t.seats);
      // Apart rules: never at one table. Invitations: together, unless a rule made that impossible.
      for (const x of pairs.filter((q) => q.kind === 'apart')) expect(r.seats[x.a]).not.toBe(r.seats[x.b]);
      const problems = seatProblems(people, tables, r.seats, rs);
      expect(problems.filter((m) => /seats\.$|keep them apart\)/.test(m))).toEqual([]);
      const invProblems = problems.filter((m) => /invited together/.test(m)).length;
      expect(invProblems).toBeLessThanOrEqual(r.notes.length);
      // And auto-seat again changes nothing: everyone keeps their seat.
      expect(autoSeat(people, tables, r.seats, rs).seats).toEqual(r.seats);
    }
  });
});

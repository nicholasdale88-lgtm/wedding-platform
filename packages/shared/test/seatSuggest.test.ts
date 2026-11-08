import { describe, expect, it } from 'vitest';
import { cleanCircles, joinCircles, KNOWS_NO_ONE, parseCircles, parseRelation, parseSide, sideLabels, splitCircles } from '../src/guestTies';
import { SeatRules } from '../src/planner';
import { seatProblems, tableNeighbours, type RulePerson, type RuleTable } from '../src/seatRules';
import { compareLine, planSummary, suggestName, suggestSeating } from '../src/seatSuggest';

const P = (id: string, inv: string, o: Partial<RulePerson> = {}): RulePerson => ({ id, invitationId: inv, name: `${id[0]!.toUpperCase()}${id.slice(1)} Lee`, party: '', coming: true, ...o });
const T = (id: string, seats: number, x: number, y = 50, o: Partial<RuleTable> = {}): RuleTable => ({ id, name: id.replace('t', ''), seats, shape: 'round', x, y, ...o });
const rules = (r: Partial<SeatRules> = {}) => SeatRules.parse(r);
const tablesOf = (seats: Record<string, string | null>, ids: string[]) => new Set(ids.map((id) => seats[id]));

describe('guest ties', () => {
  const names = { name1: 'Alex Moss', name2: 'Sam Reid' };
  it('reads a side from either name, the party names, or both', () => {
    expect(parseSide('Alex', names)).toBe('p1');
    expect(parseSide("Sam's side", names)).toBe('p2');
    expect(parseSide('Both', names)).toBe('both');
    expect(parseSide('Bride', names)).toBe('p1');
    expect(parseSide('Groom’s', names)).toBe('p2');
    expect(parseSide('Partner 2', names, { p1: 'Bride', p2: 'Bride 2' })).toBe('p2');
    expect(parseSide('Bride 2', names, { p1: 'Bride', p2: 'Bride 2' })).toBe('p2');
    expect(parseSide('', names)).toBe('');
    expect(parseSide('Family', names)).toBeNull();
    expect(sideLabels(names).p1).toBe('Alex’s side');
    expect(sideLabels(names, { p1: 'Bride' }).p1).toBe('Alex’s side · Bride');
  });

  it('reads relationships in everyday words', () => {
    expect(parseRelation('Cousin')).toBe('family_extended');
    expect(parseRelation('Mum')).toBe('family_immediate');
    expect(parseRelation('Old work')).toBe('ex_work');
    expect(parseRelation('Ex-work colleague')).toBe('ex_work');
    expect(parseRelation('Work')).toBe('work');
    expect(parseRelation('Uni friend')).toBe('friend_uni');
    expect(parseRelation('Netball club')).toBe('friend_club');
    expect(parseRelation('Neighbour')).toBe('neighbour');
    expect(parseRelation('Plus one')).toBe('plus_one');
    expect(parseRelation('Something else')).toBe('other');
    expect(parseRelation('')).toBe('');
  });

  it('tidies circles: no doubles, no commas, at most eight', () => {
    expect(cleanCircles([' Uni  crew ', 'uni crew', 'Acme work'])).toEqual(['Uni crew', 'Acme work']);
    expect(parseCircles('Uni crew; Netball / Acme')).toEqual(['Uni crew', 'Netball', 'Acme']);
    expect(splitCircles(joinCircles(['A', 'B']))).toEqual(['A', 'B']);
    expect(cleanCircles(Array.from({ length: 12 }, (_, i) => `C${i}`))).toHaveLength(8);
  });
});

describe('suggest a plan from who knows who', () => {
  it('keeps each circle at one table when it fits, biggest circles first', () => {
    const people = [
      ...['u1', 'u2', 'u3', 'u4'].map((id) => P(id, id, { circles: ['Uni crew'] })),
      ...['w1', 'w2', 'w3'].map((id) => P(id, id, { circles: ['Acme work'] })),
    ];
    const tables = [T('t1', 4, 20), T('t2', 4, 80)];
    const r = suggestSeating(people, tables, rules());
    expect(tablesOf(r.seats, ['u1', 'u2', 'u3', 'u4']).size).toBe(1);
    expect(tablesOf(r.seats, ['w1', 'w2', 'w3']).size).toBe(1);
    expect(r).toMatchObject({ seated: 7, left: 0 });
  });

  it('splits a circle too big for one table across neighbouring tables, never overfilling', () => {
    const people = Array.from({ length: 12 }, (_, i) => P(`c${i}`, `i${i}`, { circles: ['Netball'] }));
    const tables = [T('t1', 6, 10), T('t2', 6, 25), T('t3', 6, 90)];
    const r = suggestSeating(people, tables, rules());
    const used = [...tablesOf(r.seats, people.map((p) => p.id))] as string[];
    expect(used.sort()).toEqual(['t1', 't2']); // the two side by side, not the far one
    for (const t of tables) expect(Object.values(r.seats).filter((x) => x === t.id).length).toBeLessThanOrEqual(t.seats);
    expect(tableNeighbours(tables).get('t1')?.has('t2')).toBe(true);
  });

  it('respects the hard rules: invitations together, kept apart, the wedding party at the head table', () => {
    const people = [
      P('ann', 'g1', { circles: ['Uni crew'] }),
      P('bob', 'g1'),
      P('cat', 'g2', { circles: ['Uni crew'] }),
      P('dan', 'g3', { circles: ['Uni crew'] }),
      P('eve', 'g4', { role: 'Bridesmaid', circles: ['Uni crew'] }),
    ];
    const tables = [T('head', 4, 50, 10, { name: 'Head table', shape: 'head' }), T('t1', 4, 30, 60), T('t2', 4, 70, 60)];
    const r = suggestSeating(people, tables, rules({ pairs: [{ a: 'cat', b: 'dan', kind: 'apart' }] }));
    expect(r.seats.ann).toBe(r.seats.bob);
    expect(r.seats.cat).not.toBe(r.seats.dan);
    expect(r.seats.eve).toBe('head');
    expect(seatProblems(people, tables, r.seats, rules({ pairs: [{ a: 'cat', b: 'dan', kind: 'apart' }] })).filter((x) => /apart|invited together|head table|seats\./.test(x))).toEqual([]);
  });

  it('seats pencilled-in guests only when they are to be seated, and never someone not coming', () => {
    const people = [P('a', 'a'), P('b', 'b', { coming: false })];
    const r = suggestSeating(people, [T('t1', 4, 50)], rules());
    expect(r.seats.a).toBe('t1');
    expect(r.seats.b).toBeNull();
  });

  it('keeps each side together, or mixes them', () => {
    const people = [
      ...['a1', 'a2', 'a3', 'a4'].map((id) => P(id, id, { side: 'p1', relation: 'friend' })),
      ...['b1', 'b2', 'b3', 'b4'].map((id) => P(id, id, { side: 'p2', relation: 'friend' })),
    ];
    const tables = [T('t1', 4, 20), T('t2', 4, 80)];
    const keep = suggestSeating(people, tables, rules({ sides: 'keep' }));
    expect(tablesOf(keep.seats, ['a1', 'a2', 'a3', 'a4']).size).toBe(1);
    expect(tablesOf(keep.seats, ['b1', 'b2', 'b3', 'b4']).size).toBe(1);
    const mix = suggestSeating(people, tables, rules({ sides: 'mix' }));
    for (const t of tables) {
      const here = people.filter((p) => mix.seats[p.id] === t.id);
      expect(new Set(here.map((p) => p.side)).size).toBe(2);
    }
  });

  it('puts family nearest the head table and colleagues together', () => {
    const people = [
      P('mum', 'f1', { relation: 'family_immediate', side: 'p1' }),
      P('dad', 'f1', { relation: 'family_immediate', side: 'p1' }),
      P('w1', 'w1', { relation: 'work', side: 'p1' }),
      P('w2', 'w2', { relation: 'ex_work', side: 'p1' }),
      P('w3', 'w3', { relation: 'work', side: 'p1' }),
    ];
    const tables = [T('head', 2, 50, 10, { name: 'Head table', shape: 'head' }), T('t1', 3, 50, 30), T('t2', 3, 50, 90)];
    const r = suggestSeating(people, tables, rules());
    expect(r.seats.mum).toBe('t1');
    expect(tablesOf(r.seats, ['w1', 'w2', 'w3']).size).toBe(1);
    expect(r.seats.w1).toBe('t2');
  });

  it('is deterministic: the same plan whatever order the guests and tables come in', () => {
    const people = Array.from({ length: 30 }, (_, i) => P(`p${i}`, `i${Math.floor(i / 2)}`, { circles: [`C${i % 4}`], side: i % 3 ? 'p1' : 'p2', relation: i % 5 ? 'friend_uni' : 'work' }));
    const tables = [T('t1', 8, 10), T('t2', 8, 40), T('t3', 8, 70), T('t4', 8, 95)];
    const a = suggestSeating(people, tables, rules());
    const b = suggestSeating([...people].reverse(), [...tables].reverse(), rules());
    expect(b.seats).toEqual(a.seats);
    expect(a.left).toBe(0);
  });

  it('says who still needs a seat when the room is too small', () => {
    const r = suggestSeating([P('a', 'a'), P('b', 'b'), P('c', 'c')], [T('t1', 2, 50)], rules());
    expect(r).toMatchObject({ seated: 2, left: 1 });
    expect(r.notes.join(' ')).toMatch(/1 still needs a seat/);
  });

  it('compares with the current plan: circles together and people alone', () => {
    const people = [P('a', 'a', { circles: ['Uni'] }), P('b', 'b', { circles: ['Uni'] }), P('c', 'c', { circles: ['Work'] }), P('d', 'd', { circles: ['Work'] })];
    const tables = [T('t1', 2, 10), T('t2', 2, 50), T('t3', 2, 90)]; // t1 and t3 aren't neighbours
    const now = planSummary(people, tables, { a: 't1', b: 't3', c: 't1', d: 't3' }, rules());
    const next = planSummary(people, tables, suggestSeating(people, tables, rules()).seats, rules());
    expect(now).toMatchObject({ circles: 2, together: 0, alone: 4 });
    expect(next).toMatchObject({ circles: 2, together: 2, alone: 0 });
    expect(compareLine(now, next)).toBe('Keeps 2 of 2 circles together (now 0) · 4 people alone at their table → 0');
  });

  it('flags someone cut off from their circle, and leaves "knows no one" out of circles', () => {
    const people = [P('a', 'a', { circles: ['Uni'] }), P('b', 'b', { circles: ['Uni'] }), P('c', 'c', { circles: ['Uni'] }), P('z', 'z', { circles: [KNOWS_NO_ONE] }), P('y', 'y', { circles: [KNOWS_NO_ONE] })];
    const tables = [T('t1', 4, 10), T('t2', 4, 40), T('t3', 4, 90)];
    expect(seatProblems(people, tables, { a: 't1', b: 't1', c: 't3' }, rules())).toEqual(['C is the only one from Uni at Table 3.']);
    expect(seatProblems(people, tables, { a: 't1', b: 't1', c: 't2' }, rules())).toEqual([]); // a neighbouring table is fine
    expect(planSummary(people, tables, { z: 't1', y: 't2' }, rules()).circles).toBe(0);
  });

  it('names the new version after the day', () => {
    expect(suggestName(new Date('2026-11-09T02:00:00Z'), 'Australia/Sydney')).toMatch(/^Who knows who — Mon 9 Nov/);
  });
});

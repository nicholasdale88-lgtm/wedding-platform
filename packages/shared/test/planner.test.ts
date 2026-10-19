import { describe, expect, it } from 'vitest';
import { CHECK_TEMPLATE, commitmentOf, itemsFor, PACK_TEMPLATE, PARTY_CHECK_TEMPLATE, PARTY_TEMPLATE, PLAN_TEMPLATE, PLANNER_DOCS, SIDE_TEMPLATE, sideOf, suggestMenu, Vendor } from '../src/planner';

describe('wedding party', () => {
  it('roles sit on the usual side; unknown roles help from neither', () => {
    expect(sideOf('Bridesmaid')).toBe('p1');
    expect(sideOf('  best MAN ')).toBe('p2');
    expect(sideOf('MC')).toBe('');
    expect(sideOf('Dog walker')).toBe('');
  });

  it('each member sees lines for everyone, their side, and their own role only', () => {
    const items = [
      { time: '8:00am', until: '', title: 'Breakfast', detail: '', place: '', who: ['party'] },
      { time: '9:00am', until: '', title: 'Hair', detail: '', place: '', who: ['p1'] },
      { time: '11:00am', until: '', title: 'Suits', detail: '', place: '', who: ['p2'] },
      { time: '7:30pm', until: '', title: 'Speeches', detail: '', place: '', who: ['MC', 'Best man'] },
      { time: '', until: '', title: 'Untargeted', detail: '', place: '', who: [] },
    ];
    expect(itemsFor(items, 'Bridesmaid').map((i) => i.title)).toEqual(['Breakfast', 'Hair', 'Untargeted']);
    expect(itemsFor(items, 'Best man').map((i) => i.title)).toEqual(['Breakfast', 'Suits', 'Speeches', 'Untargeted']);
    expect(itemsFor(items, 'mc').map((i) => i.title)).toEqual(['Breakfast', 'Speeches', 'Untargeted']);
  });

  it('the templates are valid documents', () => {
    expect(PLANNER_DOCS['party-runsheet'].safeParse({ items: PARTY_TEMPLATE, packing: PACK_TEMPLATE }).success).toBe(true);
    expect(PLANNER_DOCS['day-checklist'].safeParse(CHECK_TEMPLATE).success).toBe(true);
    expect(PLANNER_DOCS.checklist.safeParse({ tasks: PLAN_TEMPLATE.map((t, i) => ({ ...t, id: `t${i}` })) }).success).toBe(true);
  });

  it('the NOI tasks are marked legal and fall inside the legal window (no later than one month before)', () => {
    const noi = PLAN_TEMPLATE.filter((t) => /Notice of Intended Marriage|NOI/.test(t.text));
    expect(noi.length).toBeGreaterThanOrEqual(2);
    for (const t of noi) {
      expect(t.legal).toBe(true);
      expect(t.before).toBeGreaterThanOrEqual(31);
      expect(t.before).toBeLessThanOrEqual(18 * 31);
    }
  });
});

describe('vendors', () => {
  const v = Vendor.parse({ id: 'v1', name: 'Bloom', quote: 1000, deposit: 200 });
  it('a vendor commits to the accepted quote, else the quote typed in', () => {
    expect(commitmentOf(v)).toEqual({ amount: 1000, deposit: 200 });
    const withQuotes = Vendor.parse({ ...v, quotes: [{ id: 'q1', amount: 2400, deposit: 500 }, { id: 'q2', amount: 2100 }], accepted: 'q2' });
    expect(commitmentOf(withQuotes)).toEqual({ amount: 2100, deposit: 0 });
  });
  it('negative amounts are refused', () => {
    expect(PLANNER_DOCS.vendors.safeParse({ list: [{ id: 'x', name: 'A', quote: -5 }] }).success).toBe(false);
  });
});

describe('menus', () => {
  const special = [
    { id: 'v', name: 'Vegan', suits: 'vegan, plant based', entree: 'a', main: 'b', dessert: 'c' },
    { id: 'g', name: 'Gluten free', suits: 'gluten, coeliac', entree: 'd', main: 'e', dessert: 'f' },
  ];
  it('a guest is matched to the special menu whose words appear in what they wrote', () => {
    expect(suggestMenu('Vegan please', special)?.id).toBe('v');
    expect(suggestMenu('Coeliac (serious)', special)?.id).toBe('g');
    expect(suggestMenu('gluten-free', special)?.id).toBe('g');
    expect(suggestMenu('No onion', special)).toBeUndefined();
    expect(suggestMenu('', special)).toBeUndefined();
  });
  it('the couple-side templates are valid', () => {
    expect(PLANNER_DOCS['event-checklist'].safeParse(PARTY_CHECK_TEMPLATE).success).toBe(true);
    expect(PLANNER_DOCS['party-p1'].safeParse({ tasks: SIDE_TEMPLATE.p1.map((t, i) => ({ ...t, id: `t${i}` })) }).success).toBe(true);
    expect(CHECK_TEMPLATE.both.length).toBeGreaterThan(5);
  });
});

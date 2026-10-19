import { describe, expect, it } from 'vitest';
import { bookingTimeline, CHECK_TEMPLATE, clockMinutes, clockText, commitmentOf, glamSchedule, itemsFor, PACK_TEMPLATE, PARTY_CHECK_TEMPLATE, PARTY_TEMPLATE, PLAN_TEMPLATE, PLANNER_DOCS, SIDE_TEMPLATE, sideOf, suggestMenu, Vendor } from '../src/planner';

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

describe('hair and makeup', () => {
  const person = (id: string, last = false) => ({ id, who: id, hair: true, makeup: true, hairMins: 45, makeupMins: 45, last });
  it('reads and writes clock times', () => {
    expect(clockMinutes('9:30am')).toBe(570);
    expect(clockMinutes('12:15pm')).toBe(735);
    expect(clockMinutes('14:00')).toBe(840);
    expect(clockMinutes('soon')).toBeNull();
    expect(clockText(570)).toBe('9:30am');
  });
  it('everyone is ready by the finish time, nobody is in two chairs at once, the bride goes last', () => {
    const g = { finish: '12:00pm', hairArtists: 1, makeupArtists: 1, people: [person('Bride', true), person('Amy'), person('Bea')] };
    const s = glamSchedule(g);
    expect(s.end).toBe(720);
    for (const r of s.rows) {
      expect(r.hair && r.makeup).toBeTruthy();
      expect(r.hair![1] <= r.makeup![0] || r.makeup![1] <= r.hair![0]).toBe(true); // never both at once
    }
    const bride = s.rows.find((r) => r.who === 'Bride')!;
    const others = s.rows.filter((r) => r.who !== 'Bride');
    expect(Math.max(bride.hair![0], bride.makeup![0])).toBeGreaterThanOrEqual(Math.max(...others.map((r) => Math.min(r.hair![0], r.makeup![0]))));
    // Two people sharing the hair artist never overlap.
    const hairs = s.rows.map((r) => r.hair!).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < hairs.length; i++) expect(hairs[i]![0]).toBeGreaterThanOrEqual(hairs[i - 1]![1]);
  });
});

describe('when to book', () => {
  const v = (name: string, category: string, status: 'idea' | 'booked') => Vendor.parse({ id: name, name, category, status });
  const day = Date.parse('2027-11-18T05:00:00Z');
  it('sorts suppliers by what they do, earliest first, and flags what most couples have booked by now', () => {
    const rows = bookingTimeline([v('Snaps Co', 'Photographer', 'booked'), v('Glam', 'Hair stylist', 'idea'), v('Petals', 'Florist', 'idea')], day, Date.parse('2027-04-01T00:00:00Z'));
    const by = Object.fromEntries(rows.map((r) => [r.what, r]));
    expect(rows[0]!.what).toBe('Venue');
    expect(by.Photographer).toMatchObject({ state: 'booked', vendor: 'Snaps Co', late: false });
    expect(by['Hair and makeup']).toMatchObject({ state: 'looking', late: false });
    expect(by['Styling and hire']!.state).toBe('none');
    expect(by.Florist).toMatchObject({ state: 'looking', late: true, bookBy: '2027-03-18' });
    expect(by.Venue!.late).toBe(true);
  });
  it('a wedding with a venue set counts the venue as booked', () => {
    expect(bookingTimeline([], day, day, true).find((r) => r.what === 'Venue')).toMatchObject({ state: 'booked', late: false });
  });
});

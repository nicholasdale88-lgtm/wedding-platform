import { describe, expect, it } from 'vitest';
import { allPayments, compareRfq, Rfq, rfqDraft, searchKeyOf, BUDGET_SPLIT, BUDGET_TEMPLATE, standardLines, quoteStatus, PlanChecklist, taskTotals, withStatus, bookingTimeline, vendorActions, BudgetLine, CHECK_TEMPLATE, moneyOf, scheduleOf, withSchedules, clockMinutes, clockText, commitmentOf, glamSchedule, itemsFor, PACK_TEMPLATE, PARTY_CHECK_TEMPLATE, PARTY_TEMPLATE, PLAN_TEMPLATE, PLANNER_DOCS, SIDE_TEMPLATE, sideOf, suggestMenu, Vendor } from '../src/planner';

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
  it('hire and transport land where they belong; month ends do not spill over', () => {
    const rows = bookingTimeline([v('Seats', 'Chair hire', 'booked'), v('Wheels', 'Car hire', 'booked'), v('Stay', 'Bridal suite', 'booked')], Date.parse('2027-10-31'), 0);
    const by = Object.fromEntries(rows.map((r) => [r.what, r]));
    expect(by['Styling and hire']!.vendor).toBe('Seats');
    expect(by.Transport!.vendor).toBe('Wheels');
    expect(by.Accommodation!.vendor).toBe('Stay');
    expect(by['Hair and makeup']!.state).toBe('none');
    expect(by.Florist!.bookBy).toBe('2027-02-28');
  });
  it('a wedding with a venue set counts the venue as booked', () => {
    expect(bookingTimeline([], day, day, true).find((r) => r.what === 'Venue')).toMatchObject({ state: 'booked', late: false });
  });
});

describe('payment schedules', () => {
  const line = (o: Partial<BudgetLine>) => BudgetLine.parse({ category: 'Other', ...o });
  it('starts from the quote: the deposit and the balance', () => {
    const v = Vendor.parse({ id: 'a', name: 'Bloom', status: 'booked', quote: 3000, deposit: 500, depositPaid: true, balanceDue: '2027-10-01' });
    expect(scheduleOf(v).map((p) => [p.label, p.amount, p.paid, p.due])).toEqual([
      ['Deposit', 500, true, ''],
      ['Balance', 2500, false, '2027-10-01'],
    ]);
    expect(moneyOf(v)).toMatchObject({ total: 3000, paid: 500, owing: 2500 });
  });
  it('a vendor on a budget line starts from that line', () => {
    const v = Vendor.parse({ id: 'a', name: 'Bloom', status: 'booked', quote: 9999 });
    const l = line({ vendor: 'bloom ', quote: 2000, paid: 800, due: '2027-09-01' });
    expect(moneyOf(v, l)).toMatchObject({ total: 2000, paid: 800, owing: 1200 });
  });
  it('a schedule you set wins, and the budget line follows it', () => {
    const v = Vendor.parse({
      id: 'a', name: 'Bloom', status: 'booked', quote: 3000,
      payments: [
        { id: '1', label: 'Deposit', amount: 1000, paid: true, paidOn: '2027-01-02' },
        { id: '2', label: 'Second', amount: 1000, due: '2027-06-01' },
        { id: '3', label: 'Final', amount: 1000, due: '2027-10-01' },
      ],
    });
    const [l] = withSchedules([line({ vendor: 'Bloom', quote: 3000, paid: 0, due: '2027-12-01' })], [v]);
    expect(l).toMatchObject({ quote: 3000, paid: 1000, due: '2027-06-01' });
    expect(moneyOf(v).next?.label).toBe('Second');
  });
  it('the whole schedule has every booked vendor and the other budget lines, soonest first', () => {
    const v = Vendor.parse({ id: 'a', name: 'Bloom', status: 'booked', quote: 1000, balanceDue: '2027-05-01' });
    const idea = Vendor.parse({ id: 'b', name: 'Maybe', status: 'quoted', quote: 500, balanceDue: '2027-01-01' });
    const all = allPayments([line({ item: 'Rings', quote: 400, due: '2027-03-01' })], [v, idea]);
    expect(all.map((p) => [p.who, p.amount, p.due])).toEqual([
      ['Rings', 400, '2027-03-01'],
      ['Bloom', 1000, '2027-05-01'],
    ]);
  });
});

describe('vendor items for the checklist', () => {
  it('payments (ticked once paid), contracts to sign, and quotes running out', () => {
    const booked = Vendor.parse({ id: 'a', name: 'Bloom', status: 'booked', quote: 1000, deposit: 200, depositPaid: true, balanceDue: '2027-10-01', contractSigned: '' });
    const maybe = Vendor.parse({ id: 'b', name: 'Snap', status: 'quoted', quotes: [{ id: 'q1', amount: 3000, validUntil: '2027-02-01' }] });
    const items = vendorActions([], [booked, maybe]);
    // The paid deposit has no date, so it's left off; the rest are there.
    expect(items.map((i) => [i.kind, i.text, i.due, i.done])).toEqual([
      ['payment', 'Pay Bloom · balance ($800)', '2027-10-01', false],
      ['contract', 'Sign Bloom’s contract', '', false],
      ['quote', 'Decide on Snap’s quote (it runs out)', '2027-02-01', false],
    ]);
  });
});

describe('tasks: who, status, totals', () => {
  const list = PlanChecklist.parse({
    helpers: [{ id: 'mum', name: 'Mum', key: 'k' }],
    tasks: [
      { id: 'a', text: 'Book venue', before: 400, done: true, doneOn: '2027-03-02' }, // done (old style)
      { id: 'b', text: 'Florist', before: 260, owner: 'p1', status: 'doing' }, // overdue, under way
      { id: 'c', text: 'Invites', before: 250, helper: 'mum' }, // due in 5 days
      { id: 'd', text: 'Cake', before: 200, helper: 'mum' }, // later
    ],
  });
  const tt = taskTotals(list, '2027-11-18', '2027-03-08', { p1: 'Alex', p2: 'Sam' });
  it('counts by status, overdue and due soon', () => {
    expect(tt.byStatus).toEqual({ todo: 2, doing: 1, done: 1 });
    expect(tt.overdue).toBe(1);
    expect(tt.due7).toBe(1);
    expect(tt.due30).toBe(1);
  });
  it('by person, unassigned last, and done per week', () => {
    expect(tt.byPerson.map((p) => [p.name, p.todo, p.doing, p.done, p.overdue])).toEqual([
      ['Mum', 2, 0, 0, 0],
      ['Alex', 0, 1, 0, 1],
      ['Not assigned', 0, 0, 1, 0],
    ]);
    expect(tt.donePerWeek).toHaveLength(12);
    expect(tt.donePerWeek.at(-1)).toEqual({ week: '2027-03-08', n: 0 });
    expect(tt.donePerWeek.at(-2)).toEqual({ week: '2027-03-01', n: 1 });
    expect(tt.next.map((n) => n.text)).toEqual(['Florist', 'Invites', 'Cake']);
  });
  it('a status change keeps "done" in step', () => {
    const d = withStatus(list.tasks[2]!, 'done', '2027-03-09');
    expect(d).toMatchObject({ done: true, status: 'done', doneOn: '2027-03-09' });
    expect(withStatus(d, 'todo', '2027-03-10')).toMatchObject({ done: false, doneOn: '' });
  });
});

describe('quote tracker', () => {
  const v = (o: object) => Vendor.parse({ id: 'v', name: 'Snap', ...o });
  it('to ask, pricing (with how long and when to chase), quote in, booked, not going ahead', () => {
    expect(quoteStatus(v({}), '2027-03-10').stage).toBe('ask');
    const asked = quoteStatus(v({ status: 'requested', askedOn: '2027-03-01' }), '2027-03-10');
    expect(asked).toMatchObject({ stage: 'pricing', waiting: 9, chase: true, chaseOn: '2027-03-08' });
    expect(quoteStatus(v({ status: 'requested', askedOn: '2027-03-01', quoteBy: '2027-03-15' }), '2027-03-10').chase).toBe(false);
    expect(quoteStatus(v({ status: 'requested', askedOn: '2027-03-01', chasedOn: '2027-03-09' }), '2027-03-10')).toMatchObject({ chase: false, chaseOn: '2027-03-14' });
    const quoted = quoteStatus(v({ status: 'quoted', askedOn: '2027-03-01', quotes: [{ id: 'a', amount: 3000, date: '2027-03-05' }, { id: 'b', amount: 2600, date: '2027-03-07', validUntil: '2027-04-01' }] }), '2027-03-10');
    expect(quoted).toMatchObject({ stage: 'in', amount: 2600, took: 4, expires: '2027-04-01' });
    expect(quoteStatus(v({ status: 'declined', quotes: [{ id: 'a', amount: 1 }] }), '2027-03-10').stage).toBe('out');
    expect(quoteStatus(v({ status: 'booked' }), '2027-03-10').stage).toBe('booked');
  });
});

describe('standard budget', () => {
  it('each category’s lines add up to its usual share, and the whole to 100%', () => {
    for (const c of BUDGET_SPLIT) {
      const sum = BUDGET_TEMPLATE.filter((t) => t.category === c.category).reduce((a, t) => a + t.share, 0);
      expect(sum, c.category).toBeCloseTo(c.share, 5);
    }
    expect(BUDGET_SPLIT.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 5);
  });
  it('lines from the total and the guests (per head), following your split, skipping what you have', () => {
    const lines = standardLines({ total: 50000, split: {}, lines: [{ category: 'Cake', item: 'Wedding cake', estimate: 900, quote: 0, paid: 0, due: '', vendor: '', note: '', payer: '', perHead: 0 }] }, 100);
    expect(lines.find((l) => l.item === 'Wedding cake')).toBeUndefined();
    expect(lines.find((l) => l.item === 'Catering')).toMatchObject({ perHead: 100, estimate: 10000 });
    expect(lines.find((l) => l.item === 'Photographer')!.estimate).toBe(4000);
    // Photography at 20% (not 12%): the photographer's line grows to match.
    const more = standardLines({ total: 50000, split: { 'Photography and video': 0.2 }, lines: [] }, 100);
    expect(more.find((l) => l.item === 'Photographer')!.estimate).toBe(Math.round((50000 * 0.08 * 0.2) / 0.12));
  });
});

describe('vendor directory categories', () => {
  it('maps what a vendor does to its directory category', () => {
    expect(searchKeyOf('Wedding photographer')).toBe('photographer');
    expect(searchKeyOf('Photo booth hire')).toBe('hire');
    expect(searchKeyOf('Videography')).toBe('videographer');
    expect(searchKeyOf('Chair hire')).toBe('hire');
    expect(searchKeyOf('Hair stylist')).toBe('hair');
    expect(searchKeyOf('Car hire')).toBe('transport');
    expect(searchKeyOf('Something else')).toBe('');
  });
});

describe('quote requests', () => {
  it('compares quotes line by line, marks the lowest, and levels out what was left out', () => {
    const rfq = Rfq.parse({ id: 'r', lines: [{ id: 'a', label: 'Coverage' }, { id: 'b', label: 'Album' }, { id: 'c', label: 'Travel' }], vendors: [{ vendorId: 'x', quoteId: 'qx' }, { vendorId: 'y', quoteId: 'qy' }, { vendorId: 'z' }] });
    const q = (id: string, lines: [string, number | null][]) => ({ id, rfq: 'r', amount: lines.reduce((a, [, n]) => a + (n ?? 0), 0), lines: lines.map(([lid, amount]) => ({ id: lid, amount })) });
    const list = [
      Vendor.parse({ id: 'x', name: 'X', quotes: [q('qx', [['a', 3000], ['b', 800], ['c', 200]])] }),
      Vendor.parse({ id: 'y', name: 'Y', quotes: [q('qy', [['a', 2500], ['b', null], ['c', 100]])] }),
      Vendor.parse({ id: 'z', name: 'Z' }),
    ];
    const c = compareRfq(rfq, list);
    expect(c.rows.map((r) => r.low)).toEqual([2500, null, 100]);
    expect(c.totals[0]).toEqual({ quoted: 4000, levelled: 4000, missing: 0 });
    // Y left the album out: counted at the middle price of the others (800), so 2600 is really 3400.
    expect(c.totals[1]).toEqual({ quoted: 2600, levelled: 3400, missing: 1 });
    expect(c.totals[2]).toEqual({ quoted: null, levelled: null, missing: 3 });
    expect(c.best).toBe(3400);
  });

  it('has a standard email for each service, with the link to price it', () => {
    for (const s of ['photographer', 'florist', 'caterer', 'venue', '']) {
      const d = rfqDraft(s);
      expect(d.message).toContain('{link}');
      expect(d.message).toContain('{couple}');
    }
    expect(rfqDraft('florist').message).toMatch(/bouquets/);
  });
});

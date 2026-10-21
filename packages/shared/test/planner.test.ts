import { describe, expect, it } from 'vitest';
import { mealWarning, menuFit, servedMeal } from '../src/planner';
import { suggestedTasks, vendorKind, negotiationPlan, awaitingReply, nextFollowUp, beforeOf, negotiationPoints, rfqStage, allPayments, compareRfq, tenderAnalysis, tenderRows, savingsPlan, Rfq, rfqDraft, searchKeyOf, BUDGET_SPLIT, BUDGET_TEMPLATE, standardLines, quoteStatus, PlanChecklist, taskTotals, withStatus, bookingTimeline, vendorActions, BudgetLine, CHECK_TEMPLATE, moneyOf, scheduleOf, withSchedules, clockMinutes, clockText, commitmentOf, glamSchedule, itemsFor, PACK_TEMPLATE, PARTY_CHECK_TEMPLATE, PARTY_TEMPLATE, PLAN_TEMPLATE, PLANNER_DOCS, SIDE_TEMPLATE, sideOf, suggestMenu, Vendor } from '../src/planner';

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
  it('a guest with several needs gets a menu that covers them all, or none', () => {
    const menus = [
      { id: 'veg', name: 'Vegetarian', suits: 'vegetarian', entree: '', main: '', dessert: '' },
      { id: 'vegan', name: 'Vegan', suits: 'vegan', entree: '', main: '', dessert: '' },
      { id: 'gf', name: 'Gluten free', suits: 'gluten free', entree: '', main: '', dessert: '' },
      { id: 'vgf', name: 'Vegan and gluten free', suits: 'vegan, gluten free, nut free', entree: '', main: '', dessert: '' },
      { id: 'onion', name: 'No onion', suits: 'no onion', entree: '', main: '', dessert: '' },
    ];
    expect(suggestMenu('Vegan and coeliac', menus)?.id).toBe('vgf');
    // Vegan is also vegetarian, dairy free and egg free; the most specific menu that fits wins.
    expect(suggestMenu('Vegetarian', menus)?.id).toBe('veg');
    expect(suggestMenu('Dairy free', menus)?.id).toBe('vegan');
    expect(suggestMenu('Gluten free, nut allergy', menus)?.id).toBe('vgf');
    expect(suggestMenu('Halal', menus)).toBeUndefined(); // nothing covers it: they need their own plate
    expect(suggestMenu('No onion please', menus)?.id).toBe('onion');
    expect(suggestMenu('Plant based', menus)?.id).toBe('vegan');
  });
  it('what the kitchen serves: their changes, else their menu, else the set menu; edits to a menu reach everyone on it', () => {
    const menus = {
      set: { id: '', name: 'Set menu', suits: '', entree: 'Burrata', main: 'Lamb', dessert: 'Pavlova' },
      special: [{ id: 'v', name: 'Vegan', suits: 'vegan', entree: 'Tomato', main: 'Risotto', dessert: '' }],
      files: [],
    };
    expect(servedMeal(undefined, menus)).toMatchObject({ menu: 'Set menu', entree: 'Burrata', main: 'Lamb', dessert: 'Pavlova' });
    expect(servedMeal({ menu: 'v', entree: '', main: '', dessert: '' }, menus)).toMatchObject({ menu: 'Vegan', entree: 'Tomato', main: 'Risotto', dessert: 'Pavlova' });
    expect(servedMeal({ menu: 'v', entree: '', main: 'Mushroom pie', dessert: '' }, menus)).toMatchObject({ menu: 'Vegan', main: 'Mushroom pie' });
    expect(servedMeal({ menu: '', entree: '', main: 'Fish', dessert: '' }, menus)).toMatchObject({ menu: 'Their own', entree: 'Burrata', main: 'Fish' });
    menus.special[0]!.main = 'Gnocchi';
    expect(servedMeal({ menu: 'v', entree: '', main: '', dessert: '' }, menus).main).toBe('Gnocchi');
    // A menu that was removed: back to the set menu, never a blank plate.
    expect(servedMeal({ menu: 'gone', entree: '', main: '', dessert: '' }, menus)).toMatchObject({ menu: 'Set menu', main: 'Lamb' });
  });
  it('warns when a meal is not marked safe for a need, louder for a serious one', () => {
    const menus = { set: { id: '', name: 'Set menu', suits: 'nut free', entree: '', main: '', dessert: '' }, special: [{ id: 'v', name: 'Vegan', suits: 'vegan', entree: '', main: '', dessert: '' }], files: [] };
    expect(mealWarning('Nut allergy', undefined, menus)).toBe(''); // the set menu is marked nut free
    expect(mealWarning('Coeliac', undefined, menus)).toBe('The set menu isn’t marked gluten free: check with the caterer');
    expect(mealWarning('Vegan, nut allergy', { menu: 'v', entree: '', main: '', dessert: '' }, menus)).toBe('Vegan isn’t marked nut free: check with the caterer');
    expect(mealWarning('Vegetarian', { menu: 'v', entree: '', main: '', dessert: '' }, menus)).toBe('');
    expect(mealWarning('Vegetarian', undefined, menus)).toBe('The set menu isn’t marked vegetarian');
    expect(mealWarning('Coeliac', { menu: '', entree: 'GF bread', main: '', dessert: '' }, menus)).toBe(''); // written for them
    expect(mealWarning('No coriander', undefined, menus)).toBe(''); // not a kitchen heading
  });
  it('stress: 2,000 mixed dietary notes; a suggested menu is always safe for everything they wrote', () => {
    const notes = ['Vegan', 'vegetarian', 'Coeliac', 'gluten free', 'nut allergy', 'peanut allergy', 'dairy free', 'lactose intolerant', 'Halal', 'shellfish allergy', 'egg allergy', 'plant-based', 'pescatarian', 'no coriander', 'pregnant'];
    const menus = {
      set: { id: '', name: 'Set menu', suits: 'nut free', entree: 'Burrata', main: 'Lamb', dessert: 'Pavlova' },
      special: [
        { id: 'veg', name: 'Vegetarian', suits: 'vegetarian, nut free', entree: '', main: 'Risotto', dessert: '' },
        { id: 'vegan', name: 'Vegan', suits: 'vegan, nut free', entree: '', main: 'Curry', dessert: 'Sorbet' },
        { id: 'gf', name: 'Gluten free', suits: 'gluten free', entree: '', main: 'Fish', dessert: '' },
        { id: 'vgf', name: 'Vegan and gluten free', suits: 'vegan, gluten free, nut free, peanut free', entree: '', main: 'Bowl', dessert: '' },
        { id: 'halal', name: 'Halal', suits: 'halal', entree: '', main: 'Chicken', dessert: '' },
      ],
      files: [],
    };
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    let suggested = 0;
    let none = 0;
    for (let i = 0; i < 2000; i++) {
      const diet = Array.from({ length: 1 + rnd(3) }, () => notes[rnd(notes.length)]!).join(rnd(2) ? ', ' : ' and ');
      const m = suggestMenu(diet, menus.special);
      if (m) {
        suggested++;
        const choice = { menu: m.id, entree: '', main: '', dessert: '' };
        expect(mealWarning(diet, choice, menus), diet).toBe('');
        expect(servedMeal(choice, menus).main, diet).toBe(m.main); // every course is filled: theirs or the set menu's
        expect(servedMeal(choice, menus).dessert, diet).not.toBe('');
      } else {
        none++;
        // No menu fits: either nothing to cater for, or one of them really is missing from every menu.
        const needs = menuFit(diet, undefined).needs;
        for (const sp of menus.special) expect(needs.length === 0 || menuFit(diet, sp).missing.length > 0, `${diet} / ${sp.id}`).toBe(true);
      }
    }
    expect(suggested).toBeGreaterThan(500);
    expect(none).toBeGreaterThan(50);
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

  it('levels them like a tender: line spread and variance, lowest-on counts, vs best and budget, a weighted score and a rank', () => {
    const rfq = Rfq.parse({
      id: 'r',
      budget: 3000,
      lines: [{ id: 'a', label: 'Coverage' }, { id: 'b', label: 'Album' }, { id: 'c', label: 'Travel' }],
      vendors: [{ vendorId: 'x', quoteId: 'qx', scores: { quality: 5, service: 5, fit: 5 } }, { vendorId: 'y', quoteId: 'qy', scores: { quality: 2 } }, { vendorId: 'z' }],
    });
    const q = (id: string, lines: [string, number | null][]) => ({ id, rfq: 'r', amount: lines.reduce((a, [, n]) => a + (n ?? 0), 0), lines: lines.map(([lid, amount]) => ({ id: lid, amount })) });
    const list = [
      Vendor.parse({ id: 'x', name: 'X', quotes: [q('qx', [['a', 3000], ['b', 800], ['c', 200]])] }),
      Vendor.parse({ id: 'y', name: 'Y', quotes: [q('qy', [['a', 2500], ['b', null], ['c', 100]])] }),
      Vendor.parse({ id: 'z', name: 'Z' }),
    ];
    const t = tenderAnalysis(rfq, list);
    expect(t.rows[0]).toMatchObject({ lo: 2500, hi: 3000, mid: 2750, spread: 20, variance: [9, -9, null] });
    const [x, y, z] = t.vendors;
    expect(x).toMatchObject({ lowestOn: 0, vsBest: 600, vsBestPct: 18, vsBudget: 1000, score: 9.4, rank: 1 }); // dearer, but rated highly
    expect(y).toMatchObject({ lowestOn: 2, vsBest: 0, vsBudget: 400, score: 8, rank: 2 }); // cheapest like for like
    expect(z).toMatchObject({ score: null, rank: 0 }); // no quote yet
    expect(t.bestValue?.name).toBe('Y');
    expect(t.topScore?.name).toBe('X');
    const csv = tenderRows(t);
    expect(csv[0]).toEqual(['What', 'X', 'Y', 'Z', 'Low', 'Median', 'High']);
    expect(csv[2]).toEqual(['Album', 800, 'Not included', '', 800, 800, 800]);
    // Older requests (no budget, no ratings) still load.
    expect(Rfq.parse({ id: 'old', vendors: [{ vendorId: 'x' }] })).toMatchObject({ budget: 0, vendors: [{ scores: {} }] });
  });

  it('a quote given as one total covers every line: nothing counted as left out, never "lowest" on a line', () => {
    const rfq = Rfq.parse({ id: 'r', lines: [{ id: 'a', label: 'Coverage' }, { id: 'b', label: 'Album' }], vendors: [{ vendorId: 'x', quoteId: 'qx' }, { vendorId: 'p', quoteId: 'qp' }] });
    const list = [
      Vendor.parse({ id: 'x', name: 'X', quotes: [{ id: 'qx', rfq: 'r', amount: 3500, lines: [{ id: 'a', amount: 3000 }, { id: 'b', amount: 500 }] }] }),
      Vendor.parse({ id: 'p', name: 'P', quotes: [{ id: 'qp', rfq: 'r', amount: 3200, package: true }] }),
    ];
    const t = tenderAnalysis(rfq, list);
    expect(t.totals[1]).toEqual({ quoted: 3200, levelled: 3200, missing: 0 });
    expect(t.rows.map((r) => r.prices)).toEqual([[3000, null], [500, null]]);
    expect(t.vendors[1]).toMatchObject({ lowestOn: 0, vsBest: 0 });
    expect(t.bestValue?.name).toBe('P');
    expect(tenderRows(t)[1]).toEqual(['Coverage', 3000, 'In their total', 3000, 3000, 3000]);
  });

  it('negotiation: points for each vendor from the comparison, each with the line to ask, and a ready message', () => {
    const rfq = Rfq.parse({
      id: 'r',
      title: 'Florist quotes',
      lines: [{ id: 'a', label: 'Bouquet' }, { id: 'b', label: 'Arbour' }, { id: 'c', label: 'Centrepieces' }],
      vendors: [{ vendorId: 'x', quoteId: 'qx' }, { vendorId: 'y', quoteId: 'qy', negotiatedOn: '2027-03-01' }, { vendorId: 'z', quoteId: 'qz' }],
    });
    const q = (id: string, lines: [string, number | null][], extra = {}) => ({ id, rfq: 'r', amount: lines.reduce((a, [, n]) => a + (n ?? 0), 0), lines: lines.map(([lid, amount]) => ({ id: lid, amount })), ...extra });
    const list = [
      Vendor.parse({ id: 'x', name: 'Bloom', contact: 'Jo Bloom', quotes: [q('qx', [['a', 300], ['b', 900], ['c', 700]], { deposit: 200 })] }),
      Vendor.parse({ id: 'y', name: 'Petal', quotes: [q('qy', [['a', 320], ['b', 1400], ['c', null]], { deposit: 800, validUntil: '2027-03-10' })] }),
      Vendor.parse({ id: 'z', name: 'Fern', quotes: [q('qz', [['a', 310], ['b', 950], ['c', 720]], { deposit: 250 })] }),
    ];
    const n = negotiationPoints(rfq, list, '2027-03-01');
    const petal = n.find((x) => x.name === 'Petal')!;
    expect(petal.points.map((p) => p.kind)).toEqual(['price', 'lines', 'missing', 'deposit', 'expiry']);
    expect(petal.points[1]!.text).toMatch(/^Arbour: \$1,400, \d+% above the middle price/);
    expect(petal.points[2]!.ask).toBe('Could you include centrepieces in your price, or let us know what it would add?');
    expect(petal.message).toContain('{couple}');
    expect(petal.message).toContain('our florist');
    expect(petal.askedOn).toBe('2027-03-01');
    const bloom = n.find((x) => x.name === 'Bloom')!;
    expect(bloom.best).toBe(true);
    expect(bloom.points).toEqual([]); // best value, nothing to raise
    expect(bloom.message).toMatch(/^Hi Jo,/);
    expect(bloom.message).toContain('any flexibility');
    expect(rfqStage(rfq, list)).toBe(3);
    expect(rfqStage({ ...rfq, vendors: rfq.vendors.map((v) => ({ ...v, negotiatedOn: '' })) }, list)).toBe(2);
    expect(rfqStage({ ...rfq, closed: true }, list)).toBe(4);
    expect(rfqStage(Rfq.parse({ id: 'e', vendors: [{ vendorId: 'x' }] }), list)).toBe(1);
    // What negotiating saved: the first price is kept once it changes.
    expect(beforeOf(undefined, 900)).toBeUndefined();
    expect(beforeOf({ amount: 1000 }, 900)).toBe(1000);
    expect(beforeOf({ amount: 900, before: 1000 }, 850)).toBe(1000);
    expect(beforeOf({ amount: 900 }, 900)).toBeUndefined();
  });

  it('follow-ups: automatic reminders four days after sending (sooner near the due date), then after the due date, two at most', () => {
    const rfq = { closed: false, manual: false, autoFollow: true, due: '2027-03-20' };
    const rv = { sentOn: '2027-03-01', answeredOn: '', declinedOn: '', followUps: 0, remindedOn: '' };
    expect(nextFollowUp(rfq, rv)).toBe('2027-03-05');
    expect(nextFollowUp({ ...rfq, due: '2027-03-04' }, rv)).toBe('2027-03-03'); // the day before it's due
    expect(nextFollowUp({ ...rfq, due: '2027-03-02' }, rv)).toBe('2027-03-03'); // never sooner than two days in
    expect(nextFollowUp(rfq, { ...rv, followUps: 1, remindedOn: '2027-03-05' })).toBe('2027-03-21'); // the day after the due date
    expect(nextFollowUp({ ...rfq, due: '' }, { ...rv, followUps: 1, remindedOn: '2027-03-05' })).toBe('2027-03-10');
    expect(nextFollowUp(rfq, { ...rv, followUps: 2 })).toBe('');
    expect(nextFollowUp(rfq, { ...rv, answeredOn: '2027-03-02' })).toBe('');
    expect(nextFollowUp({ ...rfq, autoFollow: false }, rv)).toBe('');
    expect(nextFollowUp({ ...rfq, manual: true }, rv)).toBe('');
    expect(nextFollowUp(rfq, { ...rv, sentOn: '' })).toBe('');

    // Asked for a better price: chase after four days without a new quote.
    const r = Rfq.parse({ id: 'r', vendors: [{ vendorId: 'x', quoteId: 'qx', negotiatedOn: '2027-03-01' }, { vendorId: 'y', quoteId: 'qy', negotiatedOn: '2027-03-01' }] });
    const list = [Vendor.parse({ id: 'x', name: 'X', quotes: [{ id: 'qx', date: '2027-02-20', amount: 1 }] }), Vendor.parse({ id: 'y', name: 'Y', quotes: [{ id: 'qy', date: '2027-03-03', amount: 1 }] })];
    expect(awaitingReply(r, list, '2027-03-04')).toEqual([]);
    expect(awaitingReply(r, list, '2027-03-06')).toEqual([{ vendorId: 'x', name: 'X', days: 5 }]); // Y came back on the 3rd
  });

  it('a plan for your preferred vendor: target from the cheaper quote, levers strongest first, messages in order', () => {
    const rfq = Rfq.parse({
      id: 'r',
      budget: 3000,
      lines: [{ id: 'a', label: 'Bouquet' }, { id: 'b', label: 'Arbour' }, { id: 'c', label: 'Centrepieces' }],
      vendors: [{ vendorId: 'x', quoteId: 'qx' }, { vendorId: 'y', quoteId: 'qy' }, { vendorId: 'z', quoteId: 'qz' }],
    });
    const q = (id: string, lines: [string, number | null][], extra = {}) => ({ id, rfq: 'r', amount: lines.reduce((a, [, n]) => a + (n ?? 0), 0), lines: lines.map(([lid, amount]) => ({ id: lid, amount })), ...extra });
    const list = [
      Vendor.parse({ id: 'x', name: 'Bloom', quotes: [q('qx', [['a', 300], ['b', 900], ['c', 700]], { deposit: 200 })] }),
      Vendor.parse({ id: 'y', name: 'Petal', contact: 'Sam Lee', quotes: [q('qy', [['a', 320], ['b', 1400], ['c', null]], { deposit: 800 })] }),
      Vendor.parse({ id: 'z', name: 'Fern', quotes: [q('qz', [['a', 310], ['b', 950], ['c', 720]], { deposit: 250 })] }),
    ];
    const p = negotiationPlan(rfq, list, 'y', '2027-07-18')!; // a Sunday in July
    expect(p.rival).toEqual({ name: 'Bloom', levelled: 1900 });
    expect(p.price).toBe(1720);
    // Bloom is 530 cheaper like for like (Petal's 2430 includes the centrepieces they left out): aim to match, never below 80%.
    expect(p.target).toBe(1400);
    expect(p.opening).toBeLessThanOrEqual(p.target);
    expect(p.limit).toBe(3000);
    expect(p.levers.map((l) => l.key)).toEqual(['match', 'lines', 'include', 'commit', 'deposit', 'early', 'date']);
    expect(p.levers.find((l) => l.key === 'date')!.why).toMatch(/Not a Saturday/);
    expect(p.messages.opener).toMatch(/^Hi Sam,/);
    expect(p.messages.opener).toContain('first choice');
    expect(p.messages.followUp).toContain('following up');
    expect(p.messages.counter).toContain('$1,400');
    // The cheapest has no rival: aim for 10% off, ask for extras; a Saturday in October has little room.
    const b = negotiationPlan(rfq, list, 'x', '2027-10-16')!;
    expect(b.rival).toBeNull();
    expect(b.target).toBe(1700);
    expect(b.levers.map((l) => l.key)).toEqual(['extras', 'commit', 'early', 'date']);
    expect(b.levers.at(-1)!.title).toMatch(/peak date/);
    expect(negotiationPlan(rfq, list, 'nobody')).toBeNull();
  });

  it('booked vendors: the usual tasks for their kind, dated back from the day, without repeats', () => {
    const v = Vendor.parse({ id: 'p', name: 'Lens & Light', category: 'Photographer', tasks: [{ id: 't1', text: 'Send the shot list', due: '2027-10-01' }] });
    expect(vendorKind(v)).toBe('Photographer');
    expect(suggestedTasks(v, '2027-11-18')).toEqual([
      { text: 'Send the family group list', due: '2027-10-28' },
      { text: 'Share the timeline and locations', due: '2027-11-04' },
      { text: 'Leave them a review', due: '2027-11-25' },
    ]);
    expect(suggestedTasks(Vendor.parse({ id: 'x', name: 'Someone', category: 'Juggler' }), '')).toEqual([{ text: 'Leave them a review', due: '' }]);
    expect(vendorKind({ category: '', name: 'Bloom Florals' })).toBe('Florist');
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

describe('saving up', () => {
  it('compares savings with what is still to pay, says how much a month, and finds the first payment it will not cover', () => {
    const entries = [
      { id: 'a', date: '2026-04-20', amount: 4000, who: '', note: '' },
      { id: 'b', date: '2026-08-01', amount: 2500, who: '', note: '' },
      { id: 'c', date: '2026-09-01', amount: -500, who: '', note: 'car' },
    ];
    const owing = [
      { label: 'Photographer', due: '2026-12-01', amount: 4000 },
      { label: 'Venue', due: '2027-03-01', amount: 10000 },
    ];
    const p = savingsPlan(entries, owing, '2026-10-20', '2027-11-18');
    expect(p).toMatchObject({ saved: 6000, toPay: 14000, short: 8000, months: 12, perMonth: 667, pace: 1000 });
    expect(p.gap).toEqual({ label: 'Venue', due: '2027-03-01', by: 4000 });
    expect(savingsPlan([], [], '2026-10-20', '2027-11-18')).toMatchObject({ saved: 0, toPay: 0, short: 0, perMonth: 0, gap: null });
  });
});

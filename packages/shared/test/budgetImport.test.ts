import { describe, expect, it } from 'vitest';
import { mergeImport, readBudgetSheets, sheetDate, type Sheet } from '../src/budgetImport';
import { Budget, Vendors } from '../src/planner';

/** A budget spreadsheet laid out the way couples keep them: a summary, a tracker, payments, savings. */
const SHEETS: Sheet[] = [
  { name: 'Summary', rows: [['Wedding Budget Summary', null], ['Due Date', 'Amount Due'], [46143, 1575]] },
  {
    name: 'Budget Tracker',
    rows: [
      ['Wedding Budget Tracker'],
      ['Item', 'Vendor', 'Estimate', 'Agreed', 'Paid', 'Remaining'],
      ['Venue / Accommodation', 'Hilltop Estate', null, 20000, 5000, 15000],
      ['Photography', 'Lens & Light', null, 3500, 500, 3000],
      ['Groom & Groomsmen Suits', 'Not yet locked in', 5000, null, 0, 5000],
      ['TOTAL', null, 5000, 23500, 5500, 23000],
      ['A note under the table'],
    ],
  },
  {
    name: 'Payments',
    rows: [
      ['Vendor', 'Installment', 'Amount', 'Due Date', 'Paid?', 'Date Paid'],
      ['Hilltop Estate', 'Deposit', 5000, null, 'Yes', null],
      ['Hilltop Estate', 'Final Balance', 15000, 46330, null, null],
      ['Lens & Light', 'Deposit', 500, null, null, 46310],
      ['Lens & Light', 'Final Balance', 3000, '18/10/2027', null, null],
      ['TOTAL', null, 23500],
    ],
  },
  {
    name: 'Savings Tracker',
    rows: [['Savings start date (edit this)', 46173], ['Date', 'Amount', 'Note'], ['05.01.26', 50, 'Into the joint account'], ['12.01.26', 350, 'Weekly'], ['Total saved', 400]],
  },
];

describe('importing a budget spreadsheet', () => {
  it('reads dates however they are written', () => {
    expect(sheetDate(46143)).toBe('2026-05-01');
    expect(sheetDate('05.01.26')).toBe('2026-01-05');
    expect(sheetDate('18/10/2027')).toBe('2027-10-18');
    expect(sheetDate('2027-11-04T00:00:00')).toBe('2027-11-04');
    expect(sheetDate('soon')).toBe('');
  });

  it('finds the tracker, payments and savings by their headings; booked vendors with their schedules', () => {
    const r = readBudgetSheets(SHEETS);
    expect(r.lines.map((l) => [l.item, l.category, l.vendor, l.estimate, l.quote, l.paid])).toEqual([
      ['Venue / Accommodation', 'Venue and catering', 'Hilltop Estate', 20000, 20000, 5000],
      ['Photography', 'Photography and video', 'Lens & Light', 3500, 3500, 500],
      ['Groom & Groomsmen Suits', 'Attire and rings', '', 5000, 0, 0],
    ]);
    expect(r.vendors.map((v) => [v.name, v.quote, v.payments.length])).toEqual([
      ['Hilltop Estate', 20000, 2],
      ['Lens & Light', 3500, 2],
    ]);
    expect(r.vendors[0]!.payments).toEqual([
      expect.objectContaining({ label: 'Deposit', amount: 5000, due: '', paid: true }),
      expect.objectContaining({ label: 'Final Balance', amount: 15000, due: '2026-11-04', paid: false }),
    ]);
    expect(r.vendors[1]!.payments[0]).toMatchObject({ paid: true, paidOn: '2026-10-15' });
    expect(r.savings.map((s) => [s.date, s.amount])).toEqual([['2026-01-05', 50], ['2026-01-12', 350]]);
    expect(r.total).toBe(28500);
  });

  it('merges into the planner without duplicates, and again changes nothing', () => {
    const r = readBudgetSheets(SHEETS);
    let n = 0;
    const budget = Budget.parse({ total: 0, lines: [{ category: 'Photography and video', item: 'Photography', estimate: 3000 }] });
    const vendors = Vendors.parse({ list: [{ id: 'v1', name: 'Lens & Light', category: 'Photographer', status: 'quoted' }] });
    const m = mergeImport(budget, vendors, r, () => `new${++n}`);
    expect(m.vendors.list.map((v) => [v.id, v.name, v.status, v.payments.length])).toEqual([
      ['v1', 'Lens & Light', 'booked', 2],
      ['new1', 'Hilltop Estate', 'booked', 2],
    ]);
    expect(m.budget.lines).toHaveLength(3);
    expect(m.budget.lines[0]).toMatchObject({ item: 'Photography', vendor: 'Lens & Light', quote: 3500 });
    expect(m.budget.total).toBe(28500);
    expect(m.counts).toEqual({ vendors: 2, addedVendors: 1, payments: 4, lines: 3, savings: 2 });
    const again = mergeImport(m.budget, m.vendors, r, () => `new${++n}`);
    expect(again.vendors.list).toHaveLength(2);
    expect(again.budget.lines).toHaveLength(3);
    expect(again.budget.savings.entries).toHaveLength(2);
  });
});

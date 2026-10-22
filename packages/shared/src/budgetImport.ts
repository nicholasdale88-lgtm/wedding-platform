import { BudgetLine, budgetCategoryOf, Vendor, vendorKind, type Budget, type Payment, type SavingsEntry, type Vendors } from './planner';

/**
 * Bring in a wedding budget kept in a spreadsheet: the sheets as rows of cells (read from an .xlsx in the
 * browser), recognised by their column headings, whatever the sheets are called:
 * - a budget tracker: Item, Vendor, and Estimate / Agreed (or Quote) / Paid: each row a budget line; a row
 *   with a vendor and an agreed price is a booked vendor;
 * - payments: Vendor, Amount, and the instalment's name, Due date, Paid? / Date paid: each vendor's schedule;
 * - savings: Date, Amount, Note: what was put away.
 * Rows run until a blank item or a TOTAL row. Dates may be spreadsheet serial numbers, yyyy-mm-dd,
 * dd/mm/yyyy or dd.mm.yy.
 */

export type Cell = string | number | boolean | null | undefined;
export type Sheet = { name: string; rows: Cell[][] };

const text = (c: Cell) => String(c ?? '').trim();
const amount = (c: Cell) => {
  if (typeof c === 'number') return Number.isFinite(c) ? Math.round(c * 100) / 100 : 0;
  const n = Number(text(c).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const pad = (n: number) => String(n).padStart(2, '0');

/** A date as yyyy-mm-dd ('' if it isn't one): a serial number (days since 30 Dec 1899), ISO, d/m/y or d.m.y. */
export function sheetDate(c: Cell): string {
  if (typeof c === 'number' && c > 20_000 && c < 80_000) return new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86_400_000).toISOString().slice(0, 10);
  const s = text(c);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    const d = +m[1]!;
    const mo = +m[2]!;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return '';
}

/** The first row whose cells match every heading; the column of each (and of any optional ones found there). */
function header(rows: Cell[][], need: RegExp[], optional: Record<string, RegExp> = {}) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = rows[r]!.map(text);
    const at = need.map((re) => cells.findIndex((c) => re.test(c)));
    if (at.every((i) => i >= 0)) {
      const opt: Record<string, number> = {};
      for (const [k, re] of Object.entries(optional)) opt[k] = cells.findIndex((c, i) => re.test(c) && !at.includes(i));
      return { row: r, at, opt };
    }
  }
  return null;
}

const notBooked = /^(not yet|tbc|tba|tbd|n\/?a|none|-+|\?+)\b/i;
const isYes = /^(y|yes|paid|done|true|✓|x)$/i;

export function readBudgetSheets(sheets: Sheet[]) {
  const lines: BudgetLine[] = [];
  const vendors: { name: string; category: string; quote: number; payments: Payment[] }[] = [];
  const savings: SavingsEntry[] = [];
  let n = 0;
  const id = (p: string) => `${p}${++n}`;

  for (const s of sheets) {
    // The budget tracker.
    const t = header(s.rows, [/^item|^what/i, /^vendor|^supplier/i], { estimate: /estimat|budget(ed)?$/i, agreed: /agreed|contract|quote|cost|price/i, paid: /^paid/i });
    if (t) {
      const [ci, cv] = t.at as [number, number];
      for (const row of s.rows.slice(t.row + 1)) {
        const item = text(row[ci]);
        if (!item || /^total/i.test(item)) break;
        const who = text(row[cv]);
        const estimate = t.opt.estimate! >= 0 ? amount(row[t.opt.estimate!]) : 0;
        const agreed = t.opt.agreed! >= 0 ? amount(row[t.opt.agreed!]) : 0;
        const paid = t.opt.paid! >= 0 ? amount(row[t.opt.paid!]) : 0;
        const booked = !!who && !notBooked.test(who) && agreed > 0;
        const category = budgetCategoryOf(vendorKind({ category: item, name: who }) ?? '');
        lines.push(BudgetLine.parse({ category, item, estimate: estimate || agreed, quote: agreed, paid, vendor: booked ? who : '' }));
        if (booked && !vendors.some((v) => v.name.toLowerCase() === who.toLowerCase())) vendors.push({ name: who, category: item, quote: agreed, payments: [] });
      }
      continue;
    }
    // Payments: each vendor's instalments.
    const p = header(s.rows, [/^vendor|^supplier/i, /amount/i], { label: /instal|install|payment|what|descr|stage/i, due: /due/i, paidFlag: /paid\??$|status/i, paidOn: /date paid|paid on/i });
    if (p) {
      const [cv, ca] = p.at as [number, number];
      for (const row of s.rows.slice(p.row + 1)) {
        const who = text(row[cv]);
        if (!who || /^total/i.test(who)) break;
        const amt = amount(row[ca]);
        if (!amt) continue;
        const paidOn = p.opt.paidOn! >= 0 ? sheetDate(row[p.opt.paidOn!]) : '';
        const paid = (p.opt.paidFlag! >= 0 && isYes.test(text(row[p.opt.paidFlag!]))) || !!paidOn;
        let v = vendors.find((x) => x.name.toLowerCase() === who.toLowerCase());
        if (!v) vendors.push((v = { name: who, category: '', quote: 0, payments: [] }));
        v.payments.push({ id: id('pay'), label: (p.opt.label! >= 0 && text(row[p.opt.label!])) || 'Payment', amount: amt, due: p.opt.due! >= 0 ? sheetDate(row[p.opt.due!]) : '', paid, paidOn });
      }
      continue;
    }
    // Savings: what was put away, when.
    const sv = header(s.rows, [/^date/i, /^amount/i], { note: /note|from|who|details/i });
    if (sv) {
      const [cd, ca] = sv.at as [number, number];
      for (const row of s.rows.slice(sv.row + 1)) {
        const date = sheetDate(row[cd]);
        const amt = amount(row[ca]);
        if (!date) {
          if (/^total/i.test(text(row[cd]))) break;
          continue;
        }
        if (!amt) continue;
        savings.push({ id: id('sav'), date, amount: amt, who: '', note: (sv.opt.note! >= 0 ? text(row[sv.opt.note!]) : '').slice(0, 120) });
      }
    }
  }
  // A vendor only in the payments sheet: its total is what its payments add up to.
  for (const v of vendors) if (!v.quote) v.quote = Math.round(v.payments.reduce((a, x) => a + x.amount, 0) * 100) / 100;
  // A booked line's "paid" is what its schedule says is paid.
  for (const l of lines) {
    const v = vendors.find((x) => l.vendor && x.name.toLowerCase() === l.vendor.toLowerCase());
    if (v?.payments.length) l.paid = Math.round(v.payments.filter((x) => x.paid).reduce((a, x) => a + x.amount, 0) * 100) / 100;
  }
  const total = Math.round(lines.reduce((a, l) => a + (l.quote || l.estimate), 0) * 100) / 100;
  return { lines, vendors, savings, total };
}
export type BudgetImport = ReturnType<typeof readBudgetSheets>;

/**
 * Merge an import into the planner: a vendor already there (same name) is updated (booked, its price and
 * schedule), others are added, booked; budget lines naming the same vendor or item are replaced, others
 * added; savings already logged (same date, amount and note) aren't repeated; the budget's total is set
 * only if it isn't yet. `newId` makes ids for new vendors.
 */
export function mergeImport(budget: Budget, doc: Vendors, imp: BudgetImport, newId: () => string) {
  const same = (a: string, b: string) => !!a.trim() && a.trim().toLowerCase() === b.trim().toLowerCase();
  let addedVendors = 0;
  let list = [...doc.list];
  for (const v of imp.vendors) {
    const i = list.findIndex((x) => same(x.name, v.name));
    if (i >= 0) {
      const x = list[i]!;
      list[i] = { ...x, status: 'booked', category: x.category || v.category, quote: v.quote || x.quote, payments: v.payments.length ? v.payments : x.payments, depositPaid: x.depositPaid || v.payments.some((p) => p.paid) };
    } else {
      addedVendors++;
      list = [...list, Vendor.parse({ id: newId(), name: v.name, category: v.category, status: 'booked', quote: v.quote, payments: v.payments, depositPaid: v.payments.some((p) => p.paid) })];
    }
  }
  let lines = [...budget.lines];
  for (const l of imp.lines) {
    const i = lines.findIndex((x) => (l.vendor && same(x.vendor, l.vendor)) || same(x.item, l.item));
    if (i >= 0) lines[i] = { ...lines[i]!, ...l, note: lines[i]!.note, payer: lines[i]!.payer };
    else lines = [...lines, l];
  }
  const had = budget.savings?.entries ?? [];
  const key = (e: SavingsEntry) => `${e.date}|${e.amount}|${e.note.toLowerCase()}`;
  const seen = new Set(had.map(key));
  const fresh = imp.savings.filter((e) => !seen.has(key(e)));
  return {
    budget: { ...budget, total: budget.total || imp.total, lines, savings: { entries: [...had, ...fresh].slice(-1000) } },
    vendors: { ...doc, list },
    counts: { vendors: imp.vendors.length, addedVendors, payments: imp.vendors.reduce((a, v) => a + v.payments.length, 0), lines: imp.lines.length, savings: fresh.length },
  };
}

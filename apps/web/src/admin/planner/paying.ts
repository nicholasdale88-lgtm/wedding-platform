import { lineFor, scheduleOf, type BudgetLine, type DuePayment, type Payment, type Vendor } from '@wp/shared';

const newId = () => crypto.randomUUID().slice(0, 8);

/** A vendor's schedule to change: its own, or (the first time) the one worked out for it, kept with fresh ids. */
export const ownSchedule = (v: Vendor, lines: BudgetLine[]): Payment[] => (v.payments.length ? v.payments : scheduleOf(v, lineFor(v, lines)).map((p) => ({ ...p, id: newId() })));

/**
 * Tick a payment off (or back on), wherever it lives: a vendor's schedule, or a budget line with no
 * booked vendor (paid in full). Returns the vendor list and budget lines as they should now be.
 */
export function markPaid(p: DuePayment, on: boolean, vendors: Vendor[], lines: BudgetLine[], today: string): { vendors: Vendor[]; lines: BudgetLine[] } {
  if (!p.vendorId) {
    // A budget line: "the rest" paid makes it paid in full; un-ticking takes off only that payment.
    const total = (l: BudgetLine) => l.quote || l.estimate;
    const rest = p.key.endsWith(':rest');
    return {
      vendors,
      lines: lines.map((l, i) => (i !== p.line ? l : { ...l, paid: on ? (rest ? total(l) : l.paid) : Math.max(0, Math.round((l.paid - p.amount) * 100) / 100) })),
    };
  }
  const v = vendors.find((x) => x.id === p.vendorId);
  if (!v) return { vendors, lines };
  // Payments worked out (not yet kept) are found by their place in the schedule.
  const id = p.key.slice(p.vendorId.length + 1);
  const at = scheduleOf(v, lineFor(v, lines)).findIndex((x) => x.id === id);
  const next = ownSchedule(v, lines).map((x, i) => (i === at ? { ...x, paid: on, paidOn: on ? today : '' } : x));
  return { vendors: vendors.map((x) => (x.id === v.id ? { ...x, payments: next } : x)), lines };
}

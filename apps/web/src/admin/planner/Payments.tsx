import { allPayments, dateIn, lineFor, moneyOf, type Budget as BudgetDoc, type DuePayment, type Payment, type Vendor, type Vendors as VendorsDoc } from '@wp/shared';
import { useEffect, useState } from 'react';
import { payRemindersApi, type PayReminders } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';
import { CalendarCard } from './CalendarCard';
import { MoneyInput } from './MoneyInput';
import { markPaid as paying, ownSchedule } from './paying';
import { useLiveDoc } from './useDocSave';

const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0);
const when = (d: string) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date yet');
const card = 'flex flex-col gap-3 p-5 rounded-[18px] border border-[#e2d7bc] bg-[#fbf8f0]';
const newId = () => crypto.randomUUID().slice(0, 8);

/**
 * Wedding planner → Payments: every vendor's payment schedule in one place. What's due next, what's overdue,
 * what's coming up, and each vendor's deposit and instalments (amount, due date, paid). A vendor's schedule
 * starts from what you already have (its budget line, or its quote's deposit and balance); change it here.
 */
export function Payments() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const vendorsDoc = useLiveDoc<VendorsDoc>(wid, 'vendors', '', toast);
  const budgetDoc = useLiveDoc<BudgetDoc>(wid, 'budget', '', toast);
  const [open, setOpen] = useState<string | null>(null);
  const error = vendorsDoc.error || budgetDoc.error;
  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!vendorsDoc.doc || !budgetDoc.doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading your payments…</div>;

  const vendors = vendorsDoc.doc.data.list;
  const lines = budgetDoc.doc.data.lines;
  const today = dateIn(overview?.wedding.timezone);
  const soon = new Date(Date.parse(today) + 30 * 86_400_000).toISOString().slice(0, 10);
  const all = allPayments(lines, vendors);
  const unpaid = all.filter((p) => !p.paid);
  const paid = all.filter((p) => p.paid);
  const total = all.reduce((a, p) => a + p.amount, 0);
  const paidSum = paid.reduce((a, p) => a + p.amount, 0);
  const next = unpaid.find((p) => p.due) ?? unpaid[0];
  const booked = vendors.filter((v) => v.status === 'booked');

  /** Change a vendor's schedule (the first change keeps what it started from, as payments of its own). */
  const editSchedule = (vid: string, fn: (ps: Payment[]) => Payment[]) =>
    vendorsDoc.update((d) => ({
      ...d,
      list: d.list.map((v) => (v.id !== vid ? v : { ...v, payments: fn(ownSchedule(v, lines)) })),
    }));
  /** Tick a payment off (or back on): a vendor's payment, or a budget line paid in full. */
  const markPaid = (p: DuePayment, on: boolean) => {
    const r = paying(p, on, vendors, lines, today);
    if (p.vendorId) vendorsDoc.update((d) => ({ ...d, list: r.vendors }));
    else budgetDoc.update((d) => ({ ...d, lines: r.lines }));
    if (on) toast(`${p.who}: ${aud(p.amount)} paid ✓`);
  };

  const groups: [string, DuePayment[], string][] = [
    ['Overdue', unpaid.filter((p) => p.due && p.due < today), '#7a4a37'],
    ['In the next 30 days', unpaid.filter((p) => p.due && p.due >= today && p.due <= soon), '#8a6d2f'],
    ['Later', unpaid.filter((p) => p.due > soon), '#5b6a52'],
    ['No date yet', unpaid.filter((p) => !p.due), '#7a7466'],
  ];

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Payments summary" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          ['All payments', aud(total), `${booked.length} booked ${booked.length === 1 ? 'vendor' : 'vendors'} and agreed budget lines`],
          ['Paid', aud(paidSum), total ? `${Math.round((paidSum / total) * 100)}% of it` : ''],
          ['Still to pay', aud(total - paidSum), `${unpaid.length} ${unpaid.length === 1 ? 'payment' : 'payments'}`],
          ['Next due', next ? aud(next.amount) : '—', next ? `${next.who} · ${when(next.due)}` : 'Nothing owing'],
        ].map(([k, v, sub]) => (
          <div key={k} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] min-w-0">
            <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">{k}</span>
            <span className="font-display text-[30px] leading-none">{v}</span>
            <span className={`text-[12px] truncate ${k === 'Next due' && next?.due && next.due < today ? 'text-[#7a4a37] font-semibold' : 'text-[#7a7466]'}`}>{sub}</span>
          </div>
        ))}
      </section>

      <Reminders wid={wid} />

      <section aria-label="Coming up" className={card}>
        <H2>Coming up</H2>
        {unpaid.length === 0 ? (
          <p className="m-0 text-[14px] text-[#5b6a52]">{all.length ? 'Everything is paid ✓' : 'Book a vendor (or add budget lines with a quote) and its payments show here.'}</p>
        ) : (
          groups
            .filter(([, ps]) => ps.length)
            .map(([title, ps, colour]) => (
              <div key={title} className="flex flex-col">
                <div className="flex justify-between text-[12px] font-semibold tracking-[.12em] uppercase pb-1" style={{ color: colour }}>
                  <span>{title}</span>
                  <span>{aud(ps.reduce((a, p) => a + p.amount, 0))}</span>
                </div>
                {ps.map((p) => (
                  <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center py-2 border-t border-[#ece3cd] text-[14px]">
                    <span className="min-w-0">
                      <span className="font-medium">{p.who}</span>
                      <span className="text-[#5b6a52]"> · {p.label}</span>
                      <span className="block text-[12px]" style={{ color: colour }}>
                        {when(p.due)}
                      </span>
                    </span>
                    <strong className="font-semibold tabular-nums">{aud(p.amount)}</strong>
                    <Pill size="sm" onClick={() => markPaid(p, true)}>
                      Paid
                    </Pill>
                  </div>
                ))}
              </div>
            ))
        )}
      </section>

      {booked.length > 0 && (
        <section aria-label="By vendor" className={card}>
          <div className="flex justify-between items-baseline gap-2 flex-wrap">
            <H2>By vendor</H2>
            <span className="text-[13px] text-[#5b6a52]">Open one to set its deposit and instalments.</span>
          </div>
          {booked.map((v) => (
            <VendorSchedule key={v.id} v={v} lines={lines} today={today} wedding={overview?.events[0] ? dateIn(overview.wedding.timezone, new Date(overview.events[0].startsAt)) : ''} open={open === v.id} onToggle={() => setOpen(open === v.id ? null : v.id)} edit={(fn) => editSchedule(v.id, fn)} />
          ))}
        </section>
      )}

      {paid.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer font-display text-[22px]">
            Paid · {paid.length} · {aud(paidSum)}
          </summary>
          {paid.map((p) => (
            <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center py-2 border-t border-[#ece3cd] text-[14px]">
              <span className="min-w-0">
                {p.who} <span className="text-[#5b6a52]">· {p.label}</span>
                {p.paidOn && <span className="block text-[12px] text-[#7a7466]">Paid {when(p.paidOn)}</span>}
              </span>
              <span className="tabular-nums">{aud(p.amount)}</span>
              <button type="button" onClick={() => markPaid(p, false)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[12px] text-[#5b6a52]">
                Not paid
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** One vendor: paid against the total, and (opened) its schedule to change. */
function VendorSchedule({ v, lines, today, wedding, open, onToggle, edit }: { v: Vendor; lines: BudgetDoc['lines']; today: string; wedding: string; open: boolean; onToggle: () => void; edit: (fn: (ps: Payment[]) => Payment[]) => void }) {
  const m = moneyOf(v, lineFor(v, lines));
  const pct = m.total ? Math.round((m.paid / m.total) * 100) : 0;
  const set = (i: number, patch: Partial<Payment>) => edit((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  /** Split what's not paid yet into equal payments a month apart, the last a month before the day (or from today). */
  const split = (n: number) =>
    edit((ps) => {
      const kept = ps.filter((p) => p.paid);
      const rest = m.total - kept.reduce((a, p) => a + p.amount, 0);
      if (rest <= 0) return ps;
      const each = Math.floor((rest / n) * 100) / 100;
      // A month apart from next month, but all paid by two weeks before the wedding (closer together if need be).
      const start = Date.parse(`${today}T00:00:00Z`);
      const lastBy = wedding ? Date.parse(`${wedding}T00:00:00Z`) - 14 * 86_400_000 : Infinity;
      const monthly = (i: number) => {
        const t = new Date(start);
        return Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + i + 1, 1);
      };
      const fits = monthly(n - 1) <= lastBy;
      const step = fits ? 0 : Math.max(86_400_000, (lastBy - start) / n);
      return [
        ...kept,
        ...Array.from({ length: n }, (_, i) => {
          const d = new Date(fits ? monthly(i) : start + step * (i + 1));
          return { id: newId(), label: i === n - 1 ? 'Final payment' : `Instalment ${i + 1}`, amount: i === n - 1 ? Math.round((rest - each * (n - 1)) * 100) / 100 : each, due: d.toISOString().slice(0, 10), paid: false, paidOn: '' };
        }),
      ];
    });
  return (
    <div className="flex flex-col border-t border-[#ece3cd] pt-2">
      <button type="button" aria-expanded={open} onClick={onToggle} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center p-0 border-0 bg-transparent text-left cursor-pointer text-[#33402f]">
        <span className="min-w-0 flex flex-col gap-1">
          <span className="text-[15px]">
            <span className="font-medium">{v.name}</span>
            {v.category && <span className="text-[#5b6a52]"> · {v.category}</span>}
          </span>
          <span className="h-[6px] rounded-full bg-[#e9e2cc] overflow-hidden">
            <span className="block h-full bg-[#5d6b47]" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-[12px] text-[#5b6a52]">
            {aud(m.paid)} of {aud(m.total)} paid
            {m.next ? ` · next ${aud(m.next.amount)} ${m.next.due ? when(m.next.due) : '(no date)'}` : m.total ? ' · all paid ✓' : ''}
          </span>
        </span>
        <span className="text-[13px] text-[#5b6a52]">{open ? 'Close' : `${m.schedule.length} ${m.schedule.length === 1 ? 'payment' : 'payments'} ›`}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 pt-3">
          {!v.payments.length && <p className="m-0 text-[12px] text-[#7a7466]">Worked out from its {lineFor(v, lines) ? 'budget line' : 'quote'}. Change anything and it’s kept as this vendor’s schedule.</p>}
          {m.schedule.map((p, i) => (
            <div key={p.id} className="grid gap-2 grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_auto_auto] items-end">
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                What
                <input value={p.label} maxLength={60} onChange={(e) => set(i, { label: e.target.value })} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                Amount
                <MoneyInput aria-label="Amount" value={p.amount} onValue={(amount) => set(i, { amount })} className={`${inputCls} text-right tabular-nums`} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                Due
                <input type="date" value={p.due} onChange={(e) => set(i, { due: e.target.value })} className={inputCls} />
              </label>
              <label className="flex items-center gap-2 text-[13px] pb-[10px]">
                <input type="checkbox" checked={p.paid} onChange={() => set(i, { paid: !p.paid, paidOn: p.paid ? '' : today })} className="w-[18px] h-[18px] accent-[#5d6b47]" />
                Paid
              </label>
              <button type="button" aria-label={`Remove ${p.label || 'payment'}`} onClick={() => edit((ps) => ps.filter((_, j) => j !== i))} className="w-9 h-9 mb-[2px] rounded-full border border-[#c6b794] bg-transparent cursor-pointer text-[#7a4a37] justify-self-end">
                ×
              </button>
            </div>
          ))}
          {m.unscheduled > 0 && <p className="m-0 text-[13px] text-[#8a6d2f]">{aud(m.unscheduled)} of the {aud(m.total)} isn’t in a payment yet.</p>}
          <div className="flex gap-2 flex-wrap">
            <Pill kind="dashed" size="sm" onClick={() => edit((ps) => [...ps, { id: newId(), label: ps.length ? `Instalment ${ps.length}` : 'Deposit', amount: m.unscheduled, due: '', paid: false, paidOn: '' }])}>
              + Add a payment
            </Pill>
            {m.owing > 0 &&
              [2, 3, 4].map((n) => (
                <Pill key={n} size="sm" onClick={() => split(n)}>
                  Split what’s owing into {n} monthly
                </Pill>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Reminders before each payment is due: a text to your own mobile (off until you switch it on), and your phone's calendar. */
function Reminders({ wid }: { wid: string }) {
  const toast = useToast();
  const [r, setR] = useState<PayReminders | null>(null);
  const [cal, setCal] = useState(false);
  useEffect(() => {
    payRemindersApi.get(wid).then(setR, () => setR(null));
  }, [wid]);
  const set = async (next: { on: boolean; days: number }) => {
    try {
      setR(await payRemindersApi.set(wid, next));
      toast(next.on ? `Reminder texts on: ${next.days} ${next.days === 1 ? 'day' : 'days'} before` : 'Reminder texts off');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  if (!r) return null;
  return (
    <section aria-label="Reminders" className={card}>
      <H2>Reminders</H2>
      <div className="flex gap-3 flex-wrap items-center text-[14px]">
        <label className={`flex items-center gap-2 ${r.hasMobile ? 'cursor-pointer' : 'opacity-60'}`}>
          <input type="checkbox" checked={r.on} disabled={!r.hasMobile} onChange={() => void set({ on: !r.on, days: r.days })} className="w-[18px] h-[18px] accent-[#5d6b47]" />
          Text me
        </label>
        <select aria-label="How long before" value={r.days} disabled={!r.hasMobile} onChange={(e) => void set({ on: r.on, days: Number(e.target.value) })} className={`${inputCls} py-[6px]`}>
          {[1, 3, 7, 14].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'day' : 'days'} before
            </option>
          ))}
        </select>
        <span>a payment is due</span>
      </div>
      <p className="m-0 text-[12px] text-[#7a7466]">
        {r.hasMobile
          ? `One text to your mobile listing what's due (never in quiet hours; each payment once). Each text uses SMS credit, about ${r.costCents < 1 ? 'a few cents' : `${Math.round(r.costCents)}c`}.`
          : 'Add your mobile in SMS setup to get reminder texts.'}{' '}
        Payments due in the next fortnight also show in Overview → Needs you.
      </p>
      {!cal ? (
        <button type="button" onClick={() => setCal(true)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
          Or put every payment in your phone’s calendar, with an alert three days before
        </button>
      ) : (
        <CalendarCard />
      )}
    </section>
  );
}

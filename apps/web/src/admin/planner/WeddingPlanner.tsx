import { commitmentOf, dateIn, daysUntil, type Budget as BudgetDoc, type PlanChecklist, type Vendors as VendorsDoc } from '@wp/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { plannerApi } from '../../lib/api';
import { confirmLeave } from '../leave';
import { useAdmin } from '../Shell';
import { Eyebrow, H2 } from '../ui';
import { Assistant } from './Assistant';
import { Budget } from './Budget';
import { Checklist, nextTasks } from './Checklist';
import { Gifts } from './Gifts';
import { Music } from './Music';
import { Print } from './Print';
import { ShotList } from './ShotList';
import { Transport } from './Transport';
import { CheckIn } from './CheckIn';
import { Vendors } from './Vendors';

/**
 * The wedding's own section → Wedding planner: everything for planning the day in one place. At a glance
 * (days to go, money, who's booked, what's still to book, payments coming up), Budget, Vendors (quotes,
 * comparisons, the finder near the venue) and the planning assistant. ?view= picks the page.
 */

type View = 'glance' | 'checklist' | 'budget' | 'vendors' | 'transport' | 'music' | 'photos' | 'print' | 'checkin' | 'gifts' | 'assistant';
const VIEWS: [View, string][] = [
  ['glance', 'At a glance'],
  ['checklist', 'Checklist'],
  ['budget', 'Budget'],
  ['vendors', 'Vendors'],
  ['transport', 'Transport'],
  ['music', 'Music'],
  ['photos', 'Photo list'],
  ['print', 'Print'],
  ['checkin', 'Check-in'],
  ['gifts', 'Gifts'],
  ['assistant', 'Assistant'],
];
/** What most Australian weddings book (a checklist of vendor kinds; matched loosely against yours). */
const USUAL: [string, RegExp][] = [
  ['Venue', /venue|reception|function/i],
  ['Celebrant', /celebrant|minister|officiant/i],
  ['Catering', /cater|food|chef/i],
  ['Photographer', /photo/i],
  ['Videographer', /video|film/i],
  ['Florist', /flor|flower/i],
  ['Music or DJ', /music|dj|band|singer/i],
  ['Hair and makeup', /hair|makeup|beauty/i],
  ['Cake', /cake|bak|pastr/i],
  ['Cars or transport', /car|transport|bus|limo|taxi/i],
  ['Stationery', /station|print|invit/i],
  ['Rings', /ring|jewel/i],
];
const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

export function WeddingPlanner() {
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find(([k]) => k === params.get('view'))?.[0] ?? 'glance') as View;
  const go = (v: View) => {
    if (!confirmLeave()) return; // unsaved budget, transport or run-sheet edits
    const n = new URLSearchParams(params);
    if (v === 'glance') n.delete('view');
    else n.set('view', v);
    setParams(n, { replace: false });
  };
  return (
    <div className="flex flex-col gap-5">
      <header>
        <Eyebrow>Wedding planner</Eyebrow>
        <h1 className="m-0 mt-[6px] font-display font-medium text-[40px] leading-[1.08]">Wedding planner</h1>
      </header>
      <nav aria-label="Wedding planner" className="flex gap-6 border-b border-[#e2d7bc] overflow-x-auto [scrollbar-width:none]">
        {VIEWS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-current={view === k ? 'page' : undefined}
            onClick={() => go(k)}
            className={`py-2 px-0 border-0 border-b-2 border-solid bg-transparent text-[15px] cursor-pointer -mb-px whitespace-nowrap ${view === k ? 'border-[#33402f] font-semibold text-[#33402f]' : 'border-transparent text-[#5b6a52]'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {view === 'glance' ? <Glance go={go} /> : view === 'checklist' ? <Checklist /> : view === 'budget' ? <Budget /> : view === 'vendors' ? <Vendors /> : view === 'transport' ? <Transport /> : view === 'music' ? <Music /> : view === 'photos' ? <ShotList /> : view === 'print' ? <Print /> : view === 'checkin' ? <CheckIn /> : view === 'gifts' ? <Gifts /> : <Assistant />}
    </div>
  );
}

function Glance({ go }: { go: (v: View) => void }) {
  const { wid, overview } = useAdmin();
  const [budget, setBudget] = useState<BudgetDoc | null>(null);
  const [vendors, setVendors] = useState<VendorsDoc['list'] | null>(null);
  const [plan, setPlan] = useState<PlanChecklist['tasks']>([]);
  useEffect(() => {
    plannerApi
      .doc<PlanChecklist>(wid, 'checklist')
      .then((r) => setPlan(r.data.tasks))
      .catch(() => setPlan([]));
    plannerApi
      .doc<BudgetDoc>(wid, 'budget')
      .then((r) => setBudget(r.data))
      .catch(() => setBudget({ total: 0, lines: [] }));
    plannerApi
      .doc<VendorsDoc>(wid, 'vendors')
      .then((r) => setVendors(r.data.list))
      .catch(() => setVendors([]));
  }, [wid]);
  if (!budget || !vendors) return <div aria-busy="true" className="text-[#5b6a52]">Loading your planner…</div>;

  const first = overview?.events[0];
  const tz = overview?.wedding.timezone;
  const days = first ? daysUntil(first.startsAt, tz) : null;
  const booked = vendors.filter((v) => v.status === 'booked');
  const named = new Set(budget.lines.map((l) => l.vendor.trim().toLowerCase()).filter(Boolean));
  const vendorCommit = booked.filter((v) => !named.has(v.name.trim().toLowerCase())).reduce((a, v) => a + commitmentOf(v).amount, 0);
  const committed = budget.lines.reduce((a, l) => a + (l.quote || l.estimate), 0) + vendorCommit;
  const paid = budget.lines.reduce((a, l) => a + l.paid, 0) + booked.filter((v) => !named.has(v.name.trim().toLowerCase()) && v.depositPaid).reduce((a, v) => a + commitmentOf(v).deposit, 0);
  const missing = USUAL.filter(([, re]) => !booked.some((v) => re.test(`${v.category} ${v.name}`)));
  const today = dateIn(tz);
  const payments = [
    ...budget.lines.filter((l) => l.due && (l.quote || l.estimate) > l.paid).map((l) => ({ what: l.item || l.category, due: l.due, amount: (l.quote || l.estimate) - l.paid })),
    ...booked.filter((v) => v.balanceDue && !named.has(v.name.trim().toLowerCase())).map((v) => ({ what: v.name, due: v.balanceDue, amount: commitmentOf(v).amount - (v.depositPaid ? commitmentOf(v).deposit : 0) })),
  ]
    .filter((p) => p.amount > 0)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 6);
  const expiring = vendors
    .flatMap((v) => v.quotes.filter((q) => v.status !== 'booked' && q.validUntil && q.validUntil >= today).map((q) => ({ v, q })))
    .sort((a, b) => a.q.validUntil.localeCompare(b.q.validUntil))
    .slice(0, 4);
  const pct = budget.total ? Math.min(100, Math.round((committed / budget.total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="At a glance" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <span className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">Days to go</span>
          <span className="font-display text-[34px] leading-none">{days === null ? '–' : Math.max(0, days)}</span>
        </div>
        <button type="button" onClick={() => go('budget')} className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] text-left cursor-pointer hover:bg-[#f3ecd6]">
          <span className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">Budget</span>
          <span className="font-display text-[26px] leading-none">{budget.total ? `${aud(committed)} of ${aud(budget.total)}` : 'Not set yet'}</span>
          {budget.total > 0 && (
            <span className="h-[6px] rounded-full bg-[#e9e2cc] overflow-hidden">
              <span className="block h-full" style={{ width: `${pct}%`, background: committed > budget.total ? '#7a4a37' : '#5d6b47' }} />
            </span>
          )}
        </button>
        <div className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <span className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">Paid so far</span>
          <span className="font-display text-[26px] leading-none">{aud(paid)}</span>
          <span className="text-[12px] text-[#7a7466]">{aud(Math.max(0, committed - paid))} still to pay</span>
        </div>
        <button type="button" onClick={() => go('vendors')} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] text-left cursor-pointer hover:bg-[#f3ecd6]">
          <span className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">Vendors booked</span>
          <span className="font-display text-[34px] leading-none">
            {booked.length}
            <span className="text-[16px] text-[#7a7466]"> of {vendors.length}</span>
          </span>
        </button>
      </section>

      <section aria-label="Next up" className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
        <div className="flex justify-between items-baseline gap-2">
          <H2>Next up</H2>
          <button type="button" onClick={() => go('checklist')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
            {plan.length ? 'The whole checklist' : 'Start your checklist'}
          </button>
        </div>
        {plan.length ? (
          nextTasks(plan, first ? Date.parse(first.startsAt) : null).map((t) => {
            const late = !!t.due && t.due.getTime() < Date.now();
            return (
              <div key={t.id} className="flex justify-between gap-3 text-[14px] py-1 border-t border-[#e2d7bc] first:border-t-0">
                <span className="min-w-0">
                  {t.legal && <span className="mr-2 py-[1px] px-2 rounded-full bg-[#f1e1d6] text-[#7a4a37] text-[11px] font-semibold">Legal</span>}
                  {t.text}
                </span>
                <span className={`flex-none ${late ? 'text-[#7a4a37] font-semibold' : 'text-[#5b6a52]'}`}>
                  {t.due ? `${late ? 'Overdue · ' : ''}${t.due.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                </span>
              </div>
            );
          })
        ) : (
          <span className="text-[14px] text-[#5b6a52]">The usual Australian plan, counted back from your date, including the Notice of Intended Marriage deadlines.</span>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Still to book" className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <H2>Still to book</H2>
          {missing.length ? (
            <div className="flex gap-2 flex-wrap">
              {missing.map(([label]) => (
                <span key={label} className="py-[5px] px-3 rounded-full border border-[#c6b794] text-[13px]">
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[14px] text-[#3d4a2f]">Everything usual is booked ✓</span>
          )}
          <button type="button" onClick={() => go('vendors')} className="self-start mt-1 p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
            Find vendors near the venue
          </button>
        </section>

        <section aria-label="Payments coming up" className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <H2>Payments coming up</H2>
          {payments.length ? (
            payments.map((p, i) => (
              <div key={i} className="flex justify-between gap-3 text-[14px] py-1 border-t border-[#e2d7bc] first:border-t-0">
                <span className="min-w-0 truncate">{p.what}</span>
                <span className="tabular-nums flex gap-3 flex-none">
                  <span className={p.due < today ? 'text-[#7a4a37] font-semibold' : 'text-[#5b6a52]'}>
                    {p.due < today ? 'Overdue ' : ''}
                    {new Date(`${p.due}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </span>
                  <strong className="font-semibold">{aud(p.amount)}</strong>
                </span>
              </div>
            ))
          ) : (
            <span className="text-[14px] text-[#5b6a52]">Nothing with a due date yet. Add due dates in Budget or on a booked vendor.</span>
          )}
        </section>
      </div>

      {expiring.length > 0 && (
        <section aria-label="Quotes to decide on" className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <H2>Quotes to decide on</H2>
          {expiring.map(({ v, q }) => (
            <div key={q.id} className="flex justify-between gap-3 text-[14px] py-1 border-t border-[#e2d7bc] first:border-t-0">
              <span className="min-w-0 truncate">
                {v.name} <span className="text-[#5b6a52]">· {aud(q.amount)}</span>
              </span>
              <span className="text-[#5b6a52] flex-none">valid until {new Date(`${q.validUntil}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Ask the assistant" className="flex justify-between items-center gap-3 flex-wrap p-4 rounded-[16px] bg-[#33402f] text-[#f3ecd6]">
        <span className="text-[15px]">Not sure what's next? The assistant knows your dates, budget, vendors and wedding party.</span>
        <button type="button" onClick={() => go('assistant')} className="py-2 px-4 rounded-full border-0 bg-[#f3ecd6] text-[#33402f] text-[14px] font-medium cursor-pointer">
          Ask the assistant
        </button>
      </section>
    </div>
  );
}

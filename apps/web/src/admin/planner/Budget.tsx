import { BUDGET_SPLIT, commitmentOf, dateIn, type Budget as BudgetDoc, type BudgetLine, type Vendors as VendorsDoc } from '@wp/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, plannerApi } from '../../lib/api';
import { useUnsavedChanges } from '../leave';
import { MoneyInput } from './MoneyInput';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Wedding planner → Budget: your total, each line's estimate, quote and what's paid, and what's still
 * owing by due date. Booked vendors' accepted quotes count as commitments (unless a line already names
 * that vendor). A typical Australian split gets you started; the charts show where the money is going.
 */

const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
const cost = (l: BudgetLine) => l.quote || l.estimate; // what it will cost: the quote once there is one
const BLANK: BudgetLine = { category: 'Other', item: '', estimate: 0, quote: 0, paid: 0, due: '', vendor: '', note: '', payer: '', perHead: 0 };
const PALETTE = ['#5d6b47', '#b39563', '#8a9670', '#7a4a37', '#3d5f92', '#c8a46a', '#46543a', '#9aa9c8', '#a06a52', '#6d7a47', '#d3c6a4', '#2f3d5c'];

function Money({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="relative">
      <span aria-hidden className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-[#7a7466]">
        $
      </span>
      <MoneyInput aria-label={label} value={value} placeholder="0" onValue={onChange} className={`${inputCls} w-full !pl-5 text-right tabular-nums`} />
    </span>
  );
}

export function Budget() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const [doc, setDoc] = useState<{ data: BudgetDoc; version: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [vendors, setVendors] = useState<VendorsDoc['list']>([]);

  const load = useCallback(async () => {
    try {
      const [b, v] = await Promise.all([plannerApi.doc<BudgetDoc>(wid, 'budget'), plannerApi.doc<VendorsDoc>(wid, 'vendors').catch(() => null)]);
      setDoc(b);
      setVendors(v?.data.list ?? []);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);

  // Per-guest lines: the estimate is the price times the guests, worked out afresh (replies keep coming in).
  const headcount = doc?.data.guests || overview?.perEvent?.[0]?.coming || 0;
  const b = useMemo(() => {
    const d = doc?.data;
    return d && { ...d, lines: d.lines.map((l) => (l.perHead > 0 ? { ...l, estimate: Math.round(l.perHead * headcount * 100) / 100 } : l)) };
  }, [doc, headcount]);
  // Booked vendors not already on a budget line, as lines of their own (read-only here; edit in Vendors).
  const commitments = useMemo(() => {
    const named = new Set((b?.lines ?? []).map((l) => l.vendor.trim().toLowerCase()).filter(Boolean));
    return vendors
      .filter((v) => v.status === 'booked' && !named.has(v.name.trim().toLowerCase()))
      .map((v) => {
        const c = commitmentOf(v);
        return { vendor: v, line: { category: v.category || 'Other', item: v.name, estimate: 0, quote: c.amount, paid: v.depositPaid ? c.deposit : 0, due: v.balanceDue, vendor: v.name, note: '', payer: '', perHead: 0 } as BudgetLine };
      });
  }, [b, vendors]);
  const sums = useMemo(() => {
    const lines = [...(b?.lines ?? []), ...commitments.map((x) => x.line)];
    const byCat = new Map<string, { cost: number; paid: number }>();
    for (const l of lines) {
      const x = byCat.get(l.category) ?? { cost: 0, paid: 0 };
      x.cost += cost(l);
      x.paid += l.paid;
      byCat.set(l.category, x);
    }
    const committed = lines.reduce((a, l) => a + cost(l), 0);
    const paid = lines.reduce((a, l) => a + l.paid, 0);
    const owing = lines.filter((l) => cost(l) > l.paid).sort((a, z) => (a.due || '9999').localeCompare(z.due || '9999'));
    return { byCat: [...byCat.entries()].sort((a, z) => z[1].cost - a[1].cost), committed, paid, owing };
  }, [b, commitments]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!doc || !b) return <div aria-busy="true" className="text-[#5b6a52]">Loading your budget…</div>;

  const edit = (next: BudgetDoc) => {
    setDoc({ ...doc, data: next });
    setDirty(true);
  };
  const priced = (l: BudgetLine, n = headcount): BudgetLine => (l.perHead > 0 ? { ...l, estimate: Math.round(l.perHead * n * 100) / 100 } : l);
  const setLine = (i: number, patch: Partial<BudgetLine>) => edit({ ...b, lines: b.lines.map((l, j) => (j === i ? priced({ ...l, ...patch }) : l)) });
  const setGuests = (n: number) => edit({ ...b, guests: n, lines: b.lines.map((l) => priced(l, n || overview?.perEvent?.[0]?.coming || 0)) });
  const save = async () => {
    setSaving(true);
    try {
      setDoc(await plannerApi.saveDoc(wid, 'budget', '', { ...b, lines: b.lines.filter((l) => l.item.trim() || l.estimate || l.quote || l.paid) }, doc.version));
      setDirty(false);
      toast('Budget saved');
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded. Make your change again.' : (e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setSaving(false);
    }
  };
  const coming = overview?.perEvent?.[0]?.coming ?? 0;
  // Who's paying for what (lines without a payer are the two of you).
  const payers = [...b.lines.reduce((m, l) => {
    const k = l.payer.trim() || 'Us';
    const x = m.get(k) ?? { cost: 0, paid: 0 };
    m.set(k, { cost: x.cost + (l.quote || l.estimate), paid: x.paid + l.paid });
    return m;
  }, new Map<string, { cost: number; paid: number }>())].sort((a, b2) => b2[1].cost - a[1].cost);
  const left = b.total - sums.committed;
  const cats = [...new Set([...BUDGET_SPLIT.map((x) => x.category), ...b.lines.map((l) => l.category)])];
  const colour = (cat: string) => PALETTE[Math.max(0, cats.indexOf(cat)) % PALETTE.length]!;
  const today = dateIn(overview?.wedding.timezone);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <H2>Budget</H2>
        <Pill kind="primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : dirty ? 'Save budget' : 'Saved'}
        </Pill>
      </header>

      <section aria-label="Totals" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <span className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">Our budget</span>
          <Money label="Total budget" value={b.total} onChange={(total) => edit({ ...b, total })} />
        </label>
        {[
          ['Committed', aud(sums.committed), sums.committed > b.total && b.total ? '#7a4a37' : undefined],
          ['Paid so far', aud(sums.paid), undefined],
          [left >= 0 ? 'Still to allocate' : 'Over budget', aud(Math.abs(left)), left < 0 ? '#7a4a37' : undefined],
        ].map(([k, v, c]) => (
          <div key={k} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <span className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">{k}</span>
            <span className="font-display text-[30px] leading-none" style={{ color: c }}>
              {v}
            </span>
          </div>
        ))}
      </section>

      <WhatIf guests={headcount} lines={b.lines} committed={sums.committed} total={b.total} setGuests={setGuests} saved={b.guests} />

      {b.total > 0 && (
        <section aria-label="Where the money goes" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <div className="flex justify-between items-baseline flex-wrap gap-2">
            <H2>Where it's going</H2>
            {coming > 0 && <span className="text-[13px] text-[#5b6a52]">{aud(sums.committed / coming)} per guest coming ({coming})</span>}
          </div>
          {/* The whole budget as one bar: each category's share, paid part solid. */}
          <div className="flex h-[22px] rounded-full overflow-hidden bg-[#e9e2cc]" role="img" aria-label={`${aud(sums.committed)} of ${aud(b.total)} committed`}>
            {sums.byCat.map(([cat, x]) => (
              <span key={cat} title={`${cat}: ${aud(x.cost)}`} style={{ width: `${Math.min(100, (x.cost / Math.max(b.total, sums.committed)) * 100)}%`, background: colour(cat) }} />
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {sums.byCat.map(([cat, x]) => (
              <div key={cat} className="flex flex-col gap-1">
                <div className="flex justify-between text-[14px]">
                  <span className="flex items-center gap-2">
                    <i className="w-[10px] h-[10px] rounded-full" style={{ background: colour(cat) }} />
                    {cat}
                  </span>
                  <span className="tabular-nums">
                    {aud(x.cost)} <span className="text-[#7a7466]">· {Math.round((x.cost / b.total) * 100)}%</span>
                  </span>
                </div>
                <div className="h-[6px] rounded-full bg-[#e9e2cc] overflow-hidden">
                  <div className="h-full" style={{ width: `${x.cost ? Math.min(100, (x.paid / x.cost) * 100) : 0}%`, background: colour(cat) }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {payers.length > 1 && (
        <section aria-label="Who's paying" className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <H2>Who’s paying</H2>
          {payers.map(([who, x]) => (
            <div key={who} className="flex justify-between gap-3 text-[14px]">
              <span>{who}</span>
              <span className="tabular-nums">
                <strong className="font-semibold">{aud(x.cost)}</strong>
                <span className="text-[#7a7466]"> · {aud(x.paid)} paid</span>
              </span>
            </div>
          ))}
        </section>
      )}

      {commitments.length > 0 && (
        <section aria-label="Commitments" className="flex flex-col gap-2">
          <div className="flex justify-between items-baseline gap-2 flex-wrap">
            <H2>Commitments</H2>
            <span className="text-[13px] text-[#5b6a52]">Vendors you've booked, from their accepted quote. Change them under Vendors.</span>
          </div>
          {commitments.map(({ vendor: v, line: l }) => (
            <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 border-t border-[#e2d7bc] text-[14px]">
              <span className="min-w-0">
                <span className="font-medium">{v.name}</span>
                <span className="text-[#5b6a52]">
                  {' '}
                  · {l.category}
                  {v.depositPaid ? ` · deposit paid` : commitmentOf(v).deposit ? ` · deposit ${aud(commitmentOf(v).deposit)} to pay` : ''}
                  {l.due ? ` · balance due ${new Date(`${l.due}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </span>
              </span>
              <span className="tabular-nums text-right">
                <strong className="font-semibold">{aud(l.quote)}</strong>
                {l.quote > l.paid && <span className="block text-[12px] text-[#7a7466]">{aud(l.quote - l.paid)} to pay</span>}
              </span>
            </div>
          ))}
        </section>
      )}

      {sums.owing.length > 0 && (
        <section aria-label="Still owing" className="flex flex-col gap-2">
          <H2>Still owing</H2>
          {sums.owing.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 py-2 border-t border-[#e2d7bc] text-[14px]">
              <span>
                {l.item || l.category}
                {l.vendor ? <span className="text-[#5b6a52]"> · {l.vendor}</span> : null}
              </span>
              <span className="tabular-nums flex gap-3">
                {l.due && <span className={l.due < today ? 'text-[#7a4a37] font-semibold' : 'text-[#5b6a52]'}>{l.due < today ? 'Overdue ' : 'Due '}{new Date(`${l.due}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                <strong className="font-semibold">{aud(cost(l) - l.paid)}</strong>
              </span>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Budget lines" className="flex flex-col gap-3">
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <H2>Lines</H2>
          {!b.lines.length && (
            <Pill
              kind="dashed"
              disabled={!b.total}
              title={b.total ? '' : 'Enter your total budget first'}
              onClick={() => edit({ ...b, lines: BUDGET_SPLIT.map((x) => ({ ...BLANK, category: x.category, item: x.category, estimate: Math.round(b.total * x.share) })) })}
            >
              Start with a typical Australian split
            </Pill>
          )}
        </div>
        <datalist id="budget-payers">
          <option value="Us" />
          <option value={`${overview?.wedding.name1.split(' ')[0] ?? 'Her'}'s family`} />
          <option value={`${overview?.wedding.name2.split(' ')[0] ?? 'His'}'s family`} />
        </datalist>
        <datalist id="budget-cats">
          {cats.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {b.lines.map((l, i) => (
          <div key={i} className="grid gap-2 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0] grid-cols-2 md:grid-cols-[1.1fr_1.3fr_.8fr_.7fr_.8fr_.8fr_1fr_.9fr_auto] items-end">
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Category
              <input list="budget-cats" value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              What
              <input value={l.item} onChange={(e) => setLine(i, { item: e.target.value })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              {l.perHead > 0 ? `Estimate (${aud(l.perHead)} × ${headcount})` : 'Estimate'}
              {l.perHead > 0 ? (
                <span className={`${inputCls} text-right tabular-nums bg-[#f3ecd6]`}>{aud(l.estimate)}</span>
              ) : (
                <Money label="Estimate" value={l.estimate} onChange={(estimate) => setLine(i, { estimate })} />
              )}
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Per guest
              <Money label="Per guest" value={l.perHead} onChange={(perHead) => setLine(i, { perHead })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Quote
              <Money label="Quote" value={l.quote} onChange={(quote) => setLine(i, { quote })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Paid
              <Money label="Paid" value={l.paid} onChange={(paid) => setLine(i, { paid })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Rest due
              <input type="date" value={l.due} onChange={(e) => setLine(i, { due: e.target.value })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] col-span-2 md:col-span-1">
              Paid by
              <input list="budget-payers" placeholder="Us" value={l.payer} onChange={(e) => setLine(i, { payer: e.target.value })} className={inputCls} />
            </label>
            <button type="button" aria-label="Remove line" onClick={() => edit({ ...b, lines: b.lines.filter((_, j) => j !== i) })} className="w-9 h-9 mb-[2px] rounded-full border border-[#c6b794] bg-transparent cursor-pointer text-[#7a4a37] justify-self-end">
              ×
            </button>
          </div>
        ))}
        <Pill kind="dashed" className="self-start" onClick={() => edit({ ...b, lines: [...b.lines, { ...BLANK }] })}>
          + Add a line
        </Pill>
      </section>
    </div>
  );
}

/**
 * The guest count your per-guest lines are priced for, and "what if": slide the number and see what the
 * per-guest lines (catering, drinks) would add or save.
 */
function WhatIf({ guests, lines, committed, total, setGuests, saved }: { guests: number; lines: BudgetLine[]; committed: number; total: number; setGuests: (n: number) => void; saved: number }) {
  const perHead = lines.reduce((a, l) => a + (l.perHead > 0 && !l.quote ? l.perHead : 0), 0);
  const [delta, setDelta] = useState(0);
  if (!perHead && !saved) {
    return (
      <p className="m-0 text-[13px] text-[#5b6a52]">
        Tip: give catering or drinks a price per guest (on its line) and the budget follows your guest count, with a “what if” for more or fewer guests.
      </p>
    );
  }
  const change = perHead * delta;
  return (
    <section aria-label="Guests and what if" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          Guests the per-guest lines are priced for
          <input type="number" min={0} max={5000} value={saved || guests} onChange={(e) => setGuests(Math.max(0, Math.min(5000, Number(e.target.value) || 0)))} className={`${inputCls} w-[120px]`} />
        </label>
        <span className="text-[13px] text-[#5b6a52]">{aud(perHead)} a guest across your per-guest lines</span>
      </div>
      <label className="flex flex-col gap-1 text-[13px]">
        <span>
          What if {delta >= 0 ? `${delta} more` : `${-delta} fewer`} {Math.abs(delta) === 1 ? 'guest' : 'guests'}?
        </span>
        <input type="range" min={-Math.min(50, guests)} max={50} value={delta} onChange={(e) => setDelta(Number(e.target.value))} className="accent-[#5d6b47]" />
      </label>
      {delta !== 0 && perHead > 0 && (
        <div className="text-[15px]">
          {guests + delta} guests: <strong className="font-semibold">{change > 0 ? '+' : '−'}{aud(Math.abs(change))}</strong>, about {aud(committed + change)} in all
          {total > 0 && <span className={committed + change > total ? ' text-[#7a4a37] font-semibold' : ' text-[#5b6a52]'}>{committed + change > total ? ` · ${aud(committed + change - total)} over budget` : ` · ${aud(total - committed - change)} under budget`}</span>}
        </div>
      )}
    </section>
  );
}

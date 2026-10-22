import { BUDGET_SPLIT, dateIn, moneyOf, savingsPlan, splitOf, standardLines, withSchedules, type SavingsEntry, type Budget as BudgetDoc, type BudgetLine, type Vendors as VendorsDoc } from '@wp/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, plannerApi } from '../../lib/api';
import { useUnsavedChanges } from '../leave';
import { BudgetImport } from './BudgetImport';
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
  const headcount = doc?.data.guests || overview?.expectedGuests || overview?.perEvent?.[0]?.coming || 0;
  const b = useMemo(() => {
    const d = doc?.data;
    return d && { ...d, split: d.split ?? {}, lines: d.lines.map((l) => (l.perHead > 0 ? { ...l, estimate: Math.round(l.perHead * headcount * 100) / 100 } : l)) };
  }, [doc, headcount]);
  // What each line shows: a booked vendor's payment schedule applied (for showing only: saved lines keep what you typed).
  const shown = useMemo(() => (b ? withSchedules(b.lines, vendors) : []), [b, vendors]);
  // Lines whose vendor has a payment schedule: the quote, paid and due come from Payments.
  const scheduled = (l: BudgetLine) => vendors.some((v) => v.status === 'booked' && v.payments.length && !!l.vendor.trim() && v.name.trim().toLowerCase() === l.vendor.trim().toLowerCase());
  // Booked vendors not already on a budget line, as lines of their own (read-only here; edit in Vendors).
  const commitments = useMemo(() => {
    const named = new Set((b?.lines ?? []).map((l) => l.vendor.trim().toLowerCase()).filter(Boolean));
    return vendors
      .filter((v) => v.status === 'booked' && !named.has(v.name.trim().toLowerCase()))
      .map((v) => {
        const m = moneyOf(v);
        return { vendor: v, line: { category: v.category || 'Other', item: v.name, estimate: 0, quote: m.total, paid: m.paid, due: m.next?.due ?? '', vendor: v.name, note: '', payer: '', perHead: 0 } as BudgetLine };
      });
  }, [b, vendors]);
  const sums = useMemo(() => {
    const lines = [...shown, ...commitments.map((x) => x.line)];
    const byCat = new Map<string, { cost: number; paid: number }>();
    for (const l of lines) {
      const x = byCat.get(l.category) ?? { cost: 0, paid: 0 };
      x.cost += cost(l);
      x.paid += l.paid;
      byCat.set(l.category, x);
    }
    const committed = lines.reduce((a, l) => a + cost(l), 0);
    const paid = lines.reduce((a, l) => a + l.paid, 0);
    // Still owing: what's agreed (a quote, a payment or a due date), not plans.
    const owing = lines.filter((l) => (l.quote || l.paid || l.due) && cost(l) > l.paid).sort((a, z) => (a.due || '9999').localeCompare(z.due || '9999'));
    return { byCat: [...byCat.entries()].sort((a, z) => z[1].cost - a[1].cost), committed, paid, owing };
  }, [shown, commitments]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!doc || !b) return <div aria-busy="true" className="text-[#5b6a52]">Loading your budget…</div>;

  const edit = (next: BudgetDoc) => {
    setDoc({ ...doc, data: next });
    setDirty(true);
  };
  const priced = (l: BudgetLine, n = headcount): BudgetLine => (l.perHead > 0 ? { ...l, estimate: Math.round(l.perHead * n * 100) / 100 } : l);
  const setLine = (i: number, patch: Partial<BudgetLine>) => edit({ ...b, lines: b.lines.map((l, j) => (j === i ? priced({ ...l, ...patch }) : l)) });
  const setGuests = (n: number) => edit({ ...b, guests: n, lines: b.lines.map((l) => priced(l, n || overview?.expectedGuests || overview?.perEvent?.[0]?.coming || 0)) });
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
  /** Saves straight away (savings are added one at a time): any other unsaved changes go with it. */
  const saveWith = async (next: BudgetDoc, done: string) => {
    setSaving(true);
    try {
      setDoc(await plannerApi.saveDoc(wid, 'budget', '', { ...next, lines: next.lines.filter((l) => l.item.trim() || l.estimate || l.quote || l.paid) }, doc.version));
      setDirty(false);
      toast(done);
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded. Add it again.' : (e as Error).message);
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

      <BudgetImport budget={b} prominent={!b.lines.some((l) => l.quote || l.paid)} onDone={load} />

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

      <SavingUp
        entries={b.savings?.entries ?? []}
        owing={sums.owing.map((l) => ({ label: l.vendor || l.item || l.category, due: l.due, amount: Math.max(0, cost(l) - l.paid) }))}
        today={today}
        weddingDay={overview?.events[0]?.startsAt ? dateIn(overview.wedding.timezone, new Date(overview.events[0].startsAt)) : ''}
        names={overview ? [overview.wedding.name1.split(' ')[0] ?? '', overview.wedding.name2.split(' ')[0] ?? ''] : []}
        busy={saving}
        onChange={(entries, done) => void saveWith({ ...b, savings: { entries } }, done)}
      />

      <Plan
        b={b}
        guests={headcount}
        coming={coming}
        planned={new Map(sums.byCat.map(([cat, x]) => [cat, x.cost]))}
        onGuests={setGuests}
        onSplit={(split) => edit({ ...b, split })}
        onStandard={() => {
          const add = standardLines(b, headcount);
          edit({ ...b, lines: [...b.lines, ...add] });
          toast(`${add.length} standard lines added from your budget${headcount ? ` and ${headcount} guests` : ''}. Change any of them below, then save.`);
        }}
      />

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
            <span className="text-[13px] text-[#5b6a52]">Vendors you've booked. Their payments are in Payments.</span>
          </div>
          {commitments.map(({ vendor: v, line: l }) => (
            <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 border-t border-[#e2d7bc] text-[14px]">
              <span className="min-w-0">
                <span className="font-medium">{v.name}</span>
                <span className="text-[#5b6a52]">
                  {' '}
                  · {l.category}
                  {l.paid ? ` · ${aud(l.paid)} paid` : ''}
                  {l.due ? ` · next payment ${new Date(`${l.due}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </span>
              </span>
              <span className="tabular-nums text-right">
                <strong className="font-semibold">{aud(l.quote)}</strong>
                {l.quote > l.paid && <span className="block text-[12px] text-[#7a7466]">{aud(l.quote - l.paid)} to pay</span>}
              </span>
              {b.lines.some((x) => !x.vendor.trim()) && (
                <label className="col-span-2 flex items-center gap-2 text-[12px] text-[#5b6a52]">
                  Already planned for in the budget?
                  <select
                    value=""
                    onChange={(e) => {
                      const at = Number(e.target.value);
                      if (Number.isNaN(at)) return;
                      setLine(at, { vendor: v.name });
                      toast(`${v.name} is on "${b.lines[at]?.item || b.lines[at]?.category}": counted once`);
                    }}
                    className="py-[4px] px-2 border border-[#d3c6a4] rounded-[8px] bg-white text-[13px] max-w-[60%]"
                  >
                    <option value="">Link to a line…</option>
                    {b.lines
                      .map((x, at) => ({ x, at }))
                      .filter(({ x }) => !x.vendor.trim())
                      .sort((p, q) => Number(q.x.category === l.category) - Number(p.x.category === l.category))
                      .map(({ x, at }) => (
                        <option key={at} value={at}>
                          {x.item || x.category} · {aud(x.quote || x.estimate)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
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
              onClick={() => edit({ ...b, lines: standardLines(b, headcount) })}
            >
              Start with the standard categories
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
          <div key={i} className="grid gap-2 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0] grid-cols-2 md:grid-cols-[1fr_1.2fr_.8fr_.7fr_.8fr_.8fr_1fr_1fr_.8fr_auto] items-end">
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
            {scheduled(l) ? (
              <>
                <span className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                  Quote
                  <span className={`${inputCls} text-right tabular-nums bg-[#f3ecd6]`}>{aud(shown[i]?.quote ?? l.quote)}</span>
                </span>
                <span className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                  Paid
                  <span className={`${inputCls} text-right tabular-nums bg-[#f3ecd6]`}>{aud(shown[i]?.paid ?? l.paid)}</span>
                </span>
                <span className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                  Next due (from Payments)
                  <span className={`${inputCls} bg-[#f3ecd6]`}>{shown[i]?.due ? new Date(`${shown[i]!.due}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</span>
                </span>
              </>
            ) : (
              <>
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
              </>
            )}
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Vendor
              <select value={vendors.find((v) => v.name.trim().toLowerCase() === l.vendor.trim().toLowerCase())?.name ?? ''} onChange={(e) => setLine(i, { vendor: e.target.value })} className={inputCls}>
                <option value="">None yet</option>
                {vendors
                  .filter((v) => v.status !== 'declined')
                  .map((v) => (
                    <option key={v.id} value={v.name}>
                      {v.name}
                      {v.status === 'booked' ? ' (booked)' : ''}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
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

/**
 * Your plan: the total worked out per guest and per table, and per category (your split, the usual one to
 * start) against what's planned in each, with what's left. The shares can be changed; the standard lines
 * can be added in one go, priced from the total and the guests.
 */
function Plan({ b, guests, coming, planned, onGuests, onSplit, onStandard }: { b: BudgetDoc; guests: number; coming: number; planned: Map<string, number>; onGuests: (n: number) => void; onSplit: (split: BudgetDoc['split']) => void; onStandard: () => void }) {
  const [open, setOpen] = useState(false);
  const split = splitOf(b);
  const missing = standardLines(b, guests).length;
  const shareSum = split.reduce((a, x) => a + x.share, 0);
  const others = [...planned.entries()].filter(([cat]) => !split.some((x) => x.category === cat));
  const card = 'flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]';
  if (!b.total) {
    return (
      <section aria-label="Your plan" className={card}>
        <H2>Your plan</H2>
        <p className="m-0 text-[14px] text-[#5b6a52]">Enter your total budget above: it’s worked out per guest, per table and for each category (venue and catering, photography, flowers…), with the standard lines to start from.</p>
      </section>
    );
  }
  const perGuest = guests ? b.total / guests : 0;
  return (
    <section aria-label="Your plan" className={card}>
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <H2>Your plan</H2>
        {missing > 0 && (
          <Pill kind="outline" size="sm" onClick={onStandard}>
            Add the standard lines ({missing})
          </Pill>
        )}
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          Guests you’re planning for
          <input
            type="number"
            min={0}
            max={5000}
            value={b.guests || ''}
            placeholder={coming ? `${coming} coming so far` : 'e.g. 100'}
            onChange={(e) => onGuests(Math.max(0, Math.min(5000, Number(e.target.value) || 0)))}
            className={`${inputCls} w-full`}
          />
        </label>
        {[
          ['Per guest', guests ? aud(perGuest) : '—', guests ? `${aud(b.total)} for ${guests} guests` : 'Enter your guests'],
          ['Per table of 10', guests ? aud(perGuest * 10) : '—', 'Handy when adding or cutting a table'],
          ['Catering and drinks', guests ? `${aud(((split.find((x) => x.category === 'Venue and catering')?.share ?? 0.44) * b.total * (0.28 / 0.44)) / guests)} a head` : '—', 'What your plan allows per guest'],
        ].map(([k, v, sub]) => (
          <div key={k} className="flex flex-col gap-1">
            <span className="text-[12px] text-[#5b6a52]">{k}</span>
            <span className="font-display text-[26px] leading-none">{v}</span>
            <span className="text-[12px] text-[#7a7466]">{sub}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px] sm:min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] tracking-[.12em] uppercase text-[#5b6a52]">
              <th className="py-1 font-semibold">Category</th>
              <th className={`py-1 font-semibold text-right ${open ? '' : 'hidden sm:table-cell'}`}>Share</th>
              <th className="py-1 font-semibold text-right">Allowed</th>
              <th className="py-1 font-semibold text-right">Planned</th>
              <th className="py-1 font-semibold text-right">Left</th>
              <th className="py-1 font-semibold text-right hidden sm:table-cell">Per guest</th>
            </tr>
          </thead>
          <tbody>
            {split.map(({ category, share }) => {
              const allowed = b.total * share;
              const have = planned.get(category) ?? 0;
              const left = allowed - have;
              return (
                <tr key={category} className="border-t border-[#ece3cd]">
                  <td className="py-[6px]">{category}</td>
                  <td className={`py-[6px] text-right ${open ? '' : 'hidden sm:table-cell'}`}>
                    {open ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`${category} share`}
                        value={Math.round(share * 1000) / 10}
                        onChange={(e) => onSplit({ ...b.split, [category]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 })}
                        className="w-[64px] py-[2px] px-2 border border-[#d3c6a4] rounded-[8px] bg-white text-right"
                      />
                    ) : (
                      <span className={b.split[category] !== undefined ? 'font-semibold' : 'text-[#5b6a52]'}>{Math.round(share * 1000) / 10}%</span>
                    )}
                  </td>
                  <td className="py-[6px] text-right tabular-nums">{aud(allowed)}</td>
                  <td className="py-[6px] text-right tabular-nums">{have ? aud(have) : <span className="text-[#a39d8e]">—</span>}</td>
                  <td className={`py-[6px] text-right tabular-nums ${left < 0 ? 'text-[#7a4a37] font-semibold' : have ? 'text-[#3d4a2f]' : 'text-[#7a7466]'}`}>{left < 0 ? `${aud(-left)} over` : aud(left)}</td>
                  <td className="py-[6px] text-right tabular-nums text-[#5b6a52] hidden sm:table-cell">{guests ? aud(allowed / guests) : '—'}</td>
                </tr>
              );
            })}
            {others.map(([cat, have]) => (
              <tr key={cat} className="border-t border-[#ece3cd] text-[#5b6a52]">
                <td className="py-[6px]">{cat}</td>
                <td className={`py-[6px] text-right ${open ? '' : 'hidden sm:table-cell'}`}>—</td>
                <td className="py-[6px] text-right">—</td>
                <td className="py-[6px] text-right tabular-nums">{aud(have)}</td>
                <td className="py-[6px]" />
                <td className="py-[6px] text-right tabular-nums hidden sm:table-cell">{guests ? aud(have / guests) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 flex-wrap items-center text-[13px]">
        <button type="button" onClick={() => setOpen(!open)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
          {open ? 'Done changing the split' : 'Change the split'}
        </button>
        {Object.keys(b.split).length > 0 && (
          <button type="button" onClick={() => onSplit({})} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
            Back to the usual split
          </button>
        )}
        {Math.abs(shareSum - 1) > 0.001 && (
          <span className={shareSum > 1 ? 'text-[#7a4a37] font-semibold' : 'text-[#8a6d2f]'}>
            The shares add to {Math.round(shareSum * 1000) / 10}%{shareSum < 1 ? ` (${aud(b.total * (1 - shareSum))} not given to a category yet)` : ' (more than your budget)'}
          </span>
        )}
        <span className="text-[#7a7466]">The usual split is what Australian couples typically spend; yours can be anything.</span>
      </div>
    </section>
  );
}

/**
 * Saving up: what you've put away for the wedding against what's still to pay your vendors, how much a
 * month gets you there by the day, and the first payment your savings won't cover by its date.
 */
function SavingUp({
  entries,
  owing,
  today,
  weddingDay,
  names,
  busy,
  onChange,
}: {
  entries: SavingsEntry[];
  owing: { label: string; due: string; amount: number }[];
  today: string;
  weddingDay: string;
  names: string[];
  busy: boolean;
  onChange: (entries: SavingsEntry[], done: string) => void;
}) {
  const [amount, setAmount] = useState(0);
  const [who, setWho] = useState('');
  const [note, setNote] = useState('');
  const [out, setOut] = useState(false);
  const [all, setAll] = useState(false);
  const p = savingsPlan(entries, owing, today, weddingDay);
  const pct = p.toPay > 0 ? Math.min(100, Math.round((Math.max(0, p.saved) / p.toPay) * 100)) : 0;
  const add = () => {
    if (!amount) return;
    const e: SavingsEntry = { id: crypto.randomUUID().slice(0, 12), date: today, amount: out ? -Math.abs(amount) : Math.abs(amount), who, note: note.trim().slice(0, 120) };
    onChange([e, ...entries], out ? `${aud(Math.abs(amount))} taken out` : `${aud(Math.abs(amount))} put away`);
    setAmount(0);
    setNote('');
    setOut(false);
  };
  const list = [...entries].sort((a, z) => z.date.localeCompare(a.date));
  return (
    <section aria-label="Saving up" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-baseline flex-wrap gap-2">
        <H2>Saving up</H2>
        <span className="text-[13px] text-[#5b6a52]">What you’ve put away to pay your vendors</span>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          ['Saved', aud(p.saved), undefined],
          ['Still to pay', aud(p.toPay), undefined],
          [p.short ? 'Still to save' : 'Covered', p.short ? aud(p.short) : '✓', p.short ? '#7a4a37' : '#3d4a2f'],
          ['A month to be ready', p.short ? aud(p.perMonth) : '—', undefined],
        ].map(([k, v, c]) => (
          <div key={k} className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold tracking-[.12em] uppercase text-[#5b6a52]">{k}</span>
            <span className="font-display text-[26px] leading-none" style={{ color: c }}>
              {v}
            </span>
          </div>
        ))}
      </div>
      {p.toPay > 0 && (
        <div className="h-[14px] rounded-full overflow-hidden bg-[#e9e2cc]" role="img" aria-label={`${pct}% of what's still to pay is saved`}>
          <div className="h-full bg-[#5d6b47]" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="m-0 text-[14px] text-[#5b6a52]">
        {p.toPay === 0
          ? 'Book vendors (or add what they cost below) and this shows how much to put away each month.'
          : p.short
            ? `Put away about ${aud(p.perMonth)} a month for the ${p.months} ${p.months === 1 ? 'month' : 'months'} until the wedding.${p.pace ? ` You’ve averaged ${aud(p.pace)} a month so far.` : ''}`
            : 'You’ve saved enough for everything still to pay. 🎉'}
      </p>
      {p.gap && (
        <p role="alert" className="m-0 py-2 px-3 rounded-[10px] bg-[#f4dcd2] text-[14px] text-[#7a4a37]">
          At your pace, you’ll be about {aud(p.gap.by)} short for {p.gap.label} on {new Date(`${p.gap.due}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}.
        </p>
      )}
      <form
        className="flex gap-2 flex-wrap items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] w-[140px]">
          Amount
          <MoneyInput aria-label="Amount" value={amount} placeholder="0" onValue={setAmount} className={`${inputCls} !pl-5 text-right tabular-nums`} />
        </label>
        {names.filter(Boolean).length > 0 && (
          <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
            Who
            <select value={who} onChange={(e) => setWho(e.target.value)} className={inputCls}>
              <option value="">Both of us</option>
              {names.filter(Boolean).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="Family">Family</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] flex-1 min-w-[150px]">
          Note
          <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="e.g. pay day, tax return" className={inputCls} />
        </label>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer pb-2">
          <input type="checkbox" checked={out} onChange={(e) => setOut(e.target.checked)} className="accent-[#5d6b47]" />
          Taken out
        </label>
        <Pill kind="primary" type="submit" disabled={!amount || busy}>
          {out ? 'Take out' : 'Put away'}
        </Pill>
      </form>
      {list.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#ece3cd] text-[14px]">
          {(all ? list : list.slice(0, 5)).map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <span className="w-[90px] text-[#5b6a52] tabular-nums">{new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              <span className="flex-1 min-w-0 truncate">
                {[e.who || 'Both of us', e.note].filter(Boolean).join(' · ')}
              </span>
              <span className={`tabular-nums ${e.amount < 0 ? 'text-[#7a4a37]' : ''}`}>{e.amount < 0 ? `−${aud(-e.amount)}` : aud(e.amount)}</span>
              <button type="button" aria-label="Remove" disabled={busy} onClick={() => onChange(entries.filter((x) => x.id !== e.id), 'Removed')} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px]">
                ×
              </button>
            </li>
          ))}
          {list.length > 5 && (
            <li className="py-2">
              <button type="button" onClick={() => setAll(!all)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f] text-[13px]">
                {all ? 'Show fewer' : `Show all ${list.length}`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

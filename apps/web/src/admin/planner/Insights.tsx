import { allPayments, BUDGET_SPLIT, bookingTimeline, moneyOf, withSchedules, dateIn, daysUntil, type Budget, type Gifts, type PlanChecklist, type Vendors } from '@wp/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { insightsApi, plannerApi, type InsightsData } from '../../lib/api';
import { Ring } from '../checklists/PhasedChecklist';
import { useAdmin } from '../Shell';
import { H2 } from '../ui';

const DAY = 86_400_000;
const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const card = 'flex flex-col gap-3 p-5 rounded-[18px] border border-[#e2d7bc] bg-[#fbf8f0]';

/** A row of bars: label, the bar, the figure. */
function Bars({ rows, max }: { rows: { label: string; value: number; note?: string; colour?: string }[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] gap-3 items-center text-[13px]">
          <span className="truncate text-[#33402f]">{r.label}</span>
          <span className="h-[10px] rounded-full bg-[#e9e2cc] overflow-hidden">
            <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (r.value / top) * 100)}%`, background: r.colour ?? '#5d6b47' }} />
          </span>
          <span className="tabular-nums text-[#5b6a52] whitespace-nowrap">{r.note ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Who to chase: still to reply, split by whether they've opened their invitation (each opens their guest card). */
function Chase({ rows, tz }: { rows: InsightsData['chase']; tz: string | undefined }) {
  const { path } = useAdmin();
  const opened = rows.filter((r) => r.opened);
  const unopened = rows.filter((r) => !r.opened);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: tz || 'Australia/Sydney' }) : '');
  const list = (title: string, hint: string, rs: typeof rows) => (
    <div className="flex flex-col gap-1 min-w-0">
      <strong className="text-[14px] font-semibold">
        {title} · {rs.length}
      </strong>
      <span className="text-[12px] text-[#7a7466]">{hint}</span>
      <ul className="list-none m-0 p-0 flex flex-col max-h-[260px] overflow-y-auto">
        {rs.map((r) => (
          <li key={r.id} className="flex justify-between gap-3 py-[5px] border-t border-[#ece3cd] text-[14px]">
            <Link to={path(`guests?g=${r.id}`)} className="truncate !text-[#33402f]">
              {r.name}
            </Link>
            <span className="text-[12px] text-[#7a7466] whitespace-nowrap">
              {r.opened ? `opened ${when(r.opened)}` : r.phone ? (r.texted ? `texted ${when(r.texted)}` : 'not texted yet') : 'no mobile'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section aria-label="Who to chase" className={card}>
      <H2>Who to chase</H2>
      <div className="grid gap-4 md:grid-cols-2">
        {list('Opened it, haven’t replied', 'A friendly nudge usually does it.', opened)}
        {list('Haven’t opened it yet', 'Check their number, or send it another way (Guest planning → their card).', unopened)}
      </div>
    </section>
  );
}

/** Replies coming in: a running total over time (one dot per day with replies). */
/** Each kind of supplier against when couples usually book it. */
function WhenToBook({ rows }: { rows: ReturnType<typeof bookingTimeline> }) {
  const month = (d: string) => new Date(`${d}T00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  const booked = rows.filter((r) => r.state === 'booked').length;
  const late = rows.filter((r) => r.late).length;
  return (
    <section aria-label="When to book" className={card}>
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <H2>When to book</H2>
        <span className={`text-[13px] ${late ? 'text-[#7a4a37] font-semibold' : 'text-[#5b6a52]'}`}>
          {booked} of {rows.length} booked{late ? ` · ${late} past the usual time` : ''}
        </span>
      </div>
      <ul className="list-none m-0 p-0 grid gap-x-6 md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.what} className="flex items-center gap-3 py-[6px] border-t border-[#ece3cd] text-[14px] min-w-0">
            <span
              aria-hidden
              className="w-[10px] h-[10px] rounded-full shrink-0"
              style={{ background: r.state === 'booked' ? '#5d6b47' : r.late ? '#a5533c' : r.state === 'looking' ? '#b39563' : '#d8cfb8' }}
            />
            <span className="flex-1 min-w-0 truncate">
              {r.what}
              <span className="text-[12px] text-[#7a7466]"> · {r.months} months out</span>
            </span>
            <span className={`text-[13px] whitespace-nowrap ${r.state === 'booked' ? 'text-[#33402f]' : r.late ? 'text-[#7a4a37] font-semibold' : 'text-[#5b6a52]'}`}>
              {r.state === 'booked' ? `✓ ${r.vendor || 'Booked'}` : r.late ? (r.state === 'looking' ? 'Book soon' : 'Not started') : `${r.state === 'looking' ? 'Looking · ' : ''}by ${month(r.bookBy)}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[12px] text-[#7a7466]">Matched from “what they do” on each vendor. A guide, not a rule: skip anything you don’t need.</p>
    </section>
  );
}

function RepliesChart({ days, invited }: { days: { day: string; n: number }[]; invited: number }) {
  if (!days.length) return <p className="m-0 text-[14px] text-[#7a7466]">No replies yet: the chart starts with the first one.</p>;
  const W = 520;
  const H = 150;
  const start = Date.parse(days[0]!.day);
  const end = Math.max(Date.parse(days[days.length - 1]!.day), start + DAY);
  let total = 0;
  const pts = days.map((d) => {
    total += d.n;
    return { x: ((Date.parse(d.day) - start) / (end - start)) * (W - 20) + 10, y: H - 10 - (total / Math.max(1, invited)) * (H - 20), total };
  });
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fmt = (t: number) => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-auto" role="img" aria-label={`${total} replies so far`}>
      <line x1={10} y1={10} x2={W - 10} y2={10} stroke="#e2d7bc" strokeDasharray="4 4" />
      <text x={W - 10} y={8} textAnchor="end" fontSize={10} fill="#7a7466">
        everyone ({invited})
      </text>
      <path d={`${path} L${pts[pts.length - 1]!.x},${H - 10} L${pts[0]!.x},${H - 10} Z`} fill="#cfd8bb" opacity={0.5} />
      <path d={path} fill="none" stroke="#5d6b47" strokeWidth={2.5} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#33402f" />
      ))}
      <text x={10} y={H + 14} fontSize={10} fill="#7a7466">
        {fmt(start)}
      </text>
      <text x={W - 10} y={H + 14} fontSize={10} fill="#7a7466" textAnchor="end">
        {fmt(end)}
      </text>
    </svg>
  );
}

/**
 * Wedding planner → Insights: how the wedding is tracking. Replies (and a forecast of who'll come), money
 * (where it goes, what's due by month, cost per guest), the plan (done against where you'd expect to be),
 * vendors, and what guests are doing on the site.
 */
export function Insights() {
  const { wid, overview } = useAdmin();
  const [data, setData] = useState<InsightsData | null>(null);
  const [plan, setPlan] = useState<PlanChecklist | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [vendors, setVendors] = useState<Vendors | null>(null);
  const [gifts, setGifts] = useState<Gifts>({ list: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    insightsApi
      .get(wid)
      .then(setData)
      .catch((e: Error) => setError(e.message));
    plannerApi.doc<PlanChecklist>(wid, 'checklist').then((r) => setPlan(r.data), () => setPlan({ tasks: [], helpers: [] }));
    plannerApi.doc<Budget>(wid, 'budget').then((r) => setBudget(r.data), () => setBudget({ total: 0, guests: 0, lines: [] }));
    plannerApi.doc<Vendors>(wid, 'vendors').then((r) => setVendors(r.data), () => setVendors({ list: [] }));
    plannerApi.doc<Gifts>(wid, 'gifts').then((r) => setGifts(r.data), () => undefined);
  }, [wid]);
  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!data || !plan || !budget || !vendors) return <div aria-busy="true" className="text-[#5b6a52]">Working out the numbers…</div>;

  const tz = overview?.wedding.timezone;
  const today = dateIn(tz);
  const first = data.events[0];
  const days = first ? daysUntil(first.startsAt, tz) : null;
  // Replies and a forecast: the awaiting split like the replies so far (or 85% yes before any are in).
  const rate = first && first.yes + first.no ? first.yes / (first.yes + first.no) : 0.85;
  const perInvite = first && first.yes ? first.people / first.yes : 2;
  const forecast = first ? Math.round(first.people + first.awaiting * rate * perInvite) : 0;
  // Money.
  const booked = vendors.list.filter((v) => v.status === 'booked');
  const lines = withSchedules(budget.lines, vendors.list);
  const named = new Set(lines.map((l) => l.vendor.trim().toLowerCase()).filter(Boolean));
  const extra = booked.filter((v) => !named.has(v.name.trim().toLowerCase()));
  const committed = lines.reduce((a, l) => a + (l.quote || l.estimate), 0) + extra.reduce((a, v) => a + moneyOf(v).total, 0);
  const paid = lines.reduce((a, l) => a + l.paid, 0) + extra.reduce((a, v) => a + moneyOf(v).paid, 0);
  const byMonth = new Map<string, number>();
  for (const p of allPayments(budget.lines, vendors.list)) if (!p.paid && p.due) byMonth.set(p.due.slice(0, 7), (byMonth.get(p.due.slice(0, 7)) ?? 0) + p.amount);
  const months = [...byMonth.entries()].filter(([, a]) => a > 0).sort(([a], [b]) => a.localeCompare(b));
  // Where it's likely to land: quotes so far against their estimates, applied to the lines still on an estimate.
  const quotedLines = budget.lines.filter((l) => l.quote && l.estimate);
  const drift = quotedLines.length >= 2 ? quotedLines.reduce((a, l) => a + l.quote, 0) / quotedLines.reduce((a, l) => a + l.estimate, 0) : 1;
  const unquoted = budget.lines.filter((l) => !l.quote && l.estimate).reduce((a, l) => a + l.estimate, 0);
  const landing = committed + (drift - 1) * unquoted;
  // Saving for it: what's still owing spread over the months to the day.
  const monthsLeft = days !== null && days > 0 ? Math.max(1, Math.ceil(days / 30.4)) : 0;
  // Reply pace: at the last fortnight's rate, how many will still be waiting when replies close.
  const recent = data.repliesByDay.filter((r) => Date.parse(r.day) > Date.parse(today) - 14 * DAY).reduce((a, r) => a + r.n, 0);
  const toClose = data.rsvpClose ? Math.round((Date.parse(data.rsvpClose) - Date.parse(today)) / DAY) : -1;
  const waitingAtClose = first && first.awaiting > 0 && toClose >= 0 ? Math.max(0, Math.round(first.awaiting - (recent / 14) * toClose)) : null;
  const byCat = new Map<string, number>();
  for (const l of budget.lines) byCat.set(l.category, (byCat.get(l.category) ?? 0) + (l.quote || l.estimate));
  // The plan: done, against what you'd expect to have done by now (tasks whose time has come).
  const day = first ? Date.parse(first.startsAt) : NaN;
  const dueBy = plan.tasks.filter((t) => !Number.isNaN(day) && day - t.before * DAY <= Date.now());
  const done = plan.tasks.filter((t) => t.done).length;
  const expected = dueBy.length;
  const onTrack = done >= expected;
  const owner = (o: string) => plan.tasks.filter((t) => !t.done && (t.owner === o || t.owner === 'both')).length;
  const n1 = overview?.wedding.name1.split(' ')[0] ?? 'Partner 1';
  const n2 = overview?.wedding.name2.split(' ')[0] ?? 'Partner 2';
  const quotes = vendors.list.reduce((a, v) => a + v.quotes.length, 0);
  // Busy months: what's still to do, by the month it falls due (anything overdue in one pile).
  const ahead = new Map<string, number>();
  if (!Number.isNaN(day)) {
    for (const t of plan.tasks.filter((x) => !x.done)) {
      const due = dateIn(tz, new Date(day - t.before * DAY));
      const k = due < today ? 'overdue' : due.slice(0, 7);
      ahead.set(k, (ahead.get(k) ?? 0) + 1);
    }
  }
  const busy = [...ahead.entries()].sort(([a], [b]) => (a === 'overdue' ? -1 : b === 'overdue' ? 1 : a.localeCompare(b))).slice(0, 7);
  const busiest = Math.max(0, ...busy.filter(([k]) => k !== 'overdue').map(([, n]) => n));

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Headlines" className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {[
          ['Days to go', days === null ? '—' : String(Math.max(0, days)), first?.name ?? ''],
          ['Replied', `${first ? pct(first.yes + first.no, first.invited) : 0}%`, first ? `${first.yes + first.no} of ${first.invited} invitations` : ''],
          ['Expected guests', String(forecast), first ? `${first.people} said yes so far` : ''],
          ['Budget used', `${pct(committed, budget.total)}%`, budget.total ? `${aud(committed)} of ${aud(budget.total)}` : 'Set your budget'],
          ['Plan done', `${pct(done, plan.tasks.length)}%`, plan.tasks.length ? (onTrack ? 'On track ✓' : `${expected - done} behind where you’d expect`) : 'Start the checklist'],
        ].map(([k, v, sub]) => (
          <div key={k} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">{k}</span>
            <span className="font-display text-[34px] leading-none">{v}</span>
            <span className={`text-[12px] ${k === 'Plan done' && !onTrack && plan.tasks.length ? 'text-[#7a4a37] font-semibold' : 'text-[#7a7466]'}`}>{sub}</span>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Replies" className={card}>
          <H2>Replies</H2>
          {data.events.map((e) => (
            <div key={e.key} className="flex flex-col gap-2">
              <strong className="text-[14px] font-semibold">{e.name}</strong>
              <Bars
                max={e.invited}
                rows={[
                  { label: 'Invited', value: e.invited, colour: '#c6b794' },
                  ...(e.key === first?.key ? [{ label: 'Opened their invitation', value: Math.min(e.invited, data.opened.opened), colour: '#b39563' }] : []),
                  { label: 'Replied', value: e.yes + e.no, colour: '#8a9670' },
                  { label: 'Coming', value: e.yes, note: `${e.yes} (${e.people} people)`, colour: '#5d6b47' },
                  { label: 'Can’t come', value: e.no, colour: '#a5533c' },
                ]}
              />
            </div>
          ))}
          <p className="m-0 text-[12px] text-[#7a7466]">
            Expected guests assumes the {first?.awaiting ?? 0} still to reply answer like those who have ({Math.round(rate * 100)}% yes).
          </p>
          {waitingAtClose !== null && (
            <p className={`m-0 text-[13px] ${waitingAtClose > 0 ? 'text-[#7a4a37]' : 'text-[#5b6a52]'}`}>
              {recent ? `${recent} ${recent === 1 ? 'reply' : 'replies'} in the last fortnight. At that pace` : 'No replies in the last fortnight. At that pace'},{' '}
              {waitingAtClose > 0 ? (
                <>
                  about <strong className="font-semibold">{waitingAtClose}</strong> will still be waiting when replies close
                  {toClose ? ` in ${toClose} days` : ' today'}. A reminder text helps.
                </>
              ) : (
                'everyone should be in before replies close.'
              )}
            </p>
          )}
        </section>
        <section aria-label="Replies over time" className={card}>
          <H2>Replies over time</H2>
          <RepliesChart days={data.repliesByDay} invited={data.opened.invitations} />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="Catering" className={card}>
          <H2>Catering</H2>
          <div className="text-[14px]">
            <strong className="font-semibold">{data.catering.people}</strong> coming to {first?.name ?? 'the wedding'} so far · {data.catering.withNeeds} with dietary needs
          </div>
          {data.catering.diets.length ? <Bars rows={data.catering.diets.map(([k, v]) => ({ label: k, value: v, colour: '#b39563' }))} /> : <p className="m-0 text-[13px] text-[#7a7466]">No dietary needs yet.</p>}
          {data.catering.mains.length > 0 && (
            <>
              <div className="text-[12px] font-semibold tracking-[.12em] uppercase text-[#5b6a52]">Their mains</div>
              <Bars rows={data.catering.mains.map(([k, v]) => ({ label: k, value: v, colour: k === 'Not set yet' ? '#a5533c' : '#8a9670' }))} />
            </>
          )}
        </section>
        <section aria-label="Seating" className={card}>
          <H2>Seating</H2>
          <div className="flex items-center gap-4">
            <Ring done={data.seating.seated} total={Math.max(data.catering.people, 1)} size={70} label={`${data.seating.seated} of ${data.catering.people} seated`} />
            <div className="text-[14px] flex flex-col gap-1">
              <span>
                <strong className="font-semibold">{data.seating.seated}</strong> of {data.catering.people} seated
              </span>
              <span>
                {data.seating.tables} tables · {data.seating.seats} seats
              </span>
              <span className={data.seating.seats < forecast ? 'text-[#7a4a37] font-semibold' : 'text-[#5b6a52]'}>
                {data.seating.seats >= forecast ? `${data.seating.seats - forecast} spare for the ${forecast} expected` : `${forecast - data.seating.seats} more seats needed for the ${forecast} expected`}
              </span>
            </div>
          </div>
        </section>
        <section aria-label="Key dates" className={card}>
          <H2>Key dates</H2>
          <ul className="list-none m-0 p-0 flex flex-col gap-2 text-[14px]">
            {[
              data.rsvpClose ? { what: 'Replies close', when: data.rsvpClose } : null,
              ...plan.tasks.filter((t) => t.legal && !t.done && !Number.isNaN(day)).map((t) => ({ what: t.text, when: dateIn(tz, new Date(day - t.before * DAY)) })),
              ...months.slice(0, 2).map(([m, a]) => ({ what: `Payments ${aud(a)}`, when: `${m}-28` })),
              first ? { what: first.name, when: dateIn(tz, new Date(first.startsAt)) } : null,
            ]
              .filter((x): x is { what: string; when: string } => !!x)
              .sort((a, b) => a.when.localeCompare(b.when))
              .slice(0, 6)
              .map((x) => {
                const d = Math.round((Date.parse(x.when) - Date.parse(today)) / DAY);
                return (
                  <li key={`${x.what}${x.when}`} className="flex justify-between gap-3">
                    <span className="truncate">{x.what}</span>
                    <span className={`whitespace-nowrap tabular-nums ${d < 0 ? 'text-[#7a4a37] font-semibold' : d < 30 ? 'text-[#8a6d2f] font-semibold' : 'text-[#5b6a52]'}`}>
                      {d < 0 ? `${-d} days ago` : d === 0 ? 'today' : `in ${d} days`}
                    </span>
                  </li>
                );
              })}
          </ul>
          {data.shuttles.runs > 0 && (
            <div className="text-[13px] text-[#5b6a52] pt-2 border-t border-[#e2d7bc]">
              Shuttles: {data.shuttles.booked} of {data.shuttles.capacity} seats booked on {data.shuttles.runs} {data.shuttles.runs === 1 ? 'run' : 'runs'}
            </div>
          )}
        </section>
      </div>

      {!Number.isNaN(day) && <WhenToBook rows={bookingTimeline(vendors.list, Date.parse(dateIn(tz, new Date(day))), Date.now(), !!first?.venue)} />}

      {data.chase.length > 0 && <Chase rows={data.chase} tz={tz} />}

      {data.byMessage.length > 0 && (
        <section aria-label="How your texts did" className={card}>
          <H2>How your texts did</H2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px] min-w-[520px]">
              <thead>
                <tr className="text-left text-[11px] tracking-[.12em] uppercase text-[#5b6a52]">
                  <th className="py-1 font-semibold">Message</th>
                  <th className="py-1 font-semibold text-right">Sent</th>
                  <th className="py-1 font-semibold text-right">Arrived</th>
                  <th className="py-1 font-semibold text-right">Replied within 3 days</th>
                </tr>
              </thead>
              <tbody>
                {data.byMessage.map((m) => (
                  <tr key={m.name} className="border-t border-[#ece3cd]">
                    <td className="py-2">{m.name}</td>
                    <td className="py-2 text-right tabular-nums">{m.sent}</td>
                    <td className="py-2 text-right tabular-nums">
                      {m.delivered}
                      {m.failed ? <span className="text-[#7a4a37]"> · {m.failed} failed</span> : null}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {m.replied} <span className="text-[#7a7466]">({pct(m.replied, m.sent)}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12px] text-[#7a7466]">“Arrived” is what the phone network confirmed; some networks don’t confirm, so it can read low.</p>
        </section>
      )}

      {budget.lines.some((l) => l.quote && l.estimate) && (
        <section aria-label="Quotes against estimates" className={card}>
          <H2>Quotes against estimates</H2>
          <Bars
            rows={budget.lines
              .filter((l) => l.quote && l.estimate)
              .map((l) => ({ l, d: l.quote - l.estimate }))
              .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
              .slice(0, 8)
              .map(({ l, d }) => ({ label: l.item || l.category, value: Math.abs(d), note: `${d > 0 ? '+' : '−'}${aud(Math.abs(d))}`, colour: d > 0 ? '#a5533c' : '#5d6b47' }))}
          />
          <p className="m-0 text-[12px] text-[#7a7466]">Red is over your estimate, green under.</p>
        </section>
      )}

      {budget.lines.length > 0 && committed > 0 && (
        <section aria-label="Your split against typical couples" className={card}>
          <H2>Your split against typical couples</H2>
          <p className="m-0 text-[13px] text-[#5b6a52]">Each category’s share of what you’ve committed (the bar), and what Australian couples usually spend on it (the mark).</p>
          <div className="flex flex-col gap-2">
            {BUDGET_SPLIT.map(({ category, share }) => {
              const mine = budget.lines.filter((l) => l.category === category).reduce((a, l) => a + (l.quote || l.estimate), 0) / committed;
              const over = mine > share * 1.25 && mine - share > 0.02;
              return (
                <div key={category} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] gap-3 items-center text-[13px]">
                  <span className="truncate">{category}</span>
                  <span className="relative h-[12px] rounded-full bg-[#e9e2cc]">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (mine / 0.5) * 100)}%`, background: over ? '#a5533c' : '#8a9670' }} />
                    <span aria-hidden className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-[#33402f]" style={{ left: `${Math.min(100, (share / 0.5) * 100)}%` }} />
                  </span>
                  <span className="tabular-nums text-[#5b6a52] whitespace-nowrap">
                    {Math.round(mine * 100)}% <span className="text-[#7a7466]">· usually {Math.round(share * 100)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {data.groups.length > 1 && (
        <section aria-label="By guest group" className={card}>
          <H2>By guest group</H2>
          <Bars rows={data.groups.map((g) => ({ label: g.group, value: g.yes + g.no, note: `${g.yes} yes · ${g.no} no · ${g.invited - g.yes - g.no} waiting`, colour: '#8a9670' }))} max={Math.max(...data.groups.map((g) => g.invited))} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Money" className={card}>
          <H2>Money</H2>
          <div className="flex gap-5 flex-wrap items-center">
            <Ring done={paid} total={Math.max(committed, 1)} size={70} label={`${aud(paid)} paid of ${aud(committed)}`} />
            <div className="text-[14px] flex flex-col gap-1">
              <span>
                <strong className="font-semibold">{aud(paid)}</strong> paid of {aud(committed)} committed
              </span>
              <span>
                About <strong className="font-semibold">{aud(forecast ? committed / forecast : 0)}</strong> a guest (for {forecast} expected)
              </span>
              {budget.total > 0 && <span className={committed > budget.total ? 'text-[#7a4a37] font-semibold' : ''}>{committed > budget.total ? `${aud(committed - budget.total)} over budget` : `${aud(budget.total - committed)} left to allocate`}</span>}
            </div>
          </div>
          {Math.abs(drift - 1) >= 0.03 && unquoted > 0 && (
            <p className={`m-0 text-[13px] ${budget.total && landing > budget.total ? 'text-[#7a4a37]' : 'text-[#5b6a52]'}`}>
              Your quotes have come in {Math.round(Math.abs(drift - 1) * 100)}% {drift > 1 ? 'over' : 'under'} your estimates. If the {aud(unquoted)} still on estimates does the same, you’ll land
              near <strong className="font-semibold">{aud(landing)}</strong>
              {budget.total ? (landing > budget.total ? `, ${aud(landing - budget.total)} over budget.` : `, ${aud(budget.total - landing)} under budget.`) : '.'}
            </p>
          )}
          {byCat.size > 0 && <Bars rows={[...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v, note: aud(v) }))} />}
        </section>
        <section aria-label="Payments by month" className={card}>
          <H2>Still to pay, by month</H2>
          {months.length ? (
            <Bars rows={months.map(([m, a]) => ({ label: new Date(`${m}-01T00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }), value: a, note: aud(a), colour: m < today.slice(0, 7) ? '#a5533c' : '#b39563' }))} />
          ) : (
            <p className="m-0 text-[14px] text-[#7a7466]">Nothing with a due date yet. Add due dates in Budget to see what’s coming each month.</p>
          )}
          {committed > paid && monthsLeft > 0 && (
            <p className="m-0 text-[13px] text-[#5b6a52] pt-2 border-t border-[#e2d7bc]">
              To have it all paid by the day, put aside about <strong className="font-semibold text-[#33402f]">{aud((committed - paid) / monthsLeft)}</strong> a month for the next {monthsLeft}{' '}
              {monthsLeft === 1 ? 'month' : 'months'} ({aud(committed - paid)} still to pay).
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="The plan" className={card}>
          <H2>The plan</H2>
          <Bars
            max={Math.max(plan.tasks.length, 1)}
            rows={[
              { label: 'Done', value: done, colour: '#5d6b47' },
              { label: 'Due by now', value: expected, colour: onTrack ? '#8a9670' : '#a5533c' },
              { label: 'Everything', value: plan.tasks.length, colour: '#c6b794' },
            ]}
          />
          <div className="text-[13px] text-[#5b6a52]">
            Still to do: {n1} {owner('p1')} · {n2} {owner('p2')} · not decided {plan.tasks.filter((t) => !t.done && !t.owner).length}
          </div>
          {busy.length > 0 && (
            <>
              <div className="text-[12px] font-semibold tracking-[.12em] uppercase text-[#5b6a52] pt-2 border-t border-[#e2d7bc]">Busy months ahead</div>
              <Bars
                rows={busy.map(([k, n]) => ({
                  label: k === 'overdue' ? 'Overdue' : new Date(`${k}-01T00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }),
                  value: n,
                  note: `${n} ${n === 1 ? 'task' : 'tasks'}`,
                  colour: k === 'overdue' ? '#a5533c' : n === busiest && n > 3 ? '#b39563' : '#8a9670',
                }))}
              />
            </>
          )}
        </section>
        <section aria-label="Vendors" className={card}>
          <H2>Vendors</H2>
          <Bars
            max={Math.max(vendors.list.length, 1)}
            rows={[
              { label: 'Shortlisted', value: vendors.list.length, colour: '#c6b794' },
              { label: 'Quoted', value: vendors.list.filter((v) => v.quotes.length || v.quote).length, colour: '#b39563' },
              { label: 'Booked', value: booked.length, colour: '#5d6b47' },
              { label: 'Contract signed', value: booked.filter((v) => v.contractSigned).length, colour: '#33402f' },
            ]}
          />
          <div className="text-[13px] text-[#5b6a52]">{quotes} quotes filed</div>
        </section>
        {gifts.list.length > 0 && (
          <section aria-label="Gifts" className={card}>
            <H2>Gifts and thank-yous</H2>
            <div className="flex items-center gap-4">
              <Ring done={gifts.list.filter((g) => g.thanked).length} total={gifts.list.length} size={64} label="Thank-yous sent" />
              <div className="text-[14px] flex flex-col gap-1">
                <span>
                  <strong className="font-semibold">{gifts.list.length}</strong> gifts · {aud(gifts.list.reduce((a, g) => a + g.amount, 0))} in cash
                </span>
                <span>{gifts.list.filter((g) => !g.thanked).length} thank-yous still to write</span>
              </div>
            </div>
          </section>
        )}
        <section aria-label="On the site" className={card}>
          <H2>Guests on the site</H2>
          <Bars
            rows={[
              { label: 'Photos shared', value: data.guests.photos, colour: '#b39563' },
              { label: 'Board messages', value: data.guests.board, colour: '#8a9670' },
              { label: 'Song requests', value: data.guests.songs, colour: '#5d6b47' },
              { label: 'Emails', value: data.guests.emails, note: `${data.guests.emails} (${data.guests.vendorEmails} vendors)`, colour: '#c6b794' },
              { label: 'Texts sent', value: data.texts.sent, note: `${data.texts.sent}${data.texts.failed ? ` · ${data.texts.failed} failed` : ''}`, colour: '#33402f' },
            ]}
          />
        </section>
      </div>
    </div>
  );
}

/**
 * Account → Overview's hub: one place that pulls every part of the wedding together. Headline figures
 * across features, then charts for replies, planning tasks, payments and the budget, and a tile for each
 * area with what's waiting there. Each piece opens the page it's about.
 */
import { allPayments, dateIn, moneyOf, withSchedules, type Budget as BudgetDoc, type PlanChecklist, type PlanTask, type Vendors as VendorsDoc } from '@wp/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { insightsApi, plannerApi, type InsightsData, type Overview } from '../../lib/api';
import { useAutoRefresh } from '../ui';
import { C, Climb, Columns, Donut, Meter, Rows } from './charts';

const DAY = 86_400_000;
const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
const audShort = (n: number) => (n >= 10_000 ? `$${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : aud(n));
const monthKey = (iso: string) => iso.slice(0, 7);
const monthName = (key: string) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' });

interface Data {
  insights: InsightsData | null;
  tasks: PlanTask[];
  budget: BudgetDoc;
  vendors: VendorsDoc['list'];
}

/** Everything the hub reads, loaded together; a part that can't load (a viewer, a new wedding) is just empty. */
function useHubData(wid: string) {
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback(async () => {
    const [insights, plan, budget, vendors] = await Promise.all([
      insightsApi.get(wid).catch(() => null),
      plannerApi.doc<PlanChecklist>(wid, 'checklist').then((r) => r.data.tasks, () => [] as PlanTask[]),
      plannerApi.doc<BudgetDoc>(wid, 'budget').then((r) => r.data, () => ({ total: 0, guests: 0, lines: [] }) as BudgetDoc),
      plannerApi.doc<VendorsDoc>(wid, 'vendors').then((r) => r.data.list, () => [] as VendorsDoc['list']),
    ]);
    setD({ insights, tasks: plan, budget, vendors });
  }, [wid]);
  useEffect(() => void load(), [load]);
  useAutoRefresh(load, 60_000);
  return d;
}

export function Hub({ wid, o, to }: { wid: string; o: Overview; to: (link: string, event?: string) => void }) {
  const d = useHubData(wid);
  if (!d) return <div aria-busy="true" className="min-h-[300px]" />;
  const tz = o.wedding.timezone;
  const first = o.events[0];
  const planner = (view: string) => to(`planner?view=${view}`, first?.key);
  const today = Date.parse(dateIn(tz));
  const wedding = first ? Date.parse(dateIn(tz, new Date(first.startsAt))) : null;

  // ---- tasks: due date is the wedding day less `before` days
  const due = (t: PlanTask) => (wedding === null ? null : wedding - t.before * DAY);
  const open = d.tasks.filter((t) => !t.done);
  const late = open.filter((t) => (due(t) ?? Infinity) < today);
  const soon = open.filter((t) => {
    const at = due(t);
    return at !== null && at >= today && at < today + 30 * DAY;
  });
  const done = d.tasks.length - open.length;
  const names = { p1: o.wedding.name1.split(' ')[0] || 'Partner 1', p2: o.wedding.name2.split(' ')[0] || 'Partner 2', both: 'Both of you', '': 'Not assigned' } as const;
  const who = (['p1', 'p2', 'both', ''] as const)
    .map((k) => {
      const mine = d.tasks.filter((t) => t.owner === k);
      const fin = mine.filter((t) => t.done).length;
      const overdue = mine.filter((t) => !t.done && (due(t) ?? Infinity) < today).length;
      return { label: names[k], parts: [{ value: fin, colour: C.accent }, { value: overdue, colour: C.late }, { value: mine.length - fin - overdue, colour: C.gold }], right: `${fin}/${mine.length}`, n: mine.length };
    })
    .filter((r) => r.n > 0);
  // Open tasks by the month they fall due: overdue first, then the next six months.
  const months = Array.from({ length: 6 }, (_, i) => {
    const at = new Date(today);
    at.setUTCDate(1);
    at.setUTCMonth(at.getUTCMonth() + i);
    return at.toISOString().slice(0, 7);
  });
  const taskCols = [
    { label: 'Late', parts: [{ value: late.length, colour: C.late }], note: late.length ? 'late' : undefined },
    ...months.map((m) => ({ label: monthName(m), parts: [{ value: open.filter((t) => due(t) !== null && new Date(due(t)!).toISOString().slice(0, 7) === m).length, colour: C.gold }] })),
  ];

  // ---- money
  const lines = withSchedules(d.budget.lines, d.vendors);
  const booked = d.vendors.filter((v) => v.status === 'booked');
  const named = new Set(lines.map((l) => l.vendor.trim().toLowerCase()).filter(Boolean));
  const extra = booked.filter((v) => !named.has(v.name.trim().toLowerCase()));
  const committed = lines.reduce((a, l) => a + (l.quote || l.estimate), 0) + extra.reduce((a, v) => a + moneyOf(v).total, 0);
  const paid = lines.reduce((a, l) => a + l.paid, 0) + extra.reduce((a, v) => a + moneyOf(v).paid, 0);
  const pays = allPayments(d.budget.lines, d.vendors).filter((p) => p.amount > 0);
  const todayIso = dateIn(tz);
  const unpaid = pays.filter((p) => !p.paid);
  const overduePay = unpaid.filter((p) => p.due && p.due < todayIso);
  const next = unpaid.filter((p) => p.due && p.due >= todayIso)[0];
  const payCols = [
    { label: 'Late', parts: [{ value: overduePay.reduce((a, p) => a + p.amount, 0), colour: C.late }], note: overduePay.length ? 'late' : undefined },
    ...months.map((m) => ({
      label: monthName(m),
      parts: [
        { value: pays.filter((p) => p.paid && monthKey(p.paidOn || p.due) === m).reduce((a, p) => a + p.amount, 0), colour: C.accent },
        { value: unpaid.filter((p) => p.due && p.due >= todayIso && monthKey(p.due) === m).reduce((a, p) => a + p.amount, 0), colour: C.gold },
      ],
    })),
  ];
  const byCategory = [...lines.reduce((m, l) => m.set(l.category, (m.get(l.category) ?? 0) + (l.quote || l.estimate)), new Map<string, number>())]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const topCats = byCategory.slice(0, 6);
  const otherCats = byCategory.slice(6).reduce((a, [, v]) => a + v, 0);

  // ---- replies
  const ins = d.insights;
  let run = 0;
  const climb = (ins?.repliesByDay ?? []).map((r) => ({ day: r.day, total: (run += r.n) }));
  const goal = o.total;

  // ---- headline figures across every area
  const kpis: { label: string; value: string; sub: string; go: () => void; warn?: boolean }[] = [
    { label: 'Replies', value: `${goal ? Math.round((o.replied / goal) * 100) : 0}%`, sub: `${o.replied} of ${goal} invitations`, go: () => to(`guests?show=all`, first?.key) },
    { label: 'Coming', value: String(first?.coming ?? 0), sub: o.events.length > 1 ? `to ${first?.name ?? 'the wedding'}` : 'guests said yes', go: () => to(`guests?filter=attending:${first?.key ?? ''}`, first?.key) },
    { label: 'Tasks', value: d.tasks.length ? `${done}/${d.tasks.length}` : '—', sub: late.length ? `${late.length} overdue` : `${soon.length} due in 30 days`, go: () => planner('checklist'), warn: late.length > 0 },
    { label: 'Budget', value: committed ? audShort(committed) : '—', sub: d.budget.total ? `of ${audShort(d.budget.total)} planned` : 'no total set yet', go: () => planner('budget'), warn: d.budget.total > 0 && committed > d.budget.total },
    { label: 'Next payment', value: next ? aud(next.amount) : overduePay.length ? `${overduePay.length} late` : '—', sub: next ? `${next.who}, ${new Date(`${next.due}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : 'nothing scheduled', go: () => planner('payments'), warn: overduePay.length > 0 },
    { label: 'Vendors', value: `${booked.length}`, sub: `booked of ${d.vendors.length} on your list`, go: () => planner('vendors') },
  ];

  return (
    <div className="flex flex-col gap-[34px]">
      <section aria-label="At a glance" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px rounded-[16px] overflow-hidden border border-[#e2d7bc] bg-[#e2d7bc]">
        {kpis.map((k) => (
          <button key={k.label} type="button" onClick={k.go} className="flex flex-col gap-1 p-4 border-0 bg-[#fbf8f0] text-left cursor-pointer hover:bg-[#f3ecd6] min-w-0">
            <span className="text-[11px] font-semibold tracking-[.18em] uppercase text-[#5b6a52]">{k.label}</span>
            <span className={`font-display text-[30px] leading-none truncate ${k.warn ? 'text-[#a4553c]' : ''}`}>{k.value}</span>
            <span className={`text-[12px] truncate ${k.warn ? 'text-[#a4553c] font-semibold' : 'text-[#5b6a52]'}`}>{k.sub}</span>
          </button>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Replies coming in" action={['Guest list', () => to('guests?show=all', first?.key)]}>
          <Climb points={climb} goal={goal} label="Replies over time" />
          {(o.perEvent?.length ?? 0) > 0 && (
            <Rows
              label="Replies by event"
              rows={o.perEvent!.map((e) => ({
                label: e.name,
                parts: [{ value: e.yes, colour: C.accent }, { value: e.no, colour: C.gold }, { value: e.awaiting, colour: C.sand }],
                right: `${e.yes} yes · ${e.awaiting} waiting`,
              }))}
            />
          )}
        </Card>

        <Card title="Planning tasks" action={['Checklist', () => planner('checklist')]}>
          {d.tasks.length ? (
            <>
              <Donut
                label="Planning tasks"
                centre={`${Math.round((done / d.tasks.length) * 100)}%`}
                sub="done"
                slices={[
                  { label: 'Done', value: done, colour: C.accent },
                  { label: 'Overdue', value: late.length, colour: C.late },
                  { label: 'Due in 30 days', value: soon.length, colour: C.gold },
                  { label: 'Later', value: open.length - late.length - soon.length, colour: C.sand },
                ]}
              />
              <Columns label="Open tasks by month due" cols={taskCols} height={110} />
            </>
          ) : (
            <Starter text="Start your checklist and every task shows here, with what's due when." go={() => planner('checklist')} />
          )}
        </Card>

        <Card title="Who's doing what" action={['Assign tasks', () => planner('checklist')]}>
          {who.length ? (
            <>
              <Rows label="Tasks by person" rows={who} />
              <p className="m-0 text-[12px] text-[#5b6a52]">Green done · red overdue · gold still to do.</p>
            </>
          ) : (
            <Starter text="Give tasks an owner in the checklist to see who has what." go={() => planner('checklist')} />
          )}
        </Card>

        <Card title="Payments" action={['Payment schedule', () => planner('payments')]}>
          {pays.length ? (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                <span>
                  <strong className="font-semibold">{aud(pays.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0))}</strong> paid
                </span>
                <span>
                  <strong className="font-semibold">{aud(unpaid.reduce((a, p) => a + p.amount, 0))}</strong> still to pay
                </span>
                {overduePay.length > 0 && <span className="text-[#a4553c] font-semibold">{overduePay.length} overdue</span>}
              </div>
              <Columns label="Payments by month" money cols={payCols} height={130} />
              <p className="m-0 text-[12px] text-[#5b6a52]">Green paid · gold due · red overdue.</p>
            </>
          ) : (
            <Starter text="Book a vendor or add budget lines with amounts, and their payments line up here by month." go={() => planner('payments')} />
          )}
        </Card>

        <Card title="Budget" action={['Budget', () => planner('budget')]}>
          {committed || d.budget.total ? (
            <>
              <div className="flex flex-col gap-2">
                <Meter
                  label="Budget"
                  total={d.budget.total}
                  parts={[
                    { label: 'Paid', value: paid, colour: C.accent },
                    { label: 'Committed, not paid', value: Math.max(0, committed - paid), colour: C.gold },
                  ]}
                />
                <span className="text-[13px] text-[#5b6a52]">
                  {aud(paid)} paid · {aud(committed)} committed{d.budget.total ? ` · ${aud(d.budget.total)} budget` : ''}
                  {d.budget.total > 0 && committed > d.budget.total && <strong className="text-[#a4553c]"> · {aud(committed - d.budget.total)} over</strong>}
                </span>
              </div>
              {topCats.length > 0 && (
                <Rows
                  label="Where the money goes"
                  rows={[...topCats, ...(otherCats ? [['Everything else', otherCats] as [string, number]] : [])].map(([label, v]) => ({ label, parts: [{ value: v, colour: C.sky }], right: audShort(v) }))}
                />
              )}
            </>
          ) : (
            <Starter text="Set a total and your budget lines to see where the money goes." go={() => planner('budget')} />
          )}
        </Card>

        <Card title="Everything else">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Unread messages" value={o.nav.messages ?? 0} go={() => to('messages', 'all')} warn={(o.nav.messages ?? 0) > 0} />
            <Tile label="Texts on autopilot" value={o.nav.smsLive ? o.nav.autopilot : 'Off'} go={() => to('texts', o.nav.smsLive ? first?.key : 'all')} warn={!o.nav.smsLive} />
            {ins && <Tile label="Texts sent" value={ins.texts.sent} sub={ins.texts.failed ? `${ins.texts.failed} failed` : undefined} go={() => to('texts', first?.key)} warn={ins.texts.failed > 0} />}
            {ins && ins.seating.seats > 0 && <Tile label="Seated" value={`${ins.seating.seated}/${ins.seating.seats}`} go={() => to('seating', first?.key)} />}
            {ins && <Tile label="Guest photos" value={ins.guests.photos} go={() => to('photos', first?.key)} />}
            {ins && <Tile label="Board posts" value={ins.guests.board} go={() => to('messages', 'all')} />}
            <Tile label="Dietary needs" value={o.diet.people} sub={o.diet.serious ? `${o.diet.serious} serious` : undefined} go={() => to('dietary', first?.key)} />
            {ins && ins.opened.invitations > 0 && <Tile label="Invitations opened" value={`${Math.round((ins.opened.opened / ins.opened.invitations) * 100)}%`} go={() => to('guests?show=all', first?.key)} />}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: [string, () => void]; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] min-w-0">
      <div className="flex justify-between items-baseline gap-3">
        <h2 className="m-0 font-display font-medium text-[24px]">{title}</h2>
        {action && (
          <button type="button" onClick={action[1]} className="p-0 border-0 bg-transparent text-[13px] font-medium underline cursor-pointer text-[var(--adm-ink,#33402f)] whitespace-nowrap">
            {action[0]}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub, go, warn }: { label: string; value: ReactNode; sub?: string; go: () => void; warn?: boolean }) {
  return (
    <button type="button" onClick={go} className="flex flex-col gap-[2px] p-3 rounded-[12px] border border-[#ece3cc] bg-[#f6f0e2] text-left cursor-pointer hover:bg-[#efe7d3] min-w-0">
      <span className={`font-display text-[26px] leading-none ${warn ? 'text-[#a4553c]' : ''}`}>{value}</span>
      <span className="text-[12px] text-[#5b6a52] truncate">{label}</span>
      {sub && <span className="text-[11px] text-[#a4553c] font-semibold">{sub}</span>}
    </button>
  );
}

function Starter({ text, go }: { text: string; go: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="m-0 text-[14px] text-[#5b6a52]">{text}</p>
      <button type="button" onClick={go} className="py-2 px-[14px] rounded-full border border-[var(--adm-ink,#33402f)] bg-transparent text-[13px] font-medium cursor-pointer">
        Open
      </button>
    </div>
  );
}

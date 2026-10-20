import { allPayments, assigneeOf, dateIn, PLAN_TEMPLATE, statusOf, vendorActions, withStatus, type Budget as BudgetDoc, type Helper, type PlanChecklist, type PlanTask, type VendorAction, type Vendors as VendorsDoc } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, plannerApi } from '../../lib/api';
import { useAdmin } from '../Shell';
import { CalendarCard } from './CalendarCard';
import { markPaid } from './paying';
import { useDocSave, useLiveDoc } from './useDocSave';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Wedding planner → Checklist: what to do and when, counted back from the wedding date (the usual
 * Australian plan to start, including the Notice of Intended Marriage deadlines), anything you add, and
 * what your vendors need from you (each payment, contracts to sign, quotes running out), worked out from
 * Vendors and Budget: tick a payment here and it's marked paid in Payments. Ticks save at once.
 */

const DAY = 86_400_000;
/** The stretches the list is grouped into, by days before the day. */
const BANDS: [number, string][] = [
  [365, '12 months or more to go'],
  [180, '6 to 12 months'],
  [90, '3 to 6 months'],
  [30, '1 to 3 months'],
  [7, 'The last month'],
  [0, 'The last week'],
  [-1000, 'After the wedding'],
];
const bandOf = (before: number) => BANDS.find(([min]) => before >= min)?.[1] ?? 'After the wedding';
const newId = () => crypto.randomUUID().slice(0, 12);

export function Checklist() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const [doc, setDoc] = useState<{ data: PlanChecklist; version: number } | null>(null);
  const saveDoc = useDocSave<PlanChecklist>(wid, 'checklist', '', doc?.version);
  const [error, setError] = useState('');
  const [show, setShow] = useState<'todo' | 'all'>('todo');
  /** 'all', or one person: 'p1', 'p2', 'both', 'h:<helper id>', '' (no one yet). */
  const [whose, setWhose] = useState<string>('all');
  const [view, setView] = useState<'list' | 'people'>('list');
  const [adding, setAdding] = useState({ text: '', when: '' });
  const vendorsDoc = useLiveDoc<VendorsDoc>(wid, 'vendors', '', toast);
  const budgetDoc = useLiveDoc<BudgetDoc>(wid, 'budget', '', toast);

  const load = useCallback(async () => {
    try {
      setDoc(await plannerApi.doc<PlanChecklist>(wid, 'checklist'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading your checklist…</div>;
  const day = overview?.events[0]?.startsAt ? Date.parse(overview.events[0].startsAt) : null;
  const dueDate = (t: PlanTask) => (day === null ? null : new Date(day - t.before * DAY));
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const now = Date.now();

  const save = async (tasks: PlanTask[], done?: string, helpers: Helper[] = doc.data.helpers) => {
    const before = doc;
    setDoc({ ...doc, data: { tasks, helpers } });
    try {
      const r = await saveDoc({ tasks, helpers });
      setDoc((d) => (d ? { ...d, version: r.version } : r)); // keep what's on screen: a later change may be on its way
      if (done) toast(done);
    } catch (e) {
      setDoc(before);
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded. Make your change again.' : (e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    }
  };
  const tasks = [...doc.data.tasks].sort((a, b) => b.before - a.before);
  const n1 = overview?.wedding.name1.split(' ')[0] || 'Partner 1';
  const n2 = overview?.wedding.name2.split(' ')[0] || 'Partner 2';
  const helpers = doc.data.helpers;
  const nameOf = (id: string) => (id === 'p1' ? n1 : id === 'p2' ? n2 : id === 'both' ? 'Both of you' : id ? helpers.find((h) => `h:${h.id}` === id)?.name ?? 'Someone removed' : 'Not assigned');
  /** A task is theirs: assigned to them (a partner also sees "both"). */
  const mine = (t: PlanTask, who: string) => who === 'all' || assigneeOf(t) === who || ((who === 'p1' || who === 'p2') && t.owner === 'both' && !t.helper);
  const assign = (t: PlanTask, who: string): PlanTask => (who.startsWith('h:') ? { ...t, owner: '', helper: who.slice(2) } : { ...t, owner: who as PlanTask['owner'], helper: '' });
  const todayIs = dateIn(overview?.wedding.timezone);
  const setTask = (id: string, fn: (t: PlanTask) => PlanTask, done?: string) => void save(doc.data.tasks.map((x) => (x.id === id ? fn(x) : x)), done);
  const left = tasks.filter((t) => !t.done && mine(t, whose));
  const open = tasks.filter((t) => !t.done);
  const load_ = { p1: open.filter((t) => mine(t, 'p1')).length, p2: open.filter((t) => mine(t, 'p2')).length, none: open.filter((t) => !assigneeOf(t)).length };
  const overdue = left.filter((t) => (dueDate(t)?.getTime() ?? Infinity) < now);
  const shown = show === 'todo' ? left : tasks.filter((t) => mine(t, whose));
  // What vendors need from you, placed by date like everything else (no date: at the top, "To do now").
  const vlist = vendorsDoc.doc?.data.list ?? [];
  const vlines = budgetDoc.doc?.data.lines ?? [];
  const today = dateIn(overview?.wedding.timezone);
  const actions = whose === 'all' ? vendorActions(vlines, vlist).filter((a) => show === 'all' || !a.done) : [];
  const beforeOf = (a: VendorAction) => (a.due && day !== null ? Math.round((day - Date.parse(`${a.due}T12:00`)) / DAY) : null);
  const tickVendor = (a: VendorAction) => {
    if (a.kind === 'payment' && a.payment) {
      const r = markPaid(a.payment, !a.done, vlist, vlines, today);
      if (a.payment.vendorId) vendorsDoc.update((d) => ({ ...d, list: r.vendors }), true);
      else budgetDoc.update((d) => ({ ...d, lines: r.lines }), true);
      toast(a.done ? 'Marked not paid' : 'Paid ✓ (in Payments too)');
    } else if (a.kind === 'chase') {
      vendorsDoc.update((d) => ({ ...d, list: d.list.map((v) => (v.id === a.vendorId ? { ...v, chasedOn: today } : v)) }), true);
      toast('Chased ✓ (it comes back in five days if no quote)');
    } else if (a.kind === 'contract') {
      vendorsDoc.update((d) => ({ ...d, list: d.list.map((v) => (v.id === a.vendorId ? { ...v, contractSigned: a.done ? '' : today } : v)) }), true);
      toast(a.done ? 'Contract not signed yet' : 'Contract signed ✓');
    }
  };
  const groups = [
    ['To do now', [] as PlanTask[], actions.filter((a) => beforeOf(a) === null)] as const,
    ...BANDS.map(([, label]) => [label, shown.filter((t) => bandOf(t.before) === label), actions.filter((a) => { const b = beforeOf(a); return b !== null && bandOf(b) === label; })] as const),
  ].filter(([, ts, as]) => ts.length || as.length);
  const custom = (t: PlanTask) => !PLAN_TEMPLATE.some((x) => x.text === t.text);
  const pays = allPayments(vlines, vlist);
  const paidSum = pays.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
  const owingSum = pays.filter((p) => !p.paid).reduce((a, p) => a + p.amount, 0);
  const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
  const addForm = (
    <form
      className="flex gap-2 flex-wrap items-end p-4 rounded-[16px] border border-dashed border-[#c6b794]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!adding.text.trim()) return;
        // A date becomes "days before the day"; no date = in the last month.
        const before = adding.when && day ? Math.round((day - Date.parse(`${adding.when}T12:00`)) / DAY) : 14;
        const fresh: PlanTask = { id: newId(), text: adding.text.trim(), before: Math.max(-60, Math.min(800, before)), done: false, note: '', legal: false, owner: '', helper: '', status: 'todo', doneOn: '' };
        void save([...doc.data.tasks, whose === 'all' ? fresh : assign(fresh, whose)], whose === 'all' ? 'Added' : `Added for ${nameOf(whose)}`);
        setAdding({ text: '', when: '' });
      }}
    >
      <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] flex-1 min-w-[200px]">
        Add your own
        <input value={adding.text} maxLength={200} placeholder="e.g. Book the dress fitting" onChange={(e) => setAdding({ ...adding, text: e.target.value })} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
        By
        <input type="date" value={adding.when} onChange={(e) => setAdding({ ...adding, when: e.target.value })} className={inputCls} />
      </label>
      <Pill type="submit" kind="outline">
        Add
      </Pill>
    </form>
  );

  if (!tasks.length) {
    return (
      <section className="flex flex-col gap-3 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
        <H2>Your planning checklist</H2>
        <p className="m-0 text-[15px] text-[#5b6a52]">
          Start with the usual Australian wedding plan: {PLAN_TEMPLATE.length} things, each due a set time before your day{day ? ` (${fmt(new Date(day))})` : ''}, including the Notice of
          Intended Marriage deadlines. Change, add or remove anything.
        </p>
        <Pill kind="primary" className="self-start" onClick={() => void save(PLAN_TEMPLATE.map((t) => ({ ...t, id: newId(), done: false, note: '', owner: '' as const, helper: '', status: 'todo' as const, doneOn: '' })), 'Checklist ready')}>
          Start the checklist
        </Pill>
        <span className="text-[13px] text-[#5b6a52]">Or start with your own:</span>
        {addForm}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>Checklist</H2>
          <div className="text-[13px] text-[#5b6a52]">
            {tasks.length - left.length} of {tasks.length} done
            {overdue.length ? <span className="text-[#7a4a37] font-semibold"> · {overdue.length} overdue</span> : null}
          </div>
          {pays.length > 0 && (
            <div className="text-[13px] text-[#5b6a52]">
              Vendor payments: <strong className="font-semibold text-[#33402f]">{aud(paidSum)}</strong> paid · <strong className={`font-semibold ${owingSum ? 'text-[#7a4a37]' : 'text-[#33402f]'}`}>{aud(owingSum)}</strong> outstanding
            </div>
          )}
        </div>
        <div role="radiogroup" aria-label="Show" className="flex gap-2">
          {(
            [
              ['todo', 'Still to do'],
              ['all', 'Everything'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={show === k}
              onClick={() => setShow(k)}
              className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${show === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[8px] rounded-full bg-[#e9e2cc] overflow-hidden" role="img" aria-label={`${tasks.length - open.length} of ${tasks.length} done`}>
        <div className="h-full bg-[#5d6b47]" style={{ width: `${Math.round(((tasks.length - open.length) / tasks.length) * 100)}%` }} />
      </div>
      {addForm}
      {/* Who's doing what: still to do, by whose job it is (tap a name to see just theirs). */}
      <div role="radiogroup" aria-label="Whose" className="flex gap-2 flex-wrap items-center text-[13px]">
        {(
          [
            ['all', `Everyone · ${open.length}`],
            ['p1', `${n1} · ${load_.p1}`],
            ['p2', `${n2} · ${load_.p2}`],
            ...helpers.map((h) => [`h:${h.id}`, `${h.name} · ${open.filter((t) => t.helper === h.id).length}`]),
            ['', `Not assigned · ${load_.none}`],
          ] as [string, string][]
        ).map(([k, label]) => (
          <button
            key={k || 'none'}
            type="button"
            role="radio"
            aria-checked={whose === k}
            onClick={() => setWhose(k)}
            className={`py-[5px] px-3 rounded-full border cursor-pointer ${whose === k ? 'bg-[#5d6b47] text-white border-[#5d6b47]' : 'bg-transparent border-[#c6b794]'}`}
          >
            {label}
          </button>
        ))}
        {load_.p1 + load_.p2 > 0 && (
          <span className="flex-1 min-w-[120px] flex h-[8px] rounded-full overflow-hidden bg-[#e9e2cc]" role="img" aria-label={`${n1} ${load_.p1}, ${n2} ${load_.p2}`}>
            <span style={{ width: `${(load_.p1 / (load_.p1 + load_.p2)) * 100}%`, background: '#b39563' }} />
            <span style={{ width: `${(load_.p2 / (load_.p1 + load_.p2)) * 100}%`, background: '#5d6b47' }} />
          </span>
        )}
      </div>

      <div role="radiogroup" aria-label="View" className="flex gap-2">
        {(
          [
            ['list', 'By date'],
            ['people', 'By person'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={view === k}
            onClick={() => setView(k)}
            className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${view === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'people' && (
        <People
          tasks={tasks.filter((t) => show === 'all' || !t.done)}
          ids={['p1', 'p2', 'both', ...helpers.map((h) => `h:${h.id}`), '']}
          nameOf={nameOf}
          due={(t) => fmt(dueDate(t))}
          late={(t) => !t.done && (dueDate(t)?.getTime() ?? Infinity) < now}
          onStatus={(t, s) => setTask(t.id, (x) => withStatus(x, s, todayIs))}
        />
      )}

      {view === 'list' && groups.map(([label, ts, as]) => (
        <section key={label} aria-label={label} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <div className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52] pb-1">{label}</div>
          {as.map((a) => {
            const late = !a.done && !!a.due && a.due < today;
            return (
              <div key={a.key} className="flex items-start gap-3 py-2 border-t border-[#e2d7bc] first:border-t-0">
                {a.kind === 'quote' ? (
                  <span aria-hidden className="mt-[3px] w-[18px] h-[18px] flex-none rounded-full border border-dashed border-[#c6b794]" />
                ) : (
                  <input type="checkbox" checked={a.done} aria-label={a.text} onChange={() => tickVendor(a)} className="mt-[3px] w-[18px] h-[18px] flex-none accent-[#5d6b47]" />
                )}
                <div className={`flex-1 min-w-0 text-[15px] ${a.done ? 'line-through text-[#7a7466]' : ''}`}>
                  <span className="mr-2 py-[1px] px-2 rounded-full bg-[#e6ecdc] text-[#3d4a2f] text-[11px] font-semibold align-middle">{a.kind === 'payment' ? 'Payment' : a.kind === 'chase' ? 'Quote' : 'Vendor'}</span>
                  {a.text}
                </div>
                <span className={`text-[12px] whitespace-nowrap ${late ? 'text-[#7a4a37] font-semibold' : 'text-[#7a7466]'}`}>
                  {a.due ? `${late ? 'Overdue · ' : ''}${fmt(new Date(`${a.due}T00:00`))}` : ''}
                </span>
              </div>
            );
          })}
          {ts.map((t) => {
            const due = dueDate(t);
            const late = !t.done && !!due && due.getTime() < now;
            const soon = !t.done && !!due && !late && due.getTime() - now < 21 * DAY;
            return (
              <div key={t.id} className="flex items-start gap-3 py-2 border-t border-[#e2d7bc] first:border-t-0">
                <input
                  type="checkbox"
                  checked={t.done}
                  aria-label={t.text}
                  onChange={() => setTask(t.id, (x) => withStatus(x, x.done ? 'todo' : 'done', todayIs))}
                  className="mt-[3px] w-[18px] h-[18px] flex-none accent-[#5d6b47]"
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-[15px] ${t.done ? 'line-through text-[#7a7466]' : ''}`}>
                    {t.legal && <span className="mr-2 py-[1px] px-2 rounded-full bg-[#f1e1d6] text-[#7a4a37] text-[11px] font-semibold align-middle">Legal</span>}
                    {custom(t) && <span className="mr-2 py-[1px] px-2 rounded-full bg-[#efe7d3] text-[#5b6a52] text-[11px] font-semibold align-middle">Yours</span>}
                    {t.text}
                  </div>
                  {t.note && <div className="text-[13px] text-[#5b6a52]">{t.note}</div>}
                </div>
                <StatusPill status={statusOf(t)} onChange={(s) => setTask(t.id, (x) => withStatus(x, s, todayIs))} />
                <select
                  aria-label={`Who: ${nameOf(assigneeOf(t))}`}
                  value={assigneeOf(t)}
                  onChange={(e) => setTask(t.id, (x) => assign(x, e.target.value), e.target.value ? `Given to ${nameOf(e.target.value)}` : undefined)}
                  className={`flex-none max-w-[120px] py-[2px] px-2 rounded-full border text-[11px] cursor-pointer ${assigneeOf(t) ? 'bg-[#efe7d3] border-[#e2d7bc] text-[#33402f]' : 'bg-transparent border-dashed border-[#c6b794] text-[#7a7466]'}`}
                >
                  <option value="">Who?</option>
                  <option value="p1">{n1}</option>
                  <option value="p2">{n2}</option>
                  <option value="both">Both</option>
                  {helpers.map((h) => (
                    <option key={h.id} value={`h:${h.id}`}>
                      {h.name}
                    </option>
                  ))}
                </select>
                <span className={`text-[12px] whitespace-nowrap ${late ? 'text-[#7a4a37] font-semibold' : soon ? 'text-[#8a6d2f] font-semibold' : 'text-[#7a7466]'}`}>
                  {due ? `${late ? 'Overdue · ' : soon ? 'Soon · ' : ''}${fmt(due)}` : ''}
                </span>
                <button type="button" aria-label={`Remove ${t.text}`} onClick={() => void save(doc.data.tasks.filter((x) => x.id !== t.id))} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466]">
                  ×
                </button>
              </div>
            );
          })}
        </section>
      ))}
      {view === 'list' && !groups.length && <p className="m-0 text-[15px] text-[#3d4a2f]">Everything's done ✓</p>}

      <Helpers
        helpers={helpers}
        slug={overview?.wedding.slug ?? ''}
        counts={(id) => open.filter((t) => t.helper === id).length}
        onChange={(next, msg) => {
          const gone = helpers.filter((h) => !next.some((x) => x.id === h.id)).map((h) => h.id);
          void save(doc.data.tasks.map((t) => (gone.includes(t.helper) ? { ...t, helper: '' } : t)), msg, next);
        }}
      />

      <CalendarCard />
    </div>
  );
}

/** The next few things due (for At a glance). */
export function nextTasks(tasks: PlanTask[], day: number | null, n = 4) {
  return tasks
    .filter((t) => !t.done)
    .sort((a, b) => b.before - a.before)
    .slice(0, n)
    .map((t) => ({ ...t, due: day === null ? null : new Date(day - t.before * DAY) }));
}

const STATUS: Record<PlanTask['status'], [string, string, string]> = {
  todo: ['To do', '#efe9da', '#5b6a52'],
  doing: ['Doing', '#f4dfae', '#6b4e12'],
  done: ['Done', '#cfdcbc', '#2f3d24'],
};
const NEXT_STATUS: Record<PlanTask['status'], PlanTask['status']> = { todo: 'doing', doing: 'done', done: 'todo' };

/** Where a task is at, as a coloured pill: tap for the next (to do → doing → done). */
function StatusPill({ status, onChange }: { status: PlanTask['status']; onChange: (s: PlanTask['status']) => void }) {
  const [label, bg, fg] = STATUS[status];
  return (
    <button type="button" aria-label={`Status: ${label}. Tap to change.`} onClick={() => onChange(NEXT_STATUS[status])} className="flex-none w-[56px] py-[2px] rounded-full border-0 text-[11px] font-semibold cursor-pointer" style={{ background: bg, color: fg }}>
      {label}
    </button>
  );
}

/** Who's doing what: each person's tasks (soonest first), with how far along they are. */
function People({ tasks, ids, nameOf, due, late, onStatus }: { tasks: PlanTask[]; ids: string[]; nameOf: (id: string) => string; due: (t: PlanTask) => string; late: (t: PlanTask) => boolean; onStatus: (t: PlanTask, s: PlanTask['status']) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {ids
        .map((id) => [id, tasks.filter((t) => assigneeOf(t) === id).sort((a, b) => b.before - a.before)] as const)
        .filter(([, ts]) => ts.length)
        .map(([id, ts]) => {
          const done = ts.filter((t) => statusOf(t) === 'done').length;
          const overdue = ts.filter(late).length;
          return (
            <section key={id || 'none'} aria-label={nameOf(id)} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] min-w-0">
              <div className="flex justify-between items-baseline gap-2">
                <strong className="text-[15px] font-semibold">{nameOf(id)}</strong>
                <span className={`text-[12px] ${overdue ? 'text-[#7a4a37] font-semibold' : 'text-[#5b6a52]'}`}>
                  {done} of {ts.length} done{overdue ? ` · ${overdue} overdue` : ''}
                </span>
              </div>
              <span className="h-[6px] rounded-full bg-[#e9e2cc] overflow-hidden mb-1">
                <span className="block h-full bg-[#5d6b47]" style={{ width: `${Math.round((done / ts.length) * 100)}%` }} />
              </span>
              {ts.map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-[5px] border-t border-[#ece3cd] text-[14px]">
                  <StatusPill status={statusOf(t)} onChange={(s) => onStatus(t, s)} />
                  <span className={`flex-1 min-w-0 truncate ${t.done ? 'line-through text-[#7a7466]' : ''}`}>{t.text}</span>
                  <span className={`text-[12px] whitespace-nowrap ${late(t) ? 'text-[#7a4a37] font-semibold' : 'text-[#7a7466]'}`}>{due(t)}</span>
                </div>
              ))}
            </section>
          );
        })}
    </div>
  );
}

/** People helping (a parent, a bridesmaid, a friend): each gets their own task list on a private link. */
function Helpers({ helpers, slug, counts, onChange }: { helpers: Helper[]; slug: string; counts: (id: string) => number; onChange: (next: Helper[], msg: string) => void }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const toast = useToast();
  const link = (h: Helper) => `${window.location.origin}/w/${slug}/tasks?k=${h.key}`;
  const copy = async (h: Helper) => {
    try {
      await navigator.clipboard.writeText(link(h));
      toast(`${h.name}’s link copied`);
    } catch {
      toast('Copy didn’t work: open the link and copy it from the address bar.');
    }
  };
  return (
    <section aria-label="People helping" className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <H2>People helping</H2>
      <p className="m-0 text-[13px] text-[#5b6a52]">Give tasks to family and friends. Each gets a private link to their own list: what’s theirs, by date, and a tap to mark it doing or done.</p>
      {helpers.map((h) => (
        <div key={h.id} className="flex items-center gap-3 flex-wrap py-2 border-t border-[#ece3cd] text-[14px]">
          <span className="flex-1 min-w-[140px]">
            <span className="font-medium">{h.name}</span>
            <span className="text-[#7a7466]"> · {counts(h.id)} to do</span>
          </span>
          <button type="button" onClick={() => void copy(h)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
            Copy their link
          </button>
          {h.mobile && (
            <a href={`sms:${h.mobile.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(`Here’s your list of wedding jobs: ${link(h)}`)}`} className="text-[13px] !text-[#33402f]">
              Text it to them
            </a>
          )}
          <a href={link(h)} target="_blank" rel="noopener" className="text-[13px] !text-[#33402f]">
            Open
          </a>
          <button type="button" aria-label={`Remove ${h.name}`} onClick={() => onChange(helpers.filter((x) => x.id !== h.id), `${h.name} removed; their tasks are unassigned`)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466]">
            ×
          </button>
        </div>
      ))}
      <form
        className="flex gap-2 flex-wrap items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const key = crypto.randomUUID().replace(/-/g, '');
          onChange([...helpers, { id: crypto.randomUUID().slice(0, 8), name: name.trim().slice(0, 80), mobile: mobile.trim().slice(0, 20), key }], `${name.trim()} added: give them tasks with “Who?”`);
          setName('');
          setMobile('');
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] flex-1 min-w-[150px]">
          Name
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          Mobile (optional)
          <input value={mobile} maxLength={20} inputMode="tel" onChange={(e) => setMobile(e.target.value)} className={inputCls} />
        </label>
        <Pill type="submit" kind="outline">
          Add
        </Pill>
      </form>
    </section>
  );
}

import { PLAN_TEMPLATE, type PlanChecklist, type PlanTask } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, plannerApi } from '../../lib/api';
import { useAdmin } from '../Shell';
import { useDocSave } from './useDocSave';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Wedding planner → Checklist: what to do and when, counted back from the wedding date (the usual
 * Australian plan to start, including the Notice of Intended Marriage deadlines). Ticks save at once.
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
  const [whose, setWhose] = useState<'all' | PlanTask['owner']>('all');
  const [adding, setAdding] = useState({ text: '', when: '' });

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

  const save = async (tasks: PlanTask[], done?: string) => {
    const before = doc;
    setDoc({ ...doc, data: { tasks } });
    try {
      const r = await saveDoc({ tasks });
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
  const ownerLabel = (o: PlanTask['owner']) => (o === 'p1' ? n1 : o === 'p2' ? n2 : o === 'both' ? 'Both' : 'Whose?');
  const NEXT_OWNER: Record<PlanTask['owner'], PlanTask['owner']> = { '': 'p1', p1: 'p2', p2: 'both', both: '' };
  const left = tasks.filter((t) => !t.done && (whose === 'all' || t.owner === whose || (whose !== '' && t.owner === 'both')));
  const open = tasks.filter((t) => !t.done);
  const load_ = { p1: open.filter((t) => t.owner === 'p1' || t.owner === 'both').length, p2: open.filter((t) => t.owner === 'p2' || t.owner === 'both').length, none: open.filter((t) => !t.owner).length };
  const overdue = left.filter((t) => (dueDate(t)?.getTime() ?? Infinity) < now);
  const shown = show === 'todo' ? left : tasks.filter((t) => whose === 'all' || t.owner === whose || (whose !== '' && t.owner === 'both'));
  const groups = BANDS.map(([, label]) => [label, shown.filter((t) => bandOf(t.before) === label)] as const).filter(([, ts]) => ts.length);

  if (!tasks.length) {
    return (
      <section className="flex flex-col gap-3 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
        <H2>Your planning checklist</H2>
        <p className="m-0 text-[15px] text-[#5b6a52]">
          Start with the usual Australian wedding plan: {PLAN_TEMPLATE.length} things, each due a set time before your day{day ? ` (${fmt(new Date(day))})` : ''}, including the Notice of
          Intended Marriage deadlines. Change, add or remove anything.
        </p>
        <Pill kind="primary" className="self-start" onClick={() => void save(PLAN_TEMPLATE.map((t) => ({ ...t, id: newId(), done: false, note: '', owner: '' as const })), 'Checklist ready')}>
          Start the checklist
        </Pill>
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
      {/* Who's doing what: still to do, by whose job it is (tap a name to see just theirs). */}
      <div role="radiogroup" aria-label="Whose" className="flex gap-2 flex-wrap items-center text-[13px]">
        {(
          [
            ['all', `Everyone · ${open.length}`],
            ['p1', `${n1} · ${load_.p1}`],
            ['p2', `${n2} · ${load_.p2}`],
            ['', `Not decided · ${load_.none}`],
          ] as const
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

      {groups.map(([label, ts]) => (
        <section key={label} aria-label={label} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <div className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52] pb-1">{label}</div>
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
                  onChange={() => void save(doc.data.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                  className="mt-[3px] w-[18px] h-[18px] flex-none accent-[#5d6b47]"
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-[15px] ${t.done ? 'line-through text-[#7a7466]' : ''}`}>
                    {t.legal && <span className="mr-2 py-[1px] px-2 rounded-full bg-[#f1e1d6] text-[#7a4a37] text-[11px] font-semibold align-middle">Legal</span>}
                    {t.text}
                  </div>
                  {t.note && <div className="text-[13px] text-[#5b6a52]">{t.note}</div>}
                </div>
                <button
                  type="button"
                  aria-label={`Whose job: ${ownerLabel(t.owner)}. Tap to change.`}
                  onClick={() => void save(doc.data.tasks.map((x) => (x.id === t.id ? { ...x, owner: NEXT_OWNER[x.owner] } : x)))}
                  className={`flex-none py-[2px] px-2 rounded-full border text-[11px] cursor-pointer ${t.owner ? 'bg-[#efe7d3] border-[#e2d7bc] text-[#33402f]' : 'bg-transparent border-dashed border-[#c6b794] text-[#7a7466]'}`}
                >
                  {ownerLabel(t.owner)}
                </button>
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
      {!groups.length && <p className="m-0 text-[15px] text-[#3d4a2f]">Everything's done ✓</p>}

      <form
        className="flex gap-2 flex-wrap items-end p-4 rounded-[16px] border border-dashed border-[#c6b794]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!adding.text.trim()) return;
          // A date becomes "days before the day"; no date = in the last month.
          const before = adding.when && day ? Math.round((day - Date.parse(`${adding.when}T12:00`)) / DAY) : 14;
          void save([...doc.data.tasks, { id: newId(), text: adding.text.trim(), before: Math.max(-60, Math.min(800, before)), done: false, note: '', legal: false, owner: whose === 'all' ? '' : whose }], 'Added');
          setAdding({ text: '', when: '' });
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] flex-1 min-w-[200px]">
          Add something to do
          <input value={adding.text} onChange={(e) => setAdding({ ...adding, text: e.target.value })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          By
          <input type="date" value={adding.when} onChange={(e) => setAdding({ ...adding, when: e.target.value })} className={inputCls} />
        </label>
        <Pill type="submit" kind="outline">
          Add
        </Pill>
      </form>
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

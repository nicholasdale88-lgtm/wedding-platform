import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { InstallApp } from '../../lib/InstallApp';

/**
 * /w/:slug/tasks?k=<key>: a helper's own wedding jobs (a parent, a bridesmaid, a friend). What the couple
 * has given them, soonest first, grouped by when it's due, with a tap to mark each doing or done; the
 * things on the day checklists handed to them (with their time); and all of it in their phone's calendar.
 */
type Status = 'todo' | 'doing' | 'done';
interface Data {
  couple: string;
  name: string;
  event: { name: string; date: string } | null;
  today: string;
  tasks: { id: string; text: string; note: string; due: string; status: Status }[];
  /** Things on a day checklist handed to them: when, at what time, ticked or not. */
  day?: { event: string; eventName: string; id: string; text: string; time: string; note: string; when: string; date: string; done: boolean }[];
  /** Their calendar feed (subscribe once; it updates by itself). */
  calendar?: string;
}
const STATUS: Record<Status, [string, string, string]> = { todo: ['To do', '#efe9da', '#5b6a52'], doing: ['Doing', '#f4dfae', '#6b4e12'], done: ['Done ✓', '#cfdcbc', '#2f3d24'] };
const day = (d: string) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function TasksPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const k = params.get('k') ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [problem, setProblem] = useState('');
  const loaded = useRef(false);
  useEffect(() => {
    fetch(`/api/p/${encodeURIComponent(slug)}/tasks?k=${encodeURIComponent(k)}`)
      .then(async (r) => {
        const b = (await r.json()) as Data & { error?: { message: string } };
        if (!r.ok) throw new Error(b.error?.message ?? 'This link isn’t working.');
        setD(b);
        loaded.current = true;
      })
      .catch((e: Error) => (loaded.current ? setProblem('Can’t reach the site just now.') : setErr(e.message)));
  }, [slug, k]);
  if (err) return <GuestMessage message={err} />;
  if (!d) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;

  const save = (id: string, status: Status) =>
    fetch(`/api/p/${encodeURIComponent(slug)}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, id, status }) });
  const set = async (id: string, status: Status) => {
    const before = d;
    setD((cur) => (cur ? { ...cur, tasks: cur.tasks.map((t) => (t.id === id ? { ...t, status } : t)) } : cur));
    try {
      // Busy (others saving at the same moment): try again quietly a few times.
      let r = await save(id, status);
      for (let i = 0; i < 4 && (r.status === 409 || r.status === 503); i++) {
        await new Promise((ok) => setTimeout(ok, 300 + Math.random() * 500));
        r = await save(id, status);
      }
      const b = (await r.json()) as Data & { error?: { message: string } };
      if (!r.ok) throw new Error(b.error?.message ?? 'That didn’t save.');
      setD(b);
      setProblem('');
    } catch (e) {
      setD(before);
      setProblem((e as Error).message);
    }
  };
  const tick = async (event: string, id: string, done: boolean) => {
    const before = d;
    setD((cur) => (cur ? { ...cur, day: cur.day?.map((x) => (x.event === event && x.id === id ? { ...x, done } : x)) } : cur));
    const post = () => fetch(`/api/p/${encodeURIComponent(slug)}/tasks/day`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, event, id, done }) });
    try {
      let r = await post();
      for (let i = 0; i < 4 && (r.status === 409 || r.status === 503); i++) {
        await new Promise((ok) => setTimeout(ok, 300 + Math.random() * 500));
        r = await post();
      }
      const b = (await r.json()) as Data & { error?: { message: string } };
      if (!r.ok) throw new Error(b.error?.message ?? 'That didn’t save.');
      setD(b);
      setProblem('');
    } catch (e) {
      setD(before);
      setProblem((e as Error).message);
    }
  };
  const onDay = d.day ?? [];
  const android = /android/i.test(navigator.userAgent);
  const feed = d.calendar?.replace(/^https?:/, 'webcal:') ?? '';
  const open = d.tasks.filter((t) => t.status !== 'done');
  const done = d.tasks.filter((t) => t.status === 'done');
  const week = plus(d.today, 7);
  const groups: [string, typeof open, string][] = [
    ['Overdue', open.filter((t) => t.due && t.due < d.today), '#7a4a37'],
    ['This week', open.filter((t) => t.due && t.due >= d.today && t.due <= week), '#8a6d2f'],
    ['Coming up', open.filter((t) => t.due > week), '#5b6a52'],
    ['Any time', open.filter((t) => !t.due), '#5b6a52'],
  ];
  const first = d.name.split(' ')[0];

  return (
    <main className="min-h-screen bg-[#f6f0e2] text-[#33402f] font-sans px-4 py-8">
      <div className="max-w-[560px] mx-auto flex flex-col gap-5">
        <header className="flex flex-col gap-1 text-center">
          <span className="text-[12px] tracking-[.28em] uppercase text-[#8a7a55]">{d.couple}’s wedding</span>
          <h1 className="m-0 font-display font-medium text-[34px] leading-tight">{first}’s jobs</h1>
          <span className="text-[14px] text-[#5b6a52]">
            {open.length ? `${open.length} to do` : 'All done. Thank you!'}
            {done.length ? ` · ${done.length} done` : ''}
            {d.event ? ` · ${d.event.name} ${day(d.event.date)}` : ''}
          </span>
          {d.tasks.length > 0 && (
            <span className="h-[8px] rounded-full bg-[#e9e2cc] overflow-hidden mt-2" role="img" aria-label={`${done.length} of ${d.tasks.length} done`}>
              <span className="block h-full bg-[#5d6b47]" style={{ width: `${Math.round((done.length / d.tasks.length) * 100)}%` }} />
            </span>
          )}
        </header>
        {problem && (
          <p role="alert" className="m-0 text-[14px] text-[#7a4a37] text-center">
            {problem}
          </p>
        )}
        {!d.tasks.length && !onDay.length && <p className="m-0 text-center text-[15px] text-[#5b6a52]">Nothing on your list yet. The couple will add things here.</p>}
        {groups
          .filter(([, ts]) => ts.length)
          .map(([title, ts, colour]) => (
            <section key={title} aria-label={title} className="flex flex-col gap-2">
              <h2 className="m-0 text-[12px] font-semibold tracking-[.14em] uppercase" style={{ color: colour }}>
                {title}
              </h2>
              {ts.map((t) => (
                <Task key={t.id} t={t} late={!!t.due && t.due < d.today} onSet={(s) => void set(t.id, s)} />
              ))}
            </section>
          ))}
        {onDay.length > 0 && (
          <section aria-label="Around the day" className="flex flex-col gap-2">
            <h2 className="m-0 text-[12px] font-semibold tracking-[.14em] uppercase text-[#8a6d2f]">Around the day</h2>
            {onDay.map((x) => (
              <label key={`${x.event}-${x.id}`} className="flex items-start gap-3 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0] cursor-pointer">
                <input type="checkbox" checked={x.done} onChange={() => void tick(x.event, x.id, !x.done)} className="mt-[3px] w-5 h-5 accent-[#5d6b47] flex-none" />
                <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
                  <span className={`text-[16px] ${x.done ? 'line-through text-[#7a7466]' : ''}`}>{x.text}</span>
                  <span className="text-[12px] text-[#7a7466]">
                    {[x.when, x.time, day(x.date), onDay.some((y) => y.event !== x.event) ? x.eventName : ''].filter(Boolean).join(' · ')}
                  </span>
                  {x.note && <span className="text-[13px] text-[#5b6a52]">{x.note}</span>}
                </span>
              </label>
            ))}
          </section>
        )}
        {feed && (d.tasks.length > 0 || onDay.length > 0) && (
          <section aria-label="Your calendar" className="flex flex-col gap-2 p-4 rounded-[14px] border border-[#c6b794] bg-[#fbf8f0] text-[14px] text-[#5b6a52]">
            <span>Put all of this in your phone’s calendar, with a reminder before each one. If the couple change anything, it updates by itself.</span>
            <a
              href={android ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}` : feed}
              target={android ? '_blank' : undefined}
              rel="noopener"
              className="self-start py-[10px] px-5 rounded-full bg-[#33402f] !text-[#fbf8f2] no-underline font-medium"
            >
              Add my jobs to my calendar
            </a>
          </section>
        )}
        {done.length > 0 && (
          <details className="flex flex-col gap-2">
            <summary className="cursor-pointer text-[13px] text-[#5b6a52]">Done · {done.length}</summary>
            <div className="flex flex-col gap-2 mt-2">
              {done.map((t) => (
                <Task key={t.id} t={t} late={false} onSet={(s) => void set(t.id, s)} />
              ))}
            </div>
          </details>
        )}
        <InstallApp what="your list" tone="guest" />
      </div>
    </main>
  );
}

function Task({ t, late, onSet }: { t: Data['tasks'][number]; late: boolean; onSet: (s: Status) => void }) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between gap-3 items-baseline">
        <span className={`text-[16px] ${t.status === 'done' ? 'line-through text-[#7a7466]' : ''}`}>{t.text}</span>
        {t.due && <span className={`text-[12px] whitespace-nowrap ${late ? 'text-[#7a4a37] font-semibold' : 'text-[#7a7466]'}`}>{day(t.due)}</span>}
      </div>
      {t.note && <span className="text-[13px] text-[#5b6a52]">{t.note}</span>}
      <div role="radiogroup" aria-label={`${t.text}: status`} className="flex gap-2">
        {(['todo', 'doing', 'done'] as const).map((s) => {
          const [label, bg, fg] = STATUS[s];
          const on = t.status === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSet(s)}
              className="flex-1 py-[8px] rounded-full text-[13px] font-semibold cursor-pointer border"
              style={on ? { background: bg, color: fg, borderColor: bg } : { background: 'transparent', color: '#7a7466', borderColor: '#e2d7bc' }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

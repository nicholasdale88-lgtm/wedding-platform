import { HELP, searchHelp, type HelpArticle } from '@wp/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ALL_EVENTS, useAdmin } from '../Shell';
import { inputCls } from '../ui';

/**
 * Account → Help: how to do each thing, step by step, with a search that answers as you type (no AI
 * needed) and a link straight to the place it happens. Still stuck: the planning assistant knows these
 * same guides and your wedding's details.
 */
const GROUPS: HelpArticle['group'][] = ['Getting started', 'Guests and replies', 'Planning', 'On the day', 'Your account'];

export function Help() {
  const { overview, path } = useAdmin();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const first = overview?.events[0]?.key;
  const where = (a: HelpArticle) => `${path(a.go.tab, a.go.event && first ? first : ALL_EVENTS)}${a.go.query ? `?${a.go.query}` : ''}`;
  const found = q.trim().length >= 3 ? searchHelp(q, 4) : [];
  const card = (a: HelpArticle, startOpen = false) => {
    const isOpen = startOpen || open === a.id;
    return (
      <article key={a.id} className="rounded-[14px] border border-[#e2d7bc] bg-white">
        <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen && !startOpen ? null : a.id)} className="w-full flex justify-between items-center gap-3 p-4 border-0 bg-transparent text-left cursor-pointer text-[#33402f]">
          <span className="text-[16px] font-semibold">{a.title}</span>
          <span aria-hidden>{isOpen ? '▴' : '▾'}</span>
        </button>
        {isOpen && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            <ol className="m-0 pl-5 flex flex-col gap-2 text-[15px] leading-[1.5]">
              {a.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <Link to={where(a)} className="self-start py-[8px] px-4 rounded-full bg-[#33402f] text-[#fbf8f2] text-[14px] no-underline">
              Take me there
            </Link>
          </div>
        )}
      </article>
    );
  };
  return (
    <div className="flex flex-col gap-6 max-w-[760px]">
      <header>
        <div className="text-[12px] font-semibold tracking-[.18em] uppercase text-[#5b6a52]">Account</div>
        <h1 className="m-0 mt-[6px] font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">Help</h1>
        <p className="m-0 mt-1 text-[15px] text-[#5b6a52]">How to do anything here, in a few steps.</p>
      </header>
      <label className="flex flex-col gap-1 text-[14px] font-semibold">
        What do you want to do?
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. send reminders, seating versions, compare quotes" className={inputCls} autoFocus />
      </label>
      {q.trim().length >= 3 && (
        <section aria-label="Answers" className="flex flex-col gap-3">
          {found.length ? found.map((a, i) => card(a, i === 0)) : <p className="m-0 text-[15px] text-[#5b6a52]">Nothing in the guides matches that yet.</p>}
          {first && (
            <p className="m-0 text-[14px] text-[#5b6a52]">
              Not it?{' '}
              <Link to={`${path('planner', first)}?view=assistant`} className="!text-[#33402f]">
                Ask the planning assistant
              </Link>
              : it knows these guides and your wedding’s details.
            </p>
          )}
        </section>
      )}
      {GROUPS.map((g) => (
        <section key={g} aria-label={g} className="flex flex-col gap-2">
          <h2 className="m-0 text-[13px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">{g}</h2>
          {HELP.filter((a) => a.group === g).map((a) => card(a))}
        </section>
      ))}
    </div>
  );
}

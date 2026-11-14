import { searchHelp, type CompanyHelpGroup, type CompanyHelpPack, type HelpArticle } from '@wp/shared';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Walkthrough, type HelpPack } from '../admin/help/Walkthrough';
import { companyApi } from '../lib/api';

/**
 * Company portal → Help: how to run the business side, like the couples' Help. It has a search that answers
 * as you type, guides grouped by job, a Watch button on each guide for its narrated walkthrough, and a tour
 * for someone new. "Take me there" opens the right tab.
 *
 * The guides come from the API for signed-in staff only (GET /api/a/company/help), so they are never part
 * of the public website's code. Each person gets only the guides for the parts of the portal their role
 * opens.
 */
const GROUPS: CompanyHelpGroup[] = ['Start here', 'Couples and support', 'Growth', 'Money', 'Team and bots'];

/** The walkthrough's phone in the portal's own colours. */
const THEME = { '--adm-ink': '#3a2532', '--adm-bg': '#fbf5f0', '--adm-line': '#ecdcd2', '--adm-muted': '#6e6068' } as CSSProperties;

const sayFrom = (say: CompanyHelpPack['say']) => (id: string, step: number) => {
  const s = Object.prototype.hasOwnProperty.call(say, id) ? say[id] : undefined;
  if (!s || !Number.isInteger(step)) return null;
  if (step === -1) return s.intro;
  const line = s.steps[step];
  if (line === undefined) return null;
  return step === s.steps.length - 1 ? `${line} ${s.outro}` : line;
};

export function CompanyHelp({ from, fromLabel, onGo }: { from?: string; fromLabel?: string; onGo: (tab: string) => void }) {
  const [data, setData] = useState<CompanyHelpPack | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [watching, setWatching] = useState<HelpArticle[] | null>(null);
  useEffect(() => {
    companyApi.help().then(setData, (e: Error) => setError(e.message));
  }, []);
  const pack = useMemo<HelpPack | null>(() => (data ? { scenes: data.scenes, say: sayFrom(data.say), places: data.places, menu: ['Couples', 'Money & tax'] } : null), [data]);
  if (error) return <p role="alert" className="m-0 p-3 rounded-[10px] bg-[#fbeaea] text-[#7a2e2e] text-[14px]">{error}</p>;
  if (!data || !pack) return <p className="text-[#6e6068]">Loading…</p>;

  const all = data.articles;
  const tour = data.tour.map((id) => all.find((a) => a.id === id)).filter((a): a is HelpArticle => !!a);
  const minutes = Math.max(1, Math.round(tour.reduce((n, a) => n + 2.6 + a.steps.reduce((m, s) => m + Math.max(4, s.split(/\s+/).length * 0.33), 0), 0) / 60));
  const found = q.trim().length >= 3 ? searchHelp(q, 4, all) : [];
  const here = from ? all.filter((a) => a.go.tab === from) : [];
  const where = (a: HelpArticle) => `/company#${a.go.tab}`;

  const card = (a: HelpArticle, startOpen = false) => {
    const isOpen = startOpen || open === a.id;
    return (
      <article key={a.id} className="rounded-[14px] border border-[#ecdcd2] bg-white">
        <div className="flex items-center">
          <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen && !startOpen ? null : a.id)} className="flex-1 flex justify-between items-center gap-3 p-4 border-0 bg-transparent text-left cursor-pointer text-[#3a2532]">
            <span className="text-[16px] font-semibold">{a.title}</span>
            <span aria-hidden>{isOpen ? '▴' : '▾'}</span>
          </button>
          <button type="button" onClick={() => setWatching([a])} aria-label={`Watch: ${a.title}`} className="flex-none mr-3 py-[6px] px-3 rounded-full border border-[#e3cfc6] bg-transparent text-[13px] cursor-pointer text-[#3a2532]">
            ▶ Watch
          </button>
        </div>
        {isOpen && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            <ol className="m-0 pl-5 flex flex-col gap-2 text-[15px] leading-[1.5]">
              {a.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <button type="button" onClick={() => onGo(a.go.tab)} className="self-start py-[8px] px-4 rounded-full border-0 bg-[#3a2532] text-[#fbf8f2] text-[14px] cursor-pointer">
              Take me there
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="flex flex-col gap-6 max-w-[760px]" style={THEME}>
      <header>
        <h1 className="m-0 text-[28px] font-semibold text-[#2a1c26]">Help</h1>
        <p className="m-0 mt-1 text-[15px] text-[#6e6068]">How to run each part of the business, in a few steps. Only you and your team can see this.</p>
      </header>
      {tour.length > 0 && (
        <section aria-label="Video walkthroughs" className="flex items-center gap-4 flex-wrap p-4 rounded-[16px] text-[#fbf8f2]" style={{ background: 'linear-gradient(180deg, #3d2634, #2a1c26)' }}>
          <button type="button" onClick={() => setWatching(tour)} aria-label="Play the tour" className="flex-none w-14 h-14 rounded-full border-0 bg-[#e6cf9e] text-[#2a1c26] text-[20px] cursor-pointer">
            ▶
          </button>
          <span className="flex-1 min-w-[200px] flex flex-col gap-[2px]">
            <strong className="font-medium text-[22px] leading-tight">New to the portal? Watch the tour</strong>
            <span className="text-[14px] text-[#d9c3c6]">About {minutes} minutes: your daily routine, connecting services, plan requests, feedback, promo codes and bots. Every guide below has its own short walkthrough too.</span>
          </span>
        </section>
      )}
      <label className="flex flex-col gap-1 text-[14px] font-semibold text-[#3a2532]">
        What do you want to do?
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. refund a couple, promo code, set up a bot" className="w-full py-[9px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px] sm:text-[15px] text-[#3a2532] font-normal" />
      </label>
      {q.trim().length >= 3 && (
        <section aria-label="Answers" className="flex flex-col gap-3">
          {found.length ? found.map((a, i) => card(a, i === 0)) : <p className="m-0 text-[15px] text-[#6e6068]">Nothing in the guides matches that yet. Try one or two words, like “refund”, “promo” or “bot”.</p>}
        </section>
      )}
      {here.length > 0 && !q.trim() && (
        <section aria-label="For the page you were on" className="flex flex-col gap-2">
          <h2 className="m-0 text-[13px] font-semibold tracking-[.14em] uppercase text-[#6e6068]">For {fromLabel ?? 'that page'}</h2>
          {here.map((a) => card(a))}
        </section>
      )}
      {GROUPS.map((g) => {
        const list = all.filter((a) => a.group === g);
        return list.length ? (
          <section key={g} aria-label={g} className="flex flex-col gap-2">
            <h2 className="m-0 text-[13px] font-semibold tracking-[.14em] uppercase text-[#6e6068]">{g}</h2>
            {list.map((a) => card(a))}
          </section>
        ) : null;
      })}
      {watching && <Walkthrough guides={watching} where={where} pack={pack} onClose={() => setWatching(null)} />}
    </div>
  );
}

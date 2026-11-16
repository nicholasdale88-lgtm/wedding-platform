import { PlanChecklist, PlanTask, type AssistantAction } from '@wp/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { plannerApi } from '../lib/api';
import { ALL_EVENTS, useAdmin } from './Shell';
import { DEMO_WID } from '../try/demo';
import { inputCls } from './ui';

/**
 * Ask: the couple's personal assistant, on every screen of their app. It opens beside what they're doing,
 * shows what needs them next, answers from their own wedding (dates, replies, budget, vendors, party) and
 * the app's help, knows which screen they asked from, and can offer two kinds of button: open a screen, or
 * add a task to their checklist. Nothing changes until they tap the button (and say OK to a task).
 * Runs on the free daily allowance; the conversation isn't stored.
 */

type Turn = { role: 'user' | 'assistant'; text: string; actions?: AssistantAction[] };

/** Questions worth asking, by the screen they're on. */
const STARTERS: Record<string, string[]> = {
  overview: ['What should we be doing this month?', 'What’s most urgent right now?'],
  guests: ['Who still hasn’t replied?', 'How do I add a plus-one?'],
  seating: ['How should we seat divorced parents?', 'Tips for seating a big family'],
  dietary: ['How do I tell the caterer about allergies?', 'Who has special diets?'],
  texts: ['Write a friendly reminder for guests who haven’t replied', 'When should the night-before text go?'],
  party: ['Draft a short outline for the best man’s speech', 'What should the bridesmaids be doing this month?'],
  planner: ['Check our budget: where are we over or under?', 'Which vendors have we still not booked?'],
  pages: ['Help us word our invitation', 'Which design suits a garden wedding?'],
  photos: ['How do guests add their photos?', 'Ideas for a photo shot list'],
};
const ANY = ['What should we be doing this month?', 'What do we need for the Notice of Intended Marriage?'];

export function AskAnywhere({ lift = false }: { lift?: boolean } = {}) {
  const { wid, overview: o, path, event } = useAdmin();
  const { tab = 'overview' } = useParams();
  const [params] = useSearchParams();
  const go = useNavigate();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [on, setOn] = useState<boolean | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || on !== null) return;
    plannerApi
      .aiStatus(wid)
      .then((s) => setOn(s.on))
      .catch(() => setOn(null));
  }, [open, on, wid]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [turns.length, busy]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  // The planner's own Assistant page has the full-size conversation.
  if (tab === 'planner' && params.get('view') === 'assistant') return null;

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setProblem('');
    const history = turns.slice(-6).map(({ role, text: t }) => ({ role, text: t }));
    setTurns((t) => [...t, { role: 'user', text }]);
    setQ('');
    try {
      const r = await plannerApi.ask(wid, text, history, tab);
      setTurns((t) => [...t, { role: 'assistant', text: r.answer, actions: r.actions ?? [] }]);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Add a task to their planning checklist, due a week from now (they can change it there). */
  const addTask = async (text: string) => {
    if (!window.confirm(`Add this to your checklist?\n\n${text}`)) return;
    // The sample keeps nothing: it shows the task added.
    if (wid === DEMO_WID) {
      setAdded((x) => [...x, text]);
      return;
    }
    try {
      const cur = await plannerApi.doc<PlanChecklist>(wid, 'checklist');
      const list = PlanChecklist.parse(cur.data ?? {});
      const days = o?.daysToGo ?? 60;
      const task = PlanTask.parse({ id: `a${Date.now().toString(36)}`, text, before: Math.max(-60, Math.min(800, days - 7)), note: 'Added by Ask', helper: '', doneOn: '' });
      await plannerApi.saveDoc(wid, 'checklist', '', { ...list, tasks: [...list.tasks, task] }, cur.version);
      setAdded((a) => [...a, text]);
    } catch (e) {
      setProblem((e as Error).message);
    }
  };

  const act = (a: AssistantAction) => {
    if (a.kind === 'open') {
      setOpen(false);
      go(path(a.screen, a.screen === 'help' ? ALL_EVENTS : event || undefined));
    } else void addTask(a.text);
  };

  const next = (o?.needsYou ?? []).slice(0, 3);
  const starters = STARTERS[tab] ?? ANY;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`fixed z-[12] right-4 ${lift ? 'bottom-[calc(96px+env(safe-area-inset-bottom))]' : 'bottom-[calc(68px+env(safe-area-inset-bottom))]'} flex items-center gap-2 py-[10px] px-4 min-h-[44px] rounded-full border-0 bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] text-[14px] font-semibold shadow-[0_10px_24px_rgba(30,20,10,.28)] cursor-pointer print:hidden`}
      >
        <span aria-hidden className="text-[16px] leading-none">✦</span> Ask
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Ask: your assistant"
          className="fixed z-[41] right-0 sm:right-4 bottom-0 sm:bottom-[calc(124px+env(safe-area-inset-bottom))] w-full sm:w-[400px] max-h-[min(640px,88vh)] flex flex-col rounded-t-[20px] sm:rounded-[20px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)] shadow-[0_24px_60px_rgba(30,20,10,.3)] print:hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <div className="min-w-0">
              <strong className="block font-display text-[24px] leading-tight font-medium">Ask</strong>
              <span className="block text-[12px] text-[var(--adm-muted,#5b6a52)]">Your assistant. It knows your wedding; check anything important.</span>
            </div>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="flex-none w-10 h-10 rounded-full border border-[var(--adm-line,#c6b794)] bg-white text-[20px] leading-none cursor-pointer">
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3 flex flex-col gap-3">
            {on === false && <p className="m-0 p-3 rounded-[12px] bg-[#fdf6e6] border border-[#c8a46a] text-[13px]">The assistant isn’t switched on for this site yet. The steps are in Wedding planner → Assistant.</p>}
            {!turns.length && next.length > 0 && (
              <section aria-label="Next for you" className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--adm-muted,#5b6a52)]">Next for you</span>
                {next.map((t) => (
                  <button
                    key={t.kind}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      go(path(t.link, t.event));
                    }}
                    className="flex justify-between items-center gap-3 py-2 px-3 min-h-[44px] rounded-[12px] border border-[var(--adm-line,#e2d7bc)] bg-white text-left cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{t.title}</span>
                      <span className="block text-[12px] text-[var(--adm-muted,#5b6a52)] truncate">{t.detail}</span>
                    </span>
                    <span className="flex-none text-[13px] underline">{t.cta}</span>
                  </button>
                ))}
              </section>
            )}
            {!turns.length && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--adm-muted,#5b6a52)]">Try asking</span>
                <div className="flex gap-2 flex-wrap">
                  {starters.map((s) => (
                    <button key={s} type="button" onClick={() => void ask(s)} className="py-2 px-3 rounded-full border border-[var(--adm-line,#c6b794)] bg-white text-[13px] text-left cursor-pointer hover:bg-[var(--adm-tint,#efe7d3)]">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                className={`max-w-[92%] py-[10px] px-[14px] rounded-[16px] whitespace-pre-wrap break-words text-[14px] leading-[1.5] ${
                  t.role === 'user' ? 'self-end bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] rounded-br-[6px]' : 'self-start bg-white text-[var(--adm-ink,#33402f)] rounded-bl-[6px] shadow-[0_1px_2px_rgba(0,0,0,.08)]'
                }`}
              >
                {t.text}
                {t.role === 'assistant' && (
                  <span className="flex gap-2 flex-wrap mt-2">
                    {(t.actions ?? []).map((a) =>
                      a.kind === 'todo' && added.includes(a.text) ? (
                        <span key={a.text} className="py-[6px] px-3 rounded-full bg-[var(--adm-tint,#efe7d3)] text-[12px]">
                          ✓ Added to your checklist
                        </span>
                      ) : (
                        <button key={a.kind === 'open' ? a.screen : a.text} type="button" onClick={() => act(a)} className="py-[6px] px-3 min-h-[36px] rounded-full border border-[var(--adm-ink,#33402f)] bg-transparent text-[12px] font-semibold cursor-pointer text-left">
                          {a.kind === 'open' ? `Open ${a.label}` : `Add to checklist: ${a.text}`}
                        </button>
                      ),
                    )}
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(t.text)} className="p-0 border-0 bg-transparent text-[12px] underline text-[var(--adm-muted,#5b6a52)] cursor-pointer">
                      Copy
                    </button>
                  </span>
                )}
              </div>
            ))}
            {busy && <div className="self-start text-[13px] italic text-[var(--adm-muted,#5b6a52)]">Thinking…</div>}
            {problem && (
              <p role="alert" className="m-0 text-[13px] text-[#7a4a37]">
                {problem}
              </p>
            )}
            <div ref={end} />
          </div>
          <form
            className="flex gap-2 items-end p-3 border-t border-[var(--adm-line,#e2d7bc)] pb-[max(12px,env(safe-area-inset-bottom))]"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(q);
            }}
          >
            <textarea
              aria-label="Ask your assistant"
              rows={1}
              maxLength={800}
              value={q}
              placeholder="Ask anything…"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(q);
                }
              }}
              className={`${inputCls} flex-1 resize-none !text-[16px]`}
            />
            <button type="submit" disabled={busy || !q.trim()} className="py-[10px] px-4 min-h-[44px] rounded-full border-0 bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] text-[14px] font-semibold cursor-pointer disabled:opacity-50">
              Ask
            </button>
          </form>
        </div>
      )}
    </>
  );
}

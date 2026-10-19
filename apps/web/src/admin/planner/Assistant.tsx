import { useEffect, useRef, useState } from 'react';
import { plannerApi } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill } from '../ui';

/**
 * Wedding planner → Assistant: ask anything about planning the wedding. It knows your dates, replies,
 * budget, vendors and wedding party (from this app), and drafts wording, speeches and to-do lists.
 * Runs on the free daily allowance; the conversation isn't stored.
 */

const STARTERS = [
  'What should we be doing this month?',
  'Check our budget: where are we over or under?',
  'Which vendors have we still not booked?',
  'Draft a short outline for the best man’s speech',
  'Write a friendly reminder text for guests who haven’t replied',
  'What do we need for the Notice of Intended Marriage?',
];
type Turn = { role: 'user' | 'assistant'; text: string };

export function Assistant() {
  const { wid } = useAdmin();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [turns.length, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setProblem('');
    const history = turns.slice(-6);
    setTurns((t) => [...t, { role: 'user', text }]);
    setQ('');
    try {
      const r = await plannerApi.ask(wid, text, history);
      setTurns((t) => [...t, { role: 'assistant', text: r.answer }]);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <H2>Planning assistant</H2>
        <p className="m-0 mt-1 text-[15px] text-[#5b6a52]">Ask about anything wedding. It knows your dates, replies, budget, vendors and wedding party, and drafts wording for you. Check anything important before you rely on it.</p>
      </header>

      <section aria-label="Conversation" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] min-h-[320px]">
        {!turns.length && (
          <div className="flex flex-col gap-3">
            <span className="text-[14px] text-[#5b6a52]">Try one of these:</span>
            <div className="flex gap-2 flex-wrap">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => void ask(s)} className="py-2 px-3 rounded-full border border-[#c6b794] bg-white text-[14px] text-left cursor-pointer hover:bg-[#efe7d3]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={`max-w-[88%] py-3 px-4 rounded-[18px] whitespace-pre-wrap break-words text-[15px] leading-[1.5] ${
              t.role === 'user' ? 'self-end bg-[#33402f] text-[#f3ecd6] rounded-br-[6px]' : 'self-start bg-white text-[#33402f] rounded-bl-[6px] shadow-[0_1px_2px_rgba(0,0,0,.08)]'
            }`}
          >
            {t.text}
            {t.role === 'assistant' && (
              <button type="button" onClick={() => void navigator.clipboard?.writeText(t.text)} className="block mt-2 p-0 border-0 bg-transparent text-[12px] underline text-[#5b6a52] cursor-pointer">
                Copy
              </button>
            )}
          </div>
        ))}
        {busy && <div className="self-start text-[14px] italic text-[#5b6a52]">Thinking…</div>}
        {problem && (
          <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">
            {problem}
          </p>
        )}
        <div ref={end} />
      </section>

      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <textarea
          aria-label="Your question"
          rows={2}
          maxLength={800}
          value={q}
          placeholder="Ask a question…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(q);
            }
          }}
          className={`${inputCls} flex-1 resize-y`}
        />
        <Pill type="submit" kind="primary" disabled={busy || !q.trim()}>
          Ask
        </Pill>
      </form>
    </div>
  );
}

import { QUIZ_TEMPLATE, type Quiz, type QuizQuestion } from '@wp/shared';
import { useEffect, useState } from 'react';
import { quizApi } from '../../lib/api';
import { useUnsavedChanges } from '../leave';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';
import { useLiveDoc } from './useDocSave';

const newId = () => crypto.randomUUID().slice(0, 10);

/**
 * Wedding planner → Quiz: "How well do you know the couple?" Write the questions (each with its choices
 * and the right one), switch it on, and send {quiz} in a text. Guests play once from their own link; here
 * you see everyone's scores.
 */
export function QuizEditor() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const live = useLiveDoc<Quiz>(wid, 'quiz', '', toast);
  useUnsavedChanges(live.pending);
  const [players, setPlayers] = useState<{ name: string; score: number }[]>([]);
  useEffect(() => {
    quizApi.players(wid).then((r) => setPlayers(r.players), () => setPlayers([]));
  }, [wid]);
  if (live.error) return <p role="alert" className="text-[#7a4a37]">{live.error}</p>;
  if (!live.doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading the quiz…</div>;
  const d = live.doc.data;
  const n1 = overview?.wedding.name1.split(' ')[0] ?? 'Partner 1';
  const n2 = overview?.wedding.name2.split(' ')[0] ?? 'Partner 2';
  const named = (s: string) => s.replace(/Partner 1/g, n1).replace(/Partner 2/g, n2);
  const setQ = (id: string, p: Partial<QuizQuestion>, now = false) => live.set({ ...d, questions: d.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) }, now);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>Quiz</H2>
          <div className="text-[13px] text-[#5b6a52] max-w-[640px]">“How well do you know {n1} &amp; {n2}?” Guests play once from their own link; send it with {'{quiz}'} in any text. The best scores show on a leaderboard.</div>
        </div>
        <label className="flex items-center gap-2 text-[15px] cursor-pointer">
          <input type="checkbox" role="switch" checked={d.on} disabled={!d.questions.length} onChange={(e) => live.set({ ...d, on: e.target.checked }, true)} className="w-5 h-5 accent-[#5d6b47]" />
          {d.on ? 'Open to guests' : 'Closed'}
        </label>
      </div>
      <input aria-label="Title" placeholder={`How well do you know ${n1} & ${n2}?`} value={d.title} maxLength={80} onChange={(e) => live.set({ ...d, title: e.target.value })} className={`${inputCls} font-display text-[20px]`} />
      {!d.questions.length && (
        <div className="flex flex-col items-start gap-2 p-5 rounded-[16px] border border-dashed border-[#c6b794] bg-[#fbf8f0]">
          <strong className="font-display text-[22px] font-medium">Start with five questions</strong>
          <p className="m-0 text-[14px] text-[#5b6a52]">Where you met, who said “I love you” first, who’s the better cook… then make them yours.</p>
          <Pill kind="primary" onClick={() => live.set({ ...d, questions: QUIZ_TEMPLATE.map((q) => ({ ...q, id: newId(), q: named(q.q), options: q.options.map(named) })) }, true)}>
            Start the quiz
          </Pill>
        </div>
      )}
      <ol className="list-none m-0 p-0 flex flex-col gap-3">
        {d.questions.map((q, i) => (
          <li key={q.id} className="flex flex-col gap-2 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <div className="flex gap-2 items-center">
              <span className="w-6 text-[14px] font-semibold text-[#7a7466]">{i + 1}</span>
              <input aria-label="Question" value={q.q} maxLength={200} onChange={(e) => setQ(q.id, { q: e.target.value })} className={`${inputCls} flex-1 min-w-0 font-medium`} />
              <button type="button" aria-label="Remove question" onClick={() => live.set({ ...d, questions: d.questions.filter((x) => x.id !== q.id) }, true)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[20px]">
                ×
              </button>
            </div>
            <div role="radiogroup" aria-label="Choices (tick the right one)" className="grid gap-2 sm:grid-cols-2 pl-8">
              {q.options.map((o, j) => (
                <label key={j} className={`flex items-center gap-2 p-2 rounded-[10px] border ${q.answer === j ? 'border-[#5d6b47] bg-[#eef1e4]' : 'border-[#e2d7bc] bg-white'}`}>
                  <input type="radio" name={`a-${q.id}`} aria-label={`The right answer: ${o}`} checked={q.answer === j} onChange={() => setQ(q.id, { answer: j }, true)} className="accent-[#5d6b47]" />
                  <input aria-label={`Choice ${j + 1}`} value={o} maxLength={120} onChange={(e) => setQ(q.id, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} className="flex-1 min-w-0 bg-transparent border-0 p-0 text-[14px]" />
                  {q.options.length > 2 && (
                    <button type="button" aria-label="Remove choice" onClick={() => setQ(q.id, { options: q.options.filter((_, k) => k !== j), answer: q.answer === j ? 0 : q.answer > j ? q.answer - 1 : q.answer }, true)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466]">
                      ×
                    </button>
                  )}
                </label>
              ))}
              {q.options.length < 5 && (
                <button type="button" onClick={() => setQ(q.id, { options: [...q.options, 'Another answer'] }, true)} className="p-2 rounded-[10px] border border-dashed border-[#c6b794] bg-transparent cursor-pointer text-[13px] text-left">
                  + A choice
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {d.questions.length > 0 && d.questions.length < 20 && (
        <Pill kind="dashed" className="self-start" onClick={() => live.set({ ...d, questions: [...d.questions, { id: newId(), q: 'Your question', options: [n1, n2], answer: 0 }] }, true)}>
          + Add a question
        </Pill>
      )}
      {players.length > 0 && (
        <section aria-label="Scores" className="flex flex-col gap-2 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <H2>Scores · {players.length} played</H2>
          <ol className="m-0 pl-5 flex flex-col gap-1 text-[14px]">
            {players.slice(0, 20).map((p, i) => (
              <li key={`${p.name}-${i}`}>
                {p.name} <span className="text-[#5b6a52]">· {p.score} of {d.questions.length}</span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(`Think you know us? Take the quiz: {quiz}`).then(() => toast('Copied: paste it into a new text'))} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
            Copy a text inviting guests to play
          </button>
        </section>
      )}
    </div>
  );
}

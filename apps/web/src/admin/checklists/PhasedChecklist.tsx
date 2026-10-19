import { PHASES, type CheckItem, type Phase } from '@wp/shared';
import { useState } from 'react';
import { inputCls, Pill } from '../ui';

/** A progress ring: how much of a list is done, at a glance. */
export function Ring({ done, total, size = 64, label }: { done: number; total: number; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const share = total ? done / total : 0;
  return (
    <span className="relative inline-flex flex-none items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${done} of ${total} done`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2d7bc" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={share === 1 ? '#5d6b47' : '#b39563'} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} className="transition-[stroke-dasharray] duration-500" />
      </svg>
      <span className="absolute text-[13px] font-semibold tabular-nums text-[#33402f]">{total ? `${Math.round(share * 100)}%` : '–'}</span>
    </span>
  );
}

/** Which moment we're in now, from the days left until the day (null when it's still more than a month away). */
export function phaseNow(days: number | null): Phase | null {
  if (days === null) return null;
  if (days < 0) return 'after';
  if (days === 0) return 'morning';
  if (days === 1) return 'eve';
  if (days <= 7) return 'week';
  if (days <= 31) return 'month';
  return null;
}

/**
 * A checklist grouped by moment (the month before … after), with the moment you're in now opened and
 * marked. Tick, add, remove, give a time or a tip. The parent saves `onChange`.
 */
export function PhasedChecklist({
  items,
  onChange,
  labels,
  now,
  who,
}: {
  items: CheckItem[];
  onChange: (next: CheckItem[]) => void;
  labels: Record<Phase, string>;
  now: Phase | null;
  who: string;
}) {
  const [hideDone, setHideDone] = useState(false);
  const [open, setOpen] = useState<Set<Phase>>(() => new Set(now ? [now] : PHASES.filter((p) => items.some((i) => i.phase === p && !i.done)).slice(0, 2)));
  const [adding, setAdding] = useState<{ phase: Phase; text: string; time: string }>({ phase: now ?? 'month', text: '', time: '' });
  const [detail, setDetail] = useState<number | null>(null);
  const patch = (i: number, p: Partial<CheckItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const toggleOpen = (p: Phase) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  return (
    <div className="flex flex-col gap-2">
      <label className="self-end flex items-center gap-2 text-[13px] text-[#5b6a52] cursor-pointer">
        <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="accent-[#5d6b47]" />
        Hide what’s done
      </label>
      {PHASES.map((p) => {
        const inPhase = items.map((it, i) => ({ it, i })).filter(({ it }) => it.phase === p);
        if (!inPhase.length && p !== adding.phase) return null;
        const done = inPhase.filter(({ it }) => it.done).length;
        const isOpen = open.has(p);
        const shown = hideDone ? inPhase.filter(({ it }) => !it.done) : inPhase;
        return (
          <section key={p} aria-label={labels[p]} className={`rounded-[14px] border ${p === now ? 'border-[#b39563] bg-[#fbf6ea]' : 'border-[#e2d7bc] bg-[#fbf8f0]'}`}>
            <button type="button" aria-expanded={isOpen} onClick={() => toggleOpen(p)} className="w-full flex items-center justify-between gap-3 py-3 px-4 bg-transparent border-0 cursor-pointer text-left">
              <span className="flex items-center gap-2">
                <span aria-hidden className={`inline-block transition-transform text-[#7a7466] ${isOpen ? 'rotate-90' : ''}`}>›</span>
                <span className="font-display text-[20px] font-medium">{labels[p]}</span>
                {p === now && <span className="py-[2px] px-2 rounded-full bg-[#b39563] text-white text-[11px] font-semibold tracking-[.08em] uppercase">Now</span>}
              </span>
              <span className={`text-[13px] tabular-nums ${inPhase.length && done === inPhase.length ? 'text-[#5d6b47] font-semibold' : 'text-[#5b6a52]'}`}>
                {inPhase.length ? (done === inPhase.length ? 'All done ✓' : `${done} of ${inPhase.length}`) : ''}
              </span>
            </button>
            {isOpen && (
              <ul className="list-none m-0 px-4 pb-3 flex flex-col">
                {shown.map(({ it, i }) => (
                  <li key={i} className="flex flex-col py-2 border-t border-[#ece3cd] first:border-t-0">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={it.done}
                        onChange={() => patch(i, { done: !it.done })}
                        aria-label={it.text}
                        className="mt-[2px] w-5 h-5 accent-[#5d6b47] flex-none cursor-pointer"
                      />
                      <button type="button" onClick={() => setDetail(detail === i ? null : i)} className={`flex-1 min-w-0 text-left p-0 border-0 bg-transparent cursor-pointer text-[15px] leading-snug ${it.done ? 'line-through text-[#7a7466]' : 'text-[#33402f]'}`}>
                        {it.time && <span className="text-[13px] font-semibold text-[#5b6a52] mr-2 tabular-nums">{it.time}</span>}
                        {it.text}
                        {it.note && detail !== i && <span aria-hidden className="ml-1 text-[#b39563]">ⓘ</span>}
                      </button>
                    </div>
                    {detail === i && (
                      <div className="flex flex-col gap-2 mt-2 ml-8">
                        {it.note && <p className="m-0 text-[13px] text-[#5b6a52]">{it.note}</p>}
                        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                          <input aria-label="What" value={it.text} maxLength={200} onChange={(e) => patch(i, { text: e.target.value })} className={`${inputCls} !py-2`} />
                          <input aria-label="Time" placeholder="Time" value={it.time} maxLength={20} onChange={(e) => patch(i, { time: e.target.value })} className={`${inputCls} !py-2`} />
                        </div>
                        <div className="flex gap-2 flex-wrap items-center">
                          <select aria-label="When" value={it.phase} onChange={(e) => patch(i, { phase: e.target.value as Phase })} className={`${inputCls} !py-[6px] !text-[13px]`}>
                            {PHASES.map((q) => (
                              <option key={q} value={q}>
                                {labels[q]}
                              </option>
                            ))}
                          </select>
                          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#7a4a37]">
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
                {!shown.length && <li className="py-2 text-[13px] text-[#7a7466]">{inPhase.length ? 'All done.' : 'Nothing here yet.'}</li>}
              </ul>
            )}
          </section>
        );
      })}
      <form
        className="flex gap-2 flex-wrap items-center mt-1"
        onSubmit={(e) => {
          e.preventDefault();
          const text = adding.text.trim();
          if (!text) return;
          onChange([...items, { text, time: adding.time.trim(), done: false, phase: adding.phase, note: '' }]);
          setOpen((s) => new Set(s).add(adding.phase));
          setAdding({ ...adding, text: '', time: '' });
        }}
      >
        <input aria-label={`Add to ${who}’s list`} placeholder="Add something to do" value={adding.text} maxLength={200} onChange={(e) => setAdding({ ...adding, text: e.target.value })} className={`${inputCls} flex-1 min-w-[180px] !py-2`} />
        <select aria-label="When" value={adding.phase} onChange={(e) => setAdding({ ...adding, phase: e.target.value as Phase })} className={`${inputCls} !py-2`}>
          {PHASES.map((q) => (
            <option key={q} value={q}>
              {labels[q]}
            </option>
          ))}
        </select>
        <Pill type="submit" kind="outline">
          Add
        </Pill>
      </form>
    </div>
  );
}

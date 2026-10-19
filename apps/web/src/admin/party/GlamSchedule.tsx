import { clockMinutes, clockText, glamSchedule, type Glam, type GlamPerson } from '@wp/shared';
import { useState } from 'react';
import { H2, inputCls, Pill } from '../ui';

/** Minutes, typed freely and kept between 10 and 240 once you leave the box. */
function Mins({ value, onValue, label, disabled }: { value: number; onValue: (n: number) => void; label: string; disabled: boolean }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={10}
      max={240}
      step={5}
      disabled={disabled}
      value={text ?? String(value)}
      onFocus={() => setText(String(value))}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        onValue(Math.max(10, Math.min(240, Number(text) || value)));
        setText(null);
      }}
      className={`${inputCls} !py-1 w-[64px]`}
    />
  );
}

const newId = () => crypto.randomUUID().slice(0, 10);
const span = (x?: [number, number]) => (x ? `${clockText(x[0])}–${clockText(x[1])}` : '—');

/**
 * A side's page → Hair and makeup: who's in the chairs, what each is having and for how long, how many
 * artists, and when everyone must be ready. The times work themselves out (the one marked last, usually
 * the bride, goes after everyone else so they're freshest for the photos).
 */
export function GlamSchedule({ glam, set, names, star }: { glam: Glam; set: (g: Glam, now?: boolean) => void; names: string[]; star: string }) {
  const s = glamSchedule(glam);
  // Without a ready-by time there's nothing to count back from: show lengths, not clock times.
  const timed = clockMinutes(glam.finish) !== null;
  const setP = (id: string, p: Partial<GlamPerson>, now = false) => set({ ...glam, people: glam.people.map((x) => (x.id === id ? { ...x, ...p } : x)) }, now);
  const add = (who: string, last = false) => ({ id: newId(), who, hair: true, makeup: true, hairMins: last ? 60 : 45, makeupMins: last ? 60 : 45, last });
  const missing = [star, ...names].filter((n) => n && !glam.people.some((p) => p.who.toLowerCase() === n.toLowerCase()));
  const byId = new Map(s.rows.map((r) => [r.id, r]));

  return (
    <section aria-label="Hair and makeup" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>Hair and makeup</H2>
          <div className="text-[13px] text-[#5b6a52]">Who’s in the chairs and for how long; the start times work themselves out.</div>
        </div>
        {glam.people.length > 0 && (
          <span className="text-[14px]">
            {timed ? (
              <>
                Start at <strong className="font-semibold">{clockText(s.start)}</strong>
              </>
            ) : (
              <>
                About <strong className="font-semibold">{Math.round((s.end - s.start) / 60 * 10) / 10} hours</strong> in all · set a ready-by time for the start times
              </>
            )}
          </span>
        )}
      </div>
      <div className="flex gap-4 flex-wrap items-end text-[13px] text-[#5b6a52]">
        <label className="flex flex-col gap-1">
          Everyone ready by
          <input aria-label="Ready by" placeholder="12:30pm" value={glam.finish} maxLength={20} onChange={(e) => set({ ...glam, finish: e.target.value })} className={`${inputCls} !py-2 w-[110px]`} />
        </label>
        <label className="flex flex-col gap-1">
          Hair artists
          <input type="number" min={1} max={6} value={glam.hairArtists} onChange={(e) => set({ ...glam, hairArtists: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })} className={`${inputCls} !py-2 w-[80px]`} />
        </label>
        <label className="flex flex-col gap-1">
          Makeup artists
          <input type="number" min={1} max={6} value={glam.makeupArtists} onChange={(e) => set({ ...glam, makeupArtists: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })} className={`${inputCls} !py-2 w-[80px]`} />
        </label>
      </div>
      {glam.people.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px] min-w-[620px]">
            <thead>
              <tr className="text-left text-[11px] tracking-[.12em] uppercase text-[#5b6a52]">
                <th className="py-1 font-semibold">Who</th>
                <th className="py-1 font-semibold">Hair</th>
                <th className="py-1 font-semibold">Makeup</th>
                <th className="py-1 font-semibold">Last</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {glam.people.map((p) => {
                const r = byId.get(p.id);
                return (
                  <tr key={p.id} className="border-t border-[#ece3cd] align-top">
                    <td className="py-2 pr-2">
                      <input aria-label="Who" value={p.who} maxLength={80} onChange={(e) => setP(p.id, { who: e.target.value })} className={`${inputCls} !py-[6px] w-full`} />
                    </td>
                    <td className="py-2 pr-2">
                      <label className="flex items-center gap-1">
                        <input type="checkbox" aria-label={`${p.who}: hair`} checked={p.hair} onChange={(e) => setP(p.id, { hair: e.target.checked }, true)} className="accent-[#5d6b47]" />
                        <Mins label={`${p.who} hair minutes`} value={p.hairMins} disabled={!p.hair} onValue={(n) => setP(p.id, { hairMins: n }, true)} />
                        min
                      </label>
                      <span className="block text-[12px] text-[#5b6a52] mt-1 tabular-nums">{p.hair && timed ? span(r?.hair) : ''}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <label className="flex items-center gap-1">
                        <input type="checkbox" aria-label={`${p.who}: makeup`} checked={p.makeup} onChange={(e) => setP(p.id, { makeup: e.target.checked }, true)} className="accent-[#5d6b47]" />
                        <Mins label={`${p.who} makeup minutes`} value={p.makeupMins} disabled={!p.makeup} onValue={(n) => setP(p.id, { makeupMins: n }, true)} />
                        min
                      </label>
                      <span className="block text-[12px] text-[#5b6a52] mt-1 tabular-nums">{p.makeup && timed ? span(r?.makeup) : ''}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <input type="checkbox" aria-label={`${p.who} goes last`} checked={p.last} onChange={(e) => setP(p.id, { last: e.target.checked }, true)} className="mt-2 accent-[#b39563]" />
                    </td>
                    <td className="py-2">
                      <button type="button" aria-label={`Remove ${p.who}`} onClick={() => set({ ...glam, people: glam.people.filter((x) => x.id !== p.id) }, true)} className="mt-1 p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px]">
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {missing.length > 0 && (
          <Pill kind="dashed" onClick={() => set({ ...glam, people: [...glam.people, ...missing.map((n) => add(n, n === star))] }, true)}>
            + {glam.people.length ? `Add ${missing.length === 1 ? missing[0] : `the other ${missing.length}`}` : `Everyone on this side (${missing.length})`}
          </Pill>
        )}
        <Pill kind="dashed" onClick={() => set({ ...glam, people: [...glam.people, add('Someone')] }, true)}>
          + Someone else (mums, flower girls)
        </Pill>
      </div>
    </section>
  );
}

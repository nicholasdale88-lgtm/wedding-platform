import { HOLD_TEMPLATE, type DayRoles, type Speech } from '@wp/shared';
import { useState } from 'react';
import { useUnsavedChanges } from '../leave';
import { useLiveDoc } from '../planner/useDocSave';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';

const newId = () => crypto.randomUUID().slice(0, 10);
const STATUS: Speech['status'][] = ['not started', 'drafting', 'ready'];
const STATUS_STYLE: Record<Speech['status'], string> = { 'not started': 'bg-[#f1e1d6] text-[#7a4a37]', drafting: 'bg-[#f3e8cc] text-[#6b5520]', ready: 'bg-[#dfe5cc] text-[#3d4a2f]' };

/**
 * Wedding party → Run sheet → Speeches and Who holds what: who speaks, in what order, for how long and how
 * ready they are (the MC sees the order on their page); and who has the rings, the envelopes, the paperwork.
 */
/** For a party that isn't the wedding (a birthday): what someone usually looks after. */
const PARTY_HOLDS = [
  { what: 'The cake, candles and a lighter', who: '' },
  { what: 'The cake knife and serviettes', who: '' },
  { what: 'Gifts and cards (and a bag to take them home)', who: '' },
  { what: 'The speaker and the playlist', who: '' },
  { what: 'The bar tab card', who: '' },
];

/** Speeches (or toasts, for a party) in order, and who looks after what on the day. */
export function Speeches({ event, names, party = false }: { event: string; names: string[]; party?: boolean }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const live = useLiveDoc<DayRoles>(wid, 'day-roles', event, toast);
  useUnsavedChanges(live.pending);
  const [who, setWho] = useState('');
  if (live.error) return <p role="alert" className="text-[#7a4a37]">{live.error}</p>;
  if (!live.doc) return null;
  const d = live.doc.data;
  const setSpeech = (id: string, p: Partial<Speech>, now = false) => live.set({ ...d, speeches: d.speeches.map((s) => (s.id === id ? { ...s, ...p } : s)) }, now);
  const move = (i: number, by: -1 | 1) => {
    const next = [...d.speeches];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s!);
    live.set({ ...d, speeches: next }, true);
  };
  const total = d.speeches.reduce((a, s) => a + s.minutes, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <datalist id="party-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <section aria-label="Speeches" className="flex flex-col gap-3">
        <div className="flex justify-between items-end gap-3">
          <div>
            <H2>{party ? 'Speeches and toasts' : 'Speeches'}</H2>
            <div className="text-[13px] text-[#5b6a52]">In speaking order{d.speeches.length ? ` · about ${total} minutes in all` : ''}. The MC sees this on their page.</div>
          </div>
        </div>
        <ol className="list-none m-0 p-0 flex flex-col gap-2">
          {d.speeches.map((s, i) => (
            <li key={s.id} className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
              <div className="flex items-center gap-2">
                <span className="w-6 text-[13px] font-semibold text-[#7a7466]">{i + 1}</span>
                <input aria-label="Who" list="party-names" value={s.who} maxLength={80} onChange={(e) => setSpeech(s.id, { who: e.target.value })} className={`${inputCls} flex-1 min-w-0 !py-2 font-medium`} />
                <button
                  type="button"
                  onClick={() => setSpeech(s.id, { status: STATUS[(STATUS.indexOf(s.status) + 1) % STATUS.length]! }, true)}
                  className={`flex-none py-1 px-3 rounded-full border-0 text-[12px] cursor-pointer capitalize ${STATUS_STYLE[s.status]}`}
                  aria-label={`${s.who || 'Speech'}: ${s.status}. Tap to change.`}
                >
                  {s.status}
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap pl-8 text-[13px] text-[#5b6a52]">
                <label className="flex items-center gap-1">
                  <input type="number" min={1} max={20} aria-label="Minutes" value={s.minutes} onChange={(e) => setSpeech(s.id, { minutes: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className={`${inputCls} !py-1 w-[64px]`} />
                  minutes
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={s.mic} onChange={(e) => setSpeech(s.id, { mic: e.target.checked }, true)} className="accent-[#5d6b47]" />
                  Microphone
                </label>
                <span className="flex-1" />
                <button type="button" aria-label="Earlier" disabled={!i} onClick={() => move(i, -1)} className="w-8 h-8 rounded-full border border-[#c6b794] bg-transparent cursor-pointer disabled:opacity-40">
                  ↑
                </button>
                <button type="button" aria-label="Later" disabled={i === d.speeches.length - 1} onClick={() => move(i, 1)} className="w-8 h-8 rounded-full border border-[#c6b794] bg-transparent cursor-pointer disabled:opacity-40">
                  ↓
                </button>
                <button type="button" aria-label={`Remove ${s.who}`} onClick={() => live.set({ ...d, speeches: d.speeches.filter((x) => x.id !== s.id) }, true)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a4a37] text-[18px]">
                  ×
                </button>
              </div>
              <input aria-label="Notes" placeholder="Notes (e.g. keep it under 4 minutes; no ex stories)" value={s.notes} maxLength={400} onChange={(e) => setSpeech(s.id, { notes: e.target.value })} className={`${inputCls} !py-2 !text-[13px] ml-8`} />
            </li>
          ))}
        </ol>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!who.trim()) return;
            live.set({ ...d, speeches: [...d.speeches, { id: newId(), who: who.trim(), minutes: 4, status: 'not started', mic: true, notes: '' }] }, true);
            setWho('');
          }}
        >
          <input aria-label="Who speaks" list="party-names" placeholder={party ? 'Who speaks (e.g. Best mate, Mum)' : 'Who speaks (e.g. Father of the bride)'} value={who} maxLength={80} onChange={(e) => setWho(e.target.value)} className={`${inputCls} flex-1 min-w-0 !py-2`} />
          <Pill type="submit" kind="outline">
            Add
          </Pill>
        </form>
      </section>

      <section aria-label="Who holds what" className="flex flex-col gap-3">
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <div>
            <H2>Who holds what</H2>
            <div className="text-[13px] text-[#5b6a52]">The precious things, and who has them on the day.</div>
          </div>
          {!d.holds.length && (
            <Pill kind="dashed" onClick={() => live.set({ ...d, holds: (party ? PARTY_HOLDS : HOLD_TEMPLATE).map((h) => ({ ...h, id: newId() })) }, true)}>
              Start with the usual
            </Pill>
          )}
        </div>
        <ul className="list-none m-0 p-0 flex flex-col rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
          {d.holds.map((h) => (
            <li key={h.id} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] gap-2 items-center py-2 px-3 border-t border-[#ece3cd] first:border-t-0">
              <input aria-label="What" value={h.what} maxLength={120} onChange={(e) => live.set({ ...d, holds: d.holds.map((x) => (x.id === h.id ? { ...x, what: e.target.value } : x)) })} className="bg-transparent border-0 p-0 text-[15px] min-w-0" />
              <input aria-label={`Who holds ${h.what}`} list="party-names" placeholder="Who?" value={h.who} maxLength={80} onChange={(e) => live.set({ ...d, holds: d.holds.map((x) => (x.id === h.id ? { ...x, who: e.target.value } : x)) })} className={`${inputCls} !py-[6px] !text-[14px]`} />
              <button type="button" aria-label={`Remove ${h.what}`} onClick={() => live.set({ ...d, holds: d.holds.filter((x) => x.id !== h.id) }, true)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px]">
                ×
              </button>
            </li>
          ))}
          {!d.holds.length && <li className="py-3 px-3 text-[14px] text-[#7a7466]">Nothing yet.</li>}
        </ul>
        {d.holds.length > 0 && (
          <Pill kind="dashed" className="self-start" onClick={() => live.set({ ...d, holds: [...d.holds, { id: newId(), what: 'Something', who: '' }] }, true)}>
            + Add
          </Pill>
        )}
      </section>
    </div>
  );
}

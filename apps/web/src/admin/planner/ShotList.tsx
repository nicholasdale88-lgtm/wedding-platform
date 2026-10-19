import { progressOf, shotTemplate, type PartySetup, type ShotList as ShotDoc } from '@wp/shared';
import { useEffect, useState } from 'react';
import { plannerApi, type PartyData } from '../../lib/api';
import { Ring } from '../checklists/PhasedChecklist';
import { useUnsavedChanges } from '../leave';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';
import { useLiveDoc } from './useDocSave';

const newId = () => crypto.randomUUID().slice(0, 10);

/**
 * Wedding planner → Photo list: the shots you want and who to gather for each (made from your names and
 * your wedding party; groups go smallest to largest). Print it for the photographer, or tick it off on the day.
 */
export function ShotList() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const event = overview?.events[0]?.key ?? '';
  const live = useLiveDoc<ShotDoc>(wid, 'shots', event, toast);
  useUnsavedChanges(live.pending);
  const [party, setParty] = useState<PartyData | null>(null);
  const [adding, setAdding] = useState({ shot: '', who: '' });
  useEffect(() => {
    plannerApi
      .party(wid)
      .then(setParty)
      .catch(() => setParty(null));
  }, [wid]);
  if (!event) return <p className="text-[#5b6a52]">Add your wedding as an event first.</p>;
  if (live.error) return <p role="alert" className="text-[#7a4a37]">{live.error}</p>;
  if (!live.doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading the photo list…</div>;
  const shots = live.doc.data.shots;
  const p = progressOf(shots);
  const setup: Partial<PartySetup> = party?.setup?.data ?? {};
  const start = () => {
    const first = (n: string) => n.split(' ')[0] ?? n;
    const tpl = shotTemplate({
      p1: first(overview?.wedding.name1 ?? 'Partner 1'),
      p2: first(overview?.wedding.name2 ?? 'Partner 2'),
      side1: setup.p1 || 'Bride',
      side2: setup.p2 || 'Groom',
      party1: (party?.members ?? []).filter((m) => m.side === 'p1').map((m) => first(m.name)),
      party2: (party?.members ?? []).filter((m) => m.side === 'p2').map((m) => first(m.name)),
    });
    live.set({ shots: tpl.map((s) => ({ ...s, id: newId() })) }, true);
  };
  const set = (id: string, patch: Partial<ShotDoc['shots'][number]>, now = false) => live.set({ shots: shots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }, now);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>Photo list</H2>
          <div className="text-[13px] text-[#5b6a52]">The shots you want, and who to gather for each. Groups run smallest to largest so people can go as they’re done.</div>
        </div>
        <span className="flex items-center gap-3">
          {shots.length > 0 && <Ring done={p.done} total={p.total} size={52} />}
          {shots.length > 0 && <Pill onClick={() => window.print()}>Print for the photographer</Pill>}
        </span>
      </div>
      {!shots.length ? (
        <div className="flex flex-col items-start gap-2 p-5 rounded-[16px] border border-dashed border-[#c6b794] bg-[#fbf8f0]">
          <strong className="font-display text-[22px] font-medium">Start with the usual list</strong>
          <p className="m-0 text-[14px] text-[#5b6a52]">About 20 shots made from your names and your wedding party: the moments, then family and party groups. Change anything.</p>
          <Pill kind="primary" onClick={start}>
            Make the list
          </Pill>
        </div>
      ) : (
        <ol className="list-none m-0 p-0 flex flex-col rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0] print:border-0">
          {shots.map((s, i) => (
            <li key={s.id} className="grid grid-cols-[28px_24px_minmax(0,1fr)_auto] gap-2 items-start py-2 px-3 border-t border-[#ece3cd] first:border-t-0">
              <span className="text-[13px] text-[#7a7466] pt-[2px]">{i + 1}</span>
              <input type="checkbox" checked={s.done} aria-label={s.shot} onChange={() => set(s.id, { done: !s.done }, true)} className="mt-[3px] w-[18px] h-[18px] accent-[#5d6b47]" />
              <span className="flex flex-col gap-1 min-w-0">
                <input aria-label="Shot" value={s.shot} maxLength={160} onChange={(e) => set(s.id, { shot: e.target.value })} className={`bg-transparent border-0 p-0 text-[15px] font-medium ${s.done ? 'line-through text-[#7a7466]' : ''}`} />
                <input aria-label="Who" placeholder="Who to gather" value={s.who} maxLength={300} onChange={(e) => set(s.id, { who: e.target.value })} className="bg-transparent border-0 p-0 text-[13px] text-[#5b6a52]" />
              </span>
              <button type="button" aria-label={`Remove ${s.shot}`} onClick={() => live.set({ shots: shots.filter((x) => x.id !== s.id) }, true)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px] print:hidden">
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      {shots.length > 0 && (
        <form
          className="flex gap-2 flex-wrap print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding.shot.trim()) return;
            live.set({ shots: [...shots, { id: newId(), shot: adding.shot.trim(), who: adding.who.trim(), done: false }] }, true);
            setAdding({ shot: '', who: '' });
          }}
        >
          <input aria-label="New shot" placeholder="Add a shot" value={adding.shot} maxLength={160} onChange={(e) => setAdding({ ...adding, shot: e.target.value })} className={`${inputCls} flex-1 min-w-[180px] !py-2`} />
          <input aria-label="Who to gather" placeholder="Who" value={adding.who} maxLength={300} onChange={(e) => setAdding({ ...adding, who: e.target.value })} className={`${inputCls} flex-1 min-w-[140px] !py-2`} />
          <Pill type="submit" kind="outline">
            Add
          </Pill>
        </form>
      )}
    </div>
  );
}

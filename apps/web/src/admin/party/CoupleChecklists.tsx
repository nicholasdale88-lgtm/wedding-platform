import { CHECK_TEMPLATE, daysUntil, progressOf, WEDDING_PHASES, type CheckItem, type DayChecklist, type PartySide, type Phase } from '@wp/shared';
import { useState } from 'react';
import { ApiError, plannerApi, type PartyData } from '../../lib/api';
import { phaseNow, PhasedChecklist, Ring } from '../checklists/PhasedChecklist';
import { useHelpers } from '../checklists/useHelpers';
import { useUnsavedChanges } from '../leave';
import { useLiveDoc } from '../planner/useDocSave';
import { useAdmin } from '../Shell';
import { inputCls, Pill, useToast } from '../ui';
import type { SideName } from './Party';

type Who = 'p1' | 'p2' | 'both';

/** Suggestions from the usual list that aren't on yours yet (matched by wording). */
export const missingFrom = (mine: CheckItem[], usual: CheckItem[]) => {
  const have = new Set(mine.map((x) => x.text.trim().toLowerCase()));
  return usual.filter((x) => !have.has(x.text.trim().toLowerCase()));
};

/**
 * Wedding party → Your checklists: one list each and one together, grouped from a month out to after the
 * wedding, with the moment you're in now opened. Saved as you go; both phones can tick at once.
 */
export function CoupleChecklists({ d, sideName }: { d: PartyData; sideName: SideName }) {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const scope = d.event ?? '';
  const live = useLiveDoc<DayChecklist>(wid, 'day-checklist', scope, toast);
  useUnsavedChanges(live.pending);
  const helpers = useHelpers();
  const [who, setWho] = useState<Who>('p1');
  if (!scope) return <p className="text-[#5b6a52]">Add your wedding as an event first.</p>;
  if (live.error) return <p role="alert" className="text-[#7a4a37]">{live.error}</p>;
  if (!live.doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading your checklists…</div>;
  const data = live.doc.data;
  const ev = d.events.find((e) => e.key === d.event);
  const now = phaseNow(ev ? daysUntil(ev.startsAt, overview?.wedding.timezone) : null);
  const label = (w: Who) => (w === 'both' ? 'Together' : `${d.names[w]} · ${sideName(w)}`);
  const list = data[who];
  const extra = missingFrom(list, CHECK_TEMPLATE[who]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 grid-cols-3 max-[560px]:grid-cols-1">
        {(['p1', 'p2', 'both'] as const).map((w) => {
          const p = progressOf(data[w]);
          return (
            <button
              key={w}
              type="button"
              aria-pressed={who === w}
              onClick={() => setWho(w)}
              className={`flex items-center gap-3 p-3 rounded-[16px] border text-left cursor-pointer ${who === w ? 'border-[#33402f] bg-[#fbf8f0] shadow-[0_0_0_1px_#33402f]' : 'border-[#e2d7bc] bg-[#fbf8f0] hover:border-[#b39563]'}`}
            >
              <Ring done={p.done} total={p.total} size={56} label={`${label(w)}: ${p.done} of ${p.total} done`} />
              <span className="min-w-0">
                <span className="block font-display text-[19px] leading-tight truncate">{w === 'both' ? 'Together' : d.names[w]}</span>
                <span className="block text-[12px] text-[#5b6a52]">{p.total ? `${p.total - p.done} to go` : 'Not started'}</span>
              </span>
            </button>
          );
        })}
      </div>

      {!list.length ? (
        <div className="flex flex-col items-start gap-2 p-5 rounded-[16px] border border-dashed border-[#c6b794] bg-[#fbf8f0]">
          <strong className="font-display text-[22px] font-medium">{who === 'both' ? 'Your shared list' : `${d.names[who]}’s list`}</strong>
          <p className="m-0 text-[14px] text-[#5b6a52]">
            Start with {CHECK_TEMPLATE[who].length} things most couples need, from the final fittings to the name change, then make it your own.
          </p>
          <Pill kind="primary" onClick={() => live.set({ ...data, [who]: CHECK_TEMPLATE[who].map((x) => ({ ...x })) }, true)}>
            Start with the usual list
          </Pill>
        </div>
      ) : (
        <>
          {extra.length > 0 && (
            <div className="flex justify-between items-center gap-3 flex-wrap py-2 px-4 rounded-[12px] bg-[#f3ecd6] text-[13px] text-[#5b6a52]">
              <span>{extra.length} suggested {extra.length === 1 ? 'item isn’t' : 'items aren’t'} on this list yet.</span>
              <button type="button" onClick={() => live.set({ ...data, [who]: [...list, ...extra.map((x) => ({ ...x }))] }, true)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f] font-medium">
                Add them
              </button>
            </div>
          )}
          {who !== 'both' && (
            <HandOver
              d={d}
              side={who}
              items={list}
              startsAt={ev?.startsAt ?? ''}
              onHanded={(i) => live.set({ ...data, [who]: list.filter((_, j) => j !== i) }, true)}
              sideName={sideName}
            />
          )}
          <PhasedChecklist key={who} items={list} onChange={(items) => live.set({ ...data, [who]: items })} labels={WEDDING_PHASES} now={now} who={label(who)} people={helpers.people} onAddPerson={helpers.ready ? helpers.add : undefined} />
        </>
      )}
      <p className="m-0 text-[12px] text-[#7a7466]">{live.pending ? 'Saving…' : 'Saved. Open this on your phone on the day: the list you’re on now is opened for you.'}</p>
    </div>
  );
}

/** When a checklist moment falls, from the wedding day (for the job's date). */
const PHASE_DAYS: Record<Phase, number> = { month: -30, week: -7, eve: -1, morning: 0, ceremony: 0, reception: 0, after: 1 };

/**
 * Hand some of your list to your side of the wedding party (the groom's to his groomsmen, the bride's to
 * her bridesmaids): it becomes their job, on their own page and phone calendar, and leaves your list.
 */
function HandOver({ d, side, items, startsAt, onHanded, sideName }: { d: PartyData; side: 'p1' | 'p2'; items: CheckItem[]; startsAt: string; onHanded: (i: number) => void; sideName: SideName }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const people = d.members.filter((m) => m.side === side);
  const [pick, setPick] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  if (!people.length) return null;
  const open = items.map((x, i) => ({ x, i })).filter(({ x }) => !x.done);
  const dueOf = (phase: Phase) => {
    if (!startsAt) return '';
    return new Date(Date.parse(startsAt) + PHASE_DAYS[phase] * 86_400_000).toISOString().slice(0, 10);
  };
  const hand = async (i: number) => {
    const m = people.find((p) => p.personId === pick[i]);
    const item = items[i];
    if (!m || !item) return;
    setBusy(i);
    try {
      const kind = side === 'p1' ? 'party-p1' : 'party-p2';
      for (let tries = 0; ; tries++) {
        const cur = await plannerApi.doc<PartySide>(wid, kind);
        try {
          await plannerApi.saveDoc<PartySide>(wid, kind, '', { ...cur.data, tasks: [...cur.data.tasks, { id: crypto.randomUUID().slice(0, 12), text: item.text.slice(0, 200), person: m.personId, due: dueOf(item.phase), done: false }] }, cur.version);
          break;
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 409) || tries >= 2) throw e;
        }
      }
      onHanded(i);
      toast(`${m.name.split(' ')[0]} has “${item.text}” now: it’s on their page and phone calendar`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <details className="rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <summary className="cursor-pointer py-3 px-4 text-[15px] font-semibold">Hand some of these to {sideName(side).toLowerCase()}’s side ({people.map((p) => p.name.split(' ')[0]).join(', ')})</summary>
      <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#ece3cd]">
        {open.map(({ x, i }) => (
          <li key={i} className="flex items-center gap-2 flex-wrap py-2 px-4 text-[14px]">
            <span className="flex-1 min-w-[180px]">{x.text}</span>
            <select aria-label={`Who takes ${x.text}`} value={pick[i] ?? ''} onChange={(e) => setPick({ ...pick, [i]: e.target.value })} className={`${inputCls} !py-[6px] !text-[14px] max-w-[200px]`}>
              <option value="">Give to…</option>
              {people.map((m) => (
                <option key={m.personId} value={m.personId}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
            <Pill size="sm" disabled={!pick[i] || busy !== null} onClick={() => void hand(i)}>
              {busy === i ? 'Handing…' : 'Hand over'}
            </Pill>
          </li>
        ))}
      </ul>
    </details>
  );
}

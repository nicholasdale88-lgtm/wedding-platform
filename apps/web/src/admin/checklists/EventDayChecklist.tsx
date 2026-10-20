import { daysUntil, PARTY_CHECK_TEMPLATE, PARTY_PHASES, progressOf, type EventChecklist } from '@wp/shared';
import { useUnsavedChanges } from '../leave';
import { missingFrom } from '../party/CoupleChecklists';
import { useLiveDoc } from '../planner/useDocSave';
import { useAdmin, useSectionName } from '../Shell';
import { Eyebrow, Pill, useToast } from '../ui';
import { phaseNow, PhasedChecklist, Ring } from './PhasedChecklist';
import { useHelpers } from './useHelpers';

/**
 * An event that isn't the wedding (a birthday) → Day checklist: the host's things to do, from a month out
 * to the clean-up, with the moment you're in now opened. No wedding party: just what needs doing.
 */
export function EventDayChecklist() {
  const { wid, event, overview } = useAdmin();
  const section = useSectionName();
  const toast = useToast();
  const live = useLiveDoc<EventChecklist>(wid, 'event-checklist', event ?? '', toast);
  useUnsavedChanges(live.pending);
  const helpers = useHelpers();
  const ev = overview?.events.find((e) => e.key === event);
  const header = (
    <header>
      <Eyebrow>{section} · Day checklist</Eyebrow>
      <h1 className="m-0 mt-[6px] font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">Day checklist</h1>
      <p className="m-0 mt-1 text-[15px] text-[#5b6a52]">Everything to do for {ev?.name ?? 'the day'}, from a month out to the clean-up. Tick things off on your phone.</p>
    </header>
  );
  if (!event) return header;
  if (live.error) return <p role="alert" className="text-[#7a4a37]">{live.error}</p>;
  if (!live.doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading the checklist…</div>;
  const items = live.doc.data.items;
  const p = progressOf(items);
  const now = phaseNow(ev ? daysUntil(ev.startsAt, overview?.wedding.timezone) : null);
  const extra = missingFrom(items, PARTY_CHECK_TEMPLATE.items);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        {header}
        {items.length > 0 && (
          <span className="flex items-center gap-3">
            <Ring done={p.done} total={p.total} size={68} />
            <span className="text-[14px] text-[#5b6a52]">{p.total - p.done ? `${p.total - p.done} to go` : 'All done ✓'}</span>
          </span>
        )}
      </div>
      {!items.length ? (
        <div className="flex flex-col items-start gap-2 p-5 rounded-[16px] border border-dashed border-[#c6b794] bg-[#fbf8f0]">
          <strong className="font-display text-[22px] font-medium">Start with the usual list</strong>
          <p className="m-0 text-[14px] text-[#5b6a52]">{PARTY_CHECK_TEMPLATE.items.length} things a host usually needs, from the cake order to the thank-yous. Change anything.</p>
          <Pill kind="primary" onClick={() => live.set({ items: PARTY_CHECK_TEMPLATE.items.map((x) => ({ ...x })) }, true)}>
            Start the list
          </Pill>
        </div>
      ) : (
        <>
          {extra.length > 0 && (
            <div className="flex justify-between items-center gap-3 flex-wrap py-2 px-4 rounded-[12px] bg-[#f3ecd6] text-[13px] text-[#5b6a52]">
              <span>{extra.length} suggested {extra.length === 1 ? 'item isn’t' : 'items aren’t'} on your list.</span>
              <button type="button" onClick={() => live.set({ items: [...items, ...extra.map((x) => ({ ...x }))] }, true)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f] font-medium">
                Add them
              </button>
            </div>
          )}
          <PhasedChecklist items={items} onChange={(next) => live.set({ items: next })} labels={PARTY_PHASES} now={now} who="your" people={helpers.people} onAddPerson={helpers.ready ? helpers.add : undefined} />
        </>
      )}
      <p className="m-0 text-[12px] text-[#7a7466]">{live.pending ? 'Saving…' : 'Saved as you go.'}</p>
    </div>
  );
}

import { TIMELINE_ICONS, type InvitationContent, type TimelineIcon, type TimelineItem } from '@wp/shared';
import { TimelineIconSvg } from '../../guest/invitation/Timeline';
import { inputCls } from '../ui';
import { ORIGINAL } from './Wording';

/**
 * Admin → Guest pages → Timeline: the invitation's "Order of events". Off, guests see the design's
 * rows (their words editable under "Every word"); on, the couple's own rows, drawn the same way.
 */

/** The design's rows as catalogue keys (time, "to" time, title, detail) and the icon each one shows. */
const DESIGN_ROWS: [string, string, string, string, TimelineIcon][] = [
  ['inv.6fcb1ea3', '', 'inv.5db0b693', 'inv.761095ef', 'arrive'],
  ['inv.8edf3058', 'inv.fbc3ea2b', 'inv.b243e7fc', 'inv.241f4616', 'rings'],
  ['inv.a52f9f24', 'inv.2ca4f8a1', 'inv.5e764a74', 'inv.12d37530', 'camera'],
  ['inv.d35a1578', 'inv.2888fa34', 'inv.c587018f', 'inv.22247dac', 'drinks'],
  ['inv.5a45e731', 'inv.1ab1122a', 'inv.08520579', 'inv.16d5f5fb', 'sunset'],
  ['inv.33faa687', 'inv.b886f645', 'inv.7f0852e8', 'inv.c64e46d5', 'dinner'],
  ['inv.c46863bd', 'inv.26266de5', 'inv.e74777bd', 'inv.60d06c25', 'music'],
  ['inv.ee8bde45', '', 'inv.7281f143', '', 'end'],
];

const ICON_NAME: Record<TimelineIcon, string> = {
  arrive: 'Arrival (pin)',
  rings: 'Ceremony (rings)',
  camera: 'Photos (camera)',
  drinks: 'Drinks (glass)',
  sunset: 'Sunset',
  dinner: 'Dinner (plate)',
  music: 'Dancing (music)',
  end: 'Closing (small diamond)',
};

const BLANK: TimelineItem = { time: '', until: '', title: '', note: '', icon: 'arrive' };

/** "to 3:00pm" in the design → "3:00pm" in the editor (the invitation adds "to" back). */
const untilOf = (s: string) => s.replace(/^\s*to\s+/i, '').trim();

export function TimelineEditor({ inv, texts, setInv }: { inv: InvitationContent; texts: Record<string, string>; setInv: (patch: Partial<InvitationContent>) => void }) {
  // An empty list means "the design's rows" (settings are merged on save, so off is saved as []).
  const own = inv.timeline?.length ? inv.timeline : undefined;
  const word = (k: string) => (k ? (texts[k] ?? ORIGINAL[k] ?? '').trim() : '');
  const fromDesign = (): TimelineItem[] => DESIGN_ROWS.map(([t, u, ti, n, icon]) => ({ time: word(t), until: untilOf(word(u)), title: word(ti), note: word(n), icon }));
  const set = (rows: TimelineItem[]) => setInv({ timeline: rows });| undefined) => setInv({ timeline: rows });
  const edit = (i: number, patch: Partial<TimelineItem>) => own && set(own.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: -1 | 1) => {
    if (!own || i + by < 0 || i + by >= own.length) return;
    const next = [...own];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    set(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="self-start flex items-center gap-2 text-[14px] cursor-pointer">
        <input type="checkbox" role="switch" checked={!!own} onChange={() => set(own ? [] : fromDesign())} className="w-[18px] h-[18px] accent-[#5d6b47]" />
        Use my own timeline
      </label>
      {!own ? (
        <span className="text-[13px] text-[#7a7466]">Showing the design's {DESIGN_ROWS.length} moments. Switch on to add, remove, reorder or reword them.</span>
      ) : (
        <>
          {own.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
              <div className="flex gap-2 items-center flex-wrap">
                <span aria-hidden className="w-[38px] h-[38px] rounded-full border border-[#8a9670] bg-white flex items-center justify-center shrink-0">
                  {r.icon === 'end' ? <span className="w-[9px] h-[9px] bg-[#33402f] rotate-45" /> : <TimelineIconSvg icon={r.icon} size={20} />}
                </span>
                <input aria-label="Time" placeholder="Time, e.g. 2:00pm" value={r.time} onChange={(e) => edit(i, { time: e.target.value })} className={`${inputCls} w-[120px]`} />
                <input aria-label="Until (optional)" placeholder="Until (optional)" value={r.until} onChange={(e) => edit(i, { until: e.target.value })} className={`${inputCls} w-[140px]`} />
                <select aria-label="Icon" value={r.icon} onChange={(e) => edit(i, { icon: e.target.value as TimelineIcon })} className={`${inputCls} min-w-0 flex-1`}>
                  {TIMELINE_ICONS.map((k) => (
                    <option key={k} value={k}>
                      {ICON_NAME[k]}
                    </option>
                  ))}
                </select>
              </div>
              <input aria-label="Title" placeholder="Title, e.g. Ceremony" value={r.title} onChange={(e) => edit(i, { title: e.target.value })} className={inputCls} />
              <textarea aria-label="Detail (optional)" rows={2} placeholder="A line of detail (optional)" value={r.note} onChange={(e) => edit(i, { note: e.target.value })} className={`${inputCls} resize-y`} />
              <div className="flex gap-2 justify-end">
                <RowBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </RowBtn>
                <RowBtn label="Move down" onClick={() => move(i, 1)} disabled={i === own.length - 1}>
                  ↓
                </RowBtn>
                <RowBtn label="Remove" onClick={() => set(own.filter((_, j) => j !== i))} danger>
                  ×
                </RowBtn>
              </div>
            </div>
          ))}
          <div className="flex gap-2 flex-wrap">
            <AddBtn onClick={() => set(insertBeforeEnd(own, { ...BLANK }))}>+ Add a moment</AddBtn>
            {!own.some((r) => r.icon === 'end') && <AddBtn onClick={() => set([...own, { ...BLANK, icon: 'end', title: 'Farewell' }])}>+ Add a closing line</AddBtn>}
            <button
              type="button"
              onClick={() => window.confirm('Put back the design’s timeline? Your rows will be replaced.') && set(fromDesign())}
              className="py-[7px] px-[14px] rounded-full border-0 bg-transparent text-[13px] underline cursor-pointer text-[#5b6a52]"
            >
              Start again from the design
            </button>
          </div>
          <span className="text-[13px] text-[#7a7466]">"Until" shows under the time as "to …". Rows without a time or title are left off the invitation.</span>
        </>
      )}
    </div>
  );
}

/** New moments go before the closing line, so the diamond stays last. */
function insertBeforeEnd(rows: TimelineItem[], item: TimelineItem): TimelineItem[] {
  const end = rows.length && rows[rows.length - 1]!.icon === 'end' ? rows.length - 1 : rows.length;
  return [...rows.slice(0, end), item, ...rows.slice(end)];
}

function RowBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-[38px] h-[36px] rounded-[10px] border border-[#d3c6a4] bg-transparent text-[16px] cursor-pointer hover:bg-[#efe7d3] disabled:opacity-35 disabled:cursor-default ${danger ? 'text-[#7a4a37]' : 'text-[#33402f]'}`}
    >
      {children}
    </button>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="py-[7px] px-[14px] rounded-full border border-dashed border-[#8a9670] bg-transparent text-[13px] cursor-pointer hover:bg-[#efe7d3]">
      {children}
    </button>
  );
}

import { TIMELINE_ICONS, type InvitationContent, type TimelineIcon, type TimelineItem } from '@wp/shared';
import { useState } from 'react';
import { TimelineIconSvg } from '../../guest/invitation/Timeline';
import { inputCls, Label } from '../ui';
import { ORIGINAL } from './Wording';

/**
 * An event's Setup → Timeline: the invitation's "Order of events".
 * Settings (heading, title, date line, 12/24-hour clock) apply either way. Off, guests see the design's
 * rows (their words editable under "Every word"); on, the couple's own moments, drawn the same way:
 * real time pickers, a library of common moments, icons to pick from, a place for each moment,
 * duplicate, reorder, sort by time, and copy to the night-before run sheet.
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
/** The section's own words: the small heading, the title and the date line. */
const HEADINGS: [string, string][] = [
  ['inv.7f4271ad', 'Small heading'],
  ['inv.9466aa1d', 'Title'],
  ['inv.5fb81f2d', 'Date line'],
];

const ICON_NAME: Record<TimelineIcon, string> = {
  arrive: 'Arrival',
  rings: 'Ceremony',
  camera: 'Photos',
  drinks: 'Drinks',
  sunset: 'Sunset',
  dinner: 'Dinner',
  music: 'Dancing',
  speech: 'Speeches',
  cake: 'Cake',
  heart: 'First dance',
  sparkle: 'Send-off',
  car: 'Transport',
  end: 'Closing diamond',
};

/** Common moments to add with one tap (time left for the couple to set). */
const PRESETS: { title: string; note: string; icon: TimelineIcon }[] = [
  { title: 'Guests arrive', note: 'Take your seat and settle in.', icon: 'arrive' },
  { title: 'Ceremony', note: '', icon: 'rings' },
  { title: 'Confetti and photographs', note: '', icon: 'camera' },
  { title: 'Canapés and drinks', note: '', icon: 'drinks' },
  { title: 'Sunset', note: '', icon: 'sunset' },
  { title: 'Reception dinner', note: '', icon: 'dinner' },
  { title: 'Speeches', note: '', icon: 'speech' },
  { title: 'Cake cutting', note: '', icon: 'cake' },
  { title: 'First dance', note: '', icon: 'heart' },
  { title: 'Dancing', note: '', icon: 'music' },
  { title: 'Sparkler send-off', note: '', icon: 'sparkle' },
  { title: 'Buses depart', note: '', icon: 'car' },
  { title: 'Irish farewell', note: '', icon: 'end' },
];

const BLANK: TimelineItem = { time: '', until: '', title: '', note: '', where: '', icon: 'arrive' };
type Clock = '12h' | '24h';

/** "to 3:00pm" in the design → "3:00pm" in the editor (the invitation adds "to" back). */
const untilOf = (s: string) => s.replace(/^\s*to\s+/i, '').trim();

/** "2:00pm", "2pm", "14:00", "2.30 pm" → "14:00" (for the time picker); "" when it isn't a time. */
export function toPicker(s: string): string {
  const m = /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*$/i.exec(s);
  if (!m) return '';
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59 || (!ap && !m[2])) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
/** "14:00" → "2:00pm" (12h) or "14:00" (24h). */
export function fromPicker(v: string, clock: Clock): string {
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (!m) return '';
  const h = Number(m[1]);
  if (clock === '24h') return v;
  return `${h % 12 || 12}:${m[2]}${h < 12 ? 'am' : 'pm'}`;
}
const reclock = (s: string, clock: Clock) => (toPicker(s) ? fromPicker(toPicker(s), clock) : s);

export function TimelineEditor({
  inv,
  texts,
  setInv,
  setText,
  onCopyToGuide,
  eventKey,
  slot = 0,
}: {
  /** The event this timeline belongs to; the first event's is the invitation's main "Order of events". */
  eventKey?: string;
  slot?: number;
  inv: InvitationContent;
  texts: Record<string, string>;
  setInv: (patch: Partial<InvitationContent>) => void;
  setText: (key: string, value: string) => void;
  /** Put these moments on the first event's night-before run sheet (absent when it has no guide). */
  onCopyToGuide?: (runsheet: { t: string; what: string; where: string }[]) => void;
}) {
  // An empty list means "the design's rows" (settings are merged on save, so off is saved as []).
  const main = slot === 0 || !eventKey;
  const list = main ? inv.timeline : inv.timelines?.[eventKey!];
  const saved = list?.length ? list : undefined;
  const clock: Clock = inv.timelineClock ?? '12h';
  const [preset, setPreset] = useState('');
  const word = (k: string) => (k ? (texts[k] ?? ORIGINAL[k] ?? '').trim() : '');
  const fromDesign = (): TimelineItem[] =>
    !main
      ? [{ ...BLANK }]
      : DESIGN_ROWS.map(([t, u, ti, n, icon]) => ({ time: reclock(word(t), clock), until: reclock(untilOf(word(u)), clock), title: word(ti), note: word(n), where: '', icon }));
  // The main timeline is always editable: until the couple changes a moment it shows the design's, and the
  // first change saves them all as their own. Another event's timeline is switched on first.
  const own = saved ?? (main ? fromDesign() : undefined);
  const set = (rows: TimelineItem[]) => setInv(main ? { timeline: rows } : { timelines: { ...inv.timelines, [eventKey!]: rows } });
  const edit = (i: number, patch: Partial<TimelineItem>) => own && set(own.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: -1 | 1) => {
    if (!own || i + by < 0 || i + by >= own.length) return;
    const next = [...own];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    set(next);
  };
  const sortByTime = () => {
    if (!own) return;
    // Moments without a clock time keep their place relative to the one before; the closing line stays last.
    const keyed = own.map((r, i) => ({ r, i, k: toPicker(r.time) }));
    let last = '';
    for (const x of keyed) {
      x.k = x.k || last;
      last = x.k;
    }
    set(keyed.sort((a, b) => Number(a.r.icon === 'end') - Number(b.r.icon === 'end') || a.k.localeCompare(b.k) || a.i - b.i).map((x) => x.r));
  };
  const setClock = (c: Clock) => {
    setInv({ timelineClock: c });
    if (saved) set(saved.map((r) => ({ ...r, time: reclock(r.time, c), until: reclock(r.until, c) }))); // the design's follow the clock by themselves
  };

  return (
    <div className="flex flex-col gap-4">
      {main && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
        {HEADINGS.map(([k, label]) => (
          <Label key={k} text={label}>
            <input value={texts[k] ?? ORIGINAL[k] ?? ''} placeholder={ORIGINAL[k]} onChange={(e) => setText(k, e.target.value)} className={inputCls} />
          </Label>
        ))}
      </div>
      )}
      <div className="flex gap-4 flex-wrap items-center">
        {main ? (
          <span className="text-[13px] text-[#5b6a52]">{saved ? 'Your own timeline.' : "The design's moments: change any of them and they become your own."}</span>
        ) : (
          <label className="flex items-center gap-2 text-[14px] cursor-pointer">
            <input type="checkbox" role="switch" checked={!!own} onChange={() => set(own ? [] : fromDesign())} className="w-[18px] h-[18px] accent-[#5d6b47]" />
            Show a timeline in this event's section
          </label>
        )}
        <div role="radiogroup" aria-label="Clock" className="flex gap-1 text-[13px]">
          {(['12h', '24h'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={clock === c}
              onClick={() => setClock(c)}
              className={`py-[5px] px-3 rounded-full border cursor-pointer ${clock === c ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794]'}`}
            >
              {c === '12h' ? '2:00pm' : '14:00'}
            </button>
          ))}
        </div>
      </div>

      {!own ? (
        <span className="text-[13px] text-[#7a7466]">Switch on to add this event's moments; they appear at the end of its section of the invitation, in its colours.</span>
      ) : (
        <>
          {own.map((r, i) => (
            <MomentCard
              key={i}
              r={r}
              clock={clock}
              first={i === 0}
              last={i === own.length - 1}
              onEdit={(p) => edit(i, p)}
              onMove={(by) => move(i, by)}
              onDuplicate={() => set([...own.slice(0, i + 1), { ...r }, ...own.slice(i + 1)])}
              onRemove={() => set(own.filter((_, j) => j !== i))}
            />
          ))}
          <div className="flex gap-2 flex-wrap items-center">
            <select
              aria-label="Add a moment"
              value={preset}
              onChange={(e) => {
                const p = PRESETS[Number(e.target.value)];
                setPreset('');
                if (!p) return;
                const item = { ...BLANK, ...p };
                set(p.icon === 'end' ? [...own.filter((x) => x.icon !== 'end'), item] : insertBeforeEnd(own, item));
              }}
              className={`${inputCls} !py-[7px] !text-[13px]`}
            >
              <option value="">+ Add a moment…</option>
              {PRESETS.map((p, i) => (
                <option key={p.title} value={i}>
                  {p.title}
                </option>
              ))}
            </select>
            <AddBtn onClick={() => set(insertBeforeEnd(own, { ...BLANK }))}>+ Blank moment</AddBtn>
            <AddBtn onClick={sortByTime}>Sort by time</AddBtn>
            {onCopyToGuide && (
              <AddBtn
                onClick={() =>
                  window.confirm('Replace the night-before run sheet with these moments?') &&
                  onCopyToGuide(own.filter((x) => x.title.trim()).map((x) => ({ t: x.time.trim(), what: x.title.trim(), where: (x.where ?? '').trim() })))
                }
              >
                Copy to night-before run sheet
              </AddBtn>
            )}
            <button
              type="button"
              onClick={() => window.confirm('Put back the design’s timeline? Your moments will be replaced.') && set(main ? [] : fromDesign())}
              className="py-[7px] px-[14px] rounded-full border-0 bg-transparent text-[13px] underline cursor-pointer text-[#5b6a52]"
            >
              Start again from the design
            </button>
          </div>
          <span className="text-[13px] text-[#7a7466]">"Until" shows under the time as "to …". Moments without a time or title are left off the invitation.</span>
        </>
      )}
    </div>
  );
}

function MomentCard({
  r,
  clock,
  first,
  last,
  onEdit,
  onMove,
  onDuplicate,
  onRemove,
}: {
  r: TimelineItem;
  clock: Clock;
  first: boolean;
  last: boolean;
  onEdit: (p: Partial<TimelineItem>) => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  // A time that isn't a clock time ("Late", "Sunset") is kept as written; "Use a clock" switches to the picker.
  const [freeTime, setFreeTime] = useState(() => !!r.time.trim() && !toPicker(r.time));
  return (
    <div className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex gap-2 items-end flex-wrap">
        <Label text="Time" className="w-[130px]">
          {freeTime ? (
            <input value={r.time} placeholder="e.g. Late" onChange={(e) => onEdit({ time: e.target.value })} className={inputCls} />
          ) : (
            <input type="time" aria-label="Time" value={toPicker(r.time)} onChange={(e) => onEdit({ time: fromPicker(e.target.value, clock) })} className={inputCls} />
          )}
        </Label>
        <Label text="Until (optional)" className="w-[130px]">
          <input type="time" aria-label="Until" value={toPicker(r.until)} onChange={(e) => onEdit({ until: fromPicker(e.target.value, clock) })} className={inputCls} />
        </Label>
        <button type="button" onClick={() => setFreeTime((x) => !x)} className="mb-[10px] p-0 border-0 bg-transparent text-[12px] underline cursor-pointer text-[#5b6a52]">
          {freeTime ? 'Use a clock' : 'Write the time instead'}
        </button>
        {r.until && (
          <button type="button" onClick={() => onEdit({ until: '' })} className="mb-[10px] p-0 border-0 bg-transparent text-[12px] underline cursor-pointer text-[#5b6a52]">
            No end time
          </button>
        )}
      </div>
      <input aria-label="Title" placeholder="Title, e.g. Ceremony" value={r.title} onChange={(e) => onEdit({ title: e.target.value })} className={inputCls} />
      <textarea aria-label="Detail (optional)" rows={2} placeholder="A line of detail (optional)" value={r.note} onChange={(e) => onEdit({ note: e.target.value })} className={`${inputCls} resize-y`} />
      <input aria-label="Where (optional)" placeholder="Where (optional), e.g. The Lookout" value={r.where ?? ''} onChange={(e) => onEdit({ where: e.target.value })} className={inputCls} />
      <div role="radiogroup" aria-label="Icon" className="flex gap-[6px] flex-wrap">
        {TIMELINE_ICONS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={r.icon === k}
            title={ICON_NAME[k]}
            aria-label={ICON_NAME[k]}
            onClick={() => onEdit({ icon: k })}
            className={`w-[38px] h-[38px] rounded-full border flex items-center justify-center cursor-pointer ${r.icon === k ? 'border-[#33402f] bg-white shadow-[0_0_0_3px_#e4ead6]' : 'border-[#d3c6a4] bg-transparent'}`}
          >
            {k === 'end' ? <span className="w-[9px] h-[9px] bg-[#33402f] rotate-45" /> : <TimelineIconSvg icon={k} size={20} />}
          </button>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <RowBtn label="Move up" onClick={() => onMove(-1)} disabled={first}>
          ↑
        </RowBtn>
        <RowBtn label="Move down" onClick={() => onMove(1)} disabled={last}>
          ↓
        </RowBtn>
        <RowBtn label="Duplicate" onClick={onDuplicate}>
          ⧉
        </RowBtn>
        <RowBtn label="Remove" onClick={onRemove} danger>
          ×
        </RowBtn>
      </div>
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

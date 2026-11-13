import { cleanCircle, KNOWS_NO_ONE, MAX_CIRCLES, RELATIONS, relationLabel, sideLabels, sideShort, type GuestSide, CHANNEL_LABEL, CHANNELS, DELIVERY, DELIVERY_LABEL } from '@wp/shared';
import { useState } from 'react';
import type { BulkSet, Guest } from '../lib/api';
import { useAdmin } from './Shell';
import { inputCls } from './ui';

/**
 * Who a guest is to the couple, for seating: their side, how they know the couple and their circles
 * (who knows who). Used on a guest, in the guest list's "Set for the ticked guests" bar and on Seating.
 */

/** "Alex’s side", "Sam’s side", "Both sides", with the wedding party's names for the sides when changed. */
export function useSideLabels() {
  const { overview } = useAdmin();
  const names = { name1: overview?.wedding.name1 ?? '', name2: overview?.wedding.name2 ?? '' };
  const party = overview?.partySides;
  const changed = (x: string | undefined, usual: string) => (x && x !== usual ? x : undefined);
  return {
    labels: sideLabels(names, { p1: changed(party?.p1, 'Bride'), p2: changed(party?.p2, 'Groom') }),
    short: (side: string) => sideShort(side, names),
  };
}

export function SideSelect({ value, onChange, blank = 'Side: not set', label = 'Side' }: { value: string; onChange: (v: GuestSide) => void; blank?: string; label?: string }) {
  const { labels } = useSideLabels();
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as GuestSide)} className={inputCls}>
      <option value="">{blank}</option>
      {(['p1', 'p2', 'both'] as const).map((k) => (
        <option key={k} value={k}>
          {labels[k]}
        </option>
      ))}
    </select>
  );
}

export function RelationSelect({ value, onChange, blank = 'How they know you: not set', label = 'How they know you' }: { value: string; onChange: (v: string) => void; blank?: string; label?: string }) {
  const kinds = [...new Set(RELATIONS.map((r) => r.kind))];
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">{blank}</option>
      {kinds.map((k) => (
        <optgroup key={k} label={k}>
          {RELATIONS.filter((r) => r.kind === k).map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Circles as chips (× takes one away), and a box to add one, suggesting circles already used. */
export function CirclesInput({ value, onChange, options = [], id = 'guest-circles' }: { value: string[]; onChange: (next: string[]) => void; options?: string[]; id?: string }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const c = cleanCircle(raw);
    setText('');
    if (!c || value.some((x) => x.toLowerCase() === c.toLowerCase()) || value.length >= MAX_CIRCLES) return;
    onChange([...value, c]);
  };
  const unused = options.filter((o) => !value.some((x) => x.toLowerCase() === o.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex gap-[6px] flex-wrap">
          {value.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 py-[3px] pl-[10px] pr-[4px] rounded-full bg-[#eef0e4] border border-[#c9cfb4] text-[13px] text-[var(--adm-ink,#33402f)]">
              {c}
              <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(value.filter((x) => x !== c))} className="w-[22px] h-[22px] rounded-full border-0 bg-transparent cursor-pointer text-[#7a4a37]">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          aria-label="Add a circle"
          list={id}
          value={text}
          placeholder={value.length ? 'Add another circle' : 'e.g. Uni crew, Acme work, Netball'}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]$/.test(v)) add(v.slice(0, -1));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(text);
            }
          }}
          onBlur={() => text.trim() && add(text)}
          className={`${inputCls} flex-1 min-w-0`}
        />
        <datalist id={id}>
          {unused.slice(0, 40).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>
      {unused.length > 0 && (
        <div className="flex gap-[6px] flex-wrap text-[12px]">
          {unused.slice(0, 6).map((o) => (
            <button key={o} type="button" onClick={() => add(o)} className="py-[3px] px-[9px] rounded-full border border-dashed border-[#8a9670] bg-transparent cursor-pointer text-[#5d6b47]">
              + {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A guest's side, relationship and circles as small chips (the guest list). */
export function TieChips({ g }: { g: Pick<Guest, 'side' | 'relation' | 'circles'> }) {
  const { short } = useSideLabels();
  const chips = [g.side ? short(g.side) : '', g.relation ? relationLabel(g.relation) : '', ...(g.circles ?? [])].filter(Boolean);
  if (!chips.length) return null;
  return (
    <span className="flex gap-1 flex-wrap mt-[3px]">
      {chips.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className={`py-[1px] px-[7px] rounded-full text-[11px] border ${i < (g.side ? 1 : 0) + (g.relation ? 1 : 0) ? 'border-[var(--adm-line,#d3c6a4)] bg-[#f6f0e0] text-[var(--adm-muted,#5b6a52)]' : c === KNOWS_NO_ONE ? 'border-[#e0c3b4] bg-[#fbeee6] text-[#7a4a37]' : 'border-[#c9cfb4] bg-[#eef0e4] text-[var(--adm-ink,#33402f)]'}`}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

const KEEP = '~';
/**
 * Guests → Select: set the side, how they know you, or a circle for every ticked guest at once
 * (anything left as "Leave as is" doesn't change).
 */
export function BulkTies({ count, options, busy, onApply, onAll, onDone }: { count: number; options: string[]; busy: boolean; onApply: (b: BulkSet) => void; onAll: () => void; onDone: () => void }) {
  const { labels } = useSideLabels();
  const [delivery, setDelivery] = useState(KEEP);
  const [channel, setChannel] = useState(KEEP);
  const [side, setSide] = useState(KEEP);
  const [relation, setRelation] = useState(KEEP);
  const [add, setAdd] = useState('');
  const [remove, setRemove] = useState('');
  const change: BulkSet = {
    ...(delivery !== KEEP ? { delivery: delivery as NonNullable<BulkSet['delivery']> } : {}),
    ...(channel !== KEEP ? { channel: channel as NonNullable<BulkSet['channel']> } : {}),
    ...(side !== KEEP ? { side: side as GuestSide } : {}),
    ...(relation !== KEEP ? { relation } : {}),
    ...(cleanCircle(add) ? { addCircles: [cleanCircle(add)] } : {}),
    ...(remove ? { removeCircles: [remove] } : {}),
  };
  const any = Object.keys(change).length > 0;
  return (
    <section aria-label="Set for the ticked guests" className="flex flex-col gap-2 p-3 rounded-[14px] border border-[var(--adm-ink,#33402f)] bg-[var(--adm-card,#fbf8f2)]">
      <div className="flex gap-2 items-center flex-wrap text-[14px]">
        <strong className="font-semibold">{count ? `${count} ticked` : 'Tap guests to tick them'}</strong>
        <button type="button" onClick={onAll} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[var(--adm-ink,#33402f)]">
          Tick everyone shown
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onDone} className="py-[6px] px-3 rounded-full border border-[var(--adm-line,#c6b794)] bg-transparent cursor-pointer text-[13px]">
          Done
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select aria-label="Invitation by, for the ticked guests" value={delivery} onChange={(e) => setDelivery(e.target.value)} className={inputCls}>
          <option value={KEEP}>Invitation by: leave as is</option>
          {DELIVERY.map((k) => (
            <option key={k} value={k}>
              Invitation by: {DELIVERY_LABEL[k]}
            </option>
          ))}
        </select>
        <select aria-label="Messages by, for the ticked guests" value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>
          <option value={KEEP}>Messages by: leave as is</option>
          {CHANNELS.map((k) => (
            <option key={k || 'auto'} value={k}>
              Messages by: {CHANNEL_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <select aria-label="Side for the ticked guests" value={side} onChange={(e) => setSide(e.target.value)} className={inputCls}>
          <option value={KEEP}>Side: leave as is</option>
          {(['p1', 'p2', 'both', ''] as const).map((k) => (
            <option key={k || 'none'} value={k}>
              {k ? labels[k] : 'Side: not set'}
            </option>
          ))}
        </select>
        <select aria-label="How the ticked guests know you" value={relation} onChange={(e) => setRelation(e.target.value)} className={inputCls}>
          <option value={KEEP}>How they know you: leave as is</option>
          {RELATIONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
          <option value="">Not set</option>
        </select>
        <input aria-label="Add a circle to the ticked guests" list="bulk-circles" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add a circle, e.g. Uni crew" className={inputCls} />
        <datalist id="bulk-circles">
          {options.slice(0, 40).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <select aria-label="Take a circle off the ticked guests" value={remove} onChange={(e) => setRemove(e.target.value)} className={inputCls}>
          <option value="">Take a circle off: none</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={!count || !any || busy}
        onClick={() => {
          onApply(change);
          setAdd('');
          setRemove('');
          setDelivery(KEEP);
          setChannel(KEEP);
        }}
        className="self-start py-2 px-4 rounded-full border-0 bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] text-[14px] cursor-pointer disabled:opacity-50"
      >
        {busy ? 'Saving…' : `Set for ${count} ${count === 1 ? 'guest' : 'guests'}`}
      </button>
    </section>
  );
}

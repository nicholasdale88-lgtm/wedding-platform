import { SEAT_STAGES, seatChangesLine, type SeatStage } from '@wp/shared';
import { useState } from 'react';
import type { SeatingData } from '../../lib/api';
import { Pill } from '../ui';

/** One clear next step for the stage the plan is at (the page decides what it is). */
export type NextStep = { label: string; run: () => void; disabled?: boolean } | null;

/**
 * The top of Seating: Draft → Replies coming in → Final → Published, worked out from the replies (or
 * chosen), what it means in one line, and the one thing to do next.
 */
export function StageBar({ stage, data, next, busy, onChoose }: { stage: SeatStage; data: SeatingData; next: NextStep; busy: boolean; onChoose: (s: SeatStage | null) => void }) {
  const at = SEAT_STAGES.findIndex((x) => x.key === stage);
  const st = data.stage;
  const why = st
    ? st.chosen
      ? 'You chose this stage.'
      : stage === 'draft'
        ? 'No invitations have gone out yet.'
        : stage === 'replies'
          ? `${st.replied} of ${st.invited} have replied.`
          : stage === 'final'
            ? st.closed
              ? 'The reply date has passed.'
              : `${st.replied} of ${st.invited} have replied.`
            : 'Guests can see the plan.'
    : '';
  return (
    <section aria-label="Seating stage" className="flex flex-col gap-2 p-3 rounded-[14px] bg-white border border-[#e2d7bc] print:hidden">
      <ol className="m-0 p-0 list-none flex flex-wrap gap-x-2 gap-y-1 text-[13px]">
        {SEAT_STAGES.map((x, i) => (
          <li key={x.key} aria-current={i === at ? 'step' : undefined} className={i === at ? 'font-semibold text-[#33402f]' : i < at ? 'text-[#55633f]' : 'text-[#7a7466]'}>
            {i < at ? '✓ ' : ''}
            {x.label}
            {i < SEAT_STAGES.length - 1 && <span className="ml-2 text-[#c6b794]">→</span>}
          </li>
        ))}
      </ol>
      <p className="m-0 text-[14px] text-[#33402f]">
        {SEAT_STAGES[at]?.hint} <span className="text-[#7a7466]">{why}</span>
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        {next ? (
          <Pill kind="primary" disabled={busy || next.disabled} onClick={next.run}>
            {next.label}
          </Pill>
        ) : (
          <span className="text-[14px] text-[#55633f]">Nothing to do right now ✓</span>
        )}
        <span className="flex-1" />
        <select
          aria-label="Stage"
          value={st?.chosen ?? ''}
          disabled={busy}
          onChange={(e) => onChoose((e.target.value || null) as SeatStage | null)}
          className="max-w-full min-w-0 py-[6px] px-2 rounded-[10px] border border-[#d3c6a4] bg-[#fbf8f2] text-[13px] text-[#33402f]"
        >
          <option value="">Stage: worked out for me ({SEAT_STAGES.find((x) => x.key === st?.auto)?.label ?? 'Concept plan'})</option>
          {SEAT_STAGES.map((x) => (
            <option key={x.key} value={x.key}>
              Stage: {x.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

/**
 * Since your last save: who said yes, who can't come (and where seats freed up), who's new. Nothing on the
 * plan is moved for them; fill the gaps with auto-seat (everyone else stays put), or review and mark seen.
 */
export function SinceSave({ data, busy, onFill, onSeen, onShow }: { data: SeatingData; busy: boolean; onFill: () => void; onSeen: () => void; onShow: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const c = data.sinceSave;
  if (!c) return null;
  const line = seatChangesLine(c);
  const names = (label: string, xs: string[]) =>
    xs.length ? (
      <div className="text-[13px]">
        <span className="font-semibold">{label}: </span>
        {xs.map((n, i) => (
          <span key={`${n}-${i}`}>
            {i ? ', ' : ''}
            <button type="button" onClick={() => onShow(n)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
              {n}
            </button>
          </span>
        ))}
      </div>
    ) : null;
  return (
    <section role="status" aria-label="Since your last save" className="flex flex-col gap-2 p-3 rounded-[12px] bg-[#f3ecd9] border border-[#d3c6a4] print:hidden">
      <div className="text-[14px]">
        <strong className="font-semibold">Since your last save:</strong> {line}. Nothing on the plan has been moved.
      </div>
      {open && (
        <div className="flex flex-col gap-1">
          {names('Said yes', c.saidYes)}
          {c.cantCome.length > 0 && (
            <div className="text-[13px]">
              <span className="font-semibold">Can’t come: </span>
              {c.cantCome.map((x) => `${x.name} (${/^\d+$/.test(x.table) ? `Table ${x.table}` : x.table})`).join(', ')}
            </div>
          )}
          {names('New to place', c.newGuests)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Pill kind="primary" disabled={busy} onClick={onFill}>
          Fill gaps with auto-seat
        </Pill>
        <Pill aria-expanded={open} onClick={() => setOpen((x) => !x)}>
          {open ? 'Hide' : 'Review'}
        </Pill>
        <Pill disabled={busy} onClick={onSeen}>
          Mark as seen
        </Pill>
      </div>
      <span className="text-[12px] text-[#7a7466]">Auto-seat keeps everyone else where they are.</span>
    </section>
  );
}

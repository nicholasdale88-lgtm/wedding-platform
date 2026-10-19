/**
 * Small charts for the Overview hub, drawn as plain SVG in the admin's colours (no chart library).
 * Every chart has a text alternative: a label for screen readers, and the figures in a legend.
 */
import type { ReactNode } from 'react';

export const C = {
  accent: 'var(--adm-accent,#5d6b47)',
  gold: '#b9a07a',
  sand: '#e6dcc4',
  late: '#a4553c',
  sky: '#7d93b5',
  ink: 'var(--adm-ink,#33402f)',
  muted: '#5b6a52',
};

export type Slice = { label: string; value: number; colour: string };

/** A ring split into slices, with the big number in the middle. */
export function Donut({ slices, centre, sub, label, size = 132 }: { slices: Slice[]; centre: ReactNode; sub?: string; label: string; size?: number }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = 42;
  const len = 2 * Math.PI * r;
  let at = 0;
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
          <circle cx="50" cy="50" r={r} fill="none" stroke={C.sand} strokeWidth="12" />
          {total > 0 &&
            slices.map((s) => {
              const part = (s.value / total) * len;
              const el = s.value > 0 && (
                <circle
                  key={s.label}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  strokeWidth="12"
                  style={{ stroke: s.colour }}
                  strokeDasharray={`${part} ${len - part}`}
                  strokeDashoffset={-at}
                  transform="rotate(-90 50 50)"
                />
              );
              at += part;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-[30px] leading-none">{centre}</span>
          {sub && <span className="mt-1 text-[11px] text-[#5b6a52]">{sub}</span>}
        </div>
      </div>
      <Legend items={slices.map((s) => ({ label: s.label, value: String(s.value), colour: s.colour }))} />
    </div>
  );
}

export function Legend({ items }: { items: { label: string; value: string; colour: string }[] }) {
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-[6px] text-[13px] min-w-0">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span aria-hidden className="w-[10px] h-[10px] rounded-[3px] flex-none" style={{ background: i.colour }} />
          <span className="text-[#5b6a52]">{i.label}</span>
          <span className="font-semibold tabular-nums">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Columns, each a stack of coloured parts (e.g. paid and still to pay), with a label under each. */
export function Columns({ cols, label, money = false, height = 140 }: { cols: { label: string; parts: { value: number; colour: string }[]; note?: string }[]; label: string; money?: boolean; height?: number }) {
  const max = Math.max(1, ...cols.map((c) => c.parts.reduce((a, p) => a + p.value, 0)));
  const fmt = (n: number) => (money ? `$${n >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString('en-AU')}` : String(n));
  return (
    <div role="img" aria-label={`${label}: ${cols.map((c) => `${c.label} ${fmt(c.parts.reduce((a, p) => a + p.value, 0))}`).join(', ')}`} className="flex flex-col gap-1">
      <div className="flex items-end gap-[6px]" style={{ height }}>
        {cols.map((c) => {
          const sum = c.parts.reduce((a, p) => a + p.value, 0);
          return (
            <div key={c.label} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1">
              {sum > 0 && <span className="text-[11px] tabular-nums text-[#5b6a52] whitespace-nowrap">{fmt(sum)}</span>}
              <div className="w-full max-w-[38px] flex flex-col-reverse rounded-t-[5px] overflow-hidden" style={{ height: `${(sum / max) * 82}%`, minHeight: sum ? 3 : 0 }}>
                {c.parts.map((p, i) => (p.value > 0 ? <div key={i} style={{ height: `${(p.value / sum) * 100}%`, background: p.colour }} /> : null))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-[6px] border-t border-[#c6b794] pt-1">
        {cols.map((c) => (
          <span key={c.label} className={`flex-1 min-w-0 text-center text-[11px] truncate ${c.note ? 'text-[#a4553c] font-semibold' : 'text-[#5b6a52]'}`}>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars, one row each (who's doing what, where the money goes). */
export function Rows({ rows, label }: { rows: { label: string; parts: { value: number; colour: string }[]; right: string }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, p) => a + p.value, 0)));
  return (
    <ul aria-label={label} className="m-0 p-0 list-none flex flex-col gap-[10px]">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_auto] gap-3 items-center text-[13px]">
          <span className="truncate">{r.label}</span>
          <span className="flex h-[12px] rounded-full overflow-hidden bg-[#efe7d3]" aria-hidden>
            {r.parts.map((p, i) => (p.value > 0 ? <span key={i} style={{ width: `${(p.value / max) * 100}%`, background: p.colour }} /> : null))}
          </span>
          <span className="tabular-nums text-[#5b6a52] whitespace-nowrap">{r.right}</span>
        </li>
      ))}
    </ul>
  );
}

/** A running total over time (replies coming in), with the goal as a dashed line. */
export function Climb({ points, goal, label, height = 120 }: { points: { day: string; total: number }[]; goal: number; label: string; height?: number }) {
  if (points.length < 2) return <p className="m-0 text-[13px] text-[#5b6a52]">The chart starts once replies come in on two different days.</p>;
  const w = 300;
  const top = Math.max(goal, points[points.length - 1]!.total, 1);
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => height - (v / top) * (height - 8);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <figure className="m-0 flex flex-col gap-1">
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={`${label}: ${last.total} of ${goal} by ${day(last.day)}`}>
        <line x1="0" x2={w} y1={y(goal)} y2={y(goal)} stroke={C.gold} strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={`${line} L${w},${height} L0,${height} Z`} style={{ fill: C.accent }} opacity="0.14" />
        <path d={line} fill="none" style={{ stroke: C.accent }} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-[#5b6a52]">
        <span>{day(points[0]!.day)}</span>
        <span>
          {last.total} of {goal} · dashed line: everyone
        </span>
        <span>{day(last.day)}</span>
      </figcaption>
    </figure>
  );
}

/** One bar against a total (budget committed and paid, tasks done). */
export function Meter({ parts, total, label }: { parts: { value: number; colour: string; label: string }[]; total: number; label: string }) {
  const sum = parts.reduce((a, p) => a + p.value, 0);
  const scale = Math.max(total, sum, 1);
  return (
    <div role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${Math.round(p.value)}`).join(', ')} of ${Math.round(total)}`} className="flex h-[12px] rounded-full overflow-hidden bg-[#efe7d3]">
      {parts.map((p) => (p.value > 0 ? <span key={p.label} style={{ width: `${(p.value / scale) * 100}%`, background: p.colour }} /> : null))}
    </div>
  );
}

import { useRef, type ReactNode } from 'react';
import { inputCls, Label, useToast } from '../ui';

/** Form pieces for an event's Setup (design: numbered sections, labelled inputs, row editors with ×). */

export function Section({ n, title, hint, children }: { n: number | string; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[14px] pt-6 border-t border-[#e2d7bc] first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="w-[26px] h-[26px] rounded-full bg-[#33402f] text-[#f3ecd6] text-[13px] font-semibold flex items-center justify-center shrink-0">{n}</span>
        <h2 className="m-0 font-display font-medium text-[26px]">{title}</h2>
        <span className="basis-full text-[14px] text-[#5b6a52]">{hint}</span>
      </div>
      {children}
    </section>
  );
}

export function TextField({ label, value, onChange, placeholder, long, hint, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; long?: boolean; hint?: string; type?: 'date' }) {
  return (
    <Label text={label}>
      {long ? (
        <textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputCls} resize-y`} />
      ) : (
        <input type={type ?? 'text'} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      )}
      {hint && <span className="text-[12px] text-[#7a7466]">{hint}</span>}
    </Label>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">{children}</div>;
}

/** A list of rows (run sheet, menu, contacts…): edit in place, remove with ×, add at the end. */
export function Rows<T extends Record<string, string>>({
  rows,
  cols,
  blank,
  addLabel,
  onChange,
}: {
  rows: T[];
  cols: { key: keyof T & string; label: string; width?: string; long?: boolean }[];
  blank: T;
  addLabel: string;
  onChange: (rows: T[]) => void;
}) {
  const set = (i: number, key: keyof T, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const toast = useToast();
  const latest = useRef(rows);
  latest.current = rows;
  // A row with something in it can be put back (Undo puts it where it was, keeping edits made since).
  const remove = (i: number) => {
    const gone = rows[i]!;
    onChange(rows.filter((_, j) => j !== i));
    if (Object.values(gone).some((v) => v.trim())) {
      toast('Row removed', { label: 'Undo', run: () => onChange([...latest.current.slice(0, i), gone, ...latest.current.slice(i)]) });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 items-start">
          {cols.map((c) =>
            c.long ? (
              <textarea key={c.key} rows={2} aria-label={c.label} placeholder={c.label} value={r[c.key] ?? ''} onChange={(e) => set(i, c.key, e.target.value)} className={`${inputCls} resize-y min-w-0 flex-1`} />
            ) : (
              <input key={c.key} aria-label={c.label} placeholder={c.label} value={r[c.key] ?? ''} onChange={(e) => set(i, c.key, e.target.value)} className={`${inputCls} min-w-0 ${c.width ?? 'flex-1'}`} />
            ),
          )}
          <button type="button" aria-label="Remove" onClick={() => remove(i)} className="shrink-0 w-[38px] h-[42px] rounded-[10px] border border-[#d3c6a4] bg-transparent text-[18px] text-[#7a4a37] cursor-pointer hover:bg-[#efe7d3]">
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { ...blank }])} className="self-start py-[7px] px-[14px] rounded-full border border-dashed border-[#8a9670] bg-transparent text-[13px] cursor-pointer hover:bg-[#efe7d3]">
        {addLabel}
      </button>
    </div>
  );
}

/** A plain list of lines (what to bring). */
export function Lines({ items, addLabel, label, onChange }: { items: string[]; addLabel: string; label: string; onChange: (items: string[]) => void }) {
  return (
    <Rows
      rows={items.map((v) => ({ v }))}
      cols={[{ key: 'v', label }]}
      blank={{ v: '' }}
      addLabel={addLabel}
      onChange={(rows) => onChange(rows.map((r) => r.v))}
    />
  );
}

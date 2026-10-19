import { useMemo, useState } from 'react';
import shipped from '../../../../../seed/texts.json';
import shippedDynamic from '../../../../../seed/texts.dynamic.json';
import { inputCls } from '../ui';
import { Section } from './fields';

/** The design's original wording, so "Reset" can always bring it back. */
export const ORIGINAL: Record<string, string> = { ...shipped, ...shippedDynamic };

/**
 * "Every word on this page" (design: search, original above, your version below, Reset).
 * Shows the page's catalogue (inv.*, gd.*, g30.*, ph.*), including the sentences that change per guest.
 */
export function Wording({ n, prefix, texts, onChange }: { n: number; prefix: string; texts: Record<string, string>; onChange: (key: string, value: string) => void }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);
  const keys = useMemo(
    () => {
      const all = Object.keys({ ...ORIGINAL, ...texts }).filter((k) => k.startsWith(`${prefix}.`));
      const edited = (k: string) => texts[k] !== undefined && texts[k] !== ORIGINAL[k];
      return [...all.filter(edited), ...all.filter((k) => !edited(k))]; // your earlier changes first
    },
    // Ordered when the page opens, so a box never jumps while you type in it.
    [prefix],
  );
  const needle = q.trim().toLowerCase();
  const shown = keys.filter((k) => !needle || (ORIGINAL[k] ?? '').toLowerCase().includes(needle) || (texts[k] ?? '').toLowerCase().includes(needle));
  const changed = keys.filter((k) => ORIGINAL[k] !== undefined && texts[k] !== undefined && texts[k] !== ORIGINAL[k]).length;

  return (
    <Section n={n} title="Every word on this page" hint="Change any wording guests see. Search, then type your version. Words in {curly brackets} are filled in for each guest; keep them as they are.">
      <div className="flex gap-[10px] items-center flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search wording" className={`${inputCls} flex-1 min-w-[200px]`} aria-label="Search wording" />
        <span className="text-[13px] text-[#5b6a52]">
          {shown.length} of {keys.length} · {changed} changed
        </span>
      </div>
      <div className="flex flex-col">
        {shown.slice(0, limit).map((k) => {
          const orig = ORIGINAL[k] ?? '';
          const val = texts[k] ?? orig;
          const isChanged = val !== orig;
          return (
            <div key={k} className="flex flex-col gap-[6px] py-3 border-t border-[#ece3cc]">
              <div className="flex justify-between gap-3 items-baseline">
                <span className="text-[13px] text-[#7a7466] italic">{orig || k}</span>
                {isChanged && orig && (
                  <button type="button" onClick={() => onChange(k, orig)} className="p-0 border-0 bg-transparent text-[12px] underline text-[#7a4a37] cursor-pointer shrink-0">
                    Reset
                  </button>
                )}
              </div>
              <textarea
                rows={Math.min(6, Math.max(1, Math.ceil(val.length / 70)))}
                value={val}
                onChange={(e) => onChange(k, e.target.value)}
                aria-label={orig || k}
                className={`${inputCls} resize-y ${isChanged ? '!border-[#8a9670] !bg-[#f3f0e2]' : ''}`}
              />
            </div>
          );
        })}
        {shown.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + 60)} className="self-start mt-2 py-[7px] px-[14px] rounded-full border border-dashed border-[#8a9670] bg-transparent text-[13px] cursor-pointer hover:bg-[#efe7d3]">
            Show more ({shown.length - limit} left)
          </button>
        )}
      </div>
    </Section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import shipped from '../../../../../seed/texts.json';
import shippedDynamic from '../../../../../seed/texts.dynamic.json';
import { inputCls } from '../ui';
import { Section } from './fields';
import { fillName, sentencesFor, type Sentence } from './wordingMap';

/** The design's original wording, so "Reset" can always bring it back. */
export const ORIGINAL: Record<string, string> = { ...shipped, ...shippedDynamic };

/**
 * "Every word on this page": the page's wording in the order guests read it, grouped by section. A
 * sentence the design split around a bold time or a guest's name is one row, with the filled-in parts
 * shown as grey chips; the sentences that change per guest come last. Search, edit, Reset.
 */
const words = (s: string) => /[\p{L}\p{N}]/u.test(s);
const keysOf = (s: Sentence) => s.pieces.flatMap((p) => ('key' in p ? [p.key] : []));
const humanKey = (k: string) => fillName(k.split('.').pop() ?? k);

export function Wording({ n, prefix, texts, onChange }: { n: number; prefix: string; texts: Record<string, string>; onChange: (key: string, value: string) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Sentence[] | null>(null);
  useEffect(() => {
    let live = true;
    sentencesFor(prefix)
      .then((s) => live && setFound(s))
      .catch(() => live && setFound([]));
    return () => {
      live = false;
    };
  }, [prefix]);

  const val = (k: string) => texts[k] ?? ORIGINAL[k] ?? '';
  const changed = (k: string) => ORIGINAL[k] !== undefined && texts[k] !== undefined && texts[k] !== ORIGINAL[k];

  // Every sentence on the page, then the per-guest sentences and anything the page didn't place.
  const sections = useMemo(() => {
    if (!found) return [];
    const all = Object.keys({ ...ORIGINAL, ...texts }).filter((k) => k.startsWith(`${prefix}.`));
    const placed = new Set(found.flatMap(keysOf));
    const rest = all.filter((k) => !placed.has(k));
    const list: Sentence[] = [
      ...found.filter((s) => keysOf(s).some((k) => words(ORIGINAL[k] ?? texts[k] ?? ''))),
      ...rest.filter((k) => k.includes('.dyn.')).map((k) => ({ section: 'Sentences filled in for each guest', pieces: [{ key: k }] })),
      ...rest.filter((k) => !k.includes('.dyn.') && words(ORIGINAL[k] ?? '')).map((k) => ({ section: 'Other wording', pieces: [{ key: k }] })),
    ];
    const by = new Map<string, Sentence[]>();
    for (const s of list) by.set(s.section, [...(by.get(s.section) ?? []), s]);
    return [...by.entries()];
  }, [found, prefix, texts]);

  const needle = q.trim().toLowerCase();
  const matches = (s: Sentence) => !needle || keysOf(s).some((k) => `${ORIGINAL[k] ?? ''} ${val(k)}`.toLowerCase().includes(needle));
  const total = sections.reduce((a, [, ss]) => a + ss.length, 0);
  const edited = sections.reduce((a, [, ss]) => a + ss.filter((s) => keysOf(s).some(changed)).length, 0);

  return (
    <Section n={n} title="Every word on this page" hint="Change any wording guests see, section by section. Grey chips are filled in for each guest. In the per-guest sentences, keep anything in {curly brackets} as it is.">
      <div className="flex gap-[10px] items-center flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search wording" className={`${inputCls} flex-1 min-w-[200px]`} aria-label="Search wording" />
        <span className="text-[13px] text-[#5b6a52]">
          {total} sentences · {edited} changed
        </span>
      </div>
      {!found && <div aria-busy="true" className="text-[13px] text-[#5b6a52]">Reading the page…</div>}
      <div className="flex flex-col gap-2">
        {sections.map(([name, ss]) => {
          const shown = ss.filter(matches);
          if (!shown.length) return null;
          const mine = ss.filter((s) => keysOf(s).some(changed)).length;
          return (
            <details key={name} open={!!needle} className="rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0] [&[open]>summary>span:last-child]:rotate-90">
              <summary className="list-none cursor-pointer flex justify-between items-center gap-3 py-3 px-4">
                <span className="font-display text-[19px]">
                  {name}
                  <span className="ml-2 font-sans text-[12px] text-[#7a7466]">
                    {shown.length} {shown.length === 1 ? 'sentence' : 'sentences'}
                    {mine ? ` · ${mine} changed` : ''}
                  </span>
                </span>
                <span aria-hidden className="transition-transform text-[#5b6a52]">
                  ›
                </span>
              </summary>
              <div className="flex flex-col px-4 pb-2">
                {shown.map((s) => (
                  <SentenceRow key={keysOf(s).join('|')} s={s} val={val} changed={changed} onChange={onChange} section={name} />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </Section>
  );
}

function SentenceRow({
  s,
  val,
  changed,
  onChange,
  section,
}: {
  s: Sentence;
  val: (k: string) => string;
  changed: (k: string) => boolean;
  onChange: (key: string, value: string) => void;
  section: string;
}) {
  const keys = keysOf(s);
  const editable = keys.filter((k) => words(ORIGINAL[k] ?? val(k)));
  const isChanged = keys.some(changed);
  const reset = () => keys.forEach((k) => changed(k) && onChange(k, ORIGINAL[k]!));
  const dyn = keys.length === 1 && keys[0]!.includes('.dyn.');
  const box = (k: string, wide: boolean) => (
    <textarea
      key={k}
      rows={wide ? Math.min(6, Math.max(1, Math.ceil(val(k).length / 70))) : 1}
      value={val(k)}
      onChange={(e) => onChange(k, e.target.value)}
      aria-label={dyn ? humanKey(k) : `${section}: ${(ORIGINAL[k] ?? '').trim().slice(0, 60)}`}
      className={`${inputCls} resize-y ${wide ? 'w-full' : 'w-auto min-w-[120px] flex-1'} ${changed(k) ? '!border-[#8a9670] !bg-[#f3f0e2]' : ''}`}
    />
  );
  return (
    <div className="flex flex-col gap-[6px] py-3 border-t border-[#ece3cc] first:border-t-0">
      {(dyn || isChanged) && (
        <div className="flex justify-between gap-3 items-baseline">
          <span className="text-[12px] text-[#7a7466]">{dyn ? humanKey(keys[0]!) : ''}</span>
          {isChanged && (
            <button type="button" onClick={reset} className="p-0 border-0 bg-transparent text-[12px] underline text-[#7a4a37] cursor-pointer shrink-0">
              Reset
            </button>
          )}
        </div>
      )}
      {editable.length <= 1 && s.pieces.length === 1 ? (
        box(keys[0]!, true)
      ) : (
        // A split sentence: its parts in reading order, the per-guest parts as chips between them.
        <div className="flex flex-wrap items-center gap-[6px]">
          {s.pieces.map((p, i) =>
            'fill' in p ? (
              <span key={`f${i}`} className="py-[3px] px-2 rounded-full bg-[#e7e0cb] text-[12px] text-[#5b6a52]" title="Filled in for each guest">
                {fillName(p.fill)}
              </span>
            ) : editable.includes(p.key) ? (
              box(p.key, false)
            ) : (
              <span key={p.key} className="text-[15px] text-[#5b6a52]">
                {val(p.key).trim()}
              </span>
            ),
          )}
        </div>
      )}
      {isChanged && (
        <span className="text-[12px] text-[#7a7466] italic">
          Was: {s.pieces.map((p) => ('fill' in p ? `[${fillName(p.fill)}]` : (ORIGINAL[p.key] ?? ''))).join('').replace(/\s+/g, ' ').trim()}
        </span>
      )}
    </div>
  );
}

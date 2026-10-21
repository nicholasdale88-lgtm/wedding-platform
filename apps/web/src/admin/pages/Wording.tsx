import { useEffect, useMemo, useState } from 'react';
// The neutral wording every wedding starts from (the server fills in the same where a wedding has none).
import generic from '../../../../../seed/texts.generic.json';
import { inputCls, Rollup } from '../ui';
import { fillName, sentencesFor, type Sentence } from './wordingMap';

/** The design's original wording, so "Reset" can always bring it back. */
export const ORIGINAL: Record<string, string> = generic;

/**
 * "Every word guests read": one roll-up that says what's changed. Opened, the page's wording reads as it
 * does for guests, section by section; tap a sentence to change it. A sentence the design split around a
 * bold time or a guest's name is one row, with the filled-in parts as grey chips; the sentences that change
 * per guest come last. Search, Changed only, Reset.
 */
const words = (s: string) => /[\p{L}\p{N}]/u.test(s);
const keysOf = (s: Sentence) => s.pieces.flatMap((p) => ('key' in p ? [p.key] : []));
const humanKey = (k: string) => fillName(k.split('.').pop() ?? k);

export function Wording({ n, prefix, texts, onChange }: { n: number; prefix: string; texts: Record<string, string>; onChange: (key: string, value: string) => void }) {
  const [q, setQ] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  // The [placeholders] in the starting wording (the venue, the date) still to be replaced with their own.
  const [onlyBlanks, setOnlyBlanks] = useState(false);
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
  const isMine = (s: Sentence) => keysOf(s).some(changed);
  const isBlank = (s: Sentence) => keysOf(s).some((k) => /\[[^\]\n]{2,}\]/.test(val(k)));
  const matches = (s: Sentence) => (!onlyMine || isMine(s)) && (!onlyBlanks || isBlank(s)) && (!needle || keysOf(s).some((k) => `${ORIGINAL[k] ?? ''} ${val(k)}`.toLowerCase().includes(needle)));
  const total = sections.reduce((a, [, ss]) => a + ss.length, 0);
  const edited = sections.reduce((a, [, ss]) => a + ss.filter(isMine).length, 0);
  const blanks = sections.reduce((a, [, ss]) => a + ss.filter(isBlank).length, 0);

  return (
    <Rollup step={n} title="Every word guests read" now={`${blanks ? `${blanks} still to fill in · ` : ''}${edited ? `${edited} changed` : 'The design’s own wording'} · ${total} sentences`}>
      <p className="m-0 text-[13px] text-[var(--adm-muted,#5b6a52)]">Tap any sentence to change it. Grey chips are filled in for each guest.</p>
      <div className="flex gap-[10px] items-center flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a word or sentence" className={`${inputCls} flex-1 min-w-[200px]`} aria-label="Search wording" />
        <label className="flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="w-[16px] h-[16px] accent-[#5d6b47]" />
          Changed only ({edited})
        </label>
        {blanks > 0 && (
          <label className="flex items-center gap-2 text-[13px] cursor-pointer font-semibold text-[#6b4e12]">
            <input type="checkbox" checked={onlyBlanks} onChange={(e) => setOnlyBlanks(e.target.checked)} className="w-[16px] h-[16px] accent-[#b39563]" />
            Still to fill in ({blanks}): the [words in brackets]
          </label>
        )}
      </div>
      {!found && <div aria-busy="true" className="text-[13px] text-[#5b6a52]">Reading the page…</div>}
      {found && (onlyMine || needle) && !sections.some(([, ss]) => ss.some(matches)) && <div className="text-[14px] text-[#5b6a52]">{onlyMine && !needle ? 'Nothing changed yet: everything reads as the design wrote it.' : 'No wording matches that.'}</div>}
      <div className="flex flex-col gap-2">
        {sections.map(([name, ss]) => {
          const shown = ss.filter(matches);
          if (!shown.length) return null;
          const mine = ss.filter(isMine).length;
          return (
            <details key={name} open={!!needle || onlyMine || onlyBlanks} className="rounded-[12px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)] [&[open]>summary>span:last-child]:rotate-90">
              <summary className="list-none cursor-pointer flex justify-between items-center gap-3 py-3 px-4">
                <span className="font-display text-[19px]">
                  {name}
                  <span className="ml-2 font-sans text-[12px] text-[#7a7466]">{mine ? `${mine} changed` : ''}</span>
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
    </Rollup>
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
  const [editing, setEditing] = useState(false);
  const shownText = s.pieces.map((p) => ('fill' in p ? `[${fillName(p.fill)}]` : val(p.key))).join('').replace(/\s+/g, ' ').trim();
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
  if (!editing)
    return (
      <div className="flex flex-col gap-1 py-2 border-t border-[var(--adm-line,#ece3cc)] first:border-t-0">
        {dyn && <span className="text-[12px] text-[#7a7466]">{humanKey(keys[0]!)}</span>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Change: ${shownText.slice(0, 80)}`}
          className={`text-left p-2 -mx-2 rounded-[8px] border-0 cursor-text text-[15px] leading-[1.5] hover:bg-[var(--adm-tint,#efe7d3)] ${isChanged ? 'bg-[#f3f0e2]' : 'bg-transparent'}`}
        >
          {s.pieces.map((p, i) =>
            'fill' in p ? (
              <span key={`f${i}`} className="py-[1px] px-2 rounded-full bg-[#e7e0cb] text-[12px] text-[#5b6a52] whitespace-nowrap">
                {fillName(p.fill)}
              </span>
            ) : (
              <span key={p.key}>{val(p.key)}</span>
            ),
          )}
          {!shownText && <span className="italic text-[#7a7466]">(empty)</span>}
        </button>
        {isChanged && (
          <span className="flex justify-between gap-3 items-baseline text-[12px] text-[#7a7466]">
            <span className="italic">Was: {s.pieces.map((p) => ('fill' in p ? `[${fillName(p.fill)}]` : (ORIGINAL[p.key] ?? ''))).join('').replace(/\s+/g, ' ').trim()}</span>
            <button type="button" onClick={reset} className="p-0 border-0 bg-transparent underline text-[#7a4a37] cursor-pointer shrink-0">
              Reset
            </button>
          </span>
        )}
      </div>
    );
  return (
    <div className="flex flex-col gap-[6px] py-3 border-t border-[var(--adm-line,#ece3cc)] first:border-t-0">
      <div className="flex justify-between gap-3 items-baseline">
        <span className="text-[12px] text-[#7a7466]">{dyn ? humanKey(keys[0]!) : ''}</span>
        <button type="button" onClick={() => setEditing(false)} className="p-0 border-0 bg-transparent text-[12px] underline cursor-pointer shrink-0 text-[var(--adm-text,#33402f)]">
          Done
        </button>
      </div>
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

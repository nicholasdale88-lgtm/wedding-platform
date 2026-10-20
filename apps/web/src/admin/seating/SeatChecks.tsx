import { NO_RULES, SEAT_PRESETS, seatProblems, SeatRules as SeatRulesSchema, type SeatRules } from '@wp/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, plannerApi, type SeatingData, type SeatTable } from '../../lib/api';
import { useDocSave } from '../planner/useDocSave';
import { useAdmin } from '../Shell';
import { inputCls, useToast } from '../ui';

/**
 * This event's seating rules (presets on until turned off, plus your own pairs), loaded and saved.
 * `rules` is the presets alone until the doc loads, so auto-seat always follows them.
 */
export function useSeatRules(ev: string | undefined) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [doc, setDoc] = useState<{ data: SeatRules; version: number } | null>(null);
  const saveDoc = useDocSave<SeatRules>(wid, 'seat-rules', ev ?? '', doc?.version);
  const reload = useCallback(() => {
    if (!ev) return;
    plannerApi
      .docFor<SeatRules>(wid, 'seat-rules', ev)
      .then((d) => setDoc({ ...d, data: SeatRulesSchema.parse(d.data ?? {}) }))
      .catch(() => setDoc(null)); // the presets still apply; edits wait until it loads
  }, [wid, ev]);
  useEffect(reload, [reload]);
  const save = async (data: SeatRules) => {
    if (!doc) return;
    try {
      setDoc({ ...doc, data });
      const r = await saveDoc(data);
      setDoc((d) => (d ? { ...d, version: r.version } : { data, version: r.version }));
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded.' : (e as Error).message);
      reload();
    }
  };
  return { rules: doc?.data ?? NO_RULES, loaded: !!doc, save };
}

/**
 * Seating → Rules and checks. Preset rules (invited together sit together, groups stay together, the
 * wedding party at the head table, fill tables first) and your own pairs to keep apart or together.
 * Auto-seat follows them all; anything in the plan that breaks one is listed here as you seat.
 */
export function SeatChecks({ data, tables, seats, seatRules }: { data: SeatingData; tables: SeatTable[]; seats: Record<string, string | null>; seatRules: ReturnType<typeof useSeatRules> }) {
  const { rules, loaded, save } = seatRules;
  const [pick, setPick] = useState({ a: '', b: '', kind: 'apart' as 'apart' | 'together' });
  const [open, setOpen] = useState(false);
  const coming = data.people.filter((p) => p.coming);
  const nameOf = (id: string) => data.people.find((p) => p.id === id)?.name ?? 'Someone';
  const problems = useMemo(() => seatProblems(data.people, tables, seats, rules), [data.people, tables, seats, rules]);

  return (
    <div className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-baseline gap-2">
        <h2 className="m-0 font-display font-medium text-[22px]">Rules and checks</h2>
        <span className={`text-[13px] ${problems.length ? 'text-[#7a4a37] font-semibold' : 'text-[#3d4a2f]'}`}>{problems.length ? `${problems.length} to look at` : 'All good ✓'}</span>
      </div>
      {problems.map((p) => (
        <div key={p} className="text-[13px] text-[#7a4a37]">
          • {p}
        </div>
      ))}
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
        {open ? 'Hide the rules' : `The rules (${SEAT_PRESETS.filter((x) => rules.presets[x.key]).length} on${rules.pairs.length ? `, ${rules.pairs.length} of your own` : ''})`}
      </button>
      {open && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[13px] text-[#5b6a52]">Auto-seat follows these, and anything that breaks one shows above.</p>
          <fieldset className="flex flex-col gap-2 m-0 p-0 border-0" disabled={!loaded}>
            {SEAT_PRESETS.map((x) => (
              <label key={x.key} className="flex gap-2 items-start text-[14px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={rules.presets[x.key]}
                  onChange={(e) => void save({ ...rules, presets: { ...rules.presets, [x.key]: e.target.checked } })}
                  className="mt-[3px] accent-[#33402f]"
                />
                <span>
                  {x.label}
                  <span className="block text-[12px] text-[#7a7466]">{x.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2 pt-2 border-t border-[#e2d7bc]">
            <span className="text-[13px] font-semibold">Your own rules</span>
            {rules.pairs.map((r, i) => (
              <div key={`${r.a}-${r.b}-${i}`} className="flex justify-between gap-2 text-[13px]">
                <span>
                  {nameOf(r.a)} {r.kind === 'apart' ? '≠' : '='} {nameOf(r.b)} <span className="text-[#7a7466]">({r.kind === 'apart' ? 'keep apart' : 'keep together'})</span>
                </span>
                <button type="button" aria-label="Remove rule" onClick={() => void save({ ...rules, pairs: rules.pairs.filter((_, j) => j !== i) })} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a4a37]">
                  ×
                </button>
              </div>
            ))}
            <div className="grid gap-2 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
              <select aria-label="First guest" value={pick.a} onChange={(e) => setPick({ ...pick, a: e.target.value })} className={`${inputCls} !py-[6px] !text-[13px] w-full min-w-0`}>
                <option value="">Someone…</option>
                {coming.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select aria-label="Rule" value={pick.kind} onChange={(e) => setPick({ ...pick, kind: e.target.value as 'apart' | 'together' })} className={`${inputCls} !py-[6px] !text-[13px]`}>
                <option value="apart">apart from</option>
                <option value="together">with</option>
              </select>
              <select aria-label="Second guest" value={pick.b} onChange={(e) => setPick({ ...pick, b: e.target.value })} className={`${inputCls} !py-[6px] !text-[13px] w-full min-w-0`}>
                <option value="">Someone…</option>
                {coming
                  .filter((p) => p.id !== pick.a)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!loaded || !pick.a || !pick.b}
              onClick={() => {
                void save({ ...rules, pairs: [...rules.pairs, { a: pick.a, b: pick.b, kind: pick.kind }] });
                setPick({ a: '', b: '', kind: pick.kind });
              }}
              className="self-start py-[6px] px-3 rounded-full border border-dashed border-[#8a9670] bg-transparent text-[13px] cursor-pointer disabled:opacity-50"
            >
              + Add rule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import type { SeatRules } from '@wp/shared';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, plannerApi, type SeatingData, type SeatTable } from '../../lib/api';
import { useDocSave } from '../planner/useDocSave';
import { useAdmin } from '../Shell';
import { inputCls, useToast } from '../ui';

/**
 * Seating → Checks: what to look at before publishing. Tables with more people than seats, a party
 * split across tables, and your own rules: pairs to keep apart (or together), checked as you seat.
 */
export function SeatChecks({ data, tables, seats }: { data: SeatingData; tables: SeatTable[]; seats: Record<string, string | null> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [rules, setRules] = useState<{ data: SeatRules; version: number } | null>(null);
  const [pick, setPick] = useState({ a: '', b: '', kind: 'apart' as 'apart' | 'together' });
  const [open, setOpen] = useState(false);
  const ev = data.event.key;
  const saveDoc = useDocSave<SeatRules>(wid, 'seat-rules', ev, rules?.version);
  useEffect(() => {
    plannerApi
      .docFor<SeatRules>(wid, 'seat-rules', ev)
      .then(setRules)
      .catch(() => setRules(null)); // no rules panel rather than one whose saves can't land
  }, [wid, ev]);

  const coming = data.people.filter((p) => p.coming);
  const nameOf = (id: string) => data.people.find((p) => p.id === id)?.name ?? 'Someone';
  const tableName = (id: string | null | undefined) => tables.find((t) => t.id === id)?.name ?? '';
  const problems = useMemo(() => {
    const out: string[] = [];
    for (const t of tables) {
      const n = Object.values(seats).filter((x) => x === t.id).length;
      if (n > t.seats) out.push(`${/^\d+$/.test(t.name) ? `Table ${t.name}` : t.name} has ${n} people for ${t.seats} seats.`);
    }
    const byInv = new Map<string, Set<string>>();
    for (const p of coming) {
      const tid = seats[p.id];
      if (!tid) continue;
      byInv.set(p.invitationId, (byInv.get(p.invitationId) ?? new Set()).add(tid));
    }
    for (const [inv, ts] of byInv) {
      if (ts.size > 1) {
        const who = coming.filter((p) => p.invitationId === inv).map((p) => p.name.split(' ')[0]);
        out.push(`${who.join(' & ')} came together but sit at ${[...ts].map(tableName).join(' and ')}.`);
      }
    }
    for (const r of rules?.data.pairs ?? []) {
      const ta = seats[r.a];
      const tb = seats[r.b];
      if (r.kind === 'apart' && ta && ta === tb) out.push(`${nameOf(r.a)} and ${nameOf(r.b)} are both at ${tableName(ta)} (you asked to keep them apart).`);
      if (r.kind === 'together' && ta && tb && ta !== tb) out.push(`${nameOf(r.a)} and ${nameOf(r.b)} are at different tables (you asked to keep them together).`);
    }
    return out;
  }, [tables, seats, coming, rules]); // eslint-disable-line

  const save = async (pairs: SeatRules['pairs']) => {
    if (!rules) return;
    try {
      setRules({ ...rules, data: { pairs } });
      const r = await saveDoc({ pairs });
      setRules((d) => (d ? { ...d, version: r.version } : r));
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded.' : (e as Error).message);
      plannerApi.docFor<SeatRules>(wid, 'seat-rules', ev).then(setRules, () => undefined);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-baseline gap-2">
        <h2 className="m-0 font-display font-medium text-[22px]">Checks</h2>
        <span className={`text-[13px] ${problems.length ? 'text-[#7a4a37] font-semibold' : 'text-[#3d4a2f]'}`}>{problems.length ? `${problems.length} to look at` : 'All good ✓'}</span>
      </div>
      {problems.map((p) => (
        <div key={p} className="text-[13px] text-[#7a4a37]">
          • {p}
        </div>
      ))}
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
        {open ? 'Hide your rules' : `Your rules (${rules?.data.pairs.length ?? 0})`}
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {(rules?.data.pairs ?? []).map((r, i) => (
            <div key={`${r.a}-${r.b}-${i}`} className="flex justify-between gap-2 text-[13px]">
              <span>
                {nameOf(r.a)} {r.kind === 'apart' ? '≠' : '='} {nameOf(r.b)} <span className="text-[#7a7466]">({r.kind === 'apart' ? 'keep apart' : 'keep together'})</span>
              </span>
              <button type="button" aria-label="Remove rule" onClick={() => void save((rules?.data.pairs ?? []).filter((_, j) => j !== i))} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a4a37]">
                ×
              </button>
            </div>
          ))}
          <div className="grid gap-2 grid-cols-[1fr_auto_1fr] items-center">
            <select aria-label="First guest" value={pick.a} onChange={(e) => setPick({ ...pick, a: e.target.value })} className={`${inputCls} !py-[6px] !text-[13px]`}>
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
            <select aria-label="Second guest" value={pick.b} onChange={(e) => setPick({ ...pick, b: e.target.value })} className={`${inputCls} !py-[6px] !text-[13px]`}>
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
            disabled={!pick.a || !pick.b}
            onClick={() => {
              void save([...(rules?.data.pairs ?? []), { a: pick.a, b: pick.b, kind: pick.kind }]);
              setPick({ a: '', b: '', kind: pick.kind });
            }}
            className="self-start py-[6px] px-3 rounded-full border border-dashed border-[#8a9670] bg-transparent text-[13px] cursor-pointer disabled:opacity-50"
          >
            + Add rule
          </button>
        </div>
      )}
    </div>
  );
}

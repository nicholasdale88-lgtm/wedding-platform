import { isSerious } from '@wp/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, seatingApi, type SeatArea, type SeatTable, type SeatingData } from '../../lib/api';
import { shortLabel } from '../../lib/format';
import { useAdmin } from '../Shell';
import { Eyebrow, inputCls, Label, Pill, useToast } from '../ui';

/**
 * Admin → Seating (design: isSeating). Drag tables and areas on the floor plan, tap a table to see
 * and change who sits there, tap guests to seat them. Nothing changes for guests until Save; then
 * each guest's night-before guide shows their table and the plan with it highlighted.
 */

type Sel = { kind: 'table'; id: string } | { kind: 'area'; i: number } | null;
type Drag = { kind: 'table' | 'area'; key: string | number; dx: number; dy: number; moved: boolean };
const AREAS = ['Dance floor', 'DJ', 'Bar', 'Entrance', 'Balcony', 'Fireplace', 'Cake table', 'Photo booth', 'Gift table', 'Area'];
const clamp = (n: number, lo = 2, hi = 98) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function Seating() {
  const { wid, reload: reloadOverview } = useAdmin();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [s, setS] = useState<SeatingData | null>(null);
  const [tables, setTables] = useState<SeatTable[]>([]);
  const [areas, setAreas] = useState<SeatArea[]>([]);
  const [seats, setSeats] = useState<Record<string, string | null>>({});
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [adding, setAdding] = useState(false);
  const [shape, setShape] = useState<'round' | 'long'>('round');
  const [snap, setSnap] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const apply = (d: SeatingData) => {
    setS(d);
    setTables(d.tables);
    setAreas(d.areas);
    setSeats(Object.fromEntries(d.people.map((p) => [p.id, p.tableId])));
    setDirty(false);
  };
  const load = useCallback(async () => {
    try {
      apply(await seatingApi.get(wid, params.get('event') ?? undefined));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid, params]);
  useEffect(() => void load(), [load]);

  // Leaving with unsaved seating asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const byTable = useMemo(() => {
    const m = new Map<string, NonNullable<SeatingData>['people']>();
    for (const p of s?.people ?? []) {
      const t = seats[p.id];
      if (t) m.set(t, [...(m.get(t) ?? []), p]);
    }
    return m;
  }, [s, seats]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!s) return <div aria-busy="true" className="text-[#5b6a52]">Loading the floor plan…</div>;

  const change = () => setDirty(true);
  const snapTo = (n: number) => (snap ? Math.round(n / 2.5) * 2.5 : round1(n));
  const at = (e: { clientX: number; clientY: number }) => {
    const r = plan.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  const nextName = () => String(Math.max(0, ...tables.map((t) => Number(t.name)).filter((n) => Number.isFinite(n))) + 1);
  const selTable = sel?.kind === 'table' ? tables.find((t) => t.id === sel.id) : undefined;
  const selArea = sel?.kind === 'area' ? areas[sel.i] : undefined;
  const setTable = (id: string, patch: Partial<SeatTable>) => (setTables((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))), change());
  const setArea = (i: number, patch: Partial<SeatArea>) => (setAreas((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a))), change());
  const seat = (ids: string[], tableId: string | null) => (setSeats((cur) => ({ ...cur, ...Object.fromEntries(ids.map((id) => [id, tableId])) })), change());

  const down = (kind: Drag['kind'], key: string | number, x: number, y: number) => (e: PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = at(e);
    drag.current = { kind, key, dx: p.x - x, dy: p.y - y, moved: false };
    setSel(kind === 'table' ? { kind, id: key as string } : { kind, i: key as number });
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    const x = clamp(snapTo(p.x - d.dx));
    const y = clamp(snapTo(p.y - d.dy));
    d.moved = true;
    if (d.kind === 'table') setTable(d.key as string, { x, y });
    else setArea(d.key as number, { x, y });
  };
  const up = () => (drag.current = null);
  const planClick = (e: MouseEvent) => {
    if (!adding) return setSel(null);
    const p = at(e);
    const t: SeatTable = { id: crypto.randomUUID(), name: nextName(), shape, dir: 'h', len: 40, x: clamp(snapTo(p.x)), y: clamp(snapTo(p.y)), seats: shape === 'long' ? 16 : 10 };
    setTables((ts) => [...ts, t]);
    setSel({ kind: 'table', id: t.id });
    change();
  };

  const save = async () => {
    setBusy(true);
    try {
      apply(await seatingApi.save(wid, s.version, { event: s.event.key, aspect: s.aspect, tables, areas, seats }));
      toast('Seating saved. Guides show it now.');
      void reloadOverview();
    } catch (e) {
      toast((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  };

  /** Seat everyone not yet seated (coming first), keeping each invitation together where it fits. */
  const autoSeat = () => {
    const free = new Map(tables.map((t) => [t.id, t.seats - (byTable.get(t.id)?.length ?? 0)]));
    const groups = new Map<string, string[]>();
    for (const p of [...s.people].sort((a, b) => Number(b.coming) - Number(a.coming))) if (!seats[p.id]) groups.set(p.invitationId, [...(groups.get(p.invitationId) ?? []), p.id]);
    const next = { ...seats };
    let n = 0;
    for (const ids of groups.values()) {
      const whole = tables.find((t) => (free.get(t.id) ?? 0) >= ids.length);
      for (const id of ids) {
        const t = whole ?? tables.find((x) => (free.get(x.id) ?? 0) > 0);
        if (!t) break;
        next[id] = t.id;
        free.set(t.id, free.get(t.id)! - 1);
        n++;
      }
    }
    setSeats(next);
    change();
    toast(n ? `Seated ${n}. Check it, then Save.` : 'No free seats left. Add a table first.');
  };

  /** Even rows across the room. */
  const lineUp = () => {
    const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length * 1.4)));
    const rows = Math.ceil(sorted.length / cols);
    const pos = new Map(sorted.map((t, i) => [t.id, { x: round1(10 + ((i % cols) + 0.5) * (80 / cols)), y: round1(12 + (Math.floor(i / cols) + 0.5) * (76 / rows)) }]));
    setTables(tables.map((t) => ({ ...t, ...pos.get(t.id) })));
    change();
  };

  const seated = s.people.filter((p) => seats[p.id]).length;
  const unseated = [...s.people.filter((p) => !seats[p.id]).reduce((m, p) => m.set(p.invitationId, [...(m.get(p.invitationId) ?? []), p]), new Map<string, SeatingData['people']>()).values()];
  const target = selTable?.id ?? null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <Eyebrow>Seating · {shortLabel(s.event.name).toLowerCase()}</Eyebrow>
          <h1 className="m-0 mt-[6px] font-display font-medium text-[40px] leading-[1.08]">
            {seated} of {s.people.length} seated
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {s.events.length > 1 && (
            <select value={s.event.key} onChange={(e) => setParams({ event: e.target.value })} aria-label="Event" className={`${inputCls} !py-2`}>
              {s.events.map((e) => (
                <option key={e.key} value={e.key}>
                  {shortLabel(e.name)}
                </option>
              ))}
            </select>
          )}
          <select
            value=""
            aria-label="Add an area"
            onChange={(e) => {
              if (!e.target.value) return;
              setAreas((as) => [...as, { label: e.target.value === 'Area' ? 'Area' : e.target.value, x: 50, y: 50, w: 18, h: 12 }]);
              setSel({ kind: 'area', i: areas.length });
              change();
            }}
            className={`${inputCls} !py-2`}
          >
            <option value="">+ Add area</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a === 'Area' ? 'Custom area' : a}
              </option>
            ))}
          </select>
          <select value={shape} onChange={(e) => setShape(e.target.value as 'round' | 'long')} aria-label="Table type" className={`${inputCls} !py-2`}>
            <option value="round">Round tables</option>
            <option value="long">Long banquet tables</option>
          </select>
          <Pill kind={adding ? 'outline' : 'secondary'} onClick={() => setAdding((a) => !a)}>
            {adding ? 'Done adding' : '+ Add tables'}
          </Pill>
          <Pill onClick={() => setSnap((x) => !x)}>{snap ? 'Snap: on' : 'Snap: off'}</Pill>
          <Pill onClick={lineUp} disabled={!tables.length}>
            Line up tables
          </Pill>
          <Pill onClick={autoSeat} disabled={!tables.length}>
            Auto-seat the rest
          </Pill>
          <Pill kind="primary" disabled={!dirty || busy} onClick={() => void save()}>
            {dirty ? 'Save seating' : 'Saved'}
          </Pill>
        </div>
      </header>
      <div className="text-[14px] text-[#5b6a52]">
        {adding ? 'Tap the plan to drop a table. Tap Done adding when finished.' : 'Drag tables and areas to arrange the room. Tap a table to see who sits there, then tap guests below to seat them.'}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div
          ref={plan}
          onClick={planClick}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          role="application"
          aria-label="Floor plan"
          className={`relative w-full rounded-[14px] border border-[#d3c6a4] overflow-hidden select-none touch-none ${adding ? 'cursor-crosshair' : ''}`}
          style={{ aspectRatio: s.aspect, background: '#fbf8f2', backgroundImage: 'radial-gradient(#e2d7bc 1px, transparent 1.2px)', backgroundSize: '18px 18px' }}
        >
          {areas.map((a, i) => (
            <div
              key={i}
              onPointerDown={down('area', i, a.x, a.y)}
              onClick={(e) => e.stopPropagation()}
              className="absolute flex items-center justify-center rounded-[6px] border border-dashed text-[12px] uppercase tracking-[.14em] text-[#7a7466] cursor-move"
              style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%`, transform: 'translate(-50%,-50%)', borderColor: sel?.kind === 'area' && sel.i === i ? '#33402f' : '#c6b794', background: '#f3ecd6' }}
            >
              {/entr/i.test(a.label) ? `↓ ${a.label}` : a.label}
            </div>
          ))}
          {tables.map((t) => {
            const n = byTable.get(t.id)?.length ?? 0;
            const on = selTable?.id === t.id;
            const long = t.shape === 'long';
            const vert = long && t.dir === 'v';
            return (
              <div
                key={t.id}
                onPointerDown={down('table', t.id, t.x, t.y)}
                onClick={(e) => e.stopPropagation()}
                role="button"
                aria-label={`Table ${t.name}, ${n} of ${t.seats}`}
                className="absolute flex flex-col items-center justify-center text-center cursor-move"
                style={{
                  left: `${t.x}%`,
                  top: `${t.y}%`,
                  transform: 'translate(-50%,-50%)',
                  width: long ? (vert ? '6%' : `${t.len}%`) : '9%',
                  height: long ? (vert ? `${t.len}%` : '8%') : 'auto',
                  aspectRatio: long ? undefined : '1',
                  borderRadius: long ? 6 : '50%',
                  background: on ? '#33402f' : n > t.seats ? '#f1e1d6' : '#fbf8f2',
                  color: on ? '#f3ecd6' : '#33402f',
                  border: `1px solid ${on ? '#b39563' : n >= t.seats ? '#5d6b47' : '#c6b794'}`,
                  boxShadow: '0 2px 6px rgba(51,64,47,.12)',
                }}
              >
                <span className="font-display text-[16px] leading-none">{t.name}</span>
                <span className="text-[10px] opacity-80">
                  {n}/{t.seats}
                </span>
              </div>
            );
          })}
          {!tables.length && !adding && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[15px] text-[#5b6a52]">No tables yet. Choose a table type and tap + Add tables.</div>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          {selArea && sel?.kind === 'area' && (
            <div className="flex flex-col gap-3 p-4 rounded-[14px] border border-[#e2d7bc]">
              <Label text="Area name">
                <input value={selArea.label} onChange={(e) => setArea(sel.i, { label: e.target.value })} className={inputCls} />
              </Label>
              <Label text={`Width · ${Math.round(selArea.w)}%`}>
                <input type="range" min={4} max={90} value={selArea.w} onChange={(e) => setArea(sel.i, { w: Number(e.target.value) })} />
              </Label>
              <Label text={`Depth · ${Math.round(selArea.h)}%`}>
                <input type="range" min={4} max={90} value={selArea.h} onChange={(e) => setArea(sel.i, { h: Number(e.target.value) })} />
              </Label>
              <Pill
                onClick={() => {
                  setAreas((as) => as.filter((_, j) => j !== sel.i));
                  setSel(null);
                  change();
                }}
              >
                Remove area
              </Pill>
            </div>
          )}

          {selTable && (
            <div className="flex flex-col gap-3 p-4 rounded-[14px] border border-[#e2d7bc]">
              <div className="grid grid-cols-2 gap-3">
                <Label text="Table name">
                  <input value={selTable.name} onChange={(e) => setTable(selTable.id, { name: e.target.value })} className={inputCls} />
                </Label>
                <Label text="Seats">
                  <input type="number" min={1} max={60} value={selTable.seats} onChange={(e) => setTable(selTable.id, { seats: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} className={inputCls} />
                </Label>
                <Label text="Type">
                  <select value={selTable.shape} onChange={(e) => setTable(selTable.id, { shape: e.target.value as 'round' | 'long' })} className={inputCls}>
                    <option value="round">Round</option>
                    <option value="long">Long banquet</option>
                  </select>
                </Label>
                {selTable.shape === 'long' && (
                  <Label text="Direction">
                    <select value={selTable.dir} onChange={(e) => setTable(selTable.id, { dir: e.target.value as 'h' | 'v' })} className={inputCls}>
                      <option value="h">Across</option>
                      <option value="v">Up and down</option>
                    </select>
                  </Label>
                )}
              </div>
              {selTable.shape === 'long' && (
                <Label text={`Length · ${selTable.len}%`}>
                  <input type="range" min={10} max={90} value={selTable.len} onChange={(e) => setTable(selTable.id, { len: Number(e.target.value) })} />
                </Label>
              )}
              <div className="flex flex-col">
                {(byTable.get(selTable.id) ?? []).map((p, i) => (
                  <div key={p.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] gap-2 items-center py-[6px] border-t border-[#ece3cc] text-[14px]">
                    <span className="text-[12px] text-[#7a7466]">{i + 1}</span>
                    <span>
                      {p.name}
                      {p.diet && <span className={`block text-[12px] ${isSerious(p.diet) ? 'text-[#7a4a37] font-semibold' : 'text-[#7a7466]'}`}>{p.diet}</span>}
                    </span>
                    <button type="button" aria-label={`Unseat ${p.name}`} onClick={() => seat([p.id], null)} className="w-[26px] h-[26px] rounded-full border border-[#d3c6a4] bg-transparent cursor-pointer">
                      ×
                    </button>
                  </div>
                ))}
                {!byTable.get(selTable.id)?.length && <div className="text-[13px] text-[#7a7466]">Nobody here yet. Tap guests below to seat them.</div>}
              </div>
              <Pill
                onClick={() => {
                  seat((byTable.get(selTable.id) ?? []).map((p) => p.id), null);
                  setTables((ts) => ts.filter((t) => t.id !== selTable.id));
                  setSel(null);
                }}
              >
                Remove table
              </Pill>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-baseline">
              <h2 className="m-0 font-display font-medium text-[24px]">Not seated</h2>
              <span className="text-[13px] text-[#5b6a52]">{s.people.length - seated}</span>
            </div>
            <div className="text-[13px] text-[#5b6a52]">{target ? `Tap a name to seat them at table ${selTable!.name}.` : 'Tap a table on the plan first, then tap names to seat them there.'}</div>
            {unseated.map((group) => (
              <div key={group[0]!.invitationId} className="flex flex-col gap-1 py-2 border-t border-[#ece3cc]">
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-[12px] text-[#7a7466]">{group[0]!.coming ? 'Coming' : 'Not replied yet'}</span>
                  {group.length > 1 && (
                    <button type="button" disabled={!target} onClick={() => seat(group.map((p) => p.id), target)} className="p-0 border-0 bg-transparent text-[12px] underline cursor-pointer disabled:opacity-40 disabled:cursor-default text-[#33402f]">
                      Seat together
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {group.map((p) => (
                    <button key={p.id} type="button" disabled={!target} onClick={() => seat([p.id], target)} className="py-[5px] px-3 rounded-full border border-[#c6b794] bg-[#fbf8f2] text-[13px] cursor-pointer disabled:cursor-default hover:enabled:bg-[#efe7d3] text-[#33402f]">
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!unseated.length && <div className="text-[14px] text-[#55633f]">Everyone has a seat.</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

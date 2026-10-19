import { clampTable, DEFAULT_SEATS, isSerious, seatSpots, SHAPE_LABEL, STRETCHES, TABLE_SHAPES, tableBox, type TableShape } from '@wp/shared';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, seatingApi, type SeatArea, type SeatTable, type SeatingData } from '../../lib/api';
import { downloadCsv, fileName } from '../../lib/csv';
import { fmtWhen, shortLabel } from '../../lib/format';
import { useAdmin } from '../Shell';
import { groupColour } from '../groups';
import { emptyHistory, history, type Snapshot } from './history';
import { Eyebrow, inputCls, Label, Pill, useToast } from '../ui';

/**
 * Admin → Seating (design: isSeating). Drag tables and areas on the floor plan; tap a table to see and
 * change who sits there; tap or drag guests onto tables. Six table shapes, each drawn with its chairs.
 * Undo/redo, zoom, capacity warnings, a caterer's table list and a printable plan. Nothing changes for
 * guests until Save; then each guest's night-before guide shows their table on the plan.
 */

type Sel = { kind: 'table'; id: string } | { kind: 'area'; i: number } | null;
type Drag = { kind: 'table' | 'area'; key: string | number; dx: number; dy: number; moved: boolean };
type Person = SeatingData['people'][number];
const AREAS = ['Dance floor', 'DJ', 'Bar', 'Entrance', 'Balcony', 'Fireplace', 'Cake table', 'Photo booth', 'Gift table', 'Area'];
const round1 = (n: number) => Math.round(n * 10) / 10;

export function Seating() {
  const { wid, overview, reload: reloadOverview } = useAdmin();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [s, setS] = useState<SeatingData | null>(null);
  const [{ doc, past, future, dirty }, dispatch] = useReducer(history, emptyHistory);
  const [sel, setSel] = useState<Sel>(null);
  const [adding, setAdding] = useState(false);
  const [shape, setShape] = useState<TableShape>('round');
  const [snap, setSnap] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [groupFilter, setGroupFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const { tables, areas, seats } = doc;

  const apply = (d: SeatingData) => {
    setS(d);
    dispatch({ type: 'reset', doc: { tables: d.tables, areas: d.areas, seats: Object.fromEntries(d.people.map((p) => [p.id, p.tableId])) } });
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

  /** Every change goes through here, so it can be undone. */
  const commit = useCallback((fn: (d: Snapshot) => Snapshot, record = true) => dispatch({ type: 'change', fn, record }), []);
  const checkpoint = useCallback(() => dispatch({ type: 'checkpoint' }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  // Keyboard: Ctrl/⌘+Z undo, Shift+Ctrl/⌘+Z or Ctrl+Y redo (not while typing in a box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Leaving with unsaved seating asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const byTable = useMemo(() => {
    const m = new Map<string, Person[]>();
    for (const p of s?.people ?? []) {
      const t = seats[p.id];
      if (t) m.set(t, [...(m.get(t) ?? []), p]);
    }
    return m;
  }, [s, seats]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!s) return <div aria-busy="true" className="text-[#5b6a52]">Loading the floor plan…</div>;

  const aspect = s.aspect;
  const snapTo = (n: number) => (snap ? Math.round(n / 2.5) * 2.5 : round1(n));
  const at = (e: { clientX: number; clientY: number }) => {
    const r = plan.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / (r.width || 1)) * 100, y: ((e.clientY - r.top) / (r.height || 1)) * 100 };
  };
  const nextName = () => String(Math.max(0, ...tables.map((t) => Number(t.name)).filter((n) => Number.isFinite(n))) + 1);
  const selTable = sel?.kind === 'table' ? tables.find((t) => t.id === sel.id) : undefined;
  const selArea = sel?.kind === 'area' ? areas[sel.i] : undefined;
  const setTable = (id: string, patch: Partial<SeatTable>, record = true) =>
    commit((d) => ({ ...d, tables: d.tables.map((t) => (t.id === id ? clampTable({ ...t, ...patch }, aspect) : t)) }), record);
  const setArea = (i: number, patch: Partial<SeatArea>, record = true) => commit((d) => ({ ...d, areas: d.areas.map((a, j) => (j === i ? { ...a, ...patch } : a)) }), record);
  const seat = (ids: string[], tableId: string | null) => commit((d) => ({ ...d, seats: { ...d.seats, ...Object.fromEntries(ids.map((id) => [id, tableId])) } }));

  /** A new shape: seats follow the shape's usual number unless they'd been changed by hand. */
  const reshape = (t: SeatTable, to: TableShape): Partial<SeatTable> => ({
    shape: to,
    seats: t.seats === DEFAULT_SEATS[t.shape as TableShape] ? DEFAULT_SEATS[to] : t.seats,
    len: STRETCHES(to) ? t.len || 40 : t.len,
  });
  const applyShapeToAll = () => {
    commit((d) => ({ ...d, tables: d.tables.map((t) => clampTable({ ...t, ...reshape(t, shape) }, aspect)) }));
    toast(`All tables are now ${SHAPE_LABEL[shape].toLowerCase()}`);
  };

  // ---------------------------------------------------------------- plan interactions
  const down = (kind: Drag['kind'], key: string | number, x: number, y: number) => (e: PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = at(e);
    drag.current = { kind, key, dx: p.x - x, dy: p.y - y, moved: false };
    setSel(kind === 'table' ? { kind, id: key as string } : { kind, i: key as number });
    if (kind === 'table') setShape(tables.find((t) => t.id === key)?.shape ?? shape);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) checkpoint(); // one undo step per drag, none for a tap
    d.moved = true;
    const p = at(e);
    const x = snapTo(p.x - d.dx);
    const y = snapTo(p.y - d.dy);
    if (d.kind === 'table') setTable(d.key as string, { x, y }, false);
    else setArea(d.key as number, { x: Math.min(98, Math.max(2, x)), y: Math.min(98, Math.max(2, y)) }, false);
  };
  const up = () => {
    drag.current = null;
  };
  const planClick = (e: MouseEvent) => {
    if (!adding) return setSel(null);
    const p = at(e);
    const t = clampTable({ id: crypto.randomUUID(), name: nextName(), shape, dir: 'h' as const, len: 40, x: snapTo(p.x), y: snapTo(p.y), seats: DEFAULT_SEATS[shape] }, aspect);
    commit((d) => ({ ...d, tables: [...d.tables, t] }));
    setSel({ kind: 'table', id: t.id });
  };
  const dropOn = (tableId: string) => (e: DragEvent) => {
    e.preventDefault();
    const ids = (e.dataTransfer.getData('text/x-guests') || '').split(',').filter(Boolean);
    if (ids.length) {
      seat(ids, tableId);
      setSel({ kind: 'table', id: tableId });
    }
  };
  const dragGuests = (ids: string[]) => (e: DragEvent) => {
    e.dataTransfer.setData('text/x-guests', ids.join(','));
    e.dataTransfer.effectAllowed = 'move';
  };

  // ---------------------------------------------------------------- whole-plan actions
  const save = async () => {
    setBusy(true);
    try {
      apply(await seatingApi.save(wid, s.version, { event: s.event.key, aspect, tables, areas, seats }));
      toast(s.published ? 'Saved as a draft. Publish when you want guests to see it.' : 'Saved. Publish when you want guests to see it.');
      void reloadOverview();
    } catch (e) {
      toast((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  };

  /** Guests' guides and the night-before text switch to the saved plan. Save first; publish again after changes. */
  const publish = async () => {
    setBusy(true);
    try {
      apply(await seatingApi.publish(wid, s.version, s.event.key));
      toast('Published. Every guest now sees their table.');
    } catch (e) {
      toast((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  };
  const unpublished = !s.published || s.published.changes > 0;

  /**
   * Seat everyone who said yes and has no seat yet: each invitation stays together, and each group
   * (e.g. "Alex's side") goes to tables that group already uses before starting new ones.
   */
  const autoSeat = () => {
    const free = new Map(tables.map((t) => [t.id, t.seats - (byTable.get(t.id)?.length ?? 0)]));
    const tableParties = new Map(tables.map((t) => [t.id, new Set((byTable.get(t.id) ?? []).map((p) => p.party).filter(Boolean))]));
    const invites = new Map<string, { party: string; ids: string[] }>();
    for (const p of s.people) {
      if (!p.coming || seats[p.id]) continue;
      const g = invites.get(p.invitationId) ?? { party: p.party, ids: [] };
      g.ids.push(p.id);
      invites.set(p.invitationId, g);
    }
    const ordered = [...invites.values()].sort((a, b) => a.party.localeCompare(b.party));
    const next = { ...seats };
    let n = 0;
    let left = 0;
    for (const { party, ids } of ordered) {
      const fits = (t: SeatTable) => (free.get(t.id) ?? 0) >= ids.length;
      // Prefer a table where this group already sits, then an empty one, then anywhere it fits.
      const whole =
        (party && tables.find((t) => fits(t) && tableParties.get(t.id)!.has(party))) ||
        tables.find((t) => fits(t) && tableParties.get(t.id)!.size === 0 && (free.get(t.id) ?? 0) === t.seats) ||
        tables.find(fits);
      if (whole && party) tableParties.get(whole.id)!.add(party);
      for (const id of ids) {
        const t = whole ?? tables.find((x) => (free.get(x.id) ?? 0) > 0);
        if (!t) {
          left++;
          continue;
        }
        next[id] = t.id;
        free.set(t.id, free.get(t.id)! - 1);
        n++;
      }
    }
    commit((d) => ({ ...d, seats: next }));
    const extra = Math.ceil(left / DEFAULT_SEATS[shape]);
    toast(left ? `Seated ${n}. ${left} still need a seat: about ${extra} more ${extra === 1 ? 'table' : 'tables'}.` : n ? `Seated ${n}. Check it, then Save.` : 'Everyone already has a seat.');
  };

  /** Even rows across the room. */
  const lineUp = () => {
    const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length * 1.4)));
    const rows = Math.ceil(sorted.length / cols);
    const pos = new Map(sorted.map((t, i) => [t.id, { x: round1(10 + ((i % cols) + 0.5) * (80 / cols)), y: round1(12 + (Math.floor(i / cols) + 0.5) * (76 / rows)) }]));
    commit((d) => ({ ...d, tables: d.tables.map((t) => clampTable({ ...t, ...pos.get(t.id) }, aspect)) }));
  };

  const slug = overview?.wedding.slug ?? 'wedding';
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const ordered = [...tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const exportList = () =>
    downloadCsv(fileName(slug, `${s.event.key}-tables`), [
      ['Table', 'Seat', 'Name', 'Dietary', 'Serious', 'Entrée', 'Main', 'Dessert'],
      ...ordered.flatMap((t) => (byTable.get(t.id) ?? []).map((p, i) => [t.name, i + 1, p.name, p.diet, isSerious(p.diet) ? 'Yes' : '', p.meal.e, p.meal.m, p.meal.d])),
      [],
      ['Table', 'Guests', 'Seats', 'Dietary needs', 'Serious', 'Special meals'],
      ...ordered.map((t) => {
        const ps = byTable.get(t.id) ?? [];
        return [t.name, ps.length, t.seats, ps.filter((p) => p.diet.trim()).length, ps.filter((p) => isSerious(p.diet)).length, ps.filter((p) => p.meal.e || p.meal.m || p.meal.d).length];
      }),
    ]);

  const seated = s.people.filter((p) => seats[p.id]).length;
  const comingUnseated = s.people.filter((p) => p.coming && !seats[p.id]).length;
  const seatedAwaiting = s.people.filter((p) => !p.coming && seats[p.id]).length;
  const over = tables.filter((t) => (byTable.get(t.id)?.length ?? 0) > t.seats);
  const groupNames = [...new Set(s.people.map((p) => p.party).filter(Boolean))].sort();
  const unseated = [...s.people.filter((p) => p.coming && !seats[p.id] && (!groupFilter || p.party === groupFilter)).reduce((m, p) => m.set(p.invitationId, [...(m.get(p.invitationId) ?? []), p]), new Map<string, Person[]>()).values()];
  const waiting = s.people.filter((p) => !p.coming);
  const target = selTable?.id ?? null;
  const seatCount = tables.reduce((n, t) => n + t.seats, 0);

  return (
    <div className="flex flex-col gap-4 seating-page">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <Eyebrow>Seating · {shortLabel(s.event.name).toLowerCase()}</Eyebrow>
          <h1 className="m-0 mt-[6px] font-display font-medium text-[40px] leading-[1.08]">
            {seated} of {s.people.length} seated
          </h1>
          <div className="mt-1 text-[14px] text-[#5b6a52]">
            {tables.length} {tables.length === 1 ? 'table' : 'tables'} · {seatCount} seats
            {comingUnseated ? <span className="text-[#7a4a37]"> · {comingUnseated} coming without a seat</span> : null}
            {seatedAwaiting ? <span className="text-[#5e5130]"> · {seatedAwaiting} seated still to reply</span> : null}
            {over.length ? <span className="text-[#7a4a37]"> · table {over.map((t) => t.name).join(', ')} over capacity</span> : null}
            {seatCount < s.people.length ? <span className="text-[#7a4a37]"> · {s.people.length - seatCount} more seats needed</span> : null}
          </div>
          <div role="status" className="mt-1 text-[14px]" style={{ color: unpublished ? '#7a4a37' : '#55633f' }}>
            {!s.published
              ? "Not published yet: guests don't see any seating until you publish."
              : s.published.changes
                ? `Published ${fmtWhen(s.published.at, tz)}. ${s.published.changes} saved ${s.published.changes === 1 ? 'change is' : 'changes are'} not live yet.`
                : `Published ${fmtWhen(s.published.at, tz)}. Guests see exactly this plan.`}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center print:hidden">
          {s.events.length > 1 && (
            <select value={s.event.key} onChange={(e) => setParams({ event: e.target.value })} aria-label="Event" className={`${inputCls} !py-2`}>
              {s.events.map((e) => (
                <option key={e.key} value={e.key}>
                  {shortLabel(e.name)}
                </option>
              ))}
            </select>
          )}
          <Pill onClick={undo} disabled={!past.length} aria-label="Undo">
            ↶ Undo
          </Pill>
          <Pill onClick={redo} disabled={!future.length} aria-label="Redo">
            ↷ Redo
          </Pill>
          <Pill kind={dirty ? 'primary' : 'secondary'} disabled={!dirty || busy} onClick={() => void save()}>
            {busy && dirty ? 'Saving…' : dirty ? 'Save seating' : 'Saved'}
          </Pill>
          <Pill kind={!dirty && unpublished ? 'primary' : 'secondary'} disabled={dirty || busy || !unpublished || !tables.length} onClick={() => void publish()} title={dirty ? 'Save first' : undefined}>
            {!s.published ? 'Publish to guests' : unpublished ? `Publish ${s.published.changes} ${s.published.changes === 1 ? 'change' : 'changes'}` : 'Published'}
          </Pill>
        </div>
      </header>

      <div className="flex gap-2 flex-wrap items-center print:hidden">
        <Label text={selTable ? `Table ${selTable.name} type` : 'Table type'} className="!flex-row items-center gap-2">
          <select
            value={selTable?.shape ?? shape}
            onChange={(e) => {
              const to = e.target.value as TableShape;
              setShape(to);
              if (selTable) setTable(selTable.id, reshape(selTable, to));
            }}
            className={`${inputCls} !py-2`}
          >
            {TABLE_SHAPES.map((x) => (
              <option key={x} value={x}>
                {SHAPE_LABEL[x]}
              </option>
            ))}
          </select>
        </Label>
        <Pill onClick={applyShapeToAll} disabled={!tables.length}>
          Make all tables this type
        </Pill>
        <Pill kind={adding ? 'outline' : 'secondary'} onClick={() => setAdding((a) => !a)}>
          {adding ? 'Done adding' : '+ Add tables'}
        </Pill>
        <select
          value=""
          aria-label="Add an area"
          onChange={(e) => {
            if (!e.target.value) return;
            commit((d) => ({ ...d, areas: [...d.areas, { label: e.target.value, x: 50, y: 50, w: 18, h: 12 }] }));
            setSel({ kind: 'area', i: areas.length });
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
        <Pill onClick={() => setSnap((x) => !x)}>{snap ? 'Snap: on' : 'Snap: off'}</Pill>
        <Pill onClick={lineUp} disabled={!tables.length}>
          Line up tables
        </Pill>
        <Pill onClick={autoSeat} disabled={!tables.length}>
          Auto-seat the rest
        </Pill>
        <span className="flex-1" />
        <Pill onClick={() => setZoom((z) => Math.max(1, round1(z - 0.25)))} disabled={zoom <= 1} aria-label="Zoom out">
          −
        </Pill>
        <span className="text-[13px] text-[#5b6a52] w-[42px] text-center">{Math.round(zoom * 100)}%</span>
        <Pill onClick={() => setZoom((z) => Math.min(3, round1(z + 0.25)))} disabled={zoom >= 3} aria-label="Zoom in">
          +
        </Pill>
        <Pill onClick={exportList} disabled={!tables.length}>
          Table list for the caterer
        </Pill>
        <Pill onClick={() => window.print()}>Print plan</Pill>
      </div>
      <div className="text-[14px] text-[#5b6a52] print:hidden">
        {adding
          ? 'Tap the plan to drop a table. Tap Done adding when finished.'
          : 'Drag tables and areas to arrange the room. Tap a table to see who sits there; tap or drag guests onto a table to seat them. Ctrl+Z undoes.'}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="overflow-auto rounded-[14px] border border-[#d3c6a4] print:overflow-visible print:border-0">
          <div
            ref={plan}
            onClick={planClick}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            role="application"
            aria-label="Floor plan"
            className={`relative select-none touch-none ${adding ? 'cursor-crosshair' : ''}`}
            style={{ width: `${zoom * 100}%`, aspectRatio: aspect.replace(/\s/g, ''), background: '#fbf8f2', backgroundImage: 'radial-gradient(#e2d7bc 1px, transparent 1.2px)', backgroundSize: '18px 18px' }}
          >
            {areas.map((a, i) => (
              <div
                key={i}
                onPointerDown={down('area', i, a.x, a.y)}
                onClick={(e) => e.stopPropagation()}
                className="absolute flex items-center justify-center rounded-[6px] border border-dashed text-[11px] uppercase tracking-[.14em] text-[#7a7466] cursor-move text-center"
                style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%`, transform: 'translate(-50%,-50%)', borderColor: sel?.kind === 'area' && sel.i === i ? '#33402f' : '#c6b794', background: '#f3ecd6' }}
              >
                {/entr/i.test(a.label) ? `↓ ${a.label}` : a.label}
              </div>
            ))}
            {tables.map((t) => (
              <TableShapeView
                key={t.id}
                t={t}
                aspect={aspect}
                people={byTable.get(t.id) ?? []}
                selected={selTable?.id === t.id}
                onPointerDown={down('table', t.id, t.x, t.y)}
                onDrop={dropOn(t.id)}
              />
            ))}
            {!tables.length && !adding && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[15px] text-[#5b6a52]">No tables yet. Choose a table type and tap + Add tables.</div>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-5 print:hidden">
          {selArea && sel?.kind === 'area' && (
            <div className="flex flex-col gap-3 p-4 rounded-[14px] border border-[#e2d7bc]">
              <Label text="Area name">
                <input value={selArea.label} onChange={(e) => setArea(sel.i, { label: e.target.value }, false)} onFocus={checkpoint} className={inputCls} />
              </Label>
              <Label text={`Width · ${Math.round(selArea.w)}%`}>
                <input type="range" min={4} max={90} value={selArea.w} onChange={(e) => setArea(sel.i, { w: Number(e.target.value) })} />
              </Label>
              <Label text={`Depth · ${Math.round(selArea.h)}%`}>
                <input type="range" min={4} max={90} value={selArea.h} onChange={(e) => setArea(sel.i, { h: Number(e.target.value) })} />
              </Label>
              <Pill
                onClick={() => {
                  commit((d) => ({ ...d, areas: d.areas.filter((_, j) => j !== sel.i) }));
                  setSel(null);
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
                  <input value={selTable.name} onChange={(e) => setTable(selTable.id, { name: e.target.value }, false)} onFocus={checkpoint} className={inputCls} />
                </Label>
                <Label text="Seats">
                  <input type="number" min={1} max={60} value={selTable.seats} onChange={(e) => setTable(selTable.id, { seats: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} className={inputCls} />
                </Label>
                <Label text="Type" className="col-span-2">
                  <select value={selTable.shape} onChange={(e) => setTable(selTable.id, reshape(selTable, e.target.value as TableShape))} className={inputCls}>
                    {TABLE_SHAPES.map((x) => (
                      <option key={x} value={x}>
                        {SHAPE_LABEL[x]}
                      </option>
                    ))}
                  </select>
                </Label>
                {(STRETCHES(selTable.shape) || selTable.shape === 'sweetheart') && (
                  <Label text="Direction" className="col-span-2">
                    <select value={selTable.dir} onChange={(e) => setTable(selTable.id, { dir: e.target.value as 'h' | 'v' })} className={inputCls}>
                      <option value="h">Across the room</option>
                      <option value="v">Up and down</option>
                    </select>
                  </Label>
                )}
              </div>
              {STRETCHES(selTable.shape) && (
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
                      {!p.coming && <span className="block text-[12px] text-[#5e5130]">Not replied yet</span>}
                    </span>
                    <button type="button" aria-label={`Unseat ${p.name}`} onClick={() => seat([p.id], null)} className="w-[26px] h-[26px] rounded-full border border-[#d3c6a4] bg-transparent cursor-pointer">
                      ×
                    </button>
                  </div>
                ))}
                {(byTable.get(selTable.id)?.length ?? 0) > selTable.seats && <div className="text-[13px] text-[#7a4a37]">More people than seats. Add seats or move someone.</div>}
                {!byTable.get(selTable.id)?.length && <div className="text-[13px] text-[#7a7466]">Nobody here yet. Tap or drag guests below to seat them.</div>}
              </div>
              <Pill
                onClick={() => {
                  const ids = (byTable.get(selTable.id) ?? []).map((p) => p.id);
                  commit((d) => ({ ...d, tables: d.tables.filter((t) => t.id !== selTable.id), seats: { ...d.seats, ...Object.fromEntries(ids.map((id) => [id, null])) } }));
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
              <span className="text-[13px] text-[#5b6a52]">{comingUnseated}</span>
            </div>
            {groupNames.length > 0 && (
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Show group" className={`${inputCls} !py-[6px] !text-[13px]`}>
                <option value="">All groups</option>
                {groupNames.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
            <div className="text-[13px] text-[#5b6a52]">{target ? `Tap a name to seat them at table ${selTable!.name}, or drag names onto any table.` : 'Drag names onto a table, or tap a table first and then tap names.'}</div>
            {unseated.map((group) => (
              <div key={group[0]!.invitationId} className="flex flex-col gap-1 py-2 border-t border-[#ece3cc]">
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-[12px] text-[#7a7466]">{group[0]!.coming ? 'Coming' : 'Not replied yet'}</span>
                  {group.length > 1 && (
                    <button
                      type="button"
                      draggable
                      onDragStart={dragGuests(group.map((p) => p.id))}
                      disabled={!target}
                      onClick={() => seat(group.map((p) => p.id), target)}
                      className="p-0 border-0 bg-transparent text-[12px] underline cursor-pointer disabled:opacity-60 text-[#33402f]"
                    >
                      Seat together
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {group.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      draggable
                      onDragStart={dragGuests([p.id])}
                      onClick={() => (target ? seat([p.id], target) : toast('Tap a table first, or drag the name onto one'))}
                      title={p.party || undefined}
                      style={{ boxShadow: p.party ? `inset 4px 0 0 ${groupColour(p.party)}` : undefined }}
                      className="py-[5px] px-3 rounded-full border border-[#c6b794] bg-[#fbf8f2] text-[13px] cursor-grab hover:bg-[#efe7d3] text-[#33402f]"
                    >
                      {p.name}
                      {isSerious(p.diet) && <span className="ml-1 text-[#7a4a37]">●</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!unseated.length && <div className="text-[14px] text-[#55633f]">Everyone who said yes has a seat.</div>}
            {waiting.length > 0 && (
              <div className="flex flex-col gap-1 pt-3 mt-1 border-t border-[#e2d7bc]">
                <span className="text-[13px] font-semibold text-[#5e5130]">Waiting for a reply ({waiting.length})</span>
                <span className="text-[12px] text-[#7a7466]">They can have a table once they say yes.</span>
                <div className="flex gap-1 flex-wrap">
                  {waiting.map((p) => (
                    <span key={p.id} className="py-[3px] px-2 rounded-full border border-dashed border-[#d3c6a4] text-[12px] text-[#7a7466]">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Printed with the plan: who sits at each table. */}
      <section className="hidden print:block">
        <h2 className="font-display text-[22px]">Tables</h2>
        <div className="columns-3 gap-6 text-[12px]">
          {ordered.map((t) => (
            <div key={t.id} className="break-inside-avoid mb-3">
              <strong>
                Table {t.name} · {byTable.get(t.id)?.length ?? 0}/{t.seats}
              </strong>
              {(byTable.get(t.id) ?? []).map((p) => (
                <div key={p.id}>
                  {p.name}
                  {p.diet ? ` (${p.diet})` : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** One table, drawn in its shape with its chairs; filled chairs are taken, a red mark means a serious allergy here. */
function TableShapeView({
  t,
  aspect,
  people,
  selected,
  onPointerDown,
  onDrop,
}: {
  t: SeatTable;
  aspect: string;
  people: Person[];
  selected: boolean;
  onPointerDown: (e: PointerEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const box = tableBox(t, aspect);
  const n = people.length;
  const full = n >= t.seats;
  const over = n > t.seats;
  const allergy = people.some((p) => isSerious(p.diet));
  const spots = seatSpots(t, t.seats);
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        setHover(false);
        onDrop(e);
      }}
      role="button"
      aria-label={`Table ${t.name}, ${n} of ${t.seats}`}
      className="absolute cursor-move"
      style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${box.w}%`, height: `${box.h}%`, transform: 'translate(-50%,-50%)' }}
    >
      {spots.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: 9,
            height: 9,
            transform: 'translate(-50%,-50%)',
            background: i < n ? (people[i]!.party ? groupColour(people[i]!.party) : selected ? '#b39563' : '#5d6b47') : '#fbf8f2',
            border: `1px solid ${i < n ? 'transparent' : '#c6b794'}`,
          }}
        />
      ))}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center overflow-hidden"
        style={{
          borderRadius: box.radius,
          background: selected ? '#33402f' : hover ? '#dfe5cc' : over ? '#f1e1d6' : '#fbf8f2',
          color: selected ? '#f3ecd6' : '#33402f',
          border: `1px solid ${selected ? '#b39563' : over ? '#7a4a37' : full ? '#5d6b47' : '#c6b794'}`,
          boxShadow: '0 2px 6px rgba(51,64,47,.12)',
        }}
      >
        <span className="font-display text-[15px] leading-none whitespace-nowrap">{t.name}</span>
        <span className="text-[10px] opacity-80 leading-tight">
          {n}/{t.seats}
        </span>
      </div>
      {allergy && (
        <span title="Serious allergy at this table" className="absolute -top-[6px] -right-[6px] w-[14px] h-[14px] rounded-full bg-[#7a4a37] text-[#fbf8f2] text-[10px] leading-[14px] text-center font-bold">
          !
        </span>
      )}
    </div>
  );
}

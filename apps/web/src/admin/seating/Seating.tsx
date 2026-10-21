import { aspectRatio, autoSeat as autoSeatPlan, clampTable, cssAspect, ROOM_SHAPES, ROOM_SIZES, roomAspect, roomScale, roomShape, DEFAULT_SEATS, isSerious, seatSpots, SHAPE_LABEL, STRETCHES, TABLE_SHAPES, tableBox, type TableShape } from '@wp/shared';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { ApiError, seatingApi, type SeatArea, type SeatTable, type SeatingData } from '../../lib/api';
import { fileName } from '../../lib/csv';
import { downloadDressed } from '../exportLook';
import { fmtWhen } from '../../lib/format';
import { useUnsavedChanges } from '../leave';
import { ALL_EVENTS, useAdmin } from '../Shell';
import { groupColour } from '../groups';
import { emptyHistory, history, type Snapshot } from './history';
import { SeatChecks, useSeatRules } from './SeatChecks';
import { Gate } from '../Upgrade';
import { Eyebrow, inputCls, Label, Pill, useMedia, useToast } from '../ui';

/**
 * Admin → Seating (design: isSeating). Drag tables and areas on the floor plan; tap a table to see and
 * change who sits there; tap or drag guests onto tables. Six table shapes, each drawn with its chairs.
 * Undo/redo, zoom, capacity warnings, a caterer's table list and a printable plan. Nothing changes for
 * guests until Save; then each guest's night-before guide shows their table on the plan.
 * Versions: name the saved plan ("Family draft", "Final"), look back at any version, and nominate one as
 * the current arrangement.
 */

type Sel = { kind: 'table'; id: string } | { kind: 'area'; i: number } | null;
type Drag = { kind: 'table' | 'area'; key: string | number; dx: number; dy: number; moved: boolean };
type Person = SeatingData['people'][number];
const AREAS = ['Dance floor', 'DJ', 'Bar', 'Entrance', 'Balcony', 'Fireplace', 'Cake table', 'Photo booth', 'Gift table', 'Area'];
const round1 = (n: number) => Math.round(n * 10) / 10;
/** How far (px) a press can wander and still be a tap, and how long a finger holds before a drag starts. */
const SLOP = 8;
const HOLD_MS = 350;
/** Phones: anything you tap is at least this big (px), even a table in a huge room. */
const TAP = 40;

/** Seating comes with Essentials (older weddings and the platform's own have it). */
export function Seating() {
  return (
    <Gate feature="seating">
      <SeatingPlan />
    </Gate>
  );
}

function SeatingPlan() {
  const { wid, overview, reload: reloadOverview, event: chosen } = useAdmin();
  const toast = useToast();
  const [params] = useSearchParams();
  const [s, setS] = useState<SeatingData | null>(null);
  const [{ doc, past, future, dirty }, dispatch] = useReducer(history, emptyHistory);
  const [sel, setSel] = useState<Sel>(null);
  const [adding, setAdding] = useState(false);
  const [shape, setShape] = useState<TableShape>('round');
  const [snap, setSnap] = useState(true);
  const [zoom, setZoom] = useState(1);
  const mob = useMedia('(max-width: 759px)');
  // Looking at the plan by default; Edit seating opens every tool (and nothing changes outside it).
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  editingRef.current = editing;
  const roomTools = editing;
  const [groupFilter, setGroupFilter] = useState('');
  // Find a guest by name: where they're sitting, or seat them.
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Versions: the panel, and the version being looked at (the plan shows it, read-only, until Back).
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null);
  const plan = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // A finger on a table or area that isn't selected: a hold picks it up, a swipe scrolls the plan.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  // What a finger has picked up (after a hold), drawn lifted.
  const [lifted, setLifted] = useState<string | number | null>(null);
  const guestDrag = useGuestDrag();
  // The room's shape and size are part of the plan (and its undo history), saved with it.
  const { aspect, tables, areas, seats } = doc;

  const apply = (d: SeatingData) => {
    setS(d);
    setViewing(null);
    dispatch({ type: 'reset', doc: { aspect: d.aspect, tables: d.tables, areas: d.areas, seats: Object.fromEntries(d.people.map((p) => [p.id, p.tableId])) } });
  };
  const load = useCallback(async () => {
    try {
      apply(await seatingApi.get(wid, params.get('event') ?? (chosen && chosen !== ALL_EVENTS ? chosen : undefined))); // the sidebar's event unless a link names one
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid, params, chosen]);
  useEffect(() => void load(), [load]);

  /** Every change goes through here, so it can be undone. */
  const commit = useCallback((fn: (d: Snapshot) => Snapshot, record = true) => {
    if (editingRef.current) dispatch({ type: 'change', fn, record });
  }, []);
  const checkpoint = useCallback(() => {
    if (editingRef.current) dispatch({ type: 'checkpoint' });
  }, []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  // Keyboard: Ctrl/⌘+Z undo, Shift+Ctrl/⌘+Z or Ctrl+Y redo (not while typing in a box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editingRef.current || (e.target as HTMLElement).closest('input, textarea, select')) return;
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

  // Once a finger has picked up a table, an area or a name, the page mustn't scroll under it. Tables and
  // names allow scrolling (so a swipe over them scrolls), so the browser has to be told no here; this
  // listener must not be passive for preventDefault to count.
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if ((drag.current || guestDrag.active.current) && e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.removeEventListener('touchmove', block);
      if (press.current) window.clearTimeout(press.current.timer);
    };
  }, [guestDrag.active]);

  // Printing (the Print floor plan button, or the browser's own Print) prints only the paper floor plan
  // and table list, not the admin around it.
  useEffect(() => {
    const on = () => document.documentElement.classList.add('seat-printing');
    const off = () => document.documentElement.classList.remove('seat-printing');
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      off();
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);

  // Leaving with unsaved seating asks first: the menu, links, Back, or closing the page.
  const changed = dirty;
  useUnsavedChanges(changed, 'You have seating changes that are not saved. Leave without saving them?');

  const byTable = useMemo(() => {
    const m = new Map<string, Person[]>();
    for (const p of s?.people ?? []) {
      const t = seats[p.id];
      if (t) m.set(t, [...(m.get(t) ?? []), p]);
    }
    return m;
  }, [s, seats]);
  const seatRules = useSeatRules(s?.event.key);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!s) return <div aria-busy="true" className="text-[#5b6a52]">Loading the floor plan…</div>;

  /** A new room shape or size: tables keep their places, and stay inside the room. One undo step puts back both. */
  const setRoomTo = (next: string) => commit((d) => ({ ...d, aspect: next, tables: d.tables.map((t) => clampTable(t, next)) }));
  const snapTo = (n: number) => (snap ? Math.round(n / 2.5) * 2.5 : round1(n));
  const at = (e: { clientX: number; clientY: number }) => {
    const r = plan.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / (r.width || 1)) * 100, y: ((e.clientY - r.top) / (r.height || 1)) * 100 };
  };
  const nextName = () => String(Math.max(0, ...tables.map((t) => Number(t.name)).filter((n) => Number.isFinite(n))) + 1);
  const selTable = sel?.kind === 'table' ? tables.find((t) => t.id === sel.id) : undefined;
  const selArea = sel?.kind === 'area' ? areas[sel.i] : undefined;
  const setTable = (id: string, patch: Partial<SeatTable>, record = true) =>
    commit((d) => ({ ...d, tables: d.tables.map((t) => (t.id === id ? clampTable({ ...t, ...patch }, d.aspect) : t)) }), record);
  const setArea = (i: number, patch: Partial<SeatArea>, record = true) => commit((d) => ({ ...d, areas: d.areas.map((a, j) => (j === i ? { ...a, ...patch } : a)) }), record);
  const seat = (ids: string[], tableId: string | null) => commit((d) => ({ ...d, seats: { ...d.seats, ...Object.fromEntries(ids.map((id) => [id, tableId])) } }));

  /** A new shape: seats follow the shape's usual number unless they'd been changed by hand. */
  const reshape = (t: SeatTable, to: TableShape): Partial<SeatTable> => ({
    shape: to,
    seats: t.seats === DEFAULT_SEATS[t.shape as TableShape] ? DEFAULT_SEATS[to] : t.seats,
    len: STRETCHES(to) ? t.len || 40 : t.len,
  });
  const applyShapeToAll = () => {
    commit((d) => ({ ...d, tables: d.tables.map((t) => clampTable({ ...t, ...reshape(t, shape) }, d.aspect)) }));
    toast(`All tables are now ${SHAPE_LABEL[shape].toLowerCase()}`);
  };

  // ---------------------------------------------------------------- plan interactions
  const select = (kind: Drag['kind'], key: string | number) => {
    setSel(kind === 'table' ? { kind, id: key as string } : { kind, i: key as number });
    if (kind === 'table') setShape(tables.find((t) => t.id === key)?.shape ?? shape);
  };
  const isSelected = (kind: Drag['kind'], key: string | number) => (kind === 'table' ? sel?.kind === 'table' && sel.id === key : sel?.kind === 'area' && sel.i === key);
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  /**
   * Pressing a table or area. Looking (not editing): nothing here; a tap opens the table (onClick) and a
   * swipe scrolls the plan. Editing with a mouse, or a finger on the selected table: it moves at once.
   * Editing with a finger on anything else: a swipe still scrolls, and holding still for a moment picks it up.
   */
  const down = (kind: Drag['kind'], key: string | number, x: number, y: number) => (e: PointerEvent) => {
    e.stopPropagation();
    if (!editingRef.current) return;
    const grab = (clientX: number, clientY: number) => {
      const p = at({ clientX, clientY });
      drag.current = { kind, key, dx: p.x - x, dy: p.y - y, moved: false };
      select(kind, key);
    };
    cancelPress();
    if (e.pointerType === 'touch' && !isSelected(kind, key)) {
      const { clientX, clientY } = e;
      press.current = {
        x: clientX,
        y: clientY,
        timer: window.setTimeout(() => {
          press.current = null;
          grab(clientX, clientY);
          setLifted(key);
          navigator.vibrate?.(8);
        }, HOLD_MS),
      };
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    grab(e.clientX, e.clientY);
  };
  const move = (e: PointerEvent) => {
    // Moved before the hold finished: it's a swipe (the browser scrolls the plan), not a pick-up.
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > SLOP) cancelPress();
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
    cancelPress();
    drag.current = null;
    setLifted(null);
  };
  /** A tap on a table (mouse or finger, looking or editing) opens it; a tap on an area selects it while editing. */
  const tap = (kind: Drag['kind'], key: string | number) => (e: MouseEvent) => {
    e.stopPropagation();
    if (kind === 'table' || editingRef.current) select(kind, key);
  };
  const planClick = (e: MouseEvent) => {
    if (!adding) return setSel(null);
    const p = at(e);
    const t = clampTable({ id: crypto.randomUUID(), name: nextName(), shape, dir: 'h' as const, len: 40, x: snapTo(p.x), y: snapTo(p.y), seats: DEFAULT_SEATS[shape] }, aspect);
    commit((d) => ({ ...d, tables: [...d.tables, t] }));
    setSel({ kind: 'table', id: t.id });
  };
  /**
   * Drag names onto a table (mouse or finger). From "Not seated" the table they land on opens; from a
   * table's list (`from`) that table stays open, so you can keep moving people off it.
   */
  const dragGuests = (people: Person[], from: string | null = null) =>
    editing
      ? guestDrag.start({ ids: people.map((p) => p.id), label: people.length > 1 ? people.map((p) => p.name.split(' ')[0]).join(', ') : (people[0]?.name ?? ''), from }, (ids, to) => {
          seat(ids, to);
          if (!from) setSel({ kind: 'table', id: to });
        })
      : undefined;

  // ---------------------------------------------------------------- whole-plan actions
  const save = async () => {
    setBusy(true);
    try {
      apply(await seatingApi.save(wid, s.version, { event: s.event.key, aspect, tables, areas, seats }));
      toast(s.published ? 'Saved as a draft. Publish when you want guests to see it.' : 'Saved. Publish when you want guests to see it.');
      void reloadOverview();
    } catch (e) {
      // Never throw away the plan you're working on. Someone else saved meanwhile (409): your plan stays
      // here on top of theirs, to save again. Someone said no meanwhile (400): they come off the plan and
      // it's saved.
      if (e instanceof ApiError && (e.status === 409 || (e.status === 400 && /no longer coming|said yes/i.test(e.message)))) {
        try {
          const fresh = await seatingApi.get(wid, s.event.key);
          const coming = new Map(fresh.people.map((p) => [p.id, p.coming]));
          const gone = s.people.filter((p) => seats[p.id] && !coming.get(p.id)).map((p) => p.name);
          const kept = Object.fromEntries(Object.entries(seats).filter(([id]) => coming.has(id)).map(([id, t]) => [id, coming.get(id) ? t : null]));
          if (e.status === 409) {
            setS(fresh);
            dispatch({ type: 'change', fn: (d) => ({ ...d, seats: kept }), record: false });
            toast(`Someone else saved the seating while you were working. Your plan is still here: Save again to keep it (it replaces theirs)${gone.length ? `. ${gone.join(', ')} said no, so they're off it` : ''}.`);
          } else {
            apply(await seatingApi.save(wid, fresh.version, { event: s.event.key, aspect, tables, areas, seats: kept }));
            toast(`Saved. ${gone.join(', ') || 'Someone'} said no since, so they’re off the plan.`);
            void reloadOverview();
          }
        } catch (again) {
          toast((again as Error).message);
        }
      } else toast((e as Error).message);
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

  // ---------------------------------------------------------------- versions
  const versions = s.versions ?? [];
  const run = async (fn: () => Promise<SeatingData | void>, done?: string) => {
    setBusy(true);
    try {
      const d = await fn();
      if (d) apply(d);
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  };
  /** Name the plan as it is now (unsaved changes are saved first); it becomes the current arrangement. */
  const saveVersion = (name: string) =>
    run(async () => {
      if (changed) apply(await seatingApi.save(wid, s.version, { event: s.event.key, aspect, tables, areas, seats }));
      return seatingApi.saveVersion(wid, s.event.key, name);
    }, `Saved “${name}”. It's now the current arrangement.`);
  /** Show a version on the plan to look at; nothing changes until Make current. */
  const viewVersion = (id: string) => {
    if (changed && !window.confirm('Look at this version? Your unsaved seating changes will be lost (Save first to keep them).')) return;
    setEditing(false);
    return run(async () => {
      const v = await seatingApi.version(wid, id);
      const known = new Set(v.tables.map((t) => t.id));
      dispatch({ type: 'reset', doc: { aspect: v.aspect || s.aspect, tables: v.tables, areas: v.areas, seats: Object.fromEntries(s.people.map((p) => [p.id, known.has(v.seats[p.id] ?? '') ? v.seats[p.id]! : null])) } });
      setS({ ...s, aspect: v.aspect || s.aspect });
      setViewing({ id: v.id, name: v.name });
      setSel(null);
      setAdding(false);
    });
  };
  const backToCurrent = () => void run(() => seatingApi.get(wid, s.event.key));
  const makeCurrent = (id: string, name: string) => {
    const unnamed = s.current ? s.current.changes : seated;
    if (unnamed && !window.confirm(`Make “${name}” the current arrangement? The plan as it is now${s.current ? ` (${s.current.changes} ${s.current.changes === 1 ? 'change' : 'changes'} since “${s.current.name}”)` : ''} isn't saved as a version, so save it as one first if you want to keep it.`)) return;
    void run(async () => {
      // Anything unsaved is set aside, not mixed in.
      const fresh = dirty && !viewing ? await seatingApi.get(wid, s.event.key) : s;
      return seatingApi.makeCurrent(wid, fresh.version, id);
    }, `“${name}” is now the current arrangement.${s.published ? ' Publish when you want guests to see it.' : ''}`);
  };
  const renameVersion = (id: string, was: string) => {
    const name = window.prompt('Rename this version', was)?.trim();
    if (name && name !== was) void run(() => seatingApi.renameVersion(wid, id, name.slice(0, 60)));
  };
  const deleteVersion = (id: string, name: string) => {
    if (window.confirm(`Delete the version “${name}”? The seating plan itself doesn't change.`)) void run(() => seatingApi.deleteVersion(wid, id), `Deleted “${name}”.`);
  };

  /**
   * Seat everyone who said yes and has no seat yet, following the rules (Rules and checks): invitations
   * and "with" pairs at one table, nobody beside someone they're kept apart from, the wedding party at
   * the head table, groups at the tables they already use.
   */
  const autoSeat = () => {
    const r = autoSeatPlan(s.people, tables, seats, seatRules.rules);
    commit((d) => ({ ...d, seats: r.seats }));
    const extra = Math.ceil(r.left / DEFAULT_SEATS[shape]);
    const more = r.left ? ` About ${extra} more ${extra === 1 ? 'table' : 'tables'} would seat everyone.` : '';
    const said = r.notes.filter((n) => !/still needs? a seat/.test(n));
    toast(
      r.seated || r.left
        ? `Seated ${r.seated}.${r.left ? ` ${r.left} still ${r.left === 1 ? 'needs' : 'need'} a seat.${more}` : ' Check it, then Save.'}${said.length ? ` ${said.join(' ')}` : ''}`
        : 'Everyone already has a seat.',
    );
  };

  /** Even rows across the room. */
  /** Number the tables 1, 2, 3… across the room, row by row (head and sweetheart tables keep their names). */
  const renumber = () => {
    const rest = tables.filter((t) => t.shape !== 'head' && t.shape !== 'sweetheart');
    const order = [...rest].sort((a, b) => Math.round(a.y / 8) - Math.round(b.y / 8) || a.x - b.x);
    const name = new Map(order.map((t, i) => [t.id, String(i + 1)]));
    commit((d) => ({ ...d, tables: d.tables.map((t) => (name.has(t.id) ? { ...t, name: name.get(t.id)! } : t)) }));
    toast(`Tables numbered 1 to ${order.length}, row by row. Save to keep it.`);
  };
  // The guests to seat: the couple's expected number (Account → Overview), or more if more have said yes.
  const planFor = Math.max(overview?.expectedGuests ?? 0, s.people.filter((p) => p.coming).length);
  const seatsNow = tables.reduce((n, t) => n + t.seats, 0);
  const tablesShort = planFor > seatsNow ? Math.ceil((planFor - seatsNow) / DEFAULT_SEATS[shape]) : 0;
  /** Enough tables of the chosen type for everyone expected, set out in rows (any already there stay). */
  const setOutTables = () => {
    let next = Math.max(0, ...tables.map((t) => Number(t.name)).filter((n) => Number.isFinite(n)));
    const fresh = Array.from({ length: tablesShort }, () => ({ id: crypto.randomUUID(), name: String(++next), shape, dir: 'h' as const, len: 40, x: 50, y: 50, seats: DEFAULT_SEATS[shape] }));
    const all = [...tables, ...fresh];
    const cols = Math.max(1, Math.ceil(Math.sqrt(all.length * 1.4)));
    const rows = Math.ceil(all.length / cols);
    const pos = new Map(all.map((t, i) => [t.id, { x: round1(10 + ((i % cols) + 0.5) * (80 / cols)), y: round1(12 + (Math.floor(i / cols) + 0.5) * (76 / rows)) }]));
    commit((d) => ({ ...d, tables: [...d.tables, ...fresh].map((t) => clampTable({ ...t, ...pos.get(t.id) }, d.aspect)) }));
    toast(`${fresh.length} ${fresh.length === 1 ? 'table' : 'tables'} added for about ${planFor} guests. Move them where you like, then Save.`);
  };
  const lineUp = () => {
    const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length * 1.4)));
    const rows = Math.ceil(sorted.length / cols);
    const pos = new Map(sorted.map((t, i) => [t.id, { x: round1(10 + ((i % cols) + 0.5) * (80 / cols)), y: round1(12 + (Math.floor(i / cols) + 0.5) * (76 / rows)) }]));
    commit((d) => ({ ...d, tables: d.tables.map((t) => clampTable({ ...t, ...pos.get(t.id) }, d.aspect)) }));
  };

  const slug = overview?.wedding.slug ?? 'wedding';
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const ordered = [...tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const exportList = () =>
    void downloadDressed(wid, overview, fileName(slug, `${s.event.key}-tables`, 'xlsx'), 'Seating plan', [
      { name: 'Seats', rows: [
      ['Table', 'Seat', 'Name', 'Dietary', 'Serious', 'Entrée', 'Main', 'Dessert'],
      ...ordered.flatMap((t) => (byTable.get(t.id) ?? []).map((p, i) => [t.name, i + 1, p.name, p.diet, isSerious(p.diet) ? 'Yes' : '', p.meal.e, p.meal.m, p.meal.d])),
      ] },
      { name: 'Tables', rows: [
      ['Table', 'Guests', 'Seats', 'Dietary needs', 'Serious', 'Special meals'],
      ...ordered.map((t) => {
        const ps = byTable.get(t.id) ?? [];
        return [t.name, ps.length, t.seats, ps.filter((p) => p.diet.trim()).length, ps.filter((p) => isSerious(p.diet)).length, ps.filter((p) => p.meal.e || p.meal.m || p.meal.d).length];
      }),
      ] },
    ], [s.event.key]);

  const seated = s.people.filter((p) => seats[p.id]).length;
  const comingUnseated = s.people.filter((p) => p.coming && !seats[p.id]).length;
  const seatedAwaiting = s.people.filter((p) => !p.coming && seats[p.id]).length;
  const over = tables.filter((t) => (byTable.get(t.id)?.length ?? 0) > t.seats);
  const groupNames = [...new Set(s.people.map((p) => p.party).filter(Boolean))].sort();
  const unseated = [...s.people.filter((p) => p.coming && !seats[p.id] && (!groupFilter || p.party === groupFilter)).reduce((m, p) => m.set(p.invitationId, [...(m.get(p.invitationId) ?? []), p]), new Map<string, Person[]>()).values()];
  const waiting = s.people.filter((p) => !p.coming);
  const target = selTable?.id ?? null;
  const seatCount = tables.reduce((n, t) => n + t.seats, 0);
  // For the top of the printed plan: the couple, the event and its date.
  const ev = overview?.events.find((e) => e.key === s.event.key);
  const couple = [overview?.wedding.name1, overview?.wedding.name2].map((n) => n?.trim().split(' ')[0] ?? '').filter(Boolean).join(' & ');
  const when = ev?.startsAt ? new Date(ev.startsAt).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }) : '';
  const tapTarget = (on: boolean): CSSProperties | undefined => (on ? { minWidth: TAP, minHeight: TAP } : undefined);

  return (
    <div className="flex flex-col gap-4 seating-page print:hidden">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <Eyebrow>{s.event.name} · Seating</Eyebrow>
          <h1 className="m-0 mt-[6px] font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">
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
          {editing && (
            <>
              <Pill onClick={undo} disabled={!past.length} aria-label="Undo">
                ↶ Undo
              </Pill>
              <Pill onClick={redo} disabled={!future.length} aria-label="Redo">
                ↷ Redo
              </Pill>
            </>
          )}
          <Pill kind={versionsOpen ? 'outline' : 'secondary'} aria-expanded={versionsOpen} onClick={() => setVersionsOpen((x) => !x)}>
            Versions{versions.length ? ` (${versions.length})` : ''}
          </Pill>
          <Pill kind={changed && !viewing ? 'primary' : 'secondary'} disabled={!changed || busy || !!viewing} onClick={() => void save()}>
            {busy && changed ? 'Saving…' : changed ? 'Save seating' : 'Saved'}
          </Pill>
          <Pill kind={!changed && unpublished ? 'primary' : 'secondary'} disabled={changed || busy || !unpublished || !tables.length || !!viewing} onClick={() => void publish()} title={changed ? 'Save first' : undefined}>
            {!s.published ? 'Publish to guests' : unpublished ? `Publish ${s.published.changes} ${s.published.changes === 1 ? 'change' : 'changes'}` : 'Published'}
          </Pill>
        </div>
      </header>

      {viewing && (
        <div role="status" className="flex flex-wrap items-center gap-3 p-3 rounded-[12px] bg-[#f3ecd9] border border-[#d3c6a4] print:hidden">
          <span className="flex-1 min-w-[200px] text-[14px]">
            Looking at the version <strong className="font-semibold">“{viewing.name}”</strong>. Nothing has changed: make it current to use it, or go back.
          </span>
          <Pill kind="primary" disabled={busy} onClick={() => makeCurrent(viewing.id, viewing.name)}>
            Make this current
          </Pill>
          <Pill disabled={busy} onClick={backToCurrent}>
            Back to the current plan
          </Pill>
        </div>
      )}
      {versionsOpen && (
        <VersionsPanel
          versions={versions}
          current={s.current ?? null}
          viewing={viewing?.id ?? null}
          busy={busy}
          dirty={changed && !viewing}
          tz={tz}
          onSave={(name) => void saveVersion(name)}
          onView={(id) => void viewVersion(id)}
          onCurrent={makeCurrent}
          onRename={renameVersion}
          onDelete={deleteVersion}
        />
      )}

      <div className="flex gap-2 flex-wrap items-center print:hidden">
        <Pill
          kind={editing ? 'outline' : 'primary'}
          aria-pressed={editing}
          disabled={!!viewing}
          onClick={() => {
            setEditing((x) => !x);
            setAdding(false);
          }}
        >
          {editing ? 'Done editing' : 'Edit seating'}
        </Pill>
        {roomTools && (
          <>
        <Label text="Room" className="!flex-row items-center gap-2">
          <select aria-label="Room shape" value={roomShape(aspect)} onChange={(e) => setRoomTo(roomAspect(e.target.value, roomScale(aspect)))} className={`${inputCls} !py-2`}>
            {ROOM_SHAPES.map((x) => (
              <option key={x.aspect} value={x.aspect}>
                {x.label}
              </option>
            ))}
            {!ROOM_SHAPES.some((x) => x.aspect === roomShape(aspect)) && <option value={roomShape(aspect)}>{roomShape(aspect)}</option>}
          </select>
          <select aria-label="Room size" value={String(roomScale(aspect))} onChange={(e) => setRoomTo(roomAspect(aspect, Number(e.target.value)))} className={`${inputCls} !py-2`}>
            {ROOM_SIZES.map((x) => (
              <option key={x.scale} value={String(x.scale)}>
                {x.label}
              </option>
            ))}
          </select>
        </Label>
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
        {tablesShort > 0 && (
          <Pill kind="primary" onClick={setOutTables}>
            Set out {tablesShort} {tablesShort === 1 ? 'table' : 'tables'} for about {planFor} guests
          </Pill>
        )}
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
        <Pill onClick={renumber} disabled={tables.length < 2}>
          Number tables 1, 2, 3…
        </Pill>
          </>
        )}
        {editing && (
          <Pill onClick={autoSeat} disabled={!tables.length}>
            Auto-seat the rest
          </Pill>
        )}
        <span className="flex-1" />
        <Pill onClick={() => setZoom((z) => Math.max(1, round1(z - 0.25)))} disabled={zoom <= 1} aria-label="Zoom out">
          −
        </Pill>
        <span className="text-[13px] text-[#5b6a52] w-[42px] text-center">{Math.round(zoom * 100)}%</span>
        <Pill onClick={() => setZoom((z) => Math.min(3, round1(z + 0.25)))} disabled={zoom >= 3} aria-label="Zoom in">
          +
        </Pill>
        {!editing && (
          <>
            <Pill onClick={exportList} disabled={!tables.length}>
              Table list for the caterer
            </Pill>
            <Pill onClick={() => window.print()} disabled={!tables.length} title="A black and white floor plan on one page, then who sits at each table">
              Print floor plan
            </Pill>
          </>
        )}
      </div>
      <div className="text-[14px] text-[#5b6a52] print:hidden">
        {!editing
          ? 'Tap a table to see who sits there. Edit seating to move tables, change the room, or seat people.'
          : adding
            ? 'Tap the plan to drop a table. Tap Done adding when finished.'
            : mob
              ? 'Tap a table, then drag it to move it (or hold any table for a moment, then drag). Tap names to seat them at the open table, or hold a name and drag it onto a table. Undo puts back any change.'
              : 'Drag tables and areas to arrange the room. Tap a table, then tap or drag guests onto it to seat them. Ctrl+Z undoes.'}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="overflow-auto rounded-[14px] border border-[#d3c6a4]">
          {/* Phones: swipe the floor (or a table) to scroll the plan. Editing: drag the selected table, or hold any table or area to pick it up. */}
          <div
            ref={plan}
            onClick={planClick}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
            role="application"
            aria-label="Floor plan"
            className={`relative select-none touch-pan-x touch-pan-y ${adding ? 'cursor-crosshair' : ''}`}
            style={{ width: `${zoom * 100}%`, aspectRatio: cssAspect(aspect), background: '#fbf8f2', backgroundImage: 'radial-gradient(#e2d7bc 1px, transparent 1.2px)', backgroundSize: '18px 18px' }}
          >
            {areas.map((a, i) => (
              <div
                key={i}
                onPointerDown={down('area', i, a.x, a.y)}
                onClick={tap('area', i)}
                onContextMenu={(e) => editing && e.preventDefault()}
                // Only a selected area (while editing) keeps the finger to itself; otherwise a swipe scrolls the plan.
                className={`absolute flex items-center justify-center rounded-[6px] border border-dashed text-[11px] uppercase tracking-[.14em] text-[#7a7466] text-center ${editing ? 'cursor-move' : ''} ${editing && (isSelected('area', i) || lifted === i) ? 'touch-none' : ''}`}
                style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%`, transform: 'translate(-50%,-50%)', borderColor: sel?.kind === 'area' && sel.i === i ? '#33402f' : '#c6b794', background: '#f3ecd6', WebkitTouchCallout: 'none' }}
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
                editing={editing}
                lifted={lifted === t.id}
                dropping={guestDrag.ghost?.over === t.id}
                mob={mob}
                onPointerDown={down('table', t.id, t.x, t.y)}
                onClick={tap('table', t.id)}
              />
            ))}
            {!tables.length && !adding && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[15px] text-[#5b6a52]">No tables yet. Choose a table type, then Set out tables (for the guests you expect) or + Add tables to place them yourself.</div>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-5 print:hidden">
          {editing && selArea && sel?.kind === 'area' && (
            <div className="flex flex-col gap-3 p-4 rounded-[14px] border border-[#e2d7bc]">
              <Label text="Area name">
                <input value={selArea.label} onChange={(e) => setArea(sel.i, { label: e.target.value }, false)} onFocus={checkpoint} className={inputCls} />
              </Label>
              <Label text={`Width · ${Math.round(selArea.w)}%`}>
                <Slider min={4} max={90} value={selArea.w} checkpoint={checkpoint} onSlide={(w) => setArea(sel.i, { w }, false)} />
              </Label>
              <Label text={`Depth · ${Math.round(selArea.h)}%`}>
                <Slider min={4} max={90} value={selArea.h} checkpoint={checkpoint} onSlide={(h) => setArea(sel.i, { h }, false)} />
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
            <div
              className={
                mob
                  ? 'fixed inset-x-0 bottom-0 pb-[calc(16px+env(safe-area-inset-bottom))] z-[17] max-h-[58vh] overflow-y-auto flex flex-col gap-3 p-4 rounded-t-[20px] border-t border-[#d3c6a4] bg-[#fbf8f2] shadow-[0_-8px_24px_rgba(51,64,47,.18)]'
                  : 'flex flex-col gap-3 p-4 rounded-[14px] border border-[#e2d7bc]'
              }
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-[22px]">
                  {/^\d+$/.test(selTable.name) ? `Table ${selTable.name}` : selTable.name} · {(byTable.get(selTable.id) ?? []).length} of {selTable.seats}
                </span>
                <button type="button" aria-label="Close table" onClick={() => setSel(null)} className={`${mob ? 'w-10 h-10' : 'w-8 h-8'} flex-none rounded-full border border-[#c6b794] bg-transparent text-[20px] cursor-pointer`}>
                  ×
                </button>
              </div>
              <TableSummary people={byTable.get(selTable.id) ?? []} />
              {roomTools && (
              <div className="grid grid-cols-2 gap-3">
                <Label text="Table name">
                  <input value={selTable.name} onChange={(e) => setTable(selTable.id, { name: e.target.value }, false)} onFocus={checkpoint} className={inputCls} />
                </Label>
                <Label text="Seats">
                  <SeatsInput key={selTable.id} value={selTable.seats} onValue={(seats) => setTable(selTable.id, { seats })} />
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
              )}
              {roomTools && (selTable.shape === 'long' || selTable.shape === 'head') && (
                <Label text="Seats on">
                  <select
                    aria-label="Seats on"
                    value={String(selTable.shape === 'head' && (selTable.sides ?? 2) === 2 ? 1 : (selTable.sides ?? 2))}
                    onChange={(e) => setTable(selTable.id, { sides: Number(e.target.value) })}
                    className={inputCls}
                  >
                    {selTable.shape === 'long' && <option value="2">Both sides</option>}
                    <option value="1">{selTable.dir === 'v' ? 'The left side only' : 'The top side only'} (facing {selTable.dir === 'v' ? 'right' : 'down'})</option>
                    <option value="-1">{selTable.dir === 'v' ? 'The right side only' : 'The bottom side only'} (facing {selTable.dir === 'v' ? 'left' : 'up'})</option>
                  </select>
                </Label>
              )}
              {roomTools && STRETCHES(selTable.shape) && (
                <Label text={`Length · ${selTable.len}%`}>
                  <Slider min={10} max={90} value={selTable.len} checkpoint={checkpoint} onSlide={(len) => setTable(selTable.id, { len }, false)} />
                </Label>
              )}
              <div className="flex flex-col">
                {(byTable.get(selTable.id) ?? []).map((p, i) => (
                  <div key={p.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] gap-2 items-center py-[6px] border-t border-[#ece3cc] text-[14px]">
                    <span className="text-[12px] text-[#7a7466]">{i + 1}</span>
                    {/* Editing: drag the name onto another table to move them (hold first with a finger). */}
                    <span
                      onPointerDown={dragGuests([p], selTable.id)}
                      onContextMenu={(e) => editing && e.preventDefault()}
                      className={editing ? 'flex flex-col justify-center cursor-grab select-none' : undefined}
                      style={editing ? { WebkitTouchCallout: 'none', ...tapTarget(mob) } : undefined}
                    >
                      {p.name}
                      {p.diet && <span className={`block text-[12px] ${isSerious(p.diet) ? 'text-[#7a4a37] font-semibold' : 'text-[#7a7466]'}`}>{p.diet}</span>}
                      {!p.coming && <span className="block text-[12px] text-[#5e5130]">Not replied yet</span>}
                    </span>
                    {editing ? (
                      <span className="flex items-center gap-1">
                        <MoveTo p={p} here={selTable.id} tables={tables} byTable={byTable} onMove={(ids, to) => seat(ids, to)} />
                        <button type="button" aria-label={`Unseat ${p.name}`} onClick={() => seat([p.id], null)} className={`${mob ? 'w-10 h-10' : 'w-[30px] h-[30px]'} flex-none rounded-full border border-[#d3c6a4] bg-transparent cursor-pointer`}>
                          ×
                        </button>
                      </span>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
                {(byTable.get(selTable.id)?.length ?? 0) > selTable.seats && <div className="text-[13px] text-[#7a4a37]">More people than seats. Add seats or move someone.</div>}
                {!byTable.get(selTable.id)?.length && <div className="text-[13px] text-[#7a7466]">Nobody here yet.{editing ? ' Tap or drag guests below to seat them.' : ''}</div>}
              </div>
              {editing && mob && unseated.length > 0 && (
                <div className="flex flex-col gap-2 pt-2 border-t border-[#e2d7bc]">
                  <span className="text-[13px] text-[#5b6a52]">Tap a name to seat them here, or hold it and drag it onto any table</span>
                  <div className="flex gap-2 flex-wrap">
                    {unseated.flat().map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onPointerDown={dragGuests([p])}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={() => seat([p.id], selTable.id)}
                        style={{ boxShadow: p.party ? `inset 4px 0 0 ${groupColour(p.party)}` : undefined, WebkitTouchCallout: 'none' }}
                        className="py-2 px-3 min-h-[40px] rounded-full border border-[#c6b794] bg-[#f6f0e2] text-[14px] cursor-pointer text-[#33402f] select-none"
                      >
                        {p.name}
                        {isSerious(p.diet) && <span className="ml-1 text-[#7a4a37]">●</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {roomTools && (
              <Pill
                onClick={() => {
                  const ids = (byTable.get(selTable.id) ?? []).map((p) => p.id);
                  commit((d) => ({ ...d, tables: d.tables.filter((t) => t.id !== selTable.id), seats: { ...d.seats, ...Object.fromEntries(ids.map((id) => [id, null])) } }));
                  setSel(null);
                }}
              >
                Remove table
              </Pill>
              )}
            </div>
          )}

          <SeatChecks data={s} tables={tables} seats={seats} seatRules={seatRules} />

          <FindGuest
            find={find}
            setFind={setFind}
            people={s.people}
            seats={seats}
            tables={tables}
            onShow={(tableId) => setSel({ kind: 'table', id: tableId })}
            onSeat={editing && target ? (ids) => seat(ids, target) : undefined}
            target={selTable?.name}
          />

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
            <div className="text-[13px] text-[#5b6a52]">{!editing ? 'Edit seating to seat them.' : target ? `Tap a name to seat them at table ${selTable!.name}, or drag names onto any table.` : 'Drag names onto a table, or tap a table first and then tap names.'}</div>
            {unseated.map((group) => (
              <div key={group[0]!.invitationId} className="flex flex-col gap-1 py-2 border-t border-[#ece3cc]">
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-[12px] text-[#7a7466]">{group[0]!.coming ? 'Coming' : 'Not replied yet'}</span>
                  {group.length > 1 && (
                    // Tap to seat the whole invitation at the open table, or drag it onto any table.
                    <button
                      type="button"
                      onPointerDown={dragGuests(group)}
                      onContextMenu={(e) => editing && e.preventDefault()}
                      onClick={() => (!editing ? toast('Tap Edit seating first') : target ? seat(group.map((p) => p.id), target) : toast('Tap a table first, or drag them onto one'))}
                      style={{ WebkitTouchCallout: 'none' }}
                      className={`${mob ? 'min-h-[40px] px-3' : 'p-0'} border-0 bg-transparent text-[12px] underline cursor-pointer select-none text-[#33402f] ${editing && target ? '' : 'opacity-60'}`}
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
                      onPointerDown={dragGuests([p])}
                      onContextMenu={(e) => editing && e.preventDefault()}
                      onClick={() => (!editing ? toast('Tap Edit seating first') : target ? seat([p.id], target) : toast(mob ? 'Tap a table first, or hold the name and drag it onto one' : 'Tap a table first, or drag the name onto one'))}
                      title={p.party || undefined}
                      style={{ boxShadow: p.party ? `inset 4px 0 0 ${groupColour(p.party)}` : undefined, WebkitTouchCallout: 'none' }}
                      className={`${mob ? 'py-2 min-h-[40px]' : 'py-[5px]'} px-3 rounded-full border border-[#c6b794] bg-[#fbf8f2] text-[13px] ${editing ? 'cursor-grab' : 'cursor-pointer'} select-none hover:bg-[#efe7d3] text-[#33402f]`}
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

      {/* What's printed (and only that): the floor plan on paper, then who sits at each table. Outside the page so it prints on its own. */}
      {createPortal(
        <PrintPlan aspect={aspect} tables={tables} areas={areas} byTable={byTable} title={couple || s.event.name} subtitle={[couple ? s.event.name : '', when, ev?.venue].filter(Boolean).join(' · ')}>
          <section className="seat-print-list">
            <h2 className="font-display text-[22px] m-0 mb-3">Tables</h2>
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
        </PrintPlan>,
        document.body,
      )}

      {/* The name being dragged follows the pointer (above the finger, so it can be read). */}
      {guestDrag.ghost &&
        createPortal(
          <div
            data-drag-label
            aria-hidden
            className={`fixed z-[90] pointer-events-none py-2 px-3 rounded-full text-[14px] whitespace-nowrap shadow-[0_6px_18px_rgba(51,64,47,.3)] ${guestDrag.ghost.over ? 'bg-[#33402f] text-[#f3ecd6]' : 'bg-[#fbf8f2] text-[#33402f] border border-[#c6b794]'}`}
            style={{ left: guestDrag.ghost.x, top: guestDrag.ghost.y, transform: 'translate(-50%, calc(-100% - 18px))' }}
          >
            {guestDrag.ghost.label}
          </div>,
          document.body,
        )}
    </div>
  );
}

type GuestLift = { ids: string[]; label: string; from: string | null };
type Ghost = { label: string; x: number; y: number; over: string | null };

/** The table under a point on screen (tables carry data-table-id), or null. */
const tableAt = (x: number, y: number) => {
  const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  return el?.closest<HTMLElement>('[data-table-id]')?.dataset.tableId ?? null;
};

/**
 * Drag names onto tables with a mouse or a finger. Pointer events, not HTML5 drag and drop: that never
 * fires for touch. A press that barely moves stays a tap (so tapping a name still seats it at the open
 * table). With a mouse the drag starts once it moves; with a finger it starts after a short hold, so a
 * swipe over the names still scrolls the page. While a drag is on, `active` is true (the page stops
 * scrolling under the finger) and `ghost` says where the label is and which table it's over.
 */
function useGuestDrag() {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const active = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = (lift: GuestLift, onDrop: (ids: string[], tableId: string) => void) => (e: PointerEvent) => {
    if (e.button > 0) return; // the main button only
    stop.current?.(); // one drag at a time (and none left hanging if a release went missing outside the window)
    const origin = e.currentTarget as Element;
    const touch = e.pointerType === 'touch';
    const x0 = e.clientX;
    const y0 = e.clientY;
    let started = false;
    let hold = 0;
    const show = (x: number, y: number) => setGhost({ label: lift.label, x, y, over: tableAt(x, y) });
    const begin = (x: number, y: number) => {
      started = true;
      active.current = true;
      show(x, y);
    };
    const end = () => {
      window.clearTimeout(hold);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', end);
      active.current = false;
      stop.current = null;
      setGhost(null);
    };
    const onMove = (ev: globalThis.PointerEvent) => {
      if (started) {
        ev.preventDefault();
        show(ev.clientX, ev.clientY);
      } else if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP) {
        if (touch) end(); // moved before the hold: a swipe, so let the page scroll
        else begin(ev.clientX, ev.clientY);
      }
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      const dragged = started;
      end();
      if (!dragged) return; // a tap: the name's own click does what it always did
      swallowClick(origin);
      const to = tableAt(ev.clientX, ev.clientY);
      if (to && to !== lift.from) onDrop(lift.ids, to);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', end);
    stop.current = end;
    if (touch)
      hold = window.setTimeout(() => {
        begin(x0, y0);
        navigator.vibrate?.(8);
      }, HOLD_MS);
  };
  return { ghost, active, start };
}

/**
 * After a drag, the browser may still send a click (to the name, or to whatever holds both the name and the
 * table it was dropped on). Swallow that one click so it doesn't also seat them at the open table or close it.
 */
function swallowClick(origin: Element) {
  const kill = (ev: Event) => {
    const t = ev.target as Node | null;
    if (t && (t === origin || t.contains(origin))) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    done();
  };
  const done = () => {
    window.clearTimeout(timer);
    document.removeEventListener('click', kill, true);
  };
  const timer = window.setTimeout(done, 400);
  document.addEventListener('click', kill, true);
}

/** A range slider whose every drag (or key press) is one undo step, not one per pixel. */
function Slider({ min, max, value, checkpoint, onSlide }: { min: number; max: number; value: number; checkpoint: () => void; onSlide: (n: number) => void }) {
  // Armed once the step is taken; a new press, key or visit starts a new step.
  const armed = useRef(false);
  const settle = () => {
    armed.current = false;
  };
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onPointerDown={settle}
      onFocus={settle}
      onKeyDown={settle}
      onChange={(e) => {
        if (!armed.current) {
          checkpoint(); // the plan as it was before this slide: Undo goes straight back to it
          armed.current = true;
        }
        onSlide(Number(e.target.value));
      }}
      className="w-full max-[759px]:min-h-[40px]"
    />
  );
}

/**
 * The floor plan on paper: black and white, the whole room on one A4 page (turned to suit the room),
 * tables with their names and guests/seats, areas labelled, a key, and the couple and date at the top.
 * Drawn fresh as an SVG rather than printing the on-screen plan (which is zoomed, scrolled and coloured).
 */
function PrintPlan({
  aspect,
  tables,
  areas,
  byTable,
  title,
  subtitle,
  children,
}: {
  aspect: string;
  tables: SeatTable[];
  areas: SeatArea[];
  byTable: Map<string, Person[]>;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const W = 1000;
  const H = Math.round(W / aspectRatio(aspect));
  const landscape = W >= H;
  const k = 1 / roomScale(aspect); // a bigger room: everything smaller on the page
  const chairR = 7 * k;
  const seated = tables.reduce((n, t) => n + (byTable.get(t.id)?.length ?? 0), 0);
  const seats = tables.reduce((n, t) => n + t.seats, 0);
  const css = `
.seat-print { color: #000; background: #fff; font-family: 'DM Sans', Arial, sans-serif; }
@media print {
  @page seatplan { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
  html.seat-printing body > *:not(.seat-print) { display: none !important; }
  .seat-print-plan { page: seatplan; break-after: page; }
  .seat-print-svg { width: 100%; height: ${landscape ? '150mm' : '225mm'}; }
}`;
  return (
    <div className="seat-print hidden print:block">
      <style>{css}</style>
      <section className="seat-print-plan">
        <div className="flex justify-between items-end gap-4 pb-2 mb-3 border-b-2 border-black">
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '24pt', lineHeight: 1.1 }}>{title}</div>
            {subtitle && <div style={{ fontSize: '10pt' }}>{subtitle}</div>}
          </div>
          <div style={{ fontSize: '10pt', textAlign: 'right' }}>
            Floor plan
            <br />
            {tables.length} {tables.length === 1 ? 'table' : 'tables'} · {seats} seats · {seated} seated
          </div>
        </div>
        <svg className="seat-print-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Printed floor plan" fontFamily="'DM Sans', Arial, sans-serif">
          <rect x={1.5} y={1.5} width={W - 3} height={H - 3} fill="#fff" stroke="#000" strokeWidth={3} />
          {areas.map((a, i) => {
            const w = (a.w / 100) * W;
            const h = (a.h / 100) * H;
            const fs = Math.max(9, Math.min(18, h * 0.3, (w * 0.9) / Math.max(3, a.label.length * 0.7)));
            return (
              <g key={`a${i}`}>
                <rect x={(a.x / 100) * W - w / 2} y={(a.y / 100) * H - h / 2} width={w} height={h} fill="none" stroke="#000" strokeWidth={1.5} strokeDasharray="8 6" rx={4} />
                <text x={(a.x / 100) * W} y={(a.y / 100) * H} fontSize={fs} textAnchor="middle" dominantBaseline="central" letterSpacing="0.12em">
                  {a.label.toUpperCase()}
                </text>
              </g>
            );
          })}
          {tables.map((t) => {
            const box = tableBox(t, aspect);
            const bw = (box.w / 100) * W;
            const bh = (box.h / 100) * H;
            const cx = (t.x / 100) * W;
            const cy = (t.y / 100) * H;
            const left = cx - bw / 2;
            const top = cy - bh / 2;
            const n = byTable.get(t.id)?.length ?? 0;
            const shape = t.shape as TableShape;
            // Long tables standing up and down get their writing turned to run along them.
            const turned = t.dir === 'v' && (STRETCHES(shape) || shape === 'sweetheart');
            const along = turned ? bh : bw;
            const across = turned ? bw : bh;
            const count = `${n}/${t.seats}${n > t.seats ? '!' : ''}`;
            const oneLine = STRETCHES(shape) || across < 40 * k;
            const text = oneLine ? `${t.name} · ${count}` : t.name;
            const fs = Math.max(7, Math.min(across * (oneLine ? 0.55 : 0.4), (along * 0.85) / Math.max(1.5, text.length * 0.6), 34));
            return (
              <g key={t.id}>
                {seatSpots(t, t.seats).map((p, i) => (
                  <circle key={i} cx={left + (p.x / 100) * bw} cy={top + (p.y / 100) * bh} r={chairR} fill={i < n ? '#000' : '#fff'} stroke="#000" strokeWidth={1.2} />
                ))}
                {shape === 'round' || shape === 'oval' ? (
                  <ellipse cx={cx} cy={cy} rx={bw / 2} ry={bh / 2} fill="#fff" stroke="#000" strokeWidth={2} />
                ) : (
                  <rect x={left} y={top} width={bw} height={bh} rx={shape === 'sweetheart' ? Math.min(bw, bh) / 2 : 3} fill="#fff" stroke="#000" strokeWidth={2} />
                )}
                <g transform={turned ? `rotate(-90 ${cx} ${cy})` : undefined}>
                  <text x={cx} y={oneLine ? cy : cy - fs * 0.15} fontSize={fs} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                    {text}
                  </text>
                  {!oneLine && (
                    <text x={cx} y={cy + fs * 0.75} fontSize={fs * 0.55} textAnchor="middle" dominantBaseline="central">
                      {count}
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
        {/* The key. */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 items-center" style={{ fontSize: '9pt' }}>
          <span className="inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ width: 12, height: 12 }}>
              <circle cx="6" cy="6" r="5" fill="#000" />
            </svg>
            Seat taken
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ width: 12, height: 12 }}>
              <circle cx="6" cy="6" r="5" fill="#fff" stroke="#000" />
            </svg>
            Empty seat
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden style={{ width: 22, height: 12 }}>
              <rect x="1" y="1" width="20" height="10" fill="none" stroke="#000" strokeDasharray="3 2" />
            </svg>
            Area of the room
          </span>
          <span>7/10: guests seated / seats at the table (! means more guests than seats)</span>
        </div>
      </section>
      {children}
    </div>
  );
}

/** Named versions of the seating: save the plan as one, look at any, nominate the current arrangement. */
function VersionsPanel({
  versions,
  current,
  viewing,
  busy,
  dirty,
  tz,
  onSave,
  onView,
  onCurrent,
  onRename,
  onDelete,
}: {
  versions: NonNullable<SeatingData['versions']>;
  current: SeatingData['current'] | null;
  viewing: string | null;
  busy: boolean;
  dirty: boolean;
  tz: string;
  onSave: (name: string) => void;
  onView: (id: string) => void;
  onCurrent: (id: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [name, setName] = useState('');
  const suggested = `Version ${versions.length + 1}`;
  return (
    <section aria-label="Seating versions" className="p-4 rounded-[14px] bg-white border border-[#e2d7bc] flex flex-col gap-3 print:hidden">
      <div>
        <h2 className="m-0 font-display font-medium text-[22px]">Versions</h2>
        <p className="m-0 mt-1 text-[14px] text-[#5b6a52]">
          {current
            ? current.changes
              ? `Current arrangement: “${current.name}”, with ${current.changes} saved ${current.changes === 1 ? 'change' : 'changes'} since. Save again to keep them as a version.`
              : `Current arrangement: “${current.name}”.`
            : 'Save the plan as a named version to keep it, then try other arrangements: you can look back at any version and make it current again.'}
        </p>
      </div>
      <form
        className="flex flex-wrap gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          onSave((name.trim() || suggested).slice(0, 60));
          setName('');
        }}
      >
        <Label text="Name" className="flex-1 min-w-[200px]">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={`${suggested}, e.g. Family draft, Final`} className={inputCls} />
        </Label>
        <Pill kind="primary" type="submit" disabled={busy || !!viewing}>
          {dirty ? 'Save plan as a version' : 'Save as a version'}
        </Pill>
      </form>
      {versions.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#efe6d0]">
          {versions.map((v) => {
            const isCurrent = current?.id === v.id;
            return (
              <li key={v.id} className="py-2 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[180px]">
                  <span className="font-semibold">{v.name}</span>
                  {isCurrent && <span className="ml-2 px-2 py-[2px] rounded-full bg-[#33402f] text-white text-[11px] align-middle">Current</span>}
                  {viewing === v.id && <span className="ml-2 px-2 py-[2px] rounded-full bg-[#f3ecd9] text-[#5e5130] text-[11px] align-middle">Looking at</span>}
                  <span className="block text-[13px] text-[#5b6a52]">
                    {fmtWhen(v.at, tz)} · {v.tables} {v.tables === 1 ? 'table' : 'tables'} · {v.seated} seated
                  </span>
                </span>
                <Pill size="sm" disabled={busy || viewing === v.id} onClick={() => onView(v.id)}>
                  View
                </Pill>
                <Pill size="sm" kind={isCurrent ? 'secondary' : 'outline'} disabled={busy || (isCurrent && !current?.changes)} onClick={() => onCurrent(v.id, v.name)}>
                  {isCurrent ? (current?.changes ? 'Go back to it' : 'Current') : 'Make current'}
                </Pill>
                <Pill size="sm" disabled={busy} onClick={() => onRename(v.id, v.name)}>
                  Rename
                </Pill>
                <Pill size="sm" disabled={busy} onClick={() => onDelete(v.id, v.name)} aria-label={`Delete ${v.name}`}>
                  Delete
                </Pill>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * One table, drawn in its shape with its chairs; filled chairs are taken, a red mark means a serious allergy here.
 * `data-table-id` is how a dragged name finds the table under the finger.
 */
function TableShapeView({
  t,
  aspect,
  people,
  selected,
  editing,
  lifted,
  dropping,
  mob,
  onPointerDown,
  onClick,
}: {
  t: SeatTable;
  aspect: string;
  people: Person[];
  selected: boolean;
  /** Editing: the selected (or held) table keeps the finger to itself, so it can be dragged; any other table lets a swipe scroll the plan. */
  editing: boolean;
  /** Picked up by a finger (after a hold). */
  lifted: boolean;
  /** A dragged name is over it. */
  dropping: boolean;
  mob: boolean;
  onPointerDown: (e: PointerEvent) => void;
  onClick: (e: MouseEvent) => void;
}) {
  const box = tableBox(t, aspect);
  const scale = roomScale(aspect);
  const n = people.length;
  const full = n >= t.seats;
  const over = n > t.seats;
  const allergy = people.some((p) => isSerious(p.diet));
  const spots = seatSpots(t, t.seats);
  // In very large and huge rooms tables get tiny on screen: keep them big enough to see and tap.
  const least = scale >= 2 ? (mob ? 22 : 16) : 0;
  const hit = mob ? TAP : 24;
  const dot = mob ? 11 : 9;
  return (
    <div
      data-table-id={t.id}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onContextMenu={(e) => editing && e.preventDefault()}
      role="button"
      aria-label={`Table ${t.name}, ${n} of ${t.seats}`}
      className={`absolute ${editing ? 'cursor-move' : 'cursor-pointer'} ${editing && (selected || lifted) ? 'touch-none' : ''}`}
      style={{
        left: `${t.x}%`,
        top: `${t.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        minWidth: least || undefined,
        minHeight: least || undefined,
        transform: `translate(-50%,-50%)${lifted ? ' scale(1.08)' : ''}`,
        zIndex: lifted || dropping ? 2 : undefined,
        WebkitTouchCallout: 'none',
      }}
    >
      {/* An invisible pad: however small the table is drawn, there's a finger-sized target. */}
      <span aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: `max(100%, ${hit}px)`, height: `max(100%, ${hit}px)` }} />
      {spots.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: dot,
            height: dot,
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
          background: dropping ? '#dfe5cc' : selected ? '#33402f' : over ? '#f1e1d6' : '#fbf8f2',
          color: selected && !dropping ? '#f3ecd6' : '#33402f',
          border: `${dropping ? 2 : 1}px solid ${dropping ? '#55633f' : selected ? '#b39563' : over ? '#7a4a37' : full ? '#5d6b47' : '#c6b794'}`,
          boxShadow: lifted ? '0 8px 18px rgba(51,64,47,.35)' : '0 2px 6px rgba(51,64,47,.12)',
        }}
      >
        <span className={`font-display ${scale >= 3 ? 'text-[10px]' : scale >= 2 ? 'text-[12px]' : 'text-[15px]'} leading-none whitespace-nowrap`}>{t.name}</span>
        {scale < 3 && (
          <span className="text-[10px] opacity-80 leading-tight">
            {n}/{t.seats}
          </span>
        )}
      </div>
      {allergy && (
        <span title="Serious allergy at this table" className="absolute -top-[6px] -right-[6px] w-[14px] h-[14px] rounded-full bg-[#7a4a37] text-[#fbf8f2] text-[10px] leading-[14px] text-center font-bold">
          !
        </span>
      )}
    </div>
  );
}

/** The number of seats: can be cleared and typed afresh; kept between 1 and 60 once you leave the box. */
function SeatsInput({ value, onValue }: { value: number; onValue: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const done = () => {
    const n = Math.max(1, Math.min(60, Math.round(Number(text)) || value));
    setText(String(n));
    if (n !== value) onValue(n);
  };
  return (
    <input
      type="number"
      min={1}
      max={60}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isInteger(n) && n >= 1 && n <= 60) onValue(n);
      }}
      onBlur={done}
      className={inputCls}
    />
  );
}

/** What's on a table: meals by course and the dietary needs (serious ones first), at a glance. */
function TableSummary({ people }: { people: Person[] }) {
  if (!people.length) return null;
  const count = (xs: string[]) => [...xs.filter(Boolean).reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const mains = count(people.map((p) => p.meal.m));
  const diets = people.filter((p) => p.diet.trim());
  if (!mains.length && !diets.length) return null;
  return (
    <div className="flex flex-col gap-1 p-3 rounded-[12px] bg-[#f6f0e2] text-[13px]">
      {mains.length > 0 && (
        <span>
          <strong className="font-semibold">Mains:</strong> {mains.map(([m, n]) => `${n} × ${m}`).join(' · ')}
        </span>
      )}
      {diets.length > 0 && (
        <span>
          <strong className="font-semibold">Dietary:</strong>{' '}
          {[...diets]
            .sort((a, b) => Number(isSerious(b.diet)) - Number(isSerious(a.diet)))
            .map((p) => (
              <span key={p.id} className={isSerious(p.diet) ? 'text-[#7a4a37] font-semibold' : ''}>
                {p.name.split(' ')[0]} ({p.diet}){' '}
              </span>
            ))}
        </span>
      )}
    </div>
  );
}

/** Move someone, or their whole household at this table, to another table (works on phones too). */
function MoveTo({ p, here, tables, byTable, onMove }: { p: Person; here: string; tables: SeatTable[]; byTable: Map<string, Person[]>; onMove: (ids: string[], to: string) => void }) {
  const household = (byTable.get(here) ?? []).filter((x) => x.invitationId === p.invitationId);
  const others = tables.filter((t) => t.id !== here);
  if (!others.length) return null;
  const label = (t: SeatTable) => `${/^\d+$/.test(t.name) ? `Table ${t.name}` : t.name} (${(byTable.get(t.id) ?? []).length}/${t.seats})`;
  return (
    <select
      aria-label={`Move ${p.name} to another table`}
      value=""
      onChange={(e) => {
        const [who, to] = e.target.value.split(':');
        if (to) onMove(who === 'all' ? household.map((x) => x.id) : [p.id], to);
      }}
      className={`${inputCls} !py-[6px] !px-2 !text-[13px] w-[92px] sm:w-[84px] max-[759px]:min-h-[40px]`}
    >
      <option value="">Move…</option>
      <optgroup label={`Just ${p.name.split(' ')[0]}`}>
        {others.map((t) => (
          <option key={t.id} value={`one:${t.id}`}>
            {label(t)}
          </option>
        ))}
      </optgroup>
      {household.length > 1 && (
        <optgroup label={`${p.name.split(' ')[0]} and their household (${household.length})`}>
          {others.map((t) => (
            <option key={t.id} value={`all:${t.id}`}>
              {label(t)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** Find a guest by name: where they're sitting (tap to open the table), or seat them at the open table. */
function FindGuest({
  find,
  setFind,
  people,
  seats,
  tables,
  onShow,
  onSeat,
  target,
}: {
  find: string;
  setFind: (v: string) => void;
  people: Person[];
  seats: Record<string, string | null>;
  tables: SeatTable[];
  onShow: (tableId: string) => void;
  onSeat?: (ids: string[]) => void;
  target?: string;
}) {
  const q = find.trim().toLowerCase();
  const hits = q.length >= 2 ? people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const nameOf = (id: string | null | undefined) => {
    const t = tables.find((x) => x.id === id);
    return t ? (/^\d+$/.test(t.name) ? `Table ${t.name}` : t.name) : '';
  };
  return (
    <div className="flex flex-col gap-2">
      <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a guest" aria-label="Find a guest" className={inputCls} />
      {hits.map((p) => {
        const at = seats[p.id];
        return (
          <div key={p.id} className="flex justify-between items-center gap-2 py-[6px] px-3 rounded-[10px] bg-[#fbf8f2] border border-[#e2d7bc] text-[14px]">
            <span className="min-w-0 truncate">
              {p.name}
              <span className="block text-[12px] text-[#7a7466]">{!p.coming ? 'Hasn’t said yes' : at ? nameOf(at) : 'Not seated'}</span>
            </span>
            {at ? (
              <button type="button" onClick={() => onShow(at)} className="flex-none py-[6px] px-3 rounded-full border border-[#c6b794] bg-transparent text-[13px] cursor-pointer text-[#33402f]">
                Show
              </button>
            ) : p.coming && onSeat ? (
              <button type="button" onClick={() => onSeat([p.id])} className="flex-none py-[6px] px-3 rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[13px] cursor-pointer">
                Seat at {target}
              </button>
            ) : null}
          </div>
        );
      })}
      {q.length >= 2 && !hits.length && <span className="text-[13px] text-[#7a7466]">No guest by that name.</span>}
    </div>
  );
}

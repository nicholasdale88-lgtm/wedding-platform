import type { Shuttle, Shuttles } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, plannerApi, shuttlesApi } from '../../lib/api';
import { confirmLeave, useUnsavedChanges } from '../leave';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Wedding planner → Transport: shuttle runs for each event (time, from, to, seats). Guests see "There's a
 * shuttle: book your seats" under that event on their invitation; here you see who's on each run.
 */

const newId = () => crypto.randomUUID().slice(0, 10);

export function Transport() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const events = overview?.events ?? [];
  const [picked, setEv] = useState('');
  // The first event until one is picked (the overview may arrive after this page opens).
  const ev = picked || events[0]?.key || '';
  const [doc, setDoc] = useState<{ data: Shuttles; version: number } | null>(null);
  const [list, setList] = useState<Shuttle[]>([]);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [bookings, setBookings] = useState<Record<string, { names: string; seats: number }[]>>({});

  const load = useCallback(async () => {
    if (!ev) return;
    try {
      const [d, b] = await Promise.all([plannerApi.docFor<Shuttles>(wid, 'shuttles', ev), shuttlesApi.bookings(wid)]);
      setDoc(d);
      setList(d.data.list);
      setBookings(b.bookings);
      setDirty(false);
    } catch (e) {
      toast((e as Error).message);
    }
  }, [wid, ev]); // eslint-disable-line
  useEffect(() => void load(), [load]);

  const edit = (next: Shuttle[]) => {
    setList(next);
    setDirty(true);
  };
  const save = async () => {
    if (!doc) return;
    try {
      const r = await plannerApi.saveDoc(wid, 'shuttles', ev, { list: list.filter((s) => s.time.trim() || s.from.trim()) }, doc.version);
      setDoc(r);
      setList(r.data.list);
      setDirty(false);
      toast('Saved: guests can book now');
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded.' : (e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    }
  };
  const set = (i: number, p: Partial<Shuttle>) => edit(list.map((s, j) => (j === i ? { ...s, ...p } : s)));
  if (!ev) return <p className="text-[#5b6a52]">Add an event first (Account → Events).</p>;
  if (!doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading the shuttle runs…</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>Transport</H2>
          <div className="text-[13px] text-[#5b6a52]">Shuttle runs guests can book seats on, from their invitation.</div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {events.length > 1 && (
            <select aria-label="Event" value={ev} onChange={(e) => confirmLeave() && setEv(e.target.value)} className={inputCls}>
              {events.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          <Pill kind="primary" disabled={!dirty} onClick={() => void save()}>
            {dirty ? 'Save' : 'Saved'}
          </Pill>
        </div>
      </div>
      {list.map((s, i) => {
        const who = bookings[s.id] ?? [];
        const taken = who.reduce((a, b) => a + b.seats, 0);
        return (
          <div key={s.id} className="flex flex-col gap-2 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-[100px_1fr_1fr_90px_auto] items-end">
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                Leaves
                <input value={s.time} placeholder="1:00pm" onChange={(e) => set(i, { time: e.target.value })} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                From
                <input value={s.from} placeholder="e.g. Gosford station" onChange={(e) => set(i, { from: e.target.value })} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                To
                <input value={s.to} placeholder="e.g. The ceremony" onChange={(e) => set(i, { to: e.target.value })} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                Seats
                <input type="number" min={1} max={500} value={s.seats} onChange={(e) => set(i, { seats: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} className={inputCls} />
              </label>
              <button type="button" aria-label="Remove run" onClick={() => edit(list.filter((_, j) => j !== i))} className="w-9 h-9 mb-[2px] rounded-full border border-[#c6b794] bg-transparent cursor-pointer text-[#7a4a37] justify-self-end">
                ×
              </button>
            </div>
            <input aria-label="Note for guests" value={s.note} placeholder="A note for guests (where to wait, what to look for)" onChange={(e) => set(i, { note: e.target.value })} className={inputCls} />
            <div className="text-[13px] text-[#5b6a52]">
              <strong className="font-semibold">
                {taken} of {s.seats} booked
              </strong>
              {who.length ? `: ${who.map((w) => `${w.names}${w.seats > 1 ? ` (${w.seats})` : ''}`).join(', ')}` : ''}
            </div>
          </div>
        );
      })}
      {!list.length && <p className="m-0 text-[14px] text-[#5b6a52]">No shuttles for this event yet.</p>}
      <Pill kind="dashed" className="self-start" onClick={() => edit([...list, { id: newId(), time: '', from: '', to: '', seats: 20, note: '' }])}>
        + Add a run
      </Pill>
    </div>
  );
}

import type { CheckIn as CheckInDoc } from '@wp/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, plannerApi, type Guest } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, inputCls, useToast } from '../ui';

/**
 * Wedding planner → Check-in: on the day, whoever's on the door searches a name and ticks the party in
 * (all of them, or how many came). A live count for the caterer; two phones can check in at once (it
 * refreshes every 15 seconds and never overwrites someone else's tick).
 */
export function CheckIn() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const events = overview?.events ?? [];
  const [ev, setEv] = useState(events[0]?.key ?? '');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [doc, setDoc] = useState<{ data: CheckInDoc; version: number } | null>(null);
  const [q, setQ] = useState('');
  const saving = useRef(false);

  const load = useCallback(async () => {
    if (!ev || saving.current) return;
    try {
      const [g, d] = await Promise.all([api.guests(wid), plannerApi.docFor<CheckInDoc>(wid, 'checkin', ev)]);
      setGuests(g.guests);
      setDoc(d);
    } catch (e) {
      toast((e as Error).message);
    }
  }, [wid, ev]); // eslint-disable-line
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  // Coming to this event: the parties who said yes, with how many.
  const coming = useMemo(
    () =>
      guests
        .filter((g) => g.invited.includes(ev) && g.rsvp[ev]?.attending === true)
        .map((g) => ({ id: g.id, names: g.people.map((p) => p.name).filter(Boolean).join(' & ') || 'A guest', count: g.rsvp[ev]?.count || g.people.length || 1 }))
        .sort((a, b) => a.names.localeCompare(b.names)),
    [guests, ev],
  );
  if (!doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading the guest list…</div>;
  const arrived = doc.data.arrived;
  const expected = coming.reduce((a, g) => a + g.count, 0);
  const here = Object.values(arrived).reduce((a, n) => a + n, 0);
  const needle = q.trim().toLowerCase();
  const shown = needle ? coming.filter((g) => g.names.toLowerCase().includes(needle)) : coming;

  /** One party in (or out): merged onto the latest list, so two phones at the door don't clash. */
  const set = async (id: string, n: number) => {
    saving.current = true;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = attempt ? await plannerApi.docFor<CheckInDoc>(wid, 'checkin', ev) : doc;
        const next = { ...latest.data.arrived };
        if (n > 0) next[id] = n;
        else delete next[id];
        setDoc({ ...latest, data: { arrived: next } });
        try {
          setDoc(await plannerApi.saveDoc(wid, 'checkin', ev, { arrived: next }, latest.version));
          return;
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 409)) throw e;
        }
      }
      toast('Busy at the door: try again');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      saving.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>Check-in</H2>
          <div className="text-[13px] text-[#5b6a52]">On the day: tick people in as they arrive. Works on any phone, two at once.</div>
        </div>
        {events.length > 1 && (
          <select aria-label="Event" value={ev} onChange={(e) => setEv(e.target.value)} className={inputCls}>
            {events.map((e) => (
              <option key={e.key} value={e.key}>
                {e.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <div className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">Here</div>
          <div className="font-display text-[40px] leading-none">
            {here}
            <span className="text-[18px] text-[#7a7466]"> of {expected}</span>
          </div>
        </div>
        <div className="p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <div className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">Still to come</div>
          <div className="font-display text-[40px] leading-none">{Math.max(0, expected - here)}</div>
        </div>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name" aria-label="Search a name" className={`${inputCls} text-[17px] !py-3`} />
      <div className="flex flex-col">
        {shown.map((g) => {
          const n = arrived[g.id] ?? 0;
          return (
            <div key={g.id} className={`flex justify-between items-center gap-3 py-3 px-2 border-t border-[#e2d7bc] ${n ? 'bg-[#eef1e4]' : ''}`}>
              <span className="min-w-0">
                <span className="block font-medium truncate">{g.names}</span>
                <span className="block text-[12px] text-[#7a7466]">{n ? `${n} of ${g.count} here` : `${g.count} coming`}</span>
              </span>
              <span className="flex gap-1 flex-none">
                {g.count > 1 &&
                  Array.from({ length: g.count - 1 }, (_, i) => i + 1).map((k) => (
                    <button key={k} type="button" onClick={() => void set(g.id, k)} className={`w-9 h-9 rounded-full border text-[14px] cursor-pointer ${n === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-white border-[#c6b794]'}`}>
                      {k}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => void set(g.id, n === g.count ? 0 : g.count)}
                  className={`py-2 px-4 rounded-full border text-[14px] font-medium cursor-pointer ${n === g.count ? 'bg-[#5d6b47] text-[#fbf8f2] border-[#5d6b47]' : 'bg-white border-[#5d6b47] text-[#3d4a2f]'}`}
                >
                  {n === g.count ? 'Here ✓' : g.count > 1 ? 'All here' : 'Here'}
                </button>
              </span>
            </div>
          );
        })}
        {!shown.length && <p className="m-0 py-4 text-[14px] text-[#5b6a52]">{coming.length ? 'No one by that name is coming to this event.' : 'No one has said yes to this event yet.'}</p>}
      </div>
    </div>
  );
}

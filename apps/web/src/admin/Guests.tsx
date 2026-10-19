import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, type EventInfo, type Guest } from '../lib/api';
import { fmtWhen, shortLabel } from '../lib/format';
import { downloadCsv, fileName } from '../lib/csv';
import { GuestDrawer } from './GuestDrawer';
import { exportRows } from './guestImport';
import { ImportGuests } from './ImportGuests';
import { answerLabel, applyFilters, dropdowns, quickFilters, shortAnswer, type FilterState } from './guestFilters';
import { useAdmin } from './Shell';
import { Eyebrow, Pill, StatusPill, useMedia, useToast } from './ui';

const FILTER_KEYS = ['filter', 'q', 'inv', 'diet', 'seat', 'mob', 'size', 'sort'] as const;

/** design/RSVP Admin.dc.html → Guests. Filters live in the address bar, so they survive a reload and can be shared. */
export function Guests() {
  const { wid, overview, reload: reloadOverview } = useAdmin();
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const toast = useToast();
  const mob = useMedia('(max-width: 759px)');
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{ events: EventInfo[]; guests: Guest[] } | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.guests(wid));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => {
    void load();
  }, [load]);

  const state: FilterState = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as FilterState;
  if (!state.filter) state.filter = 'all';
  const set = (patch: Partial<Record<(typeof FILTER_KEYS)[number] | 'g', string>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const open = params.get('g');

  const events = data?.events ?? [];
  const guests = data?.guests ?? [];
  const shown = useMemo(() => (data ? applyFilters(data.guests, data.events, state) : []), [data, params]);
  const quick = quickFilters(events);
  const drops = dropdowns(events);
  const anyFilter = FILTER_KEYS.some((k) => k !== 'sort' && k !== 'filter' && state[k]) || state.filter !== 'all';
  const questions = events.flatMap((e) => e.questions.filter((q) => q.type === 'choice').map((q) => ({ event: e.key, key: q.key })));

  const changed = async () => {
    await Promise.all([load(), reloadOverview()]);
  };

  async function addGuest() {
    try {
      const d = await api.addGuest(wid);
      await changed();
      set({ g: d.guest.id });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function setInvited(g: Guest, invited: string[]) {
    try {
      await api.patchGuest(wid, g, { invited });
      toast('Saved');
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Updated elsewhere, reloaded.' : (e as Error).message);
    }
    await changed();
  }

  if (error) return <p role="alert" className="text-[#8a5a45]">{error}</p>;
  const seatsHeld = guests.reduce((n, g) => n + g.seatsHeld, 0);
  const cols = `minmax(200px,1.5fr) 128px ${events.length === 2 ? '118px ' : ''}${events.map(() => '104px').join(' ')} 84px ${questions.map(() => '82px').join(' ')} minmax(170px,1.4fr) 150px`;

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex items-end justify-between gap-5 flex-wrap">
        <div>
          <Eyebrow>Guests</Eyebrow>
          <h1 className="mt-[6px] mb-0 font-display font-medium text-[40px] leading-[1.08] min-h-[43px]">
            {data ? `${seatsHeld} guests on ${guests.length} invitations` : ''}
          </h1>
        </div>
        <div className="flex gap-[10px] flex-wrap">
          <Pill onClick={() => setImporting((x) => !x)}>Import</Pill>
          <Pill disabled={!guests.length} onClick={() => downloadCsv(fileName(overview?.wedding.slug ?? 'wedding', 'guests'), exportRows(guests, events))}>
            Export
          </Pill>
          <Pill kind="primary" onClick={addGuest}>Add guest</Pill>
        </div>
      </header>

      {importing && data && <ImportGuests events={events} onClose={() => setImporting(false)} onDone={changed} />}

      <div className="flex gap-3 flex-wrap items-center">
        <input
          value={state.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search name or mobile"
          aria-label="Search name or mobile"
          className="flex-[0_1_280px] min-w-[200px] py-[10px] px-[14px] border border-[#d3c6a4] rounded-full bg-[#fbf8f2] text-[14px]"
        />
        <div className="flex gap-[6px] flex-wrap">
          {quick.map((f) => {
            const on = state.filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => set({ filter: f.key === 'all' ? '' : f.key })}
                aria-pressed={on}
                className="py-[7px] px-[13px] rounded-full border text-[13px] cursor-pointer"
                style={{ borderColor: on ? '#33402f' : '#d3c6a4', background: on ? '#33402f' : '#fbf8f2', color: on ? '#f3ecd6' : '#33402f' }}
              >
                {f.label} {guests.filter(f.test).length}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center -mt-[6px]">
        {drops.map((d) => (
          <label key={d.key} className="flex items-center gap-[6px] text-[12px] text-[#5b6a52]">
            {d.label}
            <select
              value={state[d.key] ?? ''}
              onChange={(e) => set({ [d.key]: e.target.value })}
              className="py-[7px] pr-[30px] pl-3 border rounded-full bg-[#fbf8f2] text-[13px] text-[#33402f]"
              style={{ borderColor: state[d.key] ? '#33402f' : '#c6b794', fontWeight: state[d.key] ? 600 : 400 }}
            >
              {d.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
        <span className="text-[13px] text-[#5b6a52] ml-auto">
          {shown.length === guests.length ? `${guests.length} invitations` : `${shown.length} of ${guests.length} invitations`}
        </span>
        {anyFilter && (
          <button onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))} className="py-[6px] px-3 rounded-full border border-dashed border-[#8a9670] bg-transparent text-[#5d6b47] text-[12px] cursor-pointer">
            Clear filters
          </button>
        )}
      </div>

      {mob ? (
        <div className="flex flex-col border-t-2 border-[#33402f]">
          {shown.map((g) => (
            <button key={g.id} onClick={() => set({ g: g.id })} className="flex flex-col gap-[6px] py-[14px] px-[2px] border-0 border-b border-[#e2d7bc] bg-transparent text-left cursor-pointer">
              <span className="flex justify-between gap-[10px] items-baseline w-full">
                <strong className="font-semibold text-[15px]">{g.people[0]?.name || 'New guest'}</strong>
                <span className="text-[12px] text-[#5b6a52] whitespace-nowrap">{seats(g)}</span>
              </span>
              {g.people.length > 1 && <span className="text-[13px] text-[#5b6a52]">with {g.people.slice(1).map((p) => p.name).join(', ')}</span>}
              <span className="flex gap-[6px] flex-wrap items-center">
                <span className="text-[12px] text-[#5b6a52]">{events.filter((e) => g.invited.includes(e.key)).map((e) => shortLabel(e.name)).join(' · ')}</span>
                {events.map((e) => <StatusPill key={e.key} invited={g.invited.includes(e.key)} attending={g.rsvp[e.key]?.attending} />)}
              </span>
            </button>
          ))}
          {data && shown.length === 0 && <div className="py-10 text-center text-[#5b6a52]">No guests match.</div>}
        </div>
      ) : (
        <div className="bg-[#fbf8f2] border border-[#e2d7bc] rounded-[14px] overflow-x-auto">
          <div className="min-w-[1060px]" role="table" aria-label="Guests">
            <div role="row" className="grid gap-3 py-3 px-[18px] border-b border-[#e2d7bc] text-[11px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]" style={{ gridTemplateColumns: cols }}>
              <span role="columnheader">Main contact</span>
              <span role="columnheader">Mobile</span>
              {events.length === 2 && <span role="columnheader">Invited to</span>}
              {events.map((e) => <span role="columnheader" key={e.key}>{shortLabel(e.name)}</span>)}
              <span role="columnheader">Seats</span>
              {questions.map((q) => <span role="columnheader" key={q.key}>{answerLabel(q.key)}</span>)}
              <span role="columnheader">Dietary</span>
              <span role="columnheader">Last SMS</span>
            </div>
            {shown.map((g) => (
              <div
                key={g.id}
                role="row"
                tabIndex={0}
                onClick={() => set({ g: g.id })}
                onKeyDown={(e) => e.key === 'Enter' && set({ g: g.id })}
                className="grid gap-3 items-center py-3 px-[18px] border-b border-[#ece3cc] cursor-pointer hover:bg-[#f3ecdc]"
                style={{ gridTemplateColumns: cols }}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{g.people[0]?.name || 'New guest'}</span>
                  {g.people.length > 1 && (
                    <span className="block text-[12px] text-[#5b6a52] overflow-hidden text-ellipsis whitespace-nowrap">with {g.people.slice(1).map((p) => p.name).join(', ')}</span>
                  )}
                </span>
                <span className="text-[13px] tabular-nums" style={{ color: g.phone ? '#33402f' : '#8a5a45' }}>{g.phoneDisplay || 'No mobile'}</span>
                {events.length === 2 && (
                  <select
                    aria-label="Invited to"
                    value={g.invited.length === 2 ? 'all' : g.invited[0] ?? ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => void setInvited(g, e.target.value === 'all' ? events.map((x) => x.key) : [e.target.value])}
                    className="py-[5px] px-[6px] border border-[#d3c6a4] rounded-[8px] bg-[#fbf8f2] text-[13px] text-[#33402f] cursor-pointer"
                  >
                    <option value="all">Both</option>
                    {events.map((e) => <option key={e.key} value={e.key}>{shortLabel(e.name)}</option>)}
                  </select>
                )}
                {events.map((e) => <StatusPill key={e.key} invited={g.invited.includes(e.key)} attending={g.rsvp[e.key]?.attending} />)}
                <span className="tabular-nums">{seats(g)}</span>
                {questions.map((q) => (
                  <span key={q.key} className="text-[13px]">{g.rsvp[q.event]?.attending ? shortAnswer(g.rsvp[q.event]?.answers[q.key]) : '–'}</span>
                ))}
                <span className="text-[13px] overflow-hidden text-ellipsis whitespace-nowrap">{g.people.map((p) => p.diet.trim()).filter(Boolean).join('; ') || '–'}</span>
                <span className="text-[12px] text-[#5b6a52]">{g.lastSms ? `${g.lastSms.name} · ${fmtWhen(g.lastSms.at, tz)}` : g.phone ? 'Not invited yet' : 'No mobile'}</span>
              </div>
            ))}
            {data && shown.length === 0 && <div className="py-10 px-[18px] text-center text-[#5b6a52]">No guests match.</div>}
          </div>
        </div>
      )}

      {open && (
        <GuestDrawer
          wid={wid}
          id={open}
          tz={tz}
          onClose={() => set({ g: '' })}
          onChanged={changed}
        />
      )}
    </div>
  );
}

function seats(g: Guest): string {
  const yes = Object.entries(g.rsvp).filter(([k, r]) => g.invited.includes(k) && r.attending);
  const n = yes.length ? Math.max(...yes.map(([, r]) => r.count)) : null;
  const table = g.people.find((p) => p.table)?.table;
  return `${n ?? '–'}/${g.seatsHeld}${table ? ` · T${table}` : ''}`;
}

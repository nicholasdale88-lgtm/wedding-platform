import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, type EventInfo, type Guest } from '../lib/api';
import { fmtWhen, shortLabel } from '../lib/format';
import { fileName } from '../lib/csv';
import { downloadDressed } from './exportLook';
import { GuestDrawer } from './GuestDrawer';
import { exportSheets } from './guestImport';
import { ImportGuests } from './ImportGuests';
import { ManualSend } from './ManualSend';
import { answerLabel, applyFilters, dropdowns, quickFilters, shortAnswer, type FilterState } from './guestFilters';
import { useOpenParam } from './openParam';
import { useAdmin, useSectionName } from './Shell';
import { Eyebrow, Pill, StatusPill, useAutoRefresh, useMedia, useToast } from './ui';

const FILTER_KEYS = ['filter', 'q', 'inv', 'diet', 'seat', 'mob', 'size', 'sort'] as const;

/** design/RSVP Admin.dc.html → Guests. Filters live in the address bar, so they survive a reload and can be shared. */
export function Guests() {
  const { wid, overview, reload: reloadOverview, event: chosen } = useAdmin();
  const section = useSectionName();
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const toast = useToast();
  const mob = useMedia('(max-width: 759px)');
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{ events: EventInfo[]; guests: Guest[]; links?: Record<string, string> } | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [manual, setManual] = useState(false);
  const [fresh, setFresh] = useState(''); // the guest "Add guest" just made
  const [more, setMore] = useState(false); // phones: Import, Export and Send without SMS under More
  const [filtersOpen, setFiltersOpen] = useState(false); // phones: the dropdown filters under Filters (n)

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
  useAutoRefresh(load); // new replies appear in the list by themselves

  const state: FilterState = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as FilterState;
  if (!state.filter) state.filter = 'all';
  const set = (patch: Partial<Record<(typeof FILTER_KEYS)[number], string>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const [open, openGuest, closeGuest] = useOpenParam('g'); // a pushed entry: the phone's Back closes the guest

  // The guest list is joint by default; "just this event" narrows it to the sidebar's event.
  const focusEv = data?.events.find((e) => e.key === chosen);
  // Account: everyone. An event's section: that event's guests, with everyone one tap away.
  const one = params.get('show') !== 'all' && !!focusEv;
  const events = one ? [focusEv!] : (data?.events ?? []);
  // In an event, each guest is shown as invited to this event only, so Awaiting, Declined and the rest mean this event.
  const guests = (data?.guests ?? []).filter((g) => !one || g.invited.includes(focusEv!.key)).map((g) => (one ? { ...g, invited: [focusEv!.key] } : g));
  const shown = useMemo(() => (data ? applyFilters(guests, events, state) : []), [data, params, chosen]);
  const quick = quickFilters(events);
  const drops = dropdowns(events);
  const anyFilter = FILTER_KEYS.some((k) => k !== 'sort' && k !== 'filter' && state[k]) || state.filter !== 'all';
  const questions = events.flatMap((e) => e.questions.filter((q) => q.type === 'choice').map((q) => ({ event: e.key, key: q.key })));

  const changed = async () => {
    await Promise.all([load(), reloadOverview()]);
  };

  async function addGuest() {
    try {
      const d = await api.addGuest(wid, focusEv ? [focusEv.key] : undefined);
      await changed();
      setFresh(d.guest.id);
      openGuest(d.guest.id);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  // "+ Add a guest" from the Overview arrives as ?add=1: add one straight away (once).
  const adding = params.get('add') === '1';
  useEffect(() => {
    if (!adding || !data) return;
    const next = new URLSearchParams(params);
    next.delete('add');
    setParams(next, { replace: true });
    void addGuest();
  }, [adding, data]); // eslint-disable-line

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
          <Eyebrow>{section} · Guests</Eyebrow>
          <h1 className="mt-[6px] mb-0 font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08] min-h-[43px]">
            {data ? (guests.length ? `${seatsHeld} guests on ${guests.length} invitations` : 'Your guest list') : ''}
          </h1>
        </div>
        <div className="relative flex gap-[10px] flex-wrap">
          {/* Phones: one main action, the rest under More. */}
          {(!mob || more) && (
            <div className={mob ? 'absolute right-0 top-[calc(100%+6px)] z-[14] flex flex-col gap-2 p-3 rounded-[14px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f2)] shadow-[0_8px_24px_rgba(51,64,47,.16)] min-w-[220px]' : 'contents'}>
              <Pill onClick={() => (setMore(false), setManual((x) => !x))}>Share invitation links yourself</Pill>
              <Pill onClick={() => (setMore(false), setImporting((x) => !x))}>Import</Pill>
              <Pill
                disabled={!guests.length}
                onClick={() => {
                  setMore(false);
                  void downloadDressed(wid, overview, fileName(overview?.wedding.slug ?? 'wedding', 'guests', 'xlsx'), 'Guest list', exportSheets(guests, events, data?.links), events.map((e) => e.key));
                }}
              >
                Export
              </Pill>
            </div>
          )}
          {mob && (
            <Pill aria-expanded={more} onClick={() => setMore((x) => !x)}>
              More ▾
            </Pill>
          )}
          <Pill kind="primary" onClick={addGuest}>Add guest</Pill>
        </div>
      </header>

      {importing && data && <ImportGuests events={data.events} focus={focusEv} onClose={() => setImporting(false)} onDone={changed} />}
      {manual && data && <ManualSend guests={guests} links={data.links ?? {}} onClose={() => setManual(false)} />}

      {data && data.events.length > 1 && focusEv && (
        <div role="radiogroup" aria-label="Guest list" className="flex gap-2 flex-wrap">
          {(
            [
              ['all', 'Everyone (all events)'],
              ['', `Just ${focusEv.name}`],
            ] as const
          ).map(([v, label]) => {
            const on = (v === '') === one;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  if (v) next.set('show', v);
                  else next.delete('show');
                  setParams(next, { replace: true });
                }}
                className={`py-2 px-4 rounded-full border text-[14px] cursor-pointer ${on ? 'bg-[var(--adm-text,#33402f)] text-[#f3ecd6] border-[var(--adm-text,#33402f)]' : 'bg-transparent border-[var(--adm-line,#c6b794)] text-[var(--adm-text,#33402f)] hover:bg-[var(--adm-tint,#efe7d3)]'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="search"
          value={state.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search name or mobile"
          aria-label="Search name or mobile"
          className={`${mob ? 'w-full' : 'flex-[0_1_280px] min-w-[200px]'} py-[10px] px-[14px] border border-[var(--adm-line,#d3c6a4)] rounded-full bg-[var(--adm-card,#fbf8f2)] text-[14px]`}
        />
        {/* Phones: the quick filters are one row that scrolls sideways. */}
        <div className={mob ? 'flex gap-[6px] overflow-x-auto [scrollbar-width:none] -mx-4 px-4 w-[calc(100%+32px)]' : 'flex gap-[6px] flex-wrap'}>
          {quick.map((f) => {
            const on = state.filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => set({ filter: f.key === 'all' ? '' : f.key })}
                aria-pressed={on}
                className="flex-none whitespace-nowrap py-[7px] px-[13px] min-h-[40px] sm:min-h-0 rounded-full border text-[13px] cursor-pointer"
                style={{ borderColor: on ? 'var(--adm-ink,#33402f)' : '#d3c6a4', background: on ? 'var(--adm-ink,#33402f)' : '#fbf8f2', color: on ? '#f3ecd6' : 'var(--adm-ink,#33402f)' }}
              >
                {f.label} {guests.filter(f.test).length}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center -mt-[6px]">
        {mob && (
          <Pill size="sm" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((x) => !x)}>
            Filters{drops.filter((d) => state[d.key]).length ? ` (${drops.filter((d) => state[d.key]).length})` : ''} {filtersOpen ? '▴' : '▾'}
          </Pill>
        )}
        {(!mob || filtersOpen) && drops.map((d) => (
          <label key={d.key} className="flex items-center gap-[6px] text-[12px] text-[var(--adm-muted,#5b6a52)]">
            {d.label}
            <select
              value={state[d.key] ?? ''}
              onChange={(e) => set({ [d.key]: e.target.value })}
              className="py-[7px] pr-[30px] pl-3 border rounded-full bg-[var(--adm-card,#fbf8f2)] text-[13px] text-[var(--adm-text,#33402f)]"
              style={{ borderColor: state[d.key] ? '#33402f' : '#c6b794', fontWeight: state[d.key] ? 600 : 400 }}
            >
              {d.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
        <span className="text-[13px] text-[var(--adm-muted,#5b6a52)] ml-auto">
          {shown.length === guests.length ? `${guests.length} invitations` : `${shown.length} of ${guests.length} invitations`}
        </span>
        {anyFilter && (
          <button onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))} className="py-[6px] px-3 rounded-full border border-dashed border-[#8a9670] bg-transparent text-[#5d6b47] text-[12px] cursor-pointer">
            Clear filters
          </button>
        )}
      </div>

      {mob ? (
        <div className="flex flex-col border-t-2 border-[var(--adm-text,#33402f)]">
          {shown.map((g) => (
            <button key={g.id} onClick={() => openGuest(g.id)} className="flex flex-col gap-[6px] py-[14px] px-[2px] border-0 border-b border-[var(--adm-line,#e2d7bc)] bg-transparent text-left cursor-pointer">
              <span className="flex justify-between gap-[10px] items-baseline w-full">
                <strong className="font-semibold text-[15px]">{g.people[0]?.name || 'New guest'}</strong>
                <span className="text-[12px] text-[var(--adm-muted,#5b6a52)] whitespace-nowrap">{seats(g)}</span>
              </span>
              {g.people.length > 1 && <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">with {g.people.slice(1).map((p) => p.name).join(', ')}</span>}
              <span className="flex gap-[6px] flex-wrap items-center">
                <span className="text-[12px] text-[var(--adm-muted,#5b6a52)]">{events.filter((e) => g.invited.includes(e.key)).map((e) => shortLabel(e.name)).join(' · ')}</span>
                {events.map((e) => <StatusPill key={e.key} invited={g.invited.includes(e.key)} attending={g.rsvp[e.key]?.attending} />)}
              </span>
            </button>
          ))}
          {data && shown.length === 0 && (guests.length ? <div className="py-10 text-center text-[var(--adm-muted,#5b6a52)]">No guests match.</div> : <FirstGuests onAdd={addGuest} onImport={() => setImporting(true)} />)}
        </div>
      ) : (
        <div className="bg-[var(--adm-card,#fbf8f2)] border border-[var(--adm-line,#e2d7bc)] rounded-[14px] overflow-x-auto">
          <div className="min-w-[1060px]" role="table" aria-label="Guests">
            <div role="row" className="grid gap-3 py-3 px-[18px] border-b border-[var(--adm-line,#e2d7bc)] text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--adm-muted,#5b6a52)]" style={{ gridTemplateColumns: cols }}>
              <span role="columnheader">Main contact</span>
              <span role="columnheader">Mobile</span>
              {events.length === 2 && <span role="columnheader">Invited to</span>}
              {events.map((e) => <span role="columnheader" key={e.key}>{shortLabel(e.name)}</span>)}
              <span role="columnheader">Seats</span>
              {questions.map((q) => <span role="columnheader" key={q.key}>{answerLabel(q.key)}</span>)}
              <span role="columnheader">Dietary</span>
              <span role="columnheader">Last text</span>
            </div>
            {shown.map((g) => (
              <div
                key={g.id}
                role="row"
                tabIndex={0}
                onClick={() => openGuest(g.id)}
                onKeyDown={(e) => e.key === 'Enter' && openGuest(g.id)}
                className="grid gap-3 items-center py-3 px-[18px] border-b border-[var(--adm-line,#ece3cc)] cursor-pointer hover:bg-[var(--adm-tint,#f3ecdc)]"
                style={{ gridTemplateColumns: cols }}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{g.people[0]?.name || 'New guest'}</span>
                  {g.people.length > 1 && (
                    <span className="block text-[12px] text-[var(--adm-muted,#5b6a52)] overflow-hidden text-ellipsis whitespace-nowrap">with {g.people.slice(1).map((p) => p.name).join(', ')}</span>
                  )}
                </span>
                <span className="text-[13px] tabular-nums" style={{ color: g.phone ? '#33402f' : '#8a5a45' }}>{g.phoneDisplay || 'No mobile'}</span>
                {events.length === 2 && (
                  <select
                    aria-label="Invited to"
                    value={g.invited.length === 2 ? 'all' : g.invited[0] ?? ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => void setInvited(g, e.target.value === 'all' ? events.map((x) => x.key) : [e.target.value])}
                    className="py-[5px] px-[6px] border border-[var(--adm-line,#d3c6a4)] rounded-[8px] bg-[var(--adm-card,#fbf8f2)] text-[13px] text-[var(--adm-text,#33402f)] cursor-pointer"
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
                <span className="text-[12px] text-[var(--adm-muted,#5b6a52)]">{g.lastSms ? `${g.lastSms.name} · ${fmtWhen(g.lastSms.at, tz)}` : g.phone ? 'Not invited yet' : 'No mobile'}</span>
              </div>
            ))}
            {data && shown.length === 0 && (guests.length ? <div className="py-10 px-[18px] text-center text-[var(--adm-muted,#5b6a52)]">No guests match.</div> : <FirstGuests onAdd={addGuest} onImport={() => setImporting(true)} />)}
          </div>
        </div>
      )}

      {open && (
        <GuestDrawer
          wid={wid}
          id={open}
          tz={tz}
          isNew={open === fresh}
          onClose={closeGuest}
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

/** No guests yet: what to do first, not "No guests match". */
function FirstGuests({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="py-10 px-[18px] flex flex-col items-center gap-3 text-center">
      <strong className="text-[17px] font-semibold text-[var(--adm-text,#33402f)]">No guests yet</strong>
      <span className="text-[15px] text-[var(--adm-muted,#5b6a52)] max-w-[420px]">Add your first household (everyone on one invitation shares a link), or bring your whole list in from a spreadsheet.</span>
      <span className="flex gap-2 flex-wrap justify-center">
        <Pill kind="primary" onClick={onAdd}>
          Add your first guests
        </Pill>
        <Pill onClick={onImport}>Import a spreadsheet</Pill>
      </span>
    </div>
  );
}

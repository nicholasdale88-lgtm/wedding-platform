import { circleSuggestions, contactGaps, GAP_LABEL } from '@wp/shared';
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, type EventInfo, type Guest, type BulkSet } from '../lib/api';
import { fmtWhen, shortLabel } from '../lib/format';
import { fileName } from '../lib/csv';
import { downloadDressed } from './exportLook';
import { GuestDrawer } from './GuestDrawer';
import { exportSheets, labelRows } from './guestImport';
import { ImportContacts } from './ImportContacts';
import { ImportGuests } from './ImportGuests';
import { ManualSend } from './ManualSend';
import { answerLabel, applyFilters, dropdowns, quickFilters, shortAnswer, type FilterState } from './guestFilters';
import { BulkTies, TieChips, useSideLabels } from './GuestTies';
import { useOpenParam } from './openParam';
import { useAdmin, useSectionName } from './Shell';
import { Eyebrow, Pill, StatusPill, useAutoRefresh, useMedia, useToast } from './ui';

const FILTER_KEYS = ['filter', 'q', 'inv', 'diet', 'seat', 'mob', 'size', 'by', 'side', 'rel', 'circle', 'sort'] as const;

type GuestsData = { events: EventInfo[]; guests: Guest[]; links?: Record<string, string> };
/** The list as last loaded, per wedding (for coming back to Guests). */
const listCache = new Map<string, GuestsData>();

/** design/RSVP Admin.dc.html → Guests. Filters live in the address bar, so they survive a reload and can be shared. */
export function Guests() {
  const { wid, overview, reload: reloadOverview, event: chosen } = useAdmin();
  const section = useSectionName();
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const toast = useToast();
  const mob = useMedia('(max-width: 759px)');
  const [params, setParams] = useSearchParams();
  // Coming back to Guests shows the list as last seen while it refreshes (no blank screen).
  const [data, setData] = useState<GuestsData | null>(() => listCache.get(wid) ?? null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [contacts, setContacts] = useState(false); // Import contacts (phone or a contacts file)
  const [manual, setManual] = useState<false | 'unreachable' | 'phone'>(false);
  const [fresh, setFresh] = useState(''); // the guest "Add guest" just made
  const [more, setMore] = useState(false); // phones: Import, Export and Send without SMS under More
  const [filtersOpen, setFiltersOpen] = useState(false); // phones: the dropdown filters under Filters (n)
  // Select: tick guests, then set their side, how they know you or a circle all at once.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false); // the missing-details banner: one line until opened
  const { labels: sideNames } = useSideLabels();

  // Only the newest load counts (an older one answering late can't put back older data), and an answer
  // that changes nothing doesn't redraw the list.
  const seq = useRef(0);
  const lastJson = useRef('');
  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const d = await api.guests(wid);
      if (n !== seq.current) return;
      listCache.set(wid, d);
      const j = JSON.stringify(d);
      if (j !== lastJson.current) {
        lastJson.current = j;
        setData(d);
      }
      setError('');
    } catch (e) {
      if (n === seq.current) setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => {
    void load();
  }, [load]);

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
  // New replies appear by themselves, but not while a guest's details are open over the list.
  useAutoRefresh(load, 120_000, !open);
  // The search box answers each key at once; the address bar (and the filtering) catch up a moment later.
  const [q, setQ] = useState(state.q);
  const dq = useDeferredValue(q);
  const wrote = useRef(state.q); // what the box last put in the address bar
  useEffect(() => {
    if (q === wrote.current) return;
    const t = window.setTimeout(() => {
      wrote.current = q;
      set({ q });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]); // eslint-disable-line
  // Changed from elsewhere (Clear filters, Back): the box follows.
  useEffect(() => {
    if (state.q !== wrote.current) {
      wrote.current = state.q;
      setQ(state.q);
    }
  }, [state.q]);

  // The guest list is joint by default; "just this event" narrows it to the sidebar's event.
  const focusEv = data?.events.find((e) => e.key === chosen);
  // Account: everyone. An event's section: that event's guests, with everyone one tap away.
  const one = params.get('show') !== 'all' && !!focusEv;
  const events = one ? [focusEv!] : (data?.events ?? []);
  // In an event, each guest is shown as invited to this event only, so Awaiting, Declined and the rest mean this event.
  // A guest still blank (just added: no name, mobile or email) isn't listed or counted until something's typed
  // in; their details are open to fill in, and a blank one is removed when closed.
  const blank = (g: Guest) => !g.people.some((p) => p.name.trim()) && !g.phone && !(g.email ?? '').trim();
  const guests = (data?.guests ?? [])
    .filter((g) => !blank(g))
    .filter((g) => !one || g.invited.includes(focusEv!.key))
    .map((g) => (one ? { ...g, invited: [focusEv!.key] } : g));
  const shown = useMemo(() => (data ? applyFilters(guests, events, { ...state, q: dq }) : []), [data, params, chosen, dq]);
  const quick = quickFilters(events);
  const circles = circleSuggestions((data?.guests ?? []).map((g) => g.circles ?? []));
  const drops = dropdowns(events, { sides: sideNames, circles }).filter((d) => d.key !== 'circle' || circles.length > 0);
  const tap = (id: string) => {
    if (!picking) return openGuest(id);
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const tick = (id: string) => (picking ? <span aria-hidden="true" className="mr-[6px]">{picked.has(id) ? '☑' : '☐'}</span> : null);
  const stopPicking = () => {
    setPicking(false);
    setPicked(new Set());
  };
  async function bulk(b: BulkSet) {
    setBulkBusy(true);
    try {
      const r = await api.bulkGuests(wid, { ...b, ids: [...picked] });
      const f = r.flagged ?? [];
      const few = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} and ${xs.length - 4} more` : xs.join(', '));
      toast(
        `Saved for ${r.updated} ${r.updated === 1 ? 'guest' : 'guests'}.${f.length ? ` Check ${f.length}: ${few(f.map((x) => `${x.name} (${x.gaps.map((k) => GAP_LABEL[k].toLowerCase()).join(', ')})`))}.` : ''}`,
      );
      await changed();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }
  // Who can't be reached the way their invitation is set to go (no mobile for texts, no email, no address for post).
  // A guest just added and not filled in yet (no name) isn't flagged: they're still being typed in.
  const gapped = guests
    .filter((g) => g.people.some((p) => p.name.trim()))
    .map((g) => ({ g, gaps: contactGaps({ ...g, phone: g.phone ?? null }) }))
    .filter((x) => x.gaps.length);
  // Grouped by side (Sort → Grouped by side): a heading where each side starts, with how many invitations.
  const sideOf = (g: Guest) => g.side ?? '';
  const sideHead = (i: number) => {
    if (state.sort !== 'side') return '';
    const k = sideOf(shown[i]!);
    if (i > 0 && sideOf(shown[i - 1]!) === k) return '';
    const n = shown.filter((g) => sideOf(g) === k).length;
    return `${(k && (sideNames as Record<string, string>)[k]) || 'Side not set'} · ${n}`;
  };
  const anyFilter = FILTER_KEYS.some((k) => k !== 'sort' && k !== 'filter' && state[k]) || state.filter !== 'all';
  const questions = events.flatMap((e) => e.questions.filter((q) => q.type === 'choice').map((q) => ({ event: e.key, key: q.key })));

  // After a change: the list straight away; the overview's figures a moment later (one reload for a run of changes).
  const ovTimer = useRef<number | undefined>(undefined);
  const changed = async () => {
    window.clearTimeout(ovTimer.current);
    ovTimer.current = window.setTimeout(() => void reloadOverview(), 1200);
    await load();
  };

  /** Swiped left and tapped Delete: the whole invitation goes (after a yes). */
  async function removeGuest(g: Guest) {
    const who = g.people.map((p) => p.name.trim()).filter(Boolean).join(' & ') || 'this guest';
    if (!window.confirm(`Delete ${who} from your guest list? Their reply and seat go too.`)) return;
    try {
      await api.removeGuest(wid, g.id);
      toast(`Deleted ${who}`);
      await changed();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const addingNow = useRef(false);
  async function addGuest() {
    if (addingNow.current) return; // a double tap makes one guest, not two
    addingNow.current = true;
    try {
      // A new guest is invited to every event (untick one in their details if they're not coming to it).
      const d = await api.addGuest(wid);
      // Their full details open at once; the list catches up behind them (no waiting, no jumping about).
      setFresh(d.guest.id);
      openGuest(d.guest.id);
      void changed();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      addingNow.current = false;
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
    // Shown at once; saved behind it (put back by the reload if the save fails).
    setData((d) => d && { ...d, guests: d.guests.map((x) => (x.id === g.id ? { ...x, invited } : x)) });
    lastJson.current = ''; // the next load always redraws (so a failed save is put back)
    try {
      await api.patchGuest(wid, g, { invited });
      toast('Saved');
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Updated elsewhere, reloaded.' : (e as Error).message);
    }
    await changed();
  }

  if (error) return <p role="alert" className="text-[#8a5a45]">{error}</p>;
  const labels = labelRows(guests);
  const byPost = guests.filter((g) => g.delivery === 'post').length;
  const seatsHeld = guests.reduce((n, g) => n + g.seatsHeld, 0);
  const kids = guests.reduce((n, g) => n + g.people.filter((p) => p.child).length, 0);
  const cols = `minmax(200px,1.5fr) 128px ${events.length === 2 ? '118px ' : ''}${events.map(() => '104px').join(' ')} 84px ${questions.map(() => '82px').join(' ')} minmax(170px,1.4fr) 150px`;

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex items-end justify-between gap-5 flex-wrap">
        <div>
          <Eyebrow>{section} · Guests</Eyebrow>
          <h1 className="mt-[6px] mb-0 font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08] min-h-[43px]">
            {data ? (guests.length ? `${seatsHeld} guests on ${guests.length} invitations` : 'Your guest list') : ''}
            {kids > 0 && <span className="block text-[15px] font-sans font-normal text-[var(--adm-muted,#5b6a52)] mt-1">{`${kids} ${kids === 1 ? 'child' : 'children'}, ${Math.max(0, seatsHeld - kids)} adults`}</span>}
          </h1>
          {labels.length > 0 && (
            <span className="block mt-1 text-[13px] text-[var(--adm-muted,#5b6a52)]">
              {labels.length} printed {labels.length === 1 ? 'invitation' : 'invitations'}
              {byPost ? ` · ${byPost} by post only (no texts or emails)` : ''}
              {labels.some((l) => !l.lines.length) ? ` · ${labels.filter((l) => !l.lines.length).length} still need an address` : ''}
            </span>
          )}
        </div>
        <div className="relative flex gap-[10px] flex-wrap">
          {/* Phones: one main action, the rest under More. */}
          {(!mob || more) && (
            <div className={mob ? 'absolute right-0 top-[calc(100%+6px)] z-[14] flex flex-col gap-2 p-3 rounded-[14px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f2)] shadow-[0_8px_24px_rgba(51,64,47,.16)] min-w-[220px]' : 'contents'}>
              <Pill onClick={() => (setMore(false), setManual((x) => (x === 'phone' ? false : 'phone')))}>Send from my own phone (free)</Pill>
              <Pill onClick={() => (setMore(false), setManual((x) => (x === 'unreachable' ? false : 'unreachable')))}>Share invitation links yourself</Pill>
              <Pill onClick={() => (setMore(false), setImporting((x) => !x))}>Import</Pill>
              <Pill onClick={() => (setMore(false), setContacts((x) => !x))}>Import contacts</Pill>
              <Pill disabled={!labels.length} onClick={() => (setMore(false), printLabels(labels, overview?.wedding.slug ?? 'wedding'))} title="A printable A4 sheet of address labels for everyone getting a printed invitation">
                Address labels
              </Pill>
              <Pill disabled={!labels.length} onClick={() => (setMore(false), void downloadDressed(wid, overview, fileName(overview?.wedding.slug ?? 'wedding', 'address-labels', 'xlsx'), 'Addresses', [{ name: 'Addresses', rows: [['To', 'Address line 1', 'Address line 2', 'Address line 3', 'Address line 4'], ...labels.map((l) => [l.to, ...l.lines])] }]))}>
                Address list (Excel)
              </Pill>
              <Pill
                disabled={!guests.length}
                onClick={() => {
                  setMore(false);
                  void downloadDressed(wid, overview, fileName(overview?.wedding.slug ?? 'wedding', 'guests', 'xlsx'), 'Guest list', exportSheets(guests, events, data?.links, overview?.wedding), events.map((e) => e.key));
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
          <Pill aria-pressed={picking} disabled={!guests.length} onClick={() => (picking ? stopPicking() : setPicking(true))}>
            {picking ? 'Stop selecting' : 'Select'}
          </Pill>
          <Pill kind="primary" onClick={addGuest}>Add guest</Pill>
        </div>
      </header>

      {contacts && data && <ImportContacts guests={data.guests} events={data.events} focus={focusEv} onClose={() => setContacts(false)} onDone={changed} />}
      {importing && data && <ImportGuests events={data.events} focus={focusEv} onClose={() => setImporting(false)} onDone={changed} />}
      {manual && data && <ManualSend key={manual} mode={manual} guests={guests} links={data.links ?? {}} onClose={() => setManual(false)} />}

      {gapped.length > 0 && (
        // Rolled up to one line: how many can't be reached and why; expand for each guest (tap one to fix it).
        <section aria-label="Guests who can't be reached" className="rounded-[12px] border border-[#d9b8a6] bg-[#f6ebe4] text-[14px]">
          <button type="button" aria-expanded={gapsOpen} onClick={() => setGapsOpen((x) => !x)} className="w-full flex gap-2 items-center flex-wrap py-2 px-3 border-0 bg-transparent text-left cursor-pointer">
            <span aria-hidden className={`text-[#7a4a37] transition-transform ${gapsOpen ? 'rotate-90' : ''}`}>▸</span>
            <strong className="font-semibold text-[#7a4a37]">
              {gapped.length} {gapped.length === 1 ? 'guest' : 'guests'} missing details
            </strong>
            <span className="text-[13px] text-[#7a4a37]">
              {(Object.keys(GAP_LABEL) as (keyof typeof GAP_LABEL)[])
                .map((k) => [k, gapped.filter((x) => x.gaps.includes(k)).length] as const)
                .filter(([, n]) => n)
                .map(([k, n]) => `${n} ${GAP_LABEL[k].replace(/^Needs /, 'need ').toLowerCase()}`)
                .join(' · ')}
            </span>
            <span className="ml-auto text-[12px] underline text-[#7a4a37]">{gapsOpen ? 'Hide' : 'Show'}</span>
          </button>
          {gapsOpen && (
          <div className="flex flex-col gap-2 px-3 pb-3">
            <span className="text-[13px]">Tap a guest to add what’s missing, or change how their invitation goes (Select, then Invitation by or Messages by).</span>
            <ul className="m-0 p-0 list-none flex flex-col max-h-[40vh] overflow-y-auto border-t border-[#e6cdbf]">
              {gapped.map(({ g, gaps }) => (
                <li key={g.id} className="border-b border-[#e6cdbf]">
                  <button type="button" onClick={() => openGuest(g.id)} className="w-full flex justify-between gap-3 py-2 px-1 border-0 bg-transparent text-left cursor-pointer text-[14px] text-[var(--adm-ink,#33402f)]">
                    <span className="font-medium">{g.people[0]?.name || 'New guest'}</span>
                    <span className="text-[13px] text-[#7a4a37]">{gaps.map((k) => GAP_LABEL[k]).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          )}
        </section>
      )}

      {picking && (
        <BulkTies count={picked.size} options={circles} busy={bulkBusy} onApply={(b) => void bulk(b)} onAll={() => setPicked(new Set(shown.map((g) => g.id)))} onDone={stopPicking} />
      )}

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
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
        {/* One tap: the list grouped by side (the bride's, the groom's, both, not set), each with a heading. */}
        <button
          type="button"
          aria-pressed={state.sort === 'side'}
          onClick={() => set({ sort: state.sort === 'side' ? '' : 'side' })}
          className={`py-[6px] px-3 rounded-full border text-[12px] cursor-pointer ${state.sort === 'side' ? 'border-[#33402f] bg-[#33402f] text-[#f3ecd6]' : 'border-[var(--adm-line,#c6b794)] bg-transparent text-[var(--adm-ink,#33402f)]'}`}
        >
          {state.sort === 'side' ? 'Grouped by side ✓' : 'Group by side'}
        </button>
        {(anyFilter || q) && (
          <button
            onClick={() => {
              wrote.current = '';
              setQ('');
              set(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])));
            }} className="py-[6px] px-3 rounded-full border border-dashed border-[#8a9670] bg-transparent text-[#5d6b47] text-[12px] cursor-pointer">
            Clear filters
          </button>
        )}
      </div>

      {mob ? (
        <div className="flex flex-col border-t-2 border-[var(--adm-text,#33402f)]">
          {shown.map((g, i) => (
            <Fragment key={g.id}>
            {sideHead(i) && <h3 className="m-0 pt-4 pb-1 text-[12px] font-semibold tracking-[.14em] uppercase text-[var(--adm-muted,#5b6a52)] border-b border-[var(--adm-line,#e2d7bc)]">{sideHead(i)}</h3>}
            <SwipeToDelete label={g.people[0]?.name || 'New guest'} off={picking} onDelete={() => void removeGuest(g)}>
            <button aria-pressed={picking ? picked.has(g.id) : undefined} onClick={() => tap(g.id)} className="w-full flex flex-col gap-[6px] py-[14px] px-[2px] border-0 border-b border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-bg,#fbf8f2)] text-left cursor-pointer">
              <span className="flex justify-between gap-[10px] items-baseline w-full">
                <strong className="font-semibold text-[15px]">{tick(g.id)}{g.people[0]?.name || 'New guest'}</strong>
                <span className="text-[12px] text-[var(--adm-muted,#5b6a52)] whitespace-nowrap">{seats(g)}</span>
              </span>
              {g.people.length > 1 && <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">with {g.people.slice(1).map((p) => p.name).join(', ')}</span>}
              <span className="flex gap-[6px] flex-wrap items-center">
                <span className="text-[12px] text-[var(--adm-muted,#5b6a52)]">{events.filter((e) => g.invited.includes(e.key)).map((e) => shortLabel(e.name)).join(' · ')}</span>
                {events.map((e) => <StatusPill key={e.key} invited={g.invited.includes(e.key)} attending={g.rsvp[e.key]?.attending} />)}
              </span>
              <TieChips g={g} />
              {g.people.some((p) => p.name.trim()) && contactGaps(g).length > 0 && <span className="text-[12px] font-semibold text-[#7a4a37]">{contactGaps(g).map((k) => GAP_LABEL[k]).join(' · ')}</span>}
            </button>
            </SwipeToDelete>
            </Fragment>
          ))}
          {data && shown.length === 0 && (guests.length ? <div className="py-10 text-center text-[var(--adm-muted,#5b6a52)]">No guests match. Clear the search or filters to see everyone.</div> : <FirstGuests onAdd={addGuest} onImport={() => setImporting(true)} />)}
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
            {shown.map((g, i) => (
              <Fragment key={g.id}>
              {sideHead(i) && (
                <div role="row" className="py-2 px-[18px] bg-[var(--adm-tint,#f3ecd9)] border-b border-[var(--adm-line,#e2d7bc)]">
                  <span role="columnheader" className="text-[12px] font-semibold tracking-[.14em] uppercase text-[var(--adm-muted,#5b6a52)]">{sideHead(i)}</span>
                </div>
              )}
              <div
                role="row"
                tabIndex={0}
                aria-selected={picking ? picked.has(g.id) : undefined}
                onClick={() => tap(g.id)}
                onKeyDown={(e) => e.key === 'Enter' && tap(g.id)}
                className="grid gap-3 items-center py-3 px-[18px] border-b border-[var(--adm-line,#ece3cc)] cursor-pointer hover:bg-[var(--adm-tint,#f3ecdc)]"
                style={{ gridTemplateColumns: cols }}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{tick(g.id)}{g.people[0]?.name || 'New guest'}</span>
                  {g.people.length > 1 && (
                    <span className="block text-[12px] text-[var(--adm-muted,#5b6a52)] overflow-hidden text-ellipsis whitespace-nowrap">with {g.people.slice(1).map((p) => p.name).join(', ')}</span>
                  )}
                  <TieChips g={g} />
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
              </Fragment>
            ))}
            {data && shown.length === 0 && (guests.length ? <div className="py-10 px-[18px] text-center text-[var(--adm-muted,#5b6a52)]">No guests match. Clear the search or filters to see everyone.</div> : <FirstGuests onAdd={addGuest} onImport={() => setImporting(true)} />)}
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
          circleOptions={circles}
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

/** A printable A4 sheet of address labels (3 across, 7 down: the usual 21-label sheet). */
function printLabels(labels: { to: string; lines: string[] }[], slug: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const ent: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ent[c] ?? c);
  const cells = labels.map((l) => `<div class="l"><strong>${esc(l.to)}</strong>${l.lines.map((x) => `<br>${esc(x)}`).join('')}</div>`).join('');
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(slug)} address labels</title><style>
@page{size:A4;margin:15mm 7mm}body{margin:0;font:11pt/1.35 Georgia,serif;color:#000}
.s{display:grid;grid-template-columns:repeat(3,63.5mm);grid-auto-rows:38.1mm;column-gap:2.5mm}
.l{padding:5mm 4mm;overflow:hidden;box-sizing:border-box;break-inside:avoid}
@media screen{.l{outline:1px dashed #ccc}}
</style></head><body><div class="s">${cells}</div><script>window.onload=function(){window.print()}</script></body></html>`,
  );
  w.document.close();
}

/** No guests yet: what to do first, not "No guests match". */
function FirstGuests({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="py-10 px-[18px] flex flex-col items-center gap-3 text-center">
      <strong className="text-[17px] font-semibold text-[var(--adm-text,#33402f)]">No guests yet</strong>
      <span className="text-[15px] text-[var(--adm-muted,#5b6a52)] max-w-[420px]">Add your first household (everyone on one invitation shares a link), bring your whole list in from a spreadsheet, or use Import contacts to pick people from your phone.</span>
      <span className="flex gap-2 flex-wrap justify-center">
        <Pill kind="primary" onClick={onAdd}>
          Add your first guests
        </Pill>
        <Pill onClick={onImport}>Import a spreadsheet</Pill>
      </span>
    </div>
  );
}

/**
 * Phones: slide a guest to the left to show Delete (as in Mail and Messages); slide back, or tap elsewhere, to
 * hide it. A small sideways move is still a tap, and up-and-down still scrolls the list.
 */
function SwipeToDelete({ label, off, onDelete, children }: { label: string; off: boolean; onDelete: () => void; children: ReactNode }) {
  const W = 92;
  const [x, setX] = useState(0);
  const start = useRef<{ x: number; y: number; from: number; side: boolean | null } | null>(null);
  // Always the same wrapper (switching Select on or off doesn't rebuild every row); while off, no swiping.
  useEffect(() => {
    if (off) setX(0);
  }, [off]);
  return (
    <div className="relative overflow-hidden">
      {!off && (
      <button
        type="button"
        aria-label={`Delete ${label}`}
        tabIndex={x ? 0 : -1}
        onClick={() => {
          setX(0);
          onDelete();
        }}
        className="absolute inset-y-0 right-0 border-0 bg-[#9b3d2c] text-white text-[14px] font-semibold cursor-pointer"
        style={{ width: W }}
      >
        Delete
      </button>
      )}
      <div
        className="relative"
        style={{ transform: `translateX(${x}px)`, transition: start.current ? 'none' : 'transform .2s ease', touchAction: 'pan-y' }}
        onTouchStart={(e) => {
          if (off) return;
          const t = e.touches[0]!;
          start.current = { x: t.clientX, y: t.clientY, from: x, side: null };
        }}
        onTouchMove={(e) => {
          const s0 = start.current;
          if (!s0) return;
          const t = e.touches[0]!;
          const dx = t.clientX - s0.x;
          const dy = t.clientY - s0.y;
          if (s0.side === null && Math.hypot(dx, dy) > 8) s0.side = Math.abs(dx) > Math.abs(dy);
          if (s0.side) setX(Math.max(-W - 20, Math.min(0, s0.from + dx)));
        }}
        onTouchEnd={() => {
          const s0 = start.current;
          start.current = null;
          if (s0?.side) setX((v) => (v < -W / 2 ? -W : 0));
        }}
        onClickCapture={(e) => {
          // Open: a tap closes it rather than opening the guest.
          if (x) {
            e.stopPropagation();
            e.preventDefault();
            setX(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

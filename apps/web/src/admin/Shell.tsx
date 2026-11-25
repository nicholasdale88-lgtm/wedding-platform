import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AskAnywhere } from './AskAnywhere';
import { DemoBar } from '../try/DemoBar';
import { DEMO_WID } from '../try/demoMode';
import { themeOf } from '../guest/themeKit';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Me, type Overview } from '../lib/api';
import { resetMeCache } from '../lib/ProfileSwitch';
import { rememberPlace } from '../lib/places';
import { coupleName } from '../lib/remember';
import { DEFAULT_LOOK, lookVars } from './AdminLook';
import { confirmLeave, LeaveGuard } from './leave';
import { TellUs } from './TellUs';
import { Pill, useAutoRefresh, useMedia } from './ui';
import { initialsOf, sealDate, sealWords, WaxSeal } from '../guest/invitation/WaxSeal';

/** The sidebar and the phone's top bar: the admin's ink, lit softly from the top and deepening downwards. */
const SIDE = 'radial-gradient(420px 260px at 20% -40px, rgba(255,240,225,.16), transparent 70%), linear-gradient(180deg, transparent, rgba(0,0,0,.22))';

/**
 * Their own wax seal (the colour, design and words chosen for the invitation), beside their names.
 * It opens Setup → Invitation → Envelope and seal, where it's chosen; it lifts a little under the pointer.
 */
function HeaderSeal({ o, px, path }: { o: Overview | null; px: number; path: (tab: string, event?: string) => string }) {
  if (!o) return <span aria-hidden className="block flex-none" style={{ width: px, height: px }} />;
  const first = o.events[0];
  const s = o.wedding.seal ?? { colour: 'Sandstone' as const, design: {} };
  const words = sealWords(s.design, initialsOf(o.wedding.monogram, o.wedding.name1, o.wedding.name2), sealDate(first?.startsAt, o.wedding.timezone));
  const seal = (
    <span className="relative block" style={{ width: px, height: px }}>
      <WaxSeal colour={s.colour} design={s.design} words={words} px={px} still />
    </span>
  );
  const look = 'block flex-none rounded-full transition-[transform,filter] duration-200 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.45))_drop-shadow(0_4px_6px_rgba(0,0,0,.25))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6b780]';
  if (!first) return <span aria-hidden className={look}>{seal}</span>;
  return (
    <Link
      to={`${path('pages', first.key)}?page=invitation&open=seal`}
      onClick={(e) => {
        if (!confirmLeave()) e.preventDefault();
      }}
      aria-label="Your wax seal: change it"
      title="Your wax seal: tap to change it"
      className={`${look} hover:-translate-y-[2px] hover:rotate-[-6deg] hover:[filter:drop-shadow(0_6px_8px_rgba(0,0,0,.4))_drop-shadow(0_0_10px_rgba(214,183,128,.45))]`}
    >
      {seal}
    </Link>
  );
}

/** Shared wedding summary: nav badges, sidebar footer and the Overview tab all read it. */
interface AdminData {
  wid: string;
  overview: Overview | null;
  error: string;
  reload: () => Promise<void>;
  /** The event the admin is looking at (from the address: /admin/:wid/:section/:tab); ALL_EVENTS in Account. */
  event: string;
  /** The address of a tab, in this section or another event's ("account" or an event key). */
  path: (tab: string, event?: string) => string;
  /** The last overview seen for each section (event key, or ALL_EVENTS), shown at once when switching back. */
  seen?: Map<string, Overview>;
}
const Ctx = createContext<AdminData>({ wid: '', overview: null, error: '', reload: async () => {}, event: '', path: (t) => t });
export const useAdmin = () => useContext(Ctx);

/** Account (everything shared by every event): `event` is ALL_EVENTS there, "account" in the address. */
export const ALL_EVENTS = 'all';
export const ACCOUNT = 'account';
export const sectionOf = (event: string | undefined) => (!event || event === ALL_EVENTS ? ACCOUNT : event);
const EVENT_KEY = (wid: string) => `wp.admin.event.${wid}`;
/** The section last open on this device, for /admin/:wid only; the address is what counts everywhere else. */
export const lastSection = (wid: string) => {
  try {
    return localStorage.getItem(EVENT_KEY(wid)) || ACCOUNT;
  } catch {
    return ACCOUNT;
  }
};

export function AdminDataProvider({ wid, section, children, onSignedOut }: { wid: string; section: string; children: ReactNode; onSignedOut: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const event = section === ACCOUNT ? ALL_EVENTS : section;
  useEffect(() => {
    try {
      localStorage.setItem(EVENT_KEY(wid), section);
    } catch {
      /* the address still says where you are */
    }
  }, [wid, section]);
  // Only the latest request lands: switching section quickly never shows the previous event's figures.
  const seq = useRef(0);
  const seen = useRef(new Map<string, Overview>());
  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const o = await api.overview(wid, event !== ALL_EVENTS ? event : undefined);
      seen.current.set(o.focus ?? ALL_EVENTS, o);
      if (n !== seq.current) return;
      setOverview(o);
      setError('');
    } catch (e) {
      if (n !== seq.current) return;
      if (e instanceof ApiError && e.status === 401) return onSignedOut();
      setError((e as Error).message);
    }
  }, [wid, event, onSignedOut]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useAutoRefresh(reload); // Overview figures and nav badges stay current
  const path = useCallback((tab: string, ev?: string) => `/admin/${wid}/${sectionOf(ev ?? event)}/${tab}`, [wid, event]);
  // While a section's own figures load, the overview last seen for it (so switching doesn't blank the page).
  const shown = overview && (overview.focus ?? ALL_EVENTS) !== event ? (seen.current.get(event) ?? overview) : overview;
  // The same value until something in it changes (a new one each render redrew every screen using it).
  const value = useMemo(() => ({ wid, overview: shown, error, reload, event, path, seen: seen.current }), [wid, shown, error, reload, event, path]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Overview data for the section in the address (not one still loading for the section you just left). */
export function useSectionOverview(): Overview | null {
  const { overview: o, event, seen } = useAdmin();
  return o && (o.focus ?? ALL_EVENTS) === event ? o : (seen?.get(event) ?? null);
}

/**
 * The admin's menu. "Account": everything shared by every event (the overview of all of them, messages
 * and the texting setup). Then one section per event with its own guests, dietary needs, texts, seating,
 * photos and setup; the first event's section also holds the invitation (in Setup) and the Wedding planner. The section is in the address
 * (/admin/:wid/:section/:tab), and opening one looks at that event everywhere (and turns the birthday blue).
 */
export const ACCOUNT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'messages', label: 'Messages' },
  { key: 'settings', label: 'Settings' }, // texting, your sign-in, backup, admin look
  { key: 'help', label: 'Help' }, // how to do each thing, step by step
] as const;
export const EVENT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'planner', label: 'Plan' }, // the first event's section only (budget, vendors, assistant…)
  { key: 'guests', label: 'Guest list' }, // guest list, dietary and seating together (GuestPlanningBar)
  { key: 'messages', label: 'Messages' }, // this event's guests' messages (Account has the overview)
  { key: 'party', label: 'Wedding party' }, // the first event's section only (its views open under it)
  { key: 'day', label: 'Party checklist' }, // every other event (a birthday has no wedding party)
  { key: 'texts', label: 'Texts' },
  { key: 'photos', label: 'Photos' },
  { key: 'pages', label: 'Invitation' },
] as const;
/** Every admin route (Events stays reachable by link; its work now lives in Overview and Setup). */
export const TABS = [
  ...ACCOUNT_TABS,
  ...EVENT_TABS,
  { key: 'dietary', label: 'Meals & allergies' },
  { key: 'seating', label: 'Seating' },
  { key: 'events', label: 'Events' },
  { key: 'look', label: 'Colours' }, // now Settings → Profile → Colours
  { key: 'rehearsal', label: 'Rehearsal' }, // the D-Day dry run: linked from the Overviews and Help
] as const;
export type TabKey = (typeof TABS)[number]['key'];

type MenuKey = 'home' | 'guests' | 'invitation' | 'plan' | 'settings';
type SubItem = { key: string; label: string; to: string; on: boolean; badge?: string };
type MenuItem = { key: MenuKey; label: string; icon: string; to: string; on: boolean; badge?: string; children: SubItem[] };

/** Which of the five a page belongs to (old pages included: they open in their place). */
const MENU_OF: Record<string, MenuKey> = {
  overview: 'home',
  guests: 'guests',
  dietary: 'guests',
  seating: 'guests',
  messages: 'guests',
  texts: 'guests',
  pages: 'invitation',
  photos: 'invitation',
  planner: 'plan',
  party: 'plan',
  day: 'plan',
  rehearsal: 'plan',
  settings: 'settings',
  help: 'settings',
  look: 'settings',
  events: 'home',
};

/**
 * The couple's menu (launch simplification, Job 1): five items, the same on a phone and a computer: Home,
 * Guests, Invitation, Plan, Settings. A switched-on tool appears inside its place, never as a sixth item:
 * Messages and texts (once credits are bought) under Guests, photos under Invitation, the wedding party under
 * Plan. More than one event: the header's switcher picks which (the menu stays five). Every old address still
 * works; Account's pages open under Settings, and Account's overview is reached from Settings, not the menu.
 */
function useMenu() {
  const { tab = 'overview' } = useParams();
  const { overview: o, event, path } = useAdmin();
  const first = o?.events[0]?.key ?? 'wedding';
  const ev = event !== ALL_EVENTS && o?.events.some((e) => e.key === event) ? event : first;
  const isFirst = ev === first;
  const tools = o?.tools?.on;
  const shows = (k: 'texts' | 'photos' | 'party') => (tools ? tools[k] : true);
  const where: MenuKey = event === ALL_EVENTS && tab === 'overview' ? 'settings' : (MENU_OF[tab] ?? 'home');
  const sub = (key: string, label: string, to: string, badge?: string): SubItem => ({ key, label, to, on: tab === key, badge });
  const items: MenuItem[] = [
    { key: 'home', label: 'Home', icon: 'overview', to: path('overview', ev), on: where === 'home', children: [] },
    {
      key: 'guests',
      label: 'Guests',
      icon: 'guests',
      to: path('guests', ev),
      on: where === 'guests',
      badge: o ? String(o.perEvent?.find((e) => e.key === ev)?.guests ?? o.nav.guests) : '',
      children: [sub('messages', 'Messages', path('messages', ev), o?.nav.messages ? String(o.nav.messages) : ''), ...(shows('texts') ? [sub('texts', 'Texts', path('texts', ev))] : [])],
    },
    { key: 'invitation', label: 'Invitation', icon: 'pages', to: path('pages', ev), on: where === 'invitation', children: shows('photos') ? [sub('photos', 'Photos', path('photos', ev))] : [] },
    {
      key: 'plan',
      label: 'Plan',
      icon: 'planner',
      to: isFirst ? path('planner', first) : path('day', ev),
      on: where === 'plan',
      children: isFirst && shows('party') ? [sub('party', 'Wedding party', path('party', first))] : [],
    },
    { key: 'settings', label: 'Settings', icon: 'settings', to: path('settings', ALL_EVENTS), on: where === 'settings', children: [] },
  ];
  return { items, ev, tab };
}

const ring = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3ecd6]';

/** The computer's sidebar menu: five items; the current one a cream tinted pill; its tools nested under it. */
function SideNav() {
  const { items } = useMenu();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-[2px] flex-none overflow-y-auto [scrollbar-width:none]">
      {items.map((m) => (
        <div key={m.key} className="flex flex-col gap-[2px]">
          <Link
            to={m.to}
            aria-current={m.on ? 'page' : undefined}
            onClick={(e) => {
              if (!confirmLeave()) e.preventDefault();
            }}
            className={`flex items-center justify-between gap-[10px] min-h-[44px] py-[9px] px-3 rounded-[10px] text-[15px] no-underline ${ring} ${
              m.on ? 'bg-[var(--adm-tint,#f3ecd6)] !text-[var(--adm-ink,#33402f)] font-semibold' : 'bg-transparent !text-[#f3ecd6] hover:bg-[rgba(243,236,214,.08)]'
            }`}
          >
            <span>{m.label}</span>
            {m.badge && <span className="text-[12px] tabular-nums opacity-80">{m.badge}</span>}
          </Link>
          {m.children.map((s) => (
            <Link
              key={s.key}
              to={s.to}
              aria-current={s.on ? 'page' : undefined}
              className={`flex items-center justify-between gap-[10px] min-h-[36px] ml-3 py-[6px] px-3 rounded-[8px] text-[14px] no-underline ${ring} ${s.on ? 'bg-[rgba(243,236,214,.16)] !text-[#f3ecd6] font-semibold' : '!text-[#f3ecd6] opacity-85 hover:opacity-100'}`}
            >
              <span>{s.label}</span>
              {s.badge && <span className="text-[12px] tabular-nums">{s.badge}</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * More than one event in this wedding (the wedding and welcome drinks): a compact switcher in the header, the
 * same page in the other event. One event: nothing (the menu never doubles).
 */
function EventPicker({ tone }: { tone: 'dark' | 'light' }) {
  const { overview: o, path } = useAdmin();
  const { ev, tab } = useMenu();
  const go = useNavigate();
  if (!o || o.events.length < 2) return null;
  const dark = tone === 'dark';
  return (
    <label className="relative inline-flex items-center min-w-0">
      <span className="sr-only">Event</span>
      <select
        value={ev}
        onChange={(e) => {
          if (!confirmLeave()) return;
          const to = e.target.value;
          const keep = ['guests', 'dietary', 'seating', 'messages', 'texts', 'pages', 'photos'].includes(tab) ? tab : 'overview';
          go(path(keep, to));
        }}
        className={`max-w-[46vw] min-h-[44px] py-[6px] pl-3 pr-7 rounded-full border text-[13px] font-semibold cursor-pointer appearance-none truncate ${dark ? 'border-[rgba(243,236,214,.35)] bg-[rgba(243,236,214,.1)] text-[#f3ecd6]' : 'border-[var(--adm-line,#c6b794)] bg-[var(--adm-card,#fbf8f0)] text-[var(--adm-ink,#33402f)]'}`}
      >
        {o.events.map((e) => (
          <option key={e.key} value={e.key} className="text-[#33402f]">
            {e.name}
          </option>
        ))}
      </select>
      <span aria-hidden className={`pointer-events-none absolute right-3 text-[11px] ${dark ? 'text-[#f3ecd6]' : ''}`}>
        ▾
      </span>
    </label>
  );
}

/** "Sat 20 Mar 2027" from an event's start, in the wedding's own time zone. */
function dayOf(iso: string | null | undefined, tz?: string) {
  if (!iso) return 'Date to be set';
  try {
    return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz || 'Australia/Sydney' });
  } catch {
    return '';
  }
}
const ROLE_WORD: Record<string, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };

/**
 * The event switcher (Job 9): at the top of the menu (the sidebar's header; the phone menu's top). The current
 * event's name and date; tapped, every event on this account (name, date, role), the current one ticked.
 * One tap switches to that event's Home (remembered as the last used); "+ Create new event" makes another,
 * with its own plan, tools and text credits. Escape closes it.
 */
function EventSwitcher({ tone, onDone }: { tone: 'dark' | 'light'; onDone?: () => void }) {
  const { wid, overview: o } = useAdmin();
  const go = useNavigate();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Me['weddings']>([]);
  const [making, setMaking] = useState(false);
  const [f, setF] = useState({ name1: '', name2: '', event: '', date: '' });
  const [problem, setProblem] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    api.me().then(
      (m) => live && setList(m.weddings),
      () => live && setList([]),
    );
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', esc);
    document.addEventListener('mousedown', away);
    return () => {
      live = false;
      document.removeEventListener('keydown', esc);
      document.removeEventListener('mousedown', away);
    };
  }, [open]);
  if (wid === DEMO_WID || !o) return null;
  const first = o.events[0];
  const dark = tone === 'dark';
  const pick = (id: string) => {
    if (!confirmLeave()) return;
    setOpen(false);
    onDone?.();
    if (id === wid) return;
    try {
      localStorage.setItem(`wp.admin.event.${id}`, first?.key ?? 'wedding');
    } catch {
      /* the address still says where */
    }
    rememberPlace(`w:${id}`);
    go(`/admin/${id}`);
  };
  const make = async () => {
    setProblem('');
    try {
      const r = await api.anotherEvent({ name1: f.name1 || o.wedding.name1.split(' ')[0] || '', name2: f.name2 || o.wedding.name2.split(' ')[0] || '', event: f.event, date: f.date });
      resetMeCache();
      setOpen(false);
      onDone?.();
      go(`/admin/${r.weddingId}`);
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  const row = 'flex items-center justify-between gap-3 min-h-[44px] py-2 px-3 rounded-[10px] text-left';
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        className={`w-full flex items-center justify-between gap-2 min-h-[44px] py-[6px] px-3 rounded-[12px] border text-left cursor-pointer ${dark ? 'border-[rgba(243,236,214,.3)] bg-[rgba(243,236,214,.06)] text-[#f3ecd6]' : 'border-[var(--adm-line,#c6b794)] bg-[var(--adm-card,#fbf8f0)] text-[var(--adm-ink,#33402f)]'}`}
      >
        <span className="flex flex-col min-w-0">
          <span className="text-[14px] font-semibold truncate">{first?.name ?? 'Your event'}</span>
          <span className={`text-[12px] truncate ${dark ? 'text-[#cfd8bb]' : 'text-[var(--adm-muted,#5b6a52)]'}`}>{dayOf(first?.startsAt, o.wedding.timezone)}</span>
        </span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Your events" className="absolute left-0 right-0 top-[calc(100%+6px)] z-[40] min-w-[260px] flex flex-col p-2 rounded-[14px] bg-[#fbf8f2] border border-[#e2d7bc] shadow-[0_10px_28px_rgba(0,0,0,.2)] text-[#33402f]">
          {list.map((w) => (
            <button key={w.id} type="button" onClick={() => pick(w.id)} aria-current={w.id === wid ? 'true' : undefined} className={`${row} border-0 bg-transparent cursor-pointer hover:bg-[#efe7d3]`}>
              <span className="flex flex-col min-w-0">
                <span className="text-[15px] font-semibold truncate">
                  {w.event ?? 'The wedding'} · {w.name1} &amp; {w.name2}
                </span>
                <span className="text-[12px] text-[#5b6a52]">
                  {dayOf(w.date)} · {ROLE_WORD[w.role] ?? w.role}
                </span>
              </span>
              {w.id === wid && <span aria-label="Current">✓</span>}
            </button>
          ))}
          {!making ? (
            <button type="button" onClick={() => setMaking(true)} className={`${row} mt-1 border-0 border-t border-[#e2d7bc] bg-transparent cursor-pointer font-semibold`}>
              + Create new event
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void make();
              }}
              className="flex flex-col gap-2 mt-1 pt-2 border-t border-[#e2d7bc]"
            >
              <input aria-label="What it is" placeholder="e.g. Engagement party" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })} className="min-h-[44px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[15px]" />
              <input aria-label="The date" type="date" lang="en-AU" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="min-h-[44px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[15px]" />
              <span className="text-[12px] text-[#5b6a52]">Its own plan, tools and text credits. You can move unused credits between your events.</span>
              {problem && <span className="text-[13px] text-[#7a4a37]">{problem}</span>}
              <button type="submit" className="min-h-[44px] rounded-full border-0 bg-[#33402f] text-[#fbf8f0] font-semibold cursor-pointer">
                Create it
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "← Overview": on every page but the overview, the way back to the main page of the section you're in
 * (the wedding's overview, the 30th's, or Account's). Leaving with unsaved edits asks first.
 */
function BackBar() {
  const { tab = 'overview' } = useParams();
  const { path } = useAdmin();
  if (tab === 'overview') return null;
  return (
    <Link
      to={path('overview')}
      onClick={(e) => {
        if (!confirmLeave()) e.preventDefault();
      }}
      className="self-start inline-flex items-center gap-2 mb-4 py-[7px] pl-3 pr-4 min-h-[40px] rounded-full border border-[var(--adm-line,#d3c6a4)] bg-[var(--adm-card,#fbf8f0)] text-[14px] font-medium no-underline !text-[var(--adm-ink,#33402f)] hover:bg-[var(--adm-tint,#efe7d3)]"
    >
      <span aria-hidden>←</span>
      Home
    </Link>
  );
}

/** design/RSVP Admin.dc.html shell: 236px sidebar #33402f; under 760px a sticky top bar and a menu sheet. */
export function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { wid, overview: o, event, path } = useAdmin();
  const mob = useMedia('(max-width: 759px)');
  const name = o ? o.wedding.adminName.trim() || coupleName(o.wedding) : '';
  const signOut = () => {
    if (confirmLeave()) onSignOut();
  };
  const [more, setMore] = useState(false);
  const unread = o?.nav.messages ?? 0;

  if (mob) {
    // Phones: a sticky header (seal, names, the event switcher when there's more than one, Help, Menu) and a
    // menu sheet of the five items. Nothing at the bottom, nothing twice.
    return (
      <div style={{ ...looks(o, event), backgroundImage: 'radial-gradient(1200px 420px at 70% -120px, var(--adm-tint,#f3ecd6), transparent 70%)' }} className="adm min-h-screen bg-[var(--adm-bg,#f6f0e2)] text-[14px] text-[var(--adm-ink,#33402f)] transition-colors duration-300">
        <LeaveGuard />
        <header style={{ backgroundImage: SIDE }} className="sticky top-0 z-[15] bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] transition-colors duration-300 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-[10px] flex items-center justify-between gap-2 border-b border-[rgba(214,183,128,.45)] shadow-[0_6px_20px_rgba(30,10,20,.18)]">
          <HeaderSeal o={o} px={44} path={path} />
          <div className="font-script text-[24px] leading-[1.15] min-w-0 truncate flex-1">{name}</div>
          <EventPicker tone="dark" />
          <Link
            to={path('help', ALL_EVENTS)}
            aria-label="Help"
            className="relative flex-none w-11 h-11 rounded-full border border-[rgba(243,236,214,.35)] flex items-center justify-center text-[16px] font-semibold no-underline !text-[#f3ecd6]"
          >
            ?
          </Link>
          <button
            type="button"
            onClick={() => setMore((x) => !x)}
            aria-expanded={more}
            aria-label={`Menu${unread ? `, ${unread} unread messages` : ''}`}
            className="relative flex-none w-11 h-11 flex items-center justify-center rounded-full border border-[rgba(243,236,214,.35)] bg-[rgba(243,236,214,.1)] text-[#f3ecd6] text-[18px] cursor-pointer"
          >
            <span aria-hidden>☰</span>
            {unread > 0 && <span aria-hidden className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#a4553c] text-[#fbf8f2] text-[11px] leading-[18px] text-center">{unread}</span>}
          </button>
        </header>
        <main className={`min-w-0 pt-5 px-4 ${wid === DEMO_WID ? 'pb-[120px]' : 'pb-[calc(40px+env(safe-area-inset-bottom))]'}`}>
          <BackBar />
          {children}
        </main>
        {more && <MoreSheet onClose={() => setMore(false)} onSignOut={signOut} />}
        {wid === DEMO_WID ? <DemoBar /> : <FeedbackButton wid={wid} />}
        <AskAnywhere lift={wid === DEMO_WID} />
      </div>
    );
  }

  return (
    <div style={{ ...looks(o, event), backgroundImage: 'radial-gradient(1200px 420px at 70% -120px, var(--adm-tint,#f3ecd6), transparent 70%)' }} className="adm grid min-h-screen bg-[var(--adm-bg,#f6f0e2)] text-[14px] text-[var(--adm-ink,#33402f)] transition-colors duration-300 grid-cols-[236px_minmax(0,1fr)]">
      <LeaveGuard />
      <aside style={{ backgroundImage: SIDE }} className="bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] flex flex-col sticky top-0 z-[15] min-w-0 gap-[20px] pt-[30px] px-4 pb-[22px] h-screen transition-colors duration-300 border-r border-[rgba(214,183,128,.4)] shadow-[6px_0_30px_rgba(30,10,20,.12)]">
        <div className="px-[10px] flex flex-col gap-3">
          <div className="w-fit">
            <HeaderSeal o={o} px={60} path={path} />
          </div>
          <div className="font-script text-[30px] leading-[1.15] min-h-[35px]">{name}</div>
          <EventSwitcher tone="dark" />
          <EventPicker tone="dark" />
        </div>
        <SideNav />
        <div className="mt-auto flex flex-col gap-[14px] py-4 px-3 border-t border-[rgba(243,236,214,.18)]">
          {o?.daysToGo !== null && o?.daysToGo !== undefined && <div className="font-display text-[22px] italic">{o.daysToGo} days to go</div>}
          <div className="flex items-center gap-4">
            <Link to={path('help', ALL_EVENTS)} className="inline-flex items-center min-h-[44px] text-[12px] underline !text-[#cfd8bb]">
              Help
            </Link>
            <button onClick={signOut} className="inline-flex items-center min-h-[44px] p-0 border-0 bg-transparent text-[#cfd8bb] text-[12px] underline cursor-pointer">
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className={`min-w-0 pt-9 px-[clamp(20px,4vw,48px)] ${wid === DEMO_WID ? 'pb-[110px]' : 'pb-[60px]'}`}>
        <div className="max-w-[1180px] mx-auto">
          <BackBar />
          {children}
        </div>
      </main>
      {wid === DEMO_WID ? <DemoBar beside /> : <FeedbackButton wid={wid} />}
      <AskAnywhere lift={wid === DEMO_WID} />
    </div>
  );
}

/**
 * "Feedback & ideas", on every admin page: opens Tell us (an idea, a problem, a love note) without leaving
 * the page. It goes to the company portal's Feedback tab, marked with the page it came from.
 */
function FeedbackButton({ wid }: { wid: string }) {
  const { tab = 'overview' } = useParams();
  const [open, setOpen] = useState(false);
  if (tab === 'help') return null; // Help has Tell us on the page itself
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="fixed z-[11] right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] py-[9px] px-4 rounded-full border border-[var(--adm-line,#c6b794)] bg-[var(--adm-card,#fbf8f0)] text-[var(--adm-ink,#33402f)] text-[13px] font-semibold shadow-[0_6px_18px_rgba(0,0,0,.14)] cursor-pointer print:hidden"
      >
        Feedback &amp; ideas
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Feedback and ideas" className="fixed inset-0 z-[40] flex items-end sm:items-center justify-center bg-[rgba(27,34,24,.45)] p-3" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="w-full max-w-[520px] max-h-[90vh] overflow-auto rounded-[18px] bg-[var(--adm-card,#fbf8f0)] relative">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute top-2 right-3 border-0 bg-transparent text-[22px] leading-none cursor-pointer text-[var(--adm-ink,#33402f)]">
              ×
            </button>
            <TellUs wid={wid} page={tab} autoFocus />
          </div>
        </div>
      )}
    </>
  );
}

/** Line icons for the More sheet's tiles (24px, drawn with the text colour). */
const ICON: Record<string, ReactNode> = {
  overview: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  guests: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.8 2.5 3 5.2" />
    </>
  ),
  messages: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  texts: <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM10 18h4M8 8h8M8 11h6" />,
  photos: (
    <>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <circle cx="12" cy="12.5" r="3.5" />
      <path d="M8 5l1.5-2h5L16 5" />
    </>
  ),
  pages: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  party: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />,
  day: <path d="M4 6h16M4 12h16M4 18h10M18 16l2 2 3-4" />,
  planner: (
    <>
      <rect x="4" y="4" width="16" height="17" rx="2" />
      <path d="M8 2.5v3M16 2.5v3M8 11l2 2 4-4M8 17h8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1" />
    </>
  ),
  money: <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  store: <path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6" />,
  idea: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />,
  car: <path d="M5 17h14M3 13l2-6h14l2 6v4h-2.5M3 13v4h2.5M3 13h18M7.5 17a1.5 1.5 0 1 0 0 .01M16.5 17a1.5 1.5 0 1 0 0 .01" />,
  music: <path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z" />,
  print: <path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />,
  gift: <path d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 3v3M17.5 4.5h3" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" />
    </>
  ),
  look: <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11h.01M10 7h.01M15 7.5h.01" />,
};

/**
 * Phones: the menu sheet. The event switcher at the top (tap your event to change it), then the five items as
 * rows (56px), the current one marked, each tool nested under its place; a full-width Sign out at the foot.
 */
function MoreSheet({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const { overview: o, event } = useAdmin();
  const { items } = useMenu();
  const go = useNavigate();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const to = (where: string) => {
    if (!confirmLeave()) return;
    onClose();
    go(where);
  };
  return (
    <div style={{ ...looks(o, event), zoom: 1 }} className="fixed inset-0 z-[30] flex flex-col justify-start">
      <div onClick={onClose} className="absolute inset-0 bg-[rgba(51,64,47,.35)]" />
      <div role="dialog" aria-modal="true" aria-label="Menu" className="relative max-h-[92vh] overflow-y-auto rounded-b-[22px] bg-[var(--adm-bg,#f6f0e2)] text-[var(--adm-ink,#33402f)] transition-colors duration-300 px-4 pt-[max(14px,env(safe-area-inset-top))] pb-5 flex flex-col gap-4 shadow-[0_12px_32px_rgba(51,64,47,.25)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <EventSwitcher tone="light" onDone={onClose} />
          </div>
          <button type="button" aria-label="Close menu" onClick={onClose} className="flex-none w-11 h-11 rounded-full border border-[var(--adm-line,#c6b794)] bg-[var(--adm-card,#fbf8f0)] text-[20px] cursor-pointer">
            ×
          </button>
        </div>
        <nav aria-label="Admin" className="flex flex-col gap-1">
          {items.map((m) => (
            <div key={m.key} className="flex flex-col gap-1">
              <button
                type="button"
                aria-current={m.on ? 'page' : undefined}
                onClick={() => to(m.to)}
                className={`flex items-center gap-3 min-h-[56px] px-4 rounded-[14px] border text-left text-[17px] cursor-pointer text-[var(--adm-ink,#33402f)] ${m.on ? 'border-[var(--adm-ink,#33402f)] bg-[var(--adm-tint,#f3ecd6)] font-semibold' : 'border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]'}`}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {ICON[m.icon] ?? ICON.list}
                </svg>
                <span className="flex-1">{m.label}</span>
                {m.badge && <span className="text-[13px] tabular-nums text-[var(--adm-muted,#5b6a52)]">{m.badge}</span>}
              </button>
              {m.children.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-current={s.on ? 'page' : undefined}
                  onClick={() => to(s.to)}
                  className={`flex items-center justify-between gap-3 min-h-[44px] ml-8 px-4 rounded-[12px] border-0 text-left text-[15px] cursor-pointer text-[var(--adm-ink,#33402f)] ${s.on ? 'bg-[var(--adm-tint,#f3ecd6)] font-semibold' : 'bg-transparent'}`}
                >
                  <span>{s.label}</span>
                  {s.badge && <span className="text-[13px] tabular-nums">{s.badge}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <Pill onClick={onSignOut} className="self-stretch min-h-[48px]">
          Sign out
        </Pill>
      </div>
    </div>
  );
}

/**
 * The admin wears the invitation's colour theme (the first event's Setup → Invitation → Look and feel). The second event is the
 * design's blue celebration (the birthday section of the invitation), so looking at it turns the admin blue
 * too: you always know which event you're in.
 */
function themeVars(theme: string | undefined, slot: number): CSSProperties {
  const t: Record<string, string | undefined> = themeOf(theme);
  if (slot === 1) {
    const ink = t.bdtx ?? '#2f3d5c';
    // Text, muted text, cards, tints and lines too: otherwise lists and drawers keep the wedding's sage and cream on a blue page.
    return {
      '--adm-ink': ink,
      '--adm-soft': t.bdbg ?? '#dde7f3',
      '--adm-bg': '#eef2f8',
      '--adm-accent': t.bdac ?? '#4a6290',
      '--adm-accent-deep': ink,
      '--adm-text': ink,
      '--adm-muted': '#56657f',
      '--adm-card': '#f8fafd',
      '--adm-tint': '#e3eaf4',
      '--adm-line': '#c8d4e5',
    } as CSSProperties;
  }
  // Buttons keep the admin's sage in the first event and Account (the theme's own accents are too light for white text).
  return { '--adm-ink': t.dg ?? '#33402f', '--adm-soft': t.b2 ?? '#cfd8bb', '--adm-bg': t.iv ?? '#f6f0e2', '--adm-accent': '#5d6b47', '--adm-accent-deep': '#46543a' } as CSSProperties;
}

/** The admin's colours: the chosen palette (or the invitation's), and the second event's own colour if kept. */
function looks(o: Overview | null, event: string): CSSProperties {
  const look = { ...DEFAULT_LOOK, ...o?.wedding.adminLook };
  const slot = o ? Math.max(0, o.events.findIndex((e) => e.key === event)) : 0;
  const size = look.large ? ({ zoom: 1.12 } as CSSProperties) : {};
  if (slot === 1 && look.eventColours) return { ...themeVars(o?.wedding.theme, 1), ...size };
  return { ...(lookVars(look) ?? themeVars(o?.wedding.theme, 0)), ...size };
}

/** Where you are, for screen titles: an event's name, or "Account". */
export function useSectionName(): string {
  const { event, overview } = useAdmin();
  return overview?.events.find((e) => e.key === event)?.name ?? 'Account';
}


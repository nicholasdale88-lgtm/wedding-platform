import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { themeOf } from '../guest/themeKit';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Overview } from '../lib/api';
import { coupleName } from '../lib/remember';
import { DEFAULT_LOOK, lookVars } from './AdminLook';
import { confirmLeave, LeaveGuard } from './leave';
import { Pill, useAutoRefresh, useMedia } from './ui';

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
  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const o = await api.overview(wid, event !== ALL_EVENTS ? event : undefined);
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
  return <Ctx.Provider value={{ wid, overview, error, reload, event, path }}>{children}</Ctx.Provider>;
}

/** Overview data for the section in the address (not one still loading for the section you just left). */
export function useSectionOverview(): Overview | null {
  const { overview: o, event } = useAdmin();
  return o && (o.focus ?? ALL_EVENTS) === event ? o : null;
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
] as const;
export const EVENT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'planner', label: 'Wedding planner' }, // the first event's section only (budget, vendors, assistant…)
  { key: 'guests', label: 'Guests' }, // guest list, dietary and seating together (GuestPlanningBar)
  { key: 'messages', label: 'Messages' }, // this event's guests' messages (Account has the overview)
  { key: 'party', label: 'Wedding party' }, // the first event's section only (its views open under it)
  { key: 'day', label: 'Day checklist' }, // every other event (a birthday has no wedding party)
  { key: 'texts', label: 'Texts' },
  { key: 'photos', label: 'Photos' },
  { key: 'pages', label: 'Setup' },
] as const;
/** Every admin route (Events stays reachable by link; its work now lives in Overview and Setup). */
export const TABS = [
  ...ACCOUNT_TABS,
  ...EVENT_TABS,
  { key: 'dietary', label: 'Dietary' },
  { key: 'seating', label: 'Seating' },
  { key: 'events', label: 'Events' },
  { key: 'look', label: 'Admin look' }, // now Settings → Admin look
] as const;
/** Pages reached inside Guest planning: the menu shows them as that one entry. */
const navKey = (tab: string) => (tab === 'dietary' || tab === 'seating' ? 'guests' : tab);
export type TabKey = (typeof TABS)[number]['key'];

function badge(key: TabKey, o: Overview | null, group: string): string {
  if (!o) return '';
  const ev = o.perEvent?.find((e) => e.key === group);
  switch (key) {
    case 'guests':
      return String(ev ? ev.invited : o.nav.guests);
    case 'messages':
      return o.nav.messages ? String(o.nav.messages) : '';
    case 'texts':
      return o.nav.smsLive || !ev ? '' : 'Not set up';
    case 'settings':
      return o.nav.smsLive ? '' : 'Texts off';
    default:
      return '';
  }
}

type Group = { key: string; name: string; tabs: readonly { key: TabKey; label: string }[] };

/** The menu's sections (Account, then each event with its pages), the one you're in, and moving to another. */
function useSections() {
  const { tab = 'overview' } = useParams();
  const go = useNavigate();
  const { overview: o, event, path } = useAdmin();
  const groups: Group[] = [
    { key: ALL_EVENTS, name: 'Account', tabs: ACCOUNT_TABS },
    // Dietary and Seating live inside Guests (shown there only where the event uses them).
    ...(o?.events ?? []).map((e, i) => ({ key: e.key, name: e.name, tabs: EVENT_TABS.filter((t) => (i === 0 ? t.key !== 'day' : t.key !== 'planner' && t.key !== 'party')) })),
  ];
  const current = groups.find((g) => g.key === event) ?? groups[0]!;
  // Stay on the same kind of page if the section has it (Texts → Texts), else its overview.
  const open = (g: Group) => go(path(g.tabs.some((t) => t.key === navKey(tab)) ? tab : 'overview', g.key));
  return { groups, current, open, tab };
}

function SideNav({ mob }: { mob: boolean }) {
  const go = useNavigate();
  const { wid, overview: o, path } = useAdmin();
  const { groups, current, open, tab } = useSections();
  const { search } = useLocation();
  const partyView = tab === 'party' ? (new URLSearchParams(search).get('view') ?? 'overview') : '';
  const sides = { p1: o?.partySides?.p1 || 'Bride', p2: o?.partySides?.p2 || 'Groom' };
  /** Wedding party opens into its views: Overview, each side, the run sheet, your checklists. */
  const partyLinks = [
    ['overview', 'Overview'],
    ['p1', `${sides.p1}’s side`],
    ['p2', `${sides.p2}’s side`],
    ['runsheet', 'Run sheet'],
    ['couple', 'Your checklists'],
    ['access', 'Links & sign-ins'],
  ] as const;
  // Sections you've expanded stay expanded (remembered on this device); the one you're in is always open.
  const [openSet, setOpenSet] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`wp.admin.open.${wid}`) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (key: string, show: boolean) => {
    setOpenSet((s) => {
      const n = new Set(s);
      if (show) n.add(key);
      else n.delete(key);
      try {
        localStorage.setItem(`wp.admin.open.${wid}`, JSON.stringify([...n]));
      } catch {
        /* this visit only */
      }
      return n;
    });
    // Minimising the section you're in moves you to Account, so it can actually close.
    if (!show && key === current.key && key !== ALL_EVENTS) go(path('overview', ALL_EVENTS));
  };
  const ring = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3ecd6]';
  const tabLink = (t: { key: TabKey; label: string }) =>
    t.key === 'party' && partyView && !mob ? (
      <div key={t.key} className="flex flex-col gap-[2px]">
        {navLink(t)}
        <div role="group" aria-label="Wedding party" className="flex flex-col gap-[2px] ml-3 pl-2 border-l border-[rgba(243,236,214,.3)]">
          {partyLinks.map(([v, label]) => (
            <Link
              key={v}
              to={`${path('party')}${v === 'overview' ? '' : `?view=${v}`}`}
              aria-current={partyView === v ? 'page' : undefined}
              className={`rounded-[8px] py-[6px] px-3 text-[14px] no-underline ${ring} ${partyView === v ? 'bg-[rgba(243,236,214,.16)] !text-[#f3ecd6] font-semibold' : '!text-[#f3ecd6] opacity-75 hover:opacity-100'}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    ) : (
      navLink(t)
    );
  const navLink = (t: { key: TabKey; label: string }) => (
    <NavLink
      key={t.key}
      to={path(t.key)}
      data-on={navKey(tab) === t.key ? '' : undefined}
      className={({ isActive }) =>
        `flex-none whitespace-nowrap flex items-center justify-between gap-[10px] rounded-[8px] text-left no-underline ${ring} ${mob ? 'py-2 px-3 text-[14px]' : 'py-[9px] px-3 text-[15px]'} ${
          isActive || navKey(tab) === t.key ? 'bg-[#f3ecd6] !text-[var(--adm-ink,#33402f)]' : 'bg-transparent !text-[#f3ecd6] hover:!text-[#f3ecd6]'
        }`
      }
    >
      <span>{t.label}</span>
      <span className="text-[12px] tabular-nums opacity-85">{badge(t.key, o, current.key)}</span>
    </NavLink>
  );
  const groupBtn = (g: Group) => {
    const on = g.key === current.key;
    return (
      <button
        key={g.key}
        type="button"
        aria-current={on ? 'true' : undefined}
        onClick={() => open(g)}
        className={`flex-none text-left rounded-[8px] border cursor-pointer font-semibold ${ring} ${mob ? 'py-[6px] px-3 text-[13px]' : 'py-2 px-3 text-[13px] tracking-[.08em] uppercase'} ${
          on ? 'bg-[rgba(243,236,214,.1)] text-[#f3ecd6] border-[var(--adm-soft,#cfd8bb)] shadow-[inset_3px_0_0_var(--adm-soft,#cfd8bb)]' : 'bg-transparent text-[#f3ecd6] border-[rgba(243,236,214,.3)] hover:border-[#f3ecd6]'
        }`}
      >
        {g.name}
      </button>
    );
  };

  if (mob) {
    // Phones: the section's pages as a strip that scrolls sideways (the page you're on kept in view).
    // Sections are switched from the top row and the bottom bar's More.
    return (
      <MobileTabs tab={tab} section={current.key}>
        {current.tabs.map(tabLink)}
      </MobileTabs>
    );
  }
  return (
    <nav aria-label="Admin" className="flex flex-col gap-2 flex-none overflow-y-auto [scrollbar-width:none]">
      {groups.map((g) => {
        const isOpen = openSet.has(g.key) || g.key === current.key;
        return (
          <div key={g.key} className="flex flex-col gap-1">
            <div className="flex items-stretch gap-1">
              <div className="flex-1 min-w-0 flex [&>button]:flex-1">{groupBtn(g)}</div>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Hide' : 'Show'} ${g.name}`}
                title={isOpen ? 'Minimise' : 'Expand'}
                onClick={() => toggle(g.key, !isOpen)}
                className={`flex-none w-8 rounded-[8px] border border-[rgba(243,236,214,.3)] bg-transparent text-[#f3ecd6] cursor-pointer hover:border-[#f3ecd6] ${ring}`}
              >
                <span aria-hidden className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
              </button>
            </div>
            {isOpen && (
              <div className="flex flex-col gap-[2px] pl-2">
                {g.key === current.key
                  ? g.tabs.map(tabLink)
                  : // Another section's pages: plain links into that section.
                    g.tabs.map((t) => (
                      <Link
                        key={t.key}
                        to={path(t.key, g.key)}
                        className={`flex items-center justify-between gap-[10px] rounded-[8px] text-left py-[9px] px-3 text-[15px] no-underline !text-[#f3ecd6] opacity-80 hover:opacity-100 ${ring}`}
                      >
                        {t.label}
                      </Link>
                    ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** The phone's strip of page links: keeps the page you're on in view when it changes. */
function MobileTabs({ tab, section, children }: { tab: string; section: string; children: ReactNode }) {
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    strip.current?.querySelector('[data-on]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [tab, section]);
  return (
    <nav ref={strip} aria-label="Admin" className="flex gap-1 flex-none flex-row overflow-x-auto [scrollbar-width:none] -mx-[14px] px-[14px] snap-x">
      {children}
    </nav>
  );
}

/** design/RSVP Admin.dc.html shell: 236px sidebar #33402f; under 760px a sticky top bar with scrolling nav pills. */
export function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { overview: o, event } = useAdmin();
  const mob = useMedia('(max-width: 759px)');
  const name = o ? o.wedding.adminName.trim() || coupleName(o.wedding) : '';
  const signOut = () => {
    if (confirmLeave()) onSignOut();
  };
  const [more, setMore] = useState(false);
  const sectionName = o?.events.find((e) => e.key === event)?.name ?? 'Account';

  if (mob) {
    // Phones: a slim row with your names and the section you're in; the things you reach for most (Home,
    // Guests, Messages, Planner) sit in a bar at the bottom, and More has the section's other pages.
    return (
      <div style={looks(o, event)} className="adm min-h-screen bg-[var(--adm-bg,#f6f0e2)] text-[14px] text-[var(--adm-ink,#33402f)] transition-colors duration-300">
        <LeaveGuard />
        {/* One slim row at the top (the bottom bar and More do the navigating, so nothing is shown twice). */}
        <header className="sticky top-0 z-[15] bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] px-4 pt-[max(10px,env(safe-area-inset-top))] pb-[10px] flex items-center justify-between gap-3 shadow-[0_2px_10px_rgba(0,0,0,.12)]">
          <div className="font-script text-[26px] leading-[1.15] min-w-0 truncate">{name}</div>
          <button
            type="button"
            onClick={() => setMore(true)}
            aria-label={`Section: ${sectionName}. Change section`}
            className="flex-none max-w-[48%] flex items-center gap-1 py-[6px] px-3 min-h-[36px] rounded-full border border-[rgba(243,236,214,.35)] bg-[rgba(243,236,214,.1)] text-[#f3ecd6] text-[13px] font-semibold cursor-pointer"
          >
            <span className="truncate">{sectionName}</span>
            <span aria-hidden>▾</span>
          </button>
        </header>
        <main className="min-w-0 pt-5 px-4 pb-[calc(88px+env(safe-area-inset-bottom))]">{children}</main>
        <BottomBar onMore={() => setMore(true)} moreOpen={more} />
        {more && <MoreSheet onClose={() => setMore(false)} onSignOut={signOut} />}
      </div>
    );
  }

  return (
    <div style={looks(o, event)} className="adm grid min-h-screen bg-[var(--adm-bg,#f6f0e2)] text-[14px] text-[var(--adm-ink,#33402f)] transition-colors duration-300 grid-cols-[236px_minmax(0,1fr)]">
      <LeaveGuard />
      <aside className="bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] flex flex-col sticky top-0 z-[15] min-w-0 gap-[24px] pt-[30px] px-4 pb-[22px] h-screen">
        <div className="px-[10px]">
          <div className="font-script text-[30px] leading-[1.15] min-h-[35px]">{name}</div>
          <div className="mt-[6px] text-[11px] font-semibold tracking-[.24em] uppercase text-[#cfd8bb]">RSVP admin</div>
        </div>
        <SideNav mob={false} />
        <div className="mt-auto flex flex-col gap-[14px] py-4 px-3 border-t border-[rgba(243,236,214,.18)]">
          {o?.daysToGo !== null && o?.daysToGo !== undefined && <div className="font-display text-[22px] italic">{o.daysToGo} days to go</div>}
          <button onClick={signOut} className="self-start p-0 border-0 bg-transparent text-[#cfd8bb] text-[12px] underline cursor-pointer">
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 pt-9 px-[clamp(20px,4vw,48px)] pb-[60px]">
        <div className="max-w-[1180px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

/** Phones: the bottom bar. Home (Account overview), Guests, Messages (unread count), the Wedding planner, More. */
function BottomBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { overview: o, event, path } = useAdmin();
  const { tab = 'overview' } = useParams();
  const first = o?.events[0]?.key;
  const inEvent = event !== ALL_EVENTS;
  const unread = o?.nav.messages ?? 0;
  const items: { key: string; label: string; to: string; on: boolean; icon: ReactNode; badge?: number }[] = [
    { key: 'home', label: 'Home', to: path('overview', ALL_EVENTS), on: !inEvent && tab === 'overview', icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> },
    {
      key: 'guests',
      label: 'Guests',
      to: path('guests', inEvent ? event : first),
      on: tab === 'guests' || tab === 'dietary' || tab === 'seating',
      icon: (
        <>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.8 2.5 3 5.2" />
        </>
      ),
    },
    { key: 'messages', label: 'Messages', to: path('messages', inEvent ? event : ALL_EVENTS), on: tab === 'messages', badge: unread, icon: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /> },
    ...(first
      ? [
          {
            key: 'planner',
            label: 'Planner',
            to: path('planner', first),
            on: tab === 'planner',
            icon: (
              <>
                <rect x="4" y="4" width="16" height="17" rx="2" />
                <path d="M8 2.5v3M16 2.5v3M8 11l2 2 4-4M8 17h8" />
              </>
            ),
          },
        ]
      : []),
  ];
  const cls = (on: boolean) => `relative flex-1 flex flex-col items-center justify-center gap-[2px] min-h-[56px] text-[11px] no-underline ${on ? 'font-semibold !text-[var(--adm-ink,#33402f)]' : '!text-[#6b6558]'}`;
  const svg = (icon: ReactNode) => (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {icon}
    </svg>
  );
  return (
    <nav aria-label="Quick links" className="fixed bottom-0 inset-x-0 z-[16] flex bg-[#fbf8f2] border-t border-[#e2d7bc] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(51,64,47,.08)]">
      {items.map((i) => (
        <Link key={i.key} to={i.to} aria-current={i.on ? 'page' : undefined} className={cls(i.on)}>
          {svg(i.icon)}
          {i.label}
          {!!i.badge && (
            <span className="absolute top-[6px] left-1/2 ml-[6px] min-w-[18px] h-[18px] px-1 rounded-full bg-[#a4553c] text-[#fbf8f2] text-[11px] font-semibold leading-[18px] text-center">{i.badge > 99 ? '99+' : i.badge}</span>
          )}
        </Link>
      ))}
      <button type="button" onClick={onMore} aria-expanded={moreOpen} className={`${cls(moreOpen)} border-0 bg-transparent cursor-pointer`}>
        {svg(
          <>
            <circle cx="5" cy="12" r="1.4" />
            <circle cx="12" cy="12" r="1.4" />
            <circle cx="19" cy="12" r="1.4" />
          </>,
        )}
        More
      </button>
    </nav>
  );
}

/** Phones: More. Every section as a big button, then Settings, the admin's look and Sign out. */
function MoreSheet({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const { path, overview: o } = useAdmin();
  const { groups, current, open, tab } = useSections();
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
  const link = (label: string, to: string, on = false) => (
    <button
      key={label}
      type="button"
      aria-current={on ? 'page' : undefined}
      onClick={() => {
        onClose();
        go(to);
      }}
      className={`w-full flex items-center justify-between py-3 px-1 min-h-[48px] border-0 border-t border-[#ece3cc] bg-transparent text-left text-[16px] cursor-pointer text-[var(--adm-ink,#33402f)] ${on ? 'font-semibold' : ''}`}
    >
      {label}
      <span aria-hidden className="text-[#8a9670]">{on ? '●' : '›'}</span>
    </button>
  );
  return (
    <div className="fixed inset-0 z-[30] flex flex-col justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-[rgba(51,64,47,.35)]" />
      <div role="dialog" aria-modal="true" aria-label="More" className="relative max-h-[85vh] overflow-y-auto rounded-t-[22px] bg-[#f6f0e2] px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))] flex flex-col gap-4">
        <span aria-hidden className="self-center w-10 h-[5px] rounded-full bg-[#d3c6a4]" />
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold tracking-[.2em] uppercase text-[#5b6a52] mb-1">{current.name}</span>
          {current.tabs.map((t) => link(t.label, path(t.key), navKey(tab) === t.key))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[.2em] uppercase text-[#5b6a52]">Sections</span>
          {groups.map((g) => {
            const on = g.key === current.key;
            const ev = o?.events.find((e) => e.key === g.key);
            return (
              <button
                key={g.key}
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => {
                  onClose();
                  open(g);
                }}
                className={`w-full flex flex-col items-start gap-[2px] py-3 px-4 min-h-[56px] rounded-[14px] border text-left cursor-pointer ${on ? 'border-[var(--adm-ink,#33402f)] bg-[var(--adm-soft,#cfd8bb)]' : 'border-[#e2d7bc] bg-[#fbf8f0]'}`}
              >
                <span className="font-display text-[22px] leading-tight">{g.name}</span>
                <span className="text-[12px] text-[#5b6a52]">{ev ? `${ev.coming} coming` : 'Overview, messages and settings'}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col">
          {current.key !== ALL_EVENTS && link('Settings', path('settings', ALL_EVENTS))}
          {link('Admin look and name', `${path('settings', ALL_EVENTS)}?view=look`)}
        </div>
        <Pill onClick={onSignOut} className="self-stretch">
          Sign out
        </Pill>
        <Pill onClick={onClose} kind="primary" className="self-stretch">
          Close
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
    return { '--adm-ink': ink, '--adm-soft': t.bdbg ?? '#dde7f3', '--adm-bg': '#eef2f8', '--adm-accent': t.bdac ?? '#4a6290', '--adm-accent-deep': ink } as CSSProperties;
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

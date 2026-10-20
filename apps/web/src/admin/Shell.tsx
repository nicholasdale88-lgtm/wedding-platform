import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { themeOf } from '../guest/themeKit';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
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
  { key: 'help', label: 'Help' }, // how to do each thing, step by step
] as const;
export const EVENT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'planner', label: 'Wedding planner' }, // the first event's section only (budget, vendors, assistant…)
  { key: 'guests', label: 'Guest list' }, // guest list, dietary and seating together (GuestPlanningBar)
  { key: 'messages', label: 'Messages' }, // this event's guests' messages (Account has the overview)
  { key: 'party', label: 'Wedding party' }, // the first event's section only (its views open under it)
  { key: 'day', label: 'Party checklist' }, // every other event (a birthday has no wedding party)
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
  const { wid, overview: o, path } = useAdmin();
  const { groups, current, open, tab } = useSections();
  // Sections you've expanded or collapsed stay that way (remembered on this device); the one you're in starts open.
  const [openSet, setOpenSet] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`wp.admin.open.${wid}`) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const [shut, setShut] = useState<Set<string>>(new Set());
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
    setShut((s) => {
      const n = new Set(s);
      if (show) n.delete(key);
      else n.add(key);
      return n;
    });
  };
  const ring = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3ecd6]';
  const tabLink = (t: { key: TabKey; label: string }) => navLink(t);
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
      {groups.map((g, i) => {
        const isOpen = !shut.has(g.key) && (openSet.has(g.key) || g.key === current.key);
        return (
          <div key={g.key} className="flex flex-col gap-1">
            {/* Account first, then the events under their own heading. */}
            {i === 1 && <div className="mt-3 px-1 text-[11px] font-semibold tracking-[.22em] uppercase text-[#cfd8bb]">Events</div>}
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
  const { overview: o, event, path } = useAdmin();
  const mob = useMedia('(max-width: 759px)');
  const name = o ? o.wedding.adminName.trim() || coupleName(o.wedding) : '';
  const signOut = () => {
    if (confirmLeave()) onSignOut();
  };
  const [more, setMore] = useState(false);
  const sectionName = o?.events.find((e) => e.key === event)?.name ?? 'Account';
  const unread = o?.nav.messages ?? 0;

  if (mob) {
    // Phones: one menu, at the top. A slim row with your names, Help (?), and Menu: it opens the sections
    // (Account, then the events) and the chosen section's pages. Nothing at the bottom, nothing twice.
    return (
      <div style={looks(o, event)} className="adm min-h-screen bg-[var(--adm-bg,#f6f0e2)] text-[14px] text-[var(--adm-ink,#33402f)] transition-colors duration-300">
        <LeaveGuard />
        {/* The only menu on a phone. */}
        <header className="sticky top-0 z-[15] bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] px-4 pt-[max(10px,env(safe-area-inset-top))] pb-[10px] flex items-center justify-between gap-3 shadow-[0_2px_10px_rgba(0,0,0,.12)]">
          <div className="font-script text-[26px] leading-[1.15] min-w-0 truncate flex-1">{name}</div>
          <button
            type="button"
            onClick={() => setMore((x) => !x)}
            aria-expanded={more}
            aria-label={`Menu: ${sectionName}${unread ? `, ${unread} unread messages` : ''}`}
            className="relative flex-none max-w-[52%] flex items-center gap-1 py-[6px] px-3 min-h-[40px] rounded-full border border-[rgba(243,236,214,.35)] bg-[rgba(243,236,214,.1)] text-[#f3ecd6] text-[13px] font-semibold cursor-pointer"
          >
            <span aria-hidden className="text-[15px] leading-none">☰</span>
            <span className="truncate">{sectionName}</span>
            <span aria-hidden>{more ? '▴' : '▾'}</span>
            {unread > 0 && <span aria-hidden className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#a4553c] text-[#fbf8f2] text-[11px] leading-[18px] text-center">{unread}</span>}
          </button>
          <Link
            to={path('help', ALL_EVENTS)}
            aria-label="Help"
            className="flex-none w-10 h-10 rounded-full border border-[rgba(243,236,214,.35)] flex items-center justify-center text-[16px] font-semibold no-underline !text-[#f3ecd6]"
          >
            ?
          </Link>
        </header>
        <main className="min-w-0 pt-5 px-4 pb-[calc(40px+env(safe-area-inset-bottom))]">{children}</main>
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
          <div className="flex items-center gap-4">
            <Link to={path('help', ALL_EVENTS)} className="text-[12px] underline !text-[#cfd8bb]">
              Help
            </Link>
            <button onClick={signOut} className="p-0 border-0 bg-transparent text-[#cfd8bb] text-[12px] underline cursor-pointer">
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 pt-9 px-[clamp(20px,4vw,48px)] pb-[60px]">
        <div className="max-w-[1180px] mx-auto">{children}</div>
      </main>
    </div>
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
 * Phones: the menu. Account on its own, then the events; tapping one shows only that section's pages as
 * tiles with icons. Opens on the section you're in; Sign out at the end.
 */
function MoreSheet({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const { path } = useAdmin();
  const { groups, current, tab } = useSections();
  const go = useNavigate();
  const [picked, setPicked] = useState(current.key);
  const shown = groups.find((g) => g.key === picked) ?? current;
  const here = shown.key === current.key;
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
    onClose();
    go(where);
  };
  const tile = (key: string, label: string, where: string, icon: string, on = false) => (
    <button
      key={key}
      type="button"
      aria-current={on ? 'page' : undefined}
      onClick={() => to(where)}
      className={`flex flex-col items-center justify-center gap-[6px] min-h-[84px] p-2 rounded-[14px] border text-center text-[13px] leading-tight cursor-pointer text-[var(--adm-ink,#33402f)] ${on ? 'border-[var(--adm-ink,#33402f)] bg-[var(--adm-soft,#cfd8bb)] font-semibold' : 'border-[#e2d7bc] bg-[#fbf8f0]'}`}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICON[icon] ?? ICON.list}
      </svg>
      {label}
    </button>
  );
  const heading = (text: string) => <span className="text-[11px] font-semibold tracking-[.2em] uppercase text-[#5b6a52]">{text}</span>;
  const grid = 'grid grid-cols-3 gap-2';
  const rest = shown.tabs;
  return (
    <div className="fixed inset-0 z-[30] flex flex-col justify-start">
      <div onClick={onClose} className="absolute inset-0 bg-[rgba(51,64,47,.35)]" />
      <div role="dialog" aria-modal="true" aria-label="Menu" className="relative max-h-[92vh] overflow-y-auto rounded-b-[22px] bg-[#f6f0e2] px-4 pt-[max(14px,env(safe-area-inset-top))] pb-5 flex flex-col gap-5 shadow-[0_12px_32px_rgba(51,64,47,.25)]">
        <div className="flex items-center justify-between">
          <span className="font-display text-[24px]">Menu</span>
          <button type="button" aria-label="Close menu" onClick={onClose} className="w-10 h-10 rounded-full border border-[#c6b794] bg-[#fbf8f0] text-[20px] cursor-pointer">
            ×
          </button>
        </div>
        {/* Account on its own, then the events under their own heading: Account is not an event. */}
        {(() => {
          const btn = (g: Group) => {
            const on = g.key === shown.key;
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(g.key)}
                className={`min-h-[52px] py-2 px-3 rounded-[14px] border text-center font-display text-[18px] leading-tight cursor-pointer text-[var(--adm-ink,#33402f)] ${on ? 'border-[var(--adm-ink,#33402f)] bg-[var(--adm-soft,#cfd8bb)] font-semibold' : 'border-[#e2d7bc] bg-[#fbf8f0]'}`}
              >
                {g.name}
              </button>
            );
          };
          const evs = groups.filter((g) => g.key !== ALL_EVENTS);
          return (
            <>
              <div role="group" aria-label="Account" className="flex flex-col gap-2">
                {heading('Account')}
                <div className="grid">{groups.filter((g) => g.key === ALL_EVENTS).map(btn)}</div>
              </div>
              {evs.length > 0 && (
                <div role="group" aria-label="Events" className="flex flex-col gap-2">
                  {heading('Events')}
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(evs.length, 3)}, minmax(0, 1fr))` }}>
                    {evs.map(btn)}
                  </div>
                </div>
              )}
            </>
          );
        })()}
        <div className="flex flex-col gap-2">
          {heading(shown.name)}
          {rest.length ? (
            <div className={grid}>{rest.map((t) => tile(`${shown.key}-${t.key}`, t.label, path(t.key, shown.key), t.key, here && navKey(tab) === t.key))}</div>
          ) : (
            <p className="m-0 text-[14px] text-[#5b6a52]">Nothing here yet.</p>
          )}
        </div>
        <Pill onClick={onSignOut} className="self-stretch">
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

import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Overview } from '../lib/api';
import { THEMES } from '../guest/generated/themes';
import { coupleName } from '../lib/remember';
import { confirmLeave, LeaveGuard } from './leave';
import { useAutoRefresh, useMedia } from './ui';

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
 * The admin's menu. "Account": everything shared by every event (the overview of all of them, messages,
 * planning, and the texting setup). Then one section per event with its own guests, dietary needs, texts,
 * seating, photos and setup (the first event's Setup holds the invitation). The section is in the address
 * (/admin/:wid/:section/:tab), and opening one looks at that event everywhere (and turns the birthday blue).
 */
export const ACCOUNT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'messages', label: 'Messages' },
  { key: 'budget', label: 'Budget' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'assistant', label: 'Planning assistant' },
  { key: 'texts', label: 'Texting setup' },
] as const;
export const EVENT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'guests', label: 'Guest planning' }, // guest list, dietary and seating together (GuestPlanningBar)
  { key: 'party', label: 'Wedding party' },
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
  { key: 'settings', label: 'Texting setup' },
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
      return o.nav.smsLive ? (ev ? '' : `${o.nav.autopilot} on autopilot`) : 'Not set up';
    default:
      return '';
  }
}

function SideNav({ mob }: { mob: boolean }) {
  const { tab = 'overview' } = useParams();
  const go = useNavigate();
  const { wid, overview: o, event, path } = useAdmin();
  const groups: { key: string; name: string; tabs: readonly { key: TabKey; label: string }[] }[] = [
    { key: ALL_EVENTS, name: 'Account', tabs: ACCOUNT_TABS },
    // Dietary and Seating live inside Guest planning (shown there only where the event uses them).
    ...(o?.events ?? []).map((e) => ({ key: e.key, name: e.name, tabs: EVENT_TABS })),
  ];
  const current = groups.find((g) => g.key === event) ?? groups[0]!;
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
  // Stay on the same kind of page if the section has it (SMS → SMS), else its overview.
  const open = (g: (typeof groups)[number]) => go(path(g.tabs.some((t) => t.key === navKey(tab)) ? tab : 'overview', g.key));
  const ring = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3ecd6]';
  const tabLink = (t: { key: TabKey; label: string }) => (
    <NavLink
      key={t.key}
      to={path(t.key)}
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
  const groupBtn = (g: (typeof groups)[number]) => {
    const on = g.key === current.key;
    return (
      <button
        key={g.key}
        type="button"
        aria-current={on ? 'true' : undefined}
        onClick={() => open(g)}
        className={`flex-none text-left rounded-[8px] border cursor-pointer font-semibold ${ring} ${mob ? 'py-[6px] px-3 text-[13px]' : 'py-2 px-3 text-[13px] tracking-[.08em] uppercase'} ${
          on ? 'bg-[var(--adm-soft,#cfd8bb)] text-[var(--adm-ink,#33402f)] border-[var(--adm-soft,#cfd8bb)]' : 'bg-transparent text-[#f3ecd6] border-[rgba(243,236,214,.3)] hover:border-[#f3ecd6]'
        }`}
      >
        {g.name}
      </button>
    );
  };

  if (mob) {
    return (
      <>
        <div aria-label="Sections" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {groups.map(groupBtn)}
        </div>
        <nav aria-label="Admin" className="flex gap-1 flex-none flex-row overflow-x-auto [scrollbar-width:none]">
          {current.tabs.map(tabLink)}
        </nav>
      </>
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

/** design/RSVP Admin.dc.html shell: 236px sidebar #33402f; under 760px a sticky top bar with scrolling nav pills. */
export function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { overview: o, event } = useAdmin();
  const mob = useMedia('(max-width: 759px)');
  const name = o ? o.wedding.adminName.trim() || coupleName(o.wedding) : '';
  const signOut = () => {
    if (confirmLeave()) onSignOut();
  };
  const signOutBtn = (
    <button onClick={signOut} className="flex-none self-start p-0 border-0 bg-transparent text-[#cfd8bb] text-[12px] underline cursor-pointer">
      Sign out
    </button>
  );

  return (
    <div style={themeVars(o?.wedding.theme, o ? Math.max(0, o.events.findIndex((e) => e.key === event)) : 0)} className={`grid min-h-screen bg-[var(--adm-bg,#f6f0e2)] text-[14px] text-[var(--adm-ink,#33402f)] transition-colors duration-300 ${mob ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[236px_minmax(0,1fr)]'}`}>
      <LeaveGuard />
      <aside
        className={`bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] flex flex-col sticky top-0 z-[15] min-w-0 ${mob ? 'gap-[10px] pt-3 px-[14px] pb-[10px] h-auto' : 'gap-[24px] pt-[30px] px-4 pb-[22px] h-screen'}`}
      >
        {mob ? (
          // Phones: the name and Sign out share one short row above the section pills.
          <div className="px-[10px] flex items-center justify-between gap-3">
            <div className="font-script text-[24px] leading-[1.15] min-h-[28px] min-w-0 truncate">{name}</div>
            {signOutBtn}
          </div>
        ) : (
          <div className="px-[10px]">
            <div className="font-script text-[30px] leading-[1.15] min-h-[35px]">{name}</div>
            <div className="mt-[6px] text-[11px] font-semibold tracking-[.24em] uppercase text-[#cfd8bb]">RSVP admin</div>
          </div>
        )}
        <SideNav mob={mob} />
        {!mob && (
          <div className="mt-auto flex flex-col gap-[14px] py-4 px-3 border-t border-[rgba(243,236,214,.18)]">
            {o?.daysToGo !== null && o?.daysToGo !== undefined && (
              <div className="font-display text-[22px] italic">{o.daysToGo} days to go</div>
            )}
            {signOutBtn}
          </div>
        )}
      </aside>
      <main className={`min-w-0 ${mob ? 'pt-[22px] px-4 pb-20' : 'pt-9 px-[clamp(20px,4vw,48px)] pb-[60px]'}`}>
        <div className="max-w-[1180px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

/**
 * The admin wears the invitation's colour theme (the first event's Setup → Invitation → Look and feel). The second event is the
 * design's blue celebration (the birthday section of the invitation), so looking at it turns the admin blue
 * too: you always know which event you're in.
 */
function themeVars(theme: string | undefined, slot: number): CSSProperties {
  const t: Record<string, string | undefined> = (theme && THEMES[theme]) || {};
  if (slot === 1) {
    const ink = t.bdtx ?? '#2f3d5c';
    return { '--adm-ink': ink, '--adm-soft': t.bdbg ?? '#dde7f3', '--adm-bg': '#eef2f8', '--adm-accent': t.bdac ?? '#4a6290', '--adm-accent-deep': ink } as CSSProperties;
  }
  // Buttons keep the admin's sage in the first event and Account (the theme's own accents are too light for white text).
  return { '--adm-ink': t.dg ?? '#33402f', '--adm-soft': t.b2 ?? '#cfd8bb', '--adm-bg': t.iv ?? '#f6f0e2', '--adm-accent': '#5d6b47', '--adm-accent-deep': '#46543a' } as CSSProperties;
}

/** Where you are, for screen titles: an event's name, or "Account". */
export function useSectionName(): string {
  const { event, overview } = useAdmin();
  return overview?.events.find((e) => e.key === event)?.name ?? 'Account';
}

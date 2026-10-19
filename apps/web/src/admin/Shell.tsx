import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Overview } from '../lib/api';
import { THEMES } from '../guest/generated/themes';
import { coupleName } from '../lib/remember';
import { useAutoRefresh, useMedia } from './ui';

/** Shared wedding summary: nav badges, sidebar footer and the Overview tab all read it. */
interface AdminData {
  wid: string;
  overview: Overview | null;
  error: string;
  reload: () => Promise<void>;
  /** The event the admin is looking at (sidebar switcher); tabs show that event only. */
  event: string;
  setEvent: (key: string) => void;
}
const Ctx = createContext<AdminData>({ wid: '', overview: null, error: '', reload: async () => {}, event: '', setEvent: () => {} });
export const useAdmin = () => useContext(Ctx);

/** The switcher's "Both events" overview: every tab shows all events together. */
export const ALL_EVENTS = 'all';
const EVENT_KEY = (wid: string) => `wp.admin.event.${wid}`;
const readEvent = (wid: string) => {
  try {
    return localStorage.getItem(EVENT_KEY(wid)) ?? '';
  } catch {
    return '';
  }
};

export function AdminDataProvider({ wid, children, onSignedOut }: { wid: string; children: ReactNode; onSignedOut: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [event, setEventState] = useState(() => readEvent(wid) || ALL_EVENTS);
  const setEvent = useCallback(
    (key: string) => {
      setEventState(key);
      try {
        localStorage.setItem(EVENT_KEY(wid), key);
      } catch {
        /* remembered for this visit only */
      }
    },
    [wid],
  );
  const reload = useCallback(async () => {
    try {
      const o = await api.overview(wid, event && event !== ALL_EVENTS ? event : undefined);
      setOverview(o);
      setError('');
      // A remembered event that was removed: back to both events.
      if (event !== ALL_EVENTS && !o.events.some((e) => e.key === event)) setEvent(ALL_EVENTS);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onSignedOut();
      setError((e as Error).message);
    }
  }, [wid, event, setEvent, onSignedOut]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useAutoRefresh(reload); // Overview figures and nav badges stay current
  return <Ctx.Provider value={{ wid, overview, error, reload, event, setEvent }}>{children}</Ctx.Provider>;
}


/**
 * The admin's menu: "Account" (both events together: overview, the joint guest list, messages to
 * everyone and SMS setup, the shared invitation, photos), then one section per event with its own
 * tabs. Opening a section looks at that event everywhere (and turns the birthday blue).
 */
export const ACCOUNT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'guests', label: 'Guest list' },
  { key: 'texts', label: 'SMS' },
  { key: 'pages', label: 'Setup' },
  { key: 'photos', label: 'Photos' },
] as const;
export const EVENT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'guests', label: 'Guests' },
  { key: 'dietary', label: 'Dietary' },
  { key: 'texts', label: 'SMS' },
  { key: 'seating', label: 'Seating' },
  { key: 'photos', label: 'Photos' },
  { key: 'pages', label: 'Setup' },
] as const;
/** Every admin route (Events stays reachable by link; its work now lives in Overview and Setup). */
export const TABS = [...ACCOUNT_TABS, ...EVENT_TABS, { key: 'events', label: 'Events' }, { key: 'settings', label: 'SMS setup' }] as const;
export type TabKey = (typeof TABS)[number]['key'];

function badge(key: TabKey, o: Overview | null, group: string): string {
  if (!o) return '';
  const ev = o.perEvent?.find((e) => e.key === group);
  switch (key) {
    case 'guests':
      return String(ev ? ev.invited : o.nav.guests);
    case 'dietary':
      return String(o.nav.dietary);
    case 'texts':
      return o.nav.smsLive ? (ev ? '' : `${o.nav.autopilot} on autopilot`) : 'Not set up';
    default:
      return '';
  }
}

function SideNav({ mob }: { mob: boolean }) {
  const { tab = 'overview' } = useParams();
  const go = useNavigate();
  const { wid, overview: o, event, setEvent } = useAdmin();
  const groups: { key: string; name: string; tabs: readonly { key: TabKey; label: string }[] }[] = [
    { key: ALL_EVENTS, name: 'Account', tabs: ACCOUNT_TABS },
    ...(o?.events ?? []).map((e) => ({ key: e.key, name: e.name, tabs: EVENT_TABS })),
  ];
  const current = groups.find((g) => g.key === event) ?? groups[0]!;
  const open = (g: (typeof groups)[number]) => {
    setEvent(g.key);
    // Stay on the same kind of page if the section has it (SMS → SMS), else its overview.
    go(`/admin/${wid}/${g.tabs.some((t) => t.key === tab) ? tab : 'overview'}`);
  };
  const tabLink = (t: { key: TabKey; label: string }) => (
    <NavLink
      key={t.key}
      to={`/admin/${wid}/${t.key}`}
      className={({ isActive }) =>
        `flex-none whitespace-nowrap flex items-center justify-between gap-[10px] rounded-[8px] text-left no-underline ${mob ? 'py-2 px-3 text-[14px]' : 'py-[9px] px-3 text-[15px]'} ${
          isActive || tab === t.key ? 'bg-[#f3ecd6] !text-[var(--adm-ink,#33402f)]' : 'bg-transparent !text-[#f3ecd6] hover:!text-[#f3ecd6]'
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
        aria-expanded={on}
        aria-current={on ? 'true' : undefined}
        onClick={() => open(g)}
        className={`flex-none text-left rounded-[8px] border cursor-pointer font-semibold ${mob ? 'py-[6px] px-3 text-[13px]' : 'py-2 px-3 text-[13px] tracking-[.08em] uppercase'} ${
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
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1">
          {groupBtn(g)}
          {g.key === current.key && <div className="flex flex-col gap-[2px] pl-2">{g.tabs.map(tabLink)}</div>}
        </div>
      ))}
    </nav>
  );
}

/** design/RSVP Admin.dc.html shell: 236px sidebar #33402f; under 760px a sticky top bar with scrolling nav pills. */
export function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { overview: o, event } = useAdmin();
  const mob = useMedia('(max-width: 759px)');
  const name = o ? o.wedding.adminName.trim() || coupleName(o.wedding) : '';

  return (
    <div style={themeVars(o?.wedding.theme, o ? Math.max(0, o.events.findIndex((e) => e.key === event)) : 0)} className={`grid min-h-screen bg-[var(--adm-bg,#f6f0e2)] text-[14px] text-[#33402f] transition-colors duration-300 ${mob ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[236px_minmax(0,1fr)]'}`}>
      <aside
        className={`bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] flex flex-col sticky top-0 z-[15] min-w-0 ${mob ? 'gap-[10px] pt-3 px-[14px] pb-[10px] h-auto' : 'gap-[24px] pt-[30px] px-4 pb-[22px] h-screen'}`}
      >
        <div className="px-[10px]">
          <div className="font-script text-[30px] leading-[1.15] min-h-[35px]">{name}</div>
          <div className="mt-[6px] text-[11px] font-semibold tracking-[.24em] uppercase text-[#cfd8bb]">RSVP admin</div>
        </div>
        <SideNav mob={mob} />
        {!mob && (
          <div className="mt-auto flex flex-col gap-[14px] py-4 px-3 border-t border-[rgba(243,236,214,.18)]">
            {o?.daysToGo !== null && o?.daysToGo !== undefined && (
              <div className="font-display text-[22px] italic">{o.daysToGo} days to go</div>
            )}
            <button onClick={onSignOut} className="self-start p-0 border-0 bg-transparent text-[#cfd8bb] text-[12px] underline cursor-pointer">
              Sign out
            </button>
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
 * The admin wears the invitation's colour theme (Guest pages → Look and feel). The second event is the
 * design's blue celebration (the birthday section of the invitation), so looking at it turns the admin blue
 * too: you always know which event you're in.
 */
function themeVars(theme: string | undefined, slot: number): CSSProperties {
  const t: Record<string, string | undefined> = (theme && THEMES[theme]) || {};
  if (slot === 1) {
    return { '--adm-ink': t.bdtx ?? '#2f3d5c', '--adm-soft': t.bdbg ?? '#dde7f3', '--adm-bg': '#eef2f8' } as CSSProperties;
  }
  return { '--adm-ink': t.dg ?? '#33402f', '--adm-soft': t.b2 ?? '#cfd8bb', '--adm-bg': t.iv ?? '#f6f0e2' } as CSSProperties;
}

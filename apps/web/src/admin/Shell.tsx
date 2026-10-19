import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { api, ApiError, type Overview } from '../lib/api';
import { fmtEvent } from '../lib/format';
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
  const [event, setEventState] = useState(() => readEvent(wid));
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
      const o = await api.overview(wid, event || undefined);
      setOverview(o);
      setError('');
      // A remembered event that was removed (or none yet): look at the first one.
      if (o.events.length && !o.events.some((e) => e.key === event)) setEvent(o.events[0]!.key);
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

/** Sidebar: which event the admin is looking at. Only shown when there is more than one. */
function EventSwitch({ mob }: { mob: boolean }) {
  const { overview: o, event, setEvent } = useAdmin();
  if (!o || o.events.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Event" className={`flex gap-1 ${mob ? 'flex-row overflow-x-auto [scrollbar-width:none]' : 'flex-col px-[10px]'}`}>
      {!mob && <span className="text-[11px] font-semibold tracking-[.2em] uppercase text-[#cfd8bb] mb-1">Showing</span>}
      {o.events.map((e) => {
        const on = e.key === event;
        return (
          <button
            key={e.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setEvent(e.key)}
            className={`flex-none text-left rounded-[8px] border cursor-pointer ${mob ? 'py-[6px] px-3 text-[13px]' : 'py-2 px-3 text-[14px]'} ${
              on ? 'bg-[#cfd8bb] text-[#33402f] border-[#cfd8bb]' : 'bg-transparent text-[#f3ecd6] border-[rgba(243,236,214,.35)] hover:border-[#f3ecd6]'
            }`}
          >
            {e.name}
          </button>
        );
      })}
    </div>
  );
}

export const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'events', label: 'Events' },
  { key: 'guests', label: 'Guests' },
  { key: 'dietary', label: 'Dietary' },
  { key: 'texts', label: 'SMS' }, // messages and setup together
  { key: 'seating', label: 'Seating' },
  { key: 'photos', label: 'Photos' },
  { key: 'pages', label: 'Guest pages' },
] as const;
export type TabKey = (typeof TABS)[number]['key'];

function badge(key: TabKey, o: Overview | null): string {
  if (!o) return '';
  switch (key) {
    case 'guests':
      return String(o.nav.guests);
    case 'dietary':
      return String(o.nav.dietary);
    case 'texts':
      return o.nav.smsLive ? `${o.nav.autopilot} on autopilot` : 'Not set up';
    default:
      return '';
  }
}

/** design/RSVP Admin.dc.html shell: 236px sidebar #33402f; under 760px a sticky top bar with scrolling nav pills. */
export function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { tab = 'overview' } = useParams();
  const { wid, overview: o } = useAdmin();
  const mob = useMedia('(max-width: 759px)');
  const name = o ? o.wedding.adminName.trim() || coupleName(o.wedding) : '';

  return (
    <div className={`grid min-h-screen bg-[#f6f0e2] text-[14px] text-[#33402f] ${mob ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[236px_minmax(0,1fr)]'}`}>
      <aside
        className={`bg-[#33402f] text-[#f3ecd6] flex flex-col sticky top-0 z-[15] min-w-0 ${mob ? 'gap-[10px] pt-3 px-[14px] pb-[10px] h-auto' : 'gap-[30px] pt-[30px] px-4 pb-[22px] h-screen'}`}
      >
        <div className="px-[10px]">
          <div className="font-script text-[30px] leading-[1.15] min-h-[35px]">{name}</div>
          <div className="mt-[6px] text-[11px] font-semibold tracking-[.24em] uppercase text-[#cfd8bb]">RSVP admin</div>
        </div>
        <EventSwitch mob={mob} />
        <nav aria-label="Admin" className={`flex gap-1 flex-none [scrollbar-width:none] ${mob ? 'flex-row overflow-x-auto' : 'flex-col'}`}>
          {TABS.map((t) => (
            <NavLink
              key={t.key}
              to={`/admin/${wid}/${t.key}`}
              className={({ isActive }) =>
                `flex-none whitespace-nowrap flex items-center justify-between gap-[10px] rounded-[8px] text-left text-[15px] no-underline ${mob ? 'py-2 px-3' : 'py-[11px] px-3'} ${
                  isActive || (tab === t.key) ? 'bg-[#f3ecd6] !text-[#33402f]' : 'bg-transparent !text-[#f3ecd6] hover:!text-[#f3ecd6]'
                }`
              }
            >
              <span>{t.label}</span>
              <span className="text-[12px] tabular-nums opacity-85">{badge(t.key, o)}</span>
            </NavLink>
          ))}
        </nav>
        {!mob && (
          <div className="mt-auto flex flex-col gap-[14px] py-4 px-3 border-t border-[rgba(243,236,214,.18)]">
            {o?.events.map((e) => (
              <div key={e.key}>
                <div className="text-[11px] font-semibold tracking-[.2em] uppercase text-[#cfd8bb]">{e.name}</div>
                <div className="mt-1 text-[14px]">{fmtEvent(e.startsAt, o.wedding.timezone)}</div>
              </div>
            ))}
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

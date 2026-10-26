import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Me } from '../lib/api';
import { GuestPlanningBar } from './GuestPlanning';
import { Guests } from './Guests';
import { Join } from './Join';
import { Login } from './Login';
import { Overview } from './Overview';
import { GuestPages } from './pages/GuestPages';
import { Dietary } from './diet/Dietary';
import { Photos } from './photos/Photos';
import { Settings } from './settings/Settings';
import { Help } from './help/Help';
import { EventDayChecklist } from './checklists/EventDayChecklist';
import { Party } from './party/Party';
import { WeddingPlanner } from './planner/WeddingPlanner';
import { Seating } from './seating/Seating';
import { SmsTab } from './texts/SmsTab';
import { Messages } from './messages/Messages';
import { ACCOUNT, ALL_EVENTS, AdminDataProvider, lastSection, Shell, TABS, useAdmin } from './Shell';
import { Eyebrow, Loading, Pill, ToastProvider } from './ui';
import { lastPlace, placesOf, rememberPlace } from '../lib/places';

type State = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'signed-in'; me: Me } | { kind: 'error'; message: string };

/** /admin: checks the session, shows sign-in when needed, then the wedding's tabs. */
export function AdminRoot() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const { pathname } = useLocation();
  const go = useNavigate();
  useEffect(() => {
    document.title = 'Admin';
  }, []);

  useEffect(() => {
    api
      .me()
      .then((me) => setState({ kind: 'signed-in', me }))
      .catch((e: unknown) =>
        setState(e instanceof ApiError && e.status === 401 ? { kind: 'signed-out' } : { kind: 'error', message: (e as Error).message }),
      );
  }, []);
  const signedOut = useCallback(() => setState({ kind: 'signed-out' }), []);
  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setState({ kind: 'signed-out' });
  }, []);

  // An invitation to help run a wedding opens its own page, signed in or not.
  if (pathname.replace(/\/+$/, '') === '/admin/join') {
    return (
      <Join
        onJoined={(me) => {
          setState({ kind: 'signed-in', me });
          const w = me.weddings[me.weddings.length - 1];
          go(w ? `/admin/${w.id}` : '/admin', { replace: true });
        }}
      />
    );
  }
  if (state.kind === 'loading') return <div className="min-h-screen bg-[#f6f0e2]" aria-busy="true" />;
  if (state.kind === 'signed-out') return <Login onSignedIn={(me) => setState({ kind: 'signed-in', me })} />;
  if (state.kind === 'error') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-center">
        <p role="alert" className="text-[#8a5a45]">{state.message}</p>
      </main>
    );
  }

  const { me } = state;
  return (
    <ToastProvider>
      <Routes>
        <Route index element={<Places me={me} onSignOut={signOut} />} />
        <Route path=":wid" element={<Remembered />} />
        <Route path=":wid/:tab" element={<OldAddress />} />
        <Route path=":wid/:section/:tab" element={<WeddingAdmin me={me} onSignedOut={signedOut} onSignOut={signOut} />} />
      </Routes>
    </ToastProvider>
  );
}

/** /admin/:wid opens the section last used on this device. */
function Remembered() {
  const { wid = '' } = useParams();
  return <Navigate to={`/admin/${wid}/${lastSection(wid)}/overview`} replace />;
}

/** Addresses from before the section was in them (/admin/:wid/:tab), or a bare section (/admin/:wid/brunch). */
function OldAddress() {
  const { wid = '', tab = '' } = useParams();
  const { search } = useLocation();
  if (!TABS.some((t) => t.key === tab) && !PLANNER_VIEWS.has(tab)) return <Navigate to={`/admin/${wid}/${tab}/overview`} replace />;
  return <Navigate to={`/admin/${wid}/${lastSection(wid)}/${tab}${search}`} replace />;
}

/** Pages that belong to Account only, or to an event only; the rest (Overview, SMS) exist in both. */
const ACCOUNT_ONLY = new Set<string>(['settings', 'events', 'look', 'help']);
const EVENT_ONLY = new Set<string>(['guests', 'dietary', 'seating', 'party', 'day', 'photos', 'pages', 'planner']);
/** Budget, Vendors and the assistant were Account pages; they're views of the Wedding planner now. */
const PLANNER_VIEWS = new Set<string>(['budget', 'vendors', 'assistant']);

function WeddingAdmin({ me, onSignedOut, onSignOut }: { me: Me; onSignedOut: () => void; onSignOut: () => void }) {
  const { wid = '', section = ACCOUNT, tab = 'overview' } = useParams();
  useEffect(() => rememberPlace(`w:${wid}`), [wid]);
  if (!me.weddings.some((w) => w.id === wid)) return <Navigate to="/admin" replace />;
  return (
    <AdminDataProvider wid={wid} section={section} onSignedOut={onSignedOut}>
      <Shell onSignOut={onSignOut}>
        <SectionPage key={section} section={section} tab={tab} />
      </Shell>
    </AdminDataProvider>
  );
}

/**
 * The page for /admin/:wid/:section/:tab. An address that doesn't fit (an event that was removed, an event
 * page asked for in Account, an Account page in an event, an old name) is corrected, keeping its filters.
 */
function SectionPage({ section, tab }: { section: string; tab: string }) {
  const { overview: o, path } = useAdmin();
  const { search } = useLocation();
  // Account's texting setup and admin look are views of Settings now.
  if (tab === 'look') return <Navigate to={`${path('settings', ALL_EVENTS)}?view=look`} replace />;
  if (tab === 'texts' && section === ACCOUNT) return <Navigate to={`${path('settings', ALL_EVENTS)}?view=texting`} replace />;
  // Wedding party sign-ins moved from Setup into the Wedding party page.
  if (tab === 'pages' && new URLSearchParams(search).get('page') === 'party') return <Navigate to={`${path('party')}?view=access`} replace />;
  if (tab === 'events') return <Navigate to={path('overview', ALL_EVENTS)} replace />;
  if (PLANNER_VIEWS.has(tab) || (tab === 'planner' && o && o.events[0] && section !== o.events[0].key)) {
    // The Wedding planner lives in the first event's section only.
    if (!o) return <Loading />;
    const first = o.events[0]?.key;
    return <Navigate to={first ? path(PLANNER_VIEWS.has(tab) ? `planner?view=${tab}` : `planner${search}`, first) : path('overview', ALL_EVENTS)} replace />;
  }
  if (!TABS.some((t) => t.key === tab)) return <Navigate to={path('overview')} replace />;
  // The wedding has a wedding party (with the couple's checklists); every other event has a day checklist.
  if (!o && section !== ACCOUNT && (tab === 'party' || tab === 'day' || tab === 'planner')) return <Loading />;
  if (o && o.events[0] && section !== ACCOUNT) {
    const isWedding = section === o.events[0].key;
    if (tab === 'party' && !isWedding) return <Navigate to={path('day')} replace />;
    if (tab === 'day' && isWedding) return <Navigate to={`${path('planner')}?view=checklist`} replace />;
  }
  if (section !== ACCOUNT && ACCOUNT_ONLY.has(tab)) return <Navigate to={path(tab, ALL_EVENTS) + search} replace />;
  if (o && section !== ACCOUNT && !o.events.some((e) => e.key === section)) return <Navigate to={path('overview', ALL_EVENTS)} replace />;
  if (section === ACCOUNT && EVENT_ONLY.has(tab)) {
    if (!o) return <Loading />;
    const first = o.events[0]?.key;
    return <Navigate to={first ? path(tab, first) + search : path('overview')} replace />;
  }
  switch (tab) {
    case 'overview':
      return <Overview />;
    case 'messages':
      return <Messages />;
    case 'guests':
      return <Planning><Guests /></Planning>;
    case 'dietary':
      return <Planning><Dietary /></Planning>;
    case 'seating':
      return <Planning><Seating /></Planning>;
    case 'pages':
      return <GuestPages />;
    case 'texts':
      return <SmsTab />;
    case 'photos':
      return <Photos />;
    case 'party':
      return <Party />;
    case 'day':
      return <EventDayChecklist />;
    case 'settings':
      return <Settings />;
    case 'help':
      return <Help />;
    default:
      return <WeddingPlanner />;
  }
}

/** Guest list, Dietary and Seating share the Guest planning switcher. */
function Planning({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <GuestPlanningBar />
      {children}
    </div>
  );
}

/**
 * Where to, after signing in: every place this account can go (each wedding, the company portal, a vendor
 * listing). One place, or the one last chosen on this device: straight there (?choose=1 always asks).
 */
function Places({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const { search } = useLocation();
  const places = placesOf(me);
  const choose = new URLSearchParams(search).get('choose') === '1';
  const last = places.find((p) => p.key === lastPlace());
  const straight = places.length === 1 ? places[0] : !choose ? last : undefined;
  if (straight) return <Navigate to={straight.to} replace />;
  const first = me.user.email.split('@')[0] ?? '';
  return (
    <main className="min-h-screen p-6 max-w-[720px] mx-auto flex flex-col gap-5">
      <div>
        <Eyebrow>Signed in as {me.user.email}</Eyebrow>
        <h1 className="mt-[6px] mb-0 font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">Where to{first ? `, ${first}` : ''}?</h1>
        <p className="m-0 mt-1 text-[15px] text-[#5b6a52]">One sign-in for everything. Switch any time from the top of each page.</p>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col gap-3">
        {places.map((p) => (
          <li key={p.key}>
            <Link
              to={p.to}
              onClick={() => rememberPlace(p.key)}
              className="flex justify-between items-center gap-4 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] no-underline !text-[#33402f] hover:border-[#33402f]"
            >
              <span className="flex flex-col min-w-0">
                <span className={p.kind === 'wedding' ? 'font-script text-[30px] leading-[1.15]' : 'font-display text-[26px] leading-[1.15]'}>{p.title}</span>
                <span className="text-[14px] text-[#5b6a52]">{p.detail}</span>
              </span>
              <span aria-hidden className="text-[22px]">
                →
              </span>
            </Link>
          </li>
        ))}
        {!places.length && <li className="p-4 rounded-[16px] border border-[#e2d7bc] text-[#5b6a52]">Nothing on this account yet. Start a wedding from the front page, or ask whoever invited you for a new link.</li>}
      </ul>
      <Pill onClick={onSignOut} className="self-start">
        Sign out
      </Pill>
    </main>
  );
}

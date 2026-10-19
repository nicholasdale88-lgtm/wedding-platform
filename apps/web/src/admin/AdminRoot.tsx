import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { api, ApiError, type Me } from '../lib/api';
import { coupleName } from '../lib/remember';
import { GuestPlanningBar } from './GuestPlanning';
import { Guests } from './Guests';
import { Login } from './Login';
import { Overview } from './Overview';
import { GuestPages } from './pages/GuestPages';
import { Dietary } from './diet/Dietary';
import { Photos } from './photos/Photos';
import { Party } from './party/Party';
import { WeddingPlanner } from './planner/WeddingPlanner';
import { Seating } from './seating/Seating';
import { SmsTab } from './texts/SmsTab';
import { Messages } from './messages/Messages';
import { ACCOUNT, ALL_EVENTS, AdminDataProvider, lastSection, Shell, TABS, useAdmin } from './Shell';
import { Eyebrow, Loading, Pill, ToastProvider } from './ui';

type State = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'signed-in'; me: Me } | { kind: 'error'; message: string };

/** /admin: checks the session, shows sign-in when needed, then the wedding's tabs. */
export function AdminRoot() {
  const [state, setState] = useState<State>({ kind: 'loading' });
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
        <Route index element={me.weddings.length === 1 ? <Navigate to={me.weddings[0]!.id} replace /> : <WeddingPicker me={me} onSignOut={signOut} />} />
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
const ACCOUNT_ONLY = new Set<string>(['messages', 'settings', 'events']);
const EVENT_ONLY = new Set<string>(['guests', 'dietary', 'seating', 'party', 'photos', 'pages', 'planner']);
/** Budget, Vendors and the assistant were Account pages; they're views of the Wedding planner now. */
const PLANNER_VIEWS = new Set<string>(['budget', 'vendors', 'assistant']);

function WeddingAdmin({ me, onSignedOut, onSignOut }: { me: Me; onSignedOut: () => void; onSignOut: () => void }) {
  const { wid = '', section = ACCOUNT, tab = 'overview' } = useParams();
  if (!me.weddings.some((w) => w.id === wid)) return <Navigate to="/admin" replace />;
  return (
    <AdminDataProvider wid={wid} section={section} onSignedOut={onSignedOut}>
      <Shell onSignOut={onSignOut}>
        <SectionPage section={section} tab={tab} />
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
  if (tab === 'settings') return <Navigate to={path('texts', ALL_EVENTS)} replace />;
  if (tab === 'events') return <Navigate to={path('overview', ALL_EVENTS)} replace />;
  if (PLANNER_VIEWS.has(tab) || (tab === 'planner' && o && o.events[0] && section !== o.events[0].key)) {
    // The Wedding planner lives in the first event's section only.
    if (!o) return <Loading />;
    const first = o.events[0]?.key;
    return <Navigate to={first ? path(PLANNER_VIEWS.has(tab) ? `planner?view=${tab}` : `planner${search}`, first) : path('overview', ALL_EVENTS)} replace />;
  }
  if (!TABS.some((t) => t.key === tab)) return <Navigate to={path('overview')} replace />;
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

function WeddingPicker({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  return (
    <main className="min-h-screen p-6 max-w-[1180px] mx-auto">
      <Eyebrow>Signed in as {me.user.email}</Eyebrow>
      <h1 className="mt-[6px] font-display font-medium text-[40px] leading-[1.08]">Your weddings</h1>
      <ul className="list-none p-0 mt-4 flex flex-col">
        {me.weddings.map((w) => (
          <li key={w.id} className="py-3 border-t border-[#e2d7bc]">
            <Link to={w.id} className="font-script text-[30px] leading-[1.15] no-underline !text-[#33402f]">{coupleName(w)}</Link>
          </li>
        ))}
        {me.weddings.length === 0 && <li className="py-3 border-t border-[#e2d7bc] text-[#5b6a52]">No weddings on this account yet.</li>}
      </ul>
      <Pill onClick={onSignOut} className="mt-4">
        Sign out
      </Pill>
    </main>
  );
}

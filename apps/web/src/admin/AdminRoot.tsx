import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api, ApiError, type Me } from '../lib/api';
import { coupleName } from '../lib/remember';
import { Guests } from './Guests';
import { Login } from './Login';
import { Overview } from './Overview';
import { GuestPages } from './pages/GuestPages';
import { Dietary } from './diet/Dietary';
import { Seating } from './seating/Seating';
import { SmsSetup } from './settings/SmsSetup';
import { SmsMessages } from './texts/SmsMessages';
import { AdminDataProvider, Shell, TABS } from './Shell';
import { Eyebrow, ToastProvider } from './ui';

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
        <Route index element={me.weddings.length === 1 ? <Navigate to={`${me.weddings[0]!.id}/overview`} replace /> : <WeddingPicker me={me} onSignOut={signOut} />} />
        <Route path=":wid" element={<Navigate to="overview" replace />} />
        <Route path=":wid/:tab" element={<WeddingAdmin me={me} onSignedOut={signedOut} onSignOut={signOut} />} />
      </Routes>
    </ToastProvider>
  );
}

function WeddingAdmin({ me, onSignedOut, onSignOut }: { me: Me; onSignedOut: () => void; onSignOut: () => void }) {
  const { wid = '', tab = 'overview' } = useParams();
  if (!me.weddings.some((w) => w.id === wid)) return <Navigate to="/admin" replace />;
  const known = TABS.find((t) => t.key === tab);
  return (
    <AdminDataProvider wid={wid} onSignedOut={onSignedOut}>
      <Shell onSignOut={onSignOut}>
        {tab === 'overview' ? <Overview /> : tab === 'guests' ? <Guests /> : tab === 'pages' ? <GuestPages /> : tab === 'texts' ? <SmsMessages /> : tab === 'settings' ? <SmsSetup /> : tab === 'dietary' ? <Dietary /> : tab === 'seating' ? <Seating /> : known ? <Building label={known.label} /> : <Navigate to={`/admin/${wid}/overview`} replace />}
      </Shell>
    </AdminDataProvider>
  );
}

/** Tabs still being built show where they are in the plan, rather than a blank page. */
function Building({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-[14px]">
      <Eyebrow>{label}</Eyebrow>
      <h1 className="m-0 font-display font-medium text-[40px] leading-[1.08]">Being built next</h1>
      <p className="m-0 max-w-[560px] text-[15px] text-[#5b6a52]">
        This part of the admin is on its way. Overview and Guests are working now; the rest arrive one by one, each live here as soon as it is ready.
      </p>
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
            <Link to={`${w.id}/overview`} className="font-script text-[30px] leading-[1.15] no-underline !text-[#33402f]">{coupleName(w)}</Link>
          </li>
        ))}
        {me.weddings.length === 0 && <li className="py-3 border-t border-[#e2d7bc] text-[#5b6a52]">No weddings on this account yet.</li>}
      </ul>
      <button onClick={onSignOut} className="mt-4 py-[10px] px-[18px] rounded-full border border-[#c6b794] bg-transparent text-[14px] font-medium cursor-pointer hover:bg-[#efe7d3]">
        Sign out
      </button>
    </main>
  );
}

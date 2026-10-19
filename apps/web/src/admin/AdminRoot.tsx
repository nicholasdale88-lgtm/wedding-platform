import { useEffect, useState } from 'react';
import { api, ApiError, type Me } from '../lib/api';
import { coupleName } from '../lib/remember';
import { Login } from './Login';

type State = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'signed-in'; me: Me } | { kind: 'error'; message: string };

/** /admin: checks the session, shows sign-in when needed. The admin shell (M3.1) mounts where the holding view is. */
export function AdminRoot() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    api
      .me()
      .then((me) => setState({ kind: 'signed-in', me }))
      .catch((e: unknown) =>
        setState(e instanceof ApiError && e.status === 401 ? { kind: 'signed-out' } : { kind: 'error', message: (e as Error).message }),
      );
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
  const signOut = async () => {
    await api.logout().catch(() => undefined);
    setState({ kind: 'signed-out' });
  };
  return (
    <main className="min-h-screen p-6 max-w-[1180px]">
      <p className="m-0 text-[11px] font-semibold tracking-[.22em] uppercase text-[#5b6a52]">Signed in as {me.user.email}</p>
      <ul className="list-none p-0 mt-4">
        {me.weddings.map((w) => (
          <li key={w.id} className="font-script text-[30px] leading-[1.15]">{coupleName(w)}</li>
        ))}
      </ul>
      <button
        onClick={signOut}
        className="mt-4 py-[10px] px-[18px] rounded-full border border-[#c6b794] bg-transparent text-[14px] font-medium cursor-pointer hover:bg-[#efe7d3]"
      >
        Sign out
      </button>
    </main>
  );
}

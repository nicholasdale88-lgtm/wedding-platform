import { useState, type FormEvent } from 'react';
import { api, ApiError, type Me } from '../lib/api';
import { coupleName, readLast, writeLast } from '../lib/remember';

/** Pill input, verbatim from the design's passcode field. */
const pill =
  'w-full py-3 px-4 border border-[#d3c6a4] rounded-full bg-[#fbf8f2] text-[16px] text-center placeholder:text-[#5b6a52]/70';

/**
 * Sign-in screen: design/RSVP Admin.dc.html passcode screen (DESIGN_LOCK).
 * The email field is an addition for real accounts (docs/DESIGN_DEVIATIONS.md #1).
 */
export function Login({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const last = readLast();
  const [email, setEmail] = useState(last?.email ?? '');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !passcode) return setError('Enter your email and passcode.');
    setBusy(true);
    setError('');
    try {
      const me = await api.login(email, passcode);
      const w = me.weddings[0];
      writeLast({ email: me.user.email, name: w ? coupleName(w) : (last?.name ?? '') });
      onSignedIn(me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setPasscode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fixed inset-0 z-50 bg-[#f6f0e2] flex items-center justify-center p-6">
      <form onSubmit={submit} noValidate className="w-[min(380px,100%)] flex flex-col items-center gap-[14px] text-center">
        <h1 className="m-0 font-script font-normal text-[40px] leading-[1.15]">{last?.name || 'Welcome back'}</h1>
        <p className="m-0 text-[11px] font-semibold tracking-[.24em] uppercase text-[#5b6a52]">RSVP admin · private</p>
        <label className="sr-only" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={`mt-[10px] ${pill}`}
        />
        <label className="sr-only" htmlFor="passcode">Passcode</label>
        <input
          id="passcode"
          type="password"
          autoComplete="current-password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          className={pill}
        />
        <div role="alert" aria-live="polite" className="min-h-[18px] text-[13px] text-[#8a5a45]">
          {error}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 px-[18px] rounded-full border border-[#5d6b47] bg-[#5d6b47] text-[#fbf8f2] text-[15px] font-medium cursor-pointer hover:bg-[#46543a] disabled:opacity-70 disabled:cursor-wait"
        >
          {busy ? 'Opening…' : 'Open admin'}
        </button>
      </form>
    </main>
  );
}

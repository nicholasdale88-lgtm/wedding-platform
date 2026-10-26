import { useState, type FormEvent } from 'react';
import { api, ApiError, type Me } from '../lib/api';
import { resetMeCache } from '../lib/ProfileSwitch';
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
  // Forgot your passcode: a link to set a new one is emailed.
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState('');

  async function askReset(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim()) return setError('Enter the email you sign in with.');
    setBusy(true);
    setError('');
    try {
      const r = await api.forgot(email);
      setSent(r.emailed ? `If there’s an account for ${email.trim()}, a link to set a new passcode is on its way. It works for an hour.` : 'Email isn’t switched on for this site yet, so we can’t send a link. Ask the person who runs the site to reset it for you.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !passcode) return setError('Enter your email and passcode.');
    setBusy(true);
    setError('');
    try {
      const me = await api.login(email, passcode);
      resetMeCache(); // the switcher in each header asks again, as this account
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

  if (forgot)
    return (
      <main className="fixed inset-0 z-50 bg-[#f6f0e2] flex items-center justify-center p-6">
        <form onSubmit={askReset} noValidate className="w-[min(380px,100%)] flex flex-col items-center gap-[14px] text-center">
          <h1 className="m-0 font-display font-medium text-[32px] leading-[1.15]">Forgot your passcode?</h1>
          <p className="m-0 text-[14px] text-[#5b6a52]">We’ll email you a link to set a new one.</p>
          <label className="sr-only" htmlFor="forgot-email">Email</label>
          <input id="forgot-email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={`mt-[10px] ${pill}`} />
          <div role="alert" aria-live="polite" className="min-h-[18px] text-[13px] text-[#8a5a45]">
            {error}
          </div>
          {sent ? (
            <p role="status" className="m-0 text-[14px] text-[#33402f]">{sent}</p>
          ) : (
            <button type="submit" disabled={busy} className="w-full py-3 px-[18px] rounded-full border border-[#5d6b47] bg-[#5d6b47] text-[#fbf8f2] text-[15px] font-medium cursor-pointer hover:bg-[#46543a] disabled:opacity-70 disabled:cursor-wait">
              {busy ? 'Sending…' : 'Email me a link'}
            </button>
          )}
          <button type="button" onClick={() => {
              setForgot(false);
              setSent('');
              setError('');
            }} className="p-0 border-0 bg-transparent underline cursor-pointer text-[14px] text-[#33402f]">
            Back to sign in
          </button>
        </form>
      </main>
    );

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
        <button type="button" onClick={() => {
            setForgot(true);
            setError('');
          }} className="p-0 border-0 bg-transparent underline cursor-pointer text-[14px] text-[#33402f]">
          Forgot your passcode?
        </button>
        <a href="/" className="text-[14px] !text-[#5b6a52]">
          New here? Start free
        </a>
      </form>
    </main>
  );
}

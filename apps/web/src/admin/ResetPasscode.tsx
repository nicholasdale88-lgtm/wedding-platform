import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

const pill = 'w-full py-3 px-4 border border-[#d3c6a4] rounded-full bg-[#fbf8f2] text-[16px] text-center placeholder:text-[#5b6a52]/70';

/**
 * /admin/reset?t=…: the emailed "set a new passcode" link. The new passcode, twice; then signed in, and
 * every other device signed out.
 */
export function ResetPasscode() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (a.length < 8) return setError('Use at least 8 characters.');
    if (a !== b) return setError('The two passcodes don’t match.');
    setBusy(true);
    setError('');
    try {
      await api.reset(token, a);
      window.location.assign('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };
  return (
    <main className="fixed inset-0 bg-[#f6f0e2] flex items-center justify-center p-6 text-[#33402f]">
      <form onSubmit={(e) => void submit(e)} noValidate className="w-[min(380px,100%)] flex flex-col items-center gap-[14px] text-center">
        <h1 className="m-0 font-display font-medium text-[32px] leading-[1.15]">Set a new passcode</h1>
        <p className="m-0 text-[14px] text-[#5b6a52]">8 characters or more. You’ll be signed out everywhere else.</p>
        <label className="sr-only" htmlFor="new-passcode">New passcode</label>
        <input id="new-passcode" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} placeholder="New passcode" className={`mt-[10px] ${pill}`} />
        <label className="sr-only" htmlFor="again-passcode">The new passcode again</label>
        <input id="again-passcode" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} placeholder="The new passcode again" className={pill} />
        <div role="alert" aria-live="polite" className="min-h-[18px] text-[13px] text-[#8a5a45]">
          {error}
        </div>
        <button type="submit" disabled={busy || !token} className="w-full py-3 px-[18px] rounded-full border border-[#5d6b47] bg-[#5d6b47] text-[#fbf8f2] text-[15px] font-medium cursor-pointer hover:bg-[#46543a] disabled:opacity-70">
          {busy ? 'Saving…' : 'Save and open admin'}
        </button>
        <a href="/admin" className="text-[14px] !text-[#5b6a52]">
          Back to sign in
        </a>
      </form>
    </main>
  );
}

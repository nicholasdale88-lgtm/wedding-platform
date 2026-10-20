import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { accountApi, ApiError, type Me } from '../lib/api';

const pill = 'w-full py-3 px-4 border border-[#d3c6a4] rounded-full bg-[#fbf8f2] text-[16px] text-center placeholder:text-[#5b6a52]/70';

/**
 * /admin/join?t=…: someone was invited to help run a wedding. New to us: their name and a passcode make
 * their account. Already have one: their passcode adds this wedding to it. Either way they're signed in.
 */
export function Join({ onJoined }: { onJoined: (me: Me) => void }) {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [info, setInfo] = useState<{ email: string; couple: string; hasAccount: boolean } | null>(null);
  const [gone, setGone] = useState('');
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [passcode, setPasscode] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    accountApi.inviteInfo(token).then(setInfo, (e: Error) => setGone(e.message));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !info) return;
    setBusy(true);
    setError('');
    try {
      onJoined(await accountApi.acceptInvite(token, info.hasAccount ? { passcode } : { passcode, firstName: firstName.trim(), lastName: lastName.trim(), marketingOptIn: optIn }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fixed inset-0 z-50 overflow-y-auto bg-[#f6f0e2] flex items-center justify-center p-6">
      {gone ? (
        <p role="alert" className="max-w-[380px] text-center text-[15px] text-[#8a5a45]">
          {gone}
        </p>
      ) : !info ? (
        <div aria-busy="true" />
      ) : (
        <form onSubmit={submit} noValidate className="w-[min(380px,100%)] flex flex-col items-center gap-[14px] text-center">
          <h1 className="m-0 font-script font-normal text-[40px] leading-[1.15]">{info.couple}</h1>
          <p className="m-0 text-[15px] text-[#5b6a52]">
            You&apos;re invited to help run the wedding admin, as <strong>{info.email}</strong>.
          </p>
          {!info.hasAccount && (
            <>
              <label className="sr-only" htmlFor="first">First name</label>
              <input id="first" autoComplete="given-name" value={firstName} onChange={(e) => setFirst(e.target.value)} placeholder="First name" className={`mt-[6px] ${pill}`} />
              <label className="sr-only" htmlFor="last">Last name</label>
              <input id="last" autoComplete="family-name" value={lastName} onChange={(e) => setLast(e.target.value)} placeholder="Last name" className={pill} />
            </>
          )}
          <label className="sr-only" htmlFor="passcode">{info.hasAccount ? 'Your passcode' : 'Choose a passcode'}</label>
          <input
            id="passcode"
            type="password"
            autoComplete={info.hasAccount ? 'current-password' : 'new-password'}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={info.hasAccount ? 'Your passcode' : 'Choose a passcode (8+ characters)'}
            className={pill}
          />
          {!info.hasAccount && (
            <label className="flex items-start gap-2 text-left text-[13px] text-[#5b6a52] cursor-pointer">
              <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-[2px] w-[18px] h-[18px] accent-[#5d6b47]" />
              Send me wedding-planning tips and news by email (optional)
            </label>
          )}
          <div role="alert" aria-live="polite" className="min-h-[18px] text-[13px] text-[#8a5a45]">
            {error}
          </div>
          <button
            type="submit"
            disabled={busy || !passcode || (!info.hasAccount && !firstName.trim())}
            className="w-full py-3 px-[18px] rounded-full border border-[#5d6b47] bg-[#5d6b47] text-[#fbf8f2] text-[15px] font-medium cursor-pointer hover:bg-[#46543a] disabled:opacity-70"
          >
            {busy ? 'Opening…' : info.hasAccount ? 'Add this wedding' : 'Create my sign-in'}
          </button>
        </form>
      )}
    </main>
  );
}

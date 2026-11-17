import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { guestApi } from '../invitation/api';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { Ornament, partyLook, SANS, SERIF } from './look';

/**
 * The wedding party portal's doors: sign in (email and password), forgot password (a reset link texted
 * to the mobile on their invitation), the invite page (set up a sign-in) and the reset page, and the
 * account bar (change password, sign out). In the wedding's colours, made for a phone.
 */

/** The wedding's ink, set on the page (--pi) by the shell and the party page; the default before it is. */
const ink = 'var(--pi, #33402f)';
const field = 'w-full min-h-[48px] py-3 px-4 rounded-[12px] border bg-white text-[18px]';
const fieldStyle = { borderColor: 'rgba(0,0,0,.15)', color: '#222' };
/** A quiet text button (Forgot your password?, Sign out): still a full thumb's height. */
const linkBtn = 'inline-flex items-center min-h-[44px] px-1 border-0 bg-transparent underline cursor-pointer';

function Shell({ couple, theme, title, children }: { couple: string; theme?: string; title: string; children: ReactNode }) {
  const look = partyLook(theme);
  const vars = { '--pi': look.ink, '--pg': look.gold, '--pp': look.paper } as CSSProperties;
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 overflow-x-hidden" style={{ ...vars, background: look.bg, color: look.ink, fontFamily: SERIF }}>
      <div className="w-full max-w-[420px] flex flex-col gap-5 px-5 py-8 rounded-[24px]" style={{ background: look.card, border: `1px solid ${look.line}`, boxShadow: look.shadow }}>
        <header className="text-center flex flex-col items-center gap-2">
          {couple && (
            <div className="text-[14px] tracking-[.2em] uppercase font-semibold" style={{ fontFamily: SANS, color: look.label }}>
              {couple}
            </div>
          )}
          <h1 className="m-0 font-normal text-[46px] leading-[1.1] break-words max-w-full" style={{ fontFamily: "'Pinyon Script', cursive" }}>
            {title}
          </h1>
          <Ornament gold={look.gold} />
        </header>
        {children}
      </div>
    </main>
  );
}
function Button({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <button type="submit" disabled={busy} className="w-full min-h-[48px] py-3 rounded-full border-0 text-[18px] cursor-pointer disabled:opacity-60" style={{ background: ink, color: 'var(--pp, #fbf8f2)', fontFamily: SANS }}>
      {children}
    </button>
  );
}
const Alert = ({ text, good }: { text: string; good?: boolean }) =>
  text ? (
    <p role={good ? 'status' : 'alert'} className="m-0 p-3 rounded-[12px] text-[17px]" style={good ? { background: '#e6ecdc', color: '#2f3d24' } : { background: '#f4dcd2', color: '#7a4a37' }}>
      {text}
    </p>
  ) : null;

/** Sign in, or ask for a reset link. */
export function PartySignIn({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [me, setMe] = useState<{ couple: string; theme: string } | null>(null);
  const [mode, setMode] = useState<'in' | 'forgot'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ text: string; good?: boolean }>({ text: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    guestApi.portalMe(slug).then(setMe, () => setMe({ couple: '', theme: '' }));
  }, [slug]);
  if (!me) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ text: '' });
    try {
      if (mode === 'in') {
        await guestApi.portalLogin(slug, email, password);
        onDone();
      } else {
        const r = await guestApi.portalForgot(slug, email);
        setMsg({ text: r.message, good: true });
      }
    } catch (x) {
      setMsg({ text: (x as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell couple={me.couple} theme={me.theme} title="Wedding party">
      <p className="m-0 text-center text-[19px] italic">{mode === 'in' ? 'Sign in to see your part of the day, your to-dos and your packing list.' : 'Enter the email or mobile you sign in with. We’ll send you a link to choose a new password.'}</p>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[16px]">
          Email or mobile
          <input type="text" inputMode="email" autoComplete="username" autoCapitalize="none" required value={email} placeholder="you@example.com or 0412 345 678" onChange={(e) => setEmail(e.target.value)} className={field} style={fieldStyle} />
        </label>
        {mode === 'in' && (
          <label className="flex flex-col gap-1 text-[16px]">
            Password
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} style={fieldStyle} />
          </label>
        )}
        <Alert {...msg} />
        <Button busy={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Text me a reset link'}</Button>
      </form>
      <button type="button" onClick={() => {
          setMode(mode === 'in' ? 'forgot' : 'in');
          setMsg({ text: '' });
        }} className={`self-center ${linkBtn} text-[17px]`} style={{ color: ink }}>
        {mode === 'in' ? 'Forgot your password?' : 'Back to sign in'}
      </button>
      <p className="m-0 text-center text-[15px] opacity-75">No sign-in yet? The couple will send you an invite link.</p>
    </Shell>
  );
}

/** /w/:slug/party/join?t= and /w/:slug/party/reset?t=: set up a sign-in, or choose a new password. */
export function PartyLinkPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const t = params.get('t') ?? '';
  const nav = useNavigate();
  const [info, setInfo] = useState<{ name: string; role: string; couple: string; theme: string; email: string; setUp: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    guestApi.portalLink(slug, t).then(
      (i) => {
        setInfo(i);
        setEmail(i.email);
      },
      (e: Error) => setErr(e.message),
    );
  }, [slug, t]);
  if (err) return <GuestMessage message={err} />;
  if (!info) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== again) {
      setMsg('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    try {
      await guestApi.portalSetPassword(slug, t, password, info.setUp ? undefined : email);
      nav(`/w/${encodeURIComponent(slug)}/party`, { replace: true });
    } catch (x) {
      setMsg((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const first = info.name.split(' ')[0];
  return (
    <Shell couple={info.couple} theme={info.theme} title={info.setUp ? 'New password' : `Welcome, ${first}`}>
      <p className="m-0 text-center text-[19px] italic">{info.setUp ? 'Choose a new password. You’ll be signed in, and signed out everywhere else.' : `You’re our ${info.role.toLowerCase()}! Set up your sign-in for the wedding party portal.`}</p>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        {!info.setUp && (
          <label className="flex flex-col gap-1 text-[16px]">
            Your email or mobile (you’ll sign in with it)
            <input type="text" inputMode="email" autoComplete="username" autoCapitalize="none" required value={email} placeholder="you@example.com or 0412 345 678" onChange={(e) => setEmail(e.target.value)} className={field} style={fieldStyle} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[16px]">
          {info.setUp ? 'New password' : 'Choose a password'} (at least 8 characters)
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={field} style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1 text-[16px]">
          Once more
          <input type="password" autoComplete="new-password" required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} className={field} style={fieldStyle} />
        </label>
        <Alert text={msg} />
        <Button busy={busy}>{busy ? 'One moment…' : info.setUp ? 'Save and sign in' : 'Set up and sign in'}</Button>
      </form>
    </Shell>
  );
}

/** Signed in: who, change password, sign out. */
export function AccountBar({ slug, name, onSignedOut }: { slug: string; name: string; onSignedOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ text: string; good?: boolean }>({ text: '' });
  const change = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await guestApi.portalPassword(slug, cur, next);
      setMsg({ text: 'Password changed. Other devices are signed out.', good: true });
      setCur('');
      setNext('');
    } catch (x) {
      setMsg({ text: (x as Error).message });
    }
  };
  return (
    <div className="flex flex-col gap-2 w-full text-[16px]" style={{ fontFamily: SANS }}>
      <div className="flex justify-center items-center gap-x-3 flex-wrap opacity-85">
        <span>Signed in as {name}</span>
        <button type="button" onClick={() => setOpen(!open)} className={`${linkBtn} text-[15px]`} style={{ color: ink }}>
          {open ? 'Close' : 'Password'}
        </button>
        <button type="button" onClick={() => void guestApi.portalLogout(slug).then(onSignedOut, onSignedOut)} className={`${linkBtn} text-[15px]`} style={{ color: ink }}>
          Sign out
        </button>
      </div>
      {open && (
        <form onSubmit={(e) => void change(e)} className="flex flex-col gap-2 p-4 rounded-[16px] bg-white/70 border text-left" style={{ borderColor: 'rgba(0,0,0,.08)' }}>
          <input type="password" autoComplete="current-password" placeholder="Current password" required value={cur} onChange={(e) => setCur(e.target.value)} className={field} style={fieldStyle} />
          <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={field} style={fieldStyle} />
          <Alert {...msg} />
          <Button>Change password</Button>
        </form>
      )}
    </div>
  );
}

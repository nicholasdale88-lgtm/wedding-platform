import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wordmark } from '../sales/Art';
import { api } from '../lib/api';

/**
 * /try: book a free trial before the sample app opens. Names, email and (if known) the date are kept for the
 * company portal (Traffic & errors → Trial bookings); news only if they tick it. Booked once on a device,
 * the trial opens straight away after that.
 */
const KEY = 'yl.trial';
export const trialBooked = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
const markBooked = () => {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* private window: they'll be asked again next time */
  }
};

const INK = '#3a2532';
const SOFT = '#6e6068';
const field = 'w-full py-3 px-4 rounded-[12px] border border-[#e3cfc6] bg-white text-[16px] text-[#3a2532] outline-none focus:border-[#3a2532]';

export function TrialPage() {
  const go = useNavigate();
  const [f, setF] = useState({ name1: '', name2: '', email: '', date: '', news: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    document.title = 'Book your free trial · The Yes List';
    if (trialBooked()) go('/admin/demo', { replace: true });
  }, [go]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name1.trim()) return setProblem('Please add your first name.');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setProblem('Please check your email address.');
    setBusy(true);
    setProblem('');
    try {
      await api.bookTrial({ ...f, name1: f.name1.trim(), name2: f.name2.trim(), email: f.email.trim() });
      markBooked();
      go('/admin/demo', { replace: true });
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(120% 90% at 85% 0%, #5e2c3c 0%, #3d2634 55%, #2a1c26 100%)', color: '#f3ecd6' }}>
      <div style={{ background: '#fffcf8' }}>
        <header className="max-w-[1100px] mx-auto px-4 py-5 flex justify-between items-center">
          <Link to="/" aria-label="The Yes List" className="no-underline">
            <Wordmark size={22} />
          </Link>
          <Link to="/" className="text-[15px] no-underline" style={{ color: INK }}>
            ← Back
          </Link>
        </header>
      </div>
      <main className="px-4 pt-6 pb-20">
        <div className="max-w-[1000px] mx-auto grid gap-10 md:grid-cols-2 items-center">
          <div className="flex flex-col gap-5 text-center md:text-left items-center md:items-start">
            <span className="text-[12px] font-semibold tracking-[.26em] uppercase" style={{ color: '#d6b780' }}>
              Free trial · Nothing to pay
            </span>
            <h1 className="m-0 text-[clamp(40px,6.5vw,68px)] leading-[1.04] font-normal" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
              Book your free trial.
            </h1>
            <p className="m-0 text-[18px] leading-[1.55] max-w-[460px]" style={{ color: '#ecd9d6' }}>
              Step inside a real wedding, fully set up: the guest list, replies coming in, dietary needs and the seating plan. Change anything you like. Nothing is sent.
            </p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[15px]" style={{ color: '#ecd9d6' }}>
              <li>✓ Opens straight away, on your phone or computer</li>
              <li>✓ Try every plan, side by side</li>
              <li>✓ Australian owned and operated</li>
            </ul>
          </div>
          <form onSubmit={submit} aria-label="Book your free trial" className="flex flex-col gap-4 p-6 md:p-8 rounded-[24px] bg-[#fffcf8] shadow-[0_24px_60px_rgba(0,0,0,.3)]" style={{ color: INK }}>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[14px] font-semibold">
                Your first name
                <input className={field} autoComplete="given-name" value={f.name1} onChange={(e) => setF({ ...f, name1: e.target.value })} placeholder="Harriet" maxLength={60} />
              </label>
              <label className="flex flex-col gap-1 text-[14px] font-semibold">
                Your partner’s
                <input className={field} value={f.name2} onChange={(e) => setF({ ...f, name2: e.target.value })} placeholder="Theo" maxLength={60} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[14px] font-semibold">
              Email
              <input className={field} type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@example.com" maxLength={200} />
            </label>
            <label className="flex flex-col gap-1 text-[14px] font-semibold">
              Wedding date <span className="font-normal" style={{ color: SOFT }}>(if you know it)</span>
              <input className={field} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </label>
            {/* For robots only. */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} className="absolute left-[-9999px] w-px h-px opacity-0" />
            <label className="flex gap-3 items-start text-[14px] cursor-pointer" style={{ color: SOFT }}>
              <input type="checkbox" checked={f.news} onChange={(e) => setF({ ...f, news: e.target.checked })} className="mt-1 w-[18px] h-[18px] accent-[#3a2532]" />
              Send me ideas and offers for our wedding now and then (unsubscribe any time).
            </label>
            {problem && (
              <p role="alert" className="m-0 text-[14px] text-[#8a3b2c]">
                {problem}
              </p>
            )}
            <button type="submit" disabled={busy} className="py-[16px] rounded-full border-0 text-[17px] font-semibold cursor-pointer disabled:opacity-60" style={{ background: INK, color: '#fffcf8' }}>
              {busy ? 'Opening your trial…' : 'Start my free trial'}
            </button>
            <span className="text-[12px] text-center" style={{ color: SOFT }}>
              We keep your details private and never sell them. <Link to="/privacy" style={{ color: SOFT }}>Privacy</Link>
            </span>
          </form>
        </div>
      </main>
    </div>
  );
}

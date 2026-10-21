import '@fontsource/cormorant-garamond/400.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, companyApi, type CompanyListing, type CompanyPromo, type CompanySettings, type CompanyStats, type CompanyWedding } from '../lib/api';

/**
 * /company: the company portal, for the platform owner (super admins) only.
 * - Overview: sign-ups (this week, this month, a 12-week chart), plans, money taken, plan requests
 *   waiting, guests and replies, the vendor directory, quote requests.
 * - Weddings: find any wedding (names, address, email); plan requests first; set a plan or extra events.
 * - Promote: promo codes (made here, used when couples pay), the front-page banner, campaign links and
 *   where sign-ups came from, ready-to-post social captions, and the marketing list (who said yes to news).
 * - Vendors: the directory's listings, hide or show.
 * - Settings: social links (shown on the front page), the support email, the "Made with" link on guest pages.
 */

const INK = '#33402f';
const serif = "'Cormorant Garamond', Georgia, serif";
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";
const input = 'w-full py-[9px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px] sm:text-[15px] text-[#33402f]';
const btn = 'py-[9px] px-4 rounded-full border border-[#c6b794] bg-white text-[14px] cursor-pointer text-[#33402f] disabled:opacity-60';
const primary = 'py-[9px] px-4 rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[14px] cursor-pointer disabled:opacity-60';
const card = 'flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]';
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const PLAN_NAME: Record<string, string> = { free: 'Free', essentials: 'Essentials', complete: 'Deluxe', trial: 'Founders (everything)' };
const TABS = [
  ['overview', 'Overview'],
  ['weddings', 'Weddings'],
  ['promote', 'Promote'],
  ['vendors', 'Vendors'],
  ['settings', 'Settings'],
] as const;
type Tab = (typeof TABS)[number][0];

export function CompanyPortal() {
  const [who, setWho] = useState<'loading' | 'out' | 'no' | 'yes'>('loading');
  const [tab, setTab] = useState<Tab>(() => (TABS.find(([k]) => `#${k}` === window.location.hash)?.[0] ?? 'overview'));
  const [note, setNote] = useState('');
  useEffect(() => {
    document.title = 'Company portal';
    api.me().then(
      (m) => setWho(m.user.superAdmin ? 'yes' : 'no'),
      () => setWho('out'),
    );
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(''), 3500);
    return () => clearTimeout(t);
  }, [note]);
  const go = (k: Tab) => {
    setTab(k);
    window.history.replaceState(null, '', `#${k}`);
    window.scrollTo({ top: 0 });
  };

  if (who === 'loading') return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  if (who !== 'yes')
    return (
      <main className="min-h-screen bg-[#f6f0e2] flex items-center justify-center p-6 text-center" style={{ color: INK, fontFamily: sans }}>
        <div className="flex flex-col gap-3 max-w-[420px]">
          <h1 className="m-0 text-[32px] font-normal" style={{ fontFamily: serif }}>
            Company portal
          </h1>
          <p className="m-0 text-[16px]">{who === 'out' ? 'Sign in first, with the company’s account.' : 'This page is for the company only.'}</p>
          <Link to="/admin" className="self-center py-[10px] px-5 rounded-full no-underline !text-[#fbf8f2]" style={{ background: INK }}>
            {who === 'out' ? 'Sign in' : 'Back to your wedding'}
          </Link>
        </div>
      </main>
    );

  return (
    <div className="min-h-screen bg-[#f6f0e2]" style={{ color: INK, fontFamily: sans }}>
      <header className="sticky top-0 z-10 bg-[#33402f] text-[#f3ecd6] px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2 shadow-[0_2px_10px_rgba(0,0,0,.12)]">
        <div className="max-w-[1100px] mx-auto flex items-center justify-between gap-3">
          <span className="text-[24px]" style={{ fontFamily: serif }}>
            Company portal
          </span>
          <Link to="/admin" className="text-[13px] underline !text-[#f3ecd6]">
            Back to admin
          </Link>
        </div>
        <nav aria-label="Company" className="max-w-[1100px] mx-auto flex gap-1 overflow-x-auto [scrollbar-width:none] mt-2 -mx-1 px-1">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-current={tab === k ? 'page' : undefined}
              onClick={() => go(k)}
              className={`flex-none py-[7px] px-4 rounded-full border-0 text-[14px] cursor-pointer ${tab === k ? 'bg-[#f3ecd6] text-[#33402f] font-semibold' : 'bg-transparent text-[#f3ecd6]'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-[1100px] mx-auto px-4 py-5 pb-24 flex flex-col gap-4">
        {tab === 'overview' && <Overview onGo={go} />}
        {tab === 'weddings' && <Weddings onNote={setNote} />}
        {tab === 'promote' && <Promote onNote={setNote} />}
        {tab === 'vendors' && <Vendors onNote={setNote} />}
        {tab === 'settings' && <Settings onNote={setNote} />}
      </main>
      {note && (
        <div role="status" className="fixed z-20 inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] mx-auto max-w-[460px] py-3 px-4 rounded-[14px] bg-[#33402f] text-[#fbf8f2] text-[15px] text-center shadow-[0_8px_24px_rgba(0,0,0,.25)]">
          {note}
        </div>
      )}
    </div>
  );
}

/** Loads something once (and again on reload()), with an error if it fails. */
function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    fn().then(setData, (e: Error) => setError(e.message));
  }, [fn]);
  useEffect(() => reload(), [reload]);
  return { data, error, reload, setData };
}
const Problem = ({ text }: { text: string }) => (
  <p role="alert" className="m-0 text-[15px] text-[#7a4a37]">
    {text}
  </p>
);
const H = ({ children, sub }: { children: ReactNode; sub?: string }) => (
  <div>
    <h2 className="m-0 text-[26px] font-normal leading-tight" style={{ fontFamily: serif }}>
      {children}
    </h2>
    {sub && <p className="m-0 mt-1 text-[14px] text-[#5b6a52]">{sub}</p>}
  </div>
);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">{label}</span>
      <span className="text-[30px] leading-none" style={{ fontFamily: serif }}>
        {value}
      </span>
      {sub && <span className="text-[12px] text-[#5b6a52]">{sub}</span>}
    </div>
  );
}

function Overview({ onGo }: { onGo: (t: Tab) => void }) {
  const { data: s, error } = useLoad(companyApi.stats);
  if (error) return <Problem text={error} />;
  if (!s) return <p className="text-[#5b6a52]">Loading…</p>;
  const max = Math.max(1, ...s.signups.weekly.map((w) => w.n));
  const paidPlans = (s.plans.essentials ?? 0) + (s.plans.complete ?? 0);
  return (
    <>
      {s.requests > 0 && (
        <button type="button" onClick={() => onGo('weddings')} className="flex items-center justify-between gap-3 p-4 rounded-[16px] border border-[#ecd9ae] bg-[#fbf3e1] text-left cursor-pointer text-[#33402f]">
          <span>
            <strong>{s.requests} {s.requests === 1 ? 'couple is' : 'couples are'} waiting for a payment link.</strong> Send it, then set their plan.
          </span>
          <span aria-hidden>→</span>
        </button>
      )}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Tile label="Weddings" value={String(s.weddings)} sub={`${s.signups.last7} this week · ${s.signups.last30} this month`} />
        <Tile label="Paying" value={String(paidPlans)} sub={`${s.weddings ? Math.round((paidPlans / s.weddings) * 100) : 0}% of weddings`} />
        <Tile label="Taken" value={money(s.revenue.total)} sub={`${money(s.revenue.thisMonth)} this month · ${s.revenue.payments} payments`} />
        <Tile label="Guests" value={s.guests.toLocaleString('en-AU')} sub={`${s.replies.toLocaleString('en-AU')} replies`} />
      </section>
      <section className={card} aria-label="Sign-ups by week">
        <H sub="New weddings each week, the last 12 weeks (the last bar is this week so far).">Sign-ups</H>
        <svg viewBox="0 0 360 140" className="w-full h-[160px]" role="img" aria-label={`Sign-ups by week: ${s.signups.weekly.map((w) => w.n).join(', ')}`}>
          {s.signups.weekly.map((w, i) => {
            const h = (w.n / max) * 110;
            return (
              <g key={w.weekOf}>
                <rect x={i * 30 + 4} y={120 - h} width={22} height={Math.max(h, 1)} rx={4} fill={i === s.signups.weekly.length - 1 ? '#a9b98d' : INK} />
                {w.n > 0 && (
                  <text x={i * 30 + 15} y={116 - h} textAnchor="middle" fontSize="10" fill={INK}>
                    {w.n}
                  </text>
                )}
                {i % 3 === 0 && (
                  <text x={i * 30 + 15} y={136} textAnchor="middle" fontSize="9" fill="#5b6a52">
                    {new Date(w.weekOf).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <div className={card}>
          <H>Plans</H>
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {['free', 'essentials', 'complete', 'trial'].map((k) => {
              const n = s.plans[k] ?? 0;
              return (
                <li key={k} className="flex items-center gap-3 text-[14px]">
                  <span className="w-[150px] flex-none">{PLAN_NAME[k]}</span>
                  <span className="flex-1 h-[10px] rounded-full bg-[#efe7d3] overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${s.weddings ? (n / s.weddings) * 100 : 0}%`, background: INK }} />
                  </span>
                  <strong className="w-[40px] text-right">{n}</strong>
                </li>
              );
            })}
          </ul>
        </div>
        <div className={card}>
          <H>Across the app</H>
          <dl className="m-0 grid grid-cols-2 gap-2 text-[14px]">
            <dt className="text-[#5b6a52]">Vendors listed</dt>
            <dd className="m-0 font-semibold">{s.directory.listings}</dd>
            <dt className="text-[#5b6a52]">Enquiries to vendors</dt>
            <dd className="m-0 font-semibold">{s.directory.enquiries}</dd>
            <dt className="text-[#5b6a52]">Quote requests</dt>
            <dd className="m-0 font-semibold">{s.quoteRequests}</dd>
            <dt className="text-[#5b6a52]">Said yes to news</dt>
            <dd className="m-0 font-semibold">{s.optIns}</dd>
          </dl>
          <button type="button" onClick={() => onGo('promote')} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[14px] text-[#33402f]">
            Where sign-ups came from →
          </button>
        </div>
      </section>
    </>
  );
}

function Weddings({ onNote }: { onNote: (s: string) => void }) {
  const [q, setQ] = useState('');
  const [onlyRequests, setOnlyRequests] = useState(false);
  const [list, setList] = useState<CompanyWedding[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    companyApi.weddings(q, onlyRequests).then((r) => setList(r.weddings), (e: Error) => setError(e.message));
  }, [q, onlyRequests]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <section className="flex flex-col gap-3">
      <H sub="Plan requests first, then the newest. Search by names, the wedding’s address, or an email.">Weddings</H>
      <div className="flex gap-2 flex-wrap items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search weddings" className={`${input} max-w-[360px]`} />
        <label className="flex items-center gap-2 text-[14px] cursor-pointer">
          <input type="checkbox" checked={onlyRequests} onChange={(e) => setOnlyRequests(e.target.checked)} className="w-[18px] h-[18px] accent-[#5d6b47]" />
          Plan requests only
        </label>
      </div>
      {error && <Problem text={error} />}
      {!list ? (
        <p className="text-[#5b6a52]">Loading…</p>
      ) : !list.length ? (
        <p className="text-[#5b6a52]">No weddings found.</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {list.map((w) => (
            <WeddingRow
              key={w.id}
              w={w}
              onSaved={(msg) => {
                onNote(msg);
                load();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function WeddingRow({ w, onSaved }: { w: CompanyWedding; onSaved: (msg: string) => void }) {
  const [plan, setPlan] = useState(w.plan === 'trial' ? 'complete' : w.plan);
  const [extra, setExtra] = useState(w.extraEvents);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const changed = plan !== w.plan || extra !== w.extraEvents;
  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      await companyApi.setPlan(w.slug, { ...(plan !== w.plan ? { plan: plan as 'free' | 'essentials' | 'complete' } : {}), ...(extra !== w.extraEvents ? { extraEvents: extra } : {}) });
      onSaved(`${w.names}: saved`);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={`flex flex-col gap-2 p-3 rounded-[14px] border ${w.requested ? 'border-[#ecd9ae] bg-[#fbf3e1]' : 'border-[#e2d7bc] bg-[#fbf8f0]'}`}>
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <strong className="text-[16px]">{w.names}</strong>
        <span className="text-[13px] text-[#5b6a52]">
          {PLAN_NAME[w.plan] ?? w.plan}
          {w.extraEvents ? ` + ${w.extraEvents} extra ${w.extraEvents === 1 ? 'event' : 'events'}` : ''}
        </span>
      </div>
      <span className="text-[13px] text-[#5b6a52] break-words">
        {[w.day && `Day ${day(w.day)}`, `${w.guests} guests`, `joined ${day(w.createdAt)}`, w.ref && `from ${w.ref}`].filter(Boolean).join(' · ')}
        {w.email && (
          <>
            {' · '}
            <a href={`mailto:${w.email}`} className="!text-[#33402f]">
              {w.email}
            </a>
          </>
        )}
      </span>
      {w.requested && (
        <span className="text-[14px] font-semibold text-[#6b4f1d]">Asked for {w.requested === 'event' ? 'an extra event' : (PLAN_NAME[w.requested] ?? w.requested)}: send a payment link, then set it here.</span>
      )}
      <div className="flex gap-2 flex-wrap items-center">
        <select value={plan} aria-label={`Plan for ${w.names}`} onChange={(e) => setPlan(e.target.value)} className={`${input} w-auto`}>
          <option value="free">Free</option>
          <option value="essentials">Essentials</option>
          <option value="complete">Deluxe</option>
        </select>
        <label className="flex items-center gap-2 text-[14px]">
          Extra events
          <input type="number" min={0} max={20} value={extra} onChange={(e) => setExtra(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className={`${input} w-[80px]`} />
        </label>
        <button type="button" className={primary} disabled={!changed || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <a href={`/w/${encodeURIComponent(w.slug)}`} target="_blank" rel="noopener" className="text-[13px] !text-[#33402f]">
          Their page
        </a>
      </div>
      {problem && <Problem text={problem} />}
    </li>
  );
}

const blankPromo = (): CompanyPromo => ({ code: '', percentOff: 10, amountOffCents: 0, plans: [], expires: '', maxUses: 0, note: '', on: true, used: 0 });

function Promote({ onNote }: { onNote: (s: string) => void }) {
  const promos = useLoad(companyApi.promos);
  const stats = useLoad(companyApi.stats);
  const site = useLoad(companyApi.settings);
  const [codes, setCodes] = useState<CompanyPromo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [source, setSource] = useState('instagram');
  useEffect(() => {
    if (promos.data) setCodes(promos.data.codes);
  }, [promos.data]);
  const base = window.location.origin;
  const link = `${base}/?ref=${encodeURIComponent(source.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'post')}`;
  const live = codes?.find((c) => c.on && (!c.expires || c.expires >= new Date().toISOString().slice(0, 10)));
  const offer = live ? ` Use code ${live.code} for ${live.percentOff ? `${live.percentOff}% off` : `${money(live.amountOffCents)} off`}.` : '';
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNote(`${what} copied`);
    } catch {
      window.prompt('Copy this', text);
    }
  };
  const save = async () => {
    if (!codes) return;
    setBusy(true);
    setProblem('');
    try {
      setCodes((await companyApi.savePromos(codes.filter((c) => c.code.trim()))).codes);
      onNote('Promo codes saved');
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const set = (i: number, p: Partial<CompanyPromo>) => setCodes((cs) => cs!.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const posts = [
    ['Instagram caption', `Planning a wedding? Your guests reply to your invitation by text, and you stop chasing RSVPs. The Yes List does the invitation, guest list, seating and the whole plan, in one place.${offer}\n\nStart free: ${link}\n\n#weddingplanning #engaged #weddinginvitations #australianwedding`],
    ['Facebook post', `We built The Yes List for every couple who has ever chased RSVPs: a beautiful online invitation your guests answer by text, plus your guest list, seating plan, budget and vendors in one place.${offer} Start free at ${link}`],
    ['TikTok / Reels idea', `Hook: "POV: you sent 120 invitations and nobody replied." Show the envelope opening on a phone, a guest tapping Yes, then the guest list filling itself in. End card: "The Yes List — start free" with ${link} in your bio.`],
    ['Message to friends', `Hey! We’ve just launched The Yes List: wedding invitations that guests answer by text, plus everything to plan the day. If you know anyone engaged, I’d love you to send them this:${offer} ${link}`],
  ] as const;

  return (
    <>
      <section className={card} aria-label="Promo codes">
        <H sub="Couples type these when they pay (Upgrade → Have a promo code?). 100% off switches the plan on without a card: good for friends, influencers and giveaways.">Promo codes</H>
        {promos.error && <Problem text={promos.error} />}
        {codes?.map((c, i) => (
          <div key={i} className="flex flex-col gap-2 p-3 rounded-[12px] bg-white border border-[#ece3cd]">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                Code
                <input value={c.code} maxLength={24} onChange={(e) => set(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} className={`${input} uppercase`} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                % off
                <input type="number" min={0} max={100} value={c.percentOff} onChange={(e) => set(i, { percentOff: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                Or $ off
                <input type="number" min={0} value={c.amountOffCents / 100 || ''} placeholder="0" onChange={(e) => set(i, { amountOffCents: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) })} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                Last day
                <input type="date" value={c.expires} onChange={(e) => set(i, { expires: e.target.value })} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                Uses allowed (0 = any)
                <input type="number" min={0} value={c.maxUses} onChange={(e) => set(i, { maxUses: Math.max(0, Number(e.target.value) || 0) })} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] col-span-2 sm:col-span-3">
                Note (for you)
                <input value={c.note} maxLength={120} placeholder="e.g. Launch week, Instagram" onChange={(e) => set(i, { note: e.target.value })} className={input} />
              </label>
            </div>
            <div className="flex gap-3 flex-wrap items-center text-[14px]">
              <span className="text-[#5b6a52]">For:</span>
              {(
                [
                  ['essentials', 'Essentials'],
                  ['complete', 'Deluxe'],
                  ['event', 'Extra event'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={!c.plans.length || c.plans.includes(k)} onChange={(e) => {
                    const all = ['essentials', 'complete', 'event'] as const;
                    const cur = c.plans.length ? c.plans : [...all];
                    const next = e.target.checked ? [...new Set([...cur, k])] : cur.filter((x) => x !== k);
                    set(i, { plans: next.length === all.length ? [] : next });
                  }} className="accent-[#5d6b47]" />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-1 cursor-pointer ml-auto">
                <input type="checkbox" checked={c.on} onChange={(e) => set(i, { on: e.target.checked })} className="accent-[#5d6b47]" />
                On
              </label>
              <span className="text-[#5b6a52]">Used {c.used}{c.maxUses ? ` of ${c.maxUses}` : ''}</span>
              <button type="button" onClick={() => setCodes(codes!.filter((_, j) => j !== i))} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]">
                Remove
              </button>
            </div>
          </div>
        ))}
        {problem && <Problem text={problem} />}
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={btn} onClick={() => setCodes([...(codes ?? []), blankPromo()])}>
            + Add a code
          </button>
          <button type="button" className={primary} disabled={busy || !codes} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save codes'}
          </button>
        </div>
      </section>

      {site.data && (
        <BannerCard
          s={site.data}
          onSaved={(s) => {
            site.setData(s);
            onNote('Banner saved');
          }}
        />
      )}

      <section className={card} aria-label="Campaign links">
        <H sub="Add ?ref= to any link you share: sign-ups that came through it are counted here. Each wedding’s “Made with” link counts as that wedding.">Campaign links and where sign-ups came from</H>
        <div className="flex gap-2 flex-wrap items-end">
          <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
            Where you’ll post it
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="instagram, tiktok, expo-2026…" className={`${input} w-[220px]`} />
          </label>
          <code className="py-[9px] px-3 rounded-[10px] bg-white border border-[#ece3cd] text-[13px] break-all">{link}</code>
          <button type="button" className={btn} onClick={() => void copy(link, 'Link')}>
            Copy link
          </button>
        </div>
        {stats.data && (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-[.1em] text-[#5b6a52]">
                <th className="py-2 font-semibold">Source</th>
                <th className="py-2 font-semibold text-right">Sign-ups</th>
                <th className="py-2 font-semibold text-right">Paying</th>
              </tr>
            </thead>
            <tbody>
              {stats.data.referrals.map((r) => (
                <tr key={r.ref} className="border-t border-[#ece3cd]">
                  <td className="py-2 break-all">{r.ref}</td>
                  <td className="py-2 text-right">{r.n}</td>
                  <td className="py-2 text-right">{r.paid}</td>
                </tr>
              ))}
              {!stats.data.referrals.length && (
                <tr>
                  <td colSpan={3} className="py-2 text-[#5b6a52]">
                    No referred sign-ups yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <section className={card} aria-label="Ready-to-post">
        <H sub={`Captions with your campaign link${live ? ` and code ${live.code}` : ''} filled in. Change the source above for each place you post.`}>Ready to post</H>
        <div className="grid gap-3 md:grid-cols-2">
          {posts.map(([title, text]) => (
            <div key={title} className="flex flex-col gap-2 p-3 rounded-[12px] bg-white border border-[#ece3cd]">
              <strong className="text-[15px]">{title}</strong>
              <p className="m-0 text-[14px] whitespace-pre-wrap text-[#5b6a52]">{text}</p>
              <button type="button" className={`${btn} self-start`} onClick={() => void copy(text, title)}>
                Copy
              </button>
            </div>
          ))}
        </div>
        <span className="text-[13px] text-[#5b6a52]">
          Share images: <a href="/og.png" target="_blank" rel="noopener" className="!text-[#33402f]">the app</a> ·{' '}
          <a href="/og-invite.png" target="_blank" rel="noopener" className="!text-[#33402f]">an invitation</a> · the <a href="/demo" target="_blank" rel="noopener" className="!text-[#33402f]">sample invitation</a> (screen-record it opening for Reels).
        </span>
      </section>

      <section className={card} aria-label="Marketing list">
        <H sub="People who ticked “send me news” when they signed up: for a mailing tool (Mailchimp, Brevo). Only email people on this list.">Marketing list</H>
        <a href={companyApi.optInsUrl} className={`${primary} self-start no-underline !text-[#fbf8f2]`}>
          Download {stats.data ? `${stats.data.optIns} ` : ''}as a spreadsheet (CSV)
        </a>
      </section>
    </>
  );
}

function BannerCard({ s, onSaved }: { s: CompanySettings; onSaved: (s: CompanySettings) => void }) {
  const [b, setB] = useState(s.banner);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      onSaved(await companyApi.saveSettings({ ...s, banner: b }));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={card} aria-label="Front-page banner">
      <H sub="A line across the top of the front page: a launch offer, a giveaway, news.">Front-page banner</H>
      <label className="flex items-center gap-2 text-[14px] cursor-pointer">
        <input type="checkbox" checked={b.on} onChange={(e) => setB({ ...b, on: e.target.checked })} className="w-[18px] h-[18px] accent-[#5d6b47]" />
        Show it
      </label>
      <input value={b.text} maxLength={160} placeholder="e.g. Launch week: 20% off with code YES20" onChange={(e) => setB({ ...b, text: e.target.value })} className={input} aria-label="Banner text" />
      <input value={b.link} maxLength={300} placeholder="Link (optional): /#pricing or https://…" onChange={(e) => setB({ ...b, link: e.target.value })} className={input} aria-label="Banner link" />
      {b.on && b.text && (
        <div className="px-4 py-2 rounded-[10px] text-center text-[14px] bg-[#33402f] text-[#fbf8f2]" aria-label="Preview">
          {b.text}
        </div>
      )}
      {problem && <Problem text={problem} />}
      <button type="button" className={`${primary} self-start`} disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save banner'}
      </button>
    </section>
  );
}

function Vendors({ onNote }: { onNote: (s: string) => void }) {
  const { data, error, setData } = useLoad(companyApi.listings);
  const toggle = async (l: CompanyListing) => {
    try {
      await companyApi.hideListing(l.id, !l.hidden);
      setData({ listings: data!.listings.map((x) => (x.id === l.id ? { ...x, hidden: !l.hidden } : x)) });
      onNote(`${l.name} ${l.hidden ? 'shown' : 'hidden'}`);
    } catch (e) {
      onNote((e as Error).message);
    }
  };
  return (
    <section className="flex flex-col gap-3">
      <H sub="Vendors who listed themselves in the directory. Hide anything that shouldn’t be there.">Vendor directory</H>
      {error && <Problem text={error} />}
      {!data ? (
        <p className="text-[#5b6a52]">Loading…</p>
      ) : !data.listings.length ? (
        <p className="text-[#5b6a52]">No vendors have listed yet. Share {window.location.origin}/vendors/join with vendors you know.</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {data.listings.map((l) => (
            <li key={l.id} className={`flex flex-wrap items-center gap-3 p-3 rounded-[14px] border ${l.hidden ? 'border-[#e8d6cf] bg-[#f6ece8]' : 'border-[#e2d7bc] bg-[#fbf8f0]'}`}>
              <span className="flex-1 min-w-[200px]">
                <strong className="block text-[15px]">{l.name}</strong>
                <span className="text-[13px] text-[#5b6a52]">
                  {[l.category, l.region, `${l.enquiries} enquiries`, `listed ${day(l.created_at)}`].join(' · ')} ·{' '}
                  <a href={`mailto:${l.email}`} className="!text-[#33402f]">
                    {l.email}
                  </a>
                </span>
              </span>
              <a href={`/vendors/${encodeURIComponent(l.slug)}`} target="_blank" rel="noopener" className="text-[13px] !text-[#33402f]">
                View
              </a>
              <button type="button" className={btn} onClick={() => void toggle(l)}>
                {l.hidden ? 'Show' : 'Hide'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Settings({ onNote }: { onNote: (s: string) => void }) {
  const { data, error, setData } = useLoad(companyApi.settings);
  const [s, setS] = useState<CompanySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (data) setS(data);
  }, [data]);
  if (error) return <Problem text={error} />;
  if (!s) return <p className="text-[#5b6a52]">Loading…</p>;
  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      const r = await companyApi.saveSettings(s);
      setData(r);
      onNote('Settings saved');
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const SOCIAL = [
    ['instagram', 'Instagram', 'https://instagram.com/…'],
    ['tiktok', 'TikTok', 'https://tiktok.com/@…'],
    ['facebook', 'Facebook', 'https://facebook.com/…'],
    ['pinterest', 'Pinterest', 'https://pinterest.com/…'],
    ['youtube', 'YouTube', 'https://youtube.com/@…'],
  ] as const;
  return (
    <>
      <section className={card} aria-label="Social links">
        <H sub="Shown at the foot of the front page. Leave any blank to hide it.">Social accounts</H>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL.map(([k, label, ph]) => (
            <label key={k} className="flex flex-col gap-1 text-[13px] text-[#5b6a52]">
              {label}
              <input value={s.social[k]} placeholder={ph} onChange={(e) => setS({ ...s, social: { ...s.social, [k]: e.target.value.trim() } })} className={input} />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52]">
            Support email
            <input type="email" value={s.supportEmail} placeholder="hello@…" onChange={(e) => setS({ ...s, supportEmail: e.target.value.trim() })} className={input} />
          </label>
        </div>
      </section>
      <section className={card} aria-label="Made with">
        <H sub="Every guest who opens an invitation sees a small “Made with The Yes List · make your own” at the bottom, linking here with the wedding counted as the referrer. It’s the app’s best advert.">On guest pages</H>
        <label className="flex items-center gap-2 text-[15px] cursor-pointer">
          <input type="checkbox" checked={s.madeWith} onChange={(e) => setS({ ...s, madeWith: e.target.checked })} className="w-[20px] h-[20px] accent-[#5d6b47]" />
          Show “Made with The Yes List” on invitations
        </label>
      </section>
      {problem && <Problem text={problem} />}
      <button type="button" className={`${primary} self-start`} disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save settings'}
      </button>
    </>
  );
}

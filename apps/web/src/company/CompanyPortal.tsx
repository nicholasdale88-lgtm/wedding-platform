import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Login } from '../admin/Login';
import { ProfileSwitch } from '../lib/ProfileSwitch';
import { LogoMark } from '../sales/Art';
import { chargeCents, planOf, STAFF_INFO, STAFF_ROLES, staffCan, type StaffPerm, type StaffRole } from '@wp/shared';
import { api, companyApi, staffJoinApi, type CompanyActivity, type CompanyTodo, type CompanyMoney, type CompanyFeedback, type CompanyListing, type CompanyPromo, type CompanySettings, type CompanyStaff, type CompanyWedding } from '../lib/api';

/**
 * /company: the company portal, for the platform owner (super admins) only.
 * - Overview: what needs doing first (plan requests, new feedback), then sign-ups (this week, this month,
 *   a 12-week chart), plans, money taken, guests and replies, the vendor directory, quote requests.
 * - Couples: find any wedding (names, address, email); plan requests first, each with its two steps:
 *   email the payment link, then mark it paid (switched on, and the money counted in Overview).
 * - Feedback: what couples told us (Help → Tell us): new → planned → done, or not now. A note on a
 *   planned or done one shows to every couple under "Coming from your feedback".
 * - Promote: promo codes (made here, used when couples pay), the front-page banner, campaign links and
 *   where sign-ups came from, ready-to-post social captions, and the marketing list (who said yes to news).
 * - Vendors: the directory's listings, hide or show.
 * - Settings: payment links (emailed for plan requests), social links (shown on the front page), the
 *   support email, the "Made with" link on guest pages.
 * - Team (owners): who works on the app and their role; invite by email. Activity: who did what.
 * Each person sees only the tabs their role allows (STAFF_CAN in @wp/shared): a developer sees feedback,
 * marketing sees promotions, support sees couples and feedback, and so on.
 */

const INK = '#33402f';
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";
const input = 'w-full py-[9px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px] sm:text-[15px] text-[#33402f]';
const btn = 'py-[9px] px-4 rounded-[10px] border border-[#d5d8cf] bg-white text-[14px] font-medium cursor-pointer text-[#1b2218] hover:bg-[#f3f4ef] disabled:opacity-60';
const primary = 'py-[9px] px-4 rounded-[10px] border-0 bg-[#1b2218] text-[#f3ecd6] text-[14px] font-semibold cursor-pointer hover:bg-[#2c3828] disabled:opacity-60';
const card = 'flex flex-col gap-3 p-5 rounded-[14px] border border-[#e4e6df] bg-white shadow-[0_1px_3px_rgba(27,34,24,.06)]';
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const PLAN_NAME: Record<string, string> = { free: 'Free', essentials: 'Essentials', complete: 'Deluxe', trial: 'Founders (everything)' };
const TABS = [
  ['overview', 'Overview', 'overview'],
  ['weddings', 'Couples', 'couples'],
  ['feedback', 'Feedback', 'feedback'],
  ['promote', 'Promote', 'promote'],
  ['vendors', 'Vendors', 'vendors'],
  ['money', 'Money & tax', 'money'],
  ['team', 'Team', 'team'],
  ['activity', 'Activity', 'activity'],
  ['settings', 'Settings', 'settings'],
] as const satisfies readonly (readonly [string, string, StaffPerm])[];
type Tab = (typeof TABS)[number][0];

/** The signed-in person's company role, for every tab. */
const RoleCtx = createContext<StaffRole | null>(null);
const useCan = () => {
  const role = useContext(RoleCtx);
  return (p: StaffPerm) => staffCan(role, p);
};

export function CompanyPortal() {
  // An invitation to join the team: its own page, signed in or not.
  if (window.location.pathname.replace(/\/+$/, '') === '/company/join') return <JoinTeam />;
  return <Portal />;
}

function Portal() {
  const [who, setWho] = useState<'loading' | 'out' | 'no' | 'yes'>('loading');
  const [role, setRole] = useState<StaffRole | null>(null);
  const [tab, setTab] = useState<Tab>(() => (TABS.find(([k]) => `#${k}` === window.location.hash)?.[0] ?? 'overview'));
  const [note, setNote] = useState('');
  useEffect(() => {
    document.title = 'Company portal';
    api.me().then(
      (m) => {
        setRole(m.user.staff ?? null);
        setWho(m.user.staff ? 'yes' : 'no');
      },
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

  if (who === 'loading') return <div className="fixed inset-0 bg-[#f3f4ef]" aria-busy="true" />;
  // Signed out: the one sign-in, right here; the company's account lands straight in the portal.
  if (who === 'out')
    return (
      <Login
        tone="company"
        onSignedIn={(m) => {
          setRole(m.user.staff ?? null);
          setWho(m.user.staff ? 'yes' : 'no');
        }}
      />
    );
  if (who !== 'yes')
    return (
      <main className="min-h-screen bg-[#f3f4ef] flex items-center justify-center p-6 text-center" style={{ color: INK, fontFamily: sans }}>
        <div className="flex flex-col gap-3 max-w-[420px]">
          <h1 className="m-0 text-[28px] font-semibold">
            Company portal
          </h1>
          <p className="m-0 text-[16px]">This page is for the people who run the site. Your account can go to:</p>
          <Link to="/admin?choose=1" className="self-center py-[10px] px-5 rounded-full no-underline !text-[#fbf8f2]" style={{ background: INK }}>
            Your places
          </Link>
        </div>
      </main>
    );

  const tabs = TABS.filter(([, , perm]) => staffCan(role, perm));
  const shown: Tab = tabs.some(([k]) => k === tab) ? tab : (tabs[0]?.[0] ?? 'overview');
  const label = tabs.find(([k]) => k === shown)?.[1] ?? '';
  const navItem = (k: Tab, text: string) => (
    <button
      key={k}
      type="button"
      aria-current={shown === k ? 'page' : undefined}
      onClick={() => go(k)}
      className={`flex items-center gap-3 w-full py-[9px] px-3 rounded-[10px] border-0 text-left text-[14px] cursor-pointer ${shown === k ? 'bg-[rgba(230,207,158,.14)] text-[#fbf8f2] font-semibold shadow-[inset_3px_0_0_#e6cf9e]' : 'bg-transparent text-[#c9c4b2] hover:bg-[rgba(255,255,255,.05)] hover:text-[#fbf8f2]'}`}
    >
      <span aria-hidden className="w-5 text-center opacity-90">
        {ICON[k]}
      </span>
      {text}
    </button>
  );
  return (
    <RoleCtx.Provider value={role}>
      <div className="min-h-screen bg-[#f3f4ef] md:grid md:grid-cols-[248px_minmax(0,1fr)]" style={{ color: '#1b2218', fontFamily: sans }}>
        {/* Wide screens: a dark sidebar. Phones: a dark bar with the sections in a scrolling row. */}
        <aside className="hidden md:flex flex-col gap-1 sticky top-0 h-screen p-4 text-[#f3ecd6]" style={{ background: 'linear-gradient(180deg, #1b2218, #232c1f)' }}>
          <div className="flex items-center gap-3 px-1 pb-4 mb-2 border-b border-[rgba(243,236,214,.12)]">
            <span className="rounded-[12px] p-[5px] bg-[#f6f0e2]">
              <LogoMark size={30} />
            </span>
            <span className="flex flex-col leading-tight">
              <strong className="text-[15px] font-semibold">The Yes List</strong>
              <span className="text-[11px] tracking-[.18em] uppercase text-[#e6cf9e]">Company</span>
            </span>
          </div>
          <nav aria-label="Company" className="flex flex-col gap-[2px] flex-1 overflow-y-auto">
            {tabs.map(([k, text]) => navItem(k, text))}
          </nav>
          <div className="pt-3 border-t border-[rgba(243,236,214,.12)] flex flex-col gap-2">
            {role && <span className="text-[12px] text-[#c9c4b2]">Signed in as {STAFF_INFO[role].name}</span>}
            <ProfileSwitch here="company" />
          </div>
        </aside>
        <div className="min-w-0">
          <header className="md:hidden sticky top-0 z-10 text-[#f3ecd6] px-4 pt-[max(10px,env(safe-area-inset-top))]" style={{ background: '#1b2218' }}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="rounded-[10px] p-[3px] bg-[#f6f0e2]">
                  <LogoMark size={24} />
                </span>
                <strong className="text-[15px] font-semibold">Company</strong>
              </span>
              <ProfileSwitch here="company" />
            </div>
            <nav aria-label="Company sections" className="flex gap-1 overflow-x-auto [scrollbar-width:none] mt-2 -mx-1 px-1">
              {tabs.map(([k, text]) => (
                <button
                  key={k}
                  type="button"
                  aria-current={shown === k ? 'page' : undefined}
                  onClick={() => go(k)}
                  className={`flex-none py-[10px] px-3 border-0 border-b-[3px] bg-transparent text-[14px] cursor-pointer ${shown === k ? 'border-b-[#e6cf9e] text-[#fbf8f2] font-semibold' : 'border-b-transparent text-[#c9c4b2]'}`}
                >
                  {text}
                </button>
              ))}
            </nav>
          </header>
          <div className="hidden md:flex items-center justify-between gap-3 px-8 py-4 border-b border-[#e4e6df] bg-white">
            <span className="text-[13px] text-[#5f6a58]">
              Company <span aria-hidden>›</span> <strong className="text-[#1b2218] font-semibold">{label}</strong>
            </span>
            <a href="/" target="_blank" rel="noopener" className="text-[13px] !text-[#5f6a58]">
              View the front page ↗
            </a>
          </div>
          <main className="max-w-[1160px] px-4 md:px-8 py-6 pb-24 flex flex-col gap-4">
            {shown === 'overview' && <Overview onGo={go} />}
            {shown === 'weddings' && <Weddings onNote={setNote} />}
            {shown === 'feedback' && <Feedback onNote={setNote} />}
            {shown === 'promote' && <Promote onNote={setNote} />}
            {shown === 'vendors' && <Vendors onNote={setNote} />}
            {shown === 'money' && <Money onNote={setNote} />}
            {shown === 'team' && <Team onNote={setNote} />}
            {shown === 'activity' && <Activity />}
            {shown === 'settings' && <Settings onNote={setNote} />}
          </main>
        </div>
        {note && (
          <div role="status" className="fixed z-20 inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] mx-auto max-w-[460px] py-3 px-4 rounded-[12px] bg-[#1b2218] text-[#f3ecd6] text-[15px] text-center shadow-[0_8px_24px_rgba(0,0,0,.25)]">
            {note}
          </div>
        )}
      </div>
    </RoleCtx.Provider>
  );
}

/** A small symbol for each section in the sidebar. */
const ICON: Record<Tab, string> = { overview: '◧', weddings: '♡', feedback: '✎', promote: '✦', vendors: '⌂', money: '$', team: '☺', activity: '≡', settings: '⚙' };

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
    <h2 className="m-0 text-[19px] font-semibold leading-tight tracking-[-.01em]">{children}</h2>
    {sub && <p className="m-0 mt-1 text-[14px] text-[#5f6a58]">{sub}</p>}
  </div>
);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-[14px] border border-[#e4e6df] bg-white shadow-[0_1px_3px_rgba(27,34,24,.06)] border-t-[3px] border-t-[#c8a46a]">
      <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[#5f6a58]">{label}</span>
      <span className="text-[30px] leading-none font-semibold tracking-[-.02em] text-[#1b2218]">{value}</span>
      {sub && <span className="text-[12px] text-[#5b6a52]">{sub}</span>}
    </div>
  );
}

function Overview({ onGo }: { onGo: (t: Tab) => void }) {
  const can = useCan();
  const seeFeedback = can('feedback');
  const { data: s, error } = useLoad(companyApi.stats);
  const fb = useLoad(useCallback(() => (seeFeedback ? companyApi.feedback() : Promise.resolve({ feedback: [] as CompanyFeedback[], counts: {} as Record<string, number> })), [seeFeedback]));
  if (error) return <Problem text={error} />;
  if (!s) return <p className="text-[#5b6a52]">Loading…</p>;
  const max = Math.max(1, ...s.signups.weekly.map((w) => w.n));
  const paidPlans = (s.plans.essentials ?? 0) + (s.plans.complete ?? 0);
  const fresh = fb.data?.counts.new ?? 0;
  const todo = [
    can('couples') && s.requests > 0 && { to: 'weddings' as Tab, text: `${s.requests} plan ${s.requests === 1 ? 'request' : 'requests'}`, sub: 'Send the payment link, then mark it paid.' },
    can('feedback') && fresh > 0 && { to: 'feedback' as Tab, text: `${fresh} new feedback`, sub: 'Read it, then plan it, or not now.' },
  ].filter((x): x is { to: Tab; text: string; sub: string } => !!x);
  return (
    <>
      <Assistant
        title="Assistant"
        sub="Drafts from the real numbers. It writes; you decide what goes out."
        tasks={[
          ['brief', 'Brief me on this week', ''],
          ['ask', 'Ask', 'e.g. What should I focus on to get 20 weddings this month?'],
        ]}
      />
      <TodoList onGo={onGo} />
      <section className={card} aria-label="To do">
        <H>To do</H>
        {todo.length ? (
          todo.map((t) => (
            <button key={t.to} type="button" onClick={() => onGo(t.to)} className="flex items-center justify-between gap-3 p-3 rounded-[12px] border border-[#ecd9ae] bg-[#fbf3e1] text-left cursor-pointer text-[#33402f]">
              <span>
                <strong className="block text-[16px]">{t.text}</strong>
                <span className="text-[14px] text-[#5b6a52]">{t.sub}</span>
              </span>
              <span aria-hidden>→</span>
            </button>
          ))
        ) : (
          <p className="m-0 text-[15px] text-[#5b6a52]">All done: no plan requests or new feedback waiting.</p>
        )}
      </section>
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
      <H sub="Plan requests first, then the newest. Search by names, the wedding’s address, or an email.">Couples</H>
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
  const can = useCan();
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
    <li className={`flex flex-col gap-2 p-3 rounded-[14px] border ${w.requested ? 'border-[#ecd9ae] bg-[#fbf3e1]' : 'border-[#e4e6df] bg-white'}`}>
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <strong className="text-[16px]">{w.names}</strong>
        <span className="text-[13px] text-[#5b6a52]">
          {PLAN_NAME[w.plan] ?? w.plan}
          {w.extraEvents ? ` + ${w.extraEvents} extra ${w.extraEvents === 1 ? 'event' : 'events'}` : ''}
        </span>
      </div>
      <span className="text-[13px] text-[#5b6a52] break-words">
        {[w.day && `Day ${day(w.day)}`, `${w.guests} guests`, `joined ${day(w.createdAt)}`, w.paidCents > 0 && `paid ${money(w.paidCents)}`, w.ref && `from ${w.ref}`].filter(Boolean).join(' · ')}
        {w.email && (
          <>
            {' · '}
            <a href={`mailto:${w.email}`} className="!text-[#33402f]">
              {w.email}
            </a>
          </>
        )}
      </span>
      {w.requested && <RequestSteps w={w} onDone={onSaved} />}
      <div className="flex gap-2 flex-wrap items-center">
        {can('money') && (
          <>
        <select value={plan} aria-label={`Plan for ${w.names}`} onChange={(e) => setPlan(e.target.value)} className={`${input} w-auto`}>
          <option value="free">Free</option>
          <option value="essentials">Essentials</option>
          <option value="complete">Deluxe</option>
        </select>
        <label className="flex items-center gap-2 text-[14px]">
          Extra events
          <input type="number" min={0} max={20} value={extra} onChange={(e) => setExtra(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className={`${input} w-[80px]`} />
        </label>
        <button type="button" className={w.requested ? btn : primary} disabled={!changed || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : w.requested ? 'Change without payment' : 'Save'}
        </button>
          </>
        )}
        <a href={`/w/${encodeURIComponent(w.slug)}`} target="_blank" rel="noopener" className="text-[13px] !text-[#33402f]">
          Their page
        </a>
      </div>
      {problem && <Problem text={problem} />}
    </li>
  );
}

const WHAT_NAME: Record<string, string> = { essentials: 'Essentials', complete: 'Deluxe', event: 'an extra event' };

/** A plan request's two steps: 1. email the payment link, 2. mark it paid (or say not now). */
function RequestSteps({ w, onDone }: { w: CompanyWedding; onDone: (msg: string) => void }) {
  const can = useCan();
  const what = w.requested as 'essentials' | 'complete' | 'event';
  const price = chargeCents(planOf(w.plan), what) ?? 0;
  const [dollars, setDollars] = useState(String(price / 100));
  const [sent, setSent] = useState(w.linkSentAt);
  const [byHand, setByHand] = useState<{ email: string; link: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setProblem('');
    try {
      await fn();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const sendLink = () =>
    run('link', async () => {
      const r = await companyApi.sendLink(w.slug);
      setSent(new Date().toISOString());
      setByHand(r.emailed ? null : { email: r.email, link: r.link });
      if (r.emailed) onDone(`Payment link emailed to ${r.email}`);
    });
  const paid = () =>
    run('paid', async () => {
      const cents = Math.round((Number(dollars) || 0) * 100);
      await companyApi.markPaid(w.slug, what, cents);
      onDone(`${w.names}: ${WHAT_NAME[what]} switched on, ${money(cents)} counted`);
    });
  const notNow = () => run('no', async () => {
    await companyApi.setPlan(w.slug, { extraEvents: w.extraEvents });
    onDone(`${w.names}: request cleared`);
  });
  const step = 'flex flex-wrap items-center gap-2 p-2 rounded-[10px] bg-white border border-[#ecd9ae]';
  const num = 'flex-none w-6 h-6 rounded-full grid place-items-center text-[12px] font-semibold';
  return (
    <div className="flex flex-col gap-2" aria-label="Plan request">
      <span className="text-[14px] font-semibold text-[#6b4f1d]">
        Asked for {WHAT_NAME[what] ?? what}
        {w.requestedAt ? ` on ${day(w.requestedAt)}` : ''}
        {price ? ` · ${money(price)}` : ''}
      </span>
      <div className={step}>
        <span className={num} style={{ background: sent ? '#a9b98d' : '#ecd9ae' }}>{sent ? '✓' : '1'}</span>
        <span className="flex-1 min-w-[160px] text-[14px]">{sent ? `Payment link sent ${day(sent)}` : 'Send the payment link'}</span>
        <button type="button" className={sent ? btn : primary} disabled={!!busy} onClick={() => void sendLink()}>
          {busy === 'link' ? 'Sending…' : sent ? 'Send again' : 'Email it'}
        </button>
      </div>
      {byHand && (
        <p className="m-0 text-[13px] text-[#6b4f1d] break-words">
          Email isn’t set up, so send it yourself:{' '}
          <a href={`mailto:${byHand.email}?subject=${encodeURIComponent('Your payment link')}&body=${encodeURIComponent(byHand.link)}`} className="!text-[#33402f]">
            email {byHand.email}
          </a>{' '}
          with {byHand.link}
        </p>
      )}
      <div className={step}>
        <span className={num} style={{ background: '#ecd9ae' }}>2</span>
        <span className="flex-1 min-w-[160px] text-[14px]">{can('money') ? 'When they’ve paid, switch it on' : 'When they’ve paid, a manager or owner switches it on'}</span>
        {can('money') && (
          <>
            <label className="flex items-center gap-1 text-[14px]">
              $
              <input type="number" min={0} step="1" value={dollars} onChange={(e) => setDollars(e.target.value)} aria-label="Amount paid" className={`${input} w-[90px]`} />
            </label>
            <button type="button" className={primary} disabled={!!busy} onClick={() => void paid()}>
              {busy === 'paid' ? 'Saving…' : 'Mark paid'}
            </button>
          </>
        )}
      </div>
      {can('money') && (
        <button type="button" className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#5b6a52]" disabled={!!busy} onClick={() => void notNow()}>
          Not now: clear the request
        </button>
      )}
      {problem && <Problem text={problem} />}
    </div>
  );
}

const FB_STATUS: [CompanyFeedback['status'], string][] = [
  ['new', 'New'],
  ['planned', 'Planned'],
  ['in_progress', 'In progress'],
  ['done', 'Done'],
  ['not_now', 'Not now'],
];
/** What each status leads to next (the buttons on a piece of feedback). */
const FB_NEXT: Record<CompanyFeedback['status'], CompanyFeedback['status'][]> = {
  new: ['planned', 'not_now'],
  planned: ['in_progress', 'not_now'],
  in_progress: ['done', 'planned'],
  done: ['in_progress'],
  not_now: ['planned'],
};
const FB_KIND: Record<string, string> = { idea: 'Idea', problem: 'Problem', love: 'Love' };

/** What couples told us; each moves new → planned → done (or not now), with a note couples see. */
function Feedback({ onNote }: { onNote: (s: string) => void }) {
  const { data, error, reload } = useLoad(companyApi.feedback);
  const team = useLoad(companyApi.staff);
  const [show, setShow] = useState<CompanyFeedback['status']>('new');
  const [mine, setMine] = useState(false);
  if (error) return <Problem text={error} />;
  if (!data) return <p className="text-[#5b6a52]">Loading…</p>;
  const meId = team.data?.me.id ?? '';
  const list = data.feedback.filter((f) => f.status === show && (!mine || f.assignee === meId));
  return (
    <section className="flex flex-col gap-3">
      <H sub="From Help → Tell us. Plan it with a short note (“Seating: bigger rooms”) and every couple sees it under “Coming from your feedback”.">Feedback and updates</H>
      <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Feedback by status">
        {FB_STATUS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={show === k} onClick={() => setShow(k)} className={`py-[7px] px-4 rounded-full border text-[14px] cursor-pointer ${show === k ? 'border-[#33402f] bg-[#33402f] text-[#fbf8f2]' : 'border-[#c6b794] bg-white text-[#33402f]'}`}>
            {label} {data.counts[k] ?? 0}
          </button>
        ))}
        <label className="flex items-center gap-2 text-[14px] cursor-pointer ml-auto">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="w-[18px] h-[18px] accent-[#5d6b47]" />
          Only mine
        </label>
      </div>
      {!list.length ? (
        <p className="text-[#5b6a52]">{show === 'new' ? 'Nothing new. Couples send feedback from Help → Tell us.' : 'None here.'}</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {list.map((f) => (
            <FeedbackRow
              key={f.id}
              f={f}
              team={team.data?.staff ?? []}
              meId={meId}
              onSaved={(msg) => {
                onNote(msg);
                reload();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedbackRow({ f, team, meId, onSaved }: { f: CompanyFeedback; team: { id: string; name: string; role: string }[]; meId: string; onSaved: (msg: string) => void }) {
  const [note, setNote] = useState(f.note);
  const [problem, setProblem] = useState('');
  const update = async (body: { status?: CompanyFeedback['status']; note?: string; assignee?: string }, msg: string) => {
    setProblem('');
    try {
      await companyApi.setFeedback(f.id, body);
      onSaved(msg);
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  const save = (status: CompanyFeedback['status']) =>
    update({ status, note, ...(status === 'in_progress' && !f.assignee && meId ? { assignee: meId } : {}) }, `Moved to ${FB_STATUS.find(([k]) => k === status)![1].toLowerCase()}`);
  return (
    <li className="flex flex-col gap-2 p-3 rounded-[14px] border border-[#e4e6df] bg-white">
      <span className="text-[13px] text-[#5b6a52]">
        {[FB_KIND[f.kind] ?? f.kind, f.names, day(f.createdAt)].filter(Boolean).join(' · ')}
        {f.email && (
          <>
            {' · '}
            <a href={`mailto:${f.email}`} className="!text-[#33402f]">
              {f.email}
            </a>
          </>
        )}
      </span>
      <p className="m-0 text-[16px] whitespace-pre-wrap break-words">{f.text}</p>
      <label className="flex items-center gap-2 text-[14px]">
        Who’s on it
        <select value={f.assignee} onChange={(e) => void update({ assignee: e.target.value }, e.target.value ? `Given to ${team.find((m) => m.id === e.target.value)?.name ?? 'them'}` : 'Unassigned')} className={`${input} w-auto`}>
          <option value="">Nobody yet</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({STAFF_INFO[m.role as StaffRole]?.name ?? m.role})
            </option>
          ))}
        </select>
        {!f.assignee && meId && (
          <button type="button" className={btn} onClick={() => void update({ assignee: meId }, 'It’s yours')}>
            Take it
          </button>
        )}
      </label>
      <DraftReply id={f.id} />
      <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="What we’ll do (couples see this once it’s planned)" aria-label="What we’ll do" className={input} />
      <div className="flex gap-2 flex-wrap">
        {FB_NEXT[f.status].map((k, i) => (
          <button key={k} type="button" className={i === 0 ? primary : btn} onClick={() => void save(k)}>
            {FB_STATUS.find(([s]) => s === k)![1]}
          </button>
        ))}
        {note !== f.note && (
          <button type="button" className={btn} onClick={() => void update({ note }, 'Note saved')}>
            Save note
          </button>
        )}
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
      <Assistant
        title="Write with the assistant"
        sub="Posts for Instagram, Facebook and TikTok, or a first email to a celebrant or planner. Check every draft before it goes out."
        tasks={[
          ['posts', 'Write 3 posts', 'What about? e.g. seating that follows your rules'],
          ['outreach', 'Draft an outreach email', 'To whom? e.g. a celebrant in Newcastle'],
        ]}
      />
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
      onSaved(await companyApi.saveBanner(b));
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
            <li key={l.id} className={`flex flex-wrap items-center gap-3 p-3 rounded-[14px] border ${l.hidden ? 'border-[#e8d6cf] bg-[#f6ece8]' : 'border-[#e4e6df] bg-white'}`}>
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
  const LINKS = [
    ['essentials', 'Essentials'],
    ['complete', 'Deluxe'],
    ['event', 'Extra event'],
  ] as const;
  return (
    <>
      <Connections onNote={onNote} />
      <section className={card} aria-label="Payment links">
        <H sub="When a couple asks for a plan, Couples → Email it sends the matching link. Make one per plan in Stripe (Payment Links) or your bank; they start with https://.">Payment links</H>
        <div className="grid gap-3 sm:grid-cols-3">
          {LINKS.map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1 text-[13px] text-[#5b6a52]">
              {label}
              <input value={s.paymentLinks[k]} placeholder="https://buy.stripe.com/…" onChange={(e) => setS({ ...s, paymentLinks: { ...s.paymentLinks, [k]: e.target.value.trim() } })} className={input} />
            </label>
          ))}
        </div>
      </section>
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
        <H sub="Free-plan invitations carry a small “Made with The Yes List · make your own” at the bottom, linking here with the wedding counted as the referrer. Paid plans (Essentials, Deluxe, Founders) never show it.">On guest pages</H>
        <label className="flex items-center gap-2 text-[15px] cursor-pointer">
          <input type="checkbox" checked={s.madeWith} onChange={(e) => setS({ ...s, madeWith: e.target.checked })} className="w-[20px] h-[20px] accent-[#5d6b47]" />
          Show “Made with The Yes List” on Free-plan invitations
        </label>
      </section>
      {problem && <Problem text={problem} />}
      <button type="button" className={`${primary} self-start`} disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save settings'}
      </button>
    </>
  );
}

const ACTION: Record<string, string> = {
  'company.plan': 'Changed the plan',
  'company.link': 'Sent a payment link',
  'company.paid': 'Marked paid',
  'plan.paid': 'Paid',
  'company.feedback': 'Updated feedback',
  'company.settings': 'Changed settings',
  'company.banner': 'Changed the banner',
  'company.promos': 'Changed promo codes',
  'company.vendor.hide': 'Hid a vendor',
  'company.vendor.show': 'Showed a vendor',
  'company.team.invite': 'Invited',
  'company.team.join': 'Joined the team',
  'company.team.role': 'Changed a role',
  'company.team.remove': 'Removed from the team',
  'company.tax': 'Changed tax settings',
  'company.expense': 'Added an expense',
  'company.bot.add': 'Added a bot',
  'company.bot.revoke': 'Turned off a bot',
  'company.assistant': 'Asked the assistant',
  'company.connections': 'Changed a connection',
};

/** Who works on the app, their roles, and invitations. Owners only. */
function Team({ onNote }: { onNote: (s: string) => void }) {
  const { data, error, reload } = useLoad(companyApi.team);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('support');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [link, setLink] = useState('');
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setProblem('');
    try {
      await fn();
      onNote(msg);
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  const invite = async () => {
    setBusy(true);
    setProblem('');
    setLink('');
    try {
      const r = await companyApi.invite(email, role);
      if (r.emailed) onNote(`Invitation emailed to ${email}`);
      else setLink(r.link);
      setEmail('');
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (error) return <Problem text={error} />;
  if (!data) return <p className="text-[#5b6a52]">Loading…</p>;
  return (
    <>
      <section className={card} aria-label="Invite someone">
        <H sub="They get a link (a week, once) to set up their sign-in. Each role sees only its part of the portal.">Invite someone</H>
        <div className="flex gap-2 flex-wrap items-end">
          <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52] flex-1 min-w-[220px]">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="name@…" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52]">
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={`${input} w-auto`}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {STAFF_INFO[r].name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={primary} disabled={busy || !/^\S+@\S+\.\S+$/.test(email)} onClick={() => void invite()}>
            {busy ? 'Inviting…' : 'Invite'}
          </button>
        </div>
        <p className="m-0 text-[14px] text-[#5b6a52]">{STAFF_INFO[role].does}</p>
        {link && (
          <p className="m-0 text-[14px] break-all">
            Email isn’t set up, so send them this link yourself: <strong>{link}</strong>
          </p>
        )}
        {problem && <Problem text={problem} />}
      </section>
      <section className={card} aria-label="The team">
        <H>The team</H>
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {data.staff.map((m: CompanyStaff) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-3 rounded-[12px] bg-white border border-[#ece3cd]">
              <span className="flex-1 min-w-[200px]">
                <strong className="block text-[15px]">{m.name}</strong>
                <span className="text-[13px] text-[#5b6a52]">
                  {m.email}
                  {m.lastIn ? ` · last in ${day(m.lastIn)}` : ' · not signed in yet'}
                </span>
              </span>
              {m.founder ? (
                <span className="text-[14px]">Owner (founder)</span>
              ) : (
                <>
                  <select value={m.role} aria-label={`Role for ${m.name}`} onChange={(e) => void run(() => companyApi.setRole(m.id, e.target.value), `${m.name}: ${STAFF_INFO[e.target.value as StaffRole].name}`)} className={`${input} w-auto`}>
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {STAFF_INFO[r].name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={btn} onClick={() => {
                      if (window.confirm(`Remove ${m.name} from the team? They’re signed out straight away.`)) void run(() => companyApi.setRole(m.id, ''), `${m.name} removed`);
                    }}>
                    Remove
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {data.invites.length > 0 && (
          <>
            <h3 className="m-0 text-[13px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">Invited, not joined yet</h3>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {data.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 text-[14px]">
                  <span className="flex-1">
                    {i.email} · {STAFF_INFO[i.role as StaffRole]?.name ?? i.role} · until {day(i.expiresAt)}
                  </span>
                  <button type="button" className={btn} onClick={() => void run(() => companyApi.cancelInvite(i.id), 'Invitation cancelled')}>
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <Bots onNote={onNote} />
      <section className={card} aria-label="What each role can do">
        <H>What each role can do</H>
        <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[14px]">
          {STAFF_ROLES.map((r) => (
            <div key={r} className="contents">
              <dt className="font-semibold">{STAFF_INFO[r].name}</dt>
              <dd className="m-0">{STAFF_INFO[r].does}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

/** Who did what: plans, payments, links, feedback, settings and the team. */
function Activity() {
  const { data, error } = useLoad(companyApi.activity);
  if (error) return <Problem text={error} />;
  if (!data) return <p className="text-[#5b6a52]">Loading…</p>;
  return (
    <section className="flex flex-col gap-3">
      <H sub="Every change in the portal, with who made it. Card payments show as Card payment.">Activity</H>
      {!data.activity.length ? (
        <p className="text-[#5b6a52]">Nothing yet.</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-1">
          {data.activity.map((a: CompanyActivity) => (
            <li key={a.id} className="flex flex-wrap gap-x-3 py-2 border-b border-[#ece3cd] text-[14px]">
              <span className="w-[130px] flex-none text-[#5b6a52]">{new Date(a.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              <strong className="flex-none">{a.who || 'Someone'}</strong>
              <span className="flex-1 min-w-[180px]">
                {ACTION[a.action] ?? a.action}
                {a.names ? ` · ${a.names}` : a.target && !/^[0-9a-f-]{36}$/.test(a.target) ? ` · ${a.target}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** /company/join?t=…: an invitation to the team. New here: a name and passcode; have an account: its passcode. */
function JoinTeam() {
  const token = new URLSearchParams(window.location.search).get('t') ?? '';
  const [inv, setInv] = useState<{ email: string; roleName: string; hasAccount: boolean } | null>(null);
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = 'Join the team';
    staffJoinApi.get(token).then(setInv, (e: Error) => setError(e.message));
  }, [token]);
  const join = async () => {
    setBusy(true);
    setError('');
    try {
      await staffJoinApi.accept(token, passcode, firstName);
      window.location.replace('/company');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-[#f3f4ef] flex items-center justify-center p-6" style={{ color: INK, fontFamily: sans }}>
      <div className="flex flex-col gap-3 w-full max-w-[420px]">
        <h1 className="m-0 text-[28px] font-semibold text-center">
          Join the team
        </h1>
        {!inv && !error && <p className="text-center text-[#5b6a52]">Loading…</p>}
        {inv && (
          <form
            className={card}
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <p className="m-0 text-[16px]">
              You’re joining as <strong>{inv.roleName}</strong>, signing in as <strong>{inv.email}</strong>.
            </p>
            {!inv.hasAccount && (
              <label className="flex flex-col gap-1 text-[14px]">
                Your first name
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className={input} />
              </label>
            )}
            <label className="flex flex-col gap-1 text-[14px]">
              {inv.hasAccount ? 'Your passcode (you already have an account)' : 'Choose a passcode (8 or more characters)'}
              <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete={inv.hasAccount ? 'current-password' : 'new-password'} className={input} />
            </label>
            <button type="submit" className={primary} disabled={busy || !passcode || (!inv.hasAccount && !firstName.trim())}>
              {busy ? 'Joining…' : 'Join'}
            </button>
          </form>
        )}
        {error && <Problem text={error} />}
      </div>
    </main>
  );
}

const QUARTER = ['', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar', 'Apr–Jun'];
const EXPENSE_KIND: Record<string, string> = { hosting: 'Hosting', domain: 'Domain', sms: 'Texts (SMS)', email: 'Email', ads: 'Advertising', software: 'Software', fees: 'Fees', other: 'Other' };

/**
 * Money and tax: each financial year's sales, card fees, GST (once registered), expenses, profit, and what
 * to put aside for tax, by BAS quarter; a spreadsheet for the accountant. A guide, not tax advice.
 */
function Money({ onNote }: { onNote: (s: string) => void }) {
  const thisFy = (() => {
    const d = new Date();
    return d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear();
  })();
  const [fy, setFy] = useState(thisFy);
  const load = useCallback(() => companyApi.money(fy), [fy]);
  const { data, error, reload } = useLoad(load);
  const [tax, setTax] = useState<CompanyMoney['tax'] | null>(null);
  const [exp, setExp] = useState({ date: new Date().toISOString().slice(0, 10), what: '', kind: 'other' as CompanyMoney['expenses'][number]['kind'], dollars: '', gst: false });
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (data) setTax(data.tax);
  }, [data]);
  if (error) return <Problem text={error} />;
  if (!data || !tax) return <p className="text-[#5b6a52]">Loading…</p>;
  const t = data.total;
  const near = !data.tax.gstRegistered && data.last12Cents >= 6_000_000;
  const saveTax = async () => {
    setProblem('');
    try {
      await companyApi.saveTax(tax);
      onNote('Tax settings saved');
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  const addExpense = async () => {
    setProblem('');
    const cents = Math.round((Number(exp.dollars) || 0) * 100);
    try {
      await companyApi.addExpense({ date: exp.date, what: exp.what.trim(), kind: exp.kind, cents, gstCents: exp.gst ? Math.round(cents / 11) : 0 });
      setExp({ ...exp, what: '', dollars: '' });
      onNote('Expense added');
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <H sub="Sales, card fees, GST and expenses, by quarter, and what to put aside for tax. A guide for you and your accountant, not tax advice.">Money and tax</H>
        <label className="ml-auto flex items-center gap-2 text-[14px]">
          Financial year
          <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className={`${input} w-auto`}>
            {[thisFy + 1, thisFy, thisFy - 1, thisFy - 2].map((y) => (
              <option key={y} value={y}>
                {y - 1}–{String(y).slice(2)}
              </option>
            ))}
          </select>
        </label>
        <a href={companyApi.moneyCsv(fy)} className={`${btn} no-underline`}>
          Spreadsheet for the accountant
        </a>
      </div>
      {near && (
        <p role="alert" className="m-0 p-3 rounded-[12px] bg-[#fbf3e1] border border-[#ecd9ae] text-[14px]">
          Sales in the last 12 months are {money(data.last12Cents)}. At {money(data.gstThresholdCents)} you must register for GST (within 21 days). Talk to your accountant now.
        </p>
      )}
      <Profit data={data} tax={tax} setTax={setTax} onSave={() => void saveTax()} />
      <H>This financial year</H>
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Tile label="Sales" value={money(t.gross)} sub={`${t.sales} payments`} />
        <Tile label="Card fees" value={money(t.fees)} sub="Estimated from your rate" />
        <Tile label="Profit" value={money(t.profit)} sub={`After ${money(t.spent)} of expenses`} />
        <Tile label="Put aside" value={money(t.setAside + t.gstOwed)} sub={`${money(t.setAside)} income tax${data.tax.gstRegistered ? ` + ${money(t.gstOwed)} GST` : ''}`} />
      </section>
      <section className={card} aria-label="By quarter">
        <H sub="The same quarters as a BAS. Move the “put aside” amount to a separate savings account each quarter.">By quarter</H>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] border-collapse">
            <thead>
              <tr className="text-left text-[#5f6a58]">
                {['Quarter', 'Sales', 'Card fees', data.tax.gstRegistered ? 'GST to pay' : '', 'Expenses', 'Profit', 'Put aside']
                  .filter(Boolean)
                  .map((h) => (
                    <th key={h} className="py-2 pr-3 font-semibold">
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {data.quarters.map((q) => (
                <tr key={q.q} className="border-t border-[#e4e6df]">
                  <td className="py-2 pr-3">{QUARTER[q.q]}</td>
                  <td className="py-2 pr-3">{money(q.gross)}</td>
                  <td className="py-2 pr-3">{money(q.fees)}</td>
                  {data.tax.gstRegistered && <td className="py-2 pr-3">{money(q.gstOwed)}</td>}
                  <td className="py-2 pr-3">{money(q.spent)}</td>
                  <td className="py-2 pr-3">{money(q.profit)}</td>
                  <td className="py-2 pr-3 font-semibold">{money(q.setAside + q.gstOwed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={card} aria-label="Expenses">
        <H sub="Domain, texts, ads, software: anything the business pays for. Keep the receipts.">Expenses</H>
        <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_150px_120px_auto_auto] items-end">
          <input type="date" value={exp.date} onChange={(e) => setExp({ ...exp, date: e.target.value })} aria-label="Date" className={input} />
          <input value={exp.what} maxLength={120} onChange={(e) => setExp({ ...exp, what: e.target.value })} placeholder="What it was" aria-label="What it was" className={input} />
          <select value={exp.kind} onChange={(e) => setExp({ ...exp, kind: e.target.value as typeof exp.kind })} aria-label="Kind" className={input}>
            {Object.entries(EXPENSE_KIND).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <input type="number" min={0} step="0.01" value={exp.dollars} onChange={(e) => setExp({ ...exp, dollars: e.target.value })} placeholder="$" aria-label="Amount" className={input} />
          <label className="flex items-center gap-1 text-[13px]">
            <input type="checkbox" checked={exp.gst} onChange={(e) => setExp({ ...exp, gst: e.target.checked })} />
            Incl. GST
          </label>
          <button type="button" className={primary} disabled={!exp.what.trim() || !Number(exp.dollars)} onClick={() => void addExpense()}>
            Add
          </button>
        </div>
        {data.expenses.length > 0 && (
          <ul className="m-0 p-0 list-none flex flex-col">
            {data.expenses.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-2 border-t border-[#e4e6df] text-[14px]">
                <span className="w-[90px] text-[#5f6a58]">{day(e.date)}</span>
                <span className="flex-1 min-w-[160px]">
                  {e.what} <span className="text-[#5f6a58]">· {EXPENSE_KIND[e.kind]}</span>
                </span>
                <strong>{money(e.cents)}</strong>
                <button type="button" className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#5f6a58]" onClick={() => void companyApi.removeExpense(e.id).then(reload, (er: Error) => setProblem(er.message))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={card} aria-label="Tax settings">
        <H sub="Not registered for GST: no GST is in your prices. Registered: 1/11 of each sale from that day is GST to pay.">Tax settings</H>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
            ABN
            <input value={tax.abn} maxLength={20} onChange={(e) => setTax({ ...tax, abn: e.target.value })} placeholder="11 digits" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
            Put aside for income tax (% of profit)
            <input type="number" min={0} max={60} value={tax.setAsidePct} onChange={(e) => setTax({ ...tax, setAsidePct: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} className={input} />
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={tax.gstRegistered} onChange={(e) => setTax({ ...tax, gstRegistered: e.target.checked })} className="w-[18px] h-[18px]" />
            Registered for GST
          </label>
          {tax.gstRegistered && (
            <label className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
              Registered from
              <input type="date" value={tax.gstFrom} onChange={(e) => setTax({ ...tax, gstFrom: e.target.value })} className={input} />
            </label>
          )}
          <label className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
            Card fee (% + cents per payment)
            <span className="flex gap-2">
              <input type="number" min={0} max={10} step="0.1" value={tax.feePct} onChange={(e) => setTax({ ...tax, feePct: Number(e.target.value) || 0 })} aria-label="Card fee percent" className={input} />
              <input type="number" min={0} max={500} value={tax.feeCents} onChange={(e) => setTax({ ...tax, feeCents: Number(e.target.value) || 0 })} aria-label="Card fee cents" className={input} />
            </span>
          </label>
        </div>
        {problem && <Problem text={problem} />}
        <button type="button" className={`${primary} self-start`} onClick={() => void saveTax()}>
          Save tax settings
        </button>
      </section>
    </>
  );
}

/**
 * Are we making money? This month and the last 12 from real sales, card fees, the running costs and
 * one-off expenses; break-even; and a what-if calculator that starts from the real numbers.
 */
function Profit({ data, tax, setTax, onSave }: { data: CompanyMoney; tax: CompanyMoney['tax']; setTax: (t: CompanyMoney['tax']) => void; onSave: () => void }) {
  const months = data.months;
  const now = months[months.length - 1]!;
  // The recent pace: weddings sold a month over the last three months.
  const avgSales = months.slice(-3).reduce((a, m) => a + m.sales, 0) / 3;
  const plans = months.reduce((a, m) => ({ e: a.e + m.essentials, d: a.d + m.deluxe }), { e: 0, d: 0 });
  const mixReal = plans.e + plans.d ? Math.round((plans.d / (plans.e + plans.d)) * 100) : 35;
  const running = tax.monthlyCosts.reduce((a, m) => a + m.cents, 0);
  const fee = (c: number) => (c > 0 ? Math.round((c * tax.feePct) / 100 + tax.feeCents) : 0);
  // What if: starts from the real prices, the real plan mix and the last three months' pace.
  const [w, setW] = useState({ e: data.prices.essentials / 100, d: data.prices.deluxe / 100, mix: mixReal, sales: Math.max(1, Math.round(avgSales)) });
  const mix = Math.min(100, Math.max(0, w.mix)) / 100;
  const each = (1 - mix) * (w.e * 100 - fee(w.e * 100)) + mix * (w.d * 100 - fee(w.d * 100));
  const whatIfProfit = Math.round(w.sales * each - running);
  const breakEven = each > 0 ? Math.ceil(running / each) : 0;
  const keep = (p: number) => Math.round(p * (1 - tax.setAsidePct / 100));
  const max = Math.max(1, ...months.map((m) => Math.abs(m.profit)));
  const ok = now.profit >= 0;
  const costs = tax.monthlyCosts;
  const setCost = (i: number, p: Partial<{ what: string; cents: number }>) => setTax({ ...tax, monthlyCosts: costs.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  return (
    <>
      <section className={card} aria-label="Are we making money">
        <H sub="From real payments this month, card fees, your running costs and one-off expenses.">Are we making money?</H>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Tile label="This month" value={money(now.profit)} sub={ok ? `Profit · ${money(keep(Math.max(0, now.profit)))} after tax` : 'Loss so far this month'} />
          <Tile label="Weddings sold" value={String(now.sales)} sub={`${now.essentials} Essentials · ${now.deluxe} Deluxe`} />
          <Tile label="Running costs" value={money(running)} sub="Every month" />
          <Tile label="Break-even" value={`${breakEven} a month`} sub={`At ${money(Math.round(each))} kept per sale`} />
        </div>
        <svg viewBox="0 0 360 120" className="w-full h-[140px]" role="img" aria-label={`Profit by month: ${months.map((m) => `${m.month} ${money(m.profit)}`).join(', ')}`}>
          <line x1="0" x2="360" y1="60" y2="60" stroke="#d5d8cf" />
          {months.map((m, i) => {
            const h = (Math.abs(m.profit) / max) * 52;
            const up = m.profit >= 0;
            return (
              <g key={m.month}>
                <rect x={i * 30 + 4} y={up ? 60 - h : 60} width={22} height={Math.max(h, 1)} rx={3} fill={up ? '#2f6b3a' : '#9a3b2a'} />
                {i % 2 === 0 && (
                  <text x={i * 30 + 15} y={118} textAnchor="middle" fontSize="9" fill="#5f6a58">
                    {new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <p className="m-0 text-[14px]">
          {running === 0
            ? 'Add your running costs below to see the real profit.'
            : now.sales >= breakEven
              ? `On track: ${now.sales} sold this month, ${breakEven} needed to cover the running costs.`
              : `${Math.max(0, breakEven - now.sales)} more ${breakEven - now.sales === 1 ? 'sale' : 'sales'} this month to cover the running costs.`}
        </p>
      </section>

      <Targets data={data} tax={tax} setTax={setTax} onSave={onSave} running={running} each={each} />
      <section className={card} aria-label="Running costs">
        <H sub="What the business pays every month: the Grok bot, Claude, hosting, email, and yearly costs divided by 12. Used in every profit figure.">Running costs each month</H>
        {costs.map((c, i) => (
          <div key={i} className="grid gap-2 grid-cols-[minmax(0,1fr)_120px_auto] items-center">
            <input value={c.what} maxLength={80} onChange={(e) => setCost(i, { what: e.target.value })} aria-label="What it is" className={input} />
            <input type="number" min={0} step="0.01" value={c.cents / 100} onChange={(e) => setCost(i, { cents: Math.round((Number(e.target.value) || 0) * 100) })} aria-label={`${c.what}: dollars a month`} className={input} />
            <button type="button" className={btn} onClick={() => setTax({ ...tax, monthlyCosts: costs.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </div>
        ))}
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={btn} onClick={() => setTax({ ...tax, monthlyCosts: [...costs, { what: 'New cost', cents: 0 }] })}>
            Add a cost
          </button>
          {!costs.length && (
            <button
              type="button"
              className={btn}
              onClick={() =>
                setTax({
                  ...tax,
                  monthlyCosts: [
                    { what: 'Grok business bot', cents: 5000 },
                    { what: 'Claude (code)', cents: 3100 },
                    { what: 'Website chat bot', cents: 2000 },
                    { what: 'Domain and business name (yearly ÷ 12)', cents: 550 },
                    { what: 'Accountant (yearly ÷ 12)', cents: 2500 },
                  ],
                })
              }
            >
              Start with the usual costs
            </button>
          )}
          <button type="button" className={primary} onClick={onSave}>
            Save running costs
          </button>
        </div>
      </section>

      <section className={card} aria-label="What if">
        <H sub="Starts from your real prices, plan mix and recent pace. Change anything to see the effect.">What if…</H>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {(
            [
              ['e', 'Essentials price ($)'],
              ['d', 'Deluxe price ($)'],
              ['mix', 'Choosing Deluxe (%)'],
              ['sales', 'Weddings a month'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
              {label}
              <input type="number" min={0} value={w[k]} onChange={(e) => setW({ ...w, [k]: Math.max(0, Number(e.target.value) || 0) })} className={input} />
            </label>
          ))}
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          <Tile label="Profit a month" value={money(whatIfProfit)} sub={`${money(keep(Math.max(0, whatIfProfit)))} after ${tax.setAsidePct}% tax`} />
          <Tile label="Break-even" value={`${breakEven} a month`} sub={`${money(Math.round(each))} kept per sale`} />
          <Tile label="A year" value={money(whatIfProfit * 12)} sub="Before tax" />
        </div>
      </section>
    </>
  );
}

/** Bots (Grok) that help run the company: a role like a person's, a key shown once, and an off switch. */
function Bots({ onNote }: { onNote: (s: string) => void }) {
  const { data, error, reload } = useLoad(companyApi.bots);
  const [name, setName] = useState('Grok');
  const [role, setRole] = useState<'manager' | 'support' | 'developer' | 'marketing'>('support');
  const [key, setKey] = useState('');
  const [problem, setProblem] = useState('');
  const add = async () => {
    setProblem('');
    try {
      const r = await companyApi.addBot(name.trim(), role);
      setKey(r.key);
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  return (
    <section className={card} aria-label="Bots">
      <H sub="Give Grok (or any assistant) its own key and role. It sees and does only what that role allows, every action is in Activity under its name, and you can switch it off at once. Bots are never owners.">Bots</H>
      {error && <Problem text={error} />}
      <div className="flex gap-2 flex-wrap items-end">
        <label className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
          Name
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={`${input} w-[180px]`} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={`${input} w-auto`}>
            {(['manager', 'support', 'developer', 'marketing'] as const).map((r) => (
              <option key={r} value={r}>
                {STAFF_INFO[r].name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={primary} disabled={!name.trim()} onClick={() => void add()}>
          Create a key
        </button>
      </div>
      {key && (
        <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-[#fbf3e1] border border-[#ecd9ae] text-[14px]">
          <strong>Copy this key now: it won’t be shown again.</strong>
          <code className="break-all text-[13px]">{key}</code>
          <span>Give it to the bot as the header “Authorization: Bearer {'<key>'}” with the instructions in docs/GROK_PLAYBOOK.md.</span>
          <button type="button" className={`${btn} self-start`} onClick={() => void navigator.clipboard?.writeText(key).then(() => onNote('Key copied'), () => undefined)}>
            Copy key
          </button>
        </div>
      )}
      {problem && <Problem text={problem} />}
      {data && data.bots.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col">
          {data.bots.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 py-2 border-t border-[#e4e6df] text-[14px]">
              <strong className="flex-1 min-w-[140px]">{b.name}</strong>
              <span className="text-[#5f6a58]">
                {b.revoked ? 'Switched off' : `${STAFF_INFO[b.role as StaffRole]?.name ?? b.role} · ${b.lastUsedAt ? `last used ${day(b.lastUsedAt)}` : 'not used yet'}`}
              </span>
              {!b.revoked && (
                <button type="button" className={btn} onClick={() => void companyApi.revokeBot(b.id).then(() => (onNote(`${b.name} switched off`), reload()), (e: Error) => setProblem(e.message))}>
                  Switch off
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The company assistant: a few ready-made asks, an optional note, and the draft to copy. */
function Assistant({ title, sub, tasks }: { title: string; sub: string; tasks: [task: 'brief' | 'posts' | 'outreach' | 'ask', label: string, hint: string][] }) {
  const { data } = useLoad(companyApi.assistantOn);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  if (!data?.on) return null;
  const run = async (task: (typeof tasks)[number][0]) => {
    setBusy(task);
    setProblem('');
    try {
      setText((await companyApi.assistant(task, note.trim())).text);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const hint = tasks.find(([, , h]) => h)?.[2] ?? '';
  return (
    <section className={card} aria-label={title}>
      <H sub={sub}>{title}</H>
      {hint && <input value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} placeholder={hint} aria-label="Details for the assistant" className={input} />}
      <div className="flex gap-2 flex-wrap">
        {tasks.map(([task, label]) => (
          <button key={task} type="button" className={task === tasks[0]![0] ? primary : btn} disabled={!!busy} onClick={() => void run(task)}>
            {busy === task ? 'Writing…' : label}
          </button>
        ))}
      </div>
      {problem && <Problem text={problem} />}
      {text && (
        <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-[#f3f4ef] border border-[#e4e6df]">
          <p className="m-0 text-[15px] whitespace-pre-wrap">{text}</p>
          <button type="button" className={`${btn} self-start`} onClick={() => void navigator.clipboard?.writeText(text).catch(() => undefined)}>
            Copy
          </button>
        </div>
      )}
    </section>
  );
}

/** "Draft a reply" on a piece of feedback. */
function DraftReply({ id }: { id: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const draft = async () => {
    setBusy(true);
    try {
      setText((await companyApi.assistant('feedback', '', id)).text);
    } catch (e) {
      setText((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return text ? (
    <p className="m-0 p-3 rounded-[12px] bg-[#f3f4ef] text-[14px] whitespace-pre-wrap">{text}</p>
  ) : (
    <button type="button" className={`${btn} self-start`} disabled={busy} onClick={() => void draft()}>
      {busy ? 'Drafting…' : 'Draft a reply'}
    </button>
  );
}

/** Each outside service the site uses: what it's for, where to get its keys, and a box to paste them. */
const SERVICES: { id: string; name: string; does: string; open: string; openLabel: string; steps: string[]; keys: [key: string, label: string, secret: boolean][]; copy?: 'redirect' | 'hook' }[] = [
  {
    id: 'google',
    name: 'Google Drive and Google Photos',
    does: 'Couples tap Connect, sign in to their own Google account and allow access: their photos and files go to their own Drive or Photos.',
    open: 'https://console.cloud.google.com/auth/clients/create',
    openLabel: 'Open Google Cloud',
    steps: [
      'Use a business Google account (its email is shown to couples), make a project, and on the consent screen choose External and Publish.',
      'Create an OAuth client: Web application, with the return address below.',
      'Paste its Client ID and Client secret here.',
    ],
    keys: [
      ['GOOGLE_CLIENT_ID', 'Client ID', false],
      ['GOOGLE_CLIENT_SECRET', 'Client secret', true],
    ],
    copy: 'redirect',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    does: 'The same for couples who use Dropbox: Connect, sign in, allow.',
    open: 'https://www.dropbox.com/developers/apps/create',
    openLabel: 'Open Dropbox',
    steps: ['Create app, Scoped access, App folder; tick files.content.write, files.content.read and account_info.read.', 'Add the return address below on Settings.', 'Paste the App key and App secret here.'],
    keys: [
      ['DROPBOX_APP_KEY', 'App key', false],
      ['DROPBOX_APP_SECRET', 'App secret', true],
    ],
    copy: 'redirect',
  },
  {
    id: 'stripe',
    name: 'Card payments (Stripe)',
    does: 'Couples pay by card and their plan switches on by itself. Stripe pays into your bank.',
    open: 'https://dashboard.stripe.com/apikeys',
    openLabel: 'Open Stripe',
    steps: ['Copy the Secret key (sk_live_…).', 'Webhooks: add an endpoint with the address below and the event checkout.session.completed, then copy its Signing secret.'],
    keys: [
      ['STRIPE_SECRET_KEY', 'Secret key', true],
      ['STRIPE_WEBHOOK_SECRET', 'Webhook signing secret', true],
    ],
    copy: 'hook',
  },
  {
    id: 'email',
    name: 'Email (Resend)',
    does: 'Sign-in links, payment links, and every wedding’s own email address. Free for 3,000 emails a month.',
    open: 'https://resend.com/api-keys',
    openLabel: 'Open Resend',
    steps: ['Add and verify your domain in Resend.', 'Create an API key and paste it with the From address, e.g. The Yes List <hello@your-domain>.'],
    keys: [
      ['RESEND_API_KEY', 'API key', true],
      ['EMAIL_FROM', 'From address', false],
      ['INBOX_DOMAIN', 'Domain for wedding addresses', false],
    ],
  },
  {
    id: 'texts',
    name: 'Automatic texts (Mobile Message)',
    does: 'Optional: texts sent for couples automatically. Without it, couples send free from their own phone or by email.',
    open: 'https://mobilemessage.com.au',
    openLabel: 'Open Mobile Message',
    steps: ['Sign up, then copy your API username and password from the account settings.'],
    keys: [
      ['MM_USER', 'API username', false],
      ['MM_PASS', 'API password', true],
    ],
  },
];

/** Settings → Connections (owners): one card per service, the keys pasted once, working straight away. */
function Connections({ onNote }: { onNote: (s: string) => void }) {
  const role = useContext(RoleCtx);
  const load = useCallback(() => (role === 'owner' ? companyApi.connections() : Promise.resolve(null)), [role]);
  const { data, error, reload } = useLoad(load);
  const [open, setOpen] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');
  if (role !== 'owner') return null;
  if (error) return <Problem text={error} />;
  if (!data) return null;
  const save = async (keys: string[]) => {
    setProblem('');
    try {
      await companyApi.saveConnections(Object.fromEntries(keys.filter((k) => vals[k] !== undefined).map((k) => [k, vals[k] ?? ''])));
      setVals({});
      onNote('Saved. It works straight away.');
      reload();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  return (
    <section className={card} aria-label="Connections">
      <H sub="Paste each service’s keys here once: kept encrypted, never shown again, and working straight away. Only owners see this.">Connections</H>
      {SERVICES.map((s) => {
        const states = s.keys.map(([k]) => data.status[k] ?? '');
        const on = states.every(Boolean);
        const copy = s.copy === 'redirect' ? data.redirectUri : s.copy === 'hook' ? data.stripeHook : '';
        return (
          <div key={s.id} className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#e4e6df]">
            <button type="button" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? '' : s.id)} className="flex items-center justify-between gap-3 p-0 border-0 bg-transparent text-left cursor-pointer">
              <span>
                <strong className="block text-[15px]">{s.name}</strong>
                <span className="text-[13px] text-[#5f6a58]">{s.does}</span>
              </span>
              <span className={`flex-none py-[3px] px-2 rounded-full text-[12px] font-semibold ${on ? 'bg-[#dfe7cf] text-[#2f6b3a]' : 'bg-[#f3e6c6] text-[#6b4f1d]'}`}>{on ? 'Connected' : 'Not set up'}</span>
            </button>
            {open === s.id && (
              <div className="flex flex-col gap-2">
                <ol className="m-0 pl-5 text-[14px] flex flex-col gap-1">
                  {s.steps.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                <a href={s.open} target="_blank" rel="noopener noreferrer" className={`${btn} self-start no-underline`}>
                  {s.openLabel} ↗
                </a>
                {copy && (
                  <span className="text-[13px]">
                    {s.copy === 'hook' ? 'Webhook address' : 'Return address'}: <code className="break-all select-all bg-[#f3f4ef] px-1 rounded">{copy}</code>
                  </span>
                )}
                {s.keys.map(([k, label, secret], i) => (
                  <label key={k} className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
                    {label}
                    {states[i] === 'deploy' ? (
                      <span className="text-[14px] text-[#1b2218]">Set in GitHub</span>
                    ) : (
                      <input
                        type={secret ? 'password' : 'text'}
                        autoComplete="off"
                        value={vals[k] ?? ''}
                        placeholder={states[i] === 'saved' ? 'Saved (paste to replace)' : 'Paste here'}
                        onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
                        className={input}
                      />
                    )}
                  </label>
                ))}
                <button type="button" className={`${primary} self-start`} disabled={!s.keys.some(([k]) => vals[k])} onClick={() => void save(s.keys.map(([k]) => k))}>
                  Save
                </button>
              </div>
            )}
          </div>
        );
      })}
      {problem && <Problem text={problem} />}
    </section>
  );
}

/** The company's to-do list: the launch jobs first (with where to do each), then anything you add. */
function TodoList({ onGo }: { onGo: (t: Tab) => void }) {
  const { data, error, setData } = useLoad(companyApi.todo);
  const [adding, setAdding] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [problem, setProblem] = useState('');
  if (error) return <Problem text={error} />;
  if (!data) return null;
  const save = async (items: CompanyTodo[]) => {
    const before = data;
    setData({ ...data, items });
    setProblem('');
    try {
      setData(await companyApi.saveTodo(items));
    } catch (e) {
      setData(before);
      setProblem((e as Error).message);
    }
  };
  const left = data.items.filter((i) => !i.done);
  const groups = [...new Set(data.items.map((i) => i.group || 'Other'))];
  const open = (link: string) => {
    if (link.startsWith('#')) onGo(link.slice(1) as Tab);
  };
  return (
    <section className={card} aria-label="To-do list">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <H sub="What’s left to set up and launch. Tick things off as you go; everyone on the team sees the same list.">To-do list</H>
        <span className="text-[14px] font-semibold">{left.length ? `${left.length} to do` : 'All done ✓'}</span>
      </div>
      <div className="h-[8px] rounded-full bg-[#e4e6df] overflow-hidden">
        <div className="h-full bg-[#2f6b3a]" style={{ width: `${data.items.length ? ((data.items.length - left.length) / data.items.length) * 100 : 0}%` }} />
      </div>
      {groups.map((g) => {
        const items = data.items.filter((i) => (i.group || 'Other') === g && (showDone || !i.done));
        if (!items.length) return null;
        return (
          <div key={g} className="flex flex-col">
            <h3 className="m-0 mb-1 text-[12px] font-semibold tracking-[.14em] uppercase text-[#5f6a58]">{g}</h3>
            {items.map((i) => (
              <div key={i.id} className="flex items-start gap-3 py-2 border-t border-[#e4e6df]">
                <input
                  type="checkbox"
                  checked={i.done}
                  disabled={!data.canEdit}
                  aria-label={i.text}
                  onChange={() => void save(data.items.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))}
                  className="mt-[3px] w-[18px] h-[18px] accent-[#2f6b3a] flex-none"
                />
                <span className={`flex-1 min-w-0 text-[15px] ${i.done ? 'line-through text-[#8a917f]' : ''}`}>
                  {i.text}
                  {i.done && i.doneBy && <span className="block text-[12px] no-underline text-[#8a917f]">Done by {i.doneBy}</span>}
                </span>
                {i.link &&
                  (i.link.startsWith('#') ? (
                    <button type="button" className={`${btn} !py-[5px] flex-none`} onClick={() => open(i.link)}>
                      Go
                    </button>
                  ) : (
                    <a href={i.link} target={i.link.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={`${btn} !py-[5px] flex-none no-underline`}>
                      Open
                    </a>
                  ))}
                {data.canEdit && i.group === 'Added' && (
                  <button type="button" aria-label={`Remove ${i.text}`} className="p-0 border-0 bg-transparent cursor-pointer text-[#8a917f]" onClick={() => void save(data.items.filter((x) => x.id !== i.id))}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {data.canEdit && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding.trim()) return;
            void save([...data.items, { id: crypto.randomUUID().slice(0, 12), text: adding.trim(), link: '', group: 'Added', done: false, doneAt: '', doneBy: '' }]);
            setAdding('');
          }}
        >
          <input value={adding} maxLength={200} onChange={(e) => setAdding(e.target.value)} placeholder="Add a to-do" aria-label="Add a to-do" className={input} />
          <button type="submit" className={btn} disabled={!adding.trim()}>
            Add
          </button>
        </form>
      )}
      <button type="button" className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#5f6a58]" onClick={() => setShowDone((x) => !x)}>
        {showDone ? 'Hide done' : `Show done (${data.items.length - left.length})`}
      </button>
      {problem && <Problem text={problem} />}
    </section>
  );
}

/**
 * Sales targets: a profit goal a month (e.g. $4,000), reached over a few months. Each month's profit target
 * climbs evenly to the goal; the weddings needed come from the running costs and what each sale leaves.
 */
function Targets({ data, tax, setTax, onSave, running, each }: { data: CompanyMoney; tax: CompanyMoney['tax']; setTax: (t: CompanyMoney['tax']) => void; onSave: () => void; running: number; each: number }) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const from = tax.targetFrom || thisMonth;
  const goal = tax.targetProfitCents;
  const steps = Math.max(1, tax.targetMonths);
  const monthsOut = (ym: string) => {
    const [y, m] = from.split('-').map(Number) as [number, number];
    const [y2, m2] = ym.split('-').map(Number) as [number, number];
    return (y2 - y) * 12 + (m2 - m);
  };
  const addMonths = (k: number) => {
    const [y, m] = from.split('-').map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    return d.toISOString().slice(0, 7);
  };
  // The climb: month 1 is 1/steps of the goal, month `steps` is the goal, and it stays there.
  const targetFor = (k: number) => Math.round((goal * Math.min(steps, Math.max(1, k + 1))) / steps);
  const needFor = (profit: number) => (each > 0 ? Math.ceil((profit + running) / each) : 0);
  const plan = Array.from({ length: steps + 1 }, (_, k) => ({ ym: addMonths(k), profit: targetFor(k), weddings: needFor(targetFor(k)) }));
  const now = data.months.find((m) => m.month === thisMonth);
  const k = monthsOut(thisMonth);
  const target = k < 0 ? 0 : targetFor(k);
  const day = new Date().getUTCDate();
  const daysIn = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).getUTCDate();
  const pace = now ? Math.round((now.profit / Math.max(1, day)) * daysIn) : 0;
  const pct = target > 0 && now ? Math.max(0, Math.min(100, (now.profit / target) * 100)) : 0;
  const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <section className={card} aria-label="Sales targets">
      <H sub="Your profit goal a month (after running costs, before tax), and how fast to get there. The weddings needed come from your prices and running costs.">Sales targets</H>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
          Profit goal a month ($)
          <input type="number" min={0} step={100} value={goal / 100} onChange={(e) => setTax({ ...tax, targetProfitCents: Math.round((Number(e.target.value) || 0) * 100) })} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
          Reached after (months)
          <input type="number" min={1} max={24} value={steps} onChange={(e) => setTax({ ...tax, targetMonths: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-[#5f6a58]">
          Starting
          <input type="month" value={from} onChange={(e) => setTax({ ...tax, targetFrom: e.target.value })} className={input} />
        </label>
      </div>
      {k >= 0 && (
        <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-[#f3f4ef]">
          <div className="flex justify-between gap-3 flex-wrap text-[15px]">
            <strong>{label(thisMonth)}: {money(now?.profit ?? 0)} of {money(target)}</strong>
            <span className={pace >= target ? 'text-[#2f6b3a] font-semibold' : 'text-[#9a3b2a] font-semibold'}>{pace >= target ? 'On pace' : `On pace for ${money(pace)}`}</span>
          </div>
          <div className="h-[10px] rounded-full bg-[#e4e6df] overflow-hidden">
            <div className="h-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#2f6b3a' : '#c8a46a' }} />
          </div>
          <span className="text-[13px] text-[#5f6a58]">
            {now?.sales ?? 0} weddings sold this month · {needFor(target)} needed · {Math.max(0, needFor(target) - (now?.sales ?? 0))} to go
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[14px] border-collapse">
          <thead>
            <tr className="text-left text-[#5f6a58]">
              <th className="py-2 pr-3 font-semibold">Month</th>
              <th className="py-2 pr-3 font-semibold">Profit target</th>
              <th className="py-2 pr-3 font-semibold">Weddings needed</th>
              <th className="py-2 pr-3 font-semibold">About a week</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((p) => (
              <tr key={p.ym} className={`border-t border-[#e4e6df] ${p.ym === thisMonth ? 'font-semibold' : ''}`}>
                <td className="py-2 pr-3">{label(p.ym)}</td>
                <td className="py-2 pr-3">{money(p.profit)}</td>
                <td className="py-2 pr-3">{p.weddings}</td>
                <td className="py-2 pr-3">{Math.ceil(p.weddings / 4.3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[13px] text-[#5f6a58]">
        At {money(Math.round(each))} kept per sale and {money(running)} running costs a month, {money(goal)} a month means about {needFor(goal)} paying weddings a month, roughly {Math.ceil(needFor(goal) / 4.3)} a week.
      </p>
      <button type="button" className={`${primary} self-start`} onClick={onSave}>
        Save targets
      </button>
    </section>
  );
}

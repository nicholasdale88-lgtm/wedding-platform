import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

/**
 * The front page (/): what the app is, the plans, and signing up (or in). Written plainly, the way a
 * couple would explain it to a friend. The name is in one place (BRAND) so it can change with the domain;
 * the prices are in PLANS.
 */
export const BRAND = 'VentralP';

type PlanKey = 'free' | 'essentials' | 'complete';
const PLANS: { key: PlanKey; name: string; price: string; note: string; items: string[]; pick?: boolean }[] = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    note: 'To get started',
    items: ['Your invitation and RSVP page', 'Up to 50 guests', 'Replies, numbers and dietary needs', 'Share the links yourself'],
  },
  {
    key: 'essentials',
    name: 'Essentials',
    price: '$149',
    note: 'One payment, for your whole wedding',
    pick: true,
    items: ['As many guests as you like', 'Invitations and reminders by text (texts at cost, about 2c each)', 'Seating plan, with saved versions', 'Budget, payments and checklist', 'Vendors and quote comparisons', 'A guide for every guest the night before'],
  },
  {
    key: 'complete',
    name: 'Complete',
    price: '$249',
    note: 'One payment, for your whole wedding',
    items: ['Everything in Essentials', 'Guests’ photos by QR code on each table', 'Live photo wall at the reception', 'Wedding party sign-ins (run sheet, to-dos, speeches)', 'Daily backups to your Google Drive, Dropbox or OneDrive', 'Help from a real person'],
  },
];

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";
const field = 'w-full py-[11px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px]';

const WHAT: [string, string][] = [
  ['Invitations by text', 'Every guest gets a text with their own invitation. They tap yes or no, add how many are coming and anything they can’t eat, and it’s in your list. If they don’t answer, a reminder goes out for you.'],
  ['Guest questions, answered', 'When someone texts “what time does it start?” or “Sam’s vegetarian”, it answers from what you’ve already written, and notes the dietary need against the right person. Anything else comes to you.'],
  ['Seating', 'Lay out the room, drag people to tables, and keep a few versions until you settle on one. When you publish it, each guest can see their table.'],
  ['The planning', 'A budget that works per guest, payments with due dates, a checklist counted back from your date, and quotes from vendors side by side.'],
  ['Photos', 'Put the QR code on each table. Guests take photos with your frames and they go straight into your own Google Drive, Dropbox or OneDrive.'],
  ['Your wedding party', 'Bridesmaids and groomsmen get their own sign-in with the run sheet and their jobs, and nothing you haven’t shared.'],
];

const FAQ: [string, string][] = [
  ['Do guests need to download anything?', 'No. They get a text with a link. No app, no account, no password.'],
  ['Is it a subscription?', 'No. You pay once for your wedding, and start free until you’re ready to send invitations.'],
  ['Who can see our guest list?', 'Only the two of you and anyone you invite to help. Each wedding is kept separate, and we never share or sell your data.'],
  ['What if we have a welcome drinks or a recovery brunch too?', 'Add them as extra events. Guests are invited to the ones you pick and reply to each.'],
  ['What happens to our photos and files afterwards?', 'If you connect your own Drive, Dropbox or OneDrive, they’re already there, in folders. You can also download everything at any time.'],
];

export function SalesPage() {
  const [plan, setPlan] = useState<PlanKey>('essentials');
  useEffect(() => {
    document.title = `${BRAND} · Wedding invitations by text, and the planning`;
  }, []);
  const choose = (k: PlanKey) => {
    setPlan(k);
    document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="min-h-screen bg-[#f6f0e2]" style={{ color: INK, fontFamily: sans }}>
      <header className="max-w-[1100px] mx-auto px-4 py-4 flex justify-between items-center gap-3">
        <span className="text-[26px]" style={{ fontFamily: serif }}>
          {BRAND}
        </span>
        <nav className="flex items-center gap-4 text-[15px]">
          <a href="#pricing" className="no-underline hidden sm:inline" style={{ color: INK }}>
            Pricing
          </a>
          <Link to="/admin" className="no-underline" style={{ color: INK }}>
            Sign in
          </Link>
          <a href="#start" className="py-[9px] px-4 rounded-full no-underline text-[15px]" style={{ background: INK, color: '#fbf8f2' }}>
            Start free
          </a>
        </nav>
      </header>

      <main>
        <section className="max-w-[1100px] mx-auto px-4 pt-8 pb-14 grid gap-10 md:grid-cols-[1.2fr_1fr] items-center">
          <div className="flex flex-col gap-5">
            <h1 className="m-0 text-[clamp(38px,6.5vw,62px)] leading-[1.05] font-normal" style={{ fontFamily: serif }}>
              Wedding invitations by text, and the rest of the planning in one place.
            </h1>
            <p className="m-0 text-[18px] leading-[1.6] max-w-[540px]" style={{ color: SOFT }}>
              We started building this for our own wedding, when the spreadsheet of who’d replied, who was vegetarian and who sat where got out of hand. Now it does the chasing for us. It can for you too.
            </p>
            <div className="flex gap-3 flex-wrap items-center pt-1">
              <a href="#start" className="py-[14px] px-7 rounded-full no-underline text-[16px] font-medium" style={{ background: INK, color: '#fbf8f2' }}>
                Start free
              </a>
              <span className="text-[14px]" style={{ color: SOFT }}>
                No card needed. Pay once when you’re ready.
              </span>
            </div>
          </div>
          <div aria-hidden className="mx-auto w-[270px] rounded-[38px] p-3 shadow-[0_24px_50px_rgba(51,64,47,.22)]" style={{ background: INK }}>
            <div className="rounded-[28px] bg-[#fbf8f2] px-4 py-6 flex flex-col gap-3 text-[14px]">
              <span className="text-[12px] text-center" style={{ color: SOFT }}>
                Today 6:42pm
              </span>
              <span className="self-start max-w-[85%] py-2 px-3 rounded-[16px] rounded-bl-[4px] bg-[#e9e3d3]">Hi Jo, Alex and Sam would love you at their wedding on Saturday 14 March. Your invitation: alexandsam.wedding/jo</span>
              <span className="self-end max-w-[85%] py-2 px-3 rounded-[16px] rounded-br-[4px] text-[#fbf8f2]" style={{ background: INK }}>
                Yes! Both of us. Sam’s vegetarian
              </span>
              <span className="self-start max-w-[85%] py-2 px-3 rounded-[16px] rounded-bl-[4px] bg-[#e9e3d3]">Wonderful, Jo! You’re both down as coming. We’ve noted vegetarian for Sam.</span>
            </div>
          </div>
        </section>

        <section className="bg-[#fbf8f2] py-14">
          <div className="max-w-[1000px] mx-auto px-4 flex flex-col gap-8">
            <h2 className="m-0 text-[clamp(30px,5vw,42px)] font-normal" style={{ fontFamily: serif }}>
              What it does
            </h2>
            <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
              {WHAT.map(([t, d]) => (
                <div key={t} className="flex flex-col gap-1">
                  <h3 className="m-0 text-[18px] font-semibold">{t}</h3>
                  <p className="m-0 text-[15px] leading-[1.6]" style={{ color: SOFT }}>
                    {d}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-16">
          <div className="max-w-[1100px] mx-auto px-4 flex flex-col gap-8">
            <div className="text-center flex flex-col gap-2">
              <h2 className="m-0 text-[clamp(30px,5vw,42px)] font-normal" style={{ fontFamily: serif }}>
                Pricing
              </h2>
              <p className="m-0 text-[16px]" style={{ color: SOFT }}>
                In Australian dollars, GST included. One payment per wedding, not a subscription.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3 items-stretch">
              {PLANS.map((p) => (
                <article key={p.key} className="flex flex-col gap-4 p-6 rounded-[20px] bg-white" style={{ border: `${p.pick ? 2 : 1}px solid ${p.pick ? INK : '#e2d7bc'}` }}>
                  <div className="flex justify-between items-baseline gap-2">
                    <h3 className="m-0 text-[20px] font-semibold">{p.name}</h3>
                    {p.pick && (
                      <span className="text-[12px] py-[3px] px-2 rounded-full" style={{ background: '#e6ecd8' }}>
                        Most couples pick this
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[44px] leading-none" style={{ fontFamily: serif }}>
                      {p.price}
                    </span>
                    <span className="block text-[13px] mt-1" style={{ color: SOFT }}>
                      {p.note}
                    </span>
                  </div>
                  <ul className="m-0 pl-5 flex flex-col gap-2 text-[15px] leading-[1.45] flex-1">
                    {p.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => choose(p.key)} className="py-3 rounded-full text-[15px] font-medium cursor-pointer" style={p.pick ? { background: INK, color: '#fbf8f2', border: 0 } : { background: 'transparent', color: INK, border: `1px solid ${INK}` }}>
                    {p.key === 'free' ? 'Start free' : `Choose ${p.name}`}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="start" className="bg-[#efe7d3] py-16 px-4">
          <SignUp plan={plan} setPlan={setPlan} />
        </section>

        <section className="py-16">
          <div className="max-w-[760px] mx-auto px-4 flex flex-col gap-3">
            <h2 className="m-0 text-[clamp(30px,5vw,42px)] font-normal" style={{ fontFamily: serif }}>
              Questions
            </h2>
            {FAQ.map(([q, a]) => (
              <details key={q} className="py-3 border-b border-[#e2d7bc]">
                <summary className="cursor-pointer text-[16px] font-semibold">{q}</summary>
                <p className="m-0 mt-2 text-[15px] leading-[1.6]" style={{ color: SOFT }}>
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e2d7bc] py-6 px-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px]" style={{ color: SOFT }}>
        <span>
          © {new Date().getFullYear()} {BRAND}. Made in Australia.
        </span>
        <Link to="/admin" style={{ color: SOFT }}>
          Sign in
        </Link>
      </footer>
    </div>
  );
}

/** Sign up: the two names, an email and passcode, the date if they have it, and the plan. */
function SignUp({ plan, setPlan }: { plan: PlanKey; setPlan: (p: PlanKey) => void }) {
  const [f, setF] = useState({ firstName: '', partnerName: '', email: '', passcode: '', date: '', marketing: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string; checked?: boolean; type?: string } }) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? !!e.target.checked : e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem('');
    if (f.passcode.length < 8) return setProblem('Use at least 8 characters for your passcode.');
    setBusy(true);
    try {
      const r = await api.signup({ ...f, plan });
      window.location.assign(`/admin/${encodeURIComponent(r.weddingId)}`);
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-[560px] mx-auto flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-[clamp(30px,5vw,42px)] font-normal" style={{ fontFamily: serif }}>
          Start your wedding
        </h2>
        <p className="m-0 mt-1 text-[15px]" style={{ color: SOFT }}>
          Takes a minute. You can change everything later.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[14px]">
          Your first name
          <input required value={f.firstName} onChange={set('firstName')} autoComplete="given-name" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          Your partner’s first name
          <input required value={f.partnerName} onChange={set('partnerName')} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[14px]">
        Email
        <input required type="email" value={f.email} onChange={set('email')} autoComplete="email" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[14px]">
        Choose a passcode (8 characters or more)
        <input required type="password" minLength={8} value={f.passcode} onChange={set('passcode')} autoComplete="new-password" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[14px]">
        Wedding date (if you have one)
        <input type="date" value={f.date} onChange={set('date')} className={field} />
      </label>
      <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
        <legend className="text-[14px] mb-1">Plan</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PLANS.map((p) => (
            <label key={p.key} className="flex items-center gap-2 py-2 px-3 rounded-[10px] bg-white border cursor-pointer text-[14px]" style={{ borderColor: plan === p.key ? INK : '#d3c6a4' }}>
              <input type="radio" name="plan" checked={plan === p.key} onChange={() => setPlan(p.key)} className="accent-[#33402f]" />
              {p.name} · {p.price}
            </label>
          ))}
        </div>
        <span className="text-[13px]" style={{ color: SOFT }}>
          {plan === 'free' ? 'Free to use. Upgrade any time.' : 'You won’t be charged now: you pay once, when you’re ready to send your invitations.'}
        </span>
      </fieldset>
      {/* Left empty by people (hidden); bots fill it in. */}
      <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={f.website} onChange={set('website')} name="website" className="absolute left-[-9999px] w-px h-px opacity-0" />
      <label className="flex items-start gap-2 text-[14px] cursor-pointer">
        <input type="checkbox" checked={f.marketing} onChange={set('marketing')} className="mt-[3px] w-[16px] h-[16px] accent-[#33402f]" />
        Send me the odd planning tip by email. No spam, and you can stop any time.
      </label>
      {problem && (
        <p role="alert" className="m-0 text-[15px] text-[#7a4a37]">
          {problem}{' '}
          {/already an account/i.test(problem) && (
            <Link to="/admin" className="!text-[#7a4a37]">
              Sign in
            </Link>
          )}
        </p>
      )}
      <button type="submit" disabled={busy} className="py-4 rounded-full border-0 text-[17px] font-medium cursor-pointer disabled:opacity-60" style={{ background: INK, color: '#fbf8f2' }}>
        {busy ? 'Setting up your wedding…' : 'Create our wedding'}
      </button>
      <span className="text-[13px] text-center" style={{ color: SOFT }}>
        Already have one?{' '}
        <Link to="/admin" style={{ color: INK }}>
          Sign in
        </Link>
      </span>
    </form>
  );
}

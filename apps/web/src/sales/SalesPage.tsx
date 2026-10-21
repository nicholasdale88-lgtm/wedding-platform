import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { allows, EVENT_ADDON, EVENTS_INCLUDED, FEATURE_LABEL, FREE_GUEST_LIMIT, PLAN_INFO, type Feature } from '@wp/shared';
import { api } from '../lib/api';
import { DriveArt, FEATURE_ICONS, Wordmark } from './Art';

/**
 * The front page (/): what the app is, the plans, and signing up (or in). Written plainly, the way a
 * couple would explain it to a friend. The name is in one place (BRAND) so it can change with the domain;
 * the prices come from the shared plans (PLAN_INFO), the same ones the app enforces.
 */
export const BRAND = 'The Yes List';

type PlanKey = 'free' | 'essentials' | 'complete';
const PLANS: { key: PlanKey; name: string; price: string; note: string; items: string[]; pick?: boolean; extra?: string }[] = [
  {
    key: 'free',
    name: PLAN_INFO.free.name,
    price: PLAN_INFO.free.price,
    note: 'To get started',
    items: ['Your invitation and RSVP page', `Up to ${FREE_GUEST_LIMIT} guests`, 'Replies, numbers and dietary needs', 'Share the links yourself'],
  },
  {
    key: 'essentials',
    name: PLAN_INFO.essentials.name,
    price: PLAN_INFO.essentials.price,
    note: 'One payment, for your whole wedding',
    pick: true,
    items: ['As many guests as you like', 'Invitations and reminders by text (texts at cost, about 2c each)', 'Seating plan, with saved versions', 'Budget, payments and checklist', 'Vendors and quote comparisons', 'A guide for every guest the night before'],
  },
  {
    key: 'complete',
    name: PLAN_INFO.complete.name,
    price: PLAN_INFO.complete.price,
    note: 'One payment, for your whole wedding',
    // What the difference buys, worked out from the shared prices below (deluxeExtra).
    extra: 'guests’ photos by QR code, the live photo wall, wedding party sign-ins and daily backups.',
    items: ['Everything in Essentials', `${EVENTS_INCLUDED.complete} events (a welcome drinks or a recovery brunch too)`, 'Guests’ photos by QR code on each table', 'Live photo wall at the reception', 'Wedding party sign-ins (run sheet, to-dos, speeches)', 'Daily backups to your Google Drive, Dropbox or OneDrive', 'Help from a real person'],
  },
];

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";
const field = 'w-full py-[11px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px]';

/** The three big reasons couples choose it: what it does for them (the headline), then how. */
const BIG: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: 'Replies chase themselves',
    text: 'Every guest gets their own invitation by text. They tap yes or no, say who’s coming and what they can’t eat, and it’s in your list. Anyone who hasn’t answered gets a gentle reminder, without you lifting a finger.',
    icon: FEATURE_ICONS[0],
  },
  {
    title: 'Every dietary need on the right plate',
    text: 'Add the caterer’s special menus and give them to everyone who needs one in a tap: vegan and coeliac gets the menu marked both. Anything not marked safe is flagged, and the caterer gets one clear list.',
    icon: FEATURE_ICONS[2],
  },
  {
    title: 'Seating done in a second',
    text: 'Tell it your rules: couples together, families together, the wedding party at the head table, and the two who mustn’t sit together kept apart. Auto-seat fills every table at once; change anything by dragging.',
    icon: FEATURE_ICONS[3],
  },
];

/** A small round badge for the grid items that don't have a drawn icon. */
const badge = (emoji: string) => (
  <span aria-hidden className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-[20px] bg-[#eef1e4]">
    {emoji}
  </span>
);

/** And the rest, one line each. */
const MORE: { text: string; icon: ReactNode }[] = [
  { text: 'Questions guests text in are answered from what you’ve already written', icon: FEATURE_ICONS[1] },
  { text: 'Every deposit and balance in one schedule, with a nudge before it’s due', icon: FEATURE_ICONS[4] },
  { text: 'A wax-sealed envelope that opens on their phone, with your music and photos', icon: FEATURE_ICONS[5] },
  { text: 'Your wedding party gets their own sign-in: run sheet, jobs and timings', icon: FEATURE_ICONS[6] },
  { text: 'Guests’ photos by QR code, straight into your own Drive', icon: FEATURE_ICONS[7] },
  { text: 'A vendor directory near your venue', icon: badge('📍') },
  { text: 'Step-by-step video help on every page', icon: badge('▶️') },
];

/** "$35" → 35 (NaN when it isn't a price). */
const dollars = (price: string) => Number(price.replace(/[^0-9.]/g, ''));
/** How much more Deluxe is than Essentials, from the shared prices (so it can't drift). */
const deluxeExtra = (() => {
  const d = dollars(PLAN_INFO.complete.price) - dollars(PLAN_INFO.essentials.price);
  return Number.isFinite(d) && d > 0 ? `$${Number.isInteger(d) ? d : d.toFixed(2)} more` : 'A little more';
})();

/** The four highlights under the headline. */
const HIGHLIGHTS = ['Replies by text, on autopilot', 'Dietary needs sorted to menus', 'Seating that follows your rules', 'Photos straight to your Drive'];

/** What couples bring, and what it usually costs on top of their plan (AUD). */
const BYO: { what: string; cost: string; detail: string; good: string }[] = [
  {
    what: 'Your Google Drive or OneDrive',
    cost: 'Usually free',
    detail: 'Connect it once and everything is filed there for you: every guest photo (a folder per event), quotes and contracts, signs, and a backup every day.',
    good: 'They’re yours forever, not locked in an app. Google gives 15 GB free (shared with Gmail), which most weddings fit in; OneDrive 5 GB. Need more? From about $3 a month. Got Gmail or Outlook? You already have one.',
  },
  {
    what: 'Texts to your guests',
    cost: 'About 2c each',
    detail: 'Invitations, reminders, answers and the night-before guide go by text, at cost. You see how many and what it costs before anything is sent.',
    good: 'A 120-guest wedding usually spends under $15 on every text, start to finish. Rather not text? Share each guest’s link yourself, for nothing.',
  },
  {
    what: 'Your own mobile',
    cost: 'Already in your pocket',
    detail: 'Replies that need you are sent on to your phone, and you can send yourself a test of any text first.',
    good: 'No new number, no app to install.',
  },
];


/** Every feature that differs between plans, for the comparison table (what the server checks, so it can't drift). */
const COMPARE: Feature[] = ['unlimitedGuests', 'texts', 'seating', 'planner', 'extraEvent', 'photoQr', 'partySignIns', 'dailyBackups'];

const FAQ: [string, string][] = [
  ['Can we start on Free and upgrade later?', 'Yes. Everything you’ve set up stays: upgrading just switches on the rest.'],
  ['What do texts cost?', 'Texts are at cost, about 2c each, on top of your plan. Before anything is sent you see how many it goes to and what it costs.'],
  ['Do guests need to download anything?', 'No. They get a text with a link. No app, no account, no password.'],
  ['Is it a subscription?', 'No. You pay once for your wedding, and start free until you’re ready to send invitations.'],
  ['Who can see our guest list?', 'Only the two of you and anyone you invite to help. Each wedding is kept separate, and we never share or sell your data.'],
  ['What if we have a welcome drinks or a recovery brunch too?', 'Add them as extra events. Guests are invited to the ones you pick and reply to each.'],
  ['What happens to our photos and files afterwards?', 'If you connect your own Drive, Dropbox or OneDrive, they’re already there, in folders. You can also download everything at any time.'],
];

export function SalesPage() {
  const [plan, setPlan] = useState<PlanKey>('essentials');
  useEffect(() => {
    document.title = `${BRAND} · Your guests reply by text. You stop chasing.`;
    // Arriving from another page with #start or #pricing (e.g. the sample invitation's "Start free").
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);
  const choose = (k: PlanKey) => {
    setPlan(k);
    document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="min-h-screen bg-[#f6f0e2]" style={{ color: INK, fontFamily: sans }}>
      <header className="max-w-[1100px] mx-auto px-4 py-4 flex justify-between items-center gap-3">
        <span aria-label={BRAND}>
          <Wordmark size={24} />
        </span>
        <nav className="flex items-center gap-4 text-[15px]">
          <a href="#pricing" className="no-underline hidden sm:inline" style={{ color: INK }}>
            Pricing
          </a>
          <Link to="/vendors" className="no-underline hidden sm:inline" style={{ color: INK }}>
            Vendor directory
          </Link>
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
              Your guests reply by text. You stop chasing.
            </h1>
            <p className="m-0 text-[18px] leading-[1.6] max-w-[540px]" style={{ color: SOFT }}>
              We started building this for our own wedding, when the spreadsheet of who’d replied, who was vegetarian and who sat where got out of hand. Now it does the chasing for us. It can for you too.
            </p>
            <div className="flex gap-3 flex-wrap items-center pt-1">
              <a href="#start" className="py-[14px] px-7 rounded-full no-underline text-[16px] font-medium" style={{ background: INK, color: '#fbf8f2' }}>
                Start free
              </a>
              <Link to="/demo" className="py-[13px] px-6 rounded-full no-underline text-[16px]" style={{ color: INK, border: `1px solid ${INK}` }}>
                See a sample invitation
              </Link>
            </div>
            <span className="text-[14px] -mt-2" style={{ color: SOFT }}>
              No card needed. Pay once when you’re ready.
            </span>
            <ul aria-label="Highlights" className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              {HIGHLIGHTS.map((h) => (
                <li key={h} className="flex items-center gap-2 text-[15px]">
                  <span aria-hidden className="w-5 h-5 rounded-full flex items-center justify-center text-[12px] shrink-0" style={{ background: '#e6ecd8', color: INK }}>
                    ✓
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden className="mx-auto w-[270px] rounded-[38px] p-3 shadow-[0_24px_50px_rgba(51,64,47,.22)]" style={{ background: INK }}>
            <div className="rounded-[28px] bg-[#fbf8f2] px-4 py-6 flex flex-col gap-3 text-[14px]">
              <span className="text-[12px] text-center" style={{ color: SOFT }}>
                Today 6:42pm
              </span>
              <span className="self-start max-w-[85%] py-2 px-3 rounded-[16px] rounded-bl-[4px] bg-[#e9e3d3]">
                Hi Jo, Alex and Sam would love you at their wedding on Saturday 13 March. Your invitation:{' '}
                <span className="underline underline-offset-2" style={{ color: '#2f5f8a' }}>
                  tap here
                </span>
              </span>
              <span className="self-end max-w-[85%] py-2 px-3 rounded-[16px] rounded-br-[4px] text-[#fbf8f2]" style={{ background: INK }}>
                Yes! Both of us. Sam’s vegetarian
              </span>
              <span className="self-start max-w-[85%] py-2 px-3 rounded-[16px] rounded-bl-[4px] bg-[#e9e3d3]">Wonderful, Jo! You’re both down as coming. We’ve noted vegetarian for Sam.</span>
            </div>
          </div>
        </section>

        <section className="bg-[#fbf8f2] py-14">
          <div className="max-w-[1000px] mx-auto px-4 flex flex-col gap-10">
            <div className="flex flex-col gap-2">
              <h2 className="m-0 text-[clamp(30px,5vw,42px)] font-normal" style={{ fontFamily: serif }}>
                Why couples choose it
              </h2>
              <p className="m-0 text-[16px] max-w-[640px]" style={{ color: SOFT }}>
                The jobs that eat your evenings, done for you: from the first invitation to the last photo.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {BIG.map((b) => (
                <article key={b.title} className="flex flex-col gap-3">
                  <span className="shrink-0 [&>svg]:w-[56px] [&>svg]:h-[56px]">{b.icon}</span>
                  <h3 className="m-0 text-[26px] leading-[1.15] font-normal" style={{ fontFamily: serif }}>
                    {b.title}
                  </h3>
                  <p className="m-0 text-[16px] leading-[1.6]" style={{ color: SOFT }}>
                    {b.text}
                  </p>
                </article>
              ))}
            </div>
            <div className="flex flex-col gap-4 pt-2">
              <h3 className="m-0 text-[18px] font-semibold">And the rest of it</h3>
              <ul className="m-0 p-0 list-none grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {MORE.map((m) => (
                  <li key={m.text} className="flex items-center gap-3 text-[15px] leading-[1.45]">
                    <span className="shrink-0">{m.icon}</span>
                    {m.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="founders" className="py-14">
          <figure className="max-w-[720px] mx-auto px-4 m-0 flex flex-col gap-4">
            <h2 id="founders" className="m-0 text-[clamp(26px,4vw,34px)] font-normal" style={{ fontFamily: serif }}>
              Built for our own wedding
            </h2>
            <blockquote className="m-0 pl-5 border-l-[3px] border-[#c8a46a] text-[clamp(21px,3.2vw,26px)] leading-[1.45] italic" style={{ fontFamily: serif }}>
              “Our guest list lived in a spreadsheet, the replies came in by text, email and word of mouth, and every evening went on
              chasing the people who hadn’t answered. So we made the thing we wanted: one link each, replies by text, and the list keeps itself.”
            </blockquote>
            <figcaption className="pl-5 flex flex-col gap-1 text-[15px]" style={{ color: SOFT }}>
              <span>The founders</span>
              <span className="font-medium" style={{ color: INK }}>
                Used for our own wedding, November 2027
              </span>
            </figcaption>
          </figure>
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
                  {p.extra && (
                    <p className="m-0 py-2 px-3 rounded-[10px] text-[14px] leading-[1.5] bg-[#f3eedf]">
                      <strong className="font-semibold">For {deluxeExtra} than {PLAN_INFO.essentials.name}:</strong> {p.extra}
                    </p>
                  )}
                  <button type="button" onClick={() => choose(p.key)} className="py-3 rounded-full text-[15px] font-medium cursor-pointer" style={p.pick ? { background: INK, color: '#fbf8f2', border: 0 } : { background: 'transparent', color: INK, border: `1px solid ${INK}` }}>
                    {p.key === 'free' ? 'Start free' : `Choose ${p.name}`}
                  </button>
                </article>
              ))}
            </div>
            <div className="flex flex-col gap-2 p-5 rounded-[16px] border border-[#e2d7bc] bg-white text-[15px]">
              <strong className="font-semibold">Add-ons</strong>
              <span>
                {EVENT_ADDON.name}: <strong className="font-semibold">{EVENT_ADDON.price}</strong> each, for a welcome drinks, a rehearsal dinner or a recovery brunch beyond what your plan includes.
              </span>
              <span>Texts: at cost, about 2c each. You see the cost before anything is sent.</span>
            </div>
            <details className="rounded-[16px] border border-[#e2d7bc] bg-white">
              <summary className="cursor-pointer py-4 px-5 text-[15px] font-semibold">Compare every feature</summary>
              <div className="overflow-x-auto px-5 pb-5">
                <table className="w-full text-[14px] border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left py-2 pr-3 font-semibold">Feature</th>
                      {PLANS.map((p) => (
                        <th key={p.key} className="py-2 px-2 font-semibold text-center whitespace-nowrap">
                          {p.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[#ece3cc]">
                      <td className="py-2 pr-3">Your invitation, RSVP page and guest list</td>
                      {PLANS.map((p) => (
                        <td key={p.key} className="py-2 px-2 text-center" aria-label={`${p.name}: included`}>
                          ✓
                        </td>
                      ))}
                    </tr>
                    {COMPARE.map((f) => (
                      <tr key={f} className="border-t border-[#ece3cc]">
                        <td className="py-2 pr-3">{FEATURE_LABEL[f]}</td>
                        {PLANS.map((p) => (
                          <td key={p.key} className="py-2 px-2 text-center" aria-label={`${p.name}: ${allows(p.key, f) ? 'included' : 'not included'}`} style={{ color: allows(p.key, f) ? INK : '#b9ae94' }}>
                            {allows(p.key, f) ? '✓' : '–'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>

        <section aria-labelledby="byo" className="bg-[#fbf8f2] py-16">
          <div className="max-w-[1100px] mx-auto px-4 flex flex-col gap-8">
            <div className="text-center flex flex-col gap-2">
              <h2 id="byo" className="m-0 text-[clamp(30px,5vw,42px)] font-normal" style={{ fontFamily: serif }}>
                What you bring, and what it costs
              </h2>
              <p className="m-0 text-[16px] max-w-[680px] mx-auto" style={{ color: SOFT }}>
                Nothing hidden. Most couples spend nothing extra on storage and under $15 on texts for the whole wedding.
              </p>
            </div>
            <div className="flex justify-center">
              <DriveArt />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {BYO.map((b) => (
                <article key={b.what} className="flex flex-col gap-3 p-6 rounded-[20px] bg-white border border-[#e2d7bc]">
                  <h3 className="m-0 text-[19px] font-semibold">{b.what}</h3>
                  <span className="text-[28px] leading-none" style={{ fontFamily: serif }}>
                    {b.cost}
                  </span>
                  <p className="m-0 text-[15px] leading-[1.55]">{b.detail}</p>
                  <p className="m-0 text-[14px] leading-[1.55]" style={{ color: SOFT }}>
                    {b.good}
                  </p>
                </article>
              ))}
            </div>
            <p className="m-0 text-center text-[15px]" style={{ color: SOFT }}>
              Not needed: an app for your guests, a printer, a website builder or a separate RSVP service.
            </p>
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
        <Link to="/vendors" style={{ color: SOFT }}>
          Vendor directory
        </Link>
        <Link to="/vendors/join" style={{ color: SOFT }}>
          Wedding vendor? List your business free
        </Link>
        <Link to="/privacy" style={{ color: SOFT }}>
          Privacy
        </Link>
        <Link to="/terms" style={{ color: SOFT }}>
          Terms
        </Link>
        <Link to="/contact" style={{ color: SOFT }}>
          Contact
        </Link>
      </footer>
    </div>
  );
}

/** Sign up: the two names, an email and passcode, the date if they have it, and the plan. */
function SignUp({ plan, setPlan }: { plan: PlanKey; setPlan: (p: PlanKey) => void }) {
  const [f, setF] = useState({ firstName: '', partnerName: '', email: '', passcode: '', date: '', guests: '', marketing: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string; checked?: boolean; type?: string } }) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? !!e.target.checked : e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem('');
    if (f.passcode.length < 8) return setProblem('Use at least 8 characters for your passcode.');
    setBusy(true);
    try {
      const r = await api.signup({ ...f, guests: Math.max(0, Math.min(3000, Math.round(Number(f.guests) || 0))), plan });
      // Their own invitation first (with their names), then "Make it yours" takes them into the admin.
      const slug = r.weddings.find((x) => x.id === r.weddingId)?.slug;
      window.location.assign(slug ? `/w/${encodeURIComponent(slug)}/?preview=1&welcome=1` : `/admin/${encodeURIComponent(r.weddingId)}`);
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
      <label className="flex flex-col gap-1 text-[14px]">
        About how many guests? (a guess is fine)
        <input type="number" inputMode="numeric" min={0} max={3000} value={f.guests} onChange={set('guests')} placeholder="e.g. 120" className={field} />
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

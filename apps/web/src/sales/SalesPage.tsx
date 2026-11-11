import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  allows,
  EVENT_ADDON,
  EVENTS_INCLUDED,
  FEATURE_LABEL,
  FREE_GUEST_LIMIT,
  PLAN_INFO,
  TEXT_COST_NOTE,
  TEXT_CREDIT_ALL_IN,
  TEXT_RATE,
  textCreditsCents,
  textCreditsForGuests,
  type Feature,
} from '@wp/shared';
import { api } from '../lib/api';
import { rememberRef, savedRef, useSite } from '../lib/site';
import { LogoMark, Wordmark } from './Art';
import { HeroInvite } from './HeroInvite';
import { TextThread } from './TextThread';
import { THEME_NAMES } from '../guest/themeKit';
import { PhoneFan, ShowcaseStyles } from './Showcase';

/**
 * The front page (/). Calm on purpose: one idea a section, few words, lots of room. The hero is the real
 * invitation (a sample wedding, see ./sample), then what happens after the yes, the plans, signing up and a
 * few questions. The name is in one place (BRAND) so it can change with the domain; the prices come from the
 * shared plans (PLAN_INFO) and the text price from the shared rate (TEXT_RATE), the same ones the app charges.
 */
export const BRAND = 'The Yes List';

type PlanKey = 'free' | 'essentials' | 'complete';

const INK = '#33402f';
const SOFT = '#5b6a52';
const GOLD = '#a9843f';
const CREAM = '#f6f0e2';
const PAPER = '#fbf8f2';
const THEME_COUNT = THEME_NAMES.length;
const serif = "'Playfair Display', Georgia, serif"; // our headings (the invitations keep their own lettering)
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";

/** "$50" → 50 (NaN when it isn't a price). */
const dollars = (price: string) => Number(price.replace(/[^0-9.]/g, ''));
/** The cheapest plan's price, from the shared plans (so it can't drift). */
const fromPrice = Object.values(PLAN_INFO).reduce((a, p) => (dollars(p.price) < dollars(a.price) ? p : a)).price;

/** The text price, all-in first (the service fee and GST included), as it must be shown. */
const TEXT_ALL_IN = `${TEXT_CREDIT_ALL_IN}c a credit, all-in`;
/** What texting a typical wedding costs, worked out from the shared rate. */
const TYPICAL_GUESTS = 120;
const typicalTexts = `$${(textCreditsCents(textCreditsForGuests(TYPICAL_GUESTS)) / 100).toFixed(2)}`;

const guestsLine = (k: PlanKey) => (allows(k, 'unlimitedGuests') ? 'As many guests as you like' : `Up to ${FREE_GUEST_LIMIT} guests`);
const TEXTS_LINE = 'Automatic text invitations and reminders (text credits extra)';
/** Texts are never part of a plan: the most they cost a guest's mobile, all-in (13 credits at 8c, every text sent). */
const TEXT_PER_GUEST = Math.round(TEXT_RATE.creditsPerGuest * TEXT_CREDIT_ALL_IN);
const TEXTS_PRICE_LINE = `Texts not included: up to ${TEXT_PER_GUEST >= 100 ? `$${(TEXT_PER_GUEST / 100).toFixed(2)}` : `${TEXT_PER_GUEST}c`} a guest, all-in, for every text`;

const PLANS: { key: PlanKey; note: string; items: string[]; pick?: boolean }[] = [
  {
    key: 'free',
    note: 'The invitation and the replies',
    items: ['Your invitation and RSVP page', guestsLine('free'), 'Replies, numbers and dietary needs in one list', 'Send it from your own email or phone, free'],
  },
  {
    key: 'essentials',
    note: 'The whole plan',
    pick: true,
    items: [`Everything in ${PLAN_INFO.free.name}`, guestsLine('essentials'), 'The seating plan', 'Budget, payments, checklist and vendors', TEXTS_LINE, TEXTS_PRICE_LINE],
  },
  {
    key: 'complete',
    note: 'Every event, every photo',
    items: [
      `Everything in ${PLAN_INFO.essentials.name}`,
      `${EVENTS_INCLUDED.complete} events, like a welcome drinks`,
      'Guests’ photos by QR code, and a live photo wall',
      'Wedding party sign-ins',
      'Daily backups to your own Drive',
      TEXTS_PRICE_LINE,
    ],
  },
];

/** Which plans can text guests automatically (from the shared plans): "Essentials and Deluxe". */
const textingPlans = PLANS.filter((p) => allows(p.key, 'texts'))
  .map((p) => PLAN_INFO[p.key].name)
  .join(' and ');

/** Every feature that differs between plans, for the comparison table (what the server checks, so it can't drift). */
const COMPARE: Feature[] = ['unlimitedGuests', 'texts', 'seating', 'planner', 'extraEvent', 'photoQr', 'partySignIns', 'dailyBackups'];
/** The table's own wording where the shared label could be misread (texts are never part of a plan). */
const ROW_LABEL: Partial<Record<Feature, string>> = { texts: TEXTS_LINE };

/** After the yes: three things it does for you, a line each. */
const AFTER: { title: string; text: string }[] = [
  { title: 'Replies chase themselves', text: 'Guests tap yes or no, say who’s coming and what they can’t eat. Anyone who hasn’t answered gets a gentle reminder.' },
  { title: 'Seating in a second', text: 'Set your rules: couples together, the two who mustn’t be. Auto-seat fills every table, and you drag to change anything.' },
  { title: 'Every meal on the right plate', text: 'Special menus go to everyone who needs one, and the caterer gets one clear list.' },
];

const FAQ: [string, string][] = [
  ['Is it a subscription?', 'No. Set everything up first, then pay once for your wedding when you’re ready to send your invitations. Nothing renews.'],
  [
    'Are text messages included?',
    `No, texts aren’t included in any plan. Sending from your own phone or by email is always free. If you’d like us to text your guests, you buy text credits separately at ${TEXT_ALL_IN} (GST included, no other fees), and you see the total before you pay.`,
  ],
  ['Can we move to a bigger plan later?', 'Yes. Everything you’ve set up stays, and you only pay the difference.'],
  ['Do guests need to download anything?', 'No. They open their own link: no app, no account, no password.'],
  ['Who can see our guest list?', 'Only the two of you and anyone you invite to help. Each wedding is kept separate, and we never share or sell your data.'],
];

export function SalesPage() {
  const [plan, setPlan] = useState<PlanKey>('essentials');
  const site = useSite();
  useEffect(() => {
    // Came from a wedding's "Made with" link or a post (?ref= / ?utm_source=): kept for sign-up.
    rememberRef();
    document.title = `${BRAND} · The wedding invitation they’ll actually open, and the whole plan, paid once`;
    // Arriving from another page with #start or #pricing (e.g. the sample invitation's "Make your own").
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);
  const choose = (k: PlanKey) => {
    setPlan(k);
    document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="min-h-screen" style={{ background: CREAM, color: INK, fontFamily: sans }}>
      <ShowcaseStyles />
      {site?.banner && (
        <div className="px-4 py-2 text-center text-[14px]" style={{ background: INK, color: PAPER }}>
          {site.banner.link ? (
            <a href={site.banner.link} className="!text-[#fbf8f2] underline underline-offset-2">
              {site.banner.text}
            </a>
          ) : (
            site.banner.text
          )}
        </div>
      )}

      <header className="max-w-[1100px] mx-auto px-4 py-5 flex justify-between items-center gap-3">
        <Link to="/" aria-label={BRAND} className="no-underline">
          <Wordmark size={22} />
        </Link>
        <nav className="flex items-center gap-5 text-[15px]">
          <a href="#pricing" className="no-underline hidden sm:inline" style={{ color: INK }}>
            Pricing
          </a>
          <Link to="/vendors" className="no-underline hidden sm:inline" style={{ color: INK }}>
            Vendor directory
          </Link>
          <Link to="/admin" className="no-underline" style={{ color: INK }}>
            Sign in
          </Link>
          <a href="#start" className="py-[8px] px-4 rounded-full no-underline text-[14px] font-semibold" style={{ background: INK, color: PAPER }}>
            Get started
          </a>
        </nav>
      </header>

      <main>
        {/* The hero: what we do that a pretty invitation alone doesn't. Guests answer by text, and the list,
            dietary needs and seating fill themselves in. */}
        <section className="px-4 pt-14 pb-20 md:pt-20 md:pb-24" style={{ background: 'radial-gradient(120% 90% at 85% 0%, #3f4f39 0%, #2b3727 55%, #1f281c 100%)', color: '#f3ecd6' }}>
          <div className="max-w-[1100px] mx-auto grid gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center">
            <div className="flex flex-col gap-6 text-center md:text-left items-center md:items-start">
              <span className="text-[12px] font-semibold tracking-[.26em] uppercase" style={{ color: '#e6cf9e' }}>
                Invitations · RSVPs · The whole plan
              </span>
              <h1 className="m-0 text-[clamp(44px,7.5vw,84px)] leading-[1.02] font-normal" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                RSVPs, sorted by text.
              </h1>
              <span aria-hidden className="block h-[3px] w-[96px] rounded-full" style={{ background: 'linear-gradient(90deg,#e6cf9e,#b39563)' }} />
              <p className="m-0 text-[clamp(17px,2.2vw,20px)] leading-[1.55] max-w-[520px]" style={{ color: '#d6dccb' }}>
                Each guest gets their own invitation by text or email. They reply in seconds, and your guest list, dietary list and seating plan fill themselves in.
              </p>
              <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-1">
                <a href="#start" className="py-[15px] px-8 rounded-full no-underline text-[17px] font-semibold shadow-[0_12px_28px_rgba(0,0,0,.25)]" style={{ background: '#e6cf9e', color: '#1b2218' }}>
                  Start your wedding
                </a>
                <a href="/try" className="py-[15px] px-7 rounded-full no-underline text-[17px] font-semibold border" style={{ color: '#f3ecd6', borderColor: 'rgba(243,236,214,.45)' }}>
                  Try the app
                </a>
              </div>
              <span className="text-[14px]" style={{ color: '#c9d0bd' }}>
                From {fromPrice}, paid once. No subscription. Australian owned and operated.
              </span>
            </div>
            <div className="flex justify-center">
              <TextThread />
            </div>
          </div>
        </section>

        {/* The invitation itself: the real one, tap the seal. */}
        <section aria-labelledby="see" className="px-4 py-20">
          <div className="max-w-[1100px] mx-auto grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center">
            <div className="flex justify-center md:order-2">
              <HeroInvite />
            </div>
            <div className="flex flex-col gap-4 text-center md:text-left items-center md:items-start md:order-1">
              <h2 id="see" className="m-0 text-[clamp(34px,5vw,52px)] leading-[1.08] font-normal" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                And an invitation worth opening.
              </h2>
              <p className="m-0 text-[17px] leading-[1.55] max-w-[460px]" style={{ color: SOFT }}>
                {THEME_COUNT} designs in six looks, from romantic arches to clean and modern. Falling petals, fairy lights or your own film moving behind your names, on every plan. Your colours, your lettering, your words.
              </p>
              <Link to="/designs" className="py-3 px-6 rounded-full no-underline text-[15px] font-semibold border" style={{ color: INK, borderColor: '#c6b794' }}>
                See all the designs
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="after" className="py-24 px-4" style={{ background: PAPER }}>
          <div className="max-w-[1100px] mx-auto flex flex-col gap-12">
            <div className="text-center flex flex-col gap-4">
              <h2 id="after" className="m-0 text-[clamp(38px,6vw,64px)] leading-[1.05] font-normal" style={{ fontFamily: serif }}>
                And everything after the yes.
              </h2>
              <p className="m-0 text-[18px] leading-[1.55] max-w-[620px] mx-auto" style={{ color: SOFT }}>
                Every reply lands in your guest list as it happens. The seating, the budget and the vendors are right there with it.
              </p>
            </div>
            <PhoneFan />
            <div className="flex flex-col items-center gap-2">
              <a href="/try" className="py-[14px] px-8 rounded-full no-underline text-[16px] font-semibold shadow-[0_10px_24px_rgba(51,64,47,.18)]" style={{ background: INK, color: PAPER }}>
                Try the app yourself
              </a>
              <span className="text-[14px]" style={{ color: SOFT }}>
                A sample wedding to play with: switch between Basic, Essentials and Deluxe. Nothing to sign up for.
              </span>
            </div>
            <div className="grid gap-10 md:grid-cols-3 max-w-[1000px] mx-auto">
              {AFTER.map((a) => (
                <article key={a.title} className="flex flex-col gap-2">
                  <h3 className="m-0 text-[26px] leading-[1.15] font-normal" style={{ fontFamily: serif }}>
                    {a.title}
                  </h3>
                  <p className="m-0 text-[16px] leading-[1.6]" style={{ color: SOFT }}>
                    {a.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="founders" className="py-24 px-4">
          <figure className="max-w-[760px] mx-auto m-0 flex flex-col items-center gap-6 text-center">
            <h2 id="founders" className="m-0 text-[13px] tracking-[.2em] uppercase font-semibold" style={{ color: SOFT }}>
              Built for our own wedding
            </h2>
            <blockquote className="m-0 text-[clamp(24px,3.6vw,34px)] leading-[1.35] italic" style={{ fontFamily: serif }}>
              “Our replies came in by text, email and word of mouth, and every evening went on chasing them. So we made the thing we wanted: one link each, and a list that keeps
              itself.”
            </blockquote>
            <figcaption className="text-[15px]" style={{ color: SOFT }}>
              The founders
            </figcaption>
          </figure>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="py-24 px-4" style={{ background: PAPER }}>
          <div className="max-w-[1100px] mx-auto flex flex-col gap-12">
            <div className="text-center flex flex-col gap-4">
              <h2 id="pricing-title" className="m-0 text-[clamp(38px,6vw,64px)] leading-[1.05] font-normal" style={{ fontFamily: serif }}>
                One payment. No subscription.
              </h2>
              <p className="m-0 text-[18px] leading-[1.55] max-w-[620px] mx-auto" style={{ color: SOFT }}>
                Set everything up first. Pay once, when you’re ready to send your invitations. Australian dollars, GST included.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-3 items-stretch">
              {PLANS.map((p) => (
                <article
                  key={p.key}
                  className="flex flex-col gap-5 p-7 rounded-[24px] bg-white"
                  style={{ border: `${p.pick ? 2 : 1}px solid ${p.pick ? INK : '#e6dcc4'}` }}
                >
                  <div className="flex flex-col gap-1">
                    <h3 className="m-0 text-[20px] font-semibold">{PLAN_INFO[p.key].name}</h3>
                    <span className="text-[14px]" style={{ color: SOFT }}>
                      {p.note}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[52px] leading-none" style={{ fontFamily: serif }}>
                      {PLAN_INFO[p.key].price}
                    </span>
                    <span className="text-[14px]" style={{ color: SOFT }}>
                      once
                    </span>
                  </div>
                  <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[15px] leading-[1.45] flex-1">
                    {p.items.map((i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden style={{ color: GOLD }}>
                          ✓
                        </span>
                        {i}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => choose(p.key)}
                    className="py-3 rounded-full text-[15px] font-medium cursor-pointer"
                    style={p.pick ? { background: INK, color: PAPER, border: 0 } : { background: 'transparent', color: INK, border: `1px solid ${INK}` }}
                  >
                    Choose {PLAN_INFO[p.key].name}
                  </button>
                </article>
              ))}
            </div>

            <p className="m-0 text-center text-[15px]" style={{ color: SOFT }}>
              Another event beyond your plan, like a rehearsal dinner or a recovery brunch: {EVENT_ADDON.name}, <strong className="font-semibold" style={{ color: INK }}>{EVENT_ADDON.price}</strong> each.
            </p>

            <div className="grid gap-5 md:grid-cols-2 max-w-[900px] w-full mx-auto">
              <h3 className="sr-only">
                Sending your invitations
              </h3>
              <div className="flex flex-col gap-2 p-7 rounded-[24px]" style={{ background: CREAM }}>
                <span className="text-[14px] font-semibold">Send it yourself</span>
                <span className="text-[34px] leading-none" style={{ fontFamily: serif }}>
                  Free
                </span>
                <p className="m-0 text-[15px] leading-[1.55]" style={{ color: SOFT }}>
                  Send each guest their own link from your own phone or by email, on any plan.
                </p>
              </div>
              <div className="flex flex-col gap-2 p-7 rounded-[24px]" style={{ background: CREAM }}>
                <span className="text-[14px] font-semibold">Or we text it for you</span>
                <span className="text-[34px] leading-none" style={{ fontFamily: serif }}>
                  {TEXT_ALL_IN}
                </span>
                <p className="m-0 text-[15px] leading-[1.55]" style={{ color: SOFT }}>
                  Not included in any plan: text credits are bought separately, on {textingPlans}. About {typicalTexts} for {TYPICAL_GUESTS} guests, invitations to thank-yous.
                </p>
              </div>
            </div>
            <p role="note" className="m-0 max-w-[900px] mx-auto text-[13px] leading-[1.6] text-center" style={{ color: SOFT }}>
              {TEXT_COST_NOTE}
            </p>

            <details className="max-w-[900px] w-full mx-auto rounded-[20px] border border-[#e6dcc4] bg-white">
              <summary className="cursor-pointer py-4 px-6 text-[15px] font-semibold">Compare every feature</summary>
              <div className="overflow-x-auto px-6 pb-6">
                <table className="w-full text-[14px] border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left py-2 pr-3 font-semibold">Feature</th>
                      {PLANS.map((p) => (
                        <th key={p.key} className="py-2 px-2 font-semibold text-center whitespace-nowrap">
                          {PLAN_INFO[p.key].name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[#ece3cc]">
                      <td className="py-2 pr-3">Your invitation, RSVP page and guest list</td>
                      {PLANS.map((p) => (
                        <td key={p.key} className="py-2 px-2 text-center" aria-label={`${PLAN_INFO[p.key].name}: included`}>
                          ✓
                        </td>
                      ))}
                    </tr>
                    {COMPARE.map((f) => (
                      <tr key={f} className="border-t border-[#ece3cc]">
                        <td className="py-2 pr-3">{ROW_LABEL[f] ?? FEATURE_LABEL[f]}</td>
                        {PLANS.map((p) => (
                          <td
                            key={p.key}
                            className="py-2 px-2 text-center"
                            aria-label={`${PLAN_INFO[p.key].name}: ${allows(p.key, f) ? 'included' : 'not included'}`}
                            style={{ color: allows(p.key, f) ? INK : '#b9ae94' }}
                          >
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

        <section id="start" className="py-24 px-4">
          <SignUp plan={plan} setPlan={setPlan} />
        </section>

        <section aria-labelledby="questions" className="py-24 px-4" style={{ background: PAPER }}>
          <div className="max-w-[760px] mx-auto flex flex-col gap-4">
            <h2 id="questions" className="m-0 pb-2 text-[clamp(34px,5vw,48px)] font-normal text-center" style={{ fontFamily: serif }}>
              Questions
            </h2>
            {FAQ.map(([q, a]) => (
              <details key={q} className="py-4 border-b border-[#e6dcc4]">
                <summary className="cursor-pointer text-[17px] font-medium">{q}</summary>
                <p className="m-0 mt-2 text-[15px] leading-[1.65]" style={{ color: SOFT }}>
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="py-8 px-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px]" style={{ color: SOFT }}>
        <span>
          © {new Date().getFullYear()} {BRAND}. All rights reserved: our designs, templates and software are protected by copyright. Australian owned and operated.
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
        {site &&
          (Object.entries(site.social) as [string, string][])
            .filter(([, u]) => /^https:\/\//.test(u))
            .map(([k, u]) => (
              <a key={k} href={u} target="_blank" rel="noopener noreferrer" style={{ color: SOFT }}>
                {k === 'tiktok' ? 'TikTok' : k === 'youtube' ? 'YouTube' : k.charAt(0).toUpperCase() + k.slice(1)}
              </a>
            ))}
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
      const r = await api.signup({ ...f, guests: Math.max(0, Math.min(3000, Math.round(Number(f.guests) || 0))), plan, ref: savedRef() });
      // Their own invitation first (with their names), then "Make it yours" takes them into the admin.
      const slug = r.weddings.find((x) => x.id === r.weddingId)?.slug;
      window.location.assign(slug ? `/w/${encodeURIComponent(slug)}/?preview=1&welcome=1` : `/admin/${encodeURIComponent(r.weddingId)}`);
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  };
  // A field: its label above, a soft box that never runs off the screen (iPhone draws date boxes wide).
  const box = 'block w-full min-w-0 max-w-full appearance-none py-[13px] px-4 rounded-[14px] border border-[#ddd0b2] bg-[#fffdf8] text-[16px] text-[#33402f] shadow-[inset_0_1px_2px_rgba(51,64,47,.05)] focus:outline-none focus:border-[#a9843f] focus:shadow-[0_0_0_3px_rgba(169,132,63,.18)]';
  const lab = 'flex flex-col gap-[6px] text-[13px] font-medium tracking-[.02em] min-w-0';
  const step = (n: string, title: string) => (
    <div className="flex items-center gap-3 pt-2">
      <span className="w-7 h-7 flex-none rounded-full flex items-center justify-center text-[13px] font-semibold" style={{ background: INK, color: PAPER }}>
        {n}
      </span>
      <span className="text-[13px] font-semibold tracking-[.16em] uppercase" style={{ color: SOFT }}>
        {title}
      </span>
      <span className="flex-1 h-px" style={{ background: '#e2d7bc' }} />
    </div>
  );
  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-[620px] mx-auto">
      <div className="text-center pb-8 flex flex-col items-center gap-3">
        <LogoMark size={56} />
        <h2 className="m-0 text-[clamp(40px,6.5vw,60px)] leading-[1.02] font-normal" style={{ fontFamily: serif }}>
          Start your wedding
        </h2>
        <p className="m-0 text-[16px] max-w-[440px]" style={{ color: SOFT }}>
          It takes a minute. Set everything up and see your own invitation before you pay a cent.
        </p>
      </div>
      <div className="flex flex-col gap-5 p-6 sm:p-9 rounded-[28px] border border-[#e6dcc4] shadow-[0_30px_70px_rgba(51,64,47,.12)]" style={{ background: 'linear-gradient(180deg,#fffdf8 0%,#fbf6ea 100%)' }}>
        {step('1', 'The two of you')}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-end">
          <label className={lab}>
            Your first name
            <input required value={f.firstName} onChange={set('firstName')} autoComplete="given-name" placeholder="Harriet" className={box} />
          </label>
          <span aria-hidden className="pb-[10px] text-[30px] leading-none" style={{ fontFamily: serif, color: GOLD }}>
            &amp;
          </span>
          <label className={lab}>
            Your partner’s first name
            <input required value={f.partnerName} onChange={set('partnerName')} placeholder="Theo" className={box} />
          </label>
        </div>
        {step('2', 'Your account')}
        <label className={lab}>
          Email
          <input required type="email" value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" className={box} />
        </label>
        <label className={lab}>
          Choose a passcode (8 characters or more)
          <input required type="password" minLength={8} value={f.passcode} onChange={set('passcode')} autoComplete="new-password" className={box} />
        </label>
        {step('3', 'Your day')}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <label className={lab}>
            Wedding date (if you have one)
            <input type="date" value={f.date} onChange={set('date')} className={`${box} min-h-[50px]`} />
          </label>
          <label className={lab}>
            About how many guests? (a guess is fine)
            <input type="number" inputMode="numeric" min={0} max={3000} value={f.guests} onChange={set('guests')} placeholder="e.g. 120" className={box} />
          </label>
        </div>
        {step('4', 'Your plan')}
        <fieldset className="m-0 p-0 border-0 flex flex-col gap-3 min-w-0">
          <legend className="sr-only">Plan</legend>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            {PLANS.map((p) => {
              const on = plan === p.key;
              return (
                <label
                  key={p.key}
                  className="relative flex sm:flex-col gap-3 sm:gap-1 items-center sm:items-start p-4 rounded-[18px] border-2 cursor-pointer transition-[border-color,box-shadow] duration-150"
                  style={{ borderColor: on ? INK : '#e6dcc4', background: on ? '#fffdf8' : 'rgba(255,253,248,.6)', boxShadow: on ? '0 10px 24px rgba(51,64,47,.12)' : undefined }}
                >
                  {p.pick && (
                    <span className="absolute -top-[11px] right-3 py-[2px] px-[10px] rounded-full text-[11px] font-semibold tracking-[.06em]" style={{ background: GOLD, color: '#fff' }}>
                      Most popular
                    </span>
                  )}
                  <input type="radio" name="plan" checked={on} onChange={() => setPlan(p.key)} className="w-[18px] h-[18px] flex-none accent-[#33402f]" />
                  <span className="flex flex-col min-w-0">
                    <span className="text-[17px]" style={{ fontFamily: serif, fontWeight: 600 }}>
                      {PLAN_INFO[p.key].name}
                    </span>
                    <span className="text-[12px]" style={{ color: SOFT }}>
                      {p.note}
                    </span>
                  </span>
                  <span className="ml-auto sm:ml-0 sm:mt-1 text-[26px] leading-none" style={{ fontFamily: serif, color: INK }}>
                    {PLAN_INFO[p.key].price}
                  </span>
                </label>
              );
            })}
          </div>
          <span className="text-[13px] text-center" style={{ color: SOFT }}>
            Paid once, when you’re ready to send. Change plan any time before then.
          </span>
          <span className="text-[13px] text-center p-3 rounded-[12px] bg-[#f3ecd9]" style={{ color: INK }}>
            Texting your guests is optional: <strong>{TEXT_CREDIT_ALL_IN}c a text credit</strong>, about <strong>{TEXT_PER_GUEST >= 100 ? `$${(TEXT_PER_GUEST / 100).toFixed(2)}` : `${TEXT_PER_GUEST}c`} a guest</strong> for every text (invitation, reminders, thank-yous). From your own phone or by email it’s free.
          </span>
        </fieldset>
        {/* Left empty by people (hidden); bots fill it in. */}
        <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={f.website} onChange={set('website')} name="website" className="absolute left-[-9999px] w-px h-px opacity-0" />
        <label className="flex items-start gap-3 text-[14px] cursor-pointer pt-1" style={{ color: SOFT }}>
          <input type="checkbox" checked={f.marketing} onChange={set('marketing')} className="mt-[2px] w-[18px] h-[18px] flex-none accent-[#33402f]" />
          <span>Send me the odd planning tip by email. No spam, and you can stop any time.</span>
        </label>
        {problem && (
          <p role="alert" className="m-0 p-3 rounded-[12px] text-[15px] text-[#7a4a37] bg-[#f8e3dd]">
            {problem}{' '}
            {/already an account/i.test(problem) && (
              <Link to="/admin" className="!text-[#7a4a37]">
                Sign in
              </Link>
            )}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="py-[18px] rounded-full border-0 text-[18px] font-semibold cursor-pointer disabled:opacity-60 shadow-[0_14px_30px_rgba(51,64,47,.25)] transition-transform active:scale-[.99]"
          style={{ background: `linear-gradient(180deg, #3d4c38, ${INK})`, color: PAPER }}
        >
          {busy ? 'Setting up your wedding…' : 'Create our wedding'}
        </button>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px]" style={{ color: SOFT }}>
          <span>✓ Nothing to pay today</span>
          <span>✓ No subscription</span>
          <span>✓ Your guests download nothing</span>
          <span>✓ Australian owned and operated</span>
        </div>
      </div>
      <p className="m-0 mt-5 text-[14px] text-center" style={{ color: SOFT }}>
        Already have one?{' '}
        <Link to="/admin" style={{ color: INK }}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

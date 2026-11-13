import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
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
import { rememberRef, savedRef, useSite } from '../lib/site';
import { LogoMark, Wordmark } from './Art';
import { envelopeClose, flatLay } from './Stills';
import { HeroInvite } from './HeroInvite';
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

// Warm ivory and blush, champagne gold, and a deep plum ink: the colours of the day itself, not of an office.
const INK = '#2e2430';
const SOFT = '#6e6068';
const GOLD = '#a8834a';
const CREAM = '#fbf5f0';
const PAPER = '#fffcf8';
const BLUSH = '#f6e6e0';
const THEME_COUNT = THEME_NAMES.length;
const serif = "'Cormorant Garamond', Georgia, serif"; // our headings: light and airy (the invitations keep their own lettering)
const script = "'Great Vibes', 'Pinyon Script', cursive"; // one word at a time, in gold
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
/** Texts are never part of a plan: what to budget per guest's mobile, all-in (17 credits at 8c: every text sent, plus replies). */
const TEXT_PER_GUEST = Math.round(TEXT_RATE.creditsPerGuest * TEXT_CREDIT_ALL_IN);
/** How sending invitations works, start to finish, with the one cost that isn't in a plan (text credits). */
/** The opening scenes are big (their artwork is drawn in code): they load after the page has shown. */

/**
 * Everything after the yes, as tiles: two of our still lifes with the words over them, then softly tinted
 * cards for what the app does. Each is a sentence, not a paragraph.
 */
function Tiles() {
  const close = useMemo(() => envelopeClose(), []);
  const lay = useMemo(() => flatLay(), []);
  const picture = (src: string, title: string, sub: string, span = '') => (
    <article className={`relative min-h-[300px] rounded-[26px] overflow-hidden shadow-[0_24px_50px_rgba(70,40,40,.14)] ${span}`}>
      <img aria-hidden alt="" src={src} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(46,30,36,.62), rgba(46,30,36,0) 55%)' }} />
      <span className="absolute left-6 right-6 bottom-6 flex flex-col gap-1" style={{ color: '#fffaf3' }}>
        <h3 className="m-0 text-[30px] leading-[1.1] font-medium" style={{ fontFamily: serif }}>
          {title}
        </h3>
        <span className="text-[19px] italic" style={{ fontFamily: serif }}>
          {sub}
        </span>
      </span>
    </article>
  );
  const card = (bg: string, title: string, text: string, extra?: ReactNode) => (
    <article className="flex flex-col gap-3 p-7 rounded-[26px] min-h-[220px] shadow-[0_18px_40px_rgba(70,40,40,.08)]" style={{ background: bg }}>
      <h3 className="m-0 text-[28px] leading-[1.15] font-medium" style={{ fontFamily: serif, color: INK }}>
        {title}
      </h3>
      <p className="m-0 text-[16px] leading-[1.6]" style={{ color: SOFT }}>
        {text}
      </p>
      {extra}
    </article>
  );
  return (
    <div className="grid gap-5 md:grid-cols-3 max-w-[1100px] mx-auto w-full">
      {picture(close, 'Your envelope, your seal', 'your initials, pressed in wax')}
      {picture(lay, 'Every colour you love', `${THEME_COUNT} designs in six looks`, 'md:col-span-2')}
      {card(
        'linear-gradient(160deg,#eef4ec,#e2ecdf)',
        'Replies chase themselves',
        'Guests tap yes or no, say who’s coming and what they can’t eat. Anyone who hasn’t answered gets a gentle reminder.',
        <span className="self-start mt-auto py-2 px-4 rounded-[16px_16px_16px_4px] bg-white text-[14px] shadow-sm" style={{ color: INK }}>
          Yes! Both of us 🥂
        </span>,
      )}
      {card('linear-gradient(160deg,#fbf1e2,#f5e4c8)', 'Seating in a second', 'Set your rules: couples together, the two who mustn’t be. Auto-seat fills every table, and you drag to change anything.')}
      {card('linear-gradient(160deg,#f9e9e6,#f2d9d4)', 'Every meal on the right plate', 'Special menus go to everyone who needs one, and the caterer gets one clear list.')}
    </div>
  );
}

/** The envelope section's picture: one sealed envelope, close up, on linen. */
function EnvelopeStill() {
  const src = useMemo(() => envelopeClose('#f6f1e9', '#9c7432'), []);
  return <img alt="A sealed envelope with the couple's initials pressed into a gold wax seal" src={src} loading="lazy" decoding="async" className="w-full aspect-square object-cover rounded-[30px] shadow-[0_34px_70px_rgba(70,40,40,.2)]" />;
}

/** Behind the hero's phone: our own still life of sealed envelopes on linen, set like a product photograph. */
function HeroStill() {
  const src = useMemo(() => flatLay(), []);
  return (
    <img
      aria-hidden
      alt=""
      src={src}
      decoding="async"
      className="absolute top-[4%] bottom-[4%] left-[2%] right-[2%] w-[96%] h-[92%] object-cover rounded-[34px] rotate-[-3deg] shadow-[0_40px_80px_rgba(70,40,40,.22)]"
    />
  );
}

/** A text message beside the hero's phone: the invitation going out, the reply coming back, the list updating. */
function Bubble({ from, children, className = '' }: { from: 'us' | 'them' | 'note'; children: ReactNode; className?: string }) {
  const look =
    from === 'us'
      ? { background: '#ffffff', color: INK, borderRadius: '20px 20px 20px 6px' }
      : from === 'them'
        ? { background: 'linear-gradient(135deg,#c9a46a,#a8834a)', color: '#fffaf2', borderRadius: '20px 20px 6px 20px' }
        : { background: INK, color: '#fbf1e8', borderRadius: 999 };
  return (
    <span className={`absolute z-30 max-w-[230px] py-3 px-4 text-[13.5px] leading-[1.4] shadow-[0_18px_40px_rgba(70,40,40,.18)] ${className}`} style={look}>
      {children}
    </span>
  );
}

/** Under the sending steps: what texting from us costs, replies and back-and-forth included. */
const SEND_CREDITS_NOTE = `texting from us is bought separately and not included in any plan: ${TEXT_CREDIT_ALL_IN}c a credit, all-in. Budget about ${typicalTexts} for ${TYPICAL_GUESTS} guests: every text from the invitation to the thank-you, plus the back-and-forth when guests text you back. You see the total before you pay.`;

const SEND_STEPS: { title: string; text: string }[] = [
  { title: 'Add your guests', text: 'Bring them in from your phone’s contacts or a spreadsheet, or type them in. Each household gets its own private invitation link.' },
  { title: 'Make the invitation yours', text: 'Choose a design and the opening, then your words, photos and music. Preview it exactly as a guest will see it.' },
  { title: 'Pay for your plan, once', text: `From ${fromPrice}, when you’re ready to send. No subscription.` },
  {
    title: 'Choose how it goes out',
    text: 'Free from your own phone (we open a ready-written message for each guest) or by email. Or let us text everyone for you, with reminders sent automatically.',
  },
  { title: 'Send, and watch the yeses arrive', text: 'Guests tap their link, open the invitation and reply in seconds. Anyone who hasn’t answered gets a gentle reminder.' },
  { title: 'Replies sort themselves', text: 'Every reply fills your guest list, dietary list and seating plan as it comes in.' },
];

const TEXTS_PRICE_LINE = `Texts not included: about ${TEXT_PER_GUEST >= 100 ? `$${(TEXT_PER_GUEST / 100).toFixed(2)}` : `${TEXT_PER_GUEST}c`} a guest, all-in, every text and the replies`;

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

/**
 * How we compare with the usual made-for-you digital invitation: no one named, only what is common in the
 * market, and only what is true of us (check against plan.ts before changing a line).
 */
const VS_USUAL: { what: string; usual: string; ours: string }[] = [
  { what: 'Ready', usual: 'A day or more, while someone builds it for you', ours: 'The minute you are. Make it yourself and see every change as you go.' },
  { what: 'Changes after sending', usual: 'Often one free change, then a fee', ours: 'Free, as often as you like. Every guest sees the change straight away.' },
  { what: 'The link', usual: 'One link for everyone, and guests type their names', ours: 'Each guest gets their own, with their names on the envelope. Nobody uninvited can reply.' },
  { what: 'More than one event', usual: 'Often a second invitation, paid again', ours: `Welcome drinks or a recovery brunch on the same invitation: two events on Deluxe, or add one for ${EVENT_ADDON.price}.` },
  { what: 'After the replies', usual: 'A list of who’s coming', ours: 'Reminders, a dietary list for your caterer, the seating plan and the whole wedding plan.' },
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
  ['Who are you?', 'An Australian business, owned and operated here. Prices are in Australian dollars with GST included, and we answer your emails in Australian hours.'],
];

/** The questions every couple asks about invitations, whoever they use. */
const INVITE_FAQ: [string, string][] = [
  ['When should we send our wedding invitations?', 'Six to eight weeks before the day is usual. Allow ten to twelve weeks if many guests travel, or for a destination wedding. Save the dates go out six to twelve months ahead.'],
  ['When should the RSVP date be?', 'Three to four weeks before the wedding. That leaves time to chase late replies and give your caterer and venue final numbers, usually due one to two weeks out.'],
  ['Is it OK to send invitations digitally?', 'Yes, it’s now common in Australia. Guests can’t lose a link, replies come back in seconds, and changes reach everyone. For a guest who’d rather have paper, print theirs from your invitation.'],
  ['What should a wedding invitation include?', 'Who is getting married, the date and time, the venue and its address, the RSVP date and how to reply. Dress code, accommodation, the registry and the day’s timeline can sit on the invitation’s own pages.'],
  ['How do we word “no plus-ones” or “no children”?', 'Name exactly who is invited, and the invitation does the work. Each guest’s own invitation lists only their names, so there is no extra seat to claim. A gentle line such as “We love your little ones, but our day is adults only” helps too.'],
  ['Should we put registry or gift details on the invitation?', 'On a digital invitation, yes: a gift registry or wishing-well page is fine, as guests look for it there. On paper, it’s usually left to the website or a separate card.'],
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
          <a href="#start" className="py-[9px] px-5 rounded-full no-underline text-[14px] font-semibold" style={{ background: INK, color: '#fbf1e8' }}>
            Get started
          </a>
        </nav>
      </header>

      <main>
        {/* The hero: what we do that a pretty invitation alone doesn't. Guests answer by text, and the list,
            dietary needs and seating fill themselves in. */}
        <section
          className="relative overflow-hidden px-4 pt-10 pb-20 md:pt-16 md:pb-24"
          style={{ background: `radial-gradient(70% 60% at 85% 15%, #f6dcd6 0%, rgba(246,220,214,0) 70%), radial-gradient(60% 55% at 5% 95%, #f1e3cc 0%, rgba(241,227,204,0) 70%), ${CREAM}` }}
        >
          {/* Fine gold botanical line work in the corners, our own. */}
          <svg aria-hidden className="absolute -top-6 -left-10 w-[340px] opacity-[.35] pointer-events-none" viewBox="0 0 200 200" fill="none" stroke={GOLD} strokeWidth="1">
            <path d="M10 190 C40 140 60 100 120 60 S180 20 196 6" />
            {[30, 55, 80, 105, 130, 155].map((t, i) => (
              <ellipse key={t} cx={20 + t * 0.9} cy={180 - t * 0.85} rx="10" ry="4" transform={`rotate(${i % 2 ? -50 : 40} ${20 + t * 0.9} ${180 - t * 0.85})`} />
            ))}
          </svg>
          <svg aria-hidden className="absolute -bottom-10 -right-6 w-[300px] opacity-[.3] pointer-events-none rotate-180" viewBox="0 0 200 200" fill="none" stroke={GOLD} strokeWidth="1">
            <path d="M10 190 C40 140 60 100 120 60 S180 20 196 6" />
            {[30, 55, 80, 105, 130, 155].map((t, i) => (
              <ellipse key={t} cx={20 + t * 0.9} cy={180 - t * 0.85} rx="10" ry="4" transform={`rotate(${i % 2 ? -50 : 40} ${20 + t * 0.9} ${180 - t * 0.85})`} />
            ))}
          </svg>
          <div className="relative max-w-[1140px] mx-auto grid gap-14 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center">
            <div className="flex flex-col gap-6 text-center md:text-left items-center md:items-start">
              <span
                data-testid="aussie-badge"
                className="inline-flex items-center gap-2 py-[6px] px-[14px] rounded-full text-[13px] font-semibold"
                style={{ background: 'rgba(255,255,255,.7)', border: `1px solid ${'#e8d2c4'}`, color: INK }}
              >
                <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill={GOLD}>
                  <path d="M12 2l2.4 5.6 6 .6-4.5 4 1.3 5.9L12 15l-5.2 3.1 1.3-5.9-4.5-4 6-.6z" />
                </svg>
                Australian owned and operated
              </span>
              <span className="text-[12px] font-semibold tracking-[.28em] uppercase" style={{ color: GOLD }}>
                Wedding invitations · RSVPs · The whole plan
              </span>
              <h1 className="m-0 text-[clamp(48px,7.6vw,92px)] leading-[1] font-medium tracking-[-.01em]" style={{ fontFamily: serif, color: INK }}>
                The invitation they’ll{' '}
                <span className="font-normal" style={{ fontFamily: script, color: GOLD, fontSize: '1.08em' }}>
                  never
                </span>{' '}
                forget.
              </h1>
              <p className="m-0 text-[clamp(17px,2.1vw,20px)] leading-[1.6] max-w-[520px]" style={{ color: SOFT }}>
                Opened like a gift on every guest’s phone. They reply in seconds, by text or a tap, and your guest list, dietary list and seating plan fill themselves in.
              </p>
              <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-1">
                <a href="#start" className="py-[15px] px-8 rounded-full no-underline text-[17px] font-semibold shadow-[0_14px_30px_rgba(46,36,48,.25)]" style={{ background: INK, color: '#fbf1e8' }}>
                  Start your wedding
                </a>
                <a href="/try" className="py-[15px] px-7 rounded-full no-underline text-[17px] font-semibold border bg-white/60" style={{ color: INK, borderColor: '#dcc2b4' }}>
                  Book a free trial
                </a>
              </div>
              <ul className="m-0 p-0 list-none flex flex-wrap justify-center md:justify-start gap-x-5 gap-y-2 text-[14px]" style={{ color: SOFT }}>
                <li>✓ From {fromPrice}, paid once</li>
                <li>✓ No subscription</li>
                <li>✓ Set up in an evening</li>
              </ul>
              <span className="text-[13px]" style={{ color: SOFT }}>
                Texts to guests are extra ({TEXT_CREDIT_ALL_IN}c a credit) or free from your own phone. Australian dollars, GST included.
              </span>
            </div>
            <div className="relative flex justify-center py-6">
              <HeroStill />
              {/* The real invitation: the envelope and its wax seal, which breaks and opens by itself. */}
              <span className="relative z-10">
                <HeroInvite src="/demo?embed=1&play=1" caption={false} />
              </span>
              <Bubble from="us" className="top-[6%] left-0 md:-left-6 hidden sm:block">
                Harriet &amp; Theo would love you to celebrate with them. Your invitation and RSVP: <u>tap here</u>
              </Bubble>
              <Bubble from="them" className="top-[46%] right-0 md:-right-4 hidden sm:block">
                Yes! Both of us, can’t wait 🥂
              </Bubble>
              <Bubble from="note" className="bottom-[4%] left-[2%] md:-left-2 py-2 text-[13px]">
                ✓ Emma &amp; Tom are coming · guest list updated
              </Bubble>
            </div>
          </div>
        </section>

        {/* The envelope and its seal, close up: what every guest opens first. */}
        <section aria-labelledby="scenes" className="py-16 md:py-20 px-4 overflow-hidden" style={{ background: `linear-gradient(180deg, ${BLUSH} 0%, ${PAPER} 100%)` }}>
          <div className="max-w-[1100px] mx-auto grid gap-10 md:grid-cols-2 items-center">
            <EnvelopeStill />
            <div className="flex flex-col gap-4 items-center md:items-start text-center md:text-left">
              <span className="text-[12px] font-semibold tracking-[.26em] uppercase" style={{ color: GOLD }}>
                The envelope and the seal
              </span>
              <h2 id="scenes" className="m-0 text-[clamp(38px,5.6vw,60px)] leading-[1.02] font-medium" style={{ fontFamily: serif }}>
                Opened like a gift.
              </h2>
              <p className="m-0 text-[18px] leading-[1.6] max-w-[480px]" style={{ color: SOFT }}>
                Every guest’s invitation arrives sealed, with your initials pressed into the wax. One tap breaks the seal, the flap lifts and the card rises out to meet them. Choose the paper, the wax and the colours; {THEME_COUNT} designs to start from.
              </p>
              <Link to="/designs" className="mt-2 py-3 px-6 rounded-full no-underline text-[15px] font-semibold" style={{ background: INK, color: '#fbf1e8' }}>
                See every design
              </Link>
            </div>
          </div>
        </section>

        {/* The invitation itself: the real one, tap the seal. */}
        <section aria-labelledby="after" className="py-16 md:py-20 px-4" style={{ background: PAPER }}>
          <div className="max-w-[1100px] mx-auto flex flex-col gap-9">
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
              <a href="/try" className="py-[14px] px-8 rounded-full no-underline text-[16px] font-semibold shadow-[0_10px_24px_rgba(70,40,48,.18)]" style={{ background: INK, color: PAPER }}>
                Book your free trial
              </a>
              <span className="text-[14px]" style={{ color: SOFT }}>
                Step inside a sample wedding: switch between Basic, Essentials and Deluxe. Free, and nothing to pay.
              </span>
            </div>
            <Tiles />
          </div>
        </section>

        <section aria-labelledby="how-send" className="py-16 md:py-20 px-4">
          <div className="max-w-[1000px] mx-auto flex flex-col gap-8">
            <div className="text-center flex flex-col gap-4">
              <p className="m-0 text-[13px] tracking-[.2em] uppercase font-semibold" style={{ color: GOLD }}>
                How sending works
              </p>
              <h2 id="how-send" className="m-0 text-[clamp(34px,5.4vw,56px)] leading-[1.06] font-normal" style={{ fontFamily: serif }}>
                From your guest list to their yes.
              </h2>
            </div>
            <ol className="m-0 p-0 list-none grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {SEND_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4 min-w-0">
                  <span aria-hidden className="flex-none w-9 h-9 rounded-full flex items-center justify-center text-[16px]" style={{ background: INK, color: PAPER, fontFamily: serif }}>
                    {i + 1}
                  </span>
                  <span className="flex flex-col gap-1 min-w-0">
                    <h3 className="m-0 text-[20px] leading-[1.2] font-normal" style={{ fontFamily: serif }}>
                      {step.title}
                    </h3>
                    <p className="m-0 text-[15px] leading-[1.55]" style={{ color: SOFT }}>
                      {step.text}
                    </p>
                  </span>
                </li>
              ))}
            </ol>
            <p className="m-0 p-4 rounded-[14px] text-[15px] leading-[1.55] max-w-[820px] mx-auto" style={{ background: CREAM, border: '1px solid #ecdcd3' }}>
              <strong className="font-semibold">Text credits: </strong>
              {SEND_CREDITS_NOTE}
            </p>
          </div>
        </section>

        <section aria-labelledby="compare" className="py-16 md:py-20 px-4">
          <div className="max-w-[960px] mx-auto flex flex-col gap-10">
            <div className="text-center flex flex-col gap-4">
              <h2 id="compare" className="m-0 text-[clamp(34px,5.4vw,56px)] leading-[1.06] font-normal" style={{ fontFamily: serif }}>
                More than a pretty link.
              </h2>
              <p className="m-0 text-[18px] leading-[1.55] max-w-[620px] mx-auto" style={{ color: SOFT }}>
                How we compare with the usual made-for-you digital invitation.
              </p>
            </div>
            <div role="list" aria-label="How we compare" className="flex flex-col rounded-[22px] overflow-hidden border border-[#ecdcd3]">
              <div aria-hidden className="hidden md:grid grid-cols-[180px_1fr_1.3fr] text-[13px] font-semibold tracking-[.14em] uppercase" style={{ background: PAPER, color: SOFT }}>
                <span className="p-4" />
                <span className="p-4">Usually</span>
                <span className="p-4" style={{ color: INK }}>
                  With {BRAND}
                </span>
              </div>
              {VS_USUAL.map((r) => (
                <div key={r.what} role="listitem" className="grid md:grid-cols-[180px_1fr_1.3fr] border-t border-[#ecdcd3] first-of-type:border-t-0">
                  <span className="px-4 pt-4 md:pb-4 text-[17px] font-semibold" style={{ fontFamily: serif }}>
                    {r.what}
                  </span>
                  <span className="px-4 pt-1 md:pt-4 md:pb-4 text-[15px] leading-[1.5]" style={{ color: SOFT }}>
                    <span className="md:hidden font-semibold">Usually: </span>
                    {r.usual}
                  </span>
                  <span className="flex gap-2 px-4 pt-2 pb-4 md:pt-4 text-[16px] leading-[1.5]" style={{ color: INK, background: 'rgba(167,184,143,.12)' }}>
                    <span aria-hidden className="font-bold" style={{ color: '#a8834a' }}>
                      ✓
                    </span>
                    <span>{r.ours}</span>
                  </span>
                </div>
              ))}
            </div>
            <figure className="m-0 max-w-[720px] mx-auto flex flex-col items-center gap-3 text-center">
              <blockquote className="m-0 text-[clamp(20px,2.8vw,26px)] leading-[1.4] italic" style={{ fontFamily: serif }}>
                “Our replies came in by text, email and word of mouth, and every evening went on chasing them. So we made the thing we wanted: one link each, and a list that keeps itself.”
              </blockquote>
              <figcaption className="text-[14px]" style={{ color: SOFT }}>
                The founders, who built it for their own wedding
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="py-16 md:py-20 px-4" style={{ background: PAPER }}>
          <div className="max-w-[1100px] mx-auto flex flex-col gap-9">
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
                  style={{ border: `${p.pick ? 2 : 1}px solid ${p.pick ? INK : '#ecdcd3'}` }}
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
                  Not included in any plan: text credits are bought separately, on {textingPlans}. About {typicalTexts} for {TYPICAL_GUESTS} guests, invitations to thank-yous and the replies back and forth.
                </p>
              </div>
            </div>
            <p role="note" className="m-0 max-w-[900px] mx-auto text-[13px] leading-[1.6] text-center" style={{ color: SOFT }}>
              {TEXT_COST_NOTE}
            </p>

            <details className="max-w-[900px] w-full mx-auto rounded-[20px] border border-[#ecdcd3] bg-white">
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
                    <tr className="border-t border-[#f0e2da]">
                      <td className="py-2 pr-3">Your invitation, RSVP page and guest list</td>
                      {PLANS.map((p) => (
                        <td key={p.key} className="py-2 px-2 text-center" aria-label={`${PLAN_INFO[p.key].name}: included`}>
                          ✓
                        </td>
                      ))}
                    </tr>
                    {COMPARE.map((f) => (
                      <tr key={f} className="border-t border-[#f0e2da]">
                        <td className="py-2 pr-3">{ROW_LABEL[f] ?? FEATURE_LABEL[f]}</td>
                        {PLANS.map((p) => (
                          <td
                            key={p.key}
                            className="py-2 px-2 text-center"
                            aria-label={`${PLAN_INFO[p.key].name}: ${allows(p.key, f) ? 'included' : 'not included'}`}
                            style={{ color: allows(p.key, f) ? INK : '#c9b3a8' }}
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

        <section id="start" className="py-16 md:py-20 px-4">
          <SignUp plan={plan} setPlan={setPlan} />
        </section>

        <section aria-labelledby="questions" className="py-16 md:py-20 px-4" style={{ background: PAPER }}>
          <div className="max-w-[760px] mx-auto flex flex-col gap-4">
            <h2 id="questions" className="m-0 pb-2 text-[clamp(34px,5vw,48px)] font-normal text-center" style={{ fontFamily: serif }}>
              Questions
            </h2>
            <h3 className="m-0 pt-2 text-[13px] font-semibold tracking-[.18em] uppercase" style={{ color: SOFT }}>
              About {BRAND}
            </h3>
            <div role="group" aria-label={`About ${BRAND}`}>
              {FAQ.map(([q, a]) => (
                <details key={q} className="py-4 border-b border-[#ecdcd3]">
                  <summary className="cursor-pointer text-[17px] font-medium">{q}</summary>
                  <p className="m-0 mt-2 text-[15px] leading-[1.65]" style={{ color: SOFT }}>
                    {a}
                  </p>
                </details>
              ))}
            </div>
            <h3 className="m-0 pt-6 text-[13px] font-semibold tracking-[.18em] uppercase" style={{ color: SOFT }}>
              Wedding invitations, answered
            </h3>
            <div role="group" aria-label="Wedding invitations, answered">
              {INVITE_FAQ.map(([q, a]) => (
                <details key={q} className="py-4 border-b border-[#ecdcd3]">
                  <summary className="cursor-pointer text-[17px] font-medium">{q}</summary>
                  <p className="m-0 mt-2 text-[15px] leading-[1.65]" style={{ color: SOFT }}>
                    {a}
                  </p>
                </details>
              ))}
            </div>
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
      // The full app's client (60 KB+) loads only when someone signs up, not with the front page.
      const { api } = await import('../lib/api');
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
  const box = 'block w-full min-w-0 max-w-full appearance-none py-[13px] px-4 rounded-[14px] border border-[#e6d3c8] bg-[#fffdf8] text-[16px] text-[#2e2430] shadow-[inset_0_1px_2px_rgba(70,40,48,.05)] focus:outline-none focus:border-[#a8834a] focus:shadow-[0_0_0_3px_rgba(169,132,63,.18)]';
  const lab = 'flex flex-col gap-[6px] text-[13px] font-medium tracking-[.02em] min-w-0';
  const step = (n: string, title: string) => (
    <div className="flex items-center gap-3 pt-2">
      <span className="w-7 h-7 flex-none rounded-full flex items-center justify-center text-[13px] font-semibold" style={{ background: INK, color: PAPER }}>
        {n}
      </span>
      <span className="text-[13px] font-semibold tracking-[.16em] uppercase" style={{ color: SOFT }}>
        {title}
      </span>
      <span className="flex-1 h-px" style={{ background: '#ecdcd3' }} />
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
      <div className="flex flex-col gap-5 p-6 sm:p-9 rounded-[28px] border border-[#ecdcd3] shadow-[0_30px_70px_rgba(70,40,48,.12)]" style={{ background: 'linear-gradient(180deg,#fffdf8 0%,#fffaf5 100%)' }}>
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
                  style={{ borderColor: on ? INK : '#ecdcd3', background: on ? '#fffdf8' : 'rgba(255,253,248,.6)', boxShadow: on ? '0 10px 24px rgba(70,40,48,.12)' : undefined }}
                >
                  {p.pick && (
                    <span className="absolute -top-[11px] right-3 py-[2px] px-[10px] rounded-full text-[11px] font-semibold tracking-[.06em]" style={{ background: GOLD, color: '#fff' }}>
                      Most popular
                    </span>
                  )}
                  <input type="radio" name="plan" checked={on} onChange={() => setPlan(p.key)} className="w-[18px] h-[18px] flex-none accent-[#2e2430]" />
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
          <span className="text-[13px] text-center p-3 rounded-[12px] bg-[#f8ece6]" style={{ color: INK }}>
            Texting your guests is optional: <strong>{TEXT_CREDIT_ALL_IN}c a text credit</strong>, about <strong>{TEXT_PER_GUEST >= 100 ? `$${(TEXT_PER_GUEST / 100).toFixed(2)}` : `${TEXT_PER_GUEST}c`} a guest</strong> for every text (invitation, reminders, thank-yous) and the back-and-forth when guests reply. From your own phone or by email it’s free.
          </span>
        </fieldset>
        {/* Left empty by people (hidden); bots fill it in. */}
        <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={f.website} onChange={set('website')} name="website" className="absolute left-[-9999px] w-px h-px opacity-0" />
        <label className="flex items-start gap-3 text-[14px] cursor-pointer pt-1" style={{ color: SOFT }}>
          <input type="checkbox" checked={f.marketing} onChange={set('marketing')} className="mt-[2px] w-[18px] h-[18px] flex-none accent-[#2e2430]" />
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
          className="py-[18px] rounded-full border-0 text-[18px] font-semibold cursor-pointer disabled:opacity-60 shadow-[0_14px_30px_rgba(70,40,48,.25)] transition-transform active:scale-[.99]"
          style={{ background: `linear-gradient(180deg, #4a3a4c, ${INK})`, color: PAPER }}
        >
          {busy ? 'Setting up your wedding…' : 'Create our wedding'}
        </button>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px]" style={{ color: SOFT }}>
          <span>✓ Nothing to pay today</span>
          <span>✓ No subscription (texts extra, {TEXT_CREDIT_ALL_IN}c a credit)</span>
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

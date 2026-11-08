import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { allows, EVENT_ADDON, EVENTS_INCLUDED, FEATURE_LABEL, FREE_GUEST_LIMIT, PLAN_INFO, TEXT_COST_NOTE, type Feature } from '@wp/shared';
import { api } from '../lib/api';
import { rememberRef, savedRef, useSite } from '../lib/site';
import { DriveArt, FEATURE_ICONS, Wordmark } from './Art';
import { HeroInvite } from './HeroInvite';
import { Foil, PhoneFan, ShowcaseStyles, Sprig } from './Showcase';

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
    items: ['As many guests as you like', 'Invitations and reminders by text (texts not included: bought separately)', 'Seating plan, with saved versions', 'Budget, payments and checklist', 'Vendors and quote comparisons', 'A guide for every guest the night before'],
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

/** The promises under the headline. */
const HIGHLIGHTS = ['Unlimited guests', 'Pay once, no subscription', 'Free to start', 'Made in Australia'];

/** Three ways to send it, two of them free. */
const SEND: { how: string; cost: string; text: string; tag?: string }[] = [
  { how: 'Your own wedding email', cost: 'Free', tag: 'New', text: 'Every wedding gets its own address, like alex-and-sam@ our site. Send every invitation from it, and every reply lands back in the app, sorted by guest. Read it in Outlook or Apple Mail too.' },
  { how: 'Your own link', cost: 'Free', text: 'Each guest has their own link. Send it any way you like: WhatsApp, Messenger, Instagram, your own texts.' },
  { how: 'By text, for you', cost: 'Texts extra, about 31c a guest all-in', text: 'We text everyone their invitation, then gently remind anyone who hasn’t replied. Texts aren’t included in the price: you buy text credits separately, and see the cost before paying.' },
];

/**
 * What the same jobs usually cost elsewhere (AUD, typical, for about 100 guests), next to ours. Rounded and
 * conservative: printed suites run $4 to $8 each with postage; animated digital invitations are sold one-off
 * at about $120 to $190 (Nov 2026); planning and seating apps charge $10 to $20 a month for the year before.
 */
const COSTS: { what: string; low: number; high: number; note: string }[] = [
  { what: 'Printed invitations and postage', low: 400, high: 800, note: '100 guests, about $4 to $8 each' },
  { what: 'Animated digital invitation', low: 120, high: 190, note: 'One-off, invitation and RSVP only' },
  { what: 'Wedding website and RSVP service', low: 60, high: 200, note: 'A year of a site builder' },
  { what: 'Planning and seating apps', low: 120, high: 240, note: '$10 to $20 a month for a year' },
];

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
    cost: 'Not included: 5.1c a credit, all-in',
    detail: 'Invitations, reminders, answers and the night-before guide go by text. Texts aren’t included in any plan: you buy the credits you need separately (tell us how many guests and we work it out), and nothing is sent without credits.',
    good: 'A 120-guest wedding usually needs about 720 credits for every text, start to finish: about $36.72 all-in. Rather not text? Share each guest’s link yourself, for nothing.',
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
  ['Are texts included?', `No. ${TEXT_COST_NOTE}`],
  ['Do guests need to download anything?', 'No. They get a text with a link. No app, no account, no password.'],
  ['Is it a subscription?', 'No. You pay once for your wedding, and start free until you’re ready to send invitations.'],
  ['Can we send it without paying for texts?', 'Yes. Send from your wedding’s own email address, or share each guest’s link on WhatsApp, Messenger or your own texts. Both are free, and replies land in the same list.'],
  ['Who can see our guest list?', 'Only the two of you and anyone you invite to help. Each wedding is kept separate, and we never share or sell your data.'],
  ['What if we have a welcome drinks or a recovery brunch too?', 'Add them as extra events. Guests are invited to the ones you pick and reply to each.'],
  ['What happens to our photos and files afterwards?', 'If you connect your own Drive, Dropbox or OneDrive, they’re already there, in folders. You can also download everything at any time.'],
];

export function SalesPage() {
  const [plan, setPlan] = useState<PlanKey>('essentials');
  const site = useSite();
  useEffect(() => {
    // Came from a wedding's "Made with" link or a post (?ref= / ?utm_source=): kept for sign-up.
    rememberRef();
    document.title = `${BRAND} · Wedding invitations they’ll open, and the whole plan, for one payment`;
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
      <ShowcaseStyles />
      {site?.banner && (
        <div className="px-4 py-2 text-center text-[14px]" style={{ background: INK, color: '#fbf8f2' }}>
          {site.banner.link ? (
            <a href={site.banner.link} className="!text-[#fbf8f2] underline underline-offset-2">
              {site.banner.text}
            </a>
          ) : (
            site.banner.text
          )}
        </div>
      )}
      <div style={{ background: '#1b2218' }}>
      <header className="max-w-[1100px] mx-auto px-4 py-4 flex justify-between items-center gap-3 [&_a]:!text-[#f3ecd6]">
        <span aria-label={BRAND} className="rounded-full px-3 py-1 bg-[#f6f0e2]">
          <Wordmark size={22} />
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
          <a href="#start" className="py-[9px] px-4 rounded-full no-underline text-[15px] font-semibold" style={{ background: '#e6cf9e' }}>
            <span style={{ color: '#1b2218' }}>Start free</span>
          </a>
        </nav>
      </header>
      </div>

      <main>
        <section className="relative overflow-hidden" style={{ background: 'radial-gradient(120% 90% at 80% 10%, #3f4f39 0%, #263021 55%, #1b2218 100%)', color: '#f3ecd6' }}>
          <div aria-hidden className="absolute -top-24 -left-24 w-[360px] h-[360px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #c8a46a, transparent 70%)' }} />
          <Sprig className="absolute -left-6 bottom-0 w-[150px] opacity-40 hidden md:block" />
          <Sprig className="absolute right-[38%] -top-10 w-[110px] opacity-25 hidden md:block rotate-180" flip />
          <div className="relative max-w-[1100px] mx-auto px-4 pt-10 pb-16 md:pb-20 grid gap-12 md:grid-cols-[1.15fr_1fr] items-center">
            <div className="flex flex-col gap-5">
              <span className="self-start py-[5px] px-3 rounded-full text-[12px] tracking-[.16em] uppercase" style={{ border: '1px solid rgba(200,164,106,.6)', color: '#e6cf9e' }}>
                Invitations · RSVPs · the whole plan
              </span>
              <h1 className="m-0 text-[clamp(40px,7vw,68px)] leading-[1.02] font-normal" style={{ fontFamily: serif }}>
                The invitation they’ll{' '}
                <em>
                  <Foil>actually</Foil>
                </em>{' '}
                open.
              </h1>
              <p className="m-0 text-[18px] leading-[1.6] max-w-[540px]" style={{ color: '#d9d2bf' }}>
                A wax-sealed envelope that opens on their phone. Replies, meals and plus-ones land straight in your guest list. Then seating, budget, vendors and the day itself, all in one place.
              </p>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-[44px] leading-none" style={{ fontFamily: serif, color: '#fbf8f2' }}>
                  {PLAN_INFO.essentials.price}
                </span>
                <span className="text-[15px]" style={{ color: '#d9d2bf' }}>
                  once, for your whole wedding. Not a subscription. Texts not included. Start free.
                </span>
              </div>
              <div className="flex gap-3 flex-wrap items-center pt-1">
                <a href="#start" className="py-[15px] px-8 rounded-full no-underline text-[16px] font-semibold shadow-[0_10px_24px_rgba(0,0,0,.25)]" style={{ background: '#e6cf9e', color: '#1b2218' }}>
                  Start free
                </a>
                <Link to="/demo" className="py-[14px] px-6 rounded-full no-underline text-[16px]" style={{ color: '#fbf8f2', border: '1px solid rgba(243,236,214,.5)' }}>
                  Open a sample invitation
                </Link>
              </div>
              <ul aria-label="Highlights" className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-2 pt-1">
                {HIGHLIGHTS.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-[14px]" style={{ color: '#d9d2bf' }}>
                    <span aria-hidden style={{ color: '#e6cf9e' }}>
                      ✓
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-center md:justify-end">
              <HeroInvite />
            </div>
          </div>
        </section>

        <section aria-labelledby="after" className="relative overflow-hidden pt-16 pb-6 bg-[#fbf8f2]">
          <Sprig className="absolute right-0 top-6 w-[120px] opacity-50" flip />
          <div className="max-w-[1100px] mx-auto px-4 flex flex-col gap-3 text-center">
            <h2 id="after" className="m-0 text-[clamp(30px,5vw,44px)] font-normal" style={{ fontFamily: serif }}>
              And everything after the yes
            </h2>
            <p className="m-0 text-[16px] max-w-[640px] mx-auto" style={{ color: SOFT }}>
              Every reply fills your guest list as it happens. Then the seating plan follows your rules and the budget keeps every deposit on time.
            </p>
          </div>
          <PhoneFan />
        </section>

        <section aria-labelledby="send" className="py-16">
          <div className="max-w-[1100px] mx-auto px-4 flex flex-col gap-8">
            <div className="text-center flex flex-col gap-2">
              <h2 id="send" className="m-0 text-[clamp(30px,5vw,42px)] font-normal" style={{ fontFamily: serif }}>
                Send it free
              </h2>
              <p className="m-0 text-[16px] max-w-[640px] mx-auto" style={{ color: SOFT }}>
                No stamps, no printer, no per-guest fees. Pick how it reaches your guests; replies come back to one list either way.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {SEND.map((x) => (
                <article key={x.how} className="relative flex flex-col gap-3 p-6 rounded-[20px] bg-white border border-[#e2d7bc]">
                  {x.tag && (
                    <span className="absolute top-4 right-4 py-[2px] px-2 rounded-full text-[11px] font-semibold tracking-[.08em] uppercase" style={{ background: '#e6cf9e', color: '#1b2218' }}>
                      {x.tag}
                    </span>
                  )}
                  <h3 className="m-0 text-[19px] font-semibold">{x.how}</h3>
                  <span className="text-[32px] leading-none" style={{ fontFamily: serif }}>
                    {x.cost}
                  </span>
                  <p className="m-0 text-[15px] leading-[1.55]" style={{ color: SOFT }}>
                    {x.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="costs" className="py-16" style={{ background: '#1f271b', color: '#f3ecd6' }}>
          <div className="max-w-[1000px] mx-auto px-4 flex flex-col gap-8">
            <div className="flex flex-col gap-2 text-center">
              <h2 id="costs" className="m-0 text-[clamp(30px,5vw,44px)] font-normal" style={{ fontFamily: serif }}>
                Everything, for less than the stamps
              </h2>
              <p className="m-0 text-[16px] max-w-[660px] mx-auto" style={{ color: '#d9d2bf' }}>
                What couples usually pay for the same jobs, for about 100 guests, against one payment here.
              </p>
            </div>
            <CostBars />
            <p className="m-0 text-center text-[13px]" style={{ color: '#a9a38f' }}>
              Typical Australian prices in 2026, rounded. Yours may differ; ours doesn’t: {PLAN_INFO.essentials.price} or {PLAN_INFO.complete.price}, once.
            </p>
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
                In Australian dollars. One payment per wedding, not a subscription. Text messages are not included in any plan (see below).
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
              <span role="note">
                <strong className="font-semibold">Texts aren’t included in the price.</strong> {TEXT_COST_NOTE}
              </span>
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

/** Typical costs elsewhere as bars, against ours. */
function CostBars() {
  const ours = dollars(PLAN_INFO.essentials.price);
  const total = COSTS.reduce<[number, number]>((a, c) => [a[0] + c.low, a[1] + c.high], [0, 0]);
  const max = total[1];
  const w = (n: number) => `${Math.max(2, (n / max) * 100)}%`;
  return (
    <div className="flex flex-col gap-4">
      {COSTS.map((c) => (
        <div key={c.what} className="grid gap-1 sm:grid-cols-[230px_minmax(0,1fr)] sm:items-center sm:gap-4">
          <span className="text-[15px]">
            {c.what}
            <span className="block text-[12px]" style={{ color: '#a9a38f' }}>
              {c.note}
            </span>
          </span>
          <span className="flex items-center gap-3">
            <span className="h-[14px] rounded-full" style={{ width: w(c.high), background: 'linear-gradient(90deg, #7c6f55, #a2916c)' }} />
            <span className="text-[14px] whitespace-nowrap">
              ${c.low}–${c.high}
            </span>
          </span>
        </div>
      ))}
      <div className="grid gap-1 sm:grid-cols-[230px_minmax(0,1fr)] sm:items-center sm:gap-4 pt-3 border-t border-[rgba(243,236,214,.15)]">
        <span className="text-[15px]" style={{ color: '#a9a38f' }}>
          Bought separately
        </span>
        <span className="text-[22px]" style={{ fontFamily: serif }}>
          ${total[0].toLocaleString('en-AU')} to ${total[1].toLocaleString('en-AU')}
        </span>
      </div>
      <div className="grid gap-1 sm:grid-cols-[230px_minmax(0,1fr)] sm:items-center sm:gap-4 p-4 rounded-[16px]" style={{ background: 'rgba(230,207,158,.12)', border: '1px solid rgba(230,207,158,.45)' }}>
        <strong className="text-[16px]" style={{ color: '#e6cf9e' }}>
          {BRAND}, all of it
        </strong>
        <span className="flex items-center gap-3">
          <span className="h-[14px] rounded-full" style={{ width: w(ours), background: '#e6cf9e' }} />
          <span className="text-[30px] leading-none" style={{ fontFamily: serif, color: '#fbf8f2' }}>
            {PLAN_INFO.essentials.price}
          </span>
          <span className="text-[14px]" style={{ color: '#d9d2bf' }}>
            once · save ${(total[0] - ours).toLocaleString('en-AU')}+
          </span>
        </span>
      </div>
    </div>
  );
}

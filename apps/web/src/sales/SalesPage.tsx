import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * The front door (/): what the app is, for couples deciding, with Sign in for those who have it. The
 * product's name is in one place (BRAND) so it can change with the domain.
 */
export const BRAND = 'VentralP';

const INK = '#33402f';
const SOFT = '#5b6a52';
const GOLD = '#b8925a';
const serif = "'Cormorant Garamond', Georgia, serif";
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";

const FEATURES: { title: string; text: string; icon: string }[] = [
  { icon: '✉', title: 'Invitations that reply themselves', text: 'A beautiful invitation for every guest, by text. They tap yes or no, numbers and dietary needs, and it all lands in your guest list. Reminders and a last call go out on their own.' },
  { icon: '✦', title: 'Messages that answer themselves', text: '“What time does it start?” “Is there parking?” “Sam is vegan.” Questions you’ve already answered get an instant reply, and dietary needs are noted on the right guest.' },
  { icon: '◐', title: 'Seating, with versions', text: 'Drag tables around your floor plan, seat everyone in a tap, save versions like “Family draft” and “Final”, and publish when you’re ready: each guest sees their table.' },
  { icon: '❖', title: 'A planner that does the sums', text: 'Budget by guest and category, payments and reminders, a checklist counted back from your date, and the jobs you hand to family and friends.' },
  { icon: '⚖', title: 'Quotes, compared like for like', text: 'Ask several vendors to price the same list. Each gets their own link to price it line by line, and you see them side by side, with gaps evened out.' },
  { icon: '◎', title: 'Every photo, in one place', text: 'A QR code on each table: guests take photos with your frames, straight into an album in your own Google Drive, Dropbox or OneDrive.' },
  { icon: '♡', title: 'Your wedding party, organised', text: 'Bridesmaids and groomsmen get their own sign-in with the run sheet, their to-dos, the packing list and the speeches, and only what you choose to share.' },
  { icon: '☂', title: 'Never lose a thing', text: 'A backup every day to your own storage, everything filed in folders, and the guest list, replies and plan always yours to download.' },
];

const STEPS: [string, string][] = [
  ['Set up in an evening', 'Your names, your date, your events. Import your guest list from a spreadsheet or your phone.'],
  ['Send it', 'Invitations go out by text, beautifully. Replies, numbers and dietary needs fill themselves in.'],
  ['Plan, then enjoy it', 'Seating, budget, vendors and the party in one place, and a guide for every guest the night before.'],
];

const FAQ: [string, string][] = [
  ['Do our guests need an app?', 'No. Guests get a text with their own link: no download, no sign-up, no password.'],
  ['Who can see our guest list?', 'Only the two of you and anyone you invite to help. Every wedding is kept completely separate, and your data is never shared or sold.'],
  ['Where do our photos and files go?', 'Into your own Google Drive, Dropbox or OneDrive if you link one, filed in folders for you. You keep everything.'],
  ['Can our family help?', 'Yes. Add helpers and your wedding party with their own sign-in, and choose exactly what each can see.'],
];

export function SalesPage() {
  useEffect(() => {
    document.title = `${BRAND} · The wedding app that does the work for you`;
  }, []);
  const signIn = (
    <Link to="/admin" className="py-[10px] px-5 rounded-full no-underline text-[15px] font-medium border" style={{ borderColor: INK, color: INK }}>
      Sign in
    </Link>
  );
  return (
    <div className="min-h-screen bg-[#f6f0e2]" style={{ color: INK, fontFamily: sans }}>
      <header className="max-w-[1100px] mx-auto px-4 py-4 flex justify-between items-center gap-3">
        <span className="text-[26px] tracking-[.02em]" style={{ fontFamily: serif }}>
          {BRAND}
        </span>
        <nav className="flex items-center gap-4 text-[15px]">
          <a href="#features" className="no-underline hidden sm:inline" style={{ color: INK }}>
            What it does
          </a>
          <a href="#faq" className="no-underline hidden sm:inline" style={{ color: INK }}>
            Questions
          </a>
          {signIn}
        </nav>
      </header>

      <main>
        <section className="max-w-[1100px] mx-auto px-4 pt-10 pb-16 grid gap-10 md:grid-cols-[1.2fr_1fr] items-center">
          <div className="flex flex-col gap-5">
            <span className="text-[13px] tracking-[.24em] uppercase font-semibold" style={{ color: GOLD }}>
              The wedding app
            </span>
            <h1 className="m-0 text-[clamp(40px,7vw,68px)] leading-[1.02] font-normal" style={{ fontFamily: serif }}>
              Everything for your wedding, <em>done for you.</em>
            </h1>
            <p className="m-0 text-[18px] leading-[1.55] max-w-[520px]" style={{ color: SOFT }}>
              Invitations and replies by text, seating, the budget, vendors and quotes, photos and your wedding party: one calm place that does the busywork, so you can enjoy being engaged.
            </p>
            <div className="flex gap-3 flex-wrap pt-1">
              <Link to="/admin" className="py-[14px] px-7 rounded-full no-underline text-[16px] font-medium" style={{ background: INK, color: '#fbf8f2' }}>
                Sign in to your wedding
              </Link>
              <a href="#how" className="py-[14px] px-7 rounded-full no-underline text-[16px] font-medium border" style={{ borderColor: '#c6b794', color: INK }}>
                See how it works
              </a>
            </div>
          </div>
          {/* A phone, with a guest's invitation reply. */}
          <div aria-hidden className="mx-auto w-[280px] rounded-[38px] p-3 shadow-[0_30px_60px_rgba(51,64,47,.25)]" style={{ background: INK }}>
            <div className="rounded-[28px] bg-[#fbf8f2] px-5 py-8 flex flex-col gap-4 text-center">
              <span className="text-[11px] tracking-[.3em] uppercase" style={{ color: GOLD }}>
                Together with their families
              </span>
              <span className="text-[44px] leading-none" style={{ fontFamily: "'Pinyon Script', cursive" }}>
                Alex &amp; Sam
              </span>
              <span className="text-[15px]" style={{ fontFamily: serif, color: SOFT }}>
                Saturday 14 March · The Vineyard
              </span>
              <span className="h-px bg-[#e2d7bc]" />
              <span className="text-[14px]" style={{ color: SOFT }}>
                Will you join us?
              </span>
              <span className="flex gap-2 justify-center">
                <span className="py-2 px-5 rounded-full text-[14px]" style={{ background: INK, color: '#fbf8f2' }}>
                  Joyfully yes
                </span>
                <span className="py-2 px-5 rounded-full text-[14px] border border-[#c6b794]">Sadly no</span>
              </span>
              <span className="text-[12px] mt-2 py-2 px-3 rounded-[12px] bg-[#e6ecd8] text-left">✓ Replied: 2 coming · one vegetarian</span>
            </div>
          </div>
        </section>

        <section id="features" className="bg-[#fbf8f2] py-16">
          <div className="max-w-[1100px] mx-auto px-4 flex flex-col gap-8">
            <h2 className="m-0 text-[clamp(32px,5vw,46px)] font-normal text-center" style={{ fontFamily: serif }}>
              What it does for you
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <article key={f.title} className="flex flex-col gap-2 p-5 rounded-[18px] border border-[#e2d7bc] bg-white">
                  <span aria-hidden className="text-[26px]" style={{ color: GOLD }}>
                    {f.icon}
                  </span>
                  <h3 className="m-0 text-[18px] font-semibold leading-[1.25]">{f.title}</h3>
                  <p className="m-0 text-[14px] leading-[1.55]" style={{ color: SOFT }}>
                    {f.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="py-16">
          <div className="max-w-[900px] mx-auto px-4 flex flex-col gap-8">
            <h2 className="m-0 text-[clamp(32px,5vw,46px)] font-normal text-center" style={{ fontFamily: serif }}>
              How it works
            </h2>
            <ol className="m-0 p-0 list-none grid gap-4 md:grid-cols-3">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex flex-col gap-2 p-5 rounded-[18px] bg-[#efe7d3]">
                  <span className="text-[40px] leading-none" style={{ fontFamily: serif, color: GOLD }}>
                    {i + 1}
                  </span>
                  <strong className="text-[17px]">{t}</strong>
                  <span className="text-[14px] leading-[1.55]" style={{ color: SOFT }}>
                    {d}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-14" style={{ background: INK, color: '#f3ecd6' }}>
          <div className="max-w-[900px] mx-auto px-4 grid gap-6 md:grid-cols-3 text-center">
            {[
              ['Private by design', 'Each wedding is walled off from every other. Guests only ever see their own invitation.'],
              ['Yours to keep', 'Daily backups to your own storage, and everything downloadable any time.'],
              ['Made in Australia', 'Australian mobile numbers, dates, times and suppliers near your venue.'],
            ].map(([t, d]) => (
              <div key={t} className="flex flex-col gap-2">
                <strong className="text-[20px] font-normal" style={{ fontFamily: serif }}>
                  {t}
                </strong>
                <span className="text-[14px] leading-[1.55] opacity-85">{d}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="py-16">
          <div className="max-w-[760px] mx-auto px-4 flex flex-col gap-4">
            <h2 className="m-0 text-[clamp(32px,5vw,46px)] font-normal text-center" style={{ fontFamily: serif }}>
              Questions
            </h2>
            {FAQ.map(([q, a]) => (
              <details key={q} className="p-4 rounded-[14px] bg-[#fbf8f2] border border-[#e2d7bc]">
                <summary className="cursor-pointer text-[16px] font-semibold">{q}</summary>
                <p className="m-0 mt-2 text-[15px] leading-[1.55]" style={{ color: SOFT }}>
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="pb-20 px-4">
          <div className="max-w-[760px] mx-auto flex flex-col items-center gap-4 text-center p-8 rounded-[24px] bg-[#efe7d3]">
            <h2 className="m-0 text-[clamp(28px,4.5vw,40px)] font-normal" style={{ fontFamily: serif }}>
              Already planning with us?
            </h2>
            <p className="m-0 text-[16px]" style={{ color: SOFT }}>
              Sign in to your guests, replies and plan, on your phone or computer.
            </p>
            <Link to="/admin" className="py-[14px] px-8 rounded-full no-underline text-[16px] font-medium" style={{ background: INK, color: '#fbf8f2' }}>
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e2d7bc] py-6 px-4 text-center text-[13px]" style={{ color: SOFT }}>
        © {new Date().getFullYear()} {BRAND} · Made for weddings in Australia
      </footer>
    </div>
  );
}

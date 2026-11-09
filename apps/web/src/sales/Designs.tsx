import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LOOK_LABEL, lookOf, MOOD_OF, MOODS, THEME_NAMES, themeLabel, themeOf } from '../guest/themeKit';
import { Wordmark } from './Art';
import { HeroInvite } from './HeroInvite';
import { BRAND } from './SalesPage';

const INK = '#33402f';
const SOFT = '#5b6a52';
const PAPER = '#fbf8f2';
const serif = "'Cormorant Garamond', Georgia, serif";

/**
 * /designs (also /templates): the invitation designs, shown for real. One phone runs the sample invitation;
 * tap a design and it changes to that one, wax seal, envelope and all. Grouped by mood, like the couple's
 * own Look and feel.
 */
export function DesignsPage() {
  const [mood, setMood] = useState<string>('All');
  const [theme, setTheme] = useState<string>(THEME_NAMES[0] ?? 'Cream & Sage');
  useEffect(() => {
    document.title = `Invitation designs · ${BRAND}`;
  }, []);
  const shown = THEME_NAMES.filter((n) => mood === 'All' || MOOD_OF[n] === mood);
  const src = `/demo?embed=1&theme=${encodeURIComponent(theme)}`;
  return (
    <div className="min-h-screen" style={{ background: PAPER, color: INK, fontFamily: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif" }}>
      <header className="max-w-[1100px] mx-auto px-4 py-5 flex justify-between items-center gap-3">
        <span className="flex items-center gap-3">
          <Link to="/" className="no-underline py-2 px-3 rounded-full border text-[14px]" style={{ color: INK, borderColor: '#d3c6a4' }}>
            ← Home
          </Link>
          <Link to="/" aria-label={`${BRAND} home`} className="no-underline hidden sm:inline">
            <Wordmark size={22} />
          </Link>
        </span>
        <Link to="/#start" className="py-[10px] px-5 rounded-full no-underline text-[15px] font-semibold" style={{ background: INK, color: PAPER }}>
          Start your wedding
        </Link>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 pb-24 flex flex-col gap-8">
        <div className="text-center flex flex-col gap-3 pt-6">
          <h1 className="m-0 text-[clamp(40px,7vw,68px)] leading-[1.02] font-normal" style={{ fontFamily: serif }}>
            The designs
          </h1>
          <p className="m-0 text-[18px] leading-[1.5] max-w-[560px] mx-auto" style={{ color: SOFT }}>
            {THEME_NAMES.length} looks, each the real invitation your guests open. Tap one to see it. You can change the colours, the lettering and the wax seal to make it yours.
          </p>
        </div>

        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_340px] items-start">
          <div className="flex flex-col gap-4 order-2 md:order-1">
            <div role="group" aria-label="Moods" className="flex gap-2 flex-wrap">
              {['All', ...MOODS].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mood === m}
                  onClick={() => setMood(m)}
                  className="px-4 py-2 rounded-full border text-[14px] cursor-pointer"
                  style={mood === m ? { background: INK, borderColor: INK, color: PAPER } : { background: 'transparent', borderColor: '#d3c6a4', color: INK }}
                >
                  {m}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Designs" className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              {shown.map((name) => {
                const t = themeOf(name);
                const on = name === theme;
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setTheme(name);
                      // On a phone the preview is above the list: bring it back into view.
                      if (window.innerWidth < 768) document.getElementById('design-phone')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="flex flex-col gap-2 p-2 rounded-[14px] border text-left cursor-pointer"
                    style={{ background: t.b1 ?? '#fff', borderColor: on ? INK : '#e2d7bc', boxShadow: on ? `0 0 0 2px ${INK}` : undefined }}
                  >
                    <span className="flex flex-col items-center justify-center gap-1 h-[84px] rounded-[10px]" style={{ background: t.b2 ?? t.b1 }}>
                      <span className="font-script text-[24px] leading-none" style={{ color: t.dg }}>
                        O &amp; J
                      </span>
                      <span className="block w-10 h-px" style={{ background: t.acc ?? '#c8a46a' }} />
                    </span>
                    <span className="px-1 text-[14px] font-medium" style={{ color: t.dg ?? INK }}>
                      {themeLabel(name)}
                    </span>
                    <span className="px-1 -mt-2 text-[12px]" style={{ color: SOFT }}>
                      {LOOK_LABEL[lookOf(name)].name} look
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div id="design-phone" className="scroll-mt-4 order-1 md:order-2 md:sticky md:top-6 flex flex-col items-center gap-3">
            <HeroInvite src={src} caption={false} />
            <span className="text-[15px] font-medium">{themeLabel(theme)}</span>
            <span className="-mt-2 text-[13px]" style={{ color: SOFT }}>
              {LOOK_LABEL[lookOf(theme)].name} look: {LOOK_LABEL[lookOf(theme)].about.toLowerCase()}
            </span>
            <span className="text-[14px] text-center" style={{ color: SOFT }}>
              Tap the seal to open it.
            </span>
            <div className="flex gap-3 flex-wrap justify-center">
              <a href={`/demo?theme=${encodeURIComponent(theme)}&from=designs`} className="py-[10px] px-5 rounded-full no-underline text-[15px] border" style={{ color: INK, borderColor: '#c6b794' }}>
                Open full screen
              </a>
              <Link to="/#start" className="py-[10px] px-5 rounded-full no-underline text-[15px] font-semibold" style={{ background: INK, color: PAPER }}>
                Use this design
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LOOK_LABEL, lookOf, MOOD_OF, MOODS, SIGNATURE, SIGNATURE_NAMES, THEME_NAMES, themeLabel, themeOf } from '../guest/themeKit';
import { CoverImage, EnvelopePortrait } from '../guest/CoverImage';
import { Wordmark } from './Art';
import { HeroInvite } from './HeroInvite';
import { BRAND } from './SalesPage';
import { TOKENS } from './tokens';

const INK = TOKENS.sage;
const SOFT = '#5b6a52';
const PAPER = '#fbf8f2';
/** The tiles: a card of bright paper whatever the design's colours, so names are always ink (VS-04). */
const CARD = TOKENS.paperBright;
/** Three a row on most screens: the first two rows load straight away, the rest as they scroll near. */
const EAGER = 6;
const serif = "'Cormorant Garamond', Georgia, serif";

/**
 * /designs (also /templates): the invitation designs, shown for real. One phone runs the sample invitation;
 * tap a design and it changes to that one, wax seal, envelope and all. Grouped by mood, like the couple's
 * own Look and feel.
 */
export function DesignsPage() {
  const [mood, setMood] = useState<string>('All');
  const [theme, setTheme] = useState<string>(SIGNATURE_NAMES[0] ?? THEME_NAMES[0] ?? 'Cream & Sage');
  useEffect(() => {
    document.title = `Invitation designs · ${BRAND}`;
  }, []);
  // The Signature designs first: each opens with its own scene.
  const ordered = [...SIGNATURE_NAMES, ...THEME_NAMES.filter((n) => !SIGNATURE[n])];
  const shown = ordered.filter((n) => mood === 'All' || (mood === 'Signature' ? !!SIGNATURE[n] : MOOD_OF[n] === mood));
  const src = `/demo?embed=1&theme=${encodeURIComponent(theme)}`;
  return (
    <div className="min-h-screen" style={{ background: PAPER, color: INK, fontFamily: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif" }}>
      <header className="max-w-[1100px] mx-auto px-4 py-5 flex justify-between items-center gap-3">
        <span className="flex items-center gap-3">
          <Link to="/" className="no-underline inline-flex items-center min-h-[44px] px-4 rounded-full border text-[14px]" style={{ color: INK, borderColor: '#d3c6a4' }}>
            ← Home
          </Link>
          <Link to="/" aria-label={`${BRAND} home`} className="no-underline hidden sm:inline-flex items-center min-h-[44px]">
            <Wordmark size={22} />
          </Link>
        </span>
        <Link to="/#start" className="inline-flex items-center min-h-[44px] px-5 rounded-full no-underline text-[15px] font-semibold" style={{ background: INK, color: PAPER }}>
          Start your wedding
        </Link>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 pb-24 flex flex-col gap-8">
        <div className="text-center flex flex-col gap-3 pt-6">
          <h1 className="m-0 text-[clamp(40px,7vw,68px)] leading-[1.02] font-normal" style={{ fontFamily: serif }}>
            The designs
          </h1>
          <p className="m-0 text-[18px] leading-[1.5] max-w-[560px] mx-auto" style={{ color: SOFT }}>
            {THEME_NAMES.length} designs, each the real invitation your guests open. The Signature designs open with a scene: Regency doors, a fairytale storybook, rustic barn doors, garden gates, the beach and more. Tap one to see it, then make it yours.
          </p>
        </div>

        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_340px] items-start">
          <div className="flex flex-col gap-4 order-2 md:order-1">
            <div role="group" aria-label="Moods" className="flex gap-2 flex-wrap">
              {['All', 'Signature', ...MOODS].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mood === m}
                  onClick={() => setMood(m)}
                  className="inline-flex items-center min-h-[44px] px-4 rounded-full border text-[14px] cursor-pointer"
                  style={mood === m ? { background: INK, borderColor: INK, color: PAPER } : { background: 'transparent', borderColor: '#d3c6a4', color: INK }}
                >
                  {m}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Designs" className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              {shown.map((name, i) => {
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
                    style={{ background: CARD, borderColor: on ? INK : '#e2d7bc', boxShadow: on ? `0 0 0 2px ${INK}` : undefined }}
                  >
                    {/* The design as a 3:4 portrait: its own closed envelope or opening scene, Harriet & Theo and
                        their seal. The box holds its shape while the still loads (no jump). */}
                    <span className="relative block aspect-[3/4] rounded-[10px] overflow-hidden" style={{ background: SIGNATURE[name]?.envelope ?? t.e1 ?? t.b2 }}>
                      <CoverImage name={name} active={on} eager={i < EAGER} className="h-full" fallback={<EnvelopePortrait t={t} />} />
                      {SIGNATURE[name] && (
                        <span className="absolute top-1 left-1 px-2 py-[1px] rounded-full text-[10px] font-semibold tracking-[.08em] uppercase" style={{ background: '#e6cf9e', color: '#1b2218' }}>
                          Signature
                        </span>
                      )}
                    </span>
                    <span className="px-1 text-[15px] font-medium" style={{ color: INK, fontFamily: serif }}>
                      {themeLabel(name)}
                    </span>
                    <span className="px-1 -mt-2 text-[12px]" style={{ color: SOFT }}>
                      {SIGNATURE[name] ? SIGNATURE[name]!.style : `${LOOK_LABEL[lookOf(name)].name} look`}
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
              {SIGNATURE[theme] ? 'Tap anywhere to open it.' : 'Tap the seal to open it.'}
            </span>
            <div className="flex gap-3 flex-wrap justify-center">
              <a href={`/demo?theme=${encodeURIComponent(theme)}&from=designs`} className="inline-flex items-center min-h-[44px] px-5 rounded-full no-underline text-[15px] border" style={{ color: INK, borderColor: '#c6b794' }}>
                Open full screen
              </a>
              <Link to="/#start" className="inline-flex items-center min-h-[44px] px-5 rounded-full no-underline text-[15px] font-semibold" style={{ background: INK, color: PAPER }}>
                Use this design
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

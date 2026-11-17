import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LOOK_LABEL, lookOf, MOOD_OF, MOODS, SIGNATURE, SIGNATURE_NAMES, THEME_NAMES, themeLabel, themeOf } from '../guest/themeKit';
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
                    {SIGNATURE[name] ? (
                      <span className="relative flex flex-col items-center justify-center gap-1 h-[84px] rounded-[10px]" style={{ background: SIGNATURE[name]!.envelope }}>
                        <span className="absolute top-1 left-1 px-2 py-[1px] rounded-full text-[10px] font-semibold tracking-[.08em] uppercase" style={{ background: '#e6cf9e', color: '#1b2218' }}>
                          Signature
                        </span>
                        <span className="font-script text-[24px] leading-none" style={{ color: t.b1 }}>
                          H &amp; T
                        </span>
                        <span className="block w-10 h-px" style={{ background: t.acc ?? '#c8a46a' }} />
                      </span>
                    ) : (
                      <MiniEnvelope t={t} />
                    )}
                    <span className="px-1 text-[14px] font-medium" style={{ color: t.dg ?? INK }}>
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

/**
 * A design as a little envelope in its own colours: the paper, the top flap folded over it with its shadow, a
 * fine foil rule along the flap, and the wax seal where the flap meets.
 */
function MiniEnvelope({ t }: { t: ReturnType<typeof themeOf> }) {
  const env = [t.e1 ?? t.b2 ?? '#e6dcc4', t.e2 ?? t.b2 ?? '#d9cdb0', t.e3 ?? '#c6b794'];
  const flap = [t.t1 ?? env[0], t.t2 ?? env[1], t.t3 ?? env[2]];
  const acc = t.acc ?? '#c8a46a';
  return (
    <span aria-hidden className="relative block h-[84px] rounded-[10px] overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]" style={{ background: `linear-gradient(0deg, ${env[2]}, ${env[0]})` }}>
      {/* The bottom panel and sides, folded in. */}
      <span className="absolute inset-0" style={{ background: `linear-gradient(0deg, ${env[1]}, ${env[0]})`, clipPath: 'polygon(0 100%, 50% 46%, 100% 100%)' }} />
      {/* The top flap, with its shadow below. */}
      <span className="absolute inset-0" style={{ background: 'rgba(40,28,14,.16)', clipPath: 'polygon(0 0, 100% 0, 50% 64%)', filter: 'blur(1.5px)', transform: 'translateY(2px)' }} />
      <span className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${flap[0]}, ${flap[2]})`, clipPath: 'polygon(0 0, 100% 0, 50% 62%)' }} />
      {/* The foil rule, just inside the flap's edges. */}
      <svg viewBox="0 0 100 84" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <path d="M8 0 L44 36 M92 0 L56 36 M10 84 L28 67.7 M90 84 L72 67.7" stroke={acc} strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" opacity=".9" />
      </svg>
      {/* The seal. */}
      <span className="absolute left-1/2 top-[62%] -translate-x-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full grid place-items-center shadow-[0_2px_4px_rgba(0,0,0,.3)]" style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.55), ${acc} 50%, color-mix(in srgb, ${acc} 70%, #000))` }}>
        <span className="font-script text-[11px] leading-none" style={{ color: 'rgba(255,255,255,.85)' }}>
          H&amp;T
        </span>
      </span>
    </span>
  );
}

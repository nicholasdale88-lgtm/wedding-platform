import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from './SalesPage';

/**
 * /demo: a sample invitation for the front page's "See a sample invitation". It's a look-alike of what a
 * guest sees on their phone (the envelope with its wax seal, then the card), drawn here with made-up
 * details for Alex & Sam. Nothing is loaded from the server and nothing is saved.
 *
 * Why not the real invitation page? Its wording comes from each wedding's own text catalogue on the
 * server, so it can't be shown without a real wedding behind it.
 */

const INK = '#33402f';
const SOFT = '#5b6a52';
const GOLD = '#c8a46a';
const SEAL = '#9e4f33';
const serif = "'Cormorant Garamond', Georgia, serif";
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";

const CSS = `
.dm-env{position:relative;width:min(320px,86vw);aspect-ratio:3/2;perspective:900px;cursor:pointer;border:0;padding:0;background:none}
.dm-back{position:absolute;inset:0;border-radius:6px;background:#e6dcc4;box-shadow:0 18px 40px rgba(51,64,47,.22)}
.dm-card{position:absolute;left:6%;right:6%;top:8%;bottom:6%;border-radius:4px;background:#fbf8f2;transition:transform .9s cubic-bezier(.3,.7,.2,1) .55s;display:flex;align-items:flex-start;justify-content:center;padding-top:10%}
.dm-front{position:absolute;inset:0;border-radius:6px;background:linear-gradient(160deg,#ece3cd,#e2d6b9);clip-path:polygon(0 0,50% 58%,100% 0,100% 100%,0 100%)}
.dm-flap{position:absolute;left:0;right:0;top:0;height:62%;transform-origin:top;transition:transform .6s ease,z-index 0s linear .3s;z-index:3}
.dm-flap::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#efe6d1,#ddd0b1);clip-path:polygon(0 0,100% 0,50% 100%)}
.dm-seal{position:absolute;left:50%;top:62%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;z-index:4;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 35% 30%,#c06a48,${SEAL} 60%,#7d3a24);box-shadow:0 3px 8px rgba(60,20,10,.35),inset 0 0 0 4px rgba(255,255,255,.08);
  color:#f6e2d2;font-family:${serif};font-size:20px;transition:transform .35s ease,opacity .35s ease}
.dm-open .dm-seal{transform:scale(.4);opacity:0}
.dm-open .dm-flap{transform:rotateX(180deg);z-index:-1}
.dm-open .dm-card{transform:translateY(-55%)}
.dm-hint{animation:dmPulse 2s ease-in-out infinite}
@keyframes dmPulse{50%{opacity:.45}}
.dm-in{animation:dmIn .7s ease both}
@keyframes dmIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dm-card,.dm-flap,.dm-seal{transition:none}.dm-hint,.dm-in{animation:none}}
`;

type Phase = 'closed' | 'opening' | 'card';

export function DemoPage() {
  const [phase, setPhase] = useState<Phase>('closed');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    document.title = `Sample invitation · ${BRAND}`;
    return () => clearTimeout(timer.current);
  }, []);
  const open = () => {
    if (phase !== 'closed') return;
    setPhase('opening');
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => setPhase('card'), still ? 0 : 1800);
  };

  return (
    <div className="min-h-screen bg-[#f6f0e2] flex flex-col" style={{ color: INK, fontFamily: sans }}>
      <style>{CSS}</style>
      <div className="sticky top-0 z-10 bg-[#33402f] text-[#fbf8f2] text-[14px] py-2 px-4 flex flex-wrap justify-between items-center gap-2">
        <span>
          <strong className="font-semibold">Sample invitation.</strong> Made-up details; nothing you tap here is saved.
        </span>
        <Link to="/" className="!text-[#fbf8f2]">
          Back to {BRAND}
        </Link>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-10 gap-6">
        {phase !== 'card' ? (
          <div className="flex flex-col items-center gap-6 pt-[8vh]">
            <p className="m-0 text-[22px] text-center" style={{ fontFamily: serif }}>
              For Jo &amp; Chris
            </p>
            <button type="button" onClick={open} aria-label="Open the envelope" className={`dm-env ${phase === 'opening' ? 'dm-open' : ''}`}>
              <span className="dm-back" />
              <span className="dm-card">
                <span className="text-[18px]" style={{ fontFamily: serif, color: INK }}>
                  Alex &amp; Sam
                </span>
              </span>
              <span className="dm-front" />
              <span className="dm-flap" />
              <span className="dm-seal" aria-hidden>
                A&amp;S
              </span>
            </button>
            <p className={`m-0 text-[15px] ${phase === 'closed' ? 'dm-hint' : 'opacity-0'}`} style={{ color: SOFT }}>
              Tap the seal to open
            </p>
          </div>
        ) : (
          <Card onReplay={() => setPhase('closed')} />
        )}
      </main>
    </div>
  );
}

/** The invitation card, with the reply. */
function Card({ onReplay }: { onReplay: () => void }) {
  const [reply, setReply] = useState<'yes' | 'no' | null>(null);
  const answer = (r: 'yes' | 'no') => setReply(r);
  return (
    <div className="dm-in w-full max-w-[440px] flex flex-col gap-5">
      <article className="rounded-[18px] bg-[#fbf8f2] px-6 py-10 flex flex-col items-center gap-4 text-center shadow-[0_18px_40px_rgba(51,64,47,.14)] border border-[#e2d7bc]">
        <span className="text-[13px] tracking-[.18em] uppercase" style={{ color: SOFT }}>
          Together with their families
        </span>
        <h1 className="m-0 text-[clamp(44px,13vw,60px)] leading-[1] font-normal italic" style={{ fontFamily: serif }}>
          Alex &amp; Sam
        </h1>
        <span className="block w-16 h-px" style={{ background: GOLD }} />
        <p className="m-0 text-[17px] leading-[1.6]">
          would love you to join them
          <br />
          as they marry
        </p>
        <div className="flex flex-col gap-1 text-[16px]">
          <strong className="text-[24px] font-normal" style={{ fontFamily: serif }}>
            Saturday 13 March 2027
          </strong>
          <span>Ceremony at 3:30pm, then dinner and dancing</span>
        </div>
        <div className="flex flex-col gap-1 text-[16px]">
          <strong className="text-[22px] font-normal" style={{ fontFamily: serif }}>
            Bellbird Hill Estate
          </strong>
          <span style={{ color: SOFT }}>Yarra Valley, Victoria</span>
        </div>
        <span className="text-[14px]" style={{ color: SOFT }}>
          Please reply by 1 February
        </span>
      </article>

      <section aria-labelledby="dm-reply" className="rounded-[18px] bg-white px-6 py-6 flex flex-col gap-4 border border-[#e2d7bc]">
        <h2 id="dm-reply" className="m-0 text-[26px] font-normal text-center" style={{ fontFamily: serif }}>
          Will you be there, Jo &amp; Chris?
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => answer('yes')}
            aria-pressed={reply === 'yes'}
            className="py-3 rounded-full text-[16px] font-medium cursor-pointer"
            style={reply === 'yes' ? { background: INK, color: '#fbf8f2', border: `1px solid ${INK}` } : { background: 'transparent', color: INK, border: `1px solid ${INK}` }}
          >
            Yes, we’ll be there
          </button>
          <button
            type="button"
            onClick={() => answer('no')}
            aria-pressed={reply === 'no'}
            className="py-3 rounded-full text-[16px] font-medium cursor-pointer"
            style={reply === 'no' ? { background: INK, color: '#fbf8f2', border: `1px solid ${INK}` } : { background: 'transparent', color: INK, border: `1px solid ${INK}` }}
          >
            Sorry, we can’t
          </button>
        </div>
        <div role="status" aria-live="polite">
          {reply && (
            <p className="m-0 py-3 px-4 rounded-[12px] text-[15px] leading-[1.55] bg-[#eef1e4]">
              <strong className="font-semibold">This is a sample: replies aren’t saved.</strong>{' '}
              {reply === 'yes'
                ? 'On a real invitation, Jo and Chris would now say who’s coming and what they can’t eat, and it would be in Alex and Sam’s list straight away.'
                : 'On a real invitation, Alex and Sam would see the reply straight away, and Jo and Chris wouldn’t get any reminders.'}
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <p className="m-0 text-[16px]">Each guest gets their own link by text, with their names already on it.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/#start" className="py-[12px] px-6 rounded-full no-underline text-[16px] font-medium" style={{ background: INK, color: '#fbf8f2' }}>
            Start free
          </Link>
          <button type="button" onClick={onReplay} className="py-[12px] px-6 rounded-full text-[16px] cursor-pointer bg-transparent" style={{ color: INK, border: `1px solid ${INK}` }}>
            Open the envelope again
          </button>
        </div>
      </div>
    </div>
  );
}

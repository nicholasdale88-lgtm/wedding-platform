import { HELP_PLACES, videoEmbed, type HelpArticle } from '@wp/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Help's video walkthroughs. A recorded video plays when a guide has one (`video`); otherwise an animated
 * walkthrough plays like a short video: a phone showing the place in the menu being tapped, each step as a
 * big caption, a progress bar per step, and an optional voice reading it out (the phone's own, free). At
 * the end: Take me there. Several guides in a row make the tour.
 */
export function Walkthrough({ guides, where, onClose }: { guides: HelpArticle[]; where: (a: HelpArticle) => string; onClose: () => void }) {
  const scenes = guides.flatMap((a) => [{ a, step: -1 }, ...a.steps.map((_, step) => ({ a, step }))]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [voice, setVoice] = useState(false);
  const [left, setLeft] = useState(1); // share of this scene still to play
  const closeRef = useRef<HTMLButtonElement>(null);
  const done = at >= scenes.length;
  const scene = scenes[Math.min(at, scenes.length - 1)]!;
  const text = scene.step < 0 ? scene.a.title : scene.a.steps[scene.step]!;
  const recorded = guides.length === 1 ? videoEmbed(guides[0]!.video) : null;
  const still = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  // Long enough to read: about a third of a second a word, at least four seconds.
  const ms = scene.step < 0 ? 2600 : Math.max(4000, text.split(/\s+/).length * 330);
  const go = useCallback((n: number) => {
    setAt(Math.max(0, Math.min(n, scenes.length)));
    setLeft(1);
  }, [scenes.length]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(at + 1);
      if (e.key === 'ArrowLeft') go(at - 1);
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, go, onClose]);

  // The clock: ticks the progress bar, then moves on (with the voice on, when it has finished speaking).
  useEffect(() => {
    if (recorded || done || !playing || voice) return;
    const started = Date.now() - (1 - left) * ms;
    const id = window.setInterval(() => {
      const share = 1 - (Date.now() - started) / ms;
      if (share <= 0) go(at + 1);
      else setLeft(share);
    }, 80);
    return () => window.clearInterval(id);
  }, [at, playing, voice, done, recorded, ms]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (recorded || done || !playing || !voice || typeof speechSynthesis === 'undefined') return;
    const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, ''));
    u.lang = 'en-AU';
    u.rate = 1;
    u.onend = () => go(at + 1);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setLeft(0.5);
    return () => {
      u.onend = null;
      speechSynthesis.cancel();
    };
  }, [at, playing, voice, done, recorded, text, go]);
  useEffect(() => () => void (typeof speechSynthesis !== 'undefined' && speechSynthesis.cancel()), []);

  const last = guides[guides.length - 1]!;
  const place = HELP_PLACES[scene.a.go.tab] ?? 'Menu';
  const view = /view=(\w+)/.exec(scene.a.go.query ?? '')?.[1];
  return (
    <div role="dialog" aria-modal="true" aria-label={`Walkthrough: ${guides.length > 1 ? 'the tour' : last.title}`} className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(20,24,18,.72)] p-3 max-[560px]:p-0">
      <div className="relative w-full max-w-[860px] flex flex-col overflow-hidden rounded-[18px] max-[560px]:rounded-none max-[560px]:h-full bg-[#1d211b] text-[#fbf8f2] shadow-[0_30px_80px_rgba(0,0,0,.45)]">
        <div className="flex justify-between items-center gap-3 px-4 py-3">
          <span className="text-[12px] tracking-[.16em] uppercase text-[#c8b98f] truncate">{guides.length > 1 ? `The tour · ${scene.a.title}` : 'Walkthrough'}</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close the walkthrough" className="w-9 h-9 rounded-full border-0 bg-[rgba(255,255,255,.1)] text-[#fbf8f2] text-[18px] cursor-pointer">
            ×
          </button>
        </div>

        {recorded ? (
          <div className="relative w-full aspect-video bg-black">
            {recorded.kind === 'frame' ? (
              <iframe src={recorded.src} title={last.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 w-full h-full border-0" />
            ) : (
              <video src={recorded.src} controls autoPlay playsInline className="absolute inset-0 w-full h-full" />
            )}
          </div>
        ) : (
          <>
            {/* Story-style progress: one bar per scene. */}
            <div className="flex gap-[3px] px-4" aria-hidden>
              {scenes.map((_, i) => (
                <span key={i} className="flex-1 h-[3px] rounded-full bg-[rgba(255,255,255,.2)] overflow-hidden">
                  <span className="block h-full bg-[#e9c97c]" style={{ width: `${i < at ? 100 : i === at ? Math.round((1 - left) * 100) : 0}%` }} />
                </span>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] max-[560px]:grid-cols-1 gap-6 items-center px-6 py-6 min-h-[340px]">
              <Phone place={place} view={view} step={scene.step} still={still} />
              <div aria-live="polite" className="flex flex-col gap-3 max-[560px]:text-center">
                {done ? (
                  <>
                    <strong className="font-display font-medium text-[clamp(26px,5vw,36px)] leading-tight">That’s it.</strong>
                    <span className="text-[16px] text-[#d9d2bf]">Try it yourself: it’s quicker than it sounds.</span>
                  </>
                ) : scene.step < 0 ? (
                  <>
                    <span className="text-[13px] tracking-[.16em] uppercase text-[#c8b98f]">How to</span>
                    <strong key={at} className={`font-display font-medium text-[clamp(28px,5.4vw,42px)] leading-tight ${still ? '' : 'wt-in'}`}>
                      {scene.a.title}
                    </strong>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] tracking-[.16em] uppercase text-[#c8b98f]">
                      Step {scene.step + 1} of {scene.a.steps.length}
                    </span>
                    <span key={at} className={`text-[clamp(18px,2.6vw,22px)] leading-[1.45] ${still ? '' : 'wt-in'}`}>
                      {quoted(text)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap px-4 pb-4">
              <div className="flex gap-2">
                <Ctl label="Back" onClick={() => go(at - 1)} disabled={at === 0}>
                  ‹
                </Ctl>
                <Ctl label={playing ? 'Pause' : 'Play'} onClick={() => {
                    if (done) go(0);
                    setPlaying(done || !playing);
                  }}>
                  {done ? '↺' : playing ? '❚❚' : '▶'}
                </Ctl>
                <Ctl label="Next" onClick={() => go(at + 1)} disabled={done}>
                  ›
                </Ctl>
              </div>
              {typeof speechSynthesis !== 'undefined' && (
                <button type="button" aria-pressed={voice} onClick={() => setVoice(!voice)} className={`py-[8px] px-4 rounded-full border text-[14px] cursor-pointer ${voice ? 'bg-[#e9c97c] text-[#1d211b] border-[#e9c97c]' : 'bg-transparent text-[#fbf8f2] border-[rgba(255,255,255,.3)]'}`}>
                  {voice ? '🔊 Reading aloud' : '🔈 Read it aloud'}
                </button>
              )}
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 px-4 pb-4">
          <Link to={where(done || recorded ? last : scene.a)} onClick={onClose} className="py-[10px] px-5 rounded-full bg-[#e9c97c] !text-[#1d211b] text-[15px] font-semibold no-underline">
            Take me there
          </Link>
        </div>
      </div>
      <style>{`.wt-in{animation:wtIn .6s ease both}@keyframes wtIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.wt-tap{animation:wtTap 1.6s ease-out infinite}@keyframes wtTap{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.8);opacity:0}}.wt-slide{animation:wtSlide .7s ease both}@keyframes wtSlide{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

/** Words in “quotes” (buttons, labels) stand out, as they do on screen. */
function quoted(s: string): ReactNode[] {
  return s.split(/(“[^”]+”)/).map((part, i) => (part.startsWith('“') ? <strong key={i} className="text-[#e9c97c] font-semibold">{part}</strong> : part));
}

function Ctl({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="w-11 h-11 rounded-full border border-[rgba(255,255,255,.25)] bg-transparent text-[#fbf8f2] text-[16px] cursor-pointer disabled:opacity-40 disabled:cursor-default">
      {children}
    </button>
  );
}

/** A little phone: the menu with the place being tapped, then the page with the step's row lit up. */
function Phone({ place, view, step, still }: { place: string; view?: string; step: number; still: boolean }) {
  const menu = ['Overview', place, place === 'Guests' ? 'Seating' : 'Guests', 'Texts'].filter((x, i, all) => all.indexOf(x) === i).slice(0, 3);
  return (
    <div aria-hidden className="justify-self-center w-[min(220px,56vw)] max-[560px]:w-[170px] aspect-[9/17] rounded-[30px] border-[7px] border-[#0d0f0c] bg-[#f6f0e2] shadow-[0_18px_40px_rgba(0,0,0,.5)] overflow-hidden flex flex-col">
      <div className="h-5 flex justify-center items-center">
        <span className="w-14 h-[6px] rounded-full bg-[#0d0f0c]" />
      </div>
      <div className="flex gap-1 px-2 py-2 overflow-hidden">
        {menu.map((m) => (
          <span key={m} className={`relative flex-none py-[3px] px-2 rounded-full text-[9px] font-semibold ${m === place ? 'bg-[#33402f] text-[#fbf8f2]' : 'bg-[#e9e2cc] text-[#5b6a52]'}`}>
            {m}
            {m === place && step < 0 && !still && <span className="wt-tap absolute -inset-1 rounded-full border-2 border-[#e9c97c]" />}
          </span>
        ))}
      </div>
      <div key={step} className={`flex-1 flex flex-col gap-[6px] px-3 py-2 ${still ? '' : 'wt-slide'}`}>
        <span className="text-[13px] font-display font-medium text-[#33402f]">{view ? view[0]!.toUpperCase() + view.slice(1) : place}</span>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`relative h-[22px] rounded-[7px] ${i === Math.max(0, step) % 4 && step >= 0 ? 'bg-[#fbf6ea] border border-[#b39563]' : 'bg-white border border-[#e2d7bc]'}`}>
            <span className="absolute left-2 top-[8px] h-[5px] rounded-full bg-[#d9cfb6]" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
            {i === Math.max(0, step) % 4 && step >= 0 && !still && <span className="wt-tap absolute right-2 top-[3px] w-4 h-4 rounded-full border-2 border-[#e9c97c]" />}
          </span>
        ))}
        <span className="mt-auto self-center py-[4px] px-3 rounded-full bg-[#33402f] text-[#fbf8f2] text-[9px]">{step < 0 ? `Open ${place}` : `Step ${step + 1}`}</span>
      </div>
    </div>
  );
}

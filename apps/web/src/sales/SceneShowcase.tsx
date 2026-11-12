import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SceneOverlay } from '../guest/invitation/Scene';
import { SIGNATURE, SIGNATURE_NAMES, themeOf, themeLabel } from '../guest/themeKit';
import { SAMPLE } from './sample';

/**
 * The front page's row of phones: each Signature design opening by itself, over and over (closed, the tap,
 * open to the card, closed again), a little apart from each other. Only while on screen, and still for
 * anyone who prefers less motion. Tap one to open the full sample in that design.
 */
const SHOWN = SIGNATURE_NAMES.slice(0, 5);
const CYCLE = 6600;

function Phone({ name, delay, playing }: { name: string; delay: number; playing: boolean }) {
  const [phase, setPhase] = useState(0);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const timers: number[] = [];
    const go = (at: number, fn: () => void) => timers.push(window.setTimeout(fn, at));
    const loop = () => {
      setPhase(0);
      go(1800, () => setPhase(1));
      go(3700, () => setPhase(2));
      go(4700, () => setPhase(3));
      go(CYCLE, () => {
        setRun((r) => r + 1);
        loop();
      });
    };
    go(delay, loop);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [playing, delay]);
  const t = themeOf(name);
  const d = SIGNATURE[name]!;
  return (
    <Link
      to={`/demo?theme=${encodeURIComponent(name)}`}
      aria-label={`Open the sample in ${themeLabel(name)}`}
      className="flex-none flex flex-col items-center gap-3 no-underline snap-center"
      style={{ color: 'inherit' }}
    >
      <span className="relative block w-[176px] h-[360px] rounded-[30px] p-[7px] bg-[#1b1d1a] shadow-[0_24px_50px_rgba(20,25,18,.28)]">
        <span className="relative block w-full h-full rounded-[24px] overflow-hidden" style={{ background: t.b1 ?? '#fbf8f2' }}>
          {/* The card underneath, as it looks once open. */}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center" style={{ color: t.dg ?? '#33402f' }}>
            <span className="text-[10px] tracking-[.24em] uppercase opacity-80">Together with their families</span>
            <span style={{ fontFamily: "'Pinyon Script', cursive", fontSize: 30, lineHeight: 1.1 }}>{SAMPLE.couple}</span>
            <span className="block w-10 h-px" style={{ background: t.acc ?? '#b39563' }} />
            <span className="text-[12px]">{SAMPLE.date}</span>
            <span className="text-[11px] opacity-80">{SAMPLE.venue}</span>
          </span>
          <SceneOverlay key={run} contained kind={d.scene} phase={phase} colours={{ paper: t.b1 ?? '#fbf8f2', ink: t.dg ?? '#33402f', accent: t.acc ?? '#b39563', soft: t.b2 ?? '#efe6d3', envelope: d.envelope }} initials="H & T" guestName={SAMPLE.guests} />
        </span>
      </span>
      <span className="flex flex-col items-center gap-[2px]">
        <span className="text-[15px] font-semibold">{themeLabel(name)}</span>
        <span className="text-[12px] max-w-[176px] text-center" style={{ color: '#5b6a52' }}>
          {d.style}
        </span>
      </span>
    </Link>
  );
}

export function SceneShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setPlaying(!!e?.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} role="list" aria-label="Signature designs" className="flex gap-6 overflow-x-auto snap-x snap-mandatory px-4 pb-4 -mx-4 md:justify-center">
      {SHOWN.map((n, i) => (
        <div role="listitem" key={n}>
          <Phone name={n} delay={i * 900} playing={playing} />
        </div>
      ))}
    </div>
  );
}

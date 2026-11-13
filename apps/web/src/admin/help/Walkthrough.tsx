import { HELP_PLACES, HELP_SCENES, helpSayLine, helpVoiceUrl, speakable, videoEmbed, type HelpArticle, type HelpScene } from '@wp/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

const SPEEDS = [0.9, 1, 1.25] as const;
const remembered = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private browsing: just this time */
  }
};

/**
 * Help's video walkthroughs. A recorded video plays when a guide has one (`video`); otherwise an animated
 * walkthrough plays like a short video. For each step the phone shows that step's own screen (HELP_SCENES):
 * the menu item and page tab lit up, what's on the page, the fields being typed into, the button being
 * tapped and what happens. The step is on screen, with a progress bar per step, and it's narrated in a
 * natural voice (HELP_SAY, recorded once by Workers AI and kept: /api/a/help/voice), with captions. The
 * phone's animation stretches to fit the voice, and the next step's voice loads while this one plays. No
 * natural voice (not switched on, or it fails): the device's best voice reads the same words, and with no
 * voice at all it plays on by itself. At the end: Take me there. Several guides in a row make the tour.
 */
export function Walkthrough({ guides, where, onClose }: { guides: HelpArticle[]; where: (a: HelpArticle) => string; onClose: () => void }) {
  const scenes = guides.flatMap((a) => [{ a, step: -1 }, ...a.steps.map((_, step) => ({ a, step }))]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  // Narrated by default, unless they turned it off before.
  const [voice, setVoiceState] = useState(() => remembered('wp-help-voice', 'on') !== 'off');
  const setVoice = (on: boolean) => {
    setVoiceState(on);
    remember('wp-help-voice', on ? 'on' : 'off');
  };
  const [speed, setSpeedState] = useState<number>(() => SPEEDS.find((s) => String(s) === remembered('wp-help-speed', '1')) ?? 1);
  const setSpeed = (s: number) => {
    setSpeedState(s);
    remember('wp-help-speed', String(s));
  };
  const [captions, setCaptionsState] = useState(() => remembered('wp-help-captions', 'on') !== 'off');
  const setCaptions = (on: boolean) => {
    setCaptionsState(on);
    remember('wp-help-captions', on ? 'on' : 'off');
  };
  // The natural voice, until it turns out not to be there (then the device's voice for the rest); a step
  // whose recording fails on its own is read by the device's voice, and the next step tries again.
  const [natural, setNatural] = useState(true);
  const [deviceFor, setDeviceFor] = useState<number | null>(null);
  const [voiceMs, setVoiceMs] = useState<number | null>(null); // how long this step's recording plays
  const [left, setLeft] = useState(1); // share of this scene still to play
  const closeRef = useRef<HTMLButtonElement>(null);
  const done = at >= scenes.length;
  const scene = scenes[Math.min(at, scenes.length - 1)]!;
  const text = scene.step < 0 ? scene.a.title : scene.a.steps[scene.step]!;
  const said = speakable(helpSayLine(scene.a.id, scene.step) ?? text);
  const url = helpVoiceUrl(scene.a.id, scene.step);
  const recorded = guides.length === 1 ? videoEmbed(guides[0]!.video) : null;
  const still = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const shot = scene.step >= 0 ? HELP_SCENES[scene.a.id]?.[scene.step] : undefined;
  const hasSpeech = typeof speechSynthesis !== 'undefined';
  const mode: 'natural' | 'device' | 'quiet' = !voice || recorded || done ? 'quiet' : natural && url && deviceFor !== at ? 'natural' : hasSpeech ? 'device' : 'quiet';
  // The phone's animation, stretched to the length of the voice (never rushed).
  const pace = shot && voiceMs ? Math.min(3, Math.max(1, (voiceMs * 0.85) / playOut(shot).end)) : 1;
  // Long enough to read (about a third of a second a word) and to watch the step play out on the phone.
  const ms = (scene.step < 0 ? 2600 : Math.max(4500, text.split(/\s+/).length * 330, shot ? playOut(shot).end + 1800 : 0)) / speed;
  const voices = useVoices();
  const [voiceName, setVoiceName] = useState('');
  const chosen = voices.find((v) => v.name === voiceName) ?? voices[0];
  const shownAt = useRef(Date.now());
  shownAt.current = useMemo(() => Date.now(), [at]); // eslint-disable-line
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resume = useRef<{ at: number; t: number } | null>(null);
  const loaded = useRef(new Map<string, Promise<string>>());
  const go = useCallback((n: number) => {
    setAt(Math.max(0, Math.min(n, scenes.length)));
    setLeft(1);
    setVoiceMs(null);
    resume.current = null;
  }, [scenes.length]);

  /** A recording, fetched once (the browser keeps it a week) and played from memory. */
  const load = useCallback((src: string) => {
    let p = loaded.current.get(src);
    if (!p) {
      p = fetch(src, { credentials: 'same-origin' })
        .then((r) => {
          if (!r.ok) throw Object.assign(new Error('voice'), { status: r.status });
          return r.blob();
        })
        .then((b) => URL.createObjectURL(b));
      loaded.current.set(src, p);
      p.catch(() => loaded.current.delete(src));
    }
    return p;
  }, []);
  useEffect(
    () => () => {
      audioRef.current?.pause();
      for (const p of loaded.current.values()) p.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
    },
    [],
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // On a button, a link or a box, keys do their own job (Space presses it, arrows change a choice).
      if ((e.target as HTMLElement).closest?.('button, a, select, input, textarea')) return;
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

  // The clock with no voice: ticks the progress bar, then moves on.
  useEffect(() => {
    if (recorded || done || !playing || mode !== 'quiet') return;
    const started = Date.now() - (1 - left) * ms;
    const id = window.setInterval(() => {
      const share = 1 - (Date.now() - started) / ms;
      if (share <= 0) go(at + 1);
      else setLeft(share);
    }, 80);
    return () => window.clearInterval(id);
  }, [at, playing, mode, done, recorded, ms]); // eslint-disable-line

  // Move on once the voice has finished and the phone has finished showing the step.
  const afterVoice = useCallback(
    (then: () => void) => {
      const rest = (shot ? playOut(shot, pace).end + 1200 : 0) - (Date.now() - shownAt.current);
      return setTimeout(then, Math.max(600, rest));
    },
    [shot, pace],
  );
  // The latest timing, read when the voice ends (so the phone's timing settling never restarts the voice).
  const afterRef = useRef(afterVoice);
  afterRef.current = afterVoice;

  // The natural voice: this step's recording, the progress bar following it.
  useEffect(() => {
    if (mode !== 'natural' || !playing || !url) return;
    let off = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    const a = (audioRef.current ??= new Audio());
    const fail = (status?: number) => {
      if (off) return;
      // Not there at all (not switched on, signed out): the device's voice from now on. Otherwise just this step.
      if (status === 503 || status === 401 || status === 403 || status === 404) setNatural(false);
      else setDeviceFor(at);
    };
    load(url)
      .then((src) => {
        if (off) return;
        a.onloadedmetadata = () => {
          if (Number.isFinite(a.duration)) setVoiceMs((a.duration * 1000) / speed);
          if (resume.current?.at === at) a.currentTime = resume.current.t;
        };
        a.ontimeupdate = () => {
          if (a.duration) setLeft(1 - a.currentTime / a.duration);
        };
        a.onended = () => {
          resume.current = null;
          setLeft(0);
          wait = afterRef.current(() => go(at + 1));
        };
        a.onerror = () => fail();
        // Paused after it had finished: just carry on to the next step.
        if (a.src === src && a.ended) {
          wait = afterRef.current(() => go(at + 1));
          return;
        }
        if (a.src !== src) a.src = src;
        else if (resume.current?.at === at) a.currentTime = resume.current.t;
        a.playbackRate = speed;
        a.play()?.catch((e: Error) => {
          if (off) return;
          // The browser wants a tap first: pause, and Play starts it.
          if (e?.name === 'NotAllowedError') setPlaying(false);
          else if (e?.name !== 'AbortError') fail();
        });
      })
      .catch((e: { status?: number }) => fail(e?.status));
    return () => {
      off = true;
      clearTimeout(wait);
      if (!a.ended && a.currentTime > 0) resume.current = { at, t: a.currentTime };
      a.onloadedmetadata = a.ontimeupdate = a.onended = a.onerror = null;
      a.pause();
    };
  }, [mode, playing, url, at, speed, load, go]);

  // While one step plays, the next step's recording loads.
  useEffect(() => {
    if (mode !== 'natural') return;
    const next = scenes[at + 1];
    const src = next && helpVoiceUrl(next.a.id, next.step);
    if (src) load(src).catch(() => undefined);
  }, [at, mode]); // eslint-disable-line

  // The device's own voice, when there's no natural one.
  useEffect(() => {
    if (mode !== 'device' || !playing) return;
    const u = new SpeechSynthesisUtterance(said);
    if (chosen) u.voice = chosen;
    u.lang = chosen?.lang ?? 'en-AU';
    u.rate = 0.97 * speed;
    let wait: ReturnType<typeof setTimeout> | undefined;
    // Said, or the speech failed (blocked, no voice): move on either way.
    const next = () => {
      wait = afterRef.current(() => go(at + 1));
    };
    u.onend = next;
    u.onerror = next;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setLeft(0.5);
    return () => {
      u.onend = null;
      u.onerror = null;
      clearTimeout(wait);
      speechSynthesis.cancel();
    };
  }, [at, playing, mode, said, go, chosen, speed]);
  useEffect(() => () => void (typeof speechSynthesis !== 'undefined' && speechSynthesis.cancel()), []);

  /** Play pressed: start the recording inside the tap itself, which phones ask for before sound plays. */
  const play = () => {
    if (done) go(0);
    const next = done || !playing;
    if (next && mode === 'natural' && audioRef.current?.src) audioRef.current.play()?.catch(() => undefined);
    setPlaying(next);
  };

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
              <Phone key={at} place={place} view={view} step={scene.step} still={still} shot={done ? undefined : shot} playing={playing} pace={pace} />
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
            {/* Captions: the words being said. */}
            {voice && captions && !done && (
              <p aria-hidden data-testid="captions" className="mx-4 mb-3 py-2 px-4 rounded-[10px] bg-[rgba(0,0,0,.35)] text-[15px] leading-snug text-center text-[#fbf8f2]">
                {said}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap px-4 pb-4">
              <div className="flex gap-2">
                <Ctl label="Back" onClick={() => go(at - 1)} disabled={at === 0}>
                  ‹
                </Ctl>
                <Ctl label={playing ? 'Pause' : 'Play'} onClick={play}>
                  {done ? '↺' : playing ? '❚❚' : '▶'}
                </Ctl>
                <Ctl label="Next" onClick={() => go(at + 1)} disabled={done}>
                  ›
                </Ctl>
              </div>
              <span className="flex items-center gap-2 flex-wrap">
                {/* The device's voices, only when it's reading (no natural voice). */}
                {mode === 'device' && voices.length > 1 && (
                  <select aria-label="Voice" value={chosen?.name ?? ''} onChange={(e) => setVoiceName(e.target.value)} className="max-w-[160px] py-[7px] px-2 rounded-full bg-[#2a2f27] text-[#fbf8f2] border border-[rgba(255,255,255,.25)] text-[13px]">
                    {voices.slice(0, 8).map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name.replace(/^(Microsoft|Google)\s+/, '').replace(/\s*-\s*English.*$/, '')}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" aria-label={`Speed: ${speed}×`} onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]!)} className="min-w-[56px] py-[8px] px-3 rounded-full border border-[rgba(255,255,255,.3)] bg-transparent text-[#fbf8f2] text-[14px] cursor-pointer">
                  {speed}×
                </button>
                <button type="button" aria-pressed={captions} aria-label="Captions" onClick={() => setCaptions(!captions)} className={`py-[8px] px-3 rounded-full border text-[13px] font-semibold cursor-pointer ${captions ? 'bg-[#fbf8f2] text-[#1d211b] border-[#fbf8f2]' : 'bg-transparent text-[#fbf8f2] border-[rgba(255,255,255,.3)]'}`}>
                  CC
                </button>
                <button type="button" aria-pressed={voice} onClick={() => setVoice(!voice)} className={`py-[8px] px-4 rounded-full border text-[14px] cursor-pointer ${voice ? 'bg-[#e9c97c] text-[#1d211b] border-[#e9c97c]' : 'bg-transparent text-[#fbf8f2] border-[rgba(255,255,255,.3)]'}`}>
                  {voice ? '🔊 Reading aloud' : '🔈 Read it aloud'}
                </button>
              </span>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 px-4 pb-4">
          <Link to={where(done || recorded ? last : scene.a)} onClick={onClose} className="py-[10px] px-5 rounded-full bg-[#e9c97c] !text-[#1d211b] text-[15px] font-semibold no-underline">
            Take me there
          </Link>
        </div>
      </div>
      <style>{`.wt-in{animation:wtIn .6s ease both}@keyframes wtIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.wt-tap{animation:wtTap 1.6s ease-out infinite}@keyframes wtTap{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.8);opacity:0}}.wt-slide{animation:wtSlide .7s ease both}.wt-caret{animation:wtCaret .8s steps(1) infinite}@keyframes wtCaret{50%{opacity:0}}@keyframes wtSlide{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}`}</style>
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

/**
 * The best English voices this device has, most natural first: the "Natural", "Neural", "Online",
 * "Premium" and "Enhanced" ones (Edge, Windows, Safari, Android), Australian first, then British and others.
 */
function useVoices() {
  const [list, setList] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const score = (v: SpeechSynthesisVoice) =>
      (/natural|neural|premium|enhanced/i.test(v.name) ? 20 : /online/i.test(v.name) ? 12 : 0) + (/google/i.test(v.name) ? 6 : 0) + (/en[-_]AU/i.test(v.lang) ? 5 : /en[-_](GB|NZ|IE)/i.test(v.lang) ? 3 : 1) - (/compact|espeak/i.test(v.name) ? 10 : 0);
    const load = () => setList(speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)).sort((a, b) => score(b) - score(a)));
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return list;
}

/** When each part of a step plays on the phone (ms from the start): each field typed in turn, then the tap, then what happens. */
function playOut(shot: HelpScene, pace = 1) {
  const fields = (shot.fields ?? []).map((_, i) => (500 + i * 1500) * pace);
  const tap = (500 + (shot.fields?.length ?? 0) * 1500 + (shot.fields?.length ? 300 : 700)) * pace;
  const then = shot.tap ? tap + 1100 * pace : tap;
  return { fields, tap, then, end: shot.then ? then + 600 : tap + 900 };
}

/**
 * The phone: the admin's menu with the right place lit up, the page's own tab, and the step played out on
 * the page itself: its rows, the fields being typed into, the button pressed, then what happens.
 */
function Phone({ place, view, step, still, shot, playing, pace = 1 }: { place: string; view?: string; step: number; still: boolean; shot?: HelpScene; playing: boolean; pace?: number }) {
  const [t, setT] = useState(still ? 1e9 : 0);
  useEffect(() => {
    if (still || !playing) return;
    const from = Date.now() - t;
    const id = window.setInterval(() => setT(Date.now() - from), 60);
    return () => window.clearInterval(id);
  }, [playing, still]); // eslint-disable-line
  const at = shot?.at ?? [place, ...(view ? [view[0]!.toUpperCase() + view.slice(1)] : [])];
  const top = at[0]!;
  const menu = [...new Set(['Overview', top, top === 'Guest list' ? 'Texts' : 'Guest list'])].slice(0, 3);
  const plan = shot ? playOut(shot, pace) : null;
  const typed = (i: number, value: string) => {
    if (!plan) return value;
    const share = Math.max(0, Math.min(1, (t - plan.fields[i]!) / 1100));
    return value.slice(0, Math.round(value.length * share));
  };
  const tapping = !!plan && !!shot?.tap && t >= plan.tap && t < plan.tap + 900;
  const shown = !!plan && t >= plan.then;
  return (
    <div aria-hidden className="justify-self-center w-[min(260px,62vw)] max-[560px]:w-[200px] aspect-[9/17] rounded-[32px] border-[7px] border-[#0d0f0c] bg-[var(--adm-bg,#f6f0e2)] shadow-[0_18px_40px_rgba(0,0,0,.5)] overflow-hidden flex flex-col text-[var(--adm-ink,#33402f)]">
      <div className="h-5 flex justify-center items-center flex-none">
        <span className="w-14 h-[6px] rounded-full bg-[#0d0f0c]" />
      </div>
      <div className="flex gap-1 px-2 pt-2 overflow-hidden flex-none">
        {menu.map((m) => (
          <span key={m} className={`relative flex-none py-[3px] px-2 rounded-full text-[9px] font-semibold ${m === top ? 'bg-[#33402f] text-[#fbf8f2]' : 'bg-[#e9e2cc] text-[var(--adm-muted,#5b6a52)]'}`}>
            {m}
            {m === top && step < 0 && !still && <span className="wt-tap absolute -inset-1 rounded-full border-2 border-[#e9c97c]" />}
          </span>
        ))}
      </div>
      {at[1] && (
        <div className="px-3 pt-[6px] flex-none">
          <span className="inline-block pb-[1px] border-b-2 border-[#33402f] text-[9px] font-semibold">{at[1]}</span>
        </div>
      )}
      <div className={`flex-1 min-h-0 flex flex-col gap-[6px] px-3 py-2 overflow-hidden ${still ? '' : 'wt-slide'}`}>
        <span className="text-[13px] font-display font-medium leading-tight">{at[1] ?? top}</span>
        {!shot ? (
          [0, 1, 2].map((i) => (
            <span key={i} className="h-[20px] rounded-[7px] bg-white border border-[var(--adm-line,#e2d7bc)]">
              <span className="block mt-[7px] ml-2 h-[5px] rounded-full bg-[#d9cfb6]" style={{ width: `${40 + i * 15}%` }} />
            </span>
          ))
        ) : (
          <>
            {shot.rows?.map((r) => (
              <span key={r} className="py-[5px] px-2 rounded-[7px] bg-white border border-[var(--adm-line,#e2d7bc)] text-[9px] leading-snug">
                {r}
              </span>
            ))}
            {shot.fields?.map(([label, value], i) => {
              const now = typed(i, value);
              const active = !!plan && t >= plan.fields[i]! && t < plan.fields[i]! + 1300;
              return (
                <span key={label} className="flex flex-col gap-[2px]">
                  <span className="text-[8px] text-[var(--adm-muted,#5b6a52)]">{label}</span>
                  <span className={`min-h-[20px] py-[4px] px-2 rounded-[6px] bg-white border text-[9px] ${active ? 'border-[#b39563] shadow-[0_0_0_2px_rgba(233,201,124,.45)]' : 'border-[var(--adm-line,#d3c6a4)]'}`}>
                    {now}
                    {active && !still && <span className="wt-caret">|</span>}
                  </span>
                </span>
              );
            })}
            {shot.tap && (
              <span className={`relative self-start mt-1 py-[5px] px-3 rounded-full text-[9px] font-semibold transition-transform ${tapping ? 'scale-95 bg-[#4b5a40]' : 'bg-[#33402f]'} text-[#fbf8f2]`}>
                {shot.tap}
                {tapping && !still && <span className="wt-tap absolute -inset-1 rounded-full border-2 border-[#e9c97c]" />}
              </span>
            )}
            {shot.then && shown && <span className={`mt-auto py-[6px] px-2 rounded-[8px] bg-[#e7eedb] text-[#2f3d24] text-[9px] font-semibold ${still ? '' : 'wt-in'}`}>{shot.then}</span>}
          </>
        )}
      </div>
    </div>
  );
}

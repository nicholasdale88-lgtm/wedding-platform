import { useEffect, useRef, useState } from 'react';
import { playerFor, type Player } from '../audio';
import type { GuidePayload } from '../invitation/api';

/** Rain likely at any hour of the event (the same test the forecast tip uses). */
export const rainLikely = (data: GuidePayload) => !!data.weather?.hours.some((h) => Number(h.rain) >= 40);

/**
 * Around the night-before guide (outside the design's own page): the couple's music, played from a
 * tap and looping until paused, and, when rain is forecast, the wet-weather plan as a notice.
 */
export function GuideExtras({ data, ink, wetInView = false }: { data: GuidePayload; ink: string; wetInView?: boolean }) {
  const g = data.guide;
  const player = useRef<Player | null>(null);
  const [playing, setPlaying] = useState(false);
  const [wetOpen, setWetOpen] = useState(true);
  const music = g.music?.trim() ?? '';

  useEffect(() => {
    player.current = playerFor(music, true);
    return () => player.current?.stop();
  }, [music]);

  const toggle = () => {
    if (!player.current) return;
    if (playing) player.current.stop();
    else {
      // A stopped YouTube player is removed: make a fresh one each time it starts again.
      if (/youtu/.test(music)) player.current = playerFor(music, true);
      player.current?.setMuted(false);
      player.current?.play();
    }
    setPlaying(!playing);
  };

  const wet = !wetInView && rainLikely(data) && !!g.wetPlan?.trim();
  return (
    <>
      {music && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          className="fixed z-40 bottom-[max(16px,env(safe-area-inset-bottom))] left-4 py-[10px] px-4 rounded-full border-0 text-[16px] cursor-pointer shadow-[0_6px_18px_rgba(30,30,30,.2)] max-w-[60vw] truncate"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: ink, color: '#fbf8f2' }}
        >
          {playing ? '❚❚ ' : '♪ '}
          {g.musicTitle?.trim() || (playing ? 'Pause the music' : 'Play our music')}
        </button>
      )}
      {wet && wetOpen && (
        <div role="note" aria-label="Wet-weather plan" className="fixed z-40 top-3 inset-x-3 sm:left-auto sm:right-4 sm:w-[380px] p-4 rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,.18)] bg-[#fbf8f2]" style={{ color: ink, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          <div className="flex justify-between items-start gap-3">
            <strong className="text-[19px] font-semibold">Rain is forecast: our wet-weather plan</strong>
            <button type="button" aria-label="Close" onClick={() => setWetOpen(false)} className="p-0 border-0 bg-transparent text-[22px] leading-none cursor-pointer" style={{ color: ink }}>
              ×
            </button>
          </div>
          <p className="m-0 mt-1 text-[17px] leading-[1.35] whitespace-pre-wrap">{g.wetPlan}</p>
        </div>
      )}
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { SAMPLE } from './sample';

/** The phone the invitation is laid out for (an iPhone's screen, in CSS pixels). */
const PHONE_W = 390;
const PHONE_H = 844;

/**
 * The front page's phone: the real guest invitation (/demo?embed=1, the same page couples send), running
 * inside a phone frame. Visitors tap the wax seal and the envelope opens exactly as it will for their guests.
 * The invitation is laid out at a real phone's size and shrunk to the frame, so it looks exactly as it does
 * on a guest's phone instead of being squeezed into a narrower screen.
 */
export function HeroInvite({ src = '/demo?embed=1', caption = true }: { src?: string; caption?: boolean } = {}) {
  // A new frame plays the envelope again from the start.
  const [run, setRun] = useState(0);
  const screen = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / PHONE_W);
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);
  return (
    <figure className="m-0 flex flex-col items-center gap-4">
      {/* The frame keeps a phone's proportions at any width. */}
      <div
        className="relative rounded-[44px] p-[10px] bg-[#151a13] shadow-[0_40px_80px_rgba(27,34,24,.28),inset_0_0_0_2px_#3a4236]"
        style={{ width: 'min(300px, 82vw)' }}
      >
        <span aria-hidden className="absolute z-10 top-[18px] left-1/2 w-[78px] h-[20px] -ml-[39px] rounded-full bg-[#151a13]" />
        <div ref={screen} className="relative w-full overflow-hidden rounded-[34px] bg-[#f6f0e2]" style={{ aspectRatio: `${PHONE_W} / ${PHONE_H}` }}>
          {scale > 0 && (
            <iframe
              key={`${src}#${run}`}
              src={src}
              title={`Sample invitation for ${SAMPLE.couple}: tap the seal to open it`}
              loading="lazy"
              className="absolute top-0 left-0 block border-0 bg-[#f6f0e2]"
              style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}
            />
          )}
        </div>
      </div>
      {caption && (
        <figcaption className="flex flex-col items-center gap-1 text-[14px] text-center" style={{ color: '#5b6a52' }}>
          <span>Tap the seal. This is the real invitation, with sample names.</span>
          <button type="button" onClick={() => setRun((n) => n + 1)} className="p-0 border-0 bg-transparent underline underline-offset-2 cursor-pointer text-[14px]" style={{ color: '#33402f' }}>
            Play it again
          </button>
        </figcaption>
      )}
    </figure>
  );
}

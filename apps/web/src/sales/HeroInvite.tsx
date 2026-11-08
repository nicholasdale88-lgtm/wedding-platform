import { useState } from 'react';
import { SAMPLE } from './sample';

/**
 * The front page's phone: the real guest invitation (/demo?embed=1, the same page couples send), running
 * inside a phone frame. Visitors tap the wax seal and the envelope opens exactly as it will for their guests.
 * It's a page of its own in a frame because the invitation fills the whole screen of the phone it's on.
 */
export function HeroInvite() {
  // A new frame plays the envelope again from the start.
  const [run, setRun] = useState(0);
  return (
    <figure className="m-0 flex flex-col items-center gap-4">
      <div className="relative w-[300px] h-[620px] max-w-[86vw] rounded-[48px] p-[11px] bg-[#151a13] shadow-[0_40px_80px_rgba(27,34,24,.28),inset_0_0_0_2px_#3a4236]">
        <span aria-hidden className="absolute z-10 top-[19px] left-1/2 w-[84px] h-[22px] -ml-[42px] rounded-full bg-[#151a13]" />
        <iframe
          key={run}
          src="/demo?embed=1"
          title={`Sample invitation for ${SAMPLE.couple}: tap the seal to open it`}
          loading="lazy"
          className="block w-full h-full rounded-[38px] border-0 bg-[#f6f0e2]"
        />
      </div>
      <figcaption className="flex flex-col items-center gap-1 text-[14px] text-center" style={{ color: '#5b6a52' }}>
        <span>Tap the seal. This is the real invitation, with sample names.</span>
        <button type="button" onClick={() => setRun((n) => n + 1)} className="p-0 border-0 bg-transparent underline underline-offset-2 cursor-pointer text-[14px]" style={{ color: '#33402f' }}>
          Play it again
        </button>
      </figcaption>
    </figure>
  );
}

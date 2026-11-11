import { LogoMark } from './Art';
import { SAMPLE } from './sample';

/**
 * The front page's phone: what The Yes List does that a pretty invitation alone doesn't. A guest gets their
 * invitation by text, replies "yes" with a dietary need, and it's noted for them. The messages are the app's
 * own wording; the bubbles arrive one after another (all at once with reduced motion).
 */
const first = SAMPLE.couple.split(' & ');
const THREAD: { from: 'them' | 'guest' | 'card'; text: string }[] = [
  { from: 'them', text: `Hi Charlotte, ${SAMPLE.couple} would love you to celebrate with them. Your invitation and RSVP:` },
  { from: 'card', text: '' },
  { from: 'guest', text: 'Yes!! Wouldn’t miss it. Tom’s vegetarian' },
  { from: 'them', text: 'Wonderful, Charlotte! You’re down as coming, and Tom’s vegetarian meal is noted for the caterer.' },
];

export function TextThread() {
  return (
    <figure className="m-0 flex flex-col items-center">
      <style>{`
@keyframes yl-bubble { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: none } }
.yl-bubble { opacity: 0; animation: yl-bubble .5s cubic-bezier(.2,.8,.2,1) forwards }
@media (prefers-reduced-motion: reduce) { .yl-bubble { opacity: 1; animation: none } }
`}</style>
      <div
        role="img"
        aria-label={`A text conversation: ${SAMPLE.couple} invite Charlotte; she replies yes and says Tom is vegetarian; it's noted for the caterer.`}
        className="relative rounded-[44px] p-[10px] bg-[#0e110d] shadow-[0_40px_80px_rgba(0,0,0,.45),inset_0_0_0_2px_#3a4236]"
        style={{ width: 'min(320px, 84vw)' }}
      >
        <span aria-hidden className="absolute z-10 top-[18px] left-1/2 w-[86px] h-[24px] -ml-[43px] rounded-full bg-[#0e110d]" />
        <div className="relative overflow-hidden rounded-[34px] bg-white flex flex-col" style={{ aspectRatio: '390 / 800' }}>
          <div className="pt-[46px] pb-3 flex flex-col items-center gap-1 border-b border-[#e6e6e9]">
            <LogoMark size={40} />
            <span className="text-[12px] text-[#1c1c1e] font-medium">{SAMPLE.couple}</span>
          </div>
          <div className="flex-1 flex flex-col gap-2 px-3 pt-3 text-[13.5px] leading-[1.32]">
            <span className="self-center text-[10.5px] text-[#8e8e93]">Text Message · Today 10:02</span>
            {THREAD.map((m, i) => {
              const style = { animationDelay: `${0.5 + i * 1.1}s` };
              if (m.from === 'card')
                return (
                  <div key={i} className="yl-bubble self-start w-[78%] rounded-[16px] overflow-hidden bg-[#e9e9eb]" style={style}>
                    <div className="flex flex-col items-center justify-center gap-1 py-5 px-3 text-center" style={{ background: 'linear-gradient(160deg,#f3ecd9,#e6dcc4)' }}>
                      <span className="text-[9px] tracking-[.22em] uppercase text-[#5b6a52]">You’re invited</span>
                      <span className="text-[20px] leading-tight text-[#33402f]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                        {first[0]} &amp; {first[1]}
                      </span>
                      <span className="text-[10px] text-[#5b6a52]">{SAMPLE.date}</span>
                    </div>
                    <div className="px-3 py-2">
                      <div className="text-[11.5px] font-semibold text-[#1c1c1e]">Your invitation and RSVP</div>
                      <div className="text-[10.5px] text-[#8e8e93]">Tap to open</div>
                    </div>
                  </div>
                );
              const mine = m.from === 'guest';
              return (
                <div key={i} className={`yl-bubble max-w-[80%] px-3 py-2 rounded-[18px] ${mine ? 'self-end bg-[#34c759] text-white rounded-br-[6px]' : 'self-start bg-[#e9e9eb] text-[#1c1c1e] rounded-bl-[6px]'}`} style={style}>
                  {m.text}
                </div>
              );
            })}
          </div>
          <div className="mx-3 mb-6 mt-2 py-[7px] px-3 rounded-full border border-[#d1d1d6] text-[12px] text-[#aeaeb2]">Text Message</div>
        </div>
      </div>
    </figure>
  );
}

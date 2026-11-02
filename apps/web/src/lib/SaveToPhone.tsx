import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'react';
import { canOffer, install, installed, isIos, onInstallChange } from './install';

const KEY = 'wp-saved-to-phone';
const isPhone = () => (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse) and (max-width: 900px)').matches) || isIos();

/** A QR code as one SVG path (crisp at any size, no canvas). */
function QrSvg({ text, size = 168 }: { text: string; size?: number }) {
  const d = useMemo(() => {
    try {
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      const n = q.getModuleCount();
      let p = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c + 2} ${r + 2}h1v1h-1z`;
      return { p, n: n + 4 };
    } catch {
      return null;
    }
  }, [text]);
  if (!d) return null;
  return (
    <svg viewBox={`0 0 ${d.n} ${d.n}`} width={size} height={size} role="img" aria-label="QR code: scan it with your phone’s camera" className="flex-none rounded-[10px] bg-white" shapeRendering="crispEdges">
      <path d={d.p} fill="#33402f" />
    </svg>
  );
}

/**
 * Setup → "Keep this on your phone": on a phone, one tap adds it to the home screen (or the two iPhone
 * steps), with Share or Copy for the link; on a computer, a QR code to scan with the phone's camera, which
 * opens this same page there. Hidden once it's opened from the home screen, or after "Done".
 */
export function SaveToPhone({ url, what = 'your wedding admin' }: { url: string; what?: string }) {
  const [, redraw] = useState(0);
  const [done, setDone] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const [steps, setSteps] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => onInstallChange(() => redraw((n) => n + 1)), []);
  if (done || installed()) return null;
  const finish = () => {
    setDone(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* not essential */
    }
  };
  const share = async () => {
    try {
      if (isPhone() && navigator.share) await navigator.share({ title: 'Our wedding', url });
      else {
        await navigator.clipboard.writeText(url);
        setNote('Link copied');
      }
    } catch {
      /* closed the share sheet */
    }
  };
  const btn = 'py-[9px] px-4 rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[14px] font-medium cursor-pointer';
  const ghost = 'py-[9px] px-4 rounded-full border border-[#c6b794] bg-white text-[#33402f] text-[14px] cursor-pointer';
  const phone = isPhone();
  return (
    <section aria-label="Keep this on your phone" className="flex gap-4 items-center flex-wrap p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      {!phone && <QrSvg text={url} />}
      <div className="flex-1 min-w-[220px] flex flex-col gap-2 text-[15px]">
        <strong className="text-[17px]">Keep {what} on your phone</strong>
        {phone ? (
          <span>One tap and it sits on your home screen like an app, signed in and ready.</span>
        ) : (
          <span>Point your phone’s camera at the code: this page opens there. Then tap Add to home screen (or on an iPhone, Share → Add to Home Screen).</span>
        )}
        {steps && (
          <ol className="m-0 pl-5 flex flex-col gap-1">
            <li>
              Tap <strong>Share</strong> (the square with an arrow, at the bottom of Safari).
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </li>
          </ol>
        )}
        <div className="flex gap-2 flex-wrap items-center">
          {phone && canOffer() && (
            <button type="button" className={btn} onClick={() => void install().then(() => installed() && finish())}>
              Add to home screen
            </button>
          )}
          {phone && !canOffer() && isIos() && !steps && (
            <button type="button" className={btn} onClick={() => setSteps(true)}>
              Show me how
            </button>
          )}
          <button type="button" className={ghost} onClick={() => void share()}>
            {phone ? 'Share the link' : 'Copy the link'}
          </button>
          <button type="button" className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#5b6a52]" onClick={finish}>
            Done, hide this
          </button>
          {note && (
            <span role="status" className="text-[13px] text-[#5b6a52]">
              {note}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

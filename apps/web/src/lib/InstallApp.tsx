import { useEffect, useState } from 'react';
import { canOffer, install, installed, isIos, onInstallChange } from './install';

/**
 * "Add to your home screen": one tap where the browser offers it (Android, Chrome, Edge), or the two
 * steps for an iPhone. Hidden once it's opened from the home screen. `tone` suits admin or guest pages.
 */
export function InstallApp({ what, tone = 'admin' }: { what: string; tone?: 'admin' | 'guest' }) {
  const [, redraw] = useState(0);
  const [ios, setIos] = useState(false);
  useEffect(() => onInstallChange(() => redraw((n) => n + 1)), []);
  if (installed()) return null;
  const guest = tone === 'guest';
  const box = guest ? 'flex flex-col gap-2 p-4 rounded-[16px] bg-white/70 border text-[17px]' : 'flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] text-[14px]';
  const btn = guest ? 'self-start py-2 px-4 rounded-full border-0 text-[16px] cursor-pointer text-white bg-[#33402f]' : 'self-start py-2 px-4 rounded-full border-0 text-[14px] font-medium cursor-pointer text-[#f3ecd6] bg-[#33402f]';
  const style = guest ? { borderColor: 'rgba(0,0,0,.08)' } : undefined;
  if (canOffer())
    return (
      <div className={box} style={style}>
        <span>Keep {what} on your home screen: it opens like an app.</span>
        <button type="button" className={btn} onClick={() => void install()}>
          Add to home screen
        </button>
      </div>
    );
  if (!isIos()) return null;
  return (
    <div className={box} style={style}>
      <span>Keep {what} on your home screen: it opens like an app.</span>
      {!ios ? (
        <button type="button" className={btn} onClick={() => setIos(true)}>
          Show me how
        </button>
      ) : (
        <ol className="m-0 pl-5 flex flex-col gap-1">
          <li>
            Tap <strong>Share</strong> (the square with an arrow, at the bottom of Safari).
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
        </ol>
      )}
    </div>
  );
}

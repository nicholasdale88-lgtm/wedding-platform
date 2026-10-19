import { useEffect, useState } from 'react';
import { liveApi } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Pill, useToast } from '../ui';

/**
 * Photos → "Live photo wall": a full-screen slideshow of guests' photos and board messages for the venue's
 * screen. Switch it on to get its secret link; off again stops the link working.
 */
export function LiveWallPanel() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [s, setS] = useState<{ on: boolean; code: string | null; slug: string } | null>(null);
  useEffect(() => {
    liveApi
      .get(wid)
      .then(setS)
      .catch(() => setS(null));
  }, [wid]);
  if (!s) return null;
  const link = s.code ? `${window.location.origin}/w/${s.slug}/live?k=${s.code}` : '';
  const set = async (on: boolean) => {
    try {
      setS(await liveApi.set(wid, on));
      toast(on ? 'The photo wall is on' : 'The photo wall is off: its link no longer works');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <section aria-label="Live photo wall" className="flex flex-col gap-2 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <strong className="font-semibold text-[15px]">Live photo wall</strong>
          <p className="m-0 mt-1 text-[13px] text-[#5b6a52]">
            For the screen at the reception: guests' photos crossfade full screen as they come in, with messages from the board in between. Open the link on a laptop plugged into the
            projector (press F for full screen), or cast it to a TV.
          </p>
        </div>
        <Pill kind={s.on ? 'secondary' : 'primary'} onClick={() => void set(!s.on)}>
          {s.on ? 'Switch off' : 'Switch on'}
        </Pill>
      </div>
      {s.on && link && (
        <div className="flex gap-3 items-center flex-wrap text-[13px]">
          <code className="py-1 px-2 rounded bg-white border border-[#e2d7bc] break-all select-all">{link}</code>
          <a href={link} target="_blank" rel="noopener" className="!text-[#33402f]">
            Open it
          </a>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast('Link copied'))} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
            Copy
          </button>
        </div>
      )}
    </section>
  );
}

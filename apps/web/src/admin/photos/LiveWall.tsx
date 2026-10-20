import { useEffect, useState } from 'react';
import { albumApi, liveApi } from '../../lib/api';
import { ALL_EVENTS, useAdmin } from '../Shell';
import { Pill, useToast } from '../ui';

/** Photos → "Share the album with guests": after the day, every guest can see and save everyone's photos. */
export function AlbumSharePanel() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    albumApi
      .get(wid)
      .then((r) => setOn(r.on))
      .catch(() => setOn(null));
  }, [wid]);
  if (on === null) return null;
  return (
    <section aria-label="Share the album with guests" className="flex justify-between items-start gap-3 flex-wrap p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div>
        <strong className="font-semibold text-[15px]">Share the album with guests</strong>
        <p className="m-0 mt-1 text-[13px] text-[#5b6a52]">
          {on
            ? 'Guests can see and save everyone’s photos from the events they were at, from their own link (…/album).'
            : 'After the day, let every guest see and save everyone’s photos from the events they were at. Off until you switch it on.'}
        </p>
      </div>
      <Pill
        kind={on ? 'secondary' : 'primary'}
        onClick={async () => {
          try {
            setOn((await albumApi.set(wid, !on)).on);
            toast(on ? 'The album is private again' : 'The album is shared with guests');
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      >
        {on ? 'Stop sharing' : 'Share it'}
      </Pill>
    </section>
  );
}

/**
 * Photos → "Live photo wall": a full-screen slideshow of guests' photos and board messages for the venue's
 * screen. Switch it on to get its secret link; off again stops the link working.
 */
export function LiveWallPanel() {
  const { wid, event } = useAdmin();
  const toast = useToast();
  const [s, setS] = useState<{ on: boolean; code: string | null; slug: string } | null>(null);
  useEffect(() => {
    liveApi
      .get(wid)
      .then(setS)
      .catch(() => setS(null));
  }, [wid]);
  if (!s) return null;
  // The wall for the event you're in (its photos only).
  const link = s.code ? `${window.location.origin}/w/${s.slug}/live?k=${s.code}${event && event !== ALL_EVENTS ? `&event=${encodeURIComponent(event)}` : ''}` : '';
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

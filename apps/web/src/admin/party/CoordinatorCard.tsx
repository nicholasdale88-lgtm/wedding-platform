import { useEffect, useState } from 'react';
import { coordinatorApi } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Setup → Wedding party access → Your coordinator: a private link for the one person running the day
 * (a friend or the venue's coordinator), with the run sheet, suppliers, the party's numbers, who holds
 * what, the speeches, the photo list and an issues log.
 */
export function CoordinatorCard() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [s, setS] = useState<{ on: boolean; name: string; url: string } | null>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    coordinatorApi.get(wid).then(
      (r) => {
        setS(r);
        setName(r.name);
      },
      () => setS(null),
    );
  }, [wid]);
  if (!s) return null;
  const set = async (body: { on: boolean; name?: string; fresh?: boolean }, done: string) => {
    try {
      const r = await coordinatorApi.set(wid, body);
      setS(r);
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <section aria-label="Your coordinator" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div>
        <H2>Your day-of coordinator</H2>
        <p className="m-0 mt-1 text-[14px] text-[#5b6a52] max-w-[720px]">
          One private link for whoever runs the day: the whole run sheet with what’s on now, every supplier and the wedding party a tap from a call, who holds what, the speeches, the photo list, and a log of issues they tick off.
        </p>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <input aria-label="Their name" placeholder="Their name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => s.on && name !== s.name && void set({ on: true, name }, 'Saved')} className={`${inputCls} !py-2 w-[200px]`} />
        {!s.on ? (
          <Pill kind="primary" onClick={() => void set({ on: true, name }, 'Their link is ready')}>
            Make their link
          </Pill>
        ) : (
          <>
            <Pill kind="outline" onClick={() => void navigator.clipboard?.writeText(s.url).then(() => toast('Link copied'))}>
              Copy their link
            </Pill>
            <a href={s.url} target="_blank" rel="noopener" className="text-[13px] !text-[#33402f]">
              See their page
            </a>
            <button type="button" onClick={() => window.confirm('Make a new link? The old one stops working.') && void set({ on: true, name, fresh: true }, 'New link made')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#5b6a52]">
              New link
            </button>
            <button type="button" onClick={() => void set({ on: false }, 'Their link is off')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#7a4a37]">
              Switch off
            </button>
          </>
        )}
      </div>
    </section>
  );
}

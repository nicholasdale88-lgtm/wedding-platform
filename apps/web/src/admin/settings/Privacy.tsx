import { useState } from 'react';
import { api } from '../../lib/api';
import { useAdmin } from '../Shell';
import { useToast } from '../ui';

/**
 * Private wedding: the invitation, save the date, photo page and calendar files open only with each
 * guest's own link (or for the couple, signed in). Off: anyone with the wedding's address can see the
 * invitation (and find their own by name).
 */
export function Privacy() {
  const { wid, overview, reload } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const on = !!overview?.wedding.private;
  const flip = async () => {
    setBusy(true);
    try {
      await api.setPrivate(wid, !on);
      toast(!on ? 'Private: only your guests, with their own links, can open your pages' : 'Your invitation can be opened by anyone with its address');
      await reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Privacy" className="flex flex-col gap-2 p-4 rounded-[14px] border border-[#e2d7bc] bg-white max-w-[640px]">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={on} disabled={busy} onChange={() => void flip()} className="mt-[3px] w-[18px] h-[18px] accent-[#5d6b47]" />
        <span className="flex flex-col gap-1">
          <strong className="text-[15px] font-semibold">Keep our wedding private</strong>
          <span className="text-[14px] text-[#5b6a52]">
            Your invitation, save the date, photo page and calendar open only with each guest’s own link. Anyone else who finds the address sees “This invitation is private”. Table QR codes still work for photos.
          </span>
        </span>
      </label>
    </section>
  );
}

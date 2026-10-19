import { useMemo, useState } from 'react';
import type { Guest } from '../lib/api';
import { canShareNative, fallbackMessage, sendMessenger, sendWhatsApp, shareNative } from './share';
import { useAdmin } from './Shell';
import { Pill, useToast } from './ui';

/**
 * Guests → "Send without SMS": steps through everyone texts can't reach (no mobile, or replied STOP)
 * one at a time, with WhatsApp, Messenger, the share sheet or a copied message. Ticks are kept on this
 * device so a long list can be done in sittings.
 */
export function ManualSend({ guests, links, onClose }: { guests: Guest[]; links: Record<string, string>; onClose: () => void }) {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const key = `wp-manual-sent-${wid}`;
  const [done, setDone] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const queue = useMemo(() => guests.filter((g) => (!g.phone || g.optOut) && links[g.id]), [guests, links]);
  const left = queue.filter((g) => !done.includes(g.id));
  const g = left[0];
  const w = overview?.wedding;
  const couple = w ? `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}` : 'We';

  const mark = (id: string) => {
    const next = [...done, id];
    setDone(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* this visit only */
    }
  };
  const reset = () => {
    setDone([]);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  const text = g ? fallbackMessage(g.people[0]?.name.split(' ')[0] ?? 'there', couple, links[g.id]!) : '';
  return (
    <section className="flex flex-col gap-3 p-5 rounded-[14px] border border-[#c6b794] bg-[#fbf8f2]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h2 className="m-0 font-display font-medium text-[26px]">Send without SMS</h2>
        <button type="button" onClick={onClose} className="p-0 border-0 bg-transparent text-[14px] underline cursor-pointer text-[#33402f]">
          Close
        </button>
      </div>
      <p className="m-0 text-[14px] text-[#5b6a52]">
        {queue.length} {queue.length === 1 ? 'guest' : 'guests'} can't get texts (no mobile, or they replied STOP). Send each their personal invitation another way. {queue.length - left.length} done.
      </p>
      {g ? (
        <div className="flex flex-col gap-2 p-4 rounded-[12px] bg-[#f3ecd6]">
          <strong className="font-display text-[22px] font-medium">{g.people.map((p) => p.name).join(' & ')}</strong>
          <span className="text-[13px] text-[#5b6a52] whitespace-pre-wrap break-words">{text}</span>
          <div className="flex gap-2 flex-wrap">
            <Pill onClick={() => sendWhatsApp(null, text)}>WhatsApp</Pill>
            <Pill onClick={async () => (await sendMessenger(links[g.id]!, text)) === 'copied' && toast('Message copied: paste it into Messenger')}>Messenger</Pill>
            {canShareNative() && <Pill onClick={() => void shareNative(text, links[g.id]!)}>Share…</Pill>}
            <Pill onClick={() => void navigator.clipboard?.writeText(text).then(() => toast('Message copied'))}>Copy message</Pill>
            <Pill kind="primary" onClick={() => mark(g.id)}>
              Sent, next guest
            </Pill>
          </div>
        </div>
      ) : (
        <div className="text-[14px] text-[#55633f]">{queue.length ? 'All done. Everyone has their invitation.' : 'Everyone has a mobile, so texts reach them all.'}</div>
      )}
      {done.length > 0 && (
        <button type="button" onClick={reset} className="self-start p-0 border-0 bg-transparent text-[12px] underline cursor-pointer text-[#7a7466]">
          Start the list again
        </button>
      )}
    </section>
  );
}

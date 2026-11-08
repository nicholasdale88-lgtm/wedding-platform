import { useMemo, useState } from 'react';
import type { Guest } from '../lib/api';
import { canShareNative, fallbackMessage, sendMessenger, sendWhatsApp, shareNative, smsHref } from './share';
import { useAdmin } from './Shell';
import { Pill, useToast } from './ui';

/**
 * Guests → "Share invitation links yourself": steps through everyone texts can't reach (no mobile, or replied STOP)
 * one at a time, with WhatsApp, Messenger, the share sheet or a copied message. Ticks are kept on this
 * device so a long list can be done in sittings.
 * mode 'phone' ("Text from my own phone"): everyone with a mobile, each opening your own Messages app with
 * their number and personal link filled in. Free, from your own number, no texting service to sign up to;
 * their reply to the invitation still lands in your guest list.
 */
export function ManualSend({ guests, links, onClose, mode = 'unreachable' }: { guests: Guest[]; links: Record<string, string>; onClose: () => void; mode?: 'unreachable' | 'phone' }) {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const own = mode === 'phone';
  const key = own ? `wp-phone-sent-${wid}` : `wp-manual-sent-${wid}`;
  const [done, setDone] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const queue = useMemo(() => guests.filter((g) => g.delivery !== 'post' && (own ? !!g.phone && !g.optOut : !g.phone || g.optOut) && links[g.id]), [guests, links, own]);
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
        <h2 className="m-0 font-display font-medium text-[26px]">{own ? 'Text from my own phone' : 'Share invitation links yourself'}</h2>
        <button type="button" onClick={onClose} className="p-0 border-0 bg-transparent text-[14px] underline cursor-pointer text-[#33402f]">
          Close
        </button>
      </div>
      <p className="m-0 text-[14px] text-[#5b6a52]">
        {own
          ? `Free, from your own number: each tap opens your Messages app with the guest's number and personal invitation ready. Press send, come back, next. Easiest on your phone. ${queue.length - left.length} of ${queue.length} done.`
          : `${queue.length} ${queue.length === 1 ? 'guest' : 'guests'} can't get texts (no mobile, or they replied STOP). Send each their personal invitation another way. ${queue.length - left.length} done.`}
      </p>
      {g ? (
        <div className="flex flex-col gap-2 p-4 rounded-[12px] bg-[#f3ecd6]">
          <strong className="font-display text-[22px] font-medium">{g.people.map((p) => p.name).join(' & ')}</strong>
          <span className="text-[13px] text-[#5b6a52] whitespace-pre-wrap break-words">{text}</span>
          <div className="flex gap-2 flex-wrap">
            {own && g.phone && (
              <a href={smsHref(g.phone, text)} className="py-[9px] px-5 rounded-full no-underline text-[15px] font-medium bg-[#33402f] !text-[#fbf8f2]">
                Text from my phone
              </a>
            )}
            <Pill onClick={() => sendWhatsApp(own ? (g.phone ?? null) : null, text)}>WhatsApp</Pill>
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

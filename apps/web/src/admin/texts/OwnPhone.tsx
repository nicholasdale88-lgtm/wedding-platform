import { useCallback, useEffect, useState } from 'react';
import { ownPhoneApi, type OwnPhoneData, type SendVia as Via } from '../../lib/api';
import { smsHref } from '../share';
import { useAdmin } from '../Shell';
import { Pill, useToast } from '../ui';

const CHOICES: [Via, string, string][] = [
  ['phone', 'Send from my own phone (free)', 'Each invitation and reminder waits for you here: one tap opens your Messages app with the guest’s number and their own message ready. Replies come to your phone.'],
  ['email', 'By email (free)', 'Sent for you from your wedding’s own email address, to guests with an email. Guests without one wait here for your phone.'],
  ['service', 'A texting service number (paid)', 'Sent for you automatically from a texting number, a few cents a text. Guests can text YES or NO back.'],
];

/** Settings → Texting: how your messages go. */
export function SendVia() {
  const { wid, reload } = useAdmin();
  const toast = useToast();
  const [d, setD] = useState<OwnPhoneData | null>(null);
  const load = useCallback(() => ownPhoneApi.get(wid).then(setD).catch(() => setD(null)), [wid]);
  useEffect(() => void load(), [load]);
  if (!d) return null;
  const pick = async (via: Via) => {
    try {
      await ownPhoneApi.setVia(wid, via);
      toast('Saved');
      await load();
      void reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <section aria-label="How your messages are sent" className="flex flex-col gap-3 p-5 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0] max-w-[1000px]">
      <strong className="font-display text-[24px] font-medium">How your messages are sent</strong>
      <div role="radiogroup" aria-label="How your messages are sent" className="flex flex-col gap-2">
        {CHOICES.map(([v, label, detail]) => (
          <label key={v} className={`flex gap-3 items-start p-3 rounded-[12px] border cursor-pointer ${d.via === v ? 'border-[#33402f] bg-white' : 'border-[#e2d7bc]'}`}>
            <input type="radio" name="send-via" checked={d.via === v} onChange={() => void pick(v)} className="mt-1" />
            <span className="flex flex-col">
              <span className="text-[16px] font-medium">{label}</span>
              <span className="text-[13px] text-[#5b6a52]">{detail}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="m-0 text-[13px] text-[#7a7466]">Each guest can be set differently in their page (Guests → tap them → Send them messages by).</p>
    </section>
  );
}

/**
 * "Ready to send from your phone": steps through each guest, one at a time (never a group message). One tap
 * opens your Messages app with their number and their own message; then "Sent, next" marks it sent.
 */
export function OwnPhoneQueue() {
  const { wid, reload } = useAdmin();
  const toast = useToast();
  const [d, setD] = useState<OwnPhoneData | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => ownPhoneApi.get(wid).then(setD).catch(() => setD(null)), [wid]);
  useEffect(() => void load(), [load]);
  if (!d || !d.ready.length) return null;
  const m = d.ready[0]!;
  const mark = async (what: 'sent' | 'skip') => {
    try {
      await ownPhoneApi.mark(wid, m.id, what);
      await load();
      if (d.ready.length === 1) {
        toast('All sent. Thank you!');
        void reload();
      }
    } catch (e) {
      toast((e as Error).message);
      await load();
    }
  };
  const summary = d.batches.map((b) => `${b.count} × ${b.message}`).join(', ');
  return (
    <section aria-label="Ready to send from your phone" className="flex flex-col gap-3 p-5 rounded-[14px] border border-[#c6b794] bg-[#fbf8f2]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h2 className="m-0 font-display font-medium text-[26px]">
          {d.ready.length} {d.ready.length === 1 ? 'message' : 'messages'} ready to send from your phone
        </h2>
        <Pill size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Start sending'}
        </Pill>
      </div>
      <p className="m-0 text-[14px] text-[#5b6a52]">
        {summary}. Free, from your own number, one guest at a time. Their RSVP comes in through their link as usual; if they text you back instead, record their reply in their page (Guests → tap them).
      </p>
      {open && (
        <div className="flex flex-col gap-2 p-4 rounded-[12px] bg-[#f3ecd6]">
          <span className="text-[12px] text-[#7a7466]">
            {m.message} · {d.ready.length} to go
          </span>
          <strong className="font-display text-[22px] font-medium">{m.name}</strong>
          <span className="text-[13px] text-[#5b6a52] whitespace-pre-wrap break-words">{m.body}</span>
          <div className="flex gap-2 flex-wrap">
            <a href={smsHref(m.phone, m.body)} className="py-[9px] px-5 rounded-full no-underline text-[15px] font-medium bg-[#33402f] !text-[#fbf8f2]">
              Open Messages
            </a>
            <Pill kind="primary" onClick={() => void mark('sent')}>
              Sent, next
            </Pill>
            <Pill kind="outline" onClick={() => void mark('skip')}>
              Skip
            </Pill>
          </div>
        </div>
      )}
    </section>
  );
}

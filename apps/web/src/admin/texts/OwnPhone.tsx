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
    <section aria-label="How your messages are sent" className="flex flex-col gap-3 p-5 rounded-[14px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)] max-w-[1000px]">
      <strong className="font-display text-[24px] font-medium">How your messages are sent</strong>
      <div role="radiogroup" aria-label="How your messages are sent" className="flex flex-col gap-2">
        {CHOICES.map(([v, label, detail]) => (
          <label key={v} className={`flex gap-3 items-start p-3 rounded-[12px] border cursor-pointer ${d.via === v ? 'border-[#33402f] bg-white' : 'border-[var(--adm-line,#e2d7bc)]'}`}>
            <input type="radio" name="send-via" checked={d.via === v} onChange={() => void pick(v)} className="mt-1" />
            <span className="flex flex-col">
              <span className="text-[16px] font-medium">{label}</span>
              <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">{detail}</span>
            </span>
          </label>
        ))}
      </div>
      {d.ownNumber.available && <OwnNumber d={d} onChanged={load} />}
      <p className="m-0 text-[13px] text-[#7a7466]">Each guest can be set differently in their page (Guests → tap them → Send them messages by).</p>
    </section>
  );
}

/**
 * "Send from my own number (automatic)": every automatic text goes with your own mobile as the sender, through
 * the site's texting service. We text your mobile a link; tap Confirm on that phone, then "I've tapped Confirm".
 */
function OwnNumber({ d, onChanged }: { d: OwnPhoneData; onChanged: () => Promise<void> }) {
  const { wid, reload } = useAdmin();
  const toast = useToast();
  const [mobile, setMobile] = useState('');
  const own = d.ownNumber;
  const run = async (f: () => Promise<unknown>, done?: string) => {
    try {
      await f();
      if (done) toast(done);
      await onChanged();
      void reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const shown = (n?: string) => (n ? n.replace(/^\+61/, '0').replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3') : '');
  return (
    <div className="flex flex-col gap-2 p-3 rounded-[12px] border border-[var(--adm-line,#e2d7bc)] bg-white">
      <span className="text-[16px] font-medium">Send from my own number (automatic)</span>
      <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">
        Every automatic text goes out with your own mobile as the sender, through the texting service (the usual few cents a text, nothing extra). Replies come to your phone, not here: RSVPs still come in through each guest’s link, and you can record a texted reply on the guest’s page in one tap.
      </span>
      {own.status === 'active' ? (
        <span className="flex gap-2 items-center flex-wrap text-[14px]">
          <span>Sending from {shown(own.number)} ✓</span>
          <Pill size="sm" kind="outline" onClick={() => void run(() => ownPhoneApi.removeOwn(wid), 'Back to texting from your own phone')}>
            Stop using my number
          </Pill>
        </span>
      ) : own.status === 'pending' ? (
        <span className="flex gap-2 items-center flex-wrap text-[14px]">
          <span>We’ve texted {shown(own.number)} a link. Open it on that phone and tap Confirm (within an hour).</span>
          <Pill size="sm" kind="primary" onClick={() => void run(async () => {
            const r = await ownPhoneApi.checkOwn(wid);
            toast(r.status === 'active' ? 'Confirmed: texts now go from your number' : r.status === 'expired' ? 'That link has expired: send a new one' : 'Not confirmed yet: tap Confirm in the text, then try again');
          })}>
            I’ve tapped Confirm
          </Pill>
        </span>
      ) : (
        <form
          className="flex gap-2 flex-wrap items-center"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => ownPhoneApi.requestOwn(wid, mobile), 'Link sent: open it on your phone and tap Confirm');
          }}
        >
          {own.status === 'expired' && <span className="text-[13px] text-[#8a5a45] w-full">The last link expired. Send a new one.</span>}
          {own.status === 'lost' && <span className="text-[13px] text-[#8a5a45] w-full">{shown(own.number)} stopped working as a sender, so texts went back to your own phone. Set it up again below.</span>}
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="04xx xxx xxx" aria-label="Your mobile" className="py-[8px] px-3 rounded-[10px] border border-[var(--adm-line,#d3c6a4)] text-[15px]" />
          <Pill type="submit" kind="primary">
            Text me the confirmation link
          </Pill>
        </form>
      )}
    </div>
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
    <section aria-label="Ready to send from your phone" className="flex flex-col gap-3 p-5 rounded-[14px] border border-[var(--adm-line,#c6b794)] bg-[#fbf8f2]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h2 className="m-0 font-display font-medium text-[26px]">
          {d.ready.length} {d.ready.length === 1 ? 'message' : 'messages'} ready to send from your phone
        </h2>
        <Pill size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Start sending'}
        </Pill>
      </div>
      <p className="m-0 text-[14px] text-[var(--adm-muted,#5b6a52)]">
        {summary}. Free, from your own number, one guest at a time. Their RSVP comes in through their link as usual; if they text you back instead, record their reply in their page (Guests → tap them).
      </p>
      {open && (
        <div className="flex flex-col gap-2 p-4 rounded-[12px] bg-[var(--adm-tint,#f3ecd6)]">
          <span className="text-[12px] text-[#7a7466]">
            {m.message} · {d.ready.length} to go
          </span>
          <strong className="font-display text-[22px] font-medium">{m.name}</strong>
          <span className="text-[13px] text-[var(--adm-muted,#5b6a52)] whitespace-pre-wrap break-words">{m.body}</span>
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

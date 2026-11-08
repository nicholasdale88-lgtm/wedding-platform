import { useState } from 'react';
import { testSendApi, type TestSendIn, type TestSendResult } from '../lib/api';
import { smsHref } from './share';
import { useAdmin } from './Shell';
import { Pill, useToast } from './ui';

/**
 * "Send me a test", right where a message is set up: exactly what a guest gets, filled in with a sample
 * guest and their own link, marked TEST. A text goes to your mobile (or opens your Messages app to text it
 * to yourself), an email to your own email; with nothing connected, the preview shows here with what to set up.
 */
export function TestSend({ what, campaignId, body, subject, channels = false, label = 'Send me a test' }: Omit<TestSendIn, 'channel'> & { channels?: boolean; label?: string }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [channel, setChannel] = useState<TestSendIn['channel']>(undefined);
  const [res, setRes] = useState<TestSendResult | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await testSendApi.send(wid, { what, campaignId, body, subject, channel });
      setRes(r);
      toast(r.message);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col gap-2 max-w-full">
      <span className="inline-flex gap-2 items-center flex-wrap">
        {channels && (
          <select aria-label="Test by" value={channel ?? ''} onChange={(e) => setChannel((e.target.value || undefined) as TestSendIn['channel'])} className="py-[6px] px-2 rounded-[10px] border border-[#d3c6a4] bg-transparent text-[13px]">
            <option value="">The way it goes</option>
            <option value="text">Text to my mobile</option>
            <option value="phone">From my own phone</option>
            <option value="email">Email to me</option>
          </select>
        )}
        <Pill onClick={() => void go()} disabled={busy} aria-busy={busy}>
          {label}
        </Pill>
      </span>
      {res && (
        <span role="status" className="flex flex-col gap-2 p-3 rounded-[12px] bg-[#f3ecd6] text-[13px] text-[#33402f]">
          <span>
            {res.message} <span className="text-[#7a7466]">(Filled in as {res.sample}.)</span>
          </span>
          {res.result === 'link' && res.phone && (
            <a href={smsHref(res.phone, res.preview.text)} className="self-start py-[7px] px-4 rounded-full no-underline bg-[#33402f] !text-[#fbf8f2]">
              Text it to me
            </a>
          )}
          {res.result !== 'sent' &&
            (res.preview.kind === 'text' ? (
              <span className="self-start max-w-[340px] py-2 px-3 rounded-[16px] rounded-bl-[4px] bg-white whitespace-pre-wrap break-words">{res.preview.text}</span>
            ) : (
              <span className="flex flex-col gap-1">
                <strong>{res.preview.subject}</strong>
                <iframe title="Email preview" sandbox="" srcDoc={res.preview.html ?? res.preview.text} className="w-full max-w-[560px] h-[360px] rounded-[10px] border border-[#e2d7bc] bg-white" />
              </span>
            ))}
          <button type="button" onClick={() => setRes(null)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[12px] text-[#5b6a52]">
            Close
          </button>
        </span>
      )}
    </span>
  );
}

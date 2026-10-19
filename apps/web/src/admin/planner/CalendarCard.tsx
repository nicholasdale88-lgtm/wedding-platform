import { useEffect, useState } from 'react';
import { plannerCalendarApi } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Pill, useToast } from '../ui';

/**
 * The plan on your phone's calendar: one private link both of you subscribe to (it updates by itself),
 * with every due date as an all-day reminder.
 */
export function CalendarCard() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    plannerCalendarApi.get(wid).then((r) => setUrl(r.url), () => setUrl(''));
  }, [wid]);
  if (url === null) return null;
  const set = async (on: boolean) => {
    try {
      setUrl((await plannerCalendarApi.set(wid, on)).url);
      toast(on ? 'Your calendar link is ready' : 'The calendar link is off');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const webcal = url.replace(/^https?:/, 'webcal:');
  return (
    <section aria-label="On your calendar" className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <strong className="font-display text-[20px] font-medium">On your phone’s calendar</strong>
          <p className="m-0 mt-1 text-[13px] text-[#5b6a52] max-w-[620px]">
            Every date in the plan as an all-day reminder: tasks when they’re due, payments, quotes running out, fittings, the hens and bucks, replies closing and the day itself. It updates by itself.
          </p>
        </div>
        {!url && (
          <Pill kind="primary" onClick={() => void set(true)}>
            Get the link
          </Pill>
        )}
      </div>
      {url && (
        <div className="flex flex-col gap-2 text-[13px]">
          <div className="flex gap-2 flex-wrap items-center">
            <a href={webcal} className="py-[7px] px-[14px] rounded-full bg-[#33402f] no-underline !text-[#f3ecd6]">
              Add to iPhone or Outlook
            </a>
            <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener" className="py-[7px] px-[14px] rounded-full border border-[#5d6b47] no-underline !text-[#33402f]">
              Add to Google Calendar
            </a>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(url).then(() => toast('Link copied'))} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
              Copy the link
            </button>
          </div>
          <span className="text-[12px] text-[#7a7466]">
            Keep it to yourselves: anyone with the link sees the plan’s dates.{' '}
            <button type="button" onClick={() => window.confirm('Make a new link? The old one stops working (re-add it on your phones).') && void set(true)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#5b6a52]">
              New link
            </button>{' '}
            ·{' '}
            <button type="button" onClick={() => void set(false)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]">
              Switch off
            </button>
          </span>
        </div>
      )}
    </section>
  );
}

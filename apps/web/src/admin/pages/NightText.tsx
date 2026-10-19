import { zonedToUtc } from '@wp/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, textsApi, type Campaign, type Estimate, type TextsData } from '../../lib/api';
import { fmtWhen, toLocalInput } from '../../lib/format';
import { useAdmin } from '../Shell';
import { eventOf } from '../texts/SmsMessages';
import { inputCls, Pill, useToast } from '../ui';

/**
 * Setup → Night-before text, for one event: the text everyone coming gets the evening before, with
 * their own guide link. Shown as it will arrive (a real guest's details filled in), edited here,
 * scheduled for the evening before by default, and switched on or off. Anyone who says yes before
 * then is included automatically.
 */

export const isNightBefore = (c: Campaign) => /night|tomorrow/i.test(`${c.key} ${c.name}`);
/** The evening before the event, 5:00pm in the wedding's time zone, as "2027-11-17T17:00". */
const eveningBefore = (startsAt: string, tz: string) => {
  const day = new Date(Date.parse(startsAt) - 86_400_000);
  return `${toLocalInput(day.toISOString(), tz).slice(0, 10)}T17:00`;
};

export function NightText({ eventKey }: { eventKey: string }) {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const [data, setData] = useState<TextsData | null>(null);
  const [error, setError] = useState('');
  const ev = overview?.events.find((e) => e.key === eventKey);

  const load = useCallback(async () => {
    try {
      setData(await textsApi.get(wid));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!data || !ev) return <div aria-busy="true" className="text-[#5b6a52]">Loading the night-before text…</div>;
  const tz = data.timezone;
  const mine = data.campaigns.filter((c) => eventOf(c) === eventKey && isNightBefore(c));
  const slot = data.events.findIndex((e) => e.key === eventKey);

  const create = async () => {
    try {
      const guide = slot <= 0 ? '{guide}' : `{guide_${eventKey}}`;
      const { id } = await textsApi.add(wid, `Night before · ${ev.name}`, { attending: eventKey }, `Hi {first}, see you tomorrow! Everything you need, from times to your table: ${guide}`);
      await textsApi.patch(wid, { id, version: 1 }, { dates: [zonedToUtc(eveningBefore(ev.startsAt, tz), tz).toISOString()] }).catch(() => {});
      await load();
      toast('Night-before text added for the evening before');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-[15px] text-[#5b6a52] max-w-[680px]">
        Everyone who has said yes to {ev.name} gets this the evening before, with their own guide link (times, parking, their table and meal). Anyone who replies yes later is
        included automatically.
      </p>
      {mine.map((c) => (
        <NightCard key={`${c.id}:${c.version}`} c={c} tz={tz} startsAt={ev.startsAt} onChanged={load} />
      ))}
      {!mine.length && (
        <Pill kind="primary" className="self-start" onClick={() => void create()}>
          Add the night-before text
        </Pill>
      )}
    </div>
  );
}

function NightCard({ c, tz, startsAt, onChanged }: { c: Campaign; tz: string; startsAt: string; onChanged: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [body, setBody] = useState(c.body);
  const [est, setEst] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const next = c.slots.filter((s) => s.status === 'pending').map((s) => s.sendAt).sort()[0];
  const [when, setWhen] = useState(next ? toLocalInput(next, tz) : eveningBefore(startsAt, tz));
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // The preview follows the words as they're typed (a real guest's details, never sent).
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      textsApi.estimate(wid, c.id, { body }).then(setEst, () => setEst(null));
    }, 400);
    return () => clearTimeout(timer.current);
  }, [wid, c.id, body]);

  const save = async (patch: Parameters<typeof textsApi.patch>[2], msg: string) => {
    setBusy(true);
    try {
      await textsApi.patch(wid, c, patch);
      toast(msg);
      await onChanged();
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere, reloaded.' : (e as Error).message);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const dirty = body !== c.body || (next ? toLocalInput(next, tz) : '') !== when;
  const sent = c.slots.some((s) => s.status === 'sent');

  return (
    <section aria-label={c.name} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] gap-6 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <h3 className="m-0 font-display font-medium text-[24px]">{c.name}</h3>
          <label className="flex items-center gap-2 text-[14px] cursor-pointer">
            <input type="checkbox" role="switch" checked={c.enabled} disabled={busy} onChange={() => void save({ enabled: !c.enabled }, c.enabled ? 'Switched off' : 'Switched on')} className="w-[18px] h-[18px] accent-[#5d6b47]" />
            {c.enabled ? 'On' : 'Off'}
          </label>
        </div>
        <textarea aria-label="Message" rows={6} value={body} onChange={(e) => setBody(e.target.value)} className={`${inputCls} resize-y`} />
        <div className="flex gap-3 items-end flex-wrap">
          <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52]">
            Sends
            <input type="datetime-local" value={when} onChange={(e) => e.target.value && setWhen(e.target.value)} className={inputCls} />
          </label>
          <button type="button" onClick={() => setWhen(eveningBefore(startsAt, tz))} className="mb-[10px] p-0 border-0 bg-transparent text-[13px] underline cursor-pointer text-[#5b6a52]">
            The evening before, 5:00pm
          </button>
        </div>
        <div className="text-[13px] text-[#5b6a52]">
          {sent ? 'Already sent. ' : next ? `Scheduled for ${fmtWhen(next, tz)}. ` : 'No send time yet. '}
          {est ? `${est.count} ${est.count === 1 ? 'guest' : 'guests'} coming so far · ${est.parts} ${est.parts === 1 ? 'credit' : 'credits'} each` : ''}
        </div>
        <div className="flex gap-2">
          <Pill
            kind="primary"
            disabled={busy || !dirty || !body.trim()}
            onClick={() => void save({ body, dates: [zonedToUtc(when, tz).toISOString()] }, 'Night-before text saved')}
          >
            {busy ? 'Saving…' : 'Save'}
          </Pill>
          {dirty && (
            <Pill
              disabled={busy}
              onClick={() => {
                setBody(c.body);
                setWhen(next ? toLocalInput(next, tz) : eveningBefore(startsAt, tz));
              }}
            >
              Undo
            </Pill>
          )}
        </div>
      </div>
      <div aria-label="How it arrives" className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold tracking-[.18em] uppercase text-[#5b6a52]">How it arrives</span>
        <div className="rounded-[26px] border-[8px] border-[#33402f] bg-[#f2f2f4] p-4 min-h-[220px] flex flex-col justify-end">
          <div className="self-start max-w-[92%] rounded-[18px] rounded-bl-[6px] bg-white py-2 px-3 text-[14px] leading-[1.35] whitespace-pre-wrap break-words shadow-[0_1px_2px_rgba(0,0,0,.08)]">
            {est?.sample ?? body}
          </div>
        </div>
        <span className="text-[12px] text-[#7a7466]">{est?.sample ? 'With a real guest’s details. Nothing is sent.' : 'Placeholders fill in for each guest.'}</span>
      </div>
    </section>
  );
}

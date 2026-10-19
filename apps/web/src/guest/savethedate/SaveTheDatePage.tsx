import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { NAMES_STYLES, themeOf, type ThemeCustom } from '../themeKit';

/**
 * /w/:slug/save-the-date?g=<token>: the save the date, in the invitation's colours and names style. The
 * names, the date, the place, "formal invitation to follow", and add it to your calendar. Opening it
 * isn't counted as opening the invitation.
 */
interface Data {
  wedding: { slug: string; name1: string; name2: string; monogram: string; theme: string; timezone: string };
  custom: ThemeCustom;
  guest: string;
  event: { key: string; name: string; startsAt: string; venue: string; address: string } | null;
}

export function SaveTheDatePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/p/${encodeURIComponent(slug)}/save-the-date${token ? `?g=${encodeURIComponent(token)}` : ''}`)
      .then(async (r) => {
        const b = (await r.json()) as Data & { error?: { message: string } };
        if (!r.ok) throw new Error(b.error?.message ?? 'We could not find this page.');
        setD(b);
      })
      .catch((e: Error) => setErr(e.message));
  }, [slug, token]);
  useEffect(() => {
    if (d) document.title = `Save the date · ${d.wedding.name1.split(' ')[0]} & ${d.wedding.name2.split(' ')[0]}`;
  }, [d]);
  if (err) return <GuestMessage message={err} />;
  if (!d) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;

  const t = themeOf(d.wedding.theme, d.custom);
  const names = NAMES_STYLES[d.custom.names ?? 'script'] ?? NAMES_STYLES.script;
  const caps = d.custom.names === 'caps';
  const tz = d.wedding.timezone || 'Australia/Sydney';
  const when = d.event ? new Date(d.event.startsAt) : null;
  const fmt = (o: Intl.DateTimeFormatOptions) => (when ? new Intl.DateTimeFormat('en-AU', { ...o, timeZone: tz }).format(when) : '');
  const where = d.event ? [d.event.venue, d.event.address.split(',').slice(-2).join(',').trim()].filter(Boolean).join(' · ') : '';
  const ics = d.event ? `/api/p/${encodeURIComponent(slug)}/calendar/${encodeURIComponent(d.event.key)}.ics` : '';
  // An all-day entry on the wedding's date (where the wedding is): that day to the next.
  const [y, mo, dd] = [Number(fmt({ year: 'numeric' })), Number(fmt({ month: 'numeric' })), Number(fmt({ day: 'numeric' }))];
  const dayStr = (k: number) => new Date(Date.UTC(y, mo - 1, dd + k)).toISOString().slice(0, 10).replace(/-/g, '');
  const google =
    d.event && when
      ? `https://calendar.google.com/calendar/render?${new URLSearchParams({
          action: 'TEMPLATE',
          text: `${d.wedding.name1.split(' ')[0]} & ${d.wedding.name2.split(' ')[0]}: ${d.event.name}`,
          dates: `${dayStr(0)}/${dayStr(1)}`,
          details: 'Save the date. Formal invitation to follow.',
          location: where,
        })}`
      : '';
  const ink = t.dg ?? '#33402f';
  const gold = t.acc ?? '#b39563';

  return (
    <main className="min-h-screen flex items-center justify-center p-5" style={{ background: t.b5 ?? t.b1 ?? '#f6f0e2', color: ink, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      <article
        className="relative w-full max-w-[460px] flex flex-col items-center gap-5 text-center py-14 px-8 rounded-[6px] shadow-[0_24px_60px_rgba(40,40,30,.18)]"
        style={{ background: t.b1 ?? '#fffdf8', animation: 'std-in 1.2s ease both' }}
      >
        <style>{`@keyframes std-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }`}</style>
        <span aria-hidden className="absolute inset-[10px] rounded-[3px] pointer-events-none" style={{ border: `1px solid ${gold}` }} />
        {d.guest && <div className="text-[18px] italic opacity-80">Dear {d.guest},</div>}
        <div className="text-[13px] tracking-[.35em] uppercase font-semibold" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: gold }}>
          Save the date
        </div>
        <h1 className="m-0 font-normal leading-[1.1]" style={{ fontFamily: names.font, fontSize: caps ? 30 : 54, letterSpacing: caps ? '.2em' : undefined, textTransform: caps ? 'uppercase' : undefined }}>
          {d.wedding.name1.split(' ')[0]}
          <span className="block text-[26px] italic my-1" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: 0, textTransform: 'none' }}>
            &amp;
          </span>
          {d.wedding.name2.split(' ')[0]}
        </h1>
        <span aria-hidden className="w-14 h-[2px]" style={{ background: gold }} />
        {when && (
          <div className="flex flex-col items-center gap-1">
            <div className="text-[15px] tracking-[.3em] uppercase" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              {fmt({ weekday: 'long' })}
            </div>
            <div className="text-[44px] leading-none">{fmt({ day: 'numeric', month: 'long' })}</div>
            <div className="text-[22px] tracking-[.2em]">{fmt({ year: 'numeric' })}</div>
          </div>
        )}
        {where && <div className="text-[19px] italic">{where}</div>}
        <div className="text-[16px] opacity-80">Formal invitation to follow</div>
        {d.event && (
          <div className="flex gap-3 flex-wrap justify-center pt-2 text-[15px]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            <a href={ics} className="py-2 px-4 rounded-full no-underline" style={{ background: ink, color: t.b1 ?? '#fff' }}>
              Add to Apple / Outlook
            </a>
            <a href={google} target="_blank" rel="noopener" className="py-2 px-4 rounded-full no-underline border" style={{ borderColor: ink, color: ink }}>
              Google Calendar
            </a>
          </div>
        )}
      </article>
    </main>
  );
}

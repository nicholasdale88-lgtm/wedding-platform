import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { THEMES } from '../generated/themes';
import { GuestMessage } from '../GuestMessage';
import { guestApi, type PartyPayload } from '../invitation/api';

/**
 * /w/:slug/party?g=<token>: a wedding party member's own run sheet. Only the lines meant for them (the
 * whole party, their side, or their role), for the events they're invited to; who's who in the party;
 * the couple's note. On the day, the line happening now is marked.
 */

const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;
const fmtDay = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
  } catch {
    return '';
  }
};
/** "9:30am" on the event's day → a time, to mark what's on now. */
const at = (day: string, t: string) => {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if ((m[3] ?? '').toLowerCase() === 'pm') h += 12;
  if (!m[3] && Number(m[1]) >= 12) h = Number(m[1]);
  const d = new Date(day);
  d.setHours(h, Number(m[2] ?? 0), 0, 0);
  return d.getTime();
};

export function PartyPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [data, setData] = useState<PartyPayload | null>(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    guestApi
      .party(slug, token)
      .then(setData)
      .catch((e: Error) => setErr(e.message));
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [slug, token]);
  useEffect(() => {
    if (data) document.title = `${data.couple} · wedding party`;
  }, [data]);

  if (err) return <GuestMessage message={err} />;
  if (!data) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const theme = THEMES[data.theme] ?? {};
  const ink = '#33402f';
  const gold = theme.acc ?? '#b39563';
  const roles = [...new Set(data.me.map((m) => m.role))];
  const sides: [string, PartyPayload['party']][] = [
    [`${data.names.p1}'s side`, data.party.filter((p) => p.side === 'p1')],
    [`${data.names.p2}'s side`, data.party.filter((p) => p.side === 'p2')],
    ['Also helping', data.party.filter((p) => !p.side)],
  ];

  return (
    <main className="min-h-screen" style={{ background: '#f6f0e2', color: ink, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      <div className="max-w-[640px] mx-auto px-5 pt-12 pb-24 flex flex-col gap-7">
        <header className="text-center flex flex-col gap-2">
          <div className="text-[13px] tracking-[.3em] uppercase font-semibold opacity-80" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            {data.couple}
          </div>
          <h1 className="m-0 font-normal text-[52px] leading-[1.1]" style={{ fontFamily: "'Pinyon Script', cursive" }}>
            Wedding party
          </h1>
          <span aria-hidden className="mx-auto w-16 h-[2px]" style={{ background: gold }} />
          <p className="m-0 text-[21px] italic">
            {data.me.map((m) => first(m.name)).join(' & ')}, you're {roles.length === 1 ? `our ${roles[0]!.toLowerCase()}` : `in our wedding party (${roles.join(', ')})`}. Thank you!
          </p>
          <a href={`/w/${encodeURIComponent(slug)}?g=${encodeURIComponent(token)}`} className="text-[16px] underline" style={{ color: ink }}>
            ← Your invitation
          </a>
        </header>

        {data.events.map((e) => {
          const times = e.items.map((it) => at(e.startsAt, it.time));
          // On the day: the latest line that has started is "now"; the one after it is "next".
          const current = times.reduce<number>((acc, t, i) => (t !== null && t <= now && new Date(e.startsAt).toDateString() === new Date(now).toDateString() ? i : acc), -1);
          return (
            <section key={e.key} aria-label={e.name} className="flex flex-col gap-3">
              <div className="text-center">
                <h2 className="m-0 font-normal text-[34px]">{e.name}</h2>
                <div className="text-[17px] opacity-80">{fmtDay(e.startsAt)}</div>
              </div>
              {e.note && <p className="m-0 p-4 rounded-[16px] bg-white/70 border text-[19px] leading-[1.4] whitespace-pre-wrap" style={{ borderColor: 'rgba(0,0,0,.08)' }}>{e.note}</p>}
              <ol className="m-0 p-0 list-none flex flex-col">
                {e.items.map((it, i) => (
                  <li key={i} className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 py-3 border-t" style={{ borderColor: 'rgba(0,0,0,.08)', background: i === current ? 'rgba(179,149,99,.14)' : undefined }}>
                    <div className="text-right pr-1">
                      <div className="text-[19px] font-semibold">{it.time}</div>
                      {it.until && <div className="text-[14px] opacity-70">to {it.until}</div>}
                      {i === current && (
                        <div className="mt-1 text-[11px] tracking-[.2em] uppercase font-semibold" style={{ color: gold, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                          Now
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="text-[21px] leading-[1.25]">{it.title}</div>
                      {it.place && <div className="text-[16px] italic opacity-80">{it.place}</div>}
                      {it.detail && <div className="text-[17px] leading-[1.4] whitespace-pre-wrap">{it.detail}</div>}
                    </div>
                  </li>
                ))}
              </ol>
              {!e.items.length && <p className="m-0 text-center italic opacity-75">The run sheet for this one is coming.</p>}
            </section>
          );
        })}
        {!data.events.length && <p className="m-0 text-center text-[19px] italic">Your run sheet is on its way. Check back closer to the day.</p>}

        <section aria-label="Who's who" className="flex flex-col gap-3 pt-2">
          <h2 className="m-0 font-normal text-[30px] text-center">Who's who</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {sides
              .filter(([, ps]) => ps.length)
              .map(([label, ps]) => (
                <div key={label} className="flex flex-col gap-1">
                  <div className="text-[12px] tracking-[.2em] uppercase font-semibold opacity-75" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                    {label}
                  </div>
                  {ps.map((p) => (
                    <div key={`${p.name}-${p.role}`} className="text-[18px]">
                      {p.name} <span className="italic opacity-75">· {p.role}</span>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';

/**
 * /w/:slug/vendor?v=<vendor>&k=<key>: a vendor's own page (the celebrant, the caterer, the photographer).
 * The day, the venue, when to arrive, the timeline, guest numbers and dietary needs, their payments and who
 * to call: always up to date, so the couple never re-sends details.
 */
interface Data {
  couple: string;
  vendor: { name: string; category: string; arrival: string; meals: number };
  event: { name: string; startsAt: string; venue: string; address: string } | null;
  timezone: string;
  parking: string;
  timeline: { t: string; what: string; where: string }[];
  guests: { coming: number; waiting: number } | null;
  dietary: { diet: string; n: number; serious: boolean }[];
  payments: { label: string; amount: number; due: string; paid: boolean }[];
  contacts: { name: string; role: string; phone: string }[];
}
const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
const card = 'flex flex-col gap-2 p-4 rounded-[16px] bg-white border border-[#e2d7bc]';

export function VendorPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/p/${encodeURIComponent(slug)}/vendor/${encodeURIComponent(params.get('v') ?? '')}/${encodeURIComponent(params.get('k') ?? '')}`)
      .then(async (r) => {
        const b = (await r.json()) as Data & { error?: { message: string } };
        if (!r.ok) throw new Error(b.error?.message ?? 'This page isn’t available.');
        setD(b);
      })
      .catch((e: Error) => setErr(e.message));
  }, [slug, params]);
  if (err) return <GuestMessage message={err} />;
  if (!d) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const when = d.event ? new Date(d.event.startsAt) : null;
  const fmt = (o: Intl.DateTimeFormatOptions) => (when ? new Intl.DateTimeFormat('en-AU', { ...o, timeZone: d.timezone }).format(when) : '');
  const map = d.event ? `https://maps.google.com/?q=${encodeURIComponent([d.event.venue, d.event.address].filter(Boolean).join(', '))}` : '';
  return (
    <main className="min-h-screen bg-[#f6f0e2] text-[#33402f] px-4 py-8" style={{ fontFamily: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif" }}>
      <div className="max-w-[640px] mx-auto flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <span className="text-[12px] tracking-[.2em] uppercase font-semibold text-[#5b6a52]">For {d.vendor.name}</span>
          <h1 className="m-0 text-[34px] leading-[1.1] font-normal" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            {d.couple}’s wedding
          </h1>
          <span className="text-[15px] text-[#5b6a52]">Kept up to date by the couple. Check back any time.</span>
        </header>

        {d.event && (
          <section className={card} aria-label="The day">
            <strong className="text-[18px]">{fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
            <span>
              {d.event.name} starts at {fmt({ hour: 'numeric', minute: '2-digit' })}
            </span>
            {d.vendor.arrival && <span className="font-semibold">You’re expected: {d.vendor.arrival}</span>}
            {(d.event.venue || d.event.address) && (
              <a href={map} target="_blank" rel="noopener noreferrer" className="text-[#33402f]">
                {[d.event.venue, d.event.address].filter(Boolean).join(', ')}
              </a>
            )}
            {d.parking && <span className="text-[14px] text-[#5b6a52]">Parking: {d.parking}</span>}
          </section>
        )}

        {d.timeline.length > 0 && (
          <section className={card} aria-label="Timeline">
            <strong>The timeline</strong>
            <ol className="m-0 p-0 list-none flex flex-col gap-1">
              {d.timeline.map((r, i) => (
                <li key={i} className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 text-[15px]">
                  <span className="font-semibold tabular-nums">{r.t}</span>
                  <span>
                    {r.what}
                    {r.where && <span className="text-[#5b6a52]"> · {r.where}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {d.guests && (
          <section className={card} aria-label="Guests">
            <strong>Guests</strong>
            <span>
              {d.guests.coming} coming{d.guests.waiting ? ` · up to ${d.guests.waiting} more still to reply` : ''}
            </span>
            {d.vendor.meals > 0 && <span>Meals for your team: {d.vendor.meals}</span>}
            {d.dietary.length > 0 && (
              <ul className="m-0 pl-5 text-[15px]">
                {d.dietary.map((x) => (
                  <li key={x.diet} className={x.serious ? 'font-semibold text-[#7a4a37]' : ''}>
                    {x.diet}: {x.n}
                    {x.serious ? ' (serious)' : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {d.payments.length > 0 && (
          <section className={card} aria-label="Payments">
            <strong>Payments</strong>
            <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[15px]">
              {d.payments.map((p, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {p.label || 'Payment'}
                    {p.due ? ` · due ${new Date(`${p.due}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  </span>
                  <span className={p.paid ? 'text-[#3d4a2f] font-semibold' : ''}>
                    {aud(p.amount)} {p.paid ? '· paid' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.contacts.length > 0 && (
          <section className={card} aria-label="On the day">
            <strong>Who to call on the day</strong>
            {d.contacts.map((ct, i) => (
              <span key={i}>
                {ct.name}
                {ct.role ? ` (${ct.role})` : ''}:{' '}
                <a href={`tel:${ct.phone.replace(/[^\d+]/g, '')}`} className="text-[#33402f]">
                  {ct.phone}
                </a>
              </span>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

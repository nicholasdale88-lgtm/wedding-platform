import { cssAspect, tableBox, type TableShape } from '@wp/shared';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';

/**
 * /w/:slug/vendor?v=<vendor>&k=<key>: a vendor's own page (the celebrant, the caterer, the photographer).
 * The day, the venue, when to arrive, the timeline, guest numbers and dietary needs, their payments and who
 * to call: always up to date, so the couple never re-sends details. When the couple shares the seating
 * (the caterer), the room plan with the tables that have special meals marked, and each special meal by
 * table and seat.
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
  seating?: Seating | null;
  /** For the caterer: each booked vendor team's meals on the day. */
  vendorMeals?: { name: string; meals: number }[];
}
type Meal = { e: string; m: string; d: string };
interface Seating {
  event: string;
  aspect: string;
  /** Published to guests (else the couple's saved plan, which may still change). */
  published: boolean;
  tables: { id: string; name: string; shape: TableShape; dir: 'h' | 'v'; len: number; x: number; y: number; seats: number; guests: number; special: number; serious: boolean }[];
  areas: { label: string; x: number; y: number; w: number; h: number }[];
  special: { table: string; seat: number; name: string; diet: string; meal: Meal; serious: boolean }[];
  notSeated: { name: string; diet: string; meal: Meal; serious: boolean }[];
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
            {!!d.vendorMeals?.length && (
              <span>
                <strong>Vendor meals: {d.vendorMeals.reduce((a, x) => a + x.meals, 0)}</strong> ({d.vendorMeals.map((x) => `${x.name} ${x.meals}`).join(', ')})
              </span>
            )}
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

        {d.seating && <SpecialMeals s={d.seating} />}

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

const mealLine = (m: Meal) =>
  [m.e && `Entrée: ${m.e}`, m.m && `Main: ${m.m}`, m.d && `Dessert: ${m.d}`].filter(Boolean).join(' · ');

/** For the caterer: the room, with the tables that have special meals marked, and each one by table and seat. */
function SpecialMeals({ s }: { s: Seating }) {
  const [only, setOnly] = useState<string | null>(null);
  const shown = only ? s.special.filter((r) => r.table === only) : s.special;
  const serious = s.special.filter((r) => r.serious).length;
  return (
    <section className={card} aria-label="Special meals by table">
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <strong className="text-[18px]">Special meals by table</strong>
        <button type="button" onClick={() => window.print()} className="py-[6px] px-3 rounded-full border border-[#c6b794] bg-transparent text-[13px] cursor-pointer text-[#33402f] print:hidden">
          Print
        </button>
      </div>
      <span className="text-[14px] text-[#5b6a52]">
        {s.event}: {s.special.length} special {s.special.length === 1 ? 'meal' : 'meals'}
        {serious ? `, ${serious} of them serious allergies` : ''}. Seats are numbered round each table from the first chair.
        {!s.published && ' This is the couple’s plan so far: it may still change.'}
      </span>
      {s.tables.length > 0 && (
        <div className="relative w-full rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f2] overflow-hidden" style={{ aspectRatio: cssAspect(s.aspect) }} role="img" aria-label="Room plan: tables with special meals are marked">
          {s.areas.map((a) => (
            <span key={`${a.label}${a.x}${a.y}`} className="absolute flex items-center justify-center rounded-[6px] border border-dashed border-[#c6b794] text-[10px] text-[#7a7466]" style={{ left: `${a.x - a.w / 2}%`, top: `${a.y - a.h / 2}%`, width: `${a.w}%`, height: `${a.h}%` }}>
              {a.label}
            </span>
          ))}
          {s.tables.map((t) => {
            const b = tableBox(t, s.aspect);
            const on = only === t.name;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOnly(on ? null : t.special ? t.name : null)}
                aria-label={`${t.name}: ${t.guests} guests, ${t.special} special ${t.special === 1 ? 'meal' : 'meals'}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center border-2 p-0 text-[10px] leading-tight ${t.special ? 'cursor-pointer' : 'cursor-default'} ${on ? 'ring-2 ring-[#33402f]' : ''}`}
                style={{
                  left: `${t.x}%`,
                  top: `${t.y}%`,
                  width: `${b.w}%`,
                  height: `${b.h}%`,
                  borderRadius: b.radius,
                  background: t.serious ? '#f6dcd2' : t.special ? '#f3e7c9' : '#ffffff',
                  borderColor: t.serious ? '#a8473a' : t.special ? '#b39563' : '#d6c8a6',
                  color: '#33402f',
                }}
              >
                <span className="font-semibold">{t.name.replace(/^Table /, '')}</span>
                {t.special > 0 && <span className={t.serious ? 'text-[#7a4a37] font-semibold' : ''}>{t.special}★</span>}
              </button>
            );
          })}
        </div>
      )}
      <span className="text-[12px] text-[#7a7466]">★ special meals at that table · red: a serious allergy. Tap a table to see only its meals.</span>
      {only && (
        <button type="button" onClick={() => setOnly(null)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
          Show every table
        </button>
      )}
      <ul className="m-0 p-0 list-none flex flex-col">
        {shown.map((r) => (
          <li key={`${r.table}-${r.seat}-${r.name}`} className={`grid grid-cols-[92px_minmax(0,1fr)] gap-3 py-2 border-t border-[#ece3cd] ${r.serious ? 'text-[#7a4a37]' : ''}`}>
            <span className="text-[13px] font-semibold tabular-nums">
              {r.table}
              <span className="block font-normal text-[#7a7466]">Seat {r.seat}</span>
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{r.name}</span>
              {r.diet && <span className="block text-[14px]">{r.diet}{r.serious ? ' (serious)' : ''}</span>}
              {mealLine(r.meal) && <span className="block text-[13px] text-[#5b6a52]">{mealLine(r.meal)}</span>}
            </span>
          </li>
        ))}
        {!shown.length && <li className="py-2 text-[14px] text-[#7a7466]">No special meals{only ? ' at this table' : ' yet'}.</li>}
      </ul>
      {s.notSeated.length > 0 && (
        <div className="flex flex-col gap-1 pt-2 border-t border-[#ece3cd] text-[14px]">
          <strong className="text-[14px]">Special meals for guests without a seat yet</strong>
          {s.notSeated.map((r) => (
            <span key={r.name} className={r.serious ? 'text-[#7a4a37] font-semibold' : ''}>
              {r.name}: {[r.diet, mealLine(r.meal)].filter(Boolean).join(' · ')}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

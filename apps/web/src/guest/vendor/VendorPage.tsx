import { cssAspect, tableBox, type TableShape } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';

/**
 * /w/:slug/vendor?v=<vendor>&k=<key>: a vendor's own page (the celebrant, the caterer, the band). The day,
 * the venue, when to arrive, the timeline, guest numbers, dietary needs and meal choices, their payments,
 * the other suppliers on the day and who to call: always up to date, so the couple never re-sends details.
 * When the couple shares the seating (the caterer), the room plan with the tables that have special meals
 * marked, and each special meal by table and seat. The band or DJ gets the song list. Everything also comes
 * as live files for the vendor's own tools (calendar, spreadsheet), and the vendor confirms the details here.
 */
interface Data {
  couple: string;
  vendor: { name: string; category: string; arrival: string; meals: number; confirmedOn: string };
  shares: { seating: boolean; songs: boolean };
  event: { name: string; startsAt: string; venue: string; address: string } | null;
  timezone: string;
  parking: string;
  timeline: { t: string; what: string; where: string }[];
  guests: { coming: number; waiting: number } | null;
  dietary: { diet: string; n: number; serious: boolean }[];
  /** Meal choices of everyone coming, by course (counts only). */
  meals: { course: string; choice: string; n: number }[];
  payments: { label: string; amount: number; due: string; paid: boolean }[];
  contacts: { name: string; role: string; phone: string }[];
  /** The other suppliers booked for the day. */
  team: { name: string; category: string; arrival: string; contact: string; phone: string }[];
  seating?: Seating | null;
  /** The band or DJ: the couple's song list and guests' requests (how many asked, never who). */
  songs: Song[] | null;
  /** For the caterer: each booked vendor team's meals on the day. */
  vendorMeals?: { name: string; meals: number }[];
}
type Meal = { e: string; m: string; d: string };
type Song = { title: string; artist: string; note: string; status: 'must' | 'maybe' | 'no' | 'new'; asks: number };
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
const btn = 'min-h-[40px] py-[8px] px-4 rounded-full border border-[#c6b794] bg-transparent text-[14px] cursor-pointer text-[#33402f] no-underline inline-flex items-center print:hidden';
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

export function VendorPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const api = `/api/p/${encodeURIComponent(slug)}/vendor/${encodeURIComponent(params.get('v') ?? '')}/${encodeURIComponent(params.get('k') ?? '')}`;
  useEffect(() => {
    fetch(api)
      .then(async (r) => {
        const b = (await r.json()) as Data & { error?: { message: string } };
        if (!r.ok) throw new Error(b.error?.message ?? 'This page isn’t available.');
        setD(b);
      })
      .catch((e: Error) => setErr(e.message));
  }, [api]);
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
          {d.vendor.confirmedOn ? (
            <span className="text-[14px] font-semibold text-[#3d4a2f]">You confirmed these details on {longDate(d.vendor.confirmedOn)}.</span>
          ) : (
            <a href="#confirm" className="text-[14px] font-semibold text-[#33402f] print:hidden">
              Got everything? Let the couple know
            </a>
          )}
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
              <>
                <span className="text-[13px] font-semibold tracking-[.12em] uppercase text-[#5b6a52] pt-1">Dietary needs</span>
                <ul className="m-0 pl-5 text-[15px]">
                  {d.dietary.map((x) => (
                    <li key={x.diet} className={x.serious ? 'font-semibold text-[#7a4a37]' : ''}>
                      {x.diet}: {x.n}
                      {x.serious ? ' (serious)' : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {d.meals.length > 0 && <MealCounts meals={d.meals} />}
          </section>
        )}

        {d.seating && <SpecialMeals s={d.seating} />}

        {d.songs && <Songs songs={d.songs} />}

        {d.team.length > 0 && (
          <section className={card} aria-label="Other suppliers on the day">
            <strong>Other suppliers on the day</strong>
            <ul className="m-0 p-0 list-none flex flex-col">
              {d.team.map((t, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 border-t border-[#ece3cd] first:border-t-0 text-[15px]">
                  <span className="min-w-0">
                    <span className="block font-semibold">{t.name}</span>
                    <span className="block text-[13px] text-[#5b6a52]">{[t.category, t.contact, t.arrival && `arriving ${t.arrival}`].filter(Boolean).join(' · ')}</span>
                  </span>
                  {t.phone && (
                    <a href={tel(t.phone)} className="self-center text-[#33402f] text-[14px]">
                      {t.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
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
                <a href={tel(ct.phone)} className="text-[#33402f]">
                  {ct.phone}
                </a>
              </span>
            ))}
          </section>
        )}

        <YourTools api={api} songs={!!d.songs} />
        <Confirm api={api} confirmedOn={d.vendor.confirmedOn} onDone={(on) => setD({ ...d, vendor: { ...d.vendor, confirmedOn: on } })} />
      </div>
    </main>
  );
}

/** Meal choices by course: how many of each, for ordering and prep. */
function MealCounts({ meals }: { meals: Data['meals'] }) {
  const courses = [...new Set(meals.map((m) => m.course))];
  return (
    <>
      <span className="text-[13px] font-semibold tracking-[.12em] uppercase text-[#5b6a52] pt-1">Meal choices</span>
      <div className="flex flex-col gap-2 text-[15px]">
        {courses.map((c) => (
          <div key={c}>
            <span className="font-semibold">{c}: </span>
            {meals
              .filter((m) => m.course === c)
              .map((m) => `${m.choice} ${m.n}`)
              .join(' · ')}
          </div>
        ))}
      </div>
    </>
  );
}

const SONG_LISTS: [Song['status'], string, string][] = [
  ['must', 'Must play', ''],
  ['maybe', 'If there’s time', ''],
  ['no', 'Please don’t play', 'text-[#7a4a37]'],
  ['new', 'Guests’ requests', 'text-[#5b6a52]'],
];

/** For the band or DJ: the couple's lists, and guests' requests (with how many asked for each). */
function Songs({ songs }: { songs: Song[] }) {
  return (
    <section className={card} aria-label="Songs">
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <strong className="text-[18px]">Songs</strong>
        <button type="button" onClick={() => window.print()} className={btn}>
          Print
        </button>
      </div>
      {!songs.length && <span className="text-[14px] text-[#7a7466]">No songs yet. The couple’s list and guests’ requests show up here as they come in.</span>}
      {SONG_LISTS.map(([st, label, tone]) => {
        const list = songs.filter((s) => s.status === st);
        if (!list.length) return null;
        return (
          <div key={st} className="flex flex-col">
            <span className={`text-[13px] font-semibold tracking-[.12em] uppercase pt-2 pb-1 ${tone || 'text-[#5b6a52]'}`}>
              {label} · {list.length}
            </span>
            {list.map((s, i) => (
              <span key={i} className={`py-[6px] border-t border-[#ece3cd] text-[15px] ${st === 'no' ? 'line-through decoration-[#c6a99a]' : ''}`}>
                <span className="font-semibold">{s.title}</span>
                {s.artist && <span className="text-[#5b6a52]"> · {s.artist}</span>}
                {s.asks > 1 && <span className="text-[13px] text-[#5b6a52]"> · {s.asks} guests asked</span>}
                {s.note && <span className="block text-[13px] text-[#5b6a52] no-underline">{s.note}</span>}
              </span>
            ))}
          </div>
        );
      })}
    </section>
  );
}

/**
 * The same details in the vendor's own tools: their calendar (subscribed, so changes arrive by themselves),
 * a spreadsheet of dietary needs and meals (or songs) that refreshes itself, or a file to import.
 */
function YourTools({ api, songs }: { api: string; songs: boolean }) {
  const [copied, setCopied] = useState('');
  const base = `${window.location.origin}${api}`;
  const copy = useCallback(async (label: string, u: string) => {
    try {
      await navigator.clipboard.writeText(u);
      setCopied(label);
    } catch {
      window.prompt('Copy this link', u);
    }
  }, []);
  const feeds: { label: string; file: string; what: string }[] = [
    { label: 'Dietary and meals', file: 'dietary.csv', what: 'Guest numbers, dietary needs and meal choices' },
    ...(songs ? [{ label: 'Songs', file: 'songs.csv', what: 'Must play, maybe, don’t play and guests’ requests' }] : []),
  ];
  return (
    <section className={`${card} print:hidden`} aria-label="Use in your own tools">
      <strong>Use these details in your own tools</strong>
      <span className="text-[14px] text-[#5b6a52]">Everything here stays live: when the couple changes something, your calendar and spreadsheet catch up by themselves.</span>
      <div className="flex flex-wrap gap-2">
        <a href={`${base.replace(/^https?:/, 'webcal:')}/day.ics`} className={btn}>
          Add to my calendar
        </a>
        {feeds.map((f) => (
          <a key={f.file} href={`${base}/${f.file}`} download className={btn}>
            {f.label} (spreadsheet)
          </a>
        ))}
      </div>
      <details className="text-[14px]">
        <summary className="cursor-pointer font-semibold py-1">Connect a live link (Google Sheets, Excel, booking software)</summary>
        <div className="flex flex-col gap-3 pt-2">
          {[{ label: 'Calendar', file: 'day.ics', what: 'The day, your arrival time and payments due' }, ...feeds].map((f) => (
            <div key={f.file} className="flex flex-col gap-1">
              <span>
                <strong>{f.label}</strong>: {f.what}
              </span>
              <span className="flex gap-2 items-center">
                <code className="flex-1 min-w-0 truncate text-[12px] bg-[#fbf8f2] border border-[#ece3cd] rounded-[8px] px-2 py-1">{`${base}/${f.file}`}</code>
                <button type="button" onClick={() => void copy(f.label, `${base}/${f.file}`)} className={btn}>
                  {copied === f.label ? 'Copied' : 'Copy'}
                </button>
              </span>
            </div>
          ))}
          <span className="text-[13px] text-[#5b6a52]">
            Google Sheets: in an empty cell type =IMPORTDATA("the link"). Excel: Data, then From Web, and paste the link. Calendars (Outlook, Google, Apple): add a calendar from a link, or subscribe. Any software that reads CSV or iCal links works the same way.
          </span>
        </div>
      </details>
    </section>
  );
}

/** The vendor tells the couple they have everything (with a note, if anything needs sorting). */
function Confirm({ api, confirmedOn, onDone }: { api: string; confirmedOn: string; onDone: (on: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const send = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch(`${api}/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note }) });
      const b = (await r.json()) as { confirmedOn?: string; error?: { message: string } };
      if (!r.ok || !b.confirmedOn) throw new Error(b.error?.message ?? 'That didn’t send. Please try again.');
      onDone(b.confirmedOn);
      setNote('');
      setMsg('Thank you. The couple can see you’ve confirmed.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id="confirm" className={`${card} print:hidden`} aria-label="Confirm the details">
      <strong>{confirmedOn ? 'Anything changed?' : 'Got everything you need?'}</strong>
      <span className="text-[14px] text-[#5b6a52]">
        {confirmedOn ? `You confirmed on ${longDate(confirmedOn)}. Send another note any time.` : 'Let the couple know you have the details. Add a note if anything needs sorting.'}
      </span>
      <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52]">
        Note for the couple (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={800} rows={3} className="w-full p-3 rounded-[12px] border border-[#d6c8a6] bg-[#fbf8f2] text-[15px] text-[#33402f] font-[inherit]" />
      </label>
      <button type="button" disabled={busy} onClick={() => void send()} className="self-start min-h-[44px] py-[10px] px-5 rounded-full border-0 bg-[#33402f] text-white text-[15px] cursor-pointer disabled:opacity-60">
        {busy ? 'Sending…' : confirmedOn ? 'Send' : 'Confirm the details'}
      </button>
      {msg && (
        <span role="status" className="text-[14px]">
          {msg}
        </span>
      )}
    </section>
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

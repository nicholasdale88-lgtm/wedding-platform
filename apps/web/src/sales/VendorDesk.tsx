import { dateIn, localParts } from '@wp/shared';
import { useMemo, useState } from 'react';
import { directoryApi, type EnquiryStage, type MyListing, type VendorCouple } from '../lib/api';
import { FeeProposalBuilder } from './FeeProposal';

/**
 * The vendor's desk: their Overview (what needs them, what's coming up, their season, how strong their listing
 * is), a Calendar (booked weddings, pencilled enquiries, days they're unavailable) and their Enquiries as a
 * pipeline (new, replied, quoted, booked, not going ahead), with a private note and a date-clash check on each.
 */

const INK = '#33402f';
const SOFT = '#5b6a52';
const GOLD = '#b39563';
const serif = "'Cormorant Garamond', Georgia, serif";
const card = 'flex flex-col gap-3 p-5 rounded-[16px] bg-white border border-[#e2d7bc] shadow-[0_1px_3px_rgba(51,64,47,.06)]';
const h = 'm-0 text-[12px] font-semibold tracking-[.16em] uppercase';

type Enquiry = MyListing['enquiries'][number];
export type DeskGo = 'couples' | 'quotes' | 'enquiries' | 'proposals' | 'calendar' | 'recommend' | 'listing';

/**
 * Vendors work in Australian time: "today", day counts, the calendar's month and the season's months are all
 * Sydney's, never UTC's (before 11am AEDT, UTC is still on yesterday). A wedding's ISO time is read as the
 * Sydney day it falls on; a plain date stays as it is.
 */
export const DESK_TZ = 'Australia/Sydney';
export const deskDay = (iso: string) => (iso.length > 10 ? dateIn(DESK_TZ, new Date(iso)) : iso.slice(0, 10));
export const deskToday = (now: Date = new Date()) => dateIn(DESK_TZ, now);
/** The next twelve months from this Sydney month: keys (YYYY-MM) and short names. */
export function deskMonths(now: Date = new Date()) {
  const [y, m] = deskToday(now).split('-').map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1 + i, 15));
    return { key: t.toISOString().slice(0, 7), label: t.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' }) };
  });
}
const day = deskDay;
const today = () => deskToday();
/** Day of the month and short month name of a wedding, on its Sydney day. */
const dayNum = (iso: string) => Number(day(iso).slice(8, 10));
const monShort = (iso: string) => new Date(`${day(iso)}T12:00:00Z`).toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' });
const longDate = (d: string) => {
  try {
    return new Date(`${d.slice(0, 10)}T12:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
};
const daysTo = (d: string) => Math.round((Date.parse(`${day(d)}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86_400_000);
const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? `in ${n} days` : `${-n} days ago`);
const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;

export const STAGES: [EnquiryStage, string][] = [
  ['new', 'New'],
  ['replied', 'Replied'],
  ['quoted', 'Quoted'],
  ['booked', 'Booked'],
  ['lost', 'Not going ahead'],
];
const stageOf = (e: Enquiry): EnquiryStage => e.stage ?? (e.read ? 'replied' : 'new');
const open = (e: Enquiry) => !['booked', 'lost'].includes(stageOf(e));

/** What's already on that date: a booked couple, or a day they marked unavailable. */
function clashOn(date: string, couples: VendorCouple[], busy: MyListing['busy']) {
  if (!date) return null;
  const c = couples.find((x) => x.status === 'booked' && day(x.date) === date);
  if (c) return `You’re booked that day: ${c.couple}`;
  const b = (busy ?? []).find((x) => x.date === date);
  if (b) return `You marked that day unavailable${b.note ? ` (${b.note})` : ''}`;
  return null;
}

/** How complete their directory listing is, and what would make it stronger. */
export function listingStrength(l: MyListing['listing']) {
  const checks: [boolean, string][] = [
    [l.photos.length >= 3, 'Add at least 3 photos of your work'],
    [!!l.priceFrom, 'Add a “from” price: couples filter by it'],
    [(l.packages ?? []).some((p) => p.price > 0), 'Add at least one package with prices'],
    [l.about.trim().length >= 120, 'Write a few lines about how you work (120+ characters)'],
    [!!l.contactName.trim(), 'Add your name, so couples know who they’re talking to'],
    [!!(l.website.trim() || l.instagram.trim()), 'Add your website or Instagram'],
    [l.regions.length > 0, 'Add the other regions you travel to'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { score: Math.round((done / checks.length) * 100), todo: checks.filter(([ok]) => !ok).map(([, t]) => t) };
}

// ---------------------------------------------------------------------------------------------- Overview

export function VendorOverview({ data, couples, unread, quotesOpen, changes = [], go }: { data: MyListing; couples: VendorCouple[]; unread: number; quotesOpen: number; changes?: { to: string; title: string; message: string }[]; go: (t: DeskGo) => void }) {
  const l = data.listing;
  const now = today();
  const ahead = couples.filter((c) => c.status === 'booked' && day(c.date) >= now).sort((a, b) => a.date.localeCompare(b.date));
  const openEnq = data.enquiries.filter(open);
  const newEnq = data.enquiries.filter((e) => stageOf(e) === 'new');
  const strength = listingStrength(l);
  const hour = localParts(new Date(), DESK_TZ).hour % 24;
  const hello = `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}${l.contactName ? `, ${first(l.contactName)}` : ''}`;

  // What needs them, most pressing first.
  const needs: { text: string; detail: string; to: DeskGo; urgent?: boolean; request?: boolean }[] = [];
  for (const c of couples.filter((x) => x.unread)) needs.push({ text: `${c.couple} wrote to you`, detail: c.last?.body ?? '', to: 'couples', urgent: true });
  for (const p of changes) needs.push({ text: `${p.to} asked for changes`, detail: `${p.title}: ${p.message}`.slice(0, 160), to: 'proposals', urgent: true, request: true });
  for (const e of newEnq) needs.push({ text: `New enquiry from ${e.name}`, detail: [e.date && longDate(e.date), e.guests ? `${e.guests} guests` : ''].filter(Boolean).join(' · '), to: 'enquiries', urgent: true, request: true });
  for (const c of couples)
    for (const q of c.quotes ?? [])
      if (!q.answered && !q.declined && !q.closed) needs.push({ text: `Price ${c.couple}’s quote request`, detail: `${q.title}${q.due ? ` · due ${inDays(daysTo(q.due))}` : ''}`, to: 'quotes', urgent: !!q.due && daysTo(q.due) <= 7, request: true });
  for (const e of openEnq) {
    const clash = clashOn(e.date, couples, data.busy);
    if (clash) needs.push({ text: `${e.name}’s date clashes`, detail: clash, to: 'enquiries' });
  }
  for (const c of ahead.filter((x) => daysTo(x.date) <= 14)) needs.push({ text: `${c.couple}’s wedding is ${inDays(daysTo(c.date))}`, detail: 'Check their timeline, numbers and dietary needs', to: 'couples' });
  if (strength.score < 100) needs.push({ text: `Your listing is ${strength.score}% complete`, detail: strength.todo[0] ?? '', to: 'listing' });
  // Requests waiting: new enquiries, unpriced quote requests and proposals sent back for changes, one each
  // (not messages, wedding dates, date clashes or the listing tip).
  const requests = needs.filter((n) => n.request).length;

  // The next twelve months: weddings booked, and enquiries pencilled, per month.
  const months = deskMonths().map(({ key, label }) => ({
    key,
    label,
    booked: couples.filter((c) => c.status === 'booked' && day(c.date).slice(0, 7) === key).length,
    pencilled: data.enquiries.filter((e) => open(e) && day(e.date).slice(0, 7) === key).length,
  }));
  const top = Math.max(1, ...months.map((m) => m.booked + m.pencilled));

  const stats: [string, string | number, DeskGo, string][] = [
    ['Weddings ahead', ahead.length, 'calendar', ahead[0] ? `Next ${inDays(daysTo(ahead[0].date))}` : 'None booked yet'],
    ['Open enquiries', openEnq.length, 'enquiries', newEnq.length ? `${newEnq.length} new` : 'All answered'],
    ['Unread messages', unread, 'couples', unread ? 'From your couples' : 'All read'],
    ['Quote requests', quotesOpen, 'quotes', quotesOpen ? 'Waiting for your price' : 'All priced'],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="order-1 lg:order-none">
        <h2 className="m-0 text-[30px] font-normal" style={{ fontFamily: serif, color: INK }}>
          {hello}
        </h2>
        <p className="m-0 text-[15px]" style={{ color: SOFT }}>
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: DESK_TZ })}
          {data.partner ? ` · ${data.partner.uses} ${data.partner.uses === 1 ? 'couple has' : 'couples have'} used your code ${data.partner.code}` : ''}
        </p>
      </div>

      {/* On a phone the four figures come after Next 3 things, so all three and "All requests" are on the first
          screen above the tab bar (send-10b); a computer keeps them first. */}
      <div className="order-3 lg:order-none grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stats.map(([k, v, to, sub]) => (
          <button key={k} type="button" onClick={() => go(to)} className="flex flex-col items-start gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] text-left cursor-pointer hover:shadow-[0_6px_16px_rgba(51,64,47,.08)]">
            <span className="text-[11px] font-semibold tracking-[.14em] uppercase" style={{ color: SOFT }}>
              {k}
            </span>
            <span className="text-[38px] leading-none" style={{ fontFamily: serif, color: INK }}>
              {v}
            </span>
            <span className="text-[13px]" style={{ color: SOFT }}>
              {sub}
            </span>
          </button>
        ))}
      </div>

      <div className="order-2 lg:order-none grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start">
        <section aria-label="Next 3 things" className={card}>
          <h3 className={h} style={{ color: SOFT }}>
            Next 3 things
          </h3>
          {!needs.length && <p className="m-0 text-[20px] italic" style={{ fontFamily: serif, color: INK }}>All caught up.</p>}
          {needs.slice(0, 3).map((n, i) => (
            <button key={i} type="button" onClick={() => go(n.to)} className="flex items-start gap-3 py-2 border-t border-[#efe6d0] first-of-type:border-t-0 bg-transparent text-left cursor-pointer min-h-[44px]">
              <span aria-hidden className="mt-[6px] flex-none w-[9px] h-[9px] rounded-full" style={{ background: n.urgent ? '#a4553c' : GOLD }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold" style={{ color: INK }}>
                  {n.text}
                </span>
                {n.detail && (
                  <span className="block text-[13px] truncate" style={{ color: SOFT }}>
                    {n.detail}
                  </span>
                )}
              </span>
              <span aria-hidden className="text-[15px]" style={{ color: SOFT }}>
                →
              </span>
            </button>
          ))}
          {requests > 0 && (
            <button type="button" onClick={() => go('enquiries')} className="self-start inline-flex items-center min-h-[44px] p-0 border-0 bg-transparent underline cursor-pointer text-[14px]" style={{ color: INK }}>
              All requests ({requests})
            </button>
          )}
        </section>

        <section aria-label="Coming up" className={card}>
          <h3 className={h} style={{ color: SOFT }}>
            Coming up
          </h3>
          {!ahead.length && <p className="m-0 text-[15px]" style={{ color: SOFT }}>No weddings booked ahead yet. Your couples appear here once they book you in their planner.</p>}
          {ahead.slice(0, 5).map((c) => (
            <button key={c.id} type="button" onClick={() => go('couples')} className="grid grid-cols-[54px_minmax(0,1fr)] gap-3 items-center py-2 border-t border-[#efe6d0] first-of-type:border-t-0 bg-transparent text-left cursor-pointer">
              <span className="flex flex-col items-center justify-center h-[54px] rounded-[12px] bg-[#f3ecd6]" style={{ color: INK }}>
                <span className="text-[11px] font-semibold uppercase tracking-[.1em]">{monShort(c.date)}</span>
                <span className="text-[22px] leading-none" style={{ fontFamily: serif }}>
                  {dayNum(c.date)}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold truncate" style={{ color: INK }}>
                  {c.couple}
                </span>
                <span className="block text-[13px] truncate" style={{ color: SOFT }}>
                  {[inDays(daysTo(c.date)), c.venue, c.coming ? `${c.coming} coming` : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </section>
      </div>

      {/* Folded: the twelve-month chart and the listing's strength (not on the first screen). */}
      <details className="order-4 lg:order-none flex flex-col gap-4">
        <summary className="inline-flex items-center min-h-[44px] cursor-pointer text-[14px] font-medium" style={{ color: SOFT }}>
          More: your season and your listing
        </summary>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start pt-3">
        <section aria-label="Your season" className={card}>
          <div className="flex justify-between items-baseline gap-3 flex-wrap">
            <h3 className={h} style={{ color: SOFT }}>
              Your next 12 months
            </h3>
            <span className="flex gap-3 text-[12px]" style={{ color: SOFT }}>
              <span className="flex items-center gap-1">
                <span className="w-[10px] h-[10px] rounded-[3px]" style={{ background: INK }} /> Booked
              </span>
              <span className="flex items-center gap-1">
                <span className="w-[10px] h-[10px] rounded-[3px]" style={{ background: '#e6d3a8' }} /> Enquiries
              </span>
            </span>
          </div>
          <div className="grid grid-cols-12 gap-[6px] items-end h-[120px]" role="img" aria-label={`Weddings booked per month: ${months.map((m) => `${m.label} ${m.booked}`).join(', ')}`}>
            {months.map((m) => (
              <div key={m.key} className="flex flex-col items-stretch justify-end h-full gap-[2px]">
                <div className="rounded-t-[4px]" style={{ height: `${(m.pencilled / top) * 100}%`, background: '#e6d3a8' }} />
                <div className={m.pencilled ? '' : 'rounded-t-[4px]'} style={{ height: `${(m.booked / top) * 100}%`, background: INK, borderRadius: '0 0 4px 4px' }} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-12 gap-[6px] text-center text-[11px]" style={{ color: SOFT }}>
            {months.map((m) => (
              <span key={m.key}>{m.label}</span>
            ))}
          </div>
        </section>

        <section aria-label="Your listing" className={card}>
          <div className="flex justify-between items-baseline gap-3">
            <h3 className={h} style={{ color: SOFT }}>
              Your listing
            </h3>
            <span className="text-[24px]" style={{ fontFamily: serif, color: INK }}>
              {strength.score}%
            </span>
          </div>
          <div className="h-[8px] rounded-full bg-[#efe6d0] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${strength.score}%`, background: strength.score === 100 ? '#5d6b47' : GOLD }} />
          </div>
          {strength.todo.length ? (
            <ul className="m-0 pl-5 flex flex-col gap-1 text-[14px]" style={{ color: INK }}>
              {strength.todo.slice(0, 3).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[14px]" style={{ color: SOFT }}>
              Complete: couples see everything they need to choose you.
            </p>
          )}
          <span className="text-[13px]" style={{ color: SOFT }}>
            Booked by {l.booked} {l.booked === 1 ? 'couple' : 'couples'} through the app.
          </span>
          <button type="button" onClick={() => go('listing')} className="self-start py-2 px-4 min-h-[44px] rounded-full border border-[#c6b794] bg-white text-[14px] font-semibold cursor-pointer" style={{ color: INK }}>
            Edit your listing
          </button>
        </section>
      </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Calendar

export function VendorCalendar({ data, couples, onBusy }: { data: MyListing; couples: VendorCouple[]; onBusy: (busy: NonNullable<MyListing['busy']>) => Promise<void> }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [picked, setPicked] = useState('');
  const [why, setWhy] = useState('');
  const [busyNow, setBusyNow] = useState(false);
  const busy = data.busy ?? [];
  const [y, m] = month.split('-').map(Number) as [number, number];
  const firstDay = new Date(y, m - 1, 1);
  const lead = (firstDay.getDay() + 6) % 7; // weeks start on Monday
  const days = new Date(y, m, 0).getDate();
  const cells = [...Array(lead).fill(''), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setPicked('');
  };
  const on = (d: string) => ({
    booked: couples.filter((c) => c.status === 'booked' && day(c.date) === d),
    maybe: couples.filter((c) => c.status !== 'booked' && day(c.date) === d),
    asks: data.enquiries.filter((e) => open(e) && e.date === d),
    off: busy.find((b) => b.date === d),
  });
  const sel = picked ? on(picked) : null;
  const toggle = async () => {
    if (!picked) return;
    setBusyNow(true);
    try {
      await onBusy(sel?.off ? busy.filter((b) => b.date !== picked) : [...busy, { date: picked, note: why.trim() }]);
      setWhy('');
    } finally {
      setBusyNow(false);
    }
  };
  const title = firstDay.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
      <section aria-label="Calendar" className={card}>
        <div className="flex items-center justify-between gap-3">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="w-10 h-10 rounded-full border border-[#c6b794] bg-white cursor-pointer text-[18px]" style={{ color: INK }}>
            ‹
          </button>
          <h2 className="m-0 text-[26px] font-normal" style={{ fontFamily: serif, color: INK }}>
            {title}
          </h2>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="w-10 h-10 rounded-full border border-[#c6b794] bg-white cursor-pointer text-[18px]" style={{ color: INK }}>
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold tracking-[.1em] uppercase" style={{ color: SOFT }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`x${i}`} />;
            const x = on(d);
            const isPicked = d === picked;
            const bg = x.booked.length ? INK : x.off ? '#d9d2c2' : x.asks.length || x.maybe.length ? '#f3e6c4' : '#fbf8f0';
            const fg = x.booked.length ? '#f3ecd6' : INK;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={isPicked}
                aria-label={`${longDate(d)}${x.booked.length ? `, booked: ${x.booked.map((c) => c.couple).join(', ')}` : ''}${x.off ? ', unavailable' : ''}${x.asks.length ? `, ${x.asks.length} enquiry` : ''}`}
                onClick={() => setPicked(isPicked ? '' : d)}
                className={`relative flex flex-col items-start justify-between min-h-[54px] sm:min-h-[70px] p-1 sm:p-2 rounded-[10px] text-left cursor-pointer border ${isPicked ? 'border-[#33402f] shadow-[0_0_0_1px_#33402f]' : 'border-transparent'} ${d === today() ? 'outline outline-1 outline-[#b39563]' : ''}`}
                style={{ background: bg, color: fg }}
              >
                <span className="text-[13px] font-semibold">{Number(d.slice(8))}</span>
                <span className="hidden sm:block text-[10px] leading-tight truncate w-full">{x.booked[0]?.couple ?? (x.off ? 'Unavailable' : x.asks[0] ? `Enquiry: ${first(x.asks[0].name)}` : x.maybe[0] ? first(x.maybe[0].couple) : '')}</span>
                {(x.asks.length > 0 || x.maybe.length > 0) && !x.booked.length && <span aria-hidden className="sm:hidden absolute bottom-1 right-1 w-[6px] h-[6px] rounded-full" style={{ background: GOLD }} />}
              </button>
            );
          })}
        </div>
        <div className="flex gap-4 flex-wrap text-[12px]" style={{ color: SOFT }}>
          {[
            [INK, 'Booked'],
            ['#f3e6c4', 'Enquiry or considering'],
            ['#d9d2c2', 'Unavailable'],
          ].map(([c, t]) => (
            <span key={t} className="flex items-center gap-1">
              <span className="w-[12px] h-[12px] rounded-[3px] border border-[#e2d7bc]" style={{ background: c }} /> {t}
            </span>
          ))}
        </div>
      </section>

      <section aria-label="That day" className={card}>
        {!sel ? (
          <>
            <h3 className={h} style={{ color: SOFT }}>
              This month
            </h3>
            {couples
              .filter((c) => day(c.date).slice(0, 7) === month)
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((c) => (
                <span key={c.id} className="flex justify-between gap-3 text-[15px]" style={{ color: INK }}>
                  <span>
                    {c.couple} <span style={{ color: SOFT }}>· {c.status === 'booked' ? 'booked' : 'considering you'}</span>
                  </span>
                  <span style={{ color: SOFT }}>{dayNum(c.date)}</span>
                </span>
              ))}
            {!couples.some((c) => day(c.date).slice(0, 7) === month) && <p className="m-0 text-[14px]" style={{ color: SOFT }}>No weddings this month.</p>}
            <p className="m-0 text-[13px]" style={{ color: SOFT }}>
              Tap a day to see it, or to mark it unavailable.
            </p>
          </>
        ) : (
          <>
            <h3 className="m-0 text-[22px] font-normal" style={{ fontFamily: serif, color: INK }}>
              {longDate(picked)}
            </h3>
            {sel.booked.map((c) => (
              <span key={c.id} className="text-[15px] font-semibold" style={{ color: INK }}>
                Booked: {c.couple}
                {c.venue ? ` at ${c.venue}` : ''}
              </span>
            ))}
            {sel.maybe.map((c) => (
              <span key={c.id} className="text-[15px]" style={{ color: INK }}>
                Considering you: {c.couple}
              </span>
            ))}
            {sel.asks.map((e) => (
              <span key={e.id} className="text-[15px]" style={{ color: INK }}>
                Enquiry: {e.name}
                {e.guests ? ` (${e.guests} guests)` : ''}
              </span>
            ))}
            {sel.off && (
              <span className="text-[15px]" style={{ color: INK }}>
                Unavailable{sel.off.note ? `: ${sel.off.note}` : ''}
              </span>
            )}
            {!sel.booked.length && !sel.maybe.length && !sel.asks.length && !sel.off && <span className="text-[15px]" style={{ color: SOFT }}>Free.</span>}
            {!sel.off && (
              <input aria-label="Why you’re unavailable (optional)" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={120} placeholder="Why (optional): another booking, a holiday…" className="w-full py-2 px-3 rounded-[10px] border border-[#c6b794] bg-white text-[16px]" />
            )}
            <button type="button" disabled={busyNow} onClick={() => void toggle()} className="self-start py-2 px-4 min-h-[44px] rounded-full border-0 text-[14px] font-semibold cursor-pointer disabled:opacity-60" style={{ background: INK, color: '#f3ecd6' }}>
              {sel.off ? 'Mark as available again' : 'Mark this day unavailable'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Enquiries

export function EnquiryPipeline({ data, couples, onChanged }: { data: MyListing; couples: VendorCouple[]; onChanged: () => Promise<void> }) {
  const [filter, setFilter] = useState<EnquiryStage | 'open' | 'all'>('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [proposing, setProposing] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const l = data.listing;
  const list = useMemo(
    () => data.enquiries.filter((e) => (filter === 'all' ? true : filter === 'open' ? open(e) : stageOf(e) === filter)).sort((a, b) => (stageOf(a) === 'new' ? 0 : 1) - (stageOf(b) === 'new' ? 0 : 1) || b.at.localeCompare(a.at)),
    [data.enquiries, filter],
  );
  const count = (s: EnquiryStage) => data.enquiries.filter((e) => stageOf(e) === s).length;
  const set = async (e: Enquiry, patch: { stage?: EnquiryStage; note?: string }) => {
    setProblem('');
    try {
      await directoryApi.updateEnquiry(e.id, patch);
      await onChanged();
    } catch (err) {
      setProblem((err as Error).message);
    }
  };
  /** A first reply in their voice, ready to send from their own email (free or booked that day, it says so). */
  const draft = (e: Enquiry) => {
    const clash = clashOn(e.date, couples, data.busy);
    const when = e.date ? ` on ${longDate(e.date)}` : '';
    const body = clash
      ? `Hi ${first(e.name)},\n\nThank you so much for thinking of ${l.name} for your wedding${when}. I’m sorry to say I’m already booked that day. If your date is flexible, I’d love to help, and I’m happy to recommend someone wonderful otherwise.\n\nWarmly,\n${l.contactName || l.name}`
      : `Hi ${first(e.name)},\n\nThank you so much for getting in touch about your wedding${when}. Good news: I’m available that day.\n\n${l.priceFrom ? `My packages start from $${l.priceFrom.toLocaleString('en-AU')}. ` : ''}Could you tell me a little more about what you have in mind? A quick call is often easiest: what suits you?\n\nWarmly,\n${l.contactName || l.name}`;
    return `mailto:${e.email}?subject=${encodeURIComponent(`Your wedding${when} · ${l.name}`)}&body=${encodeURIComponent(body)}`;
  };
  const chips: [typeof filter, string, number][] = [
    ['open', 'Open', data.enquiries.filter(open).length],
    ...STAGES.map(([k, t]) => [k, t, count(k)] as [typeof filter, string, number]),
    ['all', 'All', data.enquiries.length],
  ];
  return (
    <section aria-label="Enquiries" className="flex flex-col gap-4">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <h2 className="m-0 text-[30px] font-normal" style={{ fontFamily: serif, color: INK }}>
            Enquiries
          </h2>
          <p className="m-0 text-[14px]" style={{ color: SOFT }}>
            From couples who found you in the directory. Move each one along as it goes; notes are only for you.
          </p>
        </div>
        {data.enquiries.length > 0 && (
          <span className="text-[14px]" style={{ color: SOFT }}>
            {Math.round((count('booked') / Math.max(1, count('booked') + count('lost'))) * 100)}% of decided enquiries booked
          </span>
        )}
      </div>
      <div role="tablist" aria-label="Show enquiries" className="flex flex-wrap gap-2 pb-1">
        {chips.map(([k, t, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`flex-none py-2 px-4 min-h-[44px] whitespace-nowrap rounded-full border text-[14px] cursor-pointer ${filter === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-white border-[#c6b794]'}`}
            style={filter === k ? undefined : { color: INK }}
          >
            {t} · {n}
          </button>
        ))}
      </div>
      {problem && (
        <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">
          {problem}
        </p>
      )}
      {!list.length && <p className="m-0 text-[15px]" style={{ color: SOFT }}>{data.enquiries.length ? 'Nothing here.' : 'None yet. Couples’ questions about their date will appear here.'}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((e) => {
          const st = stageOf(e);
          const clash = clashOn(e.date, couples, data.busy);
          const note = notes[e.id] ?? e.note ?? '';
          return (
            <article key={e.id} aria-label={`Enquiry from ${e.name}`} className={`flex flex-col gap-2 p-4 rounded-[16px] border bg-white ${st === 'new' ? 'border-[#b39563] shadow-[0_0_0_1px_#b39563]' : 'border-[#e2d7bc]'}`}>
              <div className="flex justify-between gap-2 flex-wrap items-baseline">
                <strong className="text-[17px]" style={{ color: INK }}>
                  {e.name}
                </strong>
                <span className="text-[13px]" style={{ color: SOFT }}>
                  Asked {inDays(daysTo(e.at))}
                </span>
              </div>
              <span className="text-[14px]" style={{ color: INK }}>
                {[e.date && `Wedding ${longDate(e.date)}${daysTo(e.date) > 0 ? ` (${inDays(daysTo(e.date))})` : ''}`, e.guests ? `about ${e.guests} guests` : ''].filter(Boolean).join(' · ')}
              </span>
              {e.date && (
                <span className={`self-start py-[3px] px-3 rounded-full text-[12px] font-semibold ${clash ? 'bg-[#fbe9e4] text-[#7a2e20]' : 'bg-[#e7eedb] text-[#3d5a2c]'}`}>
                  {clash ?? 'You’re free that day'}
                </span>
              )}
              <p className="m-0 text-[15px] whitespace-pre-line" style={{ color: INK }}>
                {e.message}
              </p>
              <label className="flex items-center gap-2 text-[13px]" style={{ color: SOFT }}>
                Stage
                <select aria-label={`${e.name}’s stage`} value={st} onChange={(ev) => void set(e, { stage: ev.target.value as EnquiryStage })} className="py-[6px] px-2 rounded-[10px] border border-[#c6b794] bg-white text-[14px]" style={{ color: INK }}>
                  {STAGES.map(([k, t]) => (
                    <option key={k} value={k}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label={`Your note about ${e.name}`}
                rows={2}
                maxLength={2000}
                value={note}
                placeholder="A note for you: what they want, what you quoted, when to follow up…"
                onChange={(ev) => setNotes((x) => ({ ...x, [e.id]: ev.target.value }))}
                onBlur={() => note !== (e.note ?? '') && void set(e, { note })}
                className="w-full py-2 px-3 rounded-[10px] border border-[#e2d7bc] bg-[#fbf8f0] text-[15px] resize-y"
                style={{ color: INK }}
              />
              <div className="flex gap-x-4 gap-y-1 flex-wrap text-[14px]">
                <a
                  href={draft(e)}
                  onClick={() => st === 'new' && void set(e, { stage: 'replied' })}
                  className="inline-flex items-center min-h-[40px] font-semibold"
                  style={{ color: INK }}
                >
                  Reply by email
                </a>
                {e.phone && (
                  <a href={`tel:${e.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center min-h-[40px]" style={{ color: INK }}>
                    Call {e.phone}
                  </a>
                )}
                {proposing !== e.id && (
                  <button type="button" onClick={() => setProposing(e.id)} className="inline-flex items-center min-h-[40px] p-0 border-0 bg-transparent underline cursor-pointer text-[14px] font-semibold" style={{ color: INK }}>
                    Send a fee proposal
                  </button>
                )}
              </div>
              {proposing === e.id && (
                <FeeProposalBuilder key={e.id} to={{ enquiry: e.id }} toName={e.name} packages={l.packages ?? []} onClose={() => {
                    setProposing(null);
                    void onChanged();
                  }} />
              )}
            </article>
          );
        })}
      </div>
      <p className="m-0 text-[13px]" style={{ color: SOFT }}>
        Reply by email opens your own email with a first reply written for you (it says whether you’re free that day). Edit it before you send.
      </p>
    </section>
  );
}

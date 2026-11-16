import { useEffect, useState } from 'react';
import { vendorCouplesApi, type VendorCoupleDetails } from '../lib/api';

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";

/**
 * In the vendor's portal, a couple's wedding as they share it with this vendor: the day and venue, numbers,
 * dietary needs (allergies first) and meal choices as counts, the vendor's own times in the timeline, who to
 * call, and the live dietary spreadsheet and calendar. Guests are never named. Before the couple has the
 * vendor in their planner, it says so.
 */
export function CoupleDetails({ wid, couple }: { wid: string; couple: string }) {
  const [d, setD] = useState<{ inPlanner: boolean; details: VendorCoupleDetails | null } | null>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    setD(null);
    setProblem('');
    vendorCouplesApi
      .details(wid)
      .then(setD)
      .catch((e: Error) => setProblem(e.message));
  }, [wid]);
  if (problem) return <p className="m-0 text-[14px] text-[#7a4a37]">{problem}</p>;
  if (!d) return <p aria-busy="true" className="m-0 text-[14px]" style={{ color: SOFT }}>Loading their details…</p>;
  if (!d.details)
    return (
      <p className="m-0 p-4 rounded-[14px] bg-[#fbf8f0] border border-[#e2d7bc] text-[14px]" style={{ color: SOFT }}>
        When {couple} add you to their planner (or accept your invitation there), their day, numbers and dietary needs appear here, kept up to date.
      </p>
    );
  const x = d.details;
  const when = x.event?.startsAt ? new Date(x.event.startsAt).toLocaleString('en-AU', { timeZone: x.timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date not set yet';
  const serious = x.dietary.filter((r) => r.serious);
  const other = x.dietary.filter((r) => !r.serious);
  const courses = [...new Set(x.meals.map((m) => m.course))];
  const mine = x.timeline.filter((r) => r.mine);
  const card = 'flex flex-col gap-2 p-4 rounded-[14px] border border-[#e2d7bc] bg-white';
  const h = 'm-0 text-[11px] font-semibold tracking-[.16em] uppercase';
  return (
    <section data-print-sheet aria-label={`${couple}: their wedding`} className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <h3 className="m-0 text-[22px] font-medium" style={{ fontFamily: serif, color: INK }}>
          {couple}: the day
        </h3>
        <button
          type="button"
          onClick={() => {
            // Only this sheet prints (see index.css): one page to take on the day.
            document.body.classList.add('printing-sheet');
            const done = () => {
              document.body.classList.remove('printing-sheet');
              window.removeEventListener('afterprint', done);
            };
            window.addEventListener('afterprint', done);
            window.print();
          }}
          className="print:hidden py-2 px-4 min-h-[40px] rounded-full border border-[#c6b794] bg-white text-[14px] font-semibold cursor-pointer"
          style={{ color: INK }}
        >
          Print a day sheet
        </button>
      </div>
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
        {[
          ['Coming', x.guests ? String(x.guests.coming) : '–'],
          ['Still to reply', x.guests ? String(x.guests.waiting) : '–'],
          ['Special diets', String(x.dietary.reduce((n, r) => n + r.n, 0))],
          ['Allergies', String(serious.reduce((n, r) => n + r.n, 0))],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 p-3 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <span className="text-[11px] font-semibold tracking-[.12em] uppercase" style={{ color: SOFT }}>{k}</span>
            <span className={`text-[28px] leading-none ${k === 'Allergies' && v !== '0' ? 'text-[#9b3d2c]' : ''}`} style={{ fontFamily: serif, color: k === 'Allergies' && v !== '0' ? undefined : INK }}>{v}</span>
          </div>
        ))}
      </div>

      <div className={card}>
        <h4 className={h} style={{ color: SOFT }}>The day</h4>
        <span className="text-[16px]" style={{ color: INK }}>{when}</span>
        {x.event && (x.event.venue || x.event.address) && <span className="text-[14px]" style={{ color: SOFT }}>{[x.event.venue, x.event.address].filter(Boolean).join(', ')}</span>}
        {x.vendor.arrival && <span className="text-[14px]" style={{ color: INK }}>You arrive: <strong>{x.vendor.arrival}</strong></span>}
        {x.parking && <span className="text-[13px]" style={{ color: SOFT }}>Parking: {x.parking}</span>}
      </div>

      <div className={card}>
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <h4 className={h} style={{ color: SOFT }}>Dietary needs</h4>
          <a href={x.files.dietary} className="text-[13px] font-semibold" style={{ color: INK }}>Download the spreadsheet</a>
        </div>
        {!x.dietary.length && <span className="text-[14px]" style={{ color: SOFT }}>None yet. They appear as guests reply.</span>}
        {serious.length > 0 && (
          <ul aria-label="Allergies" className="m-0 p-0 list-none flex flex-col gap-1">
            {serious.map((r) => (
              <li key={r.diet} className="flex justify-between gap-3 py-[6px] px-3 rounded-[10px] bg-[#fbe9e4] text-[14px] text-[#7a2e20]">
                <span>⚠ {r.diet}</span>
                <strong>{r.n}</strong>
              </li>
            ))}
          </ul>
        )}
        {other.length > 0 && (
          <ul aria-label="Other dietary needs" className="m-0 p-0 list-none flex flex-col">
            {other.map((r) => (
              <li key={r.diet} className="flex justify-between gap-3 py-[6px] border-b border-[#efe6d0] text-[14px]" style={{ color: INK }}>
                <span>{r.diet}</span>
                <strong>{r.n}</strong>
              </li>
            ))}
          </ul>
        )}
        {x.vendor.meals > 0 && <span className="text-[13px]" style={{ color: SOFT }}>Meals for your team on the day: {x.vendor.meals}</span>}
      </div>

      {courses.length > 0 && (
        <div className={card}>
          <h4 className={h} style={{ color: SOFT }}>Meal choices</h4>
          {courses.map((course) => (
            <div key={course} className="flex flex-col gap-1">
              <strong className="text-[14px]" style={{ color: INK }}>{course}</strong>
              {x.meals
                .filter((m) => m.course === course)
                .map((m) => (
                  <span key={m.choice} className="flex justify-between gap-3 text-[14px]" style={{ color: INK }}>
                    <span>{m.choice}</span>
                    <strong>{m.n}</strong>
                  </span>
                ))}
            </div>
          ))}
        </div>
      )}

      {x.timeline.length > 0 && (
        <div className={card}>
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <h4 className={h} style={{ color: SOFT }}>Timeline{mine.length ? ` · your ${mine.length} ${mine.length === 1 ? 'moment' : 'moments'} marked` : ''}</h4>
            <a href={x.files.day} className="text-[13px] font-semibold" style={{ color: INK }}>Add to your calendar</a>
          </div>
          <ol className="m-0 p-0 list-none flex flex-col">
            {x.timeline.map((r, i) => (
              <li key={i} className={`flex gap-3 py-[6px] px-2 rounded-[8px] text-[14px] ${r.mine ? 'bg-[#f3ecd6] font-semibold' : ''}`} style={{ color: INK }}>
                <span className="w-[64px] flex-none tabular-nums" style={{ color: SOFT }}>{r.t}</span>
                <span>
                  {r.what}
                  {r.where ? <span style={{ color: SOFT }}> · {r.where}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(x.contacts.length > 0 || x.team.length > 0) && (
        <div className={card}>
          <h4 className={h} style={{ color: SOFT }}>Who to call on the day</h4>
          {x.contacts.map((p, i) => (
            <span key={`c${i}`} className="flex justify-between gap-3 flex-wrap text-[14px]" style={{ color: INK }}>
              <span>
                {p.name} <span style={{ color: SOFT }}>· {p.role}</span>
              </span>
              {p.phone && <a href={`tel:${p.phone.replace(/\s+/g, '')}`} style={{ color: INK }}>{p.phone}</a>}
            </span>
          ))}
          {x.team.length > 0 && <span className="text-[12px] pt-1" style={{ color: SOFT }}>The other suppliers on the day</span>}
          {x.team.map((p, i) => (
            <span key={`t${i}`} className="flex flex-col gap-[2px] py-1 text-[14px]" style={{ color: INK }}>
              <span>
                {p.name} <span style={{ color: SOFT }}>· {p.category}{p.contact ? `, ask for ${p.contact}` : ''}{p.arrival ? `, from ${p.arrival}` : ''}</span>
              </span>
              {(p.phone || p.email) && (
                <span className="flex gap-x-4 flex-wrap">
                  {p.phone && <a href={`tel:${p.phone.replace(/\s+/g, '')}`} className="inline-flex items-center min-h-[36px]" style={{ color: INK }}>Call {p.phone}</a>}
                  {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center min-h-[36px] break-all" style={{ color: INK }}>{p.email}</a>}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

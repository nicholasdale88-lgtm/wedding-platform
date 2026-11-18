import { dateIn, linkHost, safeLink, type Quote } from '@wp/shared';
import { useState } from 'react';
import { SpinView } from '../../guest/quote/SpinView';

/**
 * What a vendor added to their quote beyond the price, for the couple: their "Pay or book with …" button (it
 * opens the vendor's own site, its address shown; we never handle the money), their virtual samples (photos, a
 * spin view, short videos, the sample box), video tasting times to book one of, and the couple's own rating.
 */
export function QuoteExtras({ q, vendor, slug, timezone, onChange }: { q: Quote; vendor: string; slug: string; timezone: string; onChange: (q: Quote, msg: string) => void }) {
  const pay = safeLink(q.payLink);
  const s = q.samples;
  const img = (id: string) => `/api/p/${encodeURIComponent(slug)}/rfq/media/${encodeURIComponent(id)}`;
  const slots = q.tastings ?? [];
  const booked = slots.find((t) => t.bookedOn);
  const [note, setNote] = useState(q.ratingNote ?? '');
  const has = pay || s?.photos.length || s?.spin.length || s?.videos.length || s?.box || slots.length;
  if (!has) return null;
  const when = (at: string) => {
    try {
      // The time as the vendor gave it (the wedding's time zone, which is the couple's too).
      return new Date(`${at}:00Z`).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    } catch {
      return at;
    }
  };
  const book = (id: string | null) =>
    onChange(
      { ...q, tastings: slots.map((t) => ({ ...t, bookedOn: t.id === id ? dateIn(timezone) : '' })) },
      id ? `Tasting with ${vendor} booked: ${when(slots.find((t) => t.id === id)!.at)}` : `Tasting with ${vendor} cancelled`,
    );
  const small = 'min-h-[40px] inline-flex items-center py-[6px] px-3 rounded-full border border-[var(--adm-line,#c6b794)] bg-white text-[13px] cursor-pointer no-underline !text-[var(--adm-ink,#33402f)]';
  return (
    <div className="flex flex-col gap-3 pt-2 mt-1 border-t border-[var(--adm-line,#efe6d0)]">
      {pay && (
        <a href={pay} target="_blank" rel="noopener noreferrer" className="self-start min-h-[44px] inline-flex flex-col justify-center py-2 px-4 rounded-[12px] bg-[#33402f] no-underline !text-[#fbf8f2]">
          <span className="text-[15px] font-semibold">Pay or book with {vendor} ↗</span>
          <span className="text-[12px] opacity-80">Opens {linkHost(pay)}: their own site. The Yes List never handles the money.</span>
        </a>
      )}
      {!!s?.photos.length && (
        <div className="flex flex-col gap-1">
          <strong className="text-[13px]">Their samples</strong>
          <ul className="m-0 p-0 list-none flex gap-2 overflow-x-auto pb-1">
            {s.photos.map((id) => (
              <li key={id} className="flex-none">
                <a href={img(id)} target="_blank" rel="noopener" aria-label="Open this sample photo">
                  <img src={img(id)} alt={`A sample from ${vendor}`} loading="lazy" className="w-[96px] h-[96px] rounded-[10px] object-cover bg-[#efe6d0]" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(s?.spin.length ?? 0) > 1 && (
        <div className="flex flex-col gap-1">
          <strong className="text-[13px]">Spin view</strong>
          <SpinView frames={s!.spin.map(img)} label={`${vendor}'s spin view`} />
        </div>
      )}
      {!!s?.videos.length && (
        <div className="flex flex-col gap-1">
          <strong className="text-[13px]">Videos</strong>
          <span className="flex gap-2 flex-wrap">
            {s.videos.map((x) => (
              <a key={x.url} href={safeLink(x.url)} target="_blank" rel="noopener noreferrer" className={small}>
                ▶ {x.label || 'Watch'} <span className="ml-1 text-[11px] opacity-70">({linkHost(safeLink(x.url))})</span>
              </a>
            ))}
          </span>
        </div>
      )}
      {s?.box && (
        <div className="text-[13px]">
          <strong className="font-semibold">Sample box:</strong> {s.box}
        </div>
      )}
      {slots.length > 0 && (
        <div className="flex flex-col gap-2">
          <strong className="text-[13px]">Video tasting</strong>
          {booked ? (
            <div className="flex flex-col gap-2 p-3 rounded-[10px] bg-[#eef1e4]">
              <span className="text-[14px] font-semibold text-[#3d4a2f]">
                Booked: {when(booked.at)} ({booked.mins} min)
              </span>
              <span className="flex gap-2 flex-wrap">
                {safeLink(booked.link) && (
                  <a href={safeLink(booked.link)} target="_blank" rel="noopener noreferrer" className={small}>
                    Join the call ({linkHost(safeLink(booked.link))})
                  </a>
                )}
                <button type="button" onClick={() => window.confirm('Cancel this tasting?') && book(null)} className={small}>
                  Cancel booking
                </button>
              </span>
            </div>
          ) : (
            <span className="flex gap-2 flex-wrap">
              {slots.map((t) => (
                <button key={t.id} type="button" onClick={() => book(t.id)} className={small}>
                  Book {when(t.at)}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <strong className="text-[13px]">Your rating</strong>
        <span role="radiogroup" aria-label={`Your rating of ${vendor}'s samples`} className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={q.rating === n}
              aria-label={`${n} of 5`}
              onClick={() => onChange({ ...q, rating: q.rating === n ? undefined : n }, `Rated ${vendor} ${n} of 5`)}
              className="w-[44px] h-[44px] p-0 border-0 bg-transparent cursor-pointer text-[24px] leading-none"
              style={{ color: (q.rating ?? 0) >= n ? '#b8893c' : '#d8ccb0' }}
            >
              ★
            </button>
          ))}
        </span>
        <input
          value={note}
          maxLength={500}
          placeholder="A note for yourselves (just you see it)"
          aria-label="Your note about the samples"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (q.ratingNote ?? '') && onChange({ ...q, ratingNote: note }, 'Note saved')}
          className="w-full py-2 px-3 rounded-[10px] border border-[var(--adm-line,#d3c6a4)] bg-white text-[14px]"
        />
      </div>
    </div>
  );
}

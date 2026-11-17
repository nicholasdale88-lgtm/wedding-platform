import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { guestApi, type ThanksPayload } from '../invitation/api';
import { themeOf } from '../themeKit';

/**
 * /w/:slug/thanks?g=<token>: the thank-you page, sent after the day (Setup → Thank-you page, and the "Thank you
 * for coming" text). The couple's photo and words, in the wedding's colours; once they say the photos are ready,
 * buttons to everyone's photos and the photographer's gallery; and a way to add their own.
 */
export function ThanksPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [d, setD] = useState<ThanksPayload | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    guestApi
      .thanks(slug, token)
      .then(setD)
      .catch((e: Error) => setErr(e.message));
  }, [slug, token]);
  useEffect(() => {
    if (d) document.title = `Thank you · ${first(d.wedding.name1)} & ${first(d.wedding.name2)}`;
  }, [d]);
  if (err) return <GuestMessage message={err} />;
  if (!d) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const t: Record<string, string | undefined> = themeOf(d.wedding.theme);
  const ink = t.dg ?? '#33402f';
  const bg = t.iv ?? '#f6f0e2';
  const gold = t.acc ?? '#b39563';
  const couple = `${first(d.wedding.name1)} & ${first(d.wedding.name2)}`;
  const q = token ? `?g=${encodeURIComponent(token)}` : '';
  const btn = 'inline-flex items-center justify-center min-h-[52px] px-6 rounded-full no-underline text-[18px] text-center';
  return (
    <main className="min-h-screen" style={{ background: bg, color: ink, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      <div className="max-w-[600px] mx-auto px-5 pt-12 pb-20 flex flex-col items-center gap-6 text-center">
        <span className="text-[13px] tracking-[.3em] uppercase font-semibold opacity-80">{couple}</span>
        <h1 className="m-0 font-normal text-[clamp(56px,16vw,84px)] leading-[1]" style={{ fontFamily: "'Pinyon Script', cursive" }}>
          {d.heading || 'Thank you'}
        </h1>
        <span aria-hidden className="w-16 h-[2px]" style={{ background: gold }} />
        {d.photo && <img src={d.photo} alt={`${couple} on their wedding day`} className="w-full max-h-[520px] object-cover rounded-[22px] shadow-[0_20px_50px_rgba(40,30,20,.22)]" />}
        <p className="m-0 text-[22px] leading-[1.5] italic whitespace-pre-line max-w-[480px]">
          {d.guest ? `Dear ${d.guest},\n\n` : ''}
          {d.message || 'Thank you for celebrating with us. Having you there made our day, and we’ll remember it always.'}
        </p>
        <span className="text-[30px]" style={{ fontFamily: "'Pinyon Script', cursive", color: gold }}>
          {d.signoff || `With love, ${couple}`}
        </span>

        {(d.album || d.gallery || d.addPhotos) && (
          <section aria-label="The photos" className="w-full flex flex-col items-center gap-3 mt-4 pt-6 border-t" style={{ borderColor: `${gold}66` }}>
            <span className="text-[13px] tracking-[.24em] uppercase font-semibold opacity-80">{d.album || d.gallery ? 'The photos are here' : 'Your photos'}</span>
            {d.gallery && (
              <a href={d.gallery} target="_blank" rel="noopener noreferrer" className={btn} style={{ background: ink, color: bg }}>
                See the professional photos
              </a>
            )}
            {d.album && (
              <a href={`/w/${encodeURIComponent(slug)}/album${q}`} className={btn} style={{ background: d.gallery ? 'transparent' : ink, color: d.gallery ? ink : bg, border: `1px solid ${ink}` }}>
                See everyone’s photos
              </a>
            )}
            {d.addPhotos && (
              <a href={`/w/${encodeURIComponent(slug)}/photos${q}`} className={btn} style={{ color: ink, border: `1px solid ${gold}` }}>
                Add your photos from the day
              </a>
            )}
            {!d.album && !d.gallery && <span className="text-[17px] italic opacity-80">The photos aren’t ready yet. We’ll share them here as soon as they are.</span>}
          </section>
        )}
      </div>
    </main>
  );
}

const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;

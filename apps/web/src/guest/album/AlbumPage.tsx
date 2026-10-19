import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';

/**
 * /w/:slug/album?g=<token>: everyone's photos from the events you were at, once the couple shares the
 * album. Filter by event, tap a photo to see it large, save the ones you love.
 */
interface Album {
  couple: string;
  events: { key: string; name: string }[];
  photos: { id: string; at: string; event: string | null; by: string; url: string }[];
}

export function AlbumPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [data, setData] = useState<Album | null>(null);
  const [err, setErr] = useState('');
  const [ev, setEv] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/p/${encodeURIComponent(slug)}/album?g=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const b = (await r.json()) as Album & { error?: { message: string } };
        if (!r.ok) throw new Error(b.error?.message ?? 'The album isn’t open yet.');
        setData(b);
      })
      .catch((e: Error) => setErr(e.message));
  }, [slug, token]);
  const shown = useMemo(() => (data?.photos ?? []).filter((p) => !ev || p.event === ev), [data, ev]);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : Math.min(shown.length - 1, i + 1)));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, shown.length]);

  if (err) return <GuestMessage message={err} />;
  if (!data) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const ink = '#33402f';
  const cur = open !== null ? shown[open] : undefined;

  return (
    <main className="min-h-screen" style={{ background: '#f6f0e2', color: ink, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      <div className="max-w-[1100px] mx-auto px-4 pt-10 pb-20 flex flex-col gap-5">
        <header className="text-center flex flex-col gap-2">
          <div className="text-[13px] tracking-[.3em] uppercase font-semibold opacity-80" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            {data.couple}
          </div>
          <h1 className="m-0 font-normal text-[52px] leading-[1.1]" style={{ fontFamily: "'Pinyon Script', cursive" }}>
            Our album
          </h1>
          <p className="m-0 text-[19px] italic">{data.photos.length} photos from everyone. Thank you for sharing the day with us.</p>
          <a href={`/w/${encodeURIComponent(slug)}?g=${encodeURIComponent(token)}`} className="text-[16px] underline" style={{ color: ink }}>
            ← Your invitation
          </a>
        </header>
        {data.events.length > 1 && (
          <div role="radiogroup" aria-label="Event" className="flex gap-2 justify-center flex-wrap">
            {[{ key: '', name: 'Everything' }, ...data.events].map((e) => (
              <button
                key={e.key || 'all'}
                type="button"
                role="radio"
                aria-checked={ev === e.key}
                onClick={() => setEv(e.key)}
                className="py-[6px] px-4 rounded-full border text-[17px] cursor-pointer"
                style={ev === e.key ? { background: ink, color: '#fbf8f2', borderColor: ink } : { background: 'transparent', color: ink, borderColor: 'rgba(0,0,0,.2)' }}
              >
                {e.name}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
          {shown.map((p, i) => (
            <button key={p.id} type="button" onClick={() => setOpen(i)} className="aspect-square p-0 border-0 rounded-[8px] overflow-hidden bg-[#e9e2cc] cursor-pointer" aria-label={p.by ? `Photo by ${p.by}` : 'Photo'}>
              <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        {!shown.length && <p className="m-0 text-center text-[19px] italic">No photos here yet.</p>}
      </div>
      {cur && (
        <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setOpen(null)}>
          <div className="flex justify-between items-center p-4 text-[#f3ecd6]" onClick={(e) => e.stopPropagation()}>
            <span className="text-[17px] italic">{cur.by ? `Photo by ${cur.by}` : ''}</span>
            <span className="flex gap-3 items-center">
              <a href={cur.url} download={`photo-${cur.id.slice(0, 8)}.jpg`} className="text-[16px] underline !text-[#f3ecd6]">
                Save
              </a>
              <button type="button" aria-label="Close" onClick={() => setOpen(null)} className="w-10 h-10 rounded-full border-0 bg-white/15 text-[#f3ecd6] text-[22px] cursor-pointer">
                ×
              </button>
            </span>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-2 pb-4">
            <img src={cur.url} alt={cur.by ? `Photo by ${cur.by}` : 'Photo'} className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
          <div className="flex justify-between px-4 pb-[max(16px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <button type="button" disabled={open === 0} onClick={() => setOpen((i) => (i === null ? i : i - 1))} className="py-2 px-4 rounded-full border-0 bg-white/15 text-[#f3ecd6] text-[16px] cursor-pointer disabled:opacity-30">
              ← Previous
            </button>
            <button type="button" disabled={open === shown.length - 1} onClick={() => setOpen((i) => (i === null ? i : i + 1))} className="py-2 px-4 rounded-full border-0 bg-white/15 text-[#f3ecd6] text-[16px] cursor-pointer disabled:opacity-30">
              Next →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

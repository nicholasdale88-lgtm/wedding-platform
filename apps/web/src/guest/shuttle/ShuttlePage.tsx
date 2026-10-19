import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { guestApi, type ShuttlePayload } from '../invitation/api';

/**
 * /w/:slug/shuttle?g=<token>: book seats on the shuttles for the events you're invited to (how many
 * of your party), change or cancel. Seats left are live; a full run says so.
 */
export function ShuttlePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [data, setData] = useState<ShuttlePayload | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await guestApi.shuttles(slug, token));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [slug, token]);
  useEffect(() => void load(), [load]);

  if (err && !data) return <GuestMessage message={err} />;
  if (!data) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const ink = '#33402f';
  const book = async (id: string, seats: number) => {
    setBusy(id);
    setNote('');
    try {
      setData(await guestApi.bookShuttle(slug, token, id, seats));
      setNote(seats ? `Booked: ${seats} ${seats === 1 ? 'seat' : 'seats'}. See you on board!` : 'Cancelled.');
    } catch (e) {
      setNote((e as Error).message);
      await load();
    } finally {
      setBusy('');
    }
  };

  return (
    <main className="min-h-screen" style={{ background: '#f6f0e2', color: ink, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      <div className="max-w-[600px] mx-auto px-5 pt-12 pb-24 flex flex-col gap-6">
        <header className="text-center flex flex-col gap-2">
          <h1 className="m-0 font-normal text-[50px] leading-[1.1]" style={{ fontFamily: "'Pinyon Script', cursive" }}>
            Shuttle
          </h1>
          <span aria-hidden className="mx-auto w-16 h-[2px] bg-[#b39563]" />
          <p className="m-0 text-[19px] italic">Book seats for your party. Taxis rarely come out this way, so we’d love you on board.</p>
          <a href={`/w/${encodeURIComponent(slug)}?g=${encodeURIComponent(token)}`} className="text-[16px] underline" style={{ color: ink }}>
            ← Your invitation
          </a>
        </header>
        {note && (
          <div role="status" className="text-center text-[18px] italic">
            {note}
          </div>
        )}
        {data.events.map((e) => (
          <section key={e.key} aria-label={e.name} className="flex flex-col gap-3">
            <h2 className="m-0 text-center font-normal text-[30px]">{e.name}</h2>
            {e.runs.map((r) => (
              <article key={r.id} className="flex flex-col gap-2 p-5 rounded-[18px] bg-white/80 border" style={{ borderColor: r.mine ? '#5d6b47' : 'rgba(0,0,0,.08)' }}>
                <div className="flex justify-between items-baseline gap-3 flex-wrap">
                  <span className="text-[26px] font-semibold">{r.time}</span>
                  <span className="text-[15px] opacity-75">{r.left ? `${r.left} ${r.left === 1 ? 'seat' : 'seats'} left` : r.mine ? 'Now full' : 'Full'}</span>
                </div>
                <div className="text-[20px]">
                  {r.from} → {r.to}
                </div>
                {r.note && <div className="text-[17px] italic opacity-80">{r.note}</div>}
                <div className="flex gap-2 items-center flex-wrap mt-1">
                  {Array.from({ length: Math.max(1, data.party) }, (_, i) => i + 1)
                    .filter((n) => n <= r.mine + r.left)
                    .map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={busy === r.id}
                        aria-pressed={r.mine === n}
                        onClick={() => void book(r.id, n)}
                        className="min-w-[44px] py-2 px-3 rounded-full border text-[17px] cursor-pointer disabled:opacity-50"
                        style={r.mine === n ? { background: ink, color: '#fbf8f2', borderColor: ink } : { background: 'transparent', color: ink, borderColor: 'rgba(0,0,0,.2)' }}
                      >
                        {n} {n === 1 ? 'seat' : 'seats'}
                      </button>
                    ))}
                  {r.mine > 0 && (
                    <button type="button" disabled={busy === r.id} onClick={() => void book(r.id, 0)} className="py-2 px-3 border-0 bg-transparent underline text-[16px] cursor-pointer" style={{ color: ink }}>
                      Cancel
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        ))}
        {!data.events.length && <p className="m-0 text-center text-[19px] italic">No shuttles for your events yet.</p>}
      </div>
    </main>
  );
}

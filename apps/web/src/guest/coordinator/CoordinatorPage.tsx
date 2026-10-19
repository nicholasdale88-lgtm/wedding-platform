import { clockMinutes } from '@wp/shared';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';

/**
 * /w/:slug/coordinator?k=<key>: the day-of coordinator's page. The whole run sheet with what's on now,
 * every supplier and wedding party member a tap from a call, who holds what, the speeches, the photo
 * list, and a log of issues to note and tick off as the day goes. Made for a phone in a pocket.
 */
interface Data {
  couple: string;
  name: string;
  sides: { p1: string; p2: string };
  event: { name: string; startsAt: string; venue: string; address: string } | null;
  note: string;
  items: { time: string; until: string; title: string; detail: string; place: string; who: string[] }[];
  vendors: { name: string; category: string; contact: string; phone: string; arrival: string; meals: number; notes: string }[];
  party: { name: string; role: string; phone: string }[];
  holds: { id: string; what: string; who: string }[];
  speeches: { who: string; minutes: number; mic: boolean }[];
  shots: { shot: string; who: string }[];
  log: { id: string; at: string; text: string; done: boolean }[];
}

const SECTIONS = [
  ['day', 'The day'],
  ['suppliers', 'Suppliers'],
  ['party', 'Party'],
  ['holds', 'Who holds what'],
  ['photos', 'Photos'],
  ['log', 'Log'],
] as const;
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;

export function CoordinatorPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const k = params.get('k') ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const loaded = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const load = () =>
    fetch(`/api/p/${encodeURIComponent(slug)}/coordinator?k=${encodeURIComponent(k)}`)
      .then(async (r) => {
        const b = (await r.json()) as Data & { error?: { message: string } };
        if (!r.ok) throw new Error(b.error?.message ?? 'This link isn’t working.');
        setD(b);
        loaded.current = true;
        setProblem('');
      })
      // Once the page is up, a dropped connection is a note, not the end of the page.
      .catch((e: Error) => {
        if (loaded.current) setProblem('Can’t reach the site just now: showing what you had.');
        else setErr(e.message);
      });
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      setNow(Date.now());
      void load(); // the couple may change things: fresh every minute
    }, 60_000);
    return () => clearInterval(t);
  }, [slug, k]); // eslint-disable-line
  if (err) return <GuestMessage message={err} />;
  if (!d) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;

  const log = async (body: { action: 'add' | 'done' | 'undo'; text?: string; id?: string }) => {
    try {
      const r = await fetch(`/api/p/${encodeURIComponent(slug)}/coordinator`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, ...body }) });
      const b = (await r.json()) as { log?: Data['log']; error?: { message: string } };
      if (!r.ok || !b.log) throw new Error(b.error?.message ?? 'That didn’t save.');
      setD((cur) => (cur ? { ...cur, log: b.log! } : cur));
      setProblem('');
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  // What's on now: the latest line that has started today.
  const today = d.event && new Date(d.event.startsAt).toDateString() === new Date(now).toDateString();
  const mins = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const current = today ? d.items.reduce((acc, it, i) => ((clockMinutes(it.time) ?? Infinity) <= mins ? i : acc), -1) : -1;
  const who = (w: string[]) => w.map((x) => (x === 'party' ? 'Everyone' : x === 'p1' ? `${d.sides.p1 || 'Bride'}’s side` : x === 'p2' ? `${d.sides.p2 || 'Groom'}’s side` : x)).join(', ');
  const ink = '#33402f';

  return (
    <main className="min-h-screen pb-24" style={{ background: '#f6f0e2', color: ink, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-10 flex flex-col gap-2 px-4 pt-4 pb-2" style={{ background: ink, color: '#f3ecd6' }}>
        <div className="flex justify-between items-baseline gap-3">
          <strong className="text-[18px]">{d.couple}</strong>
          <span className="text-[12px] opacity-80">Coordinator{d.name ? ` · ${d.name}` : ''}</span>
        </div>
        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto [scrollbar-width:none] -mx-1">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="flex-none py-[6px] px-3 rounded-full text-[13px] no-underline" style={{ background: 'rgba(243,236,214,.14)', color: '#f3ecd6' }}>
              {label}
              {id === 'log' && d.log.some((e) => !e.done) ? ` · ${d.log.filter((e) => !e.done).length}` : ''}
            </a>
          ))}
        </nav>
      </header>

      <div className="max-w-[720px] mx-auto px-4 flex flex-col gap-6 pt-4">
        {problem && (
          <p role="alert" className="m-0 p-3 rounded-[12px] text-[14px]" style={{ background: '#f4dcd2', color: '#7a4a37' }}>
            {problem}
          </p>
        )}
        {d.event && (
          <section className="flex flex-col gap-1">
            <h1 className="m-0 text-[24px] font-semibold">{d.event.name}</h1>
            <div className="text-[14px] opacity-80">
              {new Date(d.event.startsAt).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
              {d.event.venue ? ` · ${d.event.venue}` : ''}
            </div>
            {d.event.address && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(d.event.address)}`} className="text-[14px]" style={{ color: ink }}>
                {d.event.address}
              </a>
            )}
          </section>
        )}
        {d.note && <p className="m-0 p-3 rounded-[12px] bg-white text-[15px] whitespace-pre-wrap">{d.note}</p>}

        <section id="day" className="flex flex-col gap-2 scroll-mt-28">
          <h2 className="m-0 text-[18px] font-semibold">The day</h2>
          <ol className="list-none m-0 p-0 flex flex-col rounded-[12px] bg-white overflow-hidden">
            {d.items.map((it, i) => (
              <li key={i} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-3 px-3 border-t border-black/5 first:border-t-0" style={i === current ? { background: '#efe6cc' } : undefined}>
                <span className="text-[15px] font-semibold tabular-nums">
                  {it.time}
                  {i === current && <span className="block text-[10px] tracking-[.15em] uppercase text-[#a5533c]">Now</span>}
                </span>
                <span className="flex flex-col gap-[2px] min-w-0">
                  <span className="text-[15px] font-medium">{it.title}</span>
                  {it.place && <span className="text-[13px] opacity-75">{it.place}</span>}
                  {it.detail && <span className="text-[13px] whitespace-pre-wrap">{it.detail}</span>}
                  <span className="text-[12px] opacity-60">{who(it.who)}</span>
                </span>
              </li>
            ))}
            {!d.items.length && <li className="p-3 text-[14px] opacity-70">The couple hasn’t built the run sheet yet.</li>}
          </ol>
          {d.speeches.length > 0 && (
            <div className="flex flex-col gap-1 p-3 rounded-[12px] bg-white">
              <strong className="text-[14px]">Speeches</strong>
              {d.speeches.map((s, i) => (
                <span key={i} className="flex justify-between text-[14px]">
                  <span>
                    {i + 1}. {s.who}
                  </span>
                  <span className="opacity-70">
                    {s.minutes} min{s.mic ? ' · mic' : ''}
                  </span>
                </span>
              ))}
            </div>
          )}
        </section>

        <section id="suppliers" className="flex flex-col gap-2 scroll-mt-28">
          <h2 className="m-0 text-[18px] font-semibold">Suppliers</h2>
          {d.vendors
            .slice()
            .sort((a, b) => (clockMinutes(a.arrival) ?? 9999) - (clockMinutes(b.arrival) ?? 9999))
            .map((v) => (
              <div key={v.name} className="flex justify-between items-center gap-3 p-3 rounded-[12px] bg-white">
                <span className="min-w-0">
                  <span className="block font-medium">{v.name}</span>
                  <span className="block text-[13px] opacity-75">
                    {[v.category, v.arrival && `arrives ${v.arrival}`, v.contact, v.meals ? `${v.meals} meals` : ''].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {v.phone && (
                  <a href={tel(v.phone)} className="flex-none py-2 px-4 rounded-full text-[14px] no-underline" style={{ background: ink, color: '#f3ecd6' }}>
                    Call
                  </a>
                )}
              </div>
            ))}
          {!d.vendors.length && <p className="m-0 text-[14px] opacity-70">No booked suppliers yet.</p>}
        </section>

        <section id="party" className="flex flex-col gap-2 scroll-mt-28">
          <h2 className="m-0 text-[18px] font-semibold">Wedding party</h2>
          {d.party.map((p) => (
            <div key={`${p.name}-${p.role}`} className="flex justify-between items-center gap-3 py-2 px-3 rounded-[12px] bg-white">
              <span>
                <span className="font-medium">{p.name}</span> <span className="text-[13px] opacity-70">· {p.role}</span>
              </span>
              {p.phone && (
                <a href={tel(p.phone)} className="flex-none py-[6px] px-3 rounded-full border text-[13px] no-underline" style={{ borderColor: ink, color: ink }}>
                  Call
                </a>
              )}
            </div>
          ))}
        </section>

        <section id="holds" className="flex flex-col gap-2 scroll-mt-28">
          <h2 className="m-0 text-[18px] font-semibold">Who holds what</h2>
          <ul className="list-none m-0 p-0 flex flex-col rounded-[12px] bg-white">
            {d.holds.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 py-2 px-3 border-t border-black/5 first:border-t-0 text-[14px]">
                <span>{h.what}</span>
                <span className="font-medium">{h.who || '—'}</span>
              </li>
            ))}
            {!d.holds.length && <li className="p-3 text-[14px] opacity-70">Nothing listed.</li>}
          </ul>
        </section>

        <section id="photos" className="flex flex-col gap-2 scroll-mt-28">
          <h2 className="m-0 text-[18px] font-semibold">Photo list</h2>
          <ol className="m-0 pl-5 flex flex-col gap-1 text-[14px]">
            {d.shots.map((s, i) => (
              <li key={i}>
                {s.shot}
                {s.who && <span className="opacity-70"> · {s.who}</span>}
              </li>
            ))}
          </ol>
          {!d.shots.length && <p className="m-0 text-[14px] opacity-70">No photo list yet.</p>}
        </section>

        <section id="log" className="flex flex-col gap-2 scroll-mt-28">
          <h2 className="m-0 text-[18px] font-semibold">Log</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              void log({ action: 'add', text: note.trim() });
              setNote('');
            }}
          >
            <input aria-label="Note something" placeholder="e.g. Florist running 20 min late" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="flex-1 min-w-0 py-2 px-3 rounded-[10px] border border-black/15 bg-white text-[15px]" />
            <button type="submit" className="py-2 px-4 rounded-full border-0 text-[15px] cursor-pointer" style={{ background: ink, color: '#f3ecd6' }}>
              Add
            </button>
          </form>
          <ul className="list-none m-0 p-0 flex flex-col gap-1">
            {d.log.map((e) => (
              <li key={e.id} className="flex items-start gap-3 p-3 rounded-[12px] bg-white">
                <input type="checkbox" checked={e.done} aria-label={e.text} onChange={() => void log({ action: e.done ? 'undo' : 'done', id: e.id })} className="mt-[3px] w-5 h-5 accent-[#5d6b47]" />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[15px] ${e.done ? 'line-through opacity-60' : ''}`}>{e.text}</span>
                  <span className="block text-[12px] opacity-60">{new Date(e.at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

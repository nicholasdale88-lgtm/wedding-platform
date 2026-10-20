import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';

/**
 * /w/:slug/quote?k=<key>: a vendor's quote request from a couple. What they'd like priced, line by line:
 * the vendor prices each (or marks it not included), adds what's included, the deposit and how long the
 * price holds, and sends it. It lands in the couple's planner as this vendor's quote, side by side with
 * the others. They can change it until the couple decides.
 */
interface Line {
  id: string;
  label: string;
  detail: string;
}
interface Data {
  couple: string;
  event: { name: string; startsAt: string; venue: string } | null;
  timezone: string;
  guests: number;
  vendor: string;
  title: string;
  lines: Line[];
  due: string;
  closed: boolean;
  answer: { lines: { id: string; amount: number | null }[]; deposit: number; validUntil: string; includes: string; excludes: string; notes: string; amount: number; on: string } | null;
}
const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
const longDay = (iso: string, tz?: string) => {
  try {
    return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...(tz ? { timeZone: tz } : {}) }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
  } catch {
    return iso;
  }
};
const input = 'w-full py-[10px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px] text-[#33402f]';

export function QuotePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const k = params.get('k') ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  // Each line: a price as typed, or null for "not included".
  const [prices, setPrices] = useState<Record<string, string | null>>({});
  const [deposit, setDeposit] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [includes, setIncludes] = useState('');
  const [excludes, setExcludes] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    fetch(`/api/p/${encodeURIComponent(slug)}/rfq?k=${encodeURIComponent(k)}`)
      .then(async (r) => {
        const b = (await r.json()) as Data & { error?: { message: string } };
        if (!r.ok) throw new Error(b.error?.message ?? 'This quote link isn’t working.');
        setD(b);
        const a = b.answer;
        setPrices(Object.fromEntries(b.lines.map((l) => {
          const got = a?.lines.find((x) => x.id === l.id);
          return [l.id, got ? (got.amount === null ? null : String(got.amount)) : ''];
        })));
        if (a) {
          setDeposit(a.deposit ? String(a.deposit) : '');
          setValidUntil(a.validUntil);
          setIncludes(a.includes);
          setExcludes(a.excludes);
          setNotes(a.notes);
        }
      })
      .catch((e: Error) => setErr(e.message));
  }, [slug, k]);
  if (err) return <GuestMessage message={err} />;
  if (!d) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;

  const num = (s: string | null | undefined) => (s === null || s === undefined || s.trim() === '' ? null : Number(s.replace(/[$,\s]/g, '')));
  const total = d.lines.reduce((a, l) => a + (num(prices[l.id]) ?? 0), 0);
  const blank = d.lines.filter((l) => prices[l.id] !== null && num(prices[l.id]) === null);
  const bad = d.lines.filter((l) => {
    const n = num(prices[l.id]);
    return n !== null && (!Number.isFinite(n) || n < 0);
  });
  const send = async () => {
    if (bad.length) return setProblem(`Check the price for ${bad[0]!.label}.`);
    if (blank.length) return setProblem(`Add a price for ${blank[0]!.label}, or mark it not included.`);
    setBusy(true);
    setProblem('');
    try {
      const r = await fetch(`/api/p/${encodeURIComponent(slug)}/rfq`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          k,
          lines: d.lines.map((l) => ({ id: l.id, amount: prices[l.id] === null ? null : num(prices[l.id]) })),
          deposit: num(deposit) ?? 0,
          validUntil,
          includes: includes.trim(),
          excludes: excludes.trim(),
          notes: notes.trim(),
        }),
      });
      const b = (await r.json().catch(() => null)) as { error?: { message: string } } | null;
      if (!r.ok) throw new Error(b?.error?.message ?? 'That didn’t send. Please try again.');
      setSent(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f0e2] text-[#33402f] px-4 py-8 pb-24" style={{ fontFamily: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif" }}>
      <div className="max-w-[640px] mx-auto flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <span className="text-[12px] tracking-[.2em] uppercase font-semibold text-[#5b6a52]">Quote request for {d.vendor}</span>
          <h1 className="m-0 text-[32px] leading-[1.1]" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500 }}>
            {d.title}
          </h1>
          <p className="m-0 text-[15px] text-[#5b6a52]">
            From {d.couple}
            {d.event ? ` · ${longDay(d.event.startsAt, d.timezone)}${d.event.venue ? ` · ${d.event.venue}` : ''}` : ''}
            {d.guests ? ` · about ${d.guests} guests` : ''}
            {d.due ? ` · quotes by ${longDay(d.due)}` : ''}
          </p>
        </header>

        {sent ? (
          <section role="status" className="p-5 rounded-[16px] bg-white border border-[#d3c6a4] flex flex-col gap-2">
            <strong className="text-[18px]">Thank you, your quote is with {d.couple}.</strong>
            <span className="text-[15px] text-[#5b6a52]">Total {aud(total)}. You can change it from this link until they decide.</span>
            <button type="button" onClick={() => setSent(false)} className="self-start mt-1 py-2 px-4 rounded-full border border-[#33402f] bg-transparent text-[15px] cursor-pointer">
              Change my quote
            </button>
          </section>
        ) : d.closed ? (
          <section className="p-5 rounded-[16px] bg-white border border-[#d3c6a4] text-[15px]">The couple have decided. Thank you for quoting!</section>
        ) : (
          <>
            {d.answer && <p className="m-0 p-3 rounded-[12px] bg-[#e6ecd8] text-[14px]">You sent a quote on {longDay(d.answer.on)}. Change anything below and send again.</p>}
            <section aria-label="Prices" className="flex flex-col gap-3 p-4 rounded-[16px] bg-white border border-[#e2d7bc]">
              <h2 className="m-0 text-[18px] font-semibold">Your prices (AUD, including GST)</h2>
              {d.lines.map((l) => {
                const out = prices[l.id] === null;
                return (
                  <div key={l.id} className="flex flex-col gap-1 pb-3 border-b border-[#efe6d0] last:border-0 last:pb-0">
                    <label htmlFor={`p-${l.id}`} className="text-[15px] font-medium">
                      {l.label}
                    </label>
                    {l.detail && <span className="text-[13px] text-[#5b6a52]">{l.detail}</span>}
                    <div className="flex gap-2 items-center">
                      <span aria-hidden className="text-[16px]">$</span>
                      <input
                        id={`p-${l.id}`}
                        inputMode="decimal"
                        disabled={out}
                        value={out ? '' : (prices[l.id] ?? '')}
                        placeholder={out ? 'Not included' : '0'}
                        onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))}
                        className={`${input} max-w-[180px] disabled:bg-[#f3eee2]`}
                      />
                      <label className="flex items-center gap-2 text-[14px] cursor-pointer">
                        <input type="checkbox" checked={out} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.checked ? null : '' }))} className="w-[18px] h-[18px] accent-[#5d6b47]" />
                        Not included
                      </label>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-[15px] font-semibold">Total</span>
                <span className="text-[24px]" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                  {aud(total)}
                </span>
              </div>
            </section>

            <section aria-label="Terms" className="flex flex-col gap-3 p-4 rounded-[16px] bg-white border border-[#e2d7bc]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-[14px]">
                  Deposit to book
                  <input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="$0" className={input} />
                </label>
                <label className="flex flex-col gap-1 text-[14px]">
                  Price holds until
                  <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={input} />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[14px]">
                What’s included
                <textarea rows={3} maxLength={1500} value={includes} onChange={(e) => setIncludes(e.target.value)} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-[14px]">
                Not included, or extra
                <textarea rows={2} maxLength={1500} value={excludes} onChange={(e) => setExcludes(e.target.value)} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-[14px]">
                Anything else for {d.couple}
                <textarea rows={3} maxLength={1500} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
              </label>
              <span className="text-[13px] text-[#5b6a52]">Have your own quote as a PDF? Email it to the couple as well: it’s filed with this one.</span>
            </section>

            {problem && (
              <p role="alert" className="m-0 text-[15px] text-[#7a4a37]">
                {problem}
              </p>
            )}
            <button type="button" disabled={busy} onClick={() => void send()} className="py-4 rounded-full border-0 text-[18px] cursor-pointer bg-[#33402f] text-[#fbf8f2] disabled:opacity-60">
              {busy ? 'Sending…' : d.answer ? `Send my updated quote (${aud(total)})` : `Send my quote (${aud(total)})`}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

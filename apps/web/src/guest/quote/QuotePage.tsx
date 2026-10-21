import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { base64Of, fileProblem, shrinkFile } from '../../lib/shrinkFile';
import { GuestMessage } from '../GuestMessage';

/**
 * /w/:slug/quote?k=<key>: a vendor's quote request from a couple. Two ways to answer, whichever suits:
 * price each item (or mark it not included), or give one total for everything and attach their own quote
 * (a PDF or a photo). Then the deposit and how long the price holds, and send. It lands in the couple's
 * planner as this vendor's quote, side by side with the others, and the couple get an email. They can
 * change it until the couple decide, or say they can't quote (the couple stop waiting on them).
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
  declined: { on: string; why: string } | null;
  answer: {
    lines: { id: string; amount: number | null }[];
    package: boolean;
    deposit: number;
    validUntil: string;
    includes: string;
    excludes: string;
    notes: string;
    amount: number;
    fileId: string;
    fileName: string;
    on: string;
  } | null;
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
const card = 'flex flex-col gap-3 p-4 rounded-[16px] bg-white border border-[#e2d7bc]';
const REASONS = ['Booked that day', 'Not something we do', 'Too far away'];

export function QuotePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const k = params.get('k') ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [pkg, setPkg] = useState(false);
  // Each line: a price as typed, or null for "not included".
  const [prices, setPrices] = useState<Record<string, string | null>>({});
  const [total, setTotal] = useState('');
  const [deposit, setDeposit] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [includes, setIncludes] = useState('');
  const [excludes, setExcludes] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState({ id: '', name: '' });
  const [fileBusy, setFileBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<'quote' | 'declined' | null>(null);
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState('');
  const [problem, setProblem] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const api = `/api/p/${encodeURIComponent(slug)}/rfq`;

  useEffect(() => {
    fetch(`${api}?k=${encodeURIComponent(k)}`)
      .then(async (r) => {
        const b = (await r.json()) as Data & { error?: { message: string } };
        if (!r.ok) throw new Error(b.error?.message ?? 'This quote link isn’t working.');
        setD(b);
        const a = b.answer;
        setPrices(
          Object.fromEntries(
            b.lines.map((l) => {
              const got = a?.lines.find((x) => x.id === l.id);
              return [l.id, got ? (got.amount === null ? null : String(got.amount)) : ''];
            }),
          ),
        );
        if (a) {
          setPkg(a.package);
          setTotal(a.package && a.amount ? String(a.amount) : '');
          setDeposit(a.deposit ? String(a.deposit) : '');
          setValidUntil(a.validUntil);
          setIncludes(a.includes);
          setExcludes(a.excludes);
          setNotes(a.notes);
          setFile({ id: a.fileId, name: a.fileName });
        }
      })
      .catch((e: Error) => setErr(e.message));
  }, [api, k]);
  if (err) return <GuestMessage message={err} />;
  if (!d) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;

  const num = (s: string | null | undefined) => (s === null || s === undefined || s.trim() === '' ? null : Number(s.replace(/[$,\s]/g, '')));
  const lineTotal = d.lines.reduce((a, l) => a + (num(prices[l.id]) ?? 0), 0);
  const amount = pkg ? (num(total) ?? 0) : lineTotal;
  const blank = d.lines.filter((l) => prices[l.id] !== null && num(prices[l.id]) === null);
  const bad = d.lines.filter((l) => {
    const n = num(prices[l.id]);
    return n !== null && (!Number.isFinite(n) || n < 0);
  });

  const post = async (path: string, body: unknown) => {
    const r = await fetch(`${api}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const b = (await r.json().catch(() => null)) as ({ error?: { message: string } } & Record<string, unknown>) | null;
    if (!r.ok) throw new Error(b?.error?.message ?? 'That didn’t send. Please try again.');
    return b;
  };
  const attach = async (picked: File | undefined) => {
    if (!picked) return;
    setProblem('');
    setFileBusy(true);
    try {
      const f = await shrinkFile(picked);
      const no = fileProblem(f);
      if (no) throw new Error(no);
      const r = (await post('/file', { k, name: f.name.slice(0, 120), type: f.type, data: await base64Of(f) })) as { id: string; name: string };
      setFile({ id: r.id, name: f.name });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setFileBusy(false);
      if (picker.current) picker.current.value = '';
    }
  };
  const send = async () => {
    setProblem('');
    if (pkg) {
      const n = num(total);
      if (n === null || !Number.isFinite(n) || n <= 0) return setProblem('Add your total price.');
    } else {
      if (bad.length) return setProblem(`Check the price for ${bad[0]!.label}.`);
      if (blank.length) return setProblem(`Add a price for ${blank[0]!.label}, or tick “Not included”. Or give one total instead.`);
    }
    setBusy(true);
    try {
      await post('', {
        k,
        package: pkg,
        total: pkg ? (num(total) ?? 0) : 0,
        lines: pkg ? [] : d.lines.map((l) => ({ id: l.id, amount: prices[l.id] === null ? null : num(prices[l.id]) })),
        deposit: num(deposit) ?? 0,
        validUntil,
        includes: includes.trim(),
        excludes: excludes.trim(),
        notes: notes.trim(),
        fileId: file.id,
      });
      setSent('quote');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    setBusy(true);
    setProblem('');
    try {
      await post('/decline', { k, why: why.trim() });
      setSent('declined');
      setDeclining(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const facts = [d.event ? longDay(d.event.startsAt, d.timezone) : '', d.event?.venue ?? '', d.guests ? `about ${d.guests} guests` : ''].filter(Boolean);
  const answering = !sent && !d.closed && (!d.declined || declining === false);

  return (
    <main className="min-h-screen bg-[#f6f0e2] text-[#33402f] px-4 pt-8 pb-32" style={{ fontFamily: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif" }}>
      <div className="max-w-[640px] mx-auto flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <span className="text-[12px] tracking-[.2em] uppercase font-semibold text-[#5b6a52]">Quote request for {d.vendor}</span>
          <h1 className="m-0 text-[34px] leading-[1.1]" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500 }}>
            {d.title}
          </h1>
          <p className="m-0 text-[16px]">From {d.couple}</p>
          {facts.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
              {facts.map((f) => (
                <li key={f} className="py-1 px-3 rounded-full bg-white border border-[#e2d7bc] text-[13px]">
                  {f}
                </li>
              ))}
            </ul>
          )}
          {d.due && !d.closed && <p className="m-0 text-[14px] text-[#5b6a52]">They’d love your quote by {longDay(d.due)}.</p>}
        </header>

        {sent === 'quote' ? (
          <section role="status" className={card}>
            <strong className="text-[20px]">Thank you: your quote is with {d.couple}.</strong>
            <span className="text-[15px] text-[#5b6a52]">
              {aud(amount)}
              {pkg ? ' for everything' : ''}
              {file.id ? ', with your quote attached' : ''}. They’ve been told. You can change it from this same link until they decide.
            </span>
            <button type="button" onClick={() => setSent(null)} className="self-start mt-1 py-2 px-4 rounded-full border border-[#33402f] bg-transparent text-[15px] cursor-pointer text-[#33402f]">
              Change my quote
            </button>
          </section>
        ) : sent === 'declined' || (d.declined && !declining && !d.closed && !d.answer) ? (
          <section role="status" className={card}>
            <strong className="text-[20px]">Thanks for letting {d.couple} know.</strong>
            <span className="text-[15px] text-[#5b6a52]">They won’t wait on you for this one.</span>
            <button
              type="button"
              onClick={() => {
                setSent(null);
                setD({ ...d, declined: null });
              }}
              className="self-start mt-1 py-2 px-4 rounded-full border border-[#33402f] bg-transparent text-[15px] cursor-pointer text-[#33402f]"
            >
              I can quote after all
            </button>
          </section>
        ) : d.closed ? (
          <section className={`${card} text-[15px]`}>
            The couple have decided. Thank you for quoting!
            {d.answer && <span className="text-[#5b6a52]">You quoted {aud(d.answer.amount)}.</span>}
          </section>
        ) : (
          answering && (
            <>
              {d.answer && <p className="m-0 p-3 rounded-[12px] bg-[#e6ecd8] text-[14px]">You sent a quote on {longDay(d.answer.on)}. Change anything below and send again.</p>}

              <section aria-label="How would you like to quote?" className="flex flex-col gap-2">
                <h2 className="m-0 text-[18px] font-semibold">How would you like to quote?</h2>
                <div role="radiogroup" className="grid grid-cols-2 gap-2">
                  {[
                    [false, 'Price each item', `${d.lines.length} ${d.lines.length === 1 ? 'item' : 'items'}: a price for each, or “not included”`],
                    [true, 'One total', 'A price for everything, with your own quote attached'],
                  ].map(([on, t, sub]) => (
                    <button
                      key={String(on)}
                      type="button"
                      role="radio"
                      aria-checked={pkg === on}
                      onClick={() => setPkg(on as boolean)}
                      className={`flex flex-col gap-1 p-3 rounded-[14px] border-2 text-left cursor-pointer ${pkg === on ? 'border-[#33402f] bg-white' : 'border-[#e2d7bc] bg-[#fbf8f2]'}`}
                    >
                      <strong className="text-[16px] text-[#33402f]">{t as string}</strong>
                      <span className="text-[13px] text-[#5b6a52]">{sub as string}</span>
                    </button>
                  ))}
                </div>
              </section>

              {pkg ? (
                <section aria-label="Your total" className={card}>
                  <h2 className="m-0 text-[18px] font-semibold">Your total (AUD, including GST)</h2>
                  <span className="text-[13px] text-[#5b6a52]">For everything they asked about:</span>
                  <ul className="m-0 pl-5 text-[14px] text-[#5b6a52]">
                    {d.lines.map((l) => (
                      <li key={l.id}>
                        {l.label}
                        {l.detail ? ` (${l.detail})` : ''}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 items-center">
                    <span aria-hidden className="text-[20px]">$</span>
                    <input inputMode="decimal" aria-label="Your total" value={total} placeholder="0" onChange={(e) => setTotal(e.target.value)} className={`${input} max-w-[220px] text-[20px]`} />
                  </div>
                  <span className="text-[13px] text-[#5b6a52]">Anything not included? Say so under “Not included, or extra” below.</span>
                </section>
              ) : (
                <section aria-label="Prices" className={card}>
                  <h2 className="m-0 text-[18px] font-semibold">Your prices (AUD, including GST)</h2>
                  {d.lines.map((l) => {
                    const out = prices[l.id] === null;
                    return (
                      <div key={l.id} className="flex flex-col gap-1 pb-3 border-b border-[#efe6d0] last:border-0 last:pb-0">
                        <label htmlFor={`p-${l.id}`} className="text-[15px] font-medium">
                          {l.label}
                        </label>
                        {l.detail && <span className="text-[13px] text-[#5b6a52]">{l.detail}</span>}
                        <div className="flex gap-3 items-center flex-wrap">
                          <span className="flex gap-2 items-center">
                            <span aria-hidden className="text-[16px]">$</span>
                            <input
                              id={`p-${l.id}`}
                              inputMode="decimal"
                              disabled={out}
                              value={out ? '' : (prices[l.id] ?? '')}
                              placeholder={out ? 'Not included' : '0'}
                              onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))}
                              className={`${input} max-w-[160px] disabled:bg-[#f3eee2]`}
                            />
                          </span>
                          <label className="flex items-center gap-2 text-[14px] cursor-pointer min-h-[40px]">
                            <input type="checkbox" checked={out} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.checked ? null : '' }))} className="w-[20px] h-[20px] accent-[#5d6b47]" />
                            Not included
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              <section aria-label="Your own quote" className={card}>
                <h2 className="m-0 text-[18px] font-semibold">Your own quote {pkg ? '' : <span className="font-normal text-[14px] text-[#5b6a52]">(optional)</span>}</h2>
                <button
                  type="button"
                  disabled={fileBusy}
                  onClick={() => picker.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void attach(e.dataTransfer.files[0]);
                  }}
                  className={`flex items-center gap-3 p-4 rounded-[14px] border-2 border-dashed text-left cursor-pointer text-[15px] text-[#33402f] ${file.id ? 'border-[#a9b98d] bg-[#f3f6ea]' : 'border-[#c6b794] bg-[#fbf8f2]'}`}
                >
                  <span aria-hidden className="text-[24px] leading-none">{file.id ? '📎' : '⤓'}</span>
                  <span className="flex-1 min-w-0">
                    {fileBusy ? (
                      <span role="status" className="italic text-[#5b6a52]">Attaching…</span>
                    ) : file.id ? (
                      <>
                        <strong className="block truncate">{file.name}</strong>
                        <span className="text-[13px] text-[#5b6a52]">Attached. Tap to choose another.</span>
                      </>
                    ) : (
                      <>
                        <strong className="block">Attach your quote</strong>
                        <span className="text-[13px] text-[#5b6a52]">A PDF, or a photo of it. Up to 1.5 MB (photos are made smaller for you).</span>
                      </>
                    )}
                  </span>
                </button>
                <input ref={picker} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={(e) => void attach(e.target.files?.[0])} />
              </section>

              <section aria-label="Terms" className={card}>
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
              </section>

              <section aria-label="Can't quote" className="flex flex-col gap-2 px-1">
                {declining ? (
                  <div className={card}>
                    <strong className="text-[16px]">Can’t quote this one?</strong>
                    <div className="flex gap-2 flex-wrap">
                      {REASONS.map((r) => (
                        <button key={r} type="button" aria-pressed={why === r} onClick={() => setWhy(r)} className={`py-2 px-3 rounded-full border text-[14px] cursor-pointer ${why === r ? 'bg-[#33402f] border-[#33402f] text-[#fbf8f2]' : 'bg-white border-[#c6b794] text-[#33402f]'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <input value={REASONS.includes(why) ? '' : why} maxLength={200} placeholder="Or say why (optional)" aria-label="Why you can't quote" onChange={(e) => setWhy(e.target.value)} className={input} />
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => void decline()} className="py-2 px-4 rounded-full border-0 bg-[#7a4a37] text-[#fbf8f2] text-[15px] cursor-pointer disabled:opacity-60">
                        Let them know
                      </button>
                      <button type="button" onClick={() => setDeclining(false)} className="py-2 px-4 rounded-full border border-[#c6b794] bg-transparent text-[15px] cursor-pointer text-[#33402f]">
                        Back
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDeclining(true)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[14px] text-[#5b6a52]">
                    Can’t quote this one? Let them know
                  </button>
                )}
              </section>

              {problem && (
                <p role="alert" className="m-0 text-[15px] text-[#7a4a37]">
                  {problem}
                </p>
              )}

              <div className="fixed left-0 right-0 bottom-0 z-[5] bg-[#f6f0e2]/95 border-t border-[#e2d7bc] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
                <div className="max-w-[640px] mx-auto flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] text-[#5b6a52]">{pkg ? 'Your total' : 'Total'}</span>
                    <span className="text-[24px] leading-none" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                      {aud(amount)}
                    </span>
                  </span>
                  <button type="button" disabled={busy || fileBusy} onClick={() => void send()} className="py-3 px-6 rounded-full border-0 text-[17px] cursor-pointer bg-[#33402f] text-[#fbf8f2] disabled:opacity-60">
                    {busy ? 'Sending…' : d.answer ? 'Send my update' : 'Send my quote'}
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </main>
  );
}

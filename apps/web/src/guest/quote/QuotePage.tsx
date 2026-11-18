import { linkHost, safeLink } from '@wp/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { base64Of, fileProblem, samplePhoto, shrinkFile } from '../../lib/shrinkFile';
import { GuestMessage } from '../GuestMessage';
import { SpinView } from './SpinView';

/**
 * /w/:slug/quote?k=<key>: a vendor's quote request from a couple. Two ways to answer, whichever suits:
 * price each item (or mark it not included), or give one total for everything and attach their own quote
 * (a PDF or a photo). Then the deposit and how long the price holds, and send. It lands in the couple's
 * planner as this vendor's quote, side by side with the others, and the couple get an email. They can
 * change it until the couple decide, or say they can't quote (the couple stop waiting on them).
 *
 * Optional, to stand out: virtual samples (photos, a spin view, short videos, what's in the sample box), video
 * tasting times the couple can book, and their own payment or booking page. After sending it isn't a dead end:
 * they can save the wedding to their free vendor dashboard, where all their quotes live.
 */
type Video = { url: string; label: string };
type Slot = { id: string; at: string; mins: number; link: string; bookedOn: string };
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
    payLink: string;
    samples: { photos: string[]; spin: string[]; videos: Video[]; box: string };
    tastings: Slot[];
  } | null;
  /** Signed in to a vendor account on this browser: whether the wedding is on their dashboard. */
  account: { name: string; saved: boolean } | null;
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
const pill = 'self-start min-h-[44px] py-2 px-4 rounded-full border border-[#c6b794] bg-white text-[15px] cursor-pointer text-[#33402f] disabled:opacity-60';

/**
 * After sending: keep the wedding. Signed in to a vendor account: save it to the dashboard (their Quotes area);
 * otherwise, a free account (vendors never pay) or sign in.
 */
function Dashboard({ account, couple, onSave }: { account: Data['account']; couple: string; onSave: () => void }) {
  return (
    <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-[#efe6d0]">
      {account?.saved ? (
        <>
          <strong className="text-[16px]">{couple} are on your dashboard.</strong>
          <Link to="/vendors/me?tab=quotes" className="self-start min-h-[44px] inline-flex items-center py-2 px-4 rounded-full bg-[#33402f] text-[#fbf8f2] no-underline text-[15px]">
            See all your quotes
          </Link>
        </>
      ) : account ? (
        <>
          <strong className="text-[16px]">Keep this wedding with your quotes</strong>
          <span className="text-[14px] text-[#5b6a52]">Save {couple} to {account.name}’s dashboard: every quote, tasting and booking in one place.</span>
          <button type="button" onClick={onSave} className="self-start min-h-[44px] py-2 px-4 rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[15px] cursor-pointer">
            Save to my dashboard
          </button>
        </>
      ) : (
        <>
          <strong className="text-[16px]">All your quotes in one place</strong>
          <span className="text-[14px] text-[#5b6a52]">A free vendor account keeps every couple’s quote, tasting and booking together. Vendors never pay. Once you’re signed in, open this link again and save {couple} to it.</span>
          <span className="flex gap-2 flex-wrap">
            <Link to="/vendors/join" className="min-h-[44px] inline-flex items-center py-2 px-4 rounded-full bg-[#33402f] text-[#fbf8f2] no-underline text-[15px]">
              Get a free account
            </Link>
            <Link to="/vendors/me" className="min-h-[44px] inline-flex items-center py-2 px-4 rounded-full border border-[#c6b794] text-[#33402f] no-underline text-[15px]">
              Sign in
            </Link>
          </span>
        </>
      )}
    </div>
  );
}

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
  const [payLink, setPayLink] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [spin, setSpin] = useState<string[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [box, setBox] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [adding, setAdding] = useState<'' | 'photos' | 'spin'>('');
  const picker = useRef<HTMLInputElement>(null);
  const photoPicker = useRef<HTMLInputElement>(null);
  const spinPicker = useRef<HTMLInputElement>(null);
  const api = `/api/p/${encodeURIComponent(slug)}/rfq`;
  const img = (id: string) => `${api}/media/${encodeURIComponent(id)}`;

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
          setPayLink(a.payLink ?? '');
          setPhotos(a.samples?.photos ?? []);
          setSpin(a.samples?.spin ?? []);
          setVideos(a.samples?.videos ?? []);
          setBox(a.samples?.box ?? '');
          setSlots(a.tastings ?? []);
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
  /** Sample photos (or the frames of a spin view, in the order taken): each made small, then kept with this link. */
  const addPhotos = async (files: FileList | null, into: 'photos' | 'spin') => {
    if (!files?.length) return;
    const room = into === 'photos' ? 12 - photos.length : 24 - spin.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (!list.length) return setProblem(into === 'photos' ? 'That’s 12 photos: remove one to add another.' : 'A spin view takes up to 24 photos.');
    setProblem('');
    setAdding(into);
    try {
      for (const f of list) {
        const small = await samplePhoto(f, into === 'spin' ? 1000 : 1400);
        const r = (await post('/media', { k, type: small.type, data: await base64Of(small) })) as { id: string };
        if (into === 'photos') setPhotos((p) => [...p, r.id]);
        else setSpin((p) => [...p, r.id]);
      }
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setAdding('');
      if (photoPicker.current) photoPicker.current.value = '';
      if (spinPicker.current) spinPicker.current.value = '';
    }
  };
  const saveToDashboard = async () => {
    setProblem('');
    try {
      await post('/save', { k });
      setD({ ...d, account: d.account ? { ...d.account, saved: true } : null });
    } catch (e) {
      setProblem((e as Error).message);
    }
  };

  const send = async () => {
    setProblem('');
    if (payLink.trim() && !safeLink(payLink)) return setProblem('Your payment or booking link doesn’t look like a web address.');
    const badVideo = videos.find((v) => v.url.trim() && !safeLink(v.url));
    if (badVideo) return setProblem('One of your video links doesn’t look like a web address.');
    const badSlot = slots.find((s) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.at));
    if (badSlot) return setProblem('Pick a day and time for each tasting, or remove it.');
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
        payLink: payLink.trim(),
        samples: { photos, spin, videos: videos.filter((v) => v.url.trim()).map((v) => ({ url: v.url.trim(), label: v.label.trim() })), box: box.trim() },
        tastings: slots.map((s) => ({ id: s.id, at: s.at, mins: s.mins, link: s.link.trim() })),
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
            <Dashboard account={d.account} couple={d.couple} onSave={() => void saveToDashboard()} />
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

              <section aria-label="Samples" className={card}>
                <h2 className="m-0 text-[18px] font-semibold">
                  Show your work <span className="font-normal text-[14px] text-[#5b6a52]">(optional)</span>
                </h2>
                <span className="text-[13px] text-[#5b6a52]">Couples can’t taste or touch from a screen: photos, a spin view and short videos help them choose you.</span>
                <div className="flex flex-col gap-2">
                  <strong className="text-[15px]">Photos</strong>
                  {photos.length > 0 && (
                    <ul className="m-0 p-0 list-none grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {photos.map((id) => (
                        <li key={id} className="relative aspect-square rounded-[10px] overflow-hidden bg-[#efe6d0]">
                          <img src={img(id)} alt="Your sample" loading="lazy" className="w-full h-full object-cover" />
                          <button type="button" aria-label="Remove this photo" onClick={() => setPhotos((p) => p.filter((x) => x !== id))} className="absolute top-1 right-1 w-[32px] h-[32px] rounded-full border-0 bg-white/90 text-[16px] cursor-pointer text-[#33402f]">
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" disabled={!!adding || photos.length >= 12} onClick={() => photoPicker.current?.click()} className={pill}>
                    {adding === 'photos' ? 'Adding…' : photos.length ? 'Add more photos' : 'Add photos'}
                  </button>
                  <input ref={photoPicker} type="file" hidden multiple accept="image/*" onChange={(e) => void addPhotos(e.target.files, 'photos')} />
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-[#efe6d0]">
                  <strong className="text-[15px]">Spin view</strong>
                  <span className="text-[13px] text-[#5b6a52]">Walk around the piece (a cake, a bouquet, a table setting) taking 8 to 24 photos from the same height, then choose them all, in order. Couples turn it with a finger.</span>
                  {spin.length > 1 && <SpinView frames={spin.map(img)} label="Your spin view" />}
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" disabled={!!adding || spin.length >= 24} onClick={() => spinPicker.current?.click()} className={pill}>
                      {adding === 'spin' ? 'Adding…' : spin.length ? `Add more (${spin.length} so far)` : 'Choose the photos'}
                    </button>
                    {spin.length > 0 && (
                      <button type="button" onClick={() => setSpin([])} className={pill}>
                        Start again
                      </button>
                    )}
                  </div>
                  <input ref={spinPicker} type="file" hidden multiple accept="image/*" onChange={(e) => void addPhotos(e.target.files, 'spin')} />
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-[#efe6d0]">
                  <strong className="text-[15px]">Short videos</strong>
                  <span className="text-[13px] text-[#5b6a52]">A link to a short video on your site or a video site.</span>
                  {videos.map((v, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <input value={v.url} placeholder="https://" aria-label={`Video ${i + 1} link`} inputMode="url" onChange={(e) => setVideos((x) => x.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)))} className={input} />
                      <button type="button" aria-label={`Remove video ${i + 1}`} onClick={() => setVideos((x) => x.filter((_, j) => j !== i))} className={pill}>
                        Remove
                      </button>
                      <input value={v.label} maxLength={80} placeholder="What it shows (optional)" aria-label={`Video ${i + 1} title`} onChange={(e) => setVideos((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className={`${input} col-span-2`} />
                    </div>
                  ))}
                  {videos.length < 6 && (
                    <button type="button" onClick={() => setVideos((x) => [...x, { url: '', label: '' }])} className={pill}>
                      Add a video link
                    </button>
                  )}
                </div>
                <label className="flex flex-col gap-1 text-[15px] pt-2 border-t border-[#efe6d0]">
                  <strong>Sample box</strong>
                  <span className="text-[13px] text-[#5b6a52]">What you can post them to try (and how to ask for it).</span>
                  <textarea rows={2} maxLength={1000} value={box} onChange={(e) => setBox(e.target.value)} placeholder="e.g. Four cake flavours and two fillings, posted free. Reply here with your address." className={input} />
                </label>
              </section>

              <section aria-label="Video tastings" className={card}>
                <h2 className="m-0 text-[18px] font-semibold">
                  Video tastings or a chat <span className="font-normal text-[14px] text-[#5b6a52]">(optional)</span>
                </h2>
                <span className="text-[13px] text-[#5b6a52]">Offer a few times; {d.couple} book one in a tap. Add your video call link so it’s ready on the day.</span>
                {slots.map((s, i) => (
                  <div key={s.id || i} className="flex flex-col gap-2 pb-3 border-b border-[#efe6d0] last:border-0 last:pb-0">
                    {s.bookedOn && <span className="text-[14px] font-semibold text-[#3d4a2f]">Booked by {d.couple}</span>}
                    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                      <input type="datetime-local" aria-label={`Tasting ${i + 1} time`} value={s.at} onChange={(e) => setSlots((x) => x.map((y, j) => (j === i ? { ...y, at: e.target.value.slice(0, 16) } : y)))} className={input} />
                      <select aria-label={`Tasting ${i + 1} length`} value={s.mins} onChange={(e) => setSlots((x) => x.map((y, j) => (j === i ? { ...y, mins: Number(e.target.value) } : y)))} className={input}>
                        {[15, 20, 30, 45, 60, 90].map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <input value={s.link} inputMode="url" placeholder="Video call link (optional)" aria-label={`Tasting ${i + 1} call link`} onChange={(e) => setSlots((x) => x.map((y, j) => (j === i ? { ...y, link: e.target.value } : y)))} className={input} />
                      <button type="button" aria-label={`Remove tasting ${i + 1}`} onClick={() => setSlots((x) => x.filter((_, j) => j !== i))} className={pill}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {slots.length < 12 && (
                  <button type="button" onClick={() => setSlots((x) => [...x, { id: '', at: '', mins: 30, link: x[x.length - 1]?.link ?? '', bookedOn: '' }])} className={pill}>
                    Add a time
                  </button>
                )}
              </section>

              <section aria-label="Terms" className={card}>
                <label className="flex flex-col gap-1 text-[14px]">
                  Your payment or booking page <span className="text-[13px] text-[#5b6a52]">(optional) {d.couple} get a “Pay or book with {d.vendor}” button that opens it. The Yes List never handles the money.</span>
                  <input value={payLink} inputMode="url" placeholder="https://" onChange={(e) => setPayLink(e.target.value)} className={input} />
                  {safeLink(payLink) && <span className="text-[13px] text-[#5b6a52]">Opens {linkHost(safeLink(payLink))}</span>}
                </label>
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

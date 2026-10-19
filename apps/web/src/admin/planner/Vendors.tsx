import { commitmentOf, dateIn, VENDOR_SEARCH, VENDOR_STATUS, type Quote, type Vendor, type Vendors as VendorsDoc } from '@wp/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, plannerApi, type VendorHit } from '../../lib/api';
import { MoneyInput } from './MoneyInput';
import { useAdmin } from '../Shell';
import { useDocSave } from './useDocSave';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Wedding planner → Vendors: everyone you're talking to or have booked. File each quote (a PDF or photo;
 * the assistant can read the numbers out of it), accept one, and compare vendors side by side with the
 * assistant's view. "Find vendors near the venue" searches OpenStreetMap within a radius you choose.
 */

const STATUS_LABEL: Record<Vendor['status'], string> = { idea: 'Idea', contacted: 'Contacted', quoted: 'Quoted', booked: 'Booked' };
const STATUS_COLOUR: Record<Vendor['status'], string> = { idea: '#e9e2cc', contacted: '#f1e7c9', quoted: '#dde7f3', booked: '#dfe5cc' };
const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
const shortDate = (d: string) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const newId = () => crypto.randomUUID().slice(0, 12);
const newVendor = (over: Partial<Vendor>): Vendor => ({
  id: newId(),
  name: '',
  category: '',
  status: 'idea',
  contact: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  km: null,
  quote: 0,
  deposit: 0,
  depositPaid: false,
  balanceDue: '',
  arrival: '',
  notes: '',
  quotes: [],
  accepted: '',
  contractSigned: '',
  cancellation: '',
  depositRefundable: false,
  contractFileId: '',
  contractFileName: '',
  meals: 0,
  ...over,
});
const BLANK_QUOTE: Quote = { id: '', amount: 0, deposit: 0, date: '', validUntil: '', includes: '', excludes: '', notes: '', fileId: '', fileName: '', extract: '' };
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : u ? `https://${u}` : '');
/** The quote that counts for comparing: the accepted one, else the cheapest. */
const bestQuote = (v: Vendor) => v.quotes.find((q) => q.id === v.accepted) ?? [...v.quotes].sort((a, b) => (a.amount || Infinity) - (b.amount || Infinity))[0];

export function Vendors() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [doc, setDoc] = useState<{ data: VendorsDoc; version: number } | null>(null);
  const saveDoc = useDocSave<VendorsDoc>(wid, 'vendors', '', doc?.version);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDoc(await plannerApi.doc<VendorsDoc>(wid, 'vendors'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading your vendors…</div>;
  const list = doc.data.list;

  /** Each change is saved straight away (the list is small and changes are deliberate). */
  const save = async (next: Vendor[], done?: string) => {
    const before = doc;
    setDoc({ ...doc, data: { list: next } });
    try {
      const r = await saveDoc({ list: next });
      setDoc((d) => (d ? { ...d, version: r.version } : r)); // keep what's on screen: a later change may be on its way
      if (done) toast(done);
    } catch (e) {
      setDoc(before);
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded. Make your change again.' : (e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    }
  };
  const patch = (id: string, p: Partial<Vendor>, done?: string) => void save(list.map((x) => (x.id === id ? { ...x, ...p } : x)), done);
  const booked = list.filter((v) => v.status === 'booked');
  const committed = booked.reduce((a, v) => a + commitmentOf(v).amount, 0);
  const paid = booked.reduce((a, v) => a + (v.depositPaid ? commitmentOf(v).deposit : 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Vendor summary" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          ['Vendors', String(list.length)],
          ['Booked', String(booked.length)],
          ['Committed', aud(committed)],
          ['Still to pay', aud(committed - paid)],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <span className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">{k}</span>
            <span className="font-display text-[28px] leading-none">{v}</span>
          </div>
        ))}
      </section>

      <Compare list={list} />

      <Finder have={new Set(list.map((v) => v.name.toLowerCase()))} onAdd={(v) => void save([...list, v], `${v.name} added to your vendors`)} />

      <section aria-label="Your vendors" className="flex flex-col gap-3">
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <H2>Your vendors</H2>
          <Pill
            kind="dashed"
            onClick={() => {
              const v = newVendor({ name: 'New vendor' });
              setOpen(v.id);
              void save([...list, v]);
            }}
          >
            + Add one yourself
          </Pill>
        </div>
        {VENDOR_STATUS.slice()
          .reverse()
          .map((st) => {
            const vs = list.filter((v) => v.status === st);
            if (!vs.length) return null;
            return (
              <div key={st} className="flex flex-col gap-2">
                <div className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">
                  {STATUS_LABEL[st]} · {vs.length}
                </div>
                {vs.map((v) => (
                  <VendorCard
                    key={v.id}
                    v={v}
                    open={open === v.id}
                    onToggle={() => setOpen(open === v.id ? null : v.id)}
                    onChange={(p, done) => patch(v.id, p, done)}
                    onRemove={() => window.confirm(`Remove ${v.name} from your vendors?`) && void save(list.filter((x) => x.id !== v.id), 'Removed')}
                  />
                ))}
              </div>
            );
          })}
        {!list.length && <p className="m-0 text-[14px] text-[#5b6a52]">No vendors yet. Find some near your venue above, or add your own.</p>}
      </section>
    </div>
  );
}

function VendorCard({ v, open, onToggle, onChange, onRemove }: { v: Vendor; open: boolean; onToggle: () => void; onChange: (p: Partial<Vendor>, done?: string) => void; onRemove: () => void }) {
  const { wid } = useAdmin();
  // Text fields save when you leave them; choices save straight away.
  const field = (k: 'name' | 'category' | 'contact' | 'phone' | 'email' | 'website' | 'address' | 'arrival' | 'notes', label: string, long = false) => (
    <label key={k} className={`flex flex-col gap-1 text-[12px] text-[#5b6a52] ${long ? 'sm:col-span-2' : ''}`}>
      {label}
      {long ? (
        <textarea rows={3} defaultValue={v[k]} onBlur={(e) => e.target.value !== v[k] && onChange({ [k]: e.target.value })} className={`${inputCls} resize-y`} />
      ) : (
        <input defaultValue={v[k]} onBlur={(e) => e.target.value !== v[k] && onChange({ [k]: e.target.value })} className={inputCls} />
      )}
    </label>
  );
  const c = commitmentOf(v);
  const [adding, setAdding] = useState(false);
  const accept = (q: Quote) =>
    onChange({ accepted: q.id, quote: q.amount, deposit: q.deposit, status: 'booked' }, `${v.name} booked at ${aud(q.amount)}`);
  return (
    <article className="rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex justify-between items-center gap-3 py-3 px-4 border-0 bg-transparent text-left cursor-pointer">
        <span className="min-w-0">
          <span className="block font-medium truncate">{v.name}</span>
          <span className="block text-[13px] text-[#5b6a52] truncate">
            {[
              v.category,
              v.km !== null ? `${v.km} km from the venue` : '',
              v.quotes.length ? `${v.quotes.length} ${v.quotes.length === 1 ? 'quote' : 'quotes'}` : '',
              c.amount ? (v.status === 'booked' ? `Booked ${aud(c.amount)}` : `From ${aud(Math.min(...v.quotes.map((q) => q.amount || Infinity), c.amount || Infinity))}`) : '',
              v.balanceDue ? `Balance due ${shortDate(v.balanceDue)}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="py-[3px] px-[10px] rounded-full text-[12px] font-semibold flex-none" style={{ background: STATUS_COLOUR[v.status] }}>
          {STATUS_LABEL[v.status]}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div role="radiogroup" aria-label="Status" className="flex gap-2 flex-wrap">
            {VENDOR_STATUS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={v.status === s}
                onClick={() => onChange({ status: s })}
                className={`py-[5px] px-3 rounded-full border text-[13px] cursor-pointer ${v.status === s ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794]'}`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {/* Quotes: file each one; accept one to book them. */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-baseline gap-2 flex-wrap">
              <strong className="text-[14px] font-semibold">Quotes</strong>
              {!adding && (
                <button type="button" onClick={() => setAdding(true)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
                  + File a quote
                </button>
              )}
            </div>
            {v.quotes.map((q) => (
              <div key={q.id} className={`flex flex-col gap-1 p-3 rounded-[10px] border ${q.id === v.accepted ? 'border-[#5d6b47] bg-[#eef1e4]' : 'border-[#e2d7bc] bg-white'}`}>
                <div className="flex justify-between items-baseline gap-2 flex-wrap">
                  <span className="font-display text-[22px] leading-none">
                    {aud(q.amount)}
                    {q.deposit ? <span className="ml-2 font-sans text-[13px] text-[#5b6a52]">deposit {aud(q.deposit)}</span> : null}
                  </span>
                  <span className="text-[12px] text-[#7a7466]">
                    {[q.date ? `Given ${shortDate(q.date)}` : '', q.validUntil ? `Valid until ${shortDate(q.validUntil)}` : ''].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {q.includes && <div className="text-[13px]"><strong className="font-semibold">Includes:</strong> {q.includes}</div>}
                {q.excludes && <div className="text-[13px]"><strong className="font-semibold">Not included:</strong> {q.excludes}</div>}
                {q.notes && <div className="text-[13px] text-[#5b6a52]">{q.notes}</div>}
                <div className="flex gap-3 flex-wrap text-[13px] mt-1">
                  {q.fileId && (
                    <a href={plannerApi.fileUrl(wid, q.fileId)} target="_blank" rel="noopener" className="!text-[#33402f]">
                      Open {q.fileName || 'the quote'}
                    </a>
                  )}
                  {q.id === v.accepted ? (
                    <span className="font-semibold text-[#3d4a2f]">Accepted ✓</span>
                  ) : (
                    <button type="button" onClick={() => accept(q)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#3d4a2f] font-medium">
                      Accept this quote
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.confirm('Remove this quote?') && onChange({ quotes: v.quotes.filter((x) => x.id !== q.id), ...(q.id === v.accepted ? { accepted: '' } : {}) })}
                    className="ml-auto p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {!v.quotes.length && !adding && <span className="text-[13px] text-[#7a7466]">No quotes filed yet.</span>}
            {adding && (
              <QuoteForm
                onCancel={() => setAdding(false)}
                onSave={(q) => {
                  setAdding(false);
                  onChange({ quotes: [...v.quotes, q], ...(v.status === 'idea' || v.status === 'contacted' ? { status: 'quoted' as const } : {}) }, 'Quote filed');
                }}
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {field('name', 'Name')}
            {field('category', 'What they do')}
            {field('contact', 'Contact person')}
            {field('phone', 'Phone')}
            {field('email', 'Email')}
            {field('website', 'Website')}
            {field('address', 'Address', true)}
            <label className="flex items-center gap-2 text-[14px] cursor-pointer">
              <input type="checkbox" checked={v.depositPaid} onChange={() => onChange({ depositPaid: !v.depositPaid })} className="w-[18px] h-[18px] accent-[#5d6b47]" />
              Deposit paid{c.deposit ? ` (${aud(c.deposit)})` : ''}
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Balance due
              <input type="date" value={v.balanceDue} onChange={(e) => onChange({ balanceDue: e.target.value })} className={inputCls} />
            </label>
            {field('arrival', 'Arriving on the day (e.g. 11:00am)')}
            {field('notes', 'Notes', true)}
          </div>
          <Contract v={v} onChange={onChange} />
          <div className="flex gap-4 flex-wrap text-[13px]">
            {v.phone && (
              <a href={`tel:${v.phone.replace(/[^\d+]/g, '')}`} className="!text-[#33402f]">
                Call
              </a>
            )}
            {v.email && (
              <a href={`mailto:${v.email}`} className="!text-[#33402f]">
                Email
              </a>
            )}
            {v.website && (
              <a href={safeUrl(v.website)} target="_blank" rel="noopener noreferrer" className="!text-[#33402f]">
                Website
              </a>
            )}
            <button type="button" onClick={onRemove} className="ml-auto p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]">
              Remove vendor
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/** File a quote: attach the PDF or a photo (the assistant can read the numbers out), check, save. */
function QuoteForm({ onSave, onCancel }: { onSave: (q: Quote) => void; onCancel: () => void }) {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const [q, setQ] = useState<Quote>({ ...BLANK_QUOTE, id: newId(), date: dateIn(overview?.wedding.timezone) });
  const [busy, setBusy] = useState('');
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_500_000) return toast('That file is over 1.5 MB. Try a smaller PDF, or a photo of the quote.');
    setBusy('Filing it…');
    try {
      const f = await plannerApi.uploadFile(wid, file);
      setQ((x) => ({ ...x, fileId: f.id, fileName: f.name }));
      setBusy('Reading the quote…');
      try {
        const r = await plannerApi.readQuote(wid, f.id);
        setQ((x) => ({
          ...x,
          amount: r.amount || x.amount,
          deposit: r.deposit || x.deposit,
          validUntil: r.validUntil || x.validUntil,
          date: r.date || x.date,
          includes: r.includes || x.includes,
          excludes: r.excludes || x.excludes,
          extract: r.extract,
        }));
        toast('Read it: check the numbers before saving');
      } catch (e) {
        toast((e as Error).message);
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const num = (k: 'amount' | 'deposit', label: string) => (
    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
      {label}
      <MoneyInput value={q[k]} placeholder="0" onValue={(n) => setQ((cur) => ({ ...cur, [k]: n }))} className={`${inputCls} tabular-nums`} />
    </label>
  );
  return (
    <div className="flex flex-col gap-3 p-3 rounded-[10px] border border-dashed border-[#8a9670] bg-white">
      <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
        The quote (PDF or a photo, optional)
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" disabled={!!busy} onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {busy && <span role="status" className="text-[13px] italic text-[#5b6a52]">{busy}</span>}
      {q.fileName && !busy && <span className="text-[13px] text-[#3d4a2f]">Filed: {q.fileName}</span>}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {num('amount', 'Total (AUD)')}
        {num('deposit', 'Deposit (AUD)')}
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          Given
          <input type="date" value={q.date} onChange={(e) => setQ({ ...q, date: e.target.value })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          Valid until
          <input type="date" value={q.validUntil} onChange={(e) => setQ({ ...q, validUntil: e.target.value })} className={inputCls} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
        What's included
        <textarea rows={2} value={q.includes} onChange={(e) => setQ({ ...q, includes: e.target.value })} className={`${inputCls} resize-y`} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
        Not included / costs extra
        <textarea rows={2} value={q.excludes} onChange={(e) => setQ({ ...q, excludes: e.target.value })} className={`${inputCls} resize-y`} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
        Notes
        <textarea rows={2} value={q.notes} onChange={(e) => setQ({ ...q, notes: e.target.value })} className={`${inputCls} resize-y`} />
      </label>
      <div className="flex gap-2 justify-end">
        <Pill onClick={onCancel}>Cancel</Pill>
        <Pill kind="primary" disabled={!!busy || (!q.amount && !q.fileId)} onClick={() => onSave(q)}>
          Save quote
        </Pill>
      </div>
    </div>
  );
}

/** Side by side: the vendors of one kind with quotes, and the assistant's comparison on request. */
function Compare({ list }: { list: Vendor[] }) {
  const { wid } = useAdmin();
  const withQuotes = list.filter((v) => v.quotes.length || v.quote);
  const cats = useMemo(() => [...new Set(withQuotes.map((v) => v.category.trim() || 'Other'))], [withQuotes]);
  const [cat, setCat] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const current = cat && cats.includes(cat) ? cat : cats.find((c) => withQuotes.filter((v) => (v.category.trim() || 'Other') === c).length > 1) ?? cats[0] ?? '';
  const rows = withQuotes.filter((v) => (v.category.trim() || 'Other') === current);
  const chosen = rows.filter((v) => !picked.size || picked.has(v.id));
  const prices = chosen.map((v) => bestQuote(v)?.amount || v.quote).filter((n) => n > 0);
  const cheapest = prices.length ? Math.min(...prices) : 0;
  if (withQuotes.length < 2) return null;

  const ask = async () => {
    setBusy(true);
    setProblem('');
    setAnswer('');
    try {
      setAnswer((await plannerApi.compare(wid, chosen.map((v) => v.id))).answer);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Compare quotes" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <H2>Compare quotes</H2>
      <div className="flex gap-2 flex-wrap">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === current}
            onClick={() => {
              setCat(c);
              setPicked(new Set());
              setAnswer('');
            }}
            className={`py-[5px] px-3 rounded-full border text-[13px] cursor-pointer ${c === current ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794]'}`}
          >
            {c} · {withQuotes.filter((v) => (v.category.trim() || 'Other') === c).length}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px] min-w-[620px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-[.1em] text-[#5b6a52]">
              <th className="py-2 pr-2 font-semibold w-[28px]" aria-label="Compare" />
              <th className="py-2 pr-3 font-semibold">Vendor</th>
              <th className="py-2 pr-3 font-semibold text-right">Price</th>
              <th className="py-2 pr-3 font-semibold text-right">Deposit</th>
              <th className="py-2 pr-3 font-semibold">Includes</th>
              <th className="py-2 pr-3 font-semibold">Not included</th>
              <th className="py-2 font-semibold">Valid until</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const q = bestQuote(v);
              const price = q?.amount || v.quote;
              const on = !picked.size || picked.has(v.id);
              return (
                <tr key={v.id} className="border-t border-[#e2d7bc] align-top">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`Compare ${v.name}`}
                      checked={on}
                      onChange={() => {
                        const base = picked.size ? new Set(picked) : new Set(rows.map((r) => r.id));
                        if (base.has(v.id)) base.delete(v.id);
                        else base.add(v.id);
                        setPicked(base);
                        setAnswer('');
                      }}
                      className="w-[16px] h-[16px] accent-[#5d6b47]"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{v.name}</div>
                    <div className="text-[12px] text-[#7a7466]">{[STATUS_LABEL[v.status], v.km !== null ? `${v.km} km` : ''].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${on && price && price === cheapest && prices.length > 1 ? 'font-semibold text-[#3d4a2f]' : ''}`}>
                    {price ? aud(price) : '–'}
                    {on && price && price === cheapest && prices.length > 1 ? <div className="text-[11px] font-normal">lowest</div> : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{q?.deposit ? aud(q.deposit) : '–'}</td>
                  <td className="py-2 pr-3 text-[13px]">{q?.includes || '–'}</td>
                  <td className="py-2 pr-3 text-[13px]">{q?.excludes || '–'}</td>
                  <td className="py-2 text-[13px] whitespace-nowrap">{q?.validUntil ? shortDate(q.validUntil) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 items-center flex-wrap">
        <Pill kind="primary" disabled={busy || chosen.length < 2} onClick={() => void ask()}>
          {busy ? 'Comparing…' : `Ask the assistant to compare ${chosen.length}`}
        </Pill>
        <span className="text-[12px] text-[#7a7466]">It uses only what's in your quotes and notes. Check before you decide.</span>
      </div>
      {problem && (
        <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">
          {problem}
        </p>
      )}
      {answer && <div className="p-4 rounded-[12px] bg-white border border-[#e2d7bc] whitespace-pre-wrap text-[15px] leading-[1.5]">{answer}</div>}
    </section>
  );
}

function Finder({ have, onAdd }: { have: Set<string>; onAdd: (v: Vendor) => void }) {
  const { wid } = useAdmin();
  const [category, setCategory] = useState('florist');
  const [km, setKm] = useState(25);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ venue: string; results: VendorHit[] } | null>(null);
  const [problem, setProblem] = useState('');
  const search = async () => {
    setBusy(true);
    setProblem('');
    try {
      const r = await plannerApi.searchVendors(wid, category, km);
      setRes({ venue: r.venue.event, results: r.results });
    } catch (e) {
      setRes(null);
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Find vendors near the venue" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <H2>Find vendors near the venue</H2>
      <div className="flex gap-3 flex-wrap items-end">
        <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52]">
          Looking for
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {Object.entries(VENDOR_SEARCH).map(([k, c]) => (
              <option key={k} value={k}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52] min-w-[200px] flex-1">
          Within {km} km
          <input type="range" min={5} max={100} step={5} value={km} onChange={(e) => setKm(Number(e.target.value))} className="accent-[#5d6b47]" />
        </label>
        <Pill kind="primary" disabled={busy} onClick={() => void search()}>
          {busy ? 'Searching…' : 'Search'}
        </Pill>
      </div>
      {problem && <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">{problem}</p>}
      {res && (
        <div className="flex flex-col">
          <span className="text-[13px] text-[#5b6a52] pb-2">
            {res.results.length ? `${res.results.length} within ${km} km of ${res.venue}, nearest first` : `Nothing listed within ${km} km. Try a wider radius.`} · from OpenStreetMap, so do check them before booking
          </span>
          {res.results.map((h) => {
            const added = have.has(h.name.toLowerCase());
            return (
              <div key={h.osm} className="flex justify-between items-center gap-3 py-2 border-t border-[#e2d7bc]">
                <span className="min-w-0">
                  <span className="block font-medium truncate">{h.name}</span>
                  <span className="block text-[13px] text-[#5b6a52] truncate">{[`${h.km} km`, h.address, h.phone].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="flex gap-3 items-center flex-none text-[13px]">
                  {h.website && (
                    <a href={safeUrl(h.website)} target="_blank" rel="noopener noreferrer" className="!text-[#33402f]">
                      Website
                    </a>
                  )}
                  <a href={`https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lon}#map=16/${h.lat}/${h.lon}`} target="_blank" rel="noopener noreferrer" className="!text-[#33402f]">
                    Map
                  </a>
                  <Pill
                    kind="outline"
                    disabled={added}
                    onClick={() => onAdd(newVendor({ name: h.name, category: VENDOR_SEARCH[category]!.label.replace(/s$/, ''), phone: h.phone, email: h.email, website: h.website, address: h.address, km: h.km }))}
                  >
                    {added ? 'Added' : '+ Add'}
                  </Pill>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** The contract: signed when, what happens if anyone cancels, whether the deposit comes back, the file, meals for their team. */
function Contract({ v, onChange }: { v: Vendor; onChange: (p: Partial<Vendor>) => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <details className="rounded-[12px] border border-[#e2d7bc] bg-white" open={!!(v.contractSigned || v.contractFileId)}>
      <summary className="cursor-pointer py-2 px-3 text-[14px] font-medium">
        Contract{v.contractSigned ? ` · signed ${shortDate(v.contractSigned)}` : v.status === 'booked' ? ' · not signed yet' : ''}
        {v.contractFileId ? ' · file kept' : ''}
      </summary>
      <div className="grid gap-3 sm:grid-cols-2 px-3 pb-3">
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          Signed on
          <input type="date" value={v.contractSigned} onChange={(e) => onChange({ contractSigned: e.target.value })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          Meals for their team on the day
          <input type="number" min={0} max={50} value={v.meals} onChange={(e) => onChange({ meals: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] sm:col-span-2">
          If anyone cancels or postpones
          <textarea rows={2} value={v.cancellation} maxLength={600} placeholder="e.g. Deposit kept; 50% due if cancelled within 90 days; one free date change" onChange={(e) => onChange({ cancellation: e.target.value })} className={`${inputCls} resize-y`} />
        </label>
        <label className="flex items-center gap-2 text-[14px] cursor-pointer">
          <input type="checkbox" checked={v.depositRefundable} onChange={() => onChange({ depositRefundable: !v.depositRefundable })} className="w-[18px] h-[18px] accent-[#5d6b47]" />
          The deposit is refundable
        </label>
        <span className="flex items-center gap-3 text-[14px] flex-wrap">
          {v.contractFileId ? (
            <>
              <a href={plannerApi.fileUrl(wid, v.contractFileId)} target="_blank" rel="noopener" className="!text-[#33402f]">
                📎 {v.contractFileName || 'Contract'}
              </a>
              <button type="button" onClick={() => onChange({ contractFileId: '', contractFileName: '' })} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#7a4a37]">
                Remove
              </button>
            </>
          ) : (
            <label className={`py-[6px] px-3 rounded-full border border-[#c6b794] text-[13px] cursor-pointer ${busy ? 'opacity-60' : ''}`}>
              {busy ? 'Uploading…' : 'Keep the contract (PDF or photo)'}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  if (f.size > 1.5 * 1024 * 1024) return toast('That file is over 1.5 MB. Try a smaller PDF or a photo.');
                  setBusy(true);
                  try {
                    const r = await plannerApi.uploadFile(wid, f);
                    onChange({ contractFileId: r.id, contractFileName: r.name });
                  } catch (err) {
                    toast((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          )}
        </span>
      </div>
    </details>
  );
}

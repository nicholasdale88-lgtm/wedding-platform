import { VENDOR_SEARCH, VENDOR_STATUS, type Vendor, type Vendors as VendorsDoc } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, plannerApi, type VendorHit } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Eyebrow, H2, inputCls, Pill, useToast } from '../ui';

/**
 * Account → Vendors: everyone you're talking to or have booked (status, quote, deposit, balance due,
 * arrival time on the day), and "Find vendors near the venue": OpenStreetMap places within a radius
 * you choose, nearest first, added to your list in one tap.
 */

const STATUS_LABEL: Record<Vendor['status'], string> = { idea: 'Idea', contacted: 'Contacted', quoted: 'Quoted', booked: 'Booked' };
const STATUS_COLOUR: Record<Vendor['status'], string> = { idea: '#e9e2cc', contacted: '#f1e7c9', quoted: '#dde7f3', booked: '#dfe5cc' };
const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
const newVendor = (over: Partial<Vendor>): Vendor => ({
  id: crypto.randomUUID().slice(0, 12),
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
  ...over,
});
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : u ? `https://${u}` : '');

export function Vendors() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [doc, setDoc] = useState<{ data: VendorsDoc; version: number } | null>(null);
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
      setDoc(await plannerApi.saveDoc(wid, 'vendors', '', { list: next }, before.version));
      if (done) toast(done);
    } catch (e) {
      setDoc(before);
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded. Make your change again.' : (e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    }
  };
  const booked = list.filter((v) => v.status === 'booked');
  const owing = booked.filter((v) => v.quote > (v.depositPaid ? v.deposit : 0));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Eyebrow>Account · Vendors</Eyebrow>
        <h1 className="m-0 mt-[6px] font-display font-medium text-[40px] leading-[1.08]">Vendors</h1>
        <p className="m-0 mt-1 text-[15px] text-[#5b6a52]">
          {list.length ? `${booked.length} booked of ${list.length}` : 'Keep every supplier in one place'}
          {owing.length ? ` · ${aud(owing.reduce((a, v) => a + v.quote - (v.depositPaid ? v.deposit : 0), 0))} still to pay` : ''}
        </p>
      </header>

      <Finder have={new Set(list.map((v) => v.name.toLowerCase()))} onAdd={(v) => void save([...list, v], `${v.name} added to your vendors`)} />

      <section aria-label="Your vendors" className="flex flex-col gap-3">
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <H2>Your vendors</H2>
          <Pill kind="dashed" onClick={() => {
            const v = newVendor({ name: 'New vendor' });
            setOpen(v.id);
            void save([...list, v]);
          }}>
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
                    onChange={(patch) => void save(list.map((x) => (x.id === v.id ? { ...x, ...patch } : x)))}
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

function VendorCard({ v, open, onToggle, onChange, onRemove }: { v: Vendor; open: boolean; onToggle: () => void; onChange: (p: Partial<Vendor>) => void; onRemove: () => void }) {
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
  return (
    <article className="rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex justify-between items-center gap-3 py-3 px-4 border-0 bg-transparent text-left cursor-pointer">
        <span className="min-w-0">
          <span className="block font-medium truncate">{v.name}</span>
          <span className="block text-[13px] text-[#5b6a52] truncate">
            {[v.category, v.km !== null ? `${v.km} km from the venue` : '', v.quote ? `Quote ${aud(v.quote)}` : '', v.balanceDue ? `Balance due ${v.balanceDue}` : ''].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="py-[3px] px-[10px] rounded-full text-[12px] font-semibold flex-none" style={{ background: STATUS_COLOUR[v.status] }}>
          {STATUS_LABEL[v.status]}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4">
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
          <div className="grid gap-3 sm:grid-cols-2">
            {field('name', 'Name')}
            {field('category', 'What they do')}
            {field('contact', 'Contact person')}
            {field('phone', 'Phone')}
            {field('email', 'Email')}
            {field('website', 'Website')}
            {field('address', 'Address', true)}
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Quote (AUD)
              <input inputMode="decimal" defaultValue={v.quote || ''} onBlur={(e) => onChange({ quote: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Deposit (AUD)
              <input inputMode="decimal" defaultValue={v.deposit || ''} onBlur={(e) => onChange({ deposit: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} className={inputCls} />
            </label>
            <label className="flex items-center gap-2 text-[14px] cursor-pointer">
              <input type="checkbox" checked={v.depositPaid} onChange={() => onChange({ depositPaid: !v.depositPaid })} className="w-[18px] h-[18px] accent-[#5d6b47]" />
              Deposit paid
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Balance due
              <input type="date" value={v.balanceDue} onChange={(e) => onChange({ balanceDue: e.target.value })} className={inputCls} />
            </label>
            {field('arrival', 'Arriving on the day (e.g. 11:00am)')}
            {field('notes', 'Notes', true)}
          </div>
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
              Remove
            </button>
          </div>
        </div>
      )}
    </article>
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

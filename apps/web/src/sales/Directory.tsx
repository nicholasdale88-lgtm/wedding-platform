import { DEFAULT_VENDOR_LOOK, PACKAGE_UNITS, regionOf, REGIONS, VENDOR_MENU, VENDOR_SEARCH, type Listing, type ListingCard, type ListingFields, type ListingPackage, type VendorLook } from '@wp/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ProfileSwitch } from '../lib/ProfileSwitch';
import { api, ApiError, directoryApi, proposalsApi, vendorCouplesApi, type MyListing, type VendorCouple } from '../lib/api';
import { EnquiryPipeline, VendorCalendar, VendorOverview } from './VendorDesk';
import { BRAND } from './SalesPage';
import { VendorCouples } from './VendorCouples';
import { VendorQuotes } from './VendorQuotes';
import { isVendorDemo } from '../try/vendorDemo';
import { VendorKit } from './VendorKit';
import { VendorProposals } from './FeeProposal';
import { VendorShell, type VendorPlace } from './VendorShell';
import { VendorLookPanel } from './VendorLookPanel';

/**
 * The vendor directory on the public site: wedding vendors who've signed up and listed themselves (free).
 * - /vendors: browse by what they do and where they work; the filters are in the address, so a search can
 *   be shared.
 * - /vendors/:slug: a vendor's page, with an enquiry form (their email isn't shown).
 * - /vendors/join: a vendor lists their business and gets an account.
 * - /vendors/me: a vendor's own listing to keep up to date, and the enquiries couples have sent.
 */

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";
const field = 'w-full py-[11px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px]';
const btn = 'py-3 px-6 rounded-full border-0 text-[16px] font-medium cursor-pointer disabled:opacity-60';
const STATES = ['NSW', 'ACT', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT'] as const;
const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
/** A package's price as couples read it: "$2,400", "$85 per guest". */
export const packagePrice = (p: Pick<ListingPackage, 'price' | 'unit'>) => (p.unit === 'total' ? aud(p.price) : `${aud(p.price)} ${p.unit}`);
const what = (k: string) => (VENDOR_SEARCH[k]?.label ?? k).replace(/s$/, '');
const where = (slug: string) => regionOf(slug)?.name ?? slug;

function Frame({ children, title }: { children: ReactNode; title: string }) {
  useEffect(() => {
    document.title = `${title} · ${BRAND}`;
  }, [title]);
  return (
    <div className="min-h-screen bg-[#f6f0e2]" style={{ color: INK, fontFamily: sans }}>
      <header className="max-w-[1100px] mx-auto px-4 py-4 flex justify-between items-center gap-3 flex-wrap">
        {/* Every header link is at least 44px tall: an easy tap on a phone. */}
        <Link to="/" className="text-[26px] no-underline inline-flex items-center min-h-[44px]" style={{ fontFamily: serif, color: INK }}>
          {BRAND}
        </Link>
        <nav className="flex items-center gap-4 text-[15px] flex-wrap">
          <Link to="/vendors" className="no-underline inline-flex items-center min-h-[44px]" style={{ color: INK }}>
            Vendor directory
          </Link>
          <Link to="/vendors/me" className="no-underline inline-flex items-center min-h-[44px]" style={{ color: INK }}>
            Vendor sign-in
          </Link>
          <ProfileSwitch here="vendor" tone="light" />
          <Link to="/vendors/join" className="px-4 rounded-full no-underline inline-flex items-center min-h-[44px]" style={{ background: INK, color: '#fbf8f2' }}>
            List your business
          </Link>
        </nav>
      </header>
      <main className="max-w-[1100px] mx-auto px-4 pb-16">{children}</main>
    </div>
  );
}

function RegionSelect({ value, onChange, any }: { value: string; onChange: (v: string) => void; any?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      {any !== undefined && <option value="">{any}</option>}
      {STATES.map((s) => (
        <optgroup key={s} label={s}>
          {REGIONS.filter((r) => r.state === s).map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ------------------------------------------------------------------------------------------- browse

export function DirectoryPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const region = params.get('region') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [results, setResults] = useState<ListingCard[] | null>(null);
  const [problem, setProblem] = useState('');
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  useEffect(() => {
    setResults(null);
    directoryApi
      .browse({ category, region, q: params.get('q') ?? '' })
      .then((r) => setResults(r.results))
      .catch((e: Error) => setProblem(e.message));
  }, [category, region, params]);
  const heading = [category ? `${VENDOR_SEARCH[category]?.label ?? 'Vendors'}` : 'Wedding vendors', region ? `in ${where(region)}` : 'across Australia'].join(' ');

  return (
    <Frame title={heading}>
      <section className="pt-6 pb-6 flex flex-col gap-2">
        <h1 className="m-0 text-[clamp(34px,6vw,54px)] leading-[1.05] font-normal" style={{ fontFamily: serif }}>
          {heading}
        </h1>
        <p className="m-0 text-[16px] max-w-[640px]" style={{ color: SOFT }}>
          Vendors who’ve listed themselves here, with their prices, where they work and what couples booked. Ask them about your date straight from their page.
        </p>
      </section>
      <form
        className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto] items-end p-4 rounded-[16px] bg-[#fbf8f0] border border-[#e2d7bc]"
        onSubmit={(e) => {
          e.preventDefault();
          set('q', q.trim());
        }}
      >
        <label className="flex flex-col gap-1 text-[14px]">
          Looking for
          <select value={category} onChange={(e) => set('category', e.target.value)} className={field}>
            <option value="">All vendors</option>
            {Object.entries(VENDOR_SEARCH).map(([k, c]) => (
              <option key={k} value={k}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          Where
          <RegionSelect value={region} onChange={(v) => set('region', v)} any="Anywhere in Australia" />
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          Name or style
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. garden, Italian, acoustic" className={field} />
        </label>
        <button type="submit" className={btn} style={{ background: INK, color: '#fbf8f2' }}>
          Search
        </button>
      </form>
      {problem && (
        <p role="alert" className="text-[#7a4a37]">
          {problem}
        </p>
      )}
      {!results ? (
        <div aria-busy="true" className="py-10" style={{ color: SOFT }}>
          Finding vendors…
        </div>
      ) : !results.length ? (
        <div className="mt-8 p-6 rounded-[16px] border border-dashed border-[#c6b794] flex flex-col gap-2 items-start">
          <strong className="text-[22px] font-normal" style={{ fontFamily: serif }}>
            No one listed {category || region ? 'for that ' : ''}yet
          </strong>
          <span style={{ color: SOFT }}>The directory is new and growing. Try anywhere in Australia, or all vendors.</span>
          <span style={{ color: SOFT }}>
            Are you a wedding vendor?{' '}
            <Link to="/vendors/join" style={{ color: INK }}>
              List your business free
            </Link>
            .
          </span>
        </div>
      ) : (
        <ul className="list-none m-0 mt-6 p-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((v) => (
            <li key={v.slug}>
              <Link to={`/vendors/${v.slug}`} className="flex flex-col h-full rounded-[16px] overflow-hidden border border-[#e2d7bc] bg-white no-underline hover:shadow-[0_8px_24px_rgba(51,64,47,.12)]" style={{ color: INK }}>
                {v.photo ? <img src={v.photo} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover bg-[#efe6d3]" /> : <span aria-hidden className="w-full aspect-[4/3] bg-[#efe6d3] flex items-center justify-center text-[44px]" style={{ fontFamily: serif }}>{v.name.charAt(0)}</span>}
                <span className="flex flex-col gap-1 p-4">
                  <span className="text-[12px] tracking-[.14em] uppercase" style={{ color: SOFT }}>
                    {what(v.category)} · {where(v.region)}
                  </span>
                  <span className="text-[22px] leading-tight" style={{ fontFamily: serif }}>
                    {v.name}
                  </span>
                  {v.about && <span className="text-[14px] line-clamp-3" style={{ color: SOFT }}>{v.about}</span>}
                  <span className="flex gap-3 flex-wrap text-[13px] mt-1">
                    {v.priceFrom > 0 && <strong className="font-semibold">From {aud(v.priceFrom)}</strong>}
                    {v.booked > 0 && <span style={{ color: SOFT }}>Booked by {v.booked} {v.booked === 1 ? 'couple' : 'couples'}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

// ------------------------------------------------------------------------------------------- a vendor's page

export function ListingPage() {
  const { slug = '' } = useParams();
  const [v, setV] = useState<Listing | null>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    directoryApi
      .listing(slug)
      .then(setV)
      .catch((e: Error) => setProblem(e.message));
  }, [slug]);
  if (problem)
    return (
      <Frame title="Vendor">
        <p className="pt-10 text-[18px]">{problem}</p>
        <Link to="/vendors" style={{ color: INK }}>
          Back to the directory
        </Link>
      </Frame>
    );
  if (!v)
    return (
      <Frame title="Vendor">
        <div aria-busy="true" className="py-10" style={{ color: SOFT }}>
          Loading…
        </div>
      </Frame>
    );
  return (
    <Frame title={v.name}>
      <Link to={`/vendors?category=${v.category}&region=${v.region}`} className="inline-block pt-2 text-[14px]" style={{ color: SOFT }}>
        ‹ More {VENDOR_SEARCH[v.category]?.label.toLowerCase() ?? 'vendors'} in {where(v.region)}
      </Link>
      <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] pt-4">
        <section className="flex flex-col gap-4 min-w-0">
          <div>
            {v.logo && (
              <span className="mb-3 inline-flex items-center justify-center bg-white rounded-[14px] p-2 shadow-[0_1px_2px_rgba(0,0,0,.12),0_6px_16px_rgba(0,0,0,.08)]">
                <img src={v.logo} alt={`${v.name} logo`} className="block max-h-[64px] max-w-[200px] object-contain" />
              </span>
            )}
            <span className="block text-[13px] tracking-[.14em] uppercase" style={{ color: SOFT }}>
              {what(v.category)} · {where(v.region)}
            </span>
            <h1 className="m-0 text-[clamp(34px,6vw,52px)] leading-[1.05] font-normal" style={{ fontFamily: serif }}>
              {v.name}
            </h1>
            <div className="flex gap-4 flex-wrap text-[15px] mt-2">
              {v.priceFrom > 0 && <strong className="font-semibold">From {aud(v.priceFrom)}</strong>}
              {v.booked > 0 && <span style={{ color: SOFT }}>Booked by {v.booked} {v.booked === 1 ? 'couple' : 'couples'} planning with {BRAND}</span>}
            </div>
          </div>
          {v.photos.length > 0 && (
            <div className="grid gap-2 grid-cols-2">
              {v.photos.map((p, i) => (
                <img key={p} src={p} alt={`${v.name}, photo ${i + 1}`} loading="lazy" className={`w-full object-cover rounded-[12px] bg-[#efe6d3] ${i === 0 ? 'col-span-2 aspect-[16/9]' : 'aspect-square'}`} />
              ))}
            </div>
          )}
          {v.about && <p className="m-0 text-[16px] leading-[1.6] whitespace-pre-line">{v.about}</p>}
          {v.regions.length > 0 && (
            <p className="m-0 text-[15px]" style={{ color: SOFT }}>
              Also travels to {v.regions.map(where).join(', ')}.
            </p>
          )}
          <Packages list={v.packages ?? []} />
          <div className="flex gap-3 flex-wrap">
            {v.phone && (
              <a href={`tel:${v.phone.replace(/[^\d+]/g, '')}`} className="py-[10px] px-5 rounded-full border no-underline" style={{ borderColor: INK, color: INK }}>
                Call {v.contactName ? v.contactName.split(' ')[0] : 'them'}
              </a>
            )}
            {v.website && (
              <a href={v.website} target="_blank" rel="noopener noreferrer" className="py-[10px] px-5 rounded-full border no-underline" style={{ borderColor: INK, color: INK }}>
                Website
              </a>
            )}
            {v.instagram && (
              <a href={`https://instagram.com/${encodeURIComponent(v.instagram)}`} target="_blank" rel="noopener noreferrer" className="py-[10px] px-5 rounded-full border no-underline" style={{ borderColor: INK, color: INK }}>
                Instagram
              </a>
            )}
          </div>
        </section>
        <EnquiryForm slug={v.slug} name={v.name} />
      </div>
    </Frame>
  );
}

/** A vendor's price list on their page: one card each, the popular one picked out. */
function Packages({ list }: { list: ListingPackage[] }) {
  if (!list.length) return null;
  return (
    <section aria-labelledby="packages-h" className="flex flex-col gap-3">
      <h2 id="packages-h" className="m-0 text-[28px] font-normal" style={{ fontFamily: serif }}>
        Packages
      </h2>
      <ul className="m-0 p-0 list-none grid gap-3 sm:grid-cols-2">
        {list.map((p, i) => (
          <li
            key={`${i}-${p.name}`}
            className={`flex flex-col gap-2 p-4 rounded-[14px] min-w-0 ${p.popular ? 'bg-[#fbf8f0] border-2 border-[#33402f]' : 'bg-white border border-[#e2d7bc]'}`}
          >
            {p.popular && (
              <span className="self-start text-[12px] tracking-[.12em] uppercase py-[3px] px-[10px] rounded-full" style={{ background: INK, color: '#fbf8f2' }}>
                Most popular
              </span>
            )}
            <strong className="text-[22px] font-normal leading-tight break-words" style={{ fontFamily: serif }}>
              {p.name}
            </strong>
            <span className="text-[18px] font-semibold">{packagePrice(p)}</span>
            {p.includes.length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[15px]">
                {p.includes.map((x, j) => (
                  <li key={j} className="flex gap-2 items-start break-words min-w-0">
                    <span aria-hidden="true" style={{ color: SOFT }}>
                      ✓
                    </span>
                    <span className="min-w-0">{x}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EnquiryForm({ slug, name }: { slug: string; name: string }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', date: '', guests: '', message: '', company: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      await directoryApi.enquire(slug, { ...f, guests: Math.max(0, Math.min(2000, Number(f.guests) || 0)) });
      setSent(true);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <aside className="self-start p-5 rounded-[16px] bg-[#fbf8f0] border border-[#e2d7bc] flex flex-col gap-2">
        <strong className="text-[24px] font-normal" style={{ fontFamily: serif }}>
          Sent to {name}
        </strong>
        <span style={{ color: SOFT }}>They’ll reply to {f.email}. Planning with {BRAND}? Add them to your vendors in the Wedding planner to keep their quote and payments in one place.</span>
      </aside>
    );
  return (
    <form onSubmit={(e) => void submit(e)} className="self-start p-5 rounded-[16px] bg-[#fbf8f0] border border-[#e2d7bc] flex flex-col gap-3">
      <strong className="text-[24px] font-normal" style={{ fontFamily: serif }}>
        Ask about your date
      </strong>
      <label className="flex flex-col gap-1 text-[14px]">
        Your names
        <input required value={f.name} onChange={set('name')} autoComplete="name" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[14px]">
        Email
        <input required type="email" value={f.email} onChange={set('email')} autoComplete="email" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[14px]">
        Mobile (optional)
        <input value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[14px]">
          Wedding date
          <input type="date" value={f.date} onChange={set('date')} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          Guests (about)
          <input type="number" min={0} max={2000} value={f.guests} onChange={set('guests')} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[14px]">
        Your message
        <textarea required rows={4} minLength={5} maxLength={2000} value={f.message} onChange={set('message')} placeholder="Where you’re marrying, what you have in mind, and anything you’d like to know." className={`${field} resize-y`} />
      </label>
      <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={f.company} onChange={set('company')} name="company" className="absolute left-[-9999px] w-px h-px opacity-0" />
      {problem && (
        <p role="alert" className="m-0 text-[#7a4a37]">
          {problem}
        </p>
      )}
      <button type="submit" disabled={busy} className={btn} style={{ background: INK, color: '#fbf8f2' }}>
        {busy ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  );
}

// ------------------------------------------------------------------------------------------- the listing form

const BLANK: ListingFields = { name: '', category: '', region: '', regions: [], contactName: '', phone: '', website: '', instagram: '', about: '', priceFrom: 0, photos: [], packages: [] };
const MAX_PACKAGES = 8;
/** Before saving: blank "included" lines dropped. */
const tidy = (f: ListingFields): ListingFields => ({ ...f, packages: f.packages.map((p) => ({ ...p, includes: p.includes.map((x) => x.trim()).filter(Boolean) })) });
const NEW_PACKAGE: ListingPackage = { name: '', price: 0, unit: 'total', includes: [], popular: false };
const small = 'min-h-[40px] min-w-[40px] px-3 rounded-full border border-[#d3c6a4] bg-white text-[14px] cursor-pointer disabled:opacity-40';

/** The vendor's packages: one card each, with what's included, which is most popular, and their order. */
function PackagesEditor({ value, onChange }: { value: ListingPackage[]; onChange: (v: ListingPackage[]) => void }) {
  const put = (i: number, p: Partial<ListingPackage>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, by: number) => {
    const next = [...value];
    const [p] = next.splice(i, 1);
    if (!p) return;
    next.splice(i + by, 0, p);
    onChange(next);
  };
  return (
    <fieldset className="m-0 p-0 border-0 flex flex-col gap-3 min-w-0">
      <legend className="p-0 text-[16px] font-semibold">Your packages</legend>
      <p className="m-0 text-[14px]" style={{ color: SOFT }}>
        A clear price list helps couples compare, and looks professional. Up to {MAX_PACKAGES}.
      </p>
      {value.map((p, i) => (
        <div key={i} role="group" aria-label={`Package ${i + 1}`} className="flex flex-col gap-3 p-3 rounded-[12px] border border-[#d3c6a4] bg-white min-w-0">
          <label className="flex flex-col gap-1 text-[14px]">
            Package name
            <input required value={p.name} maxLength={80} placeholder="Ceremony and reception" onChange={(e) => put(i, { name: e.target.value })} className={field} />
          </label>
          <div className="grid gap-3 grid-cols-2">
            <label className="flex flex-col gap-1 text-[14px] min-w-0">
              Price ($)
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={1000000}
                value={p.price || ''}
                onChange={(e) => put(i, { price: Math.max(0, Math.min(1_000_000, Math.round(Number(e.target.value) || 0))) })}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-[14px] min-w-0">
              Priced
              <select value={p.unit} onChange={(e) => put(i, { unit: e.target.value as ListingPackage['unit'] })} className={field}>
                {PACKAGE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u === 'total' ? 'in total' : u}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[14px]">What’s included</span>
            {p.includes.map((x, j) => (
              <div key={j} className="flex gap-2 items-center min-w-0">
                <input
                  value={x}
                  maxLength={120}
                  aria-label={`Included, line ${j + 1}`}
                  onChange={(e) => put(i, { includes: p.includes.map((y, k) => (k === j ? e.target.value : y)) })}
                  className={`${field} min-w-0`}
                />
                <button type="button" aria-label={`Remove line ${j + 1}`} onClick={() => put(i, { includes: p.includes.filter((_, k) => k !== j) })} className={small}>
                  ✕
                </button>
              </div>
            ))}
            {p.includes.length < 12 && (
              <button type="button" onClick={() => put(i, { includes: [...p.includes, ''] })} className={`${small} self-start`}>
                + Add a line
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-[14px] cursor-pointer min-h-[40px]">
            <input
              type="checkbox"
              checked={p.popular}
              onChange={(e) => onChange(value.map((x, j) => ({ ...x, popular: j === i ? e.target.checked : e.target.checked ? false : x.popular })))}
              className="w-5 h-5 accent-[#33402f]"
            />
            Most popular
          </label>
          <div className="flex gap-2 flex-wrap">
            <button type="button" aria-label={`Move package ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className={small}>
              ↑ Up
            </button>
            <button type="button" aria-label={`Move package ${i + 1} down`} disabled={i === value.length - 1} onClick={() => move(i, 1)} className={small}>
              ↓ Down
            </button>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className={`${small} ml-auto`}>
              Remove package
            </button>
          </div>
        </div>
      ))}
      {value.length < MAX_PACKAGES && (
        <button type="button" onClick={() => onChange([...value, { ...NEW_PACKAGE }])} className={`${small} self-start`}>
          + Add a package
        </button>
      )}
    </fieldset>
  );
}

function ListingForm({ value, onChange }: { value: ListingFields; onChange: (v: ListingFields) => void }) {
  const set = <K extends keyof ListingFields>(k: K, v: ListingFields[K]) => onChange({ ...value, [k]: v });
  const [photos, setPhotos] = useState(value.photos.join('\n'));
  return (
    <>
      <label className="flex flex-col gap-1 text-[14px]">
        Business name
        <input required value={value.name} maxLength={100} onChange={(e) => set('name', e.target.value)} className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[14px]">
          What you do
          <select required value={value.category} onChange={(e) => set('category', e.target.value)} className={field}>
            <option value="" disabled>
              Choose…
            </option>
            {Object.entries(VENDOR_SEARCH).map(([k, c]) => (
              <option key={k} value={k}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          Where you’re based
          <RegionSelect value={value.region} onChange={(v) => set('region', v)} any="Choose…" />
        </label>
      </div>
      <details className="rounded-[10px] border border-[#d3c6a4] bg-white">
        <summary className="cursor-pointer py-[10px] px-3 text-[14px]">Also travel to{value.regions.length ? `: ${value.regions.map(where).join(', ')}` : ' (optional)'}</summary>
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 px-3 pb-3">
          {REGIONS.filter((r) => r.slug !== value.region).map((r) => (
            <label key={r.slug} className="flex items-center gap-2 text-[14px] cursor-pointer">
              <input
                type="checkbox"
                checked={value.regions.includes(r.slug)}
                onChange={(e) => set('regions', e.target.checked ? [...value.regions, r.slug].slice(0, 12) : value.regions.filter((x) => x !== r.slug))}
                className="accent-[#33402f]"
              />
              {r.name} <span style={{ color: SOFT }}>· {r.state}</span>
            </label>
          ))}
        </div>
      </details>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[14px]">
          Your name (shown to couples)
          <input value={value.contactName} maxLength={60} onChange={(e) => set('contactName', e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          Phone (shown)
          <input value={value.phone} maxLength={30} inputMode="tel" onChange={(e) => set('phone', e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          Website
          <input value={value.website} maxLength={300} placeholder="https://" onChange={(e) => set('website', e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          Instagram
          <input value={value.instagram} maxLength={60} placeholder="@yourbusiness" onChange={(e) => set('instagram', e.target.value)} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[14px]">
        Prices start from ($, optional)
        <input type="number" min={0} max={1000000} value={value.priceFrom || ''} onChange={(e) => set('priceFrom', Math.max(0, Math.min(1_000_000, Math.round(Number(e.target.value) || 0))))} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[14px]">
        About you (what you offer, your style, what’s included)
        <textarea rows={6} maxLength={2000} value={value.about} onChange={(e) => set('about', e.target.value)} className={`${field} resize-y`} />
      </label>
      <label className="flex flex-col gap-1 text-[14px]">
        Photos: links to up to six, one per line (from your website or a photo host, starting https://)
        <textarea
          rows={3}
          value={photos}
          onChange={(e) => {
            setPhotos(e.target.value);
            set(
              'photos',
              e.target.value
                .split(/\s+/)
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 6),
            );
          }}
          className={`${field} resize-y`}
        />
      </label>
      <PackagesEditor value={value.packages} onChange={(v) => set('packages', v)} />
    </>
  );
}

// ------------------------------------------------------------------------------------------- joining

export function VendorJoinPage() {
  const nav = useNavigate();
  const [f, setF] = useState<ListingFields>(BLANK);
  // Invited by a couple (their email to us): the address they used is filled in, so the couple are linked on joining.
  const [joinParams] = useSearchParams();
  const [acct, setAcct] = useState({ email: joinParams.get('email') ?? '', passcode: '', company: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem('');
    if (!f.category) return setProblem('Choose what you do.');
    if (!f.region) return setProblem('Choose where you’re based.');
    if (acct.passcode.length < 8) return setProblem('Use at least 8 characters for your passcode.');
    setBusy(true);
    try {
      await directoryApi.join({ ...tidy(f), ...acct });
      nav('/vendors/me?joined=1');
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Frame title="List your business">
      <div className="grid gap-10 md:grid-cols-[1fr_1.3fr] pt-6">
        <section className="flex flex-col gap-3">
          <h1 className="m-0 text-[clamp(34px,6vw,52px)] leading-[1.05] font-normal" style={{ fontFamily: serif }}>
            List your business, free
          </h1>
          <p className="m-0 text-[16px]" style={{ color: SOFT }}>
            Couples planning with {BRAND} find you by what you do and where you work, and ask about their date straight from your page.
          </p>
          <ul className="m-0 pl-5 flex flex-col gap-2 text-[15px]">
            <li>Your own page: photos, prices, where you travel, how to reach you.</li>
            <li>Enquiries come to your account, with the couple’s date and numbers.</li>
            <li>When couples add or book you in their planner, it shows on your listing.</li>
            <li>Change anything, any time. Your email stays private.</li>
            <li>Your own code: your couples get 10% off, and you see how many used it.</li>
            <li>A link and QR to the live sample invitation, so couples see it on their phone before they spend anything.</li>
            <li>Cards to print for your counter or client packs.</li>
          </ul>
        </section>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 p-5 rounded-[16px] bg-[#fbf8f0] border border-[#e2d7bc]">
          <ListingForm value={f} onChange={setF} />
          <hr className="w-full border-0 border-t border-[#e2d7bc] my-1" />
          <label className="flex flex-col gap-1 text-[14px]">
            Email (to sign in; not shown)
            <input required type="email" value={acct.email} onChange={(e) => setAcct({ ...acct, email: e.target.value })} autoComplete="email" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[14px]">
            Choose a passcode (8 characters or more)
            <input required type="password" minLength={8} value={acct.passcode} onChange={(e) => setAcct({ ...acct, passcode: e.target.value })} autoComplete="new-password" className={field} />
          </label>
          <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={acct.company} onChange={(e) => setAcct({ ...acct, company: e.target.value })} name="company" className="absolute left-[-9999px] w-px h-px opacity-0" />
          {problem && (
            <p role="alert" className="m-0 text-[#7a4a37]">
              {problem}{' '}
              {/already an account/i.test(problem) && (
                <Link to="/vendors/me" className="!text-[#7a4a37]">
                  Sign in
                </Link>
              )}
            </p>
          )}
          <button type="submit" disabled={busy} className={btn} style={{ background: INK, color: '#fbf8f2' }}>
            {busy ? 'Listing you…' : 'List my business'}
          </button>
        </form>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------------------------------- a vendor's own home

const VENDOR_TABS: readonly VendorPlace[] = [...VENDOR_MENU, 'look'];
type VendorTab = VendorPlace;

export function VendorHomePage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  // Just joined: their listing first (add photos and prices); otherwise their Overview.
  const tab: VendorTab = VENDOR_TABS.includes(asked as VendorTab) ? (asked as VendorTab) : params.get('joined') ? 'listing' : 'home';
  const [chatUnread, setChatUnread] = useState(0);
  // Their couples, for the Overview and the Calendar (the Your couples tab keeps its own, live).
  const [couples, setCouples] = useState<{ list: VendorCouple[]; unread: number; quotesOpen: number }>({ list: [], unread: 0, quotesOpen: 0 });
  const [changes, setChanges] = useState<{ to: string; title: string; message: string }[]>([]);
  const loadCouples = () =>
    vendorCouplesApi
      .list()
      .then((r) => {
        setCouples({ list: r.couples, unread: r.unread, quotesOpen: r.quotesOpen ?? 0 });
        setChatUnread(r.unread);
      })
      .catch(() => undefined);
  const [data, setData] = useState<MyListing | null>(null);
  const [state, setState] = useState<'loading' | 'signed_out' | 'no_listing' | 'ready'>('loading');
  const [f, setF] = useState<ListingFields>(BLANK);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // Their look as saved, and as shown (Your look previews a change before it's saved); their logo's address.
  const [look, setLook] = useState<VendorLook>(DEFAULT_VENDOR_LOOK);
  const [preview, setPreview] = useState<VendorLook | null>(null);
  const [logo, setLogo] = useState<string | undefined>(undefined);
  // Signed out: the sign-in form straight away, without asking for a listing first (no 401 in the console).
  const signedIn = () => (isVendorDemo() ? Promise.resolve(true) : api.session().then((s) => !!s.me));
  const load = () =>
    signedIn()
      .then((yes) => {
        if (!yes) throw new ApiError(401, 'signed_out', 'Please sign in.');
        return directoryApi.mine();
      })
      .then((d) => {
        setData(d);
        const l = d.listing;
        setLook({ ...DEFAULT_VENDOR_LOOK, ...l.look });
        setLogo(l.logo);
        setF({ name: l.name, category: l.category, region: l.region, regions: l.regions, contactName: l.contactName, phone: l.phone, website: l.website, instagram: l.instagram, about: l.about, priceFrom: l.priceFrom, photos: l.photos, packages: l.packages ?? [] });
        setDirty(false);
        setState('ready');
      })
      .catch((e: unknown) => setState(e instanceof ApiError && e.status === 401 ? 'signed_out' : e instanceof ApiError && e.status === 404 ? 'no_listing' : 'signed_out'));
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line
  useEffect(() => {
    if (state === 'ready') {
      void loadCouples();
      // Proposals the couple asked to change: waiting on the vendor (Needs you).
      proposalsApi
        .list()
        .then((r) => setChanges(r.proposals.filter((p) => p.status === 'changes').map((p) => ({ to: p.to, title: p.title, message: p.request?.message ?? '' }))))
        .catch(() => undefined);
    }
  }, [state, tab]); // eslint-disable-line
  const save = async () => {
    setBusy(true);
    setNote('');
    try {
      await directoryApi.save(tidy(f));
      setNote('Saved: couples see it now.');
      await load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading')
    return (
      <Frame title="Your listing">
        <div aria-busy="true" className="py-10" style={{ color: SOFT }}>
          Loading…
        </div>
      </Frame>
    );
  if (state === 'signed_out') return <SignIn onIn={() => void load()} />;
  if (state === 'no_listing')
    return (
      <Frame title="Your listing">
        <div className="pt-10 flex flex-col gap-3 items-start">
          <p className="m-0 text-[18px]">This account doesn’t have a vendor listing.</p>
          <Link to="/vendors/join" style={{ color: INK }}>
            List your business
          </Link>
          <Link to="/admin" style={{ color: INK }}>
            Planning a wedding? Go to your wedding
          </Link>
        </div>
      </Frame>
    );
  const l = data!.listing;
  const unread = data!.enquiries.filter((e) => !e.read).length;
  const setTab = (k: VendorTab) => setParams((p) => {
    const n = new URLSearchParams(p);
    n.set('tab', k);
    n.delete('joined');
    return n;
  }, { replace: true });
  return (
    <VendorShell
      listing={{ name: l.name, slug: l.slug, category: l.category, logo, pending: l.pending, hidden: l.hidden }}
      look={tab === 'look' && preview ? preview : look}
      place={tab}
      go={(k) => {
        if (k !== 'look') setPreview(null);
        setTab(k);
      }}
      badges={{ couples: chatUnread, quotes: couples.quotesOpen, enquiries: unread, proposals: changes.length }}
      onSignOut={() => void api.logout().then(() => setState('signed_out'))}
    >
      {isVendorDemo() && (
        <p role="note" className="mb-4 p-3 rounded-[12px] bg-[#f3ecd6] text-[14px]">
          A sample vendor account: a made-up florist with couples, messages and enquiries. Everything works here, but nothing is saved or sent.
        </p>
      )}
      {l.pending ? (
        <p role="status" className="mb-4 p-4 rounded-[12px] bg-[#f3ecd6] text-[15px]">
          Your listing is under review. We check every new listing before couples can find it in the directory, usually within a day. Meanwhile, add a few photos and your prices: your couples, messages and enquiries all work already.
        </p>
      ) : (
        params.get('joined') && <p className="mb-4 p-4 rounded-[12px] bg-[#e7eedb] text-[15px]">You’re listed. Couples can find you now. Add a few photos and your prices to stand out.</p>
      )}
      {tab === 'look' && (
        <VendorLookPanel
          name={l.name}
          logo={logo}
          saved={look}
          onPreview={setPreview}
          onSaved={(v) => {
            setLook(v);
            setPreview(null);
          }}
          onLogo={setLogo}
        />
      )}
      {tab === 'home' && (
        <div>
          <VendorOverview data={data!} couples={couples.list} unread={couples.unread} quotesOpen={couples.quotesOpen} changes={changes} go={setTab} />
        </div>
      )}
      {tab === 'quotes' && (
        <div>
          <VendorQuotes couples={couples.list} />
        </div>
      )}
      {tab === 'enquiries' && (
        <div>
          <EnquiryPipeline data={data!} couples={couples.list} onChanged={load} />
        </div>
      )}
      {tab === 'proposals' && (
        <div>
          <VendorProposals packages={l.packages ?? []} />
        </div>
      )}
      {tab === 'calendar' && (
        <div>
          <VendorCalendar
            data={data!}
            couples={couples.list}
            onBusy={async (busy) => {
              await directoryApi.setBusy(busy);
              await load();
            }}
          />
        </div>
      )}
      {tab === 'couples' && (
        <div>
          <VendorCouples onUnread={setChatUnread} packages={l.packages ?? []} />
        </div>
      )}
      {tab === 'recommend' && data?.partner && (
        <div className="max-w-[760px]">
          <VendorKit name={l.name} slug={data.listing.slug} code={data.partner.code} percentOff={data.partner.percentOff} uses={data.partner.uses} />
        </div>
      )}
      <div className={`grid gap-8 ${tab === 'listing' ? '' : 'hidden'}`}>
        {tab === 'listing' && (
        <section aria-label="Your listing" className="flex flex-col gap-3 p-5 rounded-[16px] bg-[#fbf8f0] border border-[#e2d7bc]">
          <ListingForm
            key={l.slug}
            value={f}
            onChange={(v) => {
              setF(v);
              setDirty(true);
            }}
          />
          {note && <p className="m-0 text-[15px]">{note}</p>}
          <button type="button" disabled={!dirty || busy} onClick={() => void save()} className={btn} style={{ background: INK, color: '#fbf8f2' }}>
            {busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </section>
        )}
      </div>
    </VendorShell>
  );
}

function SignIn({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  // Forgot your passcode: a link to set a new one is emailed, and lands back in their vendor account.
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState('');
  if (forgot)
    return (
      <Frame title="Vendor sign-in">
        <form
          className="max-w-[440px] mx-auto mt-10 flex flex-col gap-3 p-5 rounded-[16px] bg-[#fbf8f0] border border-[#e2d7bc]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return setProblem('Enter the email you sign in with.');
            setBusy(true);
            setProblem('');
            api
              .forgot(email, 'vendor')
              .then((r) => setSent(r.emailed ? `If there’s an account for ${email.trim()}, a link to set a new passcode is on its way. It works for an hour.` : 'Email isn’t switched on for this site yet, so we can’t send a link. Contact us and we’ll reset it for you.'))
              .catch((err: Error) => setProblem(err.message))
              .finally(() => setBusy(false));
          }}
        >
          <h1 className="m-0 text-[32px] font-normal" style={{ fontFamily: serif }}>
            Forgot your passcode?
          </h1>
          <span className="text-[14px]" style={{ color: SOFT }}>
            We’ll email you a link to set a new one.
          </span>
          <label className="flex flex-col gap-1 text-[14px]">
            Email
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={field} />
          </label>
          {problem && (
            <p role="alert" className="m-0 text-[#7a4a37]">
              {problem}
            </p>
          )}
          {sent ? (
            <p role="status" className="m-0 text-[14px]" style={{ color: INK }}>
              {sent}
            </p>
          ) : (
            <button type="submit" disabled={busy} className={btn} style={{ background: INK, color: '#fbf8f2' }}>
              {busy ? 'Sending…' : 'Email me a link'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setForgot(false);
              setSent('');
              setProblem('');
            }}
            className="self-start py-2 p-0 min-h-[40px] border-0 bg-transparent text-[14px] underline cursor-pointer"
            style={{ color: INK }}
          >
            Back to sign in
          </button>
        </form>
      </Frame>
    );
  return (
    <Frame title="Vendor sign-in">
      <form
        className="max-w-[440px] mx-auto mt-10 flex flex-col gap-3 p-5 rounded-[16px] bg-[#fbf8f0] border border-[#e2d7bc]"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setProblem('');
          api
            .login(email, passcode)
            .then(onIn)
            .catch((err: Error) => setProblem(err.message))
            .finally(() => setBusy(false));
        }}
      >
        <h1 className="m-0 text-[32px] font-normal" style={{ fontFamily: serif }}>
          Vendor sign-in
        </h1>
        <label className="flex flex-col gap-1 text-[14px]">
          Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[14px]">
          Passcode
          <input required type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="current-password" className={field} />
        </label>
        {problem && (
          <p role="alert" className="m-0 text-[#7a4a37]">
            {problem}
          </p>
        )}
        <button type="submit" disabled={busy} className={btn} style={{ background: INK, color: '#fbf8f2' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          onClick={() => {
            setForgot(true);
            setProblem('');
          }}
          className="self-start p-0 min-h-[40px] border-0 bg-transparent text-[14px] underline cursor-pointer"
          style={{ color: INK }}
        >
          Forgot your passcode?
        </button>
        <span className="text-[14px]" style={{ color: SOFT }}>
          Not listed yet?{' '}
          <Link to="/vendors/join" style={{ color: INK }}>
            List your business free
          </Link>
        </span>
      </form>
    </Frame>
  );
}

import { dateIn, RFQ_LINES, rfqDraft, searchKeyOf, tenderAnalysis, tenderRows, TENDER_RATINGS, TENDER_WEIGHTS, Vendor, VENDOR_SEARCH, type Rfq, type RfqLine, type TenderRating } from '@wp/shared';
import { useState } from 'react';
import { useAdmin } from '../Shell';
import { H2, inputCls, Label, Pill, useToast } from '../ui';

/**
 * Wedding planner → Vendors → Quote requests: ask several vendors to price the same thing, line by line
 * (like a tender), and compare what comes back side by side.
 * 1. What for: the service. Its usual lines to price come filled in, and every one can be changed.
 * 2. Who: your vendors for that service are ticked already; add anyone yourself (name, email or mobile),
 *    then or later, from an open request.
 * 3. The email: a standard one for that service, ready to change. Each vendor's copy carries their own
 *    private link, where they price each line (or mark it not included).
 * Then: send by email or text (or copy the link), see who has opened and answered, and compare. Totals are
 * "levelled": a line someone left out counts at the middle price of the others, so like is compared with like.
 */

const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
const newId = () => crypto.randomUUID().slice(0, 12);
const newKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, '-').replace(/\//g, '_');
const plusDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const longDay = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
const SERVICES = Object.entries(VENDOR_SEARCH).filter(([k]) => k !== 'jewellery');
/** A vendor's place on a request: their own private link, nothing sent yet. */
const askOf = (vendorId: string) => ({ vendorId, key: newKey(), sentOn: '', openedOn: '', answeredOn: '', quoteId: '', scores: {} });

export function QuoteRequests({ list, rfqs, onSave, onOpen }: { list: Vendor[]; rfqs: Rfq[]; onSave: (list: Vendor[], rfqs: Rfq[], done?: string) => void; onOpen: (vendorId: string) => void }) {
  const { overview } = useAdmin();
  const [making, setMaking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(rfqs.find((r) => !r.closed)?.id ?? null);
  const today = dateIn(overview?.wedding.timezone);
  const live = rfqs.filter((r) => !r.closed);
  const done = rfqs.filter((r) => r.closed);
  return (
    <section aria-label="Quote requests" className="flex flex-col gap-3 p-4 rounded-[18px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <div>
          <H2>Quote requests</H2>
          <p className="m-0 mt-1 text-[13px] text-[#5b6a52]">Ask several vendors to price the same list, then compare them side by side, like for like.</p>
        </div>
        {!making && (
          <Pill kind="primary" onClick={() => setMaking(true)}>
            + Request quotes
          </Pill>
        )}
      </div>
      {making && (
        <NewRequest
          list={list}
          today={today}
          onCancel={() => setMaking(false)}
          onMake={(rfq, added) => {
            onSave([...list, ...added], [...rfqs, rfq], `Quote request ready: now send it to each vendor`);
            setMaking(false);
            setOpenId(rfq.id);
          }}
        />
      )}
      {[...live, ...done].map((r) => (
        <RequestCard
          key={r.id}
          rfq={r}
          list={list}
          open={openId === r.id}
          onToggle={() => setOpenId(openId === r.id ? null : r.id)}
          onChange={(next, nextList, msg) => onSave(nextList ?? list, rfqs.map((x) => (x.id === r.id ? next : x)), msg)}
          onDelete={() => onSave(list, rfqs.filter((x) => x.id !== r.id), 'Quote request removed (quotes already in stay with each vendor)')}
          onOpenVendor={onOpen}
        />
      ))}
      {!rfqs.length && !making && <p className="m-0 text-[14px] text-[#5b6a52]">No quote requests yet.</p>}
    </section>
  );
}

/** Making a request, step by step. */
function NewRequest({ list, today, onCancel, onMake }: { list: Vendor[]; today: string; onCancel: () => void; onMake: (rfq: Rfq, added: Vendor[]) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [service, setService] = useState('photographer');
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState<RfqLine[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<Vendor[]>([]);
  const [due, setDue] = useState(plusDays(today, 14));
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const label = VENDOR_SEARCH[service]?.label ?? 'Something else';
  const all = [...list, ...extra];
  const matching = all.filter((v) => searchKeyOf(`${v.category} ${v.name}`) === service);
  const others = all.filter((v) => !matching.includes(v) && v.status !== 'declined');

  const toStep2 = () => {
    setLines((RFQ_LINES[service] ?? RFQ_LINES['']!).map((l) => ({ id: newId(), label: l, detail: '' })));
    setTitle(`${label.replace(/s$/, '').replace(/ and .*/, '')} quotes`);
    setPicked(new Set(all.filter((v) => searchKeyOf(`${v.category} ${v.name}`) === service && v.status !== 'declined').map((v) => v.id)));
    const d = rfqDraft(service);
    setSubject(d.subject);
    setMessage(d.message);
    setStep(2);
  };
  const make = () => {
    const ls = lines.filter((l) => l.label.trim());
    if (!ls.length) return setProblem('Add at least one thing to price.');
    if (!picked.size) return setProblem('Choose at least one vendor to ask.');
    onMake(
      {
        id: newId(),
        title: title.trim().slice(0, 120),
        service,
        lines: ls.map((l) => ({ ...l, label: l.label.trim().slice(0, 160) })),
        due,
        subject: subject.slice(0, 200),
        message: message.slice(0, 4000),
        vendors: [...picked].map(askOf),
        createdOn: today,
        closed: false,
        budget: 0,
      },
      extra.filter((v) => picked.has(v.id)),
    );
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-[14px] bg-white border border-[#e2d7bc]">
      <div className="flex gap-2 items-center text-[13px] text-[#5b6a52]">
        {['What for', 'What to price and who', 'The email'].map((s, i) => (
          <span key={s} className={`py-[3px] px-3 rounded-full ${step === i + 1 ? 'bg-[#33402f] text-[#fbf8f0]' : 'bg-[#efe7d3]'}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {step === 1 && (
        <>
          <Label text="What do you need quotes for?">
            <select value={service} onChange={(e) => setService(e.target.value)} className={inputCls}>
              {SERVICES.map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
              <option value="">Something else</option>
            </select>
          </Label>
          <div className="flex gap-2">
            <Pill kind="primary" onClick={toStep2}>
              Next
            </Pill>
            <Pill onClick={onCancel}>Cancel</Pill>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Label text="Name">
            <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </Label>
          <div className="flex flex-col gap-2">
            <strong className="text-[14px] font-semibold">What to price</strong>
            <span className="text-[13px] text-[#5b6a52]">The usual for {label.toLowerCase()}: change, add or remove anything. Vendors price each line, or say it isn’t included.</span>
            {lines.map((l, i) => (
              <div key={l.id} className="flex gap-2 items-start flex-wrap">
                <input value={l.label} maxLength={160} aria-label={`Line ${i + 1}`} onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))} className={`${inputCls} flex-1 min-w-[180px]`} />
                <input value={l.detail} maxLength={400} placeholder="Details (optional)" aria-label={`Line ${i + 1} details`} onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, detail: e.target.value } : x)))} className={`${inputCls} flex-1 min-w-[180px]`} />
                <Pill size="sm" aria-label={`Remove ${l.label}`} onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>
                  Remove
                </Pill>
              </div>
            ))}
            {lines.length < 40 && (
              <Pill size="sm" className="self-start" onClick={() => setLines([...lines, { id: newId(), label: '', detail: '' }])}>
                + Add a line
              </Pill>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <strong className="text-[14px] font-semibold">Who to ask</strong>
            {[...matching, ...others].map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-[14px] cursor-pointer">
                <input type="checkbox" checked={picked.has(v.id)} onChange={(e) => setPicked((p) => (e.target.checked ? new Set([...p, v.id]) : new Set([...p].filter((x) => x !== v.id))))} className="w-[16px] h-[16px] accent-[#5d6b47]" />
                <span>
                  {v.name}
                  <span className="text-[#7a7466]">{[v.category, v.email || v.phone || 'no email or mobile yet'].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
                </span>
              </label>
            ))}
            <AddVendor
              category={label.replace(/s$/, '')}
              onAdd={(v) => {
                setExtra([...extra, v]);
                setPicked(new Set([...picked, v.id]));
              }}
            />
          </div>
          {problem && <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">{problem}</p>}
          <div className="flex gap-2">
            <Pill onClick={() => setStep(1)}>Back</Pill>
            <Pill
              kind="primary"
              onClick={() => {
                setProblem('');
                if (!lines.some((l) => l.label.trim())) return setProblem('Add at least one thing to price.');
                if (!picked.size) return setProblem('Choose at least one vendor to ask.');
                setStep(3);
              }}
            >
              Next: the email
            </Pill>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Label text="Quotes wanted by">
            <input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className={`${inputCls} max-w-[200px]`} />
          </Label>
          <Label text="Subject">
            <input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
          </Label>
          <Label text="Message">
            <textarea rows={12} value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} className={inputCls} />
          </Label>
          <span className="text-[13px] text-[#5b6a52]">Filled in for each vendor: {'{couple}'} {'{date}'} {'{venue}'} {'{guests}'} {'{due}'}, and {'{link}'}, their own page to price each line.</span>
          {problem && <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">{problem}</p>}
          <div className="flex gap-2">
            <Pill onClick={() => setStep(2)}>Back</Pill>
            <Pill
              kind="primary"
              onClick={() => {
                if (!message.includes('{link}')) return setProblem('Keep {link} in the message: it’s where each vendor prices the list.');
                make();
              }}
            >
              Make the request
            </Pill>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Add a vendor yourself (any florist, band or venue, in the directory or not): their name and an email or
 * mobile to send the request to. They join your vendor list too. Optionally pick one already in your list.
 */
function AddVendor({ category, onAdd, existing = [], onPick }: { category: string; onAdd: (v: Vendor) => void; existing?: Vendor[]; onPick?: (v: Vendor) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [problem, setProblem] = useState('');
  const add = () => {
    setProblem('');
    if (!name.trim()) return setProblem('Add their name.');
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setProblem('That email doesn’t look right.');
    if (!email.trim() && !phone.trim()) return setProblem('Add an email or a mobile, so the request can reach them.');
    onAdd(Vendor.parse({ id: newId(), name: name.trim().slice(0, 120), category, status: 'requested', phone: phone.trim().slice(0, 40), email: email.trim().slice(0, 120) }));
    setName('');
    setEmail('');
    setPhone('');
  };
  return (
    <div className="flex flex-col gap-2 p-3 mt-1 rounded-[12px] border border-dashed border-[#c6b794] bg-[#fbf8f0]">
      <strong className="text-[14px] font-semibold">Add a vendor yourself</strong>
      <span className="text-[13px] text-[#5b6a52]">Anyone you’d like a quote from. They’re added to your vendor list too.</span>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,.8fr)_auto] items-end">
        <Label text="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wildflower Studio" aria-label="New vendor name" className={inputCls} />
        </Label>
        <Label text="Email">
          <input value={email} type="email" onChange={(e) => setEmail(e.target.value)} placeholder="hello@…" aria-label="New vendor email" className={inputCls} />
        </Label>
        <Label text="Mobile">
          <input value={phone} type="tel" onChange={(e) => setPhone(e.target.value)} placeholder="04xx xxx xxx" aria-label="New vendor mobile" className={inputCls} />
        </Label>
        <Pill kind="primary" size="sm" onClick={add}>
          Add
        </Pill>
      </div>
      {existing.length > 0 && onPick && (
        <Label text="Or choose one already in your list">
          <select
            value=""
            aria-label="Choose from your vendors"
            onChange={(e) => {
              const v = existing.find((x) => x.id === e.target.value);
              if (v) onPick(v);
            }}
            className={inputCls}
          >
            <option value="">Choose…</option>
            {existing.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.category ? ` · ${v.category}` : ''}
              </option>
            ))}
          </select>
        </Label>
      )}
      {problem && (
        <span role="alert" className="text-[13px] text-[#7a4a37]">
          {problem}
        </span>
      )}
    </div>
  );
}

/** One request: who has it, sending, and the comparison. */
function RequestCard({
  rfq,
  list,
  open,
  onToggle,
  onChange,
  onDelete,
  onOpenVendor,
}: {
  rfq: Rfq;
  list: Vendor[];
  open: boolean;
  onToggle: () => void;
  onChange: (next: Rfq, list?: Vendor[], msg?: string) => void;
  onDelete: () => void;
  onOpenVendor: (id: string) => void;
}) {
  const { overview } = useAdmin();
  const toast = useToast();
  const today = dateIn(overview?.wedding.timezone);
  const answered = rfq.vendors.filter((v) => v.answeredOn).length;
  const ev = overview?.events[0];
  const first = (s = '') => s.split(' ')[0] ?? '';
  const couple = `${first(overview?.wedding.name1)} & ${first(overview?.wedding.name2)}`;
  const guests = overview?.perEvent?.find((e) => e.key === ev?.key)?.invited ?? 0;
  const linkOf = (key: string) => `${window.location.origin}/w/${overview?.wedding.slug ?? ''}/quote?k=${key}`;
  const fill = (t: string, key: string) =>
    t
      .replace(/\{couple\}/g, couple)
      .replace(/\{date\}/g, ev ? new Date(ev.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: overview?.wedding.timezone }) : 'our wedding day')
      .replace(/\{venue\}/g, ev?.venue || 'our venue')
      .replace(/\{guests\}/g, guests ? String(guests) : 'our')
      .replace(/\{due\}/g, longDay(rfq.due) || 'soon')
      .replace(/\{link\}/g, linkOf(key));
  const markSent = (vendorId: string) => {
    if (rfq.vendors.find((v) => v.vendorId === vendorId)?.sentOn) return;
    onChange(
      { ...rfq, vendors: rfq.vendors.map((v) => (v.vendorId === vendorId ? { ...v, sentOn: today } : v)) },
      // The quote tracker knows they've been asked, and when the quote is due.
      list.map((v): Vendor => (v.id === vendorId ? { ...v, status: v.status === 'idea' || v.status === 'contacted' ? 'requested' : v.status, askedOn: v.askedOn || today, quoteBy: v.quoteBy || rfq.due } : v)),
    );
  };
  const cmp = tenderAnalysis(rfq, list);
  const book = (vendorId: string) => {
    const col = cmp.cols.find((c) => c.v.id === vendorId);
    if (!col?.q) return;
    const others = cmp.cols.filter((c) => c.v.id !== vendorId && c.v.status !== 'booked');
    if (!window.confirm(`Book ${col.v.name} at ${aud(col.q.amount)}? ${others.length ? `The others (${others.map((c) => c.v.name).join(', ')}) are marked "went with someone else".` : ''}`)) return;
    onChange(
      { ...rfq, closed: true },
      list.map((v): Vendor =>
        v.id === vendorId
          ? { ...v, status: 'booked', accepted: col.q!.id }
          : others.some((c) => c.v.id === v.id)
            ? { ...v, status: 'declined', declinedWhy: v.declinedWhy || `Went with ${col.v.name}` }
            : v,
      ),
      `${col.v.name} booked: their payments are in Payments`,
    );
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-[14px] bg-white border border-[#e2d7bc]">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex justify-between items-baseline gap-3 flex-wrap p-0 border-0 bg-transparent text-left cursor-pointer text-[#33402f]">
        <span className="text-[16px] font-semibold">
          {rfq.title || 'Quote request'}
          {rfq.closed && <span className="ml-2 py-[1px] px-2 rounded-full text-[11px] bg-[#dfe5cc] text-[#3d4a2f] align-middle">Decided</span>}
        </span>
        <span className="text-[13px] text-[#5b6a52]">
          {answered} of {rfq.vendors.length} quoted{rfq.due && !rfq.closed ? ` · by ${longDay(rfq.due)}` : ''} {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <>
          <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#efe6d0]">
            {rfq.vendors.map((rv) => {
              const v = list.find((x) => x.id === rv.vendorId);
              if (!v) return null;
              const state = rv.answeredOn ? `Quoted ${longDay(rv.answeredOn)}` : rv.openedOn ? `Opened ${longDay(rv.openedOn)}` : rv.sentOn ? `Sent ${longDay(rv.sentOn)}` : 'Not sent yet';
              const mail = `mailto:${encodeURIComponent(v.email)}?subject=${encodeURIComponent(fill(rfq.subject, rv.key))}&body=${encodeURIComponent(fill(rfq.message, rv.key))}`;
              const sms = `sms:${v.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(`Hi, it's ${couple}. We'd love a quote for our wedding: you can price it here ${linkOf(rv.key)}`)}`;
              return (
                <li key={rv.vendorId} className="py-2 flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-[180px]">
                    <button type="button" onClick={() => onOpenVendor(v.id)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f] text-[15px]">
                      {v.name}
                    </button>
                    <span className={`block text-[12px] ${rv.answeredOn ? 'text-[#3d4a2f] font-semibold' : 'text-[#7a7466]'}`}>{state}</span>
                  </span>
                  {!rfq.closed && (
                    <>
                      {v.email && (
                        <a href={mail} onClick={() => markSent(v.id)} className="py-[5px] px-3 rounded-full border border-[#c6b794] text-[12px] no-underline !text-[#33402f] hover:bg-[#efe7d3]">
                          Email
                        </a>
                      )}
                      {v.phone && (
                        <a href={sms} onClick={() => markSent(v.id)} className="py-[5px] px-3 rounded-full border border-[#c6b794] text-[12px] no-underline !text-[#33402f] hover:bg-[#efe7d3]">
                          Text
                        </a>
                      )}
                      <Pill
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(fill(rfq.message, rv.key));
                            toast('Email copied: paste it into your own email');
                            markSent(v.id);
                          } catch {
                            window.prompt('Copy this link', linkOf(rv.key));
                          }
                        }}
                      >
                        Copy email
                      </Pill>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {!rfq.closed && rfq.vendors.length < 20 && (
            <AddVendor
              category={VENDOR_SEARCH[rfq.service]?.label.replace(/s$/, '') ?? ''}
              existing={list.filter((v) => !rfq.vendors.some((rv) => rv.vendorId === v.id))}
              onAdd={(v) => onChange({ ...rfq, vendors: [...rfq.vendors, askOf(v.id)] }, [...list, v], `${v.name} added: send them the request`)}
              onPick={(v) => onChange({ ...rfq, vendors: [...rfq.vendors, askOf(v.id)] }, undefined, `${v.name} added: send them the request`)}
            />
          )}
          {cmp.cols.some((c) => c.q) ? <Comparison rfq={rfq} cmp={cmp} onBook={book} onChange={(next, msg) => onChange(next, undefined, msg)} /> : <p className="m-0 text-[13px] text-[#5b6a52]">Quotes appear here side by side as vendors answer.</p>}
          <div className="flex gap-3 text-[13px] pt-1">
            {!rfq.closed && (
              <button type="button" onClick={() => onChange({ ...rfq, closed: true }, undefined, 'Request closed: vendors can no longer change their quotes')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                Close without booking
              </button>
            )}
            <button type="button" onClick={() => window.confirm('Remove this request? Quotes already in stay with each vendor.') && onDelete()} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]">
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The tender comparison: a column per vendor, a row per line with its low, median and high, and every price
 * coloured by how far it sits from the median (green lowest, amber 15%+ over, red 40%+ over). Then the
 * totals, like for like, how far each is from the best and from your budget, your own ratings and the
 * weighted score with a rank, a one-line recommendation, and an export.
 */
function Comparison({ rfq, cmp, onBook, onChange }: { rfq: Rfq; cmp: ReturnType<typeof tenderAnalysis>; onBook: (vendorId: string) => void; onChange: (next: Rfq, msg?: string) => void }) {
  const cell = 'py-2 px-3 border-b border-[#efe6d0] text-right whitespace-nowrap';
  const label = 'py-2 px-3 border-b border-[#efe6d0] sticky left-0 bg-white text-left';
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${aud(Math.abs(n))}`;
  const quoted = cmp.vendors.filter((_, i) => cmp.cols[i]!.q).length;
  const rate = (vendorId: string, k: TenderRating, v: number) =>
    onChange({ ...rfq, vendors: rfq.vendors.map((rv) => (rv.vendorId === vendorId ? { ...rv, scores: { ...rv.scores, [k]: v || undefined } } : rv)) });
  const exportCsv = () => {
    const rows = tenderRows(cmp);
    const csv = rows.map((r) => r.map((x) => (typeof x === 'number' ? String(x) : `"${String(x).replace(/"/g, '""')}"`)).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${(rfq.title || 'quotes').replace(/[^\w ]+/g, '').trim() || 'quotes'} comparison.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const best = cmp.bestValue;
  const top = cmp.topScore;
  return (
    <div className="flex flex-col gap-3">
      {quoted > 0 && (
        <div className="flex flex-col gap-1 p-3 rounded-[12px] bg-[#eef1e4] text-[14px] text-[#3d4a2f]">
          {best && (
            <span>
              <strong className="font-semibold">Best value: {best.name}</strong>, {aud(cmp.best!)} like for like
              {cmp.vendors.filter((v) => v.vsBest !== null && v.vsBest > 0).length
                ? `, ${aud(Math.min(...cmp.vendors.filter((v) => v.vsBest !== null && v.vsBest > 0).map((v) => v.vsBest!)))} less than the next`
                : ''}
              .
            </span>
          )}
          {top && top.id !== best?.id && (
            <span>
              <strong className="font-semibold">Highest score: {top.name}</strong> ({top.score}/10), when your ratings count too.
            </span>
          )}
          {quoted < cmp.cols.length && <span className="text-[13px]">Still waiting on {cmp.cols.length - quoted} of {cmp.cols.length}.</span>}
        </div>
      )}
      <div className="flex gap-3 items-end flex-wrap">
        <Label text="Your budget for this">
          <input
            type="number"
            min={0}
            step={50}
            value={rfq.budget || ''}
            placeholder="e.g. 3500"
            onChange={(e) => onChange({ ...rfq, budget: Math.max(0, Number(e.target.value) || 0) })}
            className={`${inputCls} max-w-[160px]`}
          />
        </Label>
        <Pill size="sm" onClick={exportCsv}>
          Export the comparison
        </Pill>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="py-2 px-3 text-left font-semibold border-b border-[#d3c6a4] sticky left-0 bg-white">What</th>
              {cmp.cols.map((c, i) => (
                <th key={c.v.id} className="py-2 px-3 text-right font-semibold border-b border-[#d3c6a4]">
                  {c.v.name}
                  {cmp.vendors[i]!.rank > 0 && <span className="block text-[11px] font-normal text-[#5b6a52]">#{cmp.vendors[i]!.rank}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((r) => (
              <tr key={r.line.id}>
                <td className={label}>
                  {r.line.label}
                  {r.lo !== null && r.hi !== null && r.lo !== r.hi && (
                    <span className="block text-[11px] text-[#7a7466]">
                      {aud(r.lo)} to {aud(r.hi)} · middle {aud(r.mid)}
                    </span>
                  )}
                </td>
                {r.prices.map((p, i) => {
                  const q = cmp.cols[i]!.q;
                  const v = r.variance[i] ?? null;
                  const style =
                    p !== null && p === r.low
                      ? { background: '#e6ecd8', fontWeight: 600 }
                      : !q
                        ? { color: '#9a9284' }
                        : p === null
                          ? { color: '#8a5a1f', background: '#f7eedb' }
                          : v !== null && v >= 40
                            ? { background: '#f6e2db', color: '#8a3f2b' }
                            : v !== null && v >= 15
                              ? { background: '#fbf0dc', color: '#7a5a1f' }
                              : undefined;
                  return (
                    <td key={i} className={cell} style={style}>
                      {!q ? '—' : p === null ? 'Not included' : aud(p)}
                      {q && p !== null && v !== null && v !== 0 && r.prices.filter((x) => x !== null).length > 1 && (
                        <span className="block text-[11px] font-normal opacity-80">
                          {v > 0 ? '+' : ''}
                          {v}%
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className={`${label} font-semibold`}>Their total</td>
              {cmp.totals.map((t, i) => (
                <td key={i} className={`${cell} font-semibold`}>
                  {t.quoted === null ? '—' : aud(t.quoted)}
                </td>
              ))}
            </tr>
            <tr>
              <td className={label} title="A line someone left out counts at the middle price of the others">
                Like for like
              </td>
              {cmp.totals.map((t, i) => (
                <td key={i} className={cell} style={t.levelled !== null && t.levelled === cmp.best ? { background: '#e6ecd8', fontWeight: 700 } : undefined}>
                  {t.levelled === null ? '—' : aud(t.levelled)}
                  {t.levelled !== null && t.missing > 0 && <span className="block text-[11px] text-[#8a5a1f] font-normal">{t.missing} not included</span>}
                </td>
              ))}
            </tr>
            <tr>
              <td className={label}>Above the best</td>
              {cmp.vendors.map((v, i) => (
                <td key={i} className={cell}>
                  {v.vsBest === null ? '—' : v.vsBest === 0 ? 'Best' : `${signed(v.vsBest)} (${v.vsBestPct}%)`}
                </td>
              ))}
            </tr>
            {rfq.budget > 0 && (
              <tr>
                <td className={label}>Against your budget</td>
                {cmp.vendors.map((v, i) => (
                  <td key={i} className={cell} style={v.vsBudget !== null ? { color: v.vsBudget > 0 ? '#8a3f2b' : '#3d4a2f' } : undefined}>
                    {v.vsBudget === null ? '—' : v.vsBudget > 0 ? `${aud(v.vsBudget)} over` : `${aud(-v.vsBudget)} under`}
                  </td>
                ))}
              </tr>
            )}
            <tr>
              <td className={label}>Cheapest on</td>
              {cmp.vendors.map((v, i) => (
                <td key={i} className={cell}>
                  {cmp.cols[i]!.q ? `${v.lowestOn} of ${cmp.rows.length} lines` : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td className={label}>Deposit</td>
              {cmp.cols.map((c, i) => (
                <td key={i} className={cell}>
                  {c.q ? aud(c.q.deposit) : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td className={label}>Price holds until</td>
              {cmp.cols.map((c, i) => (
                <td key={i} className={cell}>
                  {c.q?.validUntil ? longDay(c.q.validUntil) : '—'}
                </td>
              ))}
            </tr>
            {TENDER_RATINGS.map((k) => (
              <tr key={k.key}>
                <td className={label} title={k.hint}>
                  Your rating: {k.label.toLowerCase()}
                  <span className="block text-[11px] text-[#7a7466]">{k.hint}</span>
                </td>
                {cmp.cols.map((c) => (
                  <td key={c.v.id} className={cell}>
                    <select
                      aria-label={`${k.label} for ${c.v.name}`}
                      value={c.rv.scores?.[k.key] ?? 0}
                      disabled={rfq.closed}
                      onChange={(e) => rate(c.v.id, k.key, Number(e.target.value))}
                      className="py-1 px-2 rounded-[8px] border border-[#d3c6a4] bg-white text-[13px]"
                    >
                      <option value={0}>–</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {'★'.repeat(n)}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className={`${label} font-semibold`} title={`Price ${TENDER_WEIGHTS.price}%, quality, service and feel ${TENDER_WEIGHTS.quality}% each (a rating left out doesn't count)`}>
                Score
                <span className="block text-[11px] font-normal text-[#7a7466]">Price {TENDER_WEIGHTS.price}%, your ratings {100 - TENDER_WEIGHTS.price}%</span>
              </td>
              {cmp.vendors.map((v, i) => (
                <td key={i} className={`${cell} font-semibold`} style={v.rank === 1 ? { background: '#e6ecd8' } : undefined}>
                  {v.score === null ? '—' : `${v.score}/10`}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 px-3 sticky left-0 bg-white align-top">Included / not</td>
              {cmp.cols.map((c, i) => (
                <td key={i} className="py-2 px-3 border-b border-[#efe6d0] text-left align-top min-w-[160px] whitespace-pre-wrap text-[12px]">
                  {c.q ? [c.q.includes && `✓ ${c.q.includes}`, c.q.excludes && `✗ ${c.q.excludes}`, c.q.notes].filter(Boolean).join('\n\n') || '—' : '—'}
                </td>
              ))}
            </tr>
            {!rfq.closed && (
              <tr>
                <td className="sticky left-0 bg-white" />
                {cmp.cols.map((c, i) => (
                  <td key={i} className="py-2 px-3 text-right">
                    {c.q && (
                      <Pill size="sm" kind={cmp.vendors[i]!.rank === 1 || (cmp.vendors.every((v) => v.rank === 0) && cmp.totals[i]!.levelled === cmp.best) ? 'primary' : 'secondary'} onClick={() => onBook(c.v.id)}>
                        Book them
                      </Pill>
                    )}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

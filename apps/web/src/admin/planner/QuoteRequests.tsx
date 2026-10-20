import { compareRfq, dateIn, RFQ_LINES, rfqDraft, searchKeyOf, Vendor, VENDOR_SEARCH, type Rfq, type RfqLine } from '@wp/shared';
import { useState } from 'react';
import { useAdmin } from '../Shell';
import { H2, inputCls, Label, Pill, useToast } from '../ui';

/**
 * Wedding planner → Vendors → Quote requests: ask several vendors to price the same thing, line by line
 * (like a tender), and compare what comes back side by side.
 * 1. What for: the service. Its usual lines to price come filled in, and every one can be changed.
 * 2. Who: your vendors for that service are ticked already; add others as you go.
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
        vendors: [...picked].map((vendorId) => ({ vendorId, key: newKey(), sentOn: '', openedOn: '', answeredOn: '', quoteId: '' })),
        createdOn: today,
        closed: false,
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

function AddVendor({ category, onAdd }: { category: string; onAdd: (v: Vendor) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const add = () => {
    if (!name.trim()) return;
    onAdd(Vendor.parse({ id: newId(), name: name.trim().slice(0, 120), category, status: 'requested', phone: phone.trim().slice(0, 40), email: email.trim().slice(0, 120) }));
    setName('');
    setEmail('');
    setPhone('');
  };
  return (
    <div className="flex gap-2 flex-wrap items-end pt-1">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add another: name" aria-label="New vendor name" className={`${inputCls} flex-1 min-w-[150px]`} />
      <input value={email} type="email" onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="New vendor email" className={`${inputCls} flex-1 min-w-[150px]`} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile" aria-label="New vendor mobile" className={`${inputCls} w-[130px]`} />
      <Pill size="sm" disabled={!name.trim()} onClick={add}>
        Add
      </Pill>
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
  const cmp = compareRfq(rfq, list);
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
          {cmp.cols.some((c) => c.q) ? <Comparison rfq={rfq} cmp={cmp} onBook={book} /> : <p className="m-0 text-[13px] text-[#5b6a52]">Quotes appear here side by side as vendors answer.</p>}
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

/** The side-by-side table: a column per vendor, a row per line, the lowest price per line marked. */
function Comparison({ rfq, cmp, onBook }: { rfq: Rfq; cmp: ReturnType<typeof compareRfq>; onBook: (vendorId: string) => void }) {
  const cell = 'py-2 px-3 border-b border-[#efe6d0] text-right whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="py-2 px-3 text-left font-semibold border-b border-[#d3c6a4] sticky left-0 bg-white">What</th>
            {cmp.cols.map((c) => (
              <th key={c.v.id} className="py-2 px-3 text-right font-semibold border-b border-[#d3c6a4]">
                {c.v.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cmp.rows.map((r) => (
            <tr key={r.line.id}>
              <td className="py-2 px-3 border-b border-[#efe6d0] sticky left-0 bg-white">{r.line.label}</td>
              {r.prices.map((p, i) => {
                const q = cmp.cols[i]!.q;
                return (
                  <td key={i} className={cell} style={p !== null && p === r.low ? { background: '#e6ecd8', fontWeight: 600 } : !q ? { color: '#9a9284' } : p === null ? { color: '#8a5a1f', background: '#f7eedb' } : undefined}>
                    {!q ? '—' : p === null ? 'Not included' : aud(p)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="py-2 px-3 font-semibold sticky left-0 bg-white">Their total</td>
            {cmp.totals.map((t, i) => (
              <td key={i} className={`${cell} font-semibold`}>
                {t.quoted === null ? '—' : aud(t.quoted)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 px-3 sticky left-0 bg-white" title="A line someone left out counts at the middle price of the others">
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
            <td className="py-2 px-3 sticky left-0 bg-white">Deposit</td>
            {cmp.cols.map((c, i) => (
              <td key={i} className={cell}>
                {c.q ? aud(c.q.deposit) : '—'}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 px-3 sticky left-0 bg-white">Price holds until</td>
            {cmp.cols.map((c, i) => (
              <td key={i} className={cell}>
                {c.q?.validUntil ? longDay(c.q.validUntil) : '—'}
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
                    <Pill size="sm" kind={cmp.totals[i]!.levelled === cmp.best ? 'primary' : 'secondary'} onClick={() => onBook(c.v.id)}>
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
  );
}

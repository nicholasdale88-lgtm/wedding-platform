import { awaitingReply, beforeOf, dateIn, NEGOTIATION_TIPS, negotiationPlan, negotiationPoints, nextFollowUp, Quote, RFQ_LINES, rfqStage, rfqDraft, searchKeyOf, tenderAnalysis, tenderRows, TENDER_RATINGS, TENDER_WEIGHTS, Vendor, VENDOR_SEARCH, type Rfq, type RfqLine, type RfqVendor, type TenderRating } from '@wp/shared';
import { useEffect, useState } from 'react';
import { plannerApi } from '../../lib/api';
import { useAdmin } from '../Shell';
import { inputCls, Label, Pill, useToast } from '../ui';
import { QuoteFile } from './QuoteFile';

/**
 * Wedding planner → Vendors → Get quotes: ask a few vendors to price the same list (like a tender) and
 * compare what comes back, like for like.
 * - Making one is a single screen: tap the service, and who to ask, the usual things to price, the date
 *   and the email are all filled in (each can be changed, but needn't be). One button sends it: by email
 *   from the site when that's set up (replies come to you), else from your own email, a text, or a link.
 * - Each vendor gets their own page: they price each line, or give one total and attach their own quote,
 *   or say they can't. You get an email as each one comes in. Quotes that arrive some other way (an email
 *   with a PDF) are added in a tap: drop the PDF and type the total.
 * - Or enter the quotes yourself (ones you already have, by phone or email): the same screen without the
 *   email, then type each vendor's quote in (one total or item by item, with the PDF), and the same
 *   comparison. Any vendor can still be sent their link later.
 * - Each request walks through four steps, shown at the top: 1 Get quotes, 2 Compare, 3 Negotiate (what to
 *   raise with each vendor, worked out from the comparison, with a message ready to send, and their new
 *   price recorded: what you saved), 4 Lock in (book, then the deposit, the contract and a kind note to
 *   the others). It opens on the step you're at; any step can be looked at.
 * - The comparison leads with a card per vendor, best first: the like-for-like total (a line someone left
 *   out counts at the middle price of the others), what's in and out, the deposit, your star ratings and a
 *   Book button. The full line-by-line table is one tap away, with an export.
 */

const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
const newId = () => crypto.randomUUID().slice(0, 12);
const newKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, '-').replace(/\//g, '_');
const plusDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const longDay = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const SERVICES = Object.entries(VENDOR_SEARCH).filter(([k]) => k !== 'jewellery');
/** A vendor's place on a request: their own private link, nothing sent yet. */
const askOf = (vendorId: string): RfqVendor => ({ vendorId, key: newKey(), sentOn: '', openedOn: '', answeredOn: '', quoteId: '', remindedOn: '', negotiatedOn: '', followUps: 0, declinedOn: '', declinedWhy: '', scores: {} });
const small = 'py-[6px] px-3 rounded-full border border-[#c6b794] bg-white text-[13px] cursor-pointer no-underline !text-[#33402f] hover:bg-[#efe7d3] whitespace-nowrap';

type Save = (list: Vendor[], rfqs: Rfq[], done?: string) => Promise<boolean>;

/** Email from the site: on when the site's email is set up (asked once per visit). */
let emailCache: Promise<boolean> | null = null;
function useSiteEmail() {
  const { wid } = useAdmin();
  const [on, setOn] = useState(false);
  useEffect(() => {
    emailCache ??= plannerApi.rfqEmail(wid).then((r) => r.on, () => false);
    void emailCache.then(setOn);
  }, [wid]);
  return on;
}

export function QuoteRequests({ list, rfqs, onSave, onReload, onOpen }: { list: Vendor[]; rfqs: Rfq[]; onSave: Save; onReload: () => Promise<void>; onOpen: (vendorId: string) => void }) {
  const { overview, wid } = useAdmin();
  const toast = useToast();
  const siteEmail = useSiteEmail();
  const [making, setMaking] = useState<false | 'ask' | 'manual'>(false);
  const [openId, setOpenId] = useState<string | null>(rfqs.find((r) => !r.closed)?.id ?? null);
  const today = dateIn(overview?.wedding.timezone);
  const live = rfqs.filter((r) => !r.closed);
  const done = rfqs.filter((r) => r.closed);

  /** Emails the request from the site to these vendors (those with an email), then shows what changed. */
  const sendNow = async (rfqId: string, vendorIds: string[], remind = false) => {
    try {
      const r = await plannerApi.sendRfq(wid, rfqId, vendorIds, remind);
      await onReload();
      const names = (ids: string[]) => ids.map((id) => list.find((v) => v.id === id)?.name ?? '').filter(Boolean).join(', ');
      if (r.sent.length) toast(`${remind ? 'Reminder sent' : 'Sent'} to ${names(r.sent)}${r.skipped.length ? `. No email for ${names(r.skipped)}: text or copy their link` : ''}`);
      else if (r.skipped.length) toast(`No email for ${names(r.skipped)}: text them or copy their link instead`);
      else toast('Nothing to send: they’ve all answered');
      return r;
    } catch (e) {
      toast((e as Error).message);
      return null;
    }
  };

  return (
    <section aria-label="Get quotes" className="flex flex-col gap-3 p-4 rounded-[18px] border border-[#e2d7bc] bg-[#fbf8f0]">
      {/* Phones: the heading and words take the full width, the two buttons share a row under them. */}
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="w-full lg:w-auto lg:flex-1 min-w-0">
          <h2 className="m-0 font-display text-[26px] leading-tight font-medium">Get quotes</h2>
          <p className="m-0 mt-1 text-[14px] text-[#5b6a52]">Send one list to a few vendors. They price it on a simple page or attach their own quote, you get an email as each comes in, and you see them side by side.</p>
        </div>
        {!making && (
          <div className="grid grid-cols-2 gap-2 w-full lg:w-auto lg:flex">
            <Pill kind="primary" className="px-3" onClick={() => setMaking('ask')}>
              + Get quotes
            </Pill>
            <Pill className="px-3" onClick={() => setMaking('manual')}>
              + Enter myself
            </Pill>
          </div>
        )}
      </div>
      {!rfqs.length && !making && (
        <ol className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3">
          {[
            ['Pick what for', 'Florist, photographer, caterer… The usual things to price are filled in.'],
            ['Send it, or type them in', 'Vendors price it on their own link. Already have quotes? Enter them yourself.'],
            ['Compare and book', 'Best value first, like for like. Book in a tap.'],
          ].map(([h, t], i) => (
            <li key={h} className="flex gap-3 p-3 rounded-[12px] bg-white border border-[#ece3cd]">
              <span aria-hidden className="flex-none w-7 h-7 rounded-full bg-[#33402f] text-[#fbf8f0] flex items-center justify-center text-[14px] font-semibold">
                {i + 1}
              </span>
              <span className="text-[13px] text-[#5b6a52]">
                <strong className="block text-[14px] text-[#33402f]">{h}</strong>
                {t}
              </span>
            </li>
          ))}
        </ol>
      )}
      {making && (
        <NewRequest
          list={list}
          today={today}
          manual={making === 'manual'}
          siteEmail={siteEmail}
          onCancel={() => setMaking(false)}
          onMake={async (rfq, nextList, sendTo) => {
            const ok = await onSave(nextList, [...rfqs, rfq], sendTo.length ? undefined : rfq.manual ? 'Ready: enter each vendor’s quote below' : 'Request ready: send it to each vendor below');
            if (!ok) return false;
            setMaking(false);
            setOpenId(rfq.id);
            if (sendTo.length) await sendNow(rfq.id, sendTo);
            return true;
          }}
        />
      )}
      {[...live, ...done].map((r) => (
        <RequestCard
          key={r.id}
          rfq={r}
          list={list}
          today={today}
          siteEmail={siteEmail}
          open={openId === r.id}
          onToggle={() => setOpenId(openId === r.id ? null : r.id)}
          onChange={(next, nextList, msg) => onSave(nextList ?? list, rfqs.map((x) => (x.id === r.id ? next : x)), msg)}
          onSend={(ids, remind) => sendNow(r.id, ids, remind)}
          onDelete={() => void onSave(list, rfqs.filter((x) => x.id !== r.id), 'Request removed (quotes already in stay with each vendor)')}
          onOpenVendor={onOpen}
        />
      ))}
    </section>
  );
}

/** Making a request: tap the service; everything else is filled in, ready to send. */
function NewRequest({
  list,
  today,
  manual,
  siteEmail,
  onCancel,
  onMake,
}: {
  list: Vendor[];
  today: string;
  /** Quotes you'll type in yourself: no email, nothing sent. */
  manual: boolean;
  siteEmail: boolean;
  onCancel: () => void;
  onMake: (rfq: Rfq, list: Vendor[], sendTo: string[]) => Promise<boolean>;
}) {
  const [service, setService] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState<RfqLine[]>([]);
  const [all, setAll] = useState<Vendor[]>(list);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState(plusDays(today, 14));
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [editLines, setEditLines] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const choose = (s: string) => {
    const label = VENDOR_SEARCH[s]?.label ?? 'Something else';
    setService(s);
    setLines((RFQ_LINES[s] ?? RFQ_LINES['']!).map((l) => ({ id: newId(), label: l, detail: '' })));
    setTitle(s ? `${label.replace(/s$/, '').replace(/ and .*/, '')} quotes` : 'Quotes');
    setPicked(new Set(all.filter((v) => searchKeyOf(`${v.category} ${v.name}`) === s && v.status !== 'declined' && v.status !== 'booked').map((v) => v.id)));
    const d = rfqDraft(s);
    setSubject(d.subject);
    setMessage(d.message);
    setProblem('');
  };

  if (service === null) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-[14px] bg-white border border-[#e2d7bc]">
        <strong className="text-[16px]">{manual ? 'What are the quotes for?' : 'What do you need quotes for?'}</strong>
        {manual && <span className="text-[13px] text-[#5b6a52] -mt-2">For quotes you already have (by phone, email or a PDF). You’ll type each one in, then see them side by side.</span>}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          {[...SERVICES, ['', { label: 'Something else' }] as const].map(([k, v]) => (
            <button key={k || 'other'} type="button" onClick={() => choose(k)} className="min-h-[52px] py-2 px-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0] text-[14px] cursor-pointer text-[#33402f] hover:border-[#33402f]">
              {v.label}
            </button>
          ))}
        </div>
        <Pill className="self-start" onClick={onCancel}>
          Cancel
        </Pill>
      </div>
    );
  }

  const label = VENDOR_SEARCH[service]?.label ?? 'Something else';
  const matching = all.filter((v) => searchKeyOf(`${v.category} ${v.name}`) === service);
  const others = all.filter((v) => !matching.includes(v) && v.status !== 'declined');
  const chosen = all.filter((v) => picked.has(v.id));
  const byEmail = siteEmail && !manual ? chosen.filter((v) => isEmail(v.email)) : [];
  const setVendor = (id: string, p: Partial<Vendor>) => setAll(all.map((v) => (v.id === id ? { ...v, ...p } : v)));

  const make = async () => {
    setProblem('');
    const ls = lines.filter((l) => l.label.trim());
    if (!ls.length) return setProblem('Add at least one thing to price.');
    if (!picked.size) return setProblem('Tick at least one vendor to ask.');
    if (!manual && !message.includes('{link}')) return setProblem('Keep {link} in the message: it’s where each vendor prices the list.');
    setBusy(true);
    const rfq: Rfq = {
      id: newId(),
      title: title.trim().slice(0, 120) || `${label} quotes`,
      service,
      lines: ls.map((l) => ({ ...l, label: l.label.trim().slice(0, 160) })),
      due,
      subject: subject.slice(0, 200),
      message: message.slice(0, 4000),
      vendors: [...picked].map(askOf),
      createdOn: today,
      closed: false,
      budget: 0,
      preferred: '',
      // Vendors who haven't quoted are reminded automatically (it can be switched off on the request).
      ...(manual ? { manual: true } : { autoFollow: true }),
    };
    await onMake(rfq, all, byEmail.map((v) => v.id));
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4 rounded-[14px] bg-white border border-[#e2d7bc]">
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <strong className="text-[18px]">{label} quotes</strong>
        <button type="button" onClick={() => setService(null)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
          Change
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <strong className="text-[14px]">{manual ? 'Whose quotes' : 'Who to ask'}</strong>
        {!matching.length && <span className="text-[13px] text-[#5b6a52]">None of your vendors are {label.toLowerCase()} yet: add who you’d like a quote from.</span>}
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {[...matching, ...others].map((v) => {
            const on = picked.has(v.id);
            return (
              <li key={v.id} className={`flex flex-col gap-2 p-3 rounded-[12px] border ${on ? 'border-[#8a9670] bg-[#f3f6ea]' : 'border-[#ece3cd] bg-[#fbf8f0]'}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={on} onChange={(e) => setPicked((p) => (e.target.checked ? new Set([...p, v.id]) : new Set([...p].filter((x) => x !== v.id))))} className="w-[20px] h-[20px] accent-[#5d6b47]" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium">{v.name}</span>
                    <span className="block text-[12px] text-[#7a7466] truncate">{[v.category, v.email || v.phone].filter(Boolean).join(' · ') || 'No email or mobile yet'}</span>
                  </span>
                </label>
                {on && !v.email && !manual && (
                  <input
                    type="email"
                    value={v.email}
                    placeholder={`${v.name}’s email (to send it to them)`}
                    aria-label={`${v.name} email`}
                    onChange={(e) => setVendor(v.id, { email: e.target.value.slice(0, 120) })}
                    className={inputCls}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {adding ? (
          <AddVendor
            category={label.replace(/s$/, '')}
            nameOnly={manual}
            onCancel={() => setAdding(false)}
            onAdd={(v) => {
              setAll([...all, v]);
              setPicked(new Set([...picked, v.id]));
              setAdding(false);
            }}
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[14px] text-[#33402f]">
            {manual ? '+ Someone else' : '+ Ask someone else'}
          </button>
        )}
      </div>

      {!manual && (
      <div className="flex flex-col gap-2">
        <strong className="text-[14px]">Quotes wanted by</strong>
        <div className="flex gap-2 flex-wrap items-center">
          {[
            ['1 week', 7],
            ['2 weeks', 14],
            ['1 month', 30],
          ].map(([t, n]) => {
            const d = plusDays(today, n as number);
            return (
              <button key={t} type="button" aria-pressed={due === d} onClick={() => setDue(d)} className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${due === d ? 'bg-[#33402f] border-[#33402f] text-[#fbf8f0]' : 'bg-white border-[#c6b794] text-[#33402f]'}`}>
                {t}
              </button>
            );
          })}
          <input type="date" value={due} min={today} aria-label="Quotes wanted by" onChange={(e) => setDue(e.target.value)} className={`${inputCls} max-w-[180px] py-[6px]`} />
        </div>
      </div>
      )}

      <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-[#fbf8f0] border border-[#ece3cd]">
        <div className="flex justify-between items-baseline gap-2">
          <strong className="text-[14px]">
            {manual ? 'What to compare' : 'What they’ll price'} ({lines.filter((l) => l.label.trim()).length})
          </strong>
          <button type="button" aria-expanded={editLines} onClick={() => setEditLines(!editLines)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
            {editLines ? 'Done' : 'Change'}
          </button>
        </div>
        {editLines ? (
          <>
            <Label text="Name of this request">
              <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
            </Label>
            {lines.map((l, i) => (
              <div key={l.id} className="grid gap-2 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center">
                <input value={l.label} maxLength={160} aria-label={`Item ${i + 1}`} onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))} className={inputCls} />
                <input value={l.detail} maxLength={400} placeholder="Details (optional)" aria-label={`Item ${i + 1} details`} onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, detail: e.target.value } : x)))} className={`${inputCls} col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto`} />
                <button type="button" aria-label={`Remove ${l.label || 'item'}`} onClick={() => setLines(lines.filter((x) => x.id !== l.id))} className="w-10 h-10 rounded-full border border-[#d3c6a4] bg-white cursor-pointer text-[18px] text-[#7a4a37]">
                  ×
                </button>
              </div>
            ))}
            {lines.length < 40 && (
              <Pill size="sm" className="self-start" onClick={() => setLines([...lines, { id: newId(), label: '', detail: '' }])}>
                + Add an item
              </Pill>
            )}
          </>
        ) : (
          <span className="text-[13px] text-[#5b6a52]">
            {lines
              .map((l) => l.label.trim())
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      {!manual && (
      <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-[#fbf8f0] border border-[#ece3cd]">
        <div className="flex justify-between items-baseline gap-2">
          <strong className="text-[14px]">The message</strong>
          <button type="button" aria-expanded={editEmail} onClick={() => setEditEmail(!editEmail)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
            {editEmail ? 'Done' : 'Change'}
          </button>
        </div>
        {editEmail ? (
          <>
            <Label text="Subject">
              <input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
            </Label>
            <Label text="Message">
              <textarea rows={10} value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} className={inputCls} />
            </Label>
            <span className="text-[12px] text-[#5b6a52]">Filled in for each vendor: {'{couple}'} {'{date}'} {'{venue}'} {'{guests}'} {'{due}'}, and {'{link}'}, their own page to price it.</span>
          </>
        ) : (
          <span className="text-[13px] text-[#5b6a52] line-clamp-2">{message.replace(/\{link\}/g, '[their link]').replace(/\s+/g, ' ')}</span>
        )}
      </div>
      )}

      {problem && (
        <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">
          {problem}
        </p>
      )}
      <div className="flex gap-2 items-center flex-wrap">
        <Pill kind="primary" disabled={busy} aria-busy={busy} onClick={() => void make()}>
          {busy ? (manual ? 'Saving…' : 'Sending…') : manual ? 'Start comparing' : byEmail.length ? `Send to ${byEmail.length} ${byEmail.length === 1 ? 'vendor' : 'vendors'}` : 'Make the request'}
        </Pill>
        <Pill onClick={onCancel}>Cancel</Pill>
      </div>
      <span className="text-[12px] text-[#5b6a52]">
        {manual
          ? 'Next, type in each vendor’s quote: one total or item by item, with their PDF if you have it. Nothing is sent to them.'
          : byEmail.length
          ? `Emailed from the site, each with their own link. Replies come to you.${chosen.length > byEmail.length ? ` ${chosen.length - byEmail.length} without an email: you’ll text or copy their link next.` : ''}`
          : 'Next, send it to each vendor from your email or phone, or copy their link.'}
      </span>
    </div>
  );
}

/** Add someone to ask (in the directory or not): their name and an email or mobile. They join your vendors too. */
function AddVendor({ category, nameOnly, onAdd, onCancel, existing = [], onPick }: { category: string; nameOnly?: boolean; onAdd: (v: Vendor) => void; onCancel: () => void; existing?: Vendor[]; onPick?: (v: Vendor) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [problem, setProblem] = useState('');
  const add = () => {
    setProblem('');
    if (!name.trim()) return setProblem('Add their name.');
    if (email.trim() && !isEmail(email)) return setProblem('That email doesn’t look right.');
    if (!nameOnly && !email.trim() && !phone.trim()) return setProblem('Add an email or a mobile, so the request can reach them.');
    onAdd(Vendor.parse({ id: newId(), name: name.trim().slice(0, 120), category, status: nameOnly ? 'contacted' : 'requested', phone: phone.trim().slice(0, 40), email: email.trim().slice(0, 120) }));
  };
  return (
    <div className="flex flex-col gap-2 p-3 rounded-[12px] border border-dashed border-[#c6b794] bg-[#fbf8f0]">
      {existing.length > 0 && onPick && (
        <Label text="Someone already in your vendors">
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
      <span className="text-[13px] text-[#5b6a52]">{existing.length && onPick ? 'Or someone new:' : 'Someone new (they’re added to your vendors too):'}</span>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Wildflower Studio" aria-label="New vendor name" className={inputCls} />
        <input value={email} type="email" onChange={(e) => setEmail(e.target.value)} placeholder={nameOnly ? 'Email (optional)' : 'Email'} aria-label="New vendor email" className={inputCls} />
        <input value={phone} type="tel" onChange={(e) => setPhone(e.target.value)} placeholder={nameOnly ? 'Mobile (optional)' : 'Mobile'} aria-label="New vendor mobile" className={inputCls} />
      </div>
      {problem && (
        <span role="alert" className="text-[13px] text-[#7a4a37]">
          {problem}
        </span>
      )}
      <div className="flex gap-2">
        <Pill kind="primary" size="sm" onClick={add}>
          Add
        </Pill>
        <Pill size="sm" onClick={onCancel}>
          Cancel
        </Pill>
      </div>
    </div>
  );
}

type StateOf = { label: string; tone: 'muted' | 'wait' | 'good' | 'out'; when: string };
function stateOf(rv: RfqVendor, manual?: boolean): StateOf {
  if (rv.answeredOn) return { label: 'Quoted', tone: 'good', when: longDay(rv.answeredOn) };
  if (manual && !rv.sentOn && !rv.declinedOn) return { label: 'Quote to enter', tone: 'muted', when: '' };
  if (rv.declinedOn) return { label: 'Can’t quote', tone: 'out', when: rv.declinedWhy };
  if (rv.openedOn) return { label: 'Looking at it', tone: 'wait', when: `opened ${longDay(rv.openedOn)}` };
  if (rv.sentOn) return { label: 'Sent', tone: 'wait', when: `${longDay(rv.sentOn)}${rv.remindedOn ? ` · reminded ${longDay(rv.remindedOn)}` : ''}` };
  return { label: 'Not sent yet', tone: 'muted', when: '' };
}
const TONE: Record<StateOf['tone'], string> = { muted: 'bg-[#efe7d3] text-[#5b6a52]', wait: 'bg-[#f4dfae] text-[#6b4f1d]', good: 'bg-[#dfe5cc] text-[#3d4a2f]', out: 'bg-[#eadbd5] text-[#7a4a37]' };

/** One request: who has it and where they're at, sending and reminding, and the comparison. */
function RequestCard({
  rfq,
  list,
  today,
  siteEmail,
  open,
  onToggle,
  onChange,
  onSend,
  onDelete,
  onOpenVendor,
}: {
  rfq: Rfq;
  list: Vendor[];
  today: string;
  siteEmail: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (next: Rfq, list?: Vendor[], msg?: string) => Promise<boolean>;
  onSend: (vendorIds: string[], remind: boolean) => Promise<unknown>;
  onDelete: () => void;
  onOpenVendor: (id: string) => void;
}) {
  const { overview } = useAdmin();
  const toast = useToast();
  const [entering, setEntering] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');
  const stage = rfqStage(rfq, list);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | null>(null);
  const shown = step ?? stage;
  const answered = rfq.vendors.filter((v) => v.answeredOn).length;
  const declined = rfq.vendors.filter((v) => v.declinedOn && !v.answeredOn).length;
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
  /** Sent by hand (their own email app, a text, a copied link): the tracker knows they've been asked. */
  const markSent = (vendorId: string) => {
    if (rfq.vendors.find((v) => v.vendorId === vendorId)?.sentOn) return;
    void onChange(
      { ...rfq, vendors: rfq.vendors.map((v) => (v.vendorId === vendorId ? { ...v, sentOn: today } : v)) },
      list.map((v): Vendor => (v.id === vendorId ? { ...v, status: v.status === 'idea' || v.status === 'contacted' ? 'requested' : v.status, askedOn: v.askedOn || today, quoteBy: v.quoteBy || rfq.due } : v)),
    );
  };
  const send = async (ids: string[], remind: boolean, label: string) => {
    setBusy(label);
    await onSend(ids, remind);
    setBusy('');
  };
  const cmp = tenderAnalysis(rfq, list);
  const book = (vendorId: string) => {
    const col = cmp.cols.find((c) => c.v.id === vendorId);
    if (!col?.q) return;
    const others = cmp.cols.filter((c) => c.v.id !== vendorId && c.v.status !== 'booked');
    if (!window.confirm(`Book ${col.v.name} at ${aud(col.q.amount)}?${others.length ? ` The others (${others.map((c) => c.v.name).join(', ')}) are marked "went with someone else".` : ''}`)) return;
    void onChange(
      { ...rfq, closed: true },
      list.map((v): Vendor =>
        v.id === vendorId ? { ...v, status: 'booked', accepted: col.q!.id } : others.some((c) => c.v.id === v.id) ? { ...v, status: 'declined', declinedWhy: v.declinedWhy || `Went with ${col.v.name}` } : v,
      ),
      `${col.v.name} booked: now lock it in`,
    );
    setStep(null);
  };
  /** A quote that came some other way (an email, a PDF), added for them. */
  const enterQuote = (vendorId: string, q: Quote) => {
    const v = list.find((x) => x.id === vendorId);
    const rv = rfq.vendors.find((x) => x.vendorId === vendorId);
    if (!v || !rv) return;
    const was = v.quotes.find((x) => x.id === rv.quoteId);
    const quote = { ...q, id: was?.id ?? q.id, rfq: rfq.id, before: beforeOf(was, q.amount) };
    const saved = quote.before !== undefined && quote.before > quote.amount ? quote.before - quote.amount : 0;
    void onChange(
      { ...rfq, vendors: rfq.vendors.map((x) => (x.vendorId === vendorId ? { ...x, quoteId: quote.id, answeredOn: x.answeredOn || today, sentOn: x.sentOn || (rfq.manual ? '' : today), declinedOn: '' } : x)) },
      list.map((x): Vendor => (x.id === vendorId ? { ...x, quotes: was ? x.quotes.map((y) => (y.id === was.id ? quote : y)) : [...x.quotes, quote].slice(-12), status: x.status === 'booked' ? x.status : 'quoted' } : x)),
      saved ? `${v.name}’s new price saved: ${aud(saved)} less than their first quote` : was ? `${v.name}’s quote updated` : `${v.name}’s quote added`,
    );
    setEntering(null);
  };

  const notSent = rfq.manual ? [] : rfq.vendors.filter((rv) => !rv.sentOn && !rv.answeredOn && !rv.declinedOn);
  const toEnter = rfq.manual ? rfq.vendors.filter((rv) => !rv.answeredOn && !rv.sentOn && !rv.declinedOn) : [];
  const emailable = (ids: RfqVendor[]) => ids.filter((rv) => isEmail(list.find((v) => v.id === rv.vendorId)?.email ?? '')).map((rv) => rv.vendorId);
  const waiting = rfq.vendors.filter((rv) => rv.sentOn && !rv.answeredOn && !rv.declinedOn);
  const late = rfq.due && rfq.due < today;
  /** You've asked them for a better price (the message went from your email, a text or a copy). */
  const markAsked = (vendorId: string) => {
    if (rfq.vendors.find((v) => v.vendorId === vendorId)?.negotiatedOn === today) return;
    void onChange({ ...rfq, vendors: rfq.vendors.map((v) => (v.vendorId === vendorId ? { ...v, negotiatedOn: today } : v)) });
    setStep(null);
  };
  const patchVendor = (id: string, p: Partial<Vendor>, msg?: string) => void onChange(rfq, list.map((v) => (v.id === id ? { ...v, ...p } : v)), msg);

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 rounded-[14px] bg-white border border-[#e2d7bc]">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex justify-between items-center gap-3 p-0 border-0 bg-transparent text-left cursor-pointer text-[#33402f]">
        <span className="min-w-0">
          <span className="block text-[17px] font-semibold">
            {rfq.title || 'Quote request'}
            {rfq.closed && <span className="ml-2 py-[1px] px-2 rounded-full text-[11px] bg-[#dfe5cc] text-[#3d4a2f] align-middle">Decided</span>}
          </span>
          <span className="block text-[13px] text-[#5b6a52]">
            Step {stage} of 4: {STEPS[stage - 1]} · {answered} of {rfq.vendors.length} quoted{declined ? ` · ${declined} can’t` : ''}
            {rfq.due && !rfq.closed ? <span className={late ? 'text-[#7a4a37] font-semibold' : ''}>{` · ${late ? 'were due' : 'due'} ${longDay(rfq.due)}`}</span> : ''}
          </span>
        </span>
        <span aria-hidden className="text-[18px]">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <Stepper stage={stage} shown={shown} onPick={(n) => setStep(n === stage ? null : n)} />
          <p className="m-0 text-[14px] text-[#5b6a52]">{stepHelp(shown, !!rfq.manual)}</p>
          {shown === 1 && (
            <>
          {!rfq.closed && !rfq.manual && (
            <label className="flex items-start gap-3 p-3 rounded-[12px] bg-[#fbf8f0] border border-[#ece3cd] cursor-pointer text-[14px]">
              <input
                type="checkbox"
                checked={!!rfq.autoFollow}
                onChange={(e) => void onChange({ ...rfq, autoFollow: e.target.checked }, undefined, e.target.checked ? 'Follow-ups on' : 'Follow-ups off')}
                className="mt-[2px] w-[20px] h-[20px] accent-[#5d6b47]"
              />
              <span>
                <strong className="font-semibold">Follow up automatically</strong>
                <span className="block text-[13px] text-[#5b6a52]">
                  Anyone who hasn’t quoted gets a friendly reminder by email: four days after it’s sent (sooner if your date is close), then the day after your date. Two at most.
                  {!siteEmail && ' Needs the site’s email set up: until then, use Remind by each name.'}
                </span>
              </span>
            </label>
          )}
          {!rfq.closed && toEnter.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap p-3 rounded-[12px] bg-[#fbf3e1] border border-[#ecd9ae] text-[14px]">
              <span className="flex-1 min-w-[180px]">
                <strong className="font-semibold">{toEnter.length === rfq.vendors.length ? 'Type in each quote.' : `${toEnter.length} still to enter.`}</strong> Tap Enter quote by each name: one total or item by item, with their PDF if you have it.
              </span>
            </div>
          )}
          {!rfq.closed && (notSent.length > 0 || (waiting.length > 0 && siteEmail)) && (
            <div className="flex items-center gap-3 flex-wrap p-3 rounded-[12px] bg-[#fbf3e1] border border-[#ecd9ae] text-[14px]">
              {notSent.length > 0 ? (
                <>
                  <span className="flex-1 min-w-[180px]">
                    <strong className="font-semibold">{notSent.length} not sent yet.</strong>{' '}
                    {siteEmail && emailable(notSent).length ? 'Send it from here in one tap, or use the buttons by each name.' : 'Use Email, Text or Copy link by each name.'}
                  </span>
                  {siteEmail && emailable(notSent).length > 0 && (
                    <Pill kind="primary" size="sm" disabled={!!busy} onClick={() => void send(emailable(notSent), false, 'all')}>
                      {busy === 'all' ? 'Sending…' : `Email ${emailable(notSent).length === notSent.length ? 'them' : `${emailable(notSent).length} with an email`}`}
                    </Pill>
                  )}
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-[180px]">
                    Waiting on {waiting.length}
                    {late ? ': they’re past the date you asked for.' : '.'}
                  </span>
                  {emailable(waiting).length > 0 && (
                    <Pill size="sm" disabled={!!busy} onClick={() => void send(emailable(waiting), true, 'remind')}>
                      {busy === 'remind' ? 'Sending…' : `Remind ${emailable(waiting).length === 1 ? 'them' : `all ${emailable(waiting).length}`}`}
                    </Pill>
                  )}
                </>
              )}
            </div>
          )}

          <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#efe6d0]">
            {rfq.vendors.map((rv) => {
              const v = list.find((x) => x.id === rv.vendorId);
              if (!v) return null;
              const st = stateOf(rv, rfq.manual);
              const q = v.quotes.find((x) => x.id === rv.quoteId);
              const mail = `mailto:${encodeURIComponent(v.email)}?subject=${encodeURIComponent(fill(rfq.subject, rv.key))}&body=${encodeURIComponent(fill(rfq.message, rv.key))}`;
              const sms = `sms:${v.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(`Hi, it's ${couple}. We'd love a quote for our wedding: you can price it here ${linkOf(rv.key)}`)}`;
              const canEmail = siteEmail && isEmail(v.email);
              const pending = !rfq.closed && !rv.answeredOn && !rv.declinedOn;
              return (
                <li key={rv.vendorId} className="py-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 min-w-[160px]">
                      <button type="button" onClick={() => onOpenVendor(v.id)} className="p-0 border-0 bg-transparent cursor-pointer text-[#33402f] text-[15px] font-medium text-left">
                        {v.name}
                      </button>
                      <span className="flex items-center gap-2 flex-wrap mt-[2px]">
                        <span className={`py-[1px] px-2 rounded-full text-[11px] font-semibold ${TONE[st.tone]}`}>{st.label}</span>
                        {q && <strong className="text-[14px]">{aud(q.amount)}</strong>}
                        {q?.package && <span className="text-[11px] text-[#5b6a52]">one total</span>}
                        {st.when && <span className="text-[12px] text-[#7a7466]">{st.when}</span>}
                        {siteEmail && isEmail(v.email) && nextFollowUp(rfq, rv) && <span className="text-[12px] text-[#5b6a52]">· next reminder {longDay(nextFollowUp(rfq, rv) < today ? today : nextFollowUp(rfq, rv))}</span>}
                      </span>
                    </span>
                    {!rfq.closed && (rfq.manual || q) && (
                      <Pill size="sm" kind={q ? 'secondary' : 'primary'} onClick={() => setEntering(entering === v.id ? null : v.id)}>
                        {q ? 'Change' : 'Enter quote'}
                      </Pill>
                    )}
                    {pending && canEmail && !rfq.manual && (
                      <Pill size="sm" kind={rv.sentOn ? 'secondary' : 'primary'} disabled={!!busy} onClick={() => void send([v.id], !!rv.sentOn, v.id)}>
                        {busy === v.id ? 'Sending…' : rv.sentOn ? 'Remind' : 'Send'}
                      </Pill>
                    )}
                    {!rfq.closed && (
                      <details className="relative">
                        <summary className={`${small} list-none [&::-webkit-details-marker]:hidden`}>{canEmail || !pending || rfq.manual ? 'More' : 'Send'} ▾</summary>
                        <div className="absolute right-0 z-[5] mt-1 w-[230px] flex flex-col p-1 rounded-[12px] border border-[#e2d7bc] bg-white shadow-[0_8px_24px_rgba(51,64,47,.18)] text-[14px]">
                          {pending && v.email && (
                            <a href={mail} onClick={() => markSent(v.id)} className="py-2 px-3 rounded-[8px] no-underline !text-[#33402f] hover:bg-[#f3eee2]">
                              Email from my email app
                            </a>
                          )}
                          {pending && v.phone && (
                            <a href={sms} onClick={() => markSent(v.id)} className="py-2 px-3 rounded-[8px] no-underline !text-[#33402f] hover:bg-[#f3eee2]">
                              Text them the link
                            </a>
                          )}
                          <button
                            type="button"
                            className="py-2 px-3 rounded-[8px] border-0 bg-transparent text-left cursor-pointer text-[#33402f] hover:bg-[#f3eee2]"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(linkOf(rv.key));
                                toast(`${v.name}’s link copied: paste it into a message`);
                                markSent(v.id);
                              } catch {
                                window.prompt('Copy this link', linkOf(rv.key));
                              }
                            }}
                          >
                            Copy their link
                          </button>
                          <button type="button" className="py-2 px-3 rounded-[8px] border-0 bg-transparent text-left cursor-pointer text-[#33402f] hover:bg-[#f3eee2]" onClick={() => setEntering(v.id)}>
                            {q ? 'Change their quote' : rfq.manual ? 'Enter their quote' : 'Add a quote they sent me'}
                          </button>
                          <button
                            type="button"
                            className="py-2 px-3 rounded-[8px] border-0 bg-transparent text-left cursor-pointer text-[#7a4a37] hover:bg-[#f3eee2]"
                            onClick={() => void onChange({ ...rfq, vendors: rfq.vendors.filter((x) => x.vendorId !== v.id) }, undefined, `${v.name} taken off this request`)}
                          >
                            Take off this request
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                  {!v.email && !v.phone && pending && !rfq.manual && <span className="text-[12px] text-[#7a4a37]">No email or mobile: add one on their card, or copy their link.</span>}
                  {entering === v.id && <EnterQuote rfq={rfq} vendor={v} was={q} onCancel={() => setEntering(null)} onSave={(qq) => enterQuote(v.id, qq)} />}
                </li>
              );
            })}
          </ul>

          {!rfq.closed &&
            rfq.vendors.length < 20 &&
            (adding ? (
              <AddVendor
                category={VENDOR_SEARCH[rfq.service]?.label.replace(/s$/, '') ?? ''}
                nameOnly={rfq.manual}
                existing={list.filter((v) => !rfq.vendors.some((rv) => rv.vendorId === v.id) && v.status !== 'declined')}
                onCancel={() => setAdding(false)}
                onAdd={(v) => {
                  void onChange({ ...rfq, vendors: [...rfq.vendors, askOf(v.id)] }, [...list, v], rfq.manual ? `${v.name} added: enter their quote` : `${v.name} added: send them the request`);
                  setAdding(false);
                }}
                onPick={(v) => {
                  void onChange({ ...rfq, vendors: [...rfq.vendors, askOf(v.id)] }, undefined, rfq.manual ? `${v.name} added: enter their quote` : `${v.name} added: send them the request`);
                  setAdding(false);
                }}
              />
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[14px] text-[#33402f]">
                + Ask someone else
              </button>
            ))}
          {answered > 0 && !rfq.closed && (
            <Pill kind="primary" className="self-start" onClick={() => setStep(2)}>
              Next: compare {answered} {answered === 1 ? 'quote' : 'quotes'} →
            </Pill>
          )}
            </>
          )}

          {shown === 2 &&
            (cmp.cols.some((c) => c.q) ? (
              <>
                <Comparison rfq={rfq} cmp={cmp} today={today} onBook={book} onChange={(next, msg) => void onChange(next, undefined, msg)} />
                {!rfq.closed && (
                  <div className="flex gap-2 flex-wrap items-center">
                    <Pill kind="primary" onClick={() => setStep(3)}>
                      Next: ask for a better deal →
                    </Pill>
                    <button type="button" onClick={() => setStep(4)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
                      Happy with a price? Skip to booking
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="m-0 p-3 rounded-[12px] bg-[#fbf8f0] text-[14px] text-[#5b6a52]">{rfq.manual ? 'Quotes appear here side by side as you enter them (step 1).' : 'Quotes appear here side by side as they come in. We’ll email you when each one lands.'}</p>
            ))}

          {shown === 3 && (
            <Negotiate
              rfq={rfq}
              list={list}
              today={today}
              couple={couple}
              weddingDate={ev ? new Date(ev.startsAt).toLocaleDateString('en-CA', { timeZone: overview?.wedding.timezone }) : ''}
              entering={entering}
              onEnter={setEntering}
              onSaveQuote={enterQuote}
              onAsked={markAsked}
              onPrefer={(id) => void onChange({ ...rfq, preferred: id })}
              onNext={() => setStep(4)}
            />
          )}

          {shown === 4 && <LockIn rfq={rfq} list={list} cmp={cmp} couple={couple} onBook={book} onPatch={patchVendor} onOpenVendor={onOpenVendor} />}

          <div className="flex gap-4 text-[13px] pt-1 flex-wrap">
            {rfq.closed ? (
              <button type="button" onClick={() => void onChange({ ...rfq, closed: false }, undefined, 'Reopened: vendors can quote again')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                Reopen
              </button>
            ) : (
              <button type="button" onClick={() => void onChange({ ...rfq, closed: true }, undefined, 'Closed: vendors can no longer change their quotes')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                Close without booking
              </button>
            )}
            <button type="button" onClick={() => window.confirm('Remove this request? Quotes already in stay with each vendor.') && onDelete()} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]">
              Remove request
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const STEPS = ['Get quotes', 'Compare', 'Negotiate', 'Lock in'] as const;
function stepHelp(n: number, manual: boolean) {
  return [
    manual ? 'Type in each quote you have: one total or item by item, with the PDF if you have it.' : 'Send your list to each vendor. Their quotes come back here, and you’re emailed as each one lands. Remind anyone who’s slow.',
    'Best value first, like for like. Check what’s left out, the deposit and when each price runs out, and rate them with the stars.',
    'Before you book, ask for a better deal. Here’s what to raise with each one, worked out from the comparison, with a message ready to send.',
    'Book your favourite, then pay the deposit, sign the contract and let the others know.',
  ][n - 1]!;
}

/** The four steps: done ones ticked, where you're at in bold; tap any to look at it. */
function Stepper({ stage, shown, onPick }: { stage: number; shown: number; onPick: (n: 1 | 2 | 3 | 4) => void }) {
  return (
    <ol aria-label="Steps" className="m-0 p-0 list-none grid grid-cols-4 gap-1">
      {STEPS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const done = n < stage;
        const here = n === shown;
        return (
          <li key={label}>
            <button
              type="button"
              aria-current={here ? 'step' : undefined}
              onClick={() => onPick(n)}
              className={`w-full flex flex-col items-center gap-1 py-2 px-1 rounded-[10px] border cursor-pointer text-[12px] leading-tight ${here ? 'border-[#33402f] bg-[#f3f6ea] font-semibold text-[#33402f]' : 'border-transparent bg-transparent text-[#5b6a52]'}`}
            >
              <span
                aria-hidden
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold ${done ? 'bg-[#5d6b47] text-[#fbf8f0]' : n === stage ? 'bg-[#33402f] text-[#fbf8f0]' : 'bg-[#efe7d3] text-[#7a7466]'}`}
              >
                {done ? '✓' : n}
              </span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Step 3: a plan to get your favourite vendor's price down. Pick your favourite (your top-rated, else the
 * best value, to start with); see what to open with, what to aim for and your limit; the levers that
 * should work here, strongest first, each with what to say; and the messages in order (the ask, a
 * follow-up if they go quiet, a counter when they come part of the way). Their new price is recorded when
 * they come back (what you saved shows). The other vendors' points are below, folded away.
 */
function Negotiate({
  rfq,
  list,
  today,
  couple,
  weddingDate,
  entering,
  onEnter,
  onSaveQuote,
  onAsked,
  onPrefer,
  onNext,
}: {
  rfq: Rfq;
  list: Vendor[];
  today: string;
  couple: string;
  weddingDate: string;
  entering: string | null;
  onEnter: (id: string | null) => void;
  onSaveQuote: (vendorId: string, q: Quote) => void;
  onAsked: (vendorId: string) => void;
  onPrefer: (vendorId: string) => void;
  onNext: () => void;
}) {
  const toast = useToast();
  const items = negotiationPoints(rfq, list, today).sort((a, b) => (a.levelled ?? Infinity) - (b.levelled ?? Infinity));
  const t = tenderAnalysis(rfq, list);
  const fav = items.find((n) => n.vendorId === rfq.preferred)?.vendorId ?? items.find((n) => n.vendorId === t.topScore?.id)?.vendorId ?? items[0]?.vendorId ?? '';
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [which, setWhich] = useState<'opener' | 'followUp' | 'counter'>('opener');
  if (!items.length) return <p className="m-0 p-3 rounded-[12px] bg-[#fbf8f0] text-[14px] text-[#5b6a52]">Once a quote is in, this builds your plan to get a better price.</p>;
  const plan = negotiationPlan(rfq, list, fav, weddingDate);
  const v = list.find((x) => x.id === fav);
  const n = items.find((x) => x.vendorId === fav)!;
  const quiet = awaitingReply(rfq, list, today).find((x) => x.vendorId === fav);
  const saved = n.quote.before !== undefined && n.quote.before > n.quote.amount ? n.quote.before - n.quote.amount : 0;
  const fill = (s: string) => s.replace(/\{couple\}/g, couple);
  const key = `${fav}:${which}`;
  const text = msgs[key] ?? fill(plan?.messages[which] ?? '');
  const subject = `Your quote: ${couple}’s wedding`;
  const sendBits = (body: string, vendor: Vendor | undefined, onSent: () => void) => (
    <div className="flex gap-2 flex-wrap">
      {vendor?.email && (
        <a href={`mailto:${encodeURIComponent(vendor.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} onClick={onSent} className={small}>
          Email it
        </a>
      )}
      {vendor?.phone && (
        <a href={`sms:${vendor.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`} onClick={onSent} className={small}>
          Text it
        </a>
      )}
      <button
        type="button"
        className={small}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(body);
            toast('Message copied: paste it to them');
          } catch {
            window.prompt('Copy this message', body);
          }
          onSent();
        }}
      >
        Copy
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <strong className="text-[15px]">Who would you most like to book?</strong>
        <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Your favourite">
          {items.map((x) => (
            <button
              key={x.vendorId}
              type="button"
              role="radio"
              aria-checked={x.vendorId === fav}
              onClick={() => onPrefer(x.vendorId)}
              className={`py-2 px-3 rounded-full border text-[14px] cursor-pointer ${x.vendorId === fav ? 'bg-[#33402f] border-[#33402f] text-[#fbf8f0]' : 'bg-white border-[#c6b794] text-[#33402f]'}`}
            >
              {x.name} · {aud(x.quote.amount)}
            </button>
          ))}
        </div>
      </div>

      {plan && (
        <article className="flex flex-col gap-3 p-3 sm:p-4 rounded-[14px] border border-[#8a9670] bg-[#f6f8ef]">
          <div className="flex justify-between items-baseline gap-2 flex-wrap">
            <strong className="text-[17px]">Your plan for {plan.name}</strong>
            {saved > 0 && <span className="text-[13px] text-[#3d4a2f] font-semibold">Was {aud(n.quote.before!)}: saved {aud(saved)} so far</span>}
          </div>
          <dl className="m-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Their price', aud(plan.price), ''],
              ['Open with', aud(plan.opening), 'what you ask for first'],
              ['Aim for', aud(plan.target), 'a realistic result'],
              ['Your limit', aud(plan.limit), rfq.budget > 0 ? 'your budget' : 'their price now'],
            ].map(([k, val, sub]) => (
              <div key={k} className={`flex flex-col p-2 rounded-[10px] ${k === 'Aim for' ? 'bg-[#33402f] text-[#fbf8f0]' : 'bg-white border border-[#e2d7bc]'}`}>
                <dt className="text-[11px] uppercase tracking-[.12em] opacity-80">{k}</dt>
                <dd className="m-0 font-display text-[24px] leading-tight">{val}</dd>
                {sub && <span className="text-[11px] opacity-75">{sub}</span>}
              </div>
            ))}
          </dl>
          <p className="m-0 text-[14px] text-[#5b6a52]">
            {plan.rival
              ? `${plan.rival.name} is ${aud((plan.levelled ?? plan.price) - plan.rival.levelled)} cheaper like for like: that’s your strongest card. Ask ${plan.name} to get close to it, without naming who.`
              : `${plan.name} is already the best value. Aim for about 10% off, or for extras included at the same price.`}
          </p>

          <div className="flex flex-col gap-2">
            <strong className="text-[15px]">Your levers, strongest first</strong>
            <ol className="m-0 pl-5 flex flex-col gap-2 text-[14px]">
              {plan.levers.map((l) => (
                <li key={l.key}>
                  <strong className="font-semibold">{l.title}.</strong> <span className="text-[#5b6a52]">{l.why}</span>
                  {l.say && <span className="block mt-1 pl-3 border-l-2 border-[#a9b98d] italic">“{l.say}”</span>}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col gap-2">
            <strong className="text-[15px]">Your messages</strong>
            {quiet && (
              <span role="status" className="p-2 rounded-[10px] bg-[#fbf3e1] border border-[#ecd9ae] text-[13px]">
                No reply in {quiet.days} days: time for the follow-up.
              </span>
            )}
            <div role="tablist" className="grid grid-cols-3 gap-1">
              {(
                [
                  ['opener', '1. Ask'],
                  ['followUp', '2. If they go quiet'],
                  ['counter', '3. They come part way'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={which === k}
                  onClick={() => setWhich(k)}
                  className={`py-2 px-1 rounded-[10px] border text-[12px] sm:text-[13px] cursor-pointer leading-tight ${which === k ? 'bg-white border-[#33402f] font-semibold text-[#33402f]' : 'bg-transparent border-[#d3c6a4] text-[#5b6a52]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea rows={8} value={text} maxLength={3000} aria-label={`Message to ${plan.name}`} onChange={(e) => setMsgs({ ...msgs, [key]: e.target.value })} className={`${inputCls} w-full`} />
            {sendBits(text, v, () => onAsked(fav))}
            {n.askedOn && <span className="text-[12px] text-[#7a7466]">You asked {longDay(n.askedOn)}.</span>}
          </div>

          {!rfq.closed &&
            (entering === fav && v ? (
              <EnterQuote rfq={rfq} vendor={v} was={n.quote} onCancel={() => onEnter(null)} onSave={(q) => onSaveQuote(fav, q)} />
            ) : (
              <Pill size="sm" className="self-start" onClick={() => onEnter(fav)}>
                They came back with a new price
              </Pill>
            ))}
          {!rfq.manual && <span className="text-[12px] text-[#7a7466]">They can also change their price on their own link: it updates here, and you’re emailed.</span>}
        </article>
      )}

      {items.length > 1 && (
        <details className="p-3 rounded-[12px] bg-white border border-[#e2d7bc] text-[14px]">
          <summary className="cursor-pointer font-semibold">The others: what to raise with each (keeps your options open)</summary>
          <div className="flex flex-col gap-3 mt-2">
            {items
              .filter((x) => x.vendorId !== fav)
              .map((x) => {
                const ov = list.find((y) => y.id === x.vendorId);
                const body = msgs[x.vendorId] ?? fill(x.message);
                return (
                  <div key={x.vendorId} className="flex flex-col gap-2 pt-2 border-t border-[#efe6d0]">
                    <span>
                      <strong>{x.name}</strong> · {aud(x.quote.amount)}
                      {x.best && <span className="ml-2 py-[1px] px-2 rounded-full text-[11px] font-semibold bg-[#dfe5cc] text-[#3d4a2f]">Best value</span>}
                    </span>
                    {x.points.length ? (
                      <ul className="m-0 pl-5 flex flex-col gap-1">
                        {x.points.map((p) => (
                          <li key={p.kind}>{p.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-[#5b6a52]">Nothing stands out: ask if they’d include something extra.</span>
                    )}
                    <textarea rows={6} value={body} maxLength={3000} aria-label={`Message to ${x.name}`} onChange={(e) => setMsgs({ ...msgs, [x.vendorId]: e.target.value })} className={`${inputCls} w-full`} />
                    {sendBits(body, ov, () => onAsked(x.vendorId))}
                  </div>
                );
              })}
          </div>
        </details>
      )}

      <details className="p-3 rounded-[12px] bg-[#fbf8f0] border border-[#ece3cd] text-[14px]">
        <summary className="cursor-pointer font-semibold">How to negotiate nicely (and get more)</summary>
        <ul className="m-0 mt-2 pl-5 flex flex-col gap-1 text-[#5b6a52]">
          {NEGOTIATION_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
          <li>Never say your limit first. Let them name the new price, then counter between that and your aim.</li>
          <li>Get any new price in writing (their link, or an email) before you pay a deposit.</li>
        </ul>
      </details>

      <Pill kind="primary" className="self-start" onClick={onNext}>
        Next: lock it in →
      </Pill>
    </div>
  );
}

/**
 * Step 4: book (with what to check first), then what locks it in: the deposit, the contract, the balance
 * date, and a kind note to the others.
 */
function LockIn({
  rfq,
  list,
  cmp,
  couple,
  onBook,
  onPatch,
  onOpenVendor,
}: {
  rfq: Rfq;
  list: Vendor[];
  cmp: ReturnType<typeof tenderAnalysis>;
  couple: string;
  onBook: (vendorId: string) => void;
  onPatch: (id: string, p: Partial<Vendor>, msg?: string) => void;
  onOpenVendor: (id: string) => void;
}) {
  const toast = useToast();
  const booked = cmp.cols.find((c) => c.v.status === 'booked');
  const quoted = cmp.cols
    .map((c, i) => ({ c, t: cmp.totals[i]! }))
    .filter((x) => x.c.q)
    .sort((a, b) => (a.t.levelled ?? Infinity) - (b.t.levelled ?? Infinity));
  const tick = (on: boolean) => (
    <span aria-hidden className={`flex-none w-6 h-6 rounded-full flex items-center justify-center text-[13px] ${on ? 'bg-[#5d6b47] text-[#fbf8f0]' : 'border-2 border-[#c6b794]'}`}>
      {on ? '✓' : ''}
    </span>
  );
  if (!booked) {
    if (rfq.closed) return <p className="m-0 p-3 rounded-[12px] bg-[#fbf8f0] text-[14px] text-[#5b6a52]">Closed without booking. Reopen it below to carry on.</p>;
    return (
      <div className="flex flex-col gap-3">
        <div className="p-3 rounded-[12px] bg-[#fbf8f0] border border-[#ece3cd] text-[14px]">
          <strong className="block mb-1">Before you book, check:</strong>
          <ul className="m-0 pl-5 flex flex-col gap-1 text-[#5b6a52]">
            <li>What’s included matches what you asked for (and the date and times).</li>
            <li>The deposit, when the rest is due, and whether the deposit comes back if plans change.</li>
            <li>The cancellation terms, and what happens if they can’t make it.</li>
            <li>It’s in writing: a contract, or at least an email confirming the price and what’s included.</li>
          </ul>
        </div>
        {quoted.length ? (
          <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#efe6d0]">
            {quoted.map(({ c, t }, i) => (
              <li key={c.v.id} className="py-2 flex items-center gap-3 flex-wrap">
                <span className="flex-1 min-w-[160px]">
                  <strong className="text-[15px]">{c.v.name}</strong>
                  <span className="block text-[13px] text-[#5b6a52]">
                    {aud(c.q!.amount)}
                    {t.levelled !== null && t.levelled !== c.q!.amount ? ` · ${aud(t.levelled)} like for like` : ''}
                    {c.q!.deposit ? ` · deposit ${aud(c.q!.deposit)}` : ''}
                  </span>
                </span>
                <Pill size="sm" kind={i === 0 ? 'primary' : 'secondary'} onClick={() => onBook(c.v.id)}>
                  Book {c.v.name.split(' ')[0]}
                </Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px] text-[#5b6a52]">No quotes in yet.</p>
        )}
      </div>
    );
  }

  const v = booked.v;
  const q = v.quotes.find((x) => x.id === v.accepted) ?? booked.q;
  const saved = q?.before !== undefined && q.before > q.amount ? q.before - q.amount : 0;
  const others = rfq.vendors.map((rv) => ({ rv, o: list.find((x) => x.id === rv.vendorId) })).filter((x) => x.o && x.o.id !== v.id && (x.rv.sentOn || x.rv.answeredOn));
  const thanks = (name: string) =>
    `Hi,\n\nThank you so much for your quote and your time. We've decided to go with someone else this time, but we really appreciated it and wish you all the best.\n\nKind regards,\n${couple}`.replace(/^Hi,/, `Hi ${name},`);
  const depositDone = v.payments.length ? v.payments.some((p) => p.paid) : v.depositPaid;
  return (
    <div className="flex flex-col gap-3">
      <ol className="m-0 p-0 list-none flex flex-col gap-3">
        <li className="flex gap-3 items-start">
          {tick(true)}
          <span className="text-[15px]">
            <strong>Booked {v.name}</strong>
            {q ? ` at ${aud(q.amount)}` : ''}
            {saved > 0 && <span className="block text-[13px] text-[#3d4a2f] font-semibold">You saved {aud(saved)} on their first quote.</span>}
          </span>
        </li>
        <li className="flex gap-3 items-start">
          {tick(depositDone)}
          <span className="flex-1 text-[15px]">
            <strong>Pay the deposit</strong>
            {v.payments.length ? (
              <span className="block text-[13px] text-[#5b6a52]">Your payment schedule is set: tick payments off in Money → Payments.</span>
            ) : (
              <label className="flex items-center gap-2 mt-1 text-[14px] cursor-pointer">
                <input type="checkbox" checked={v.depositPaid} onChange={(e) => onPatch(v.id, { depositPaid: e.target.checked }, e.target.checked ? 'Deposit paid ✓' : undefined)} className="w-[18px] h-[18px] accent-[#5d6b47]" />
                Paid{q?.deposit ? ` (${aud(q.deposit)})` : ''}
              </label>
            )}
          </span>
        </li>
        <li className="flex gap-3 items-start">
          {tick(!!v.contractSigned)}
          <span className="flex-1 text-[15px]">
            <strong>Sign the contract</strong>
            <label className="flex items-center gap-2 mt-1 text-[13px] text-[#5b6a52] flex-wrap">
              Signed on
              <input type="date" value={v.contractSigned} onChange={(e) => onPatch(v.id, { contractSigned: e.target.value }, e.target.value ? 'Contract signed ✓' : undefined)} className={`${inputCls} py-[4px] max-w-[170px]`} />
            </label>
            <button type="button" onClick={() => onOpenVendor(v.id)} className="mt-1 p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
              Add the contract file and cancellation terms on their card
            </button>
          </span>
        </li>
        {!v.payments.length && (
          <li className="flex gap-3 items-start">
            {tick(!!v.balanceDue)}
            <span className="flex-1 text-[15px]">
              <strong>When the rest is due</strong>
              <label className="flex items-center gap-2 mt-1 text-[13px] text-[#5b6a52] flex-wrap">
                Balance due
                <input type="date" value={v.balanceDue} onChange={(e) => onPatch(v.id, { balanceDue: e.target.value })} className={`${inputCls} py-[4px] max-w-[170px]`} />
              </label>
              <span className="block text-[12px] text-[#7a7466]">You’ll get a nudge before it’s due. Paying in instalments? Set them in Money → Payments.</span>
            </span>
          </li>
        )}
        {others.length > 0 && (
          <li className="flex gap-3 items-start">
            {tick(false)}
            <span className="flex-1 text-[15px]">
              <strong>Let the others know</strong>
              <span className="block text-[13px] text-[#5b6a52]">A kind thank-you keeps the door open.</span>
              <ul className="m-0 mt-1 p-0 list-none flex flex-col gap-2">
                {others.map(({ o }) => (
                  <li key={o!.id} className="flex items-center gap-2 flex-wrap text-[14px]">
                    <span className="flex-1 min-w-[120px]">{o!.name}</span>
                    {o!.email && (
                      <a href={`mailto:${encodeURIComponent(o!.email)}?subject=${encodeURIComponent('Thank you for your quote')}&body=${encodeURIComponent(thanks(o!.contact.split(' ')[0] || o!.name))}`} className={small}>
                        Email
                      </a>
                    )}
                    <button
                      type="button"
                      className={small}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(thanks(o!.contact.split(' ')[0] || o!.name));
                          toast('Thank-you copied');
                        } catch {
                          window.prompt('Copy this message', thanks(o!.name));
                        }
                      }}
                    >
                      Copy
                    </button>
                  </li>
                ))}
              </ul>
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}

/** A quote that came some other way: drop the PDF, then one total (or line by line), the deposit and dates. */
function EnterQuote({ rfq, vendor, was, onSave, onCancel }: { rfq: Rfq; vendor: Vendor; was?: Quote; onSave: (q: Quote) => void; onCancel: () => void }) {
  const { overview } = useAdmin();
  const [pkg, setPkg] = useState(was ? !!was.package || !was.lines.length : true);
  const [total, setTotal] = useState(was?.amount ? String(was.amount) : '');
  const [prices, setPrices] = useState<Record<string, string | null>>(() => Object.fromEntries(rfq.lines.map((l) => [l.id, (() => {
    const got = was?.lines.find((x) => x.id === l.id);
    return got ? (got.amount === null ? null : String(got.amount)) : '';
  })()])));
  const [deposit, setDeposit] = useState(was?.deposit ? String(was.deposit) : '');
  const [validUntil, setValidUntil] = useState(was?.validUntil ?? '');
  const [includes, setIncludes] = useState(was?.includes ?? '');
  const [excludes, setExcludes] = useState(was?.excludes ?? '');
  const [file, setFile] = useState({ id: was?.fileId ?? '', name: was?.fileName ?? '' });
  const [extract, setExtract] = useState(was?.extract ?? '');
  const [problem, setProblem] = useState('');
  const num = (s: string | null | undefined) => (s === null || s === undefined || s.trim() === '' ? null : Number(s.replace(/[$,\s]/g, '')));
  const lineTotal = rfq.lines.reduce((a, l) => a + (num(prices[l.id]) ?? 0), 0);
  const save = () => {
    setProblem('');
    const amount = pkg ? num(total) : lineTotal;
    if (!amount || !Number.isFinite(amount) || amount < 0) return setProblem(pkg ? 'Add their total price.' : 'Add at least one price.');
    onSave(
      Quote.parse({
        id: was?.id ?? newId(),
        amount,
        deposit: num(deposit) ?? 0,
        date: dateIn(overview?.wedding.timezone),
        validUntil,
        includes: includes.trim(),
        excludes: excludes.trim(),
        notes: was?.notes ?? '',
        fileId: file.id,
        fileName: file.name,
        extract,
        rfq: rfq.id,
        package: pkg || undefined,
        lines: pkg ? [] : rfq.lines.map((l) => ({ id: l.id, amount: prices[l.id] === null ? null : (num(prices[l.id]) ?? null) })),
      }),
    );
  };
  return (
    <div className="flex flex-col gap-3 p-3 rounded-[12px] border border-[#8a9670] bg-[#fbfcf7]">
      <strong className="text-[15px]">{vendor.name}’s quote</strong>
      <QuoteFile
        fileId={file.id}
        fileName={file.name}
        onFiled={(f) => setFile(f)}
        onRead={(r) => {
          if (r.amount) setTotal(String(r.amount));
          if (r.deposit) setDeposit(String(r.deposit));
          if (r.validUntil) setValidUntil(r.validUntil);
          if (r.includes) setIncludes(r.includes);
          if (r.excludes) setExcludes(r.excludes);
          setExtract(r.extract);
          setPkg(true);
        }}
      />
      <div role="radiogroup" aria-label="How they priced it" className="grid grid-cols-2 gap-2">
        {[
          [true, 'One total'],
          [false, 'Item by item'],
        ].map(([on, t]) => (
          <button key={String(on)} type="button" role="radio" aria-checked={pkg === on} onClick={() => setPkg(on as boolean)} className={`py-2 rounded-[10px] border text-[14px] cursor-pointer ${pkg === on ? 'bg-[#33402f] border-[#33402f] text-[#fbf8f0]' : 'bg-white border-[#d3c6a4] text-[#33402f]'}`}>
            {t}
          </button>
        ))}
      </div>
      {pkg ? (
        <Label text="Their total (AUD)">
          <input inputMode="decimal" value={total} placeholder="e.g. 3800" onChange={(e) => setTotal(e.target.value)} className={`${inputCls} max-w-[200px]`} />
        </Label>
      ) : (
        <div className="flex flex-col gap-2">
          {rfq.lines.map((l) => {
            const out = prices[l.id] === null;
            return (
              <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 items-center text-[14px]">
                <span>{l.label}</span>
                <input inputMode="decimal" disabled={out} aria-label={`${l.label} price`} value={out ? '' : (prices[l.id] ?? '')} placeholder={out ? 'Not included' : '$'} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} className={`${inputCls} py-[6px] disabled:bg-[#f3eee2]`} />
                <label className="col-start-2 flex items-center gap-1 text-[12px] text-[#5b6a52] -mt-1 cursor-pointer">
                  <input type="checkbox" checked={out} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.checked ? null : '' }))} className="accent-[#5d6b47]" />
                  Not included
                </label>
              </div>
            );
          })}
          <span className="text-[14px] font-semibold text-right">Total {aud(lineTotal)}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Label text="Deposit">
          <input inputMode="decimal" value={deposit} placeholder="$0" onChange={(e) => setDeposit(e.target.value)} className={inputCls} />
        </Label>
        <Label text="Price holds until">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
        </Label>
      </div>
      <Label text="What’s included (optional)">
        <textarea rows={2} value={includes} maxLength={1500} onChange={(e) => setIncludes(e.target.value)} className={inputCls} />
      </Label>
      <Label text="Not included, or extra (optional)">
        <textarea rows={2} value={excludes} maxLength={1500} onChange={(e) => setExcludes(e.target.value)} className={inputCls} />
      </Label>
      {problem && (
        <span role="alert" className="text-[13px] text-[#7a4a37]">
          {problem}
        </span>
      )}
      <div className="flex gap-2">
        <Pill kind="primary" size="sm" onClick={save}>
          Save their quote
        </Pill>
        <Pill size="sm" onClick={onCancel}>
          Cancel
        </Pill>
      </div>
    </div>
  );
}

/** Tap a star (tap it again to clear). */
function Stars({ value, label, disabled, onChange }: { value: number; label: string; disabled?: boolean; onChange: (n: number) => void }) {
  return (
    <span role="group" aria-label={label} className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${n} of 5`}
          aria-pressed={value === n}
          onClick={() => onChange(value === n ? 0 : n)}
          className={`w-8 h-8 p-0 border-0 bg-transparent text-[20px] leading-none cursor-pointer disabled:cursor-default ${n <= value ? 'text-[#c08a2b]' : 'text-[#d8cfba]'}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

/**
 * The comparison: a card per vendor who has quoted, best first (by your score once you've rated them, else
 * like-for-like price), then the full line-by-line table on request.
 */
function Comparison({ rfq, cmp, today, onBook, onChange }: { rfq: Rfq; cmp: ReturnType<typeof tenderAnalysis>; today: string; onBook: (vendorId: string) => void; onChange: (next: Rfq, msg?: string) => void }) {
  const { wid } = useAdmin();
  const [table, setTable] = useState(false);
  const rate = (vendorId: string, k: TenderRating, v: number) => onChange({ ...rfq, vendors: rfq.vendors.map((rv) => (rv.vendorId === vendorId ? { ...rv, scores: { ...rv.scores, [k]: v || undefined } } : rv)) });
  const exportCsv = () => {
    const rows = tenderRows(cmp);
    const csv = rows.map((r) => r.map((x) => (typeof x === 'number' ? String(x) : `"${String(x).replace(/"/g, '""')}"`)).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${(rfq.title || 'quotes').replace(/[^\w ]+/g, '').trim() || 'quotes'} comparison.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const rated = cmp.vendors.some((v) => v.rank > 0 && rfq.vendors.some((rv) => rv.vendorId === v.id && Object.values(rv.scores ?? {}).some(Boolean)));
  const cards = cmp.cols
    .map((c, i) => ({ c, t: cmp.totals[i]!, a: cmp.vendors[i]! }))
    .filter((x) => x.c.q)
    .sort((x, y) => (rated ? (y.a.score ?? 0) - (x.a.score ?? 0) : (x.t.levelled ?? Infinity) - (y.t.levelled ?? Infinity)));
  const waitingOn = cmp.cols.filter((c) => !c.q && !c.rv.declinedOn).map((c) => c.v.name);
  const best = cmp.bestValue;
  const top = cmp.topScore;
  const many = cards.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <strong className="text-[16px]">Side by side</strong>
        <label className="flex items-center gap-2 text-[13px] text-[#5b6a52]">
          Your budget for this
          <input type="number" min={0} step={50} value={rfq.budget || ''} placeholder="optional" onChange={(e) => onChange({ ...rfq, budget: Math.max(0, Number(e.target.value) || 0) })} className={`${inputCls} w-[120px] py-[6px]`} />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map(({ c, t, a }, n) => {
          const q = c.q!;
          const isBest = many && best?.id === c.v.id;
          const isTop = many && rated && top?.id === c.v.id;
          const runsOut = q.validUntil && !rfq.closed ? (q.validUntil < today ? 'ran out' : Date.parse(q.validUntil) - Date.parse(today) < 14 * 86_400_000 ? 'runs out soon' : '') : '';
          return (
            <article key={c.v.id} className={`flex flex-col gap-2 p-3 rounded-[14px] border ${n === 0 && many ? 'border-[#8a9670] bg-[#f6f8ef]' : 'border-[#e2d7bc] bg-white'}`}>
              <div className="flex justify-between items-start gap-2">
                <strong className="text-[16px] min-w-0">{c.v.name}</strong>
                <span className="flex gap-1 flex-wrap justify-end">
                  {isBest && <span className="py-[1px] px-2 rounded-full text-[11px] font-semibold bg-[#dfe5cc] text-[#3d4a2f]">Best value</span>}
                  {isTop && <span className="py-[1px] px-2 rounded-full text-[11px] font-semibold bg-[#dde7f3] text-[#2f3d5c]">Your top pick</span>}
                  {c.v.status === 'booked' && <span className="py-[1px] px-2 rounded-full text-[11px] font-semibold bg-[#33402f] text-[#fbf8f0]">Booked</span>}
                </span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-display text-[30px] leading-none">{aud(t.levelled ?? q.amount)}</span>
                {many && a.vsBest !== null && a.vsBest > 0 && <span className="text-[13px] text-[#7a4a37]">+{aud(a.vsBest)} on the best</span>}
              </div>
              <span className="text-[13px] text-[#5b6a52]">
                {q.package
                  ? 'One price for everything you asked.'
                  : t.missing > 0
                    ? `Their price ${aud(q.amount)}, leaving out ${t.missing} ${t.missing === 1 ? 'item' : 'items'}: counted at the typical price, so it compares fairly.`
                    : `Prices every item you asked.`}
                {a.vsBudget !== null && (a.vsBudget > 0 ? ` ${aud(a.vsBudget)} over your budget.` : ` ${aud(-a.vsBudget)} under your budget.`)}
              </span>
              <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-[#7a7466]">Deposit</dt>
                <dd className="m-0">{q.deposit ? aud(q.deposit) : '—'}</dd>
                <dt className="text-[#7a7466]">Price holds until</dt>
                <dd className={`m-0 ${runsOut ? 'text-[#7a4a37] font-semibold' : ''}`}>{q.validUntil ? `${longDay(q.validUntil)}${runsOut ? ` (${runsOut})` : ''}` : '—'}</dd>
              </dl>
              {(q.includes || q.excludes || q.notes) && (
                <details className="text-[13px]">
                  <summary className="cursor-pointer text-[#33402f]">What’s in and out</summary>
                  <div className="whitespace-pre-wrap pt-1 text-[#5b6a52]">{[q.includes && `✓ ${q.includes}`, q.excludes && `✗ ${q.excludes}`, q.notes].filter(Boolean).join('\n\n')}</div>
                </details>
              )}
              <div className="flex flex-col gap-0 pt-1 border-t border-[#efe6d0]">
                {TENDER_RATINGS.map((k) => (
                  <div key={k.key} className="flex items-center justify-between gap-2 text-[13px]" title={k.hint}>
                    <span className="text-[#5b6a52]">{k.label}</span>
                    <Stars value={c.rv.scores?.[k.key] ?? 0} label={`${k.label} for ${c.v.name}`} disabled={rfq.closed} onChange={(v) => rate(c.v.id, k.key, v)} />
                  </div>
                ))}
                {a.score !== null && (
                  <span className="text-[12px] text-[#7a7466] text-right" title={`Price ${TENDER_WEIGHTS.price}%, your ratings ${100 - TENDER_WEIGHTS.price}%`}>
                    Score {a.score}/10
                  </span>
                )}
              </div>
              <div className="flex gap-2 items-center flex-wrap pt-1">
                {!rfq.closed && c.v.status !== 'booked' && (
                  <Pill size="sm" kind={n === 0 ? 'primary' : 'secondary'} onClick={() => onBook(c.v.id)}>
                    Book {c.v.name.split(' ')[0]}
                  </Pill>
                )}
                {q.fileId && (
                  <a href={plannerApi.fileUrl(wid, q.fileId)} target="_blank" rel="noopener" className="text-[13px] !text-[#33402f]">
                    Their quote (file)
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {waitingOn.length > 0 && <span className="text-[13px] text-[#5b6a52]">Still waiting on {waitingOn.join(', ')}.</span>}
      {!rated && many && <span className="text-[12px] text-[#7a7466]">Rate each one with the stars: the order then weighs your feel for them with the price.</span>}

      <div className="flex gap-3 flex-wrap">
        <Pill size="sm" aria-expanded={table} onClick={() => setTable(!table)}>
          {table ? 'Hide' : 'See'} line by line
        </Pill>
        <Pill size="sm" onClick={exportCsv}>
          Export (spreadsheet)
        </Pill>
      </div>
      {table && <LineTable cmp={cmp} />}
    </div>
  );
}

/** Every line's price from each vendor: the lowest marked, and how far each sits from the middle price. */
function LineTable({ cmp }: { cmp: ReturnType<typeof tenderAnalysis> }) {
  const cell = 'py-2 px-3 border-b border-[#efe6d0] text-right whitespace-nowrap';
  const label = 'py-2 px-3 border-b border-[#efe6d0] sticky left-0 bg-white text-left min-w-[150px]';
  return (
    <div className="overflow-x-auto -mx-3 px-3">
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
              <td className={label}>
                {r.line.label}
                {r.lo !== null && r.hi !== null && r.lo !== r.hi && (
                  <span className="block text-[11px] text-[#7a7466]">
                    {aud(r.lo)} to {aud(r.hi)}
                  </span>
                )}
              </td>
              {r.prices.map((p, i) => {
                const q = cmp.cols[i]!.q;
                const v = r.variance[i] ?? null;
                const style =
                  q?.package
                    ? { color: '#5b6a52' }
                    : p !== null && p === r.low
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
                    {!q ? '—' : q.package ? 'In their total' : p === null ? 'Not included' : aud(p)}
                    {q && !q.package && p !== null && v !== null && v !== 0 && r.prices.filter((x) => x !== null).length > 1 && (
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
            <td className={label}>Like for like</td>
            {cmp.totals.map((t, i) => (
              <td key={i} className={cell} style={t.levelled !== null && t.levelled === cmp.best ? { background: '#e6ecd8', fontWeight: 700 } : undefined}>
                {t.levelled === null ? '—' : aud(t.levelled)}
                {t.levelled !== null && t.missing > 0 && <span className="block text-[11px] text-[#8a5a1f] font-normal">{t.missing} not included</span>}
              </td>
            ))}
          </tr>
          <tr>
            <td className={label}>Cheapest on</td>
            {cmp.vendors.map((v, i) => (
              <td key={i} className={cell}>
                {cmp.cols[i]!.q ? (cmp.cols[i]!.q!.package ? '—' : `${v.lowestOn} of ${cmp.rows.length}`) : '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

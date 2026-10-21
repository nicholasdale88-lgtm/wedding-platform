import { allPayments, commitmentOf, dateIn, lineFor, suggestedTasks, vendorKind, type VendorNote, type VendorTask, moneyOf, type Budget as BudgetDoc, QUOTE_STAGES, quoteStatus, VENDOR_STATUS, type QuoteStage, type Quote, type Vendor, type Vendors as VendorsDoc } from '@wp/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, plannerApi } from '../../lib/api';
import { QuoteRequests } from './QuoteRequests';
import { QuoteFile } from './QuoteFile';
import { VendorSchedule } from './Payments';
import { markPaid, ownSchedule } from './paying';
import { saveContacts } from '../../lib/vcard';
import { MoneyInput } from './MoneyInput';
import { useAdmin } from '../Shell';
import { useDocSave } from './useDocSave';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Wedding planner → Vendors, in five steps: 1 add your vendors, 2 get quotes (or enter ones you have),
 * 3 compare (and negotiate), 4 lock in (book; deposit, payment schedule, contract, meals for vendor teams),
 * 5 manage them to the day (payments due, the final check-in, the day's contact sheet).
 * Everyone you're talking to or have booked. File each quote (a PDF or photo;
 * the assistant can read the numbers out of it), accept one, and compare vendors side by side with the
 * assistant's view; get quotes from several at once (QuoteRequests).
 */

const STATUS_LABEL: Record<Vendor['status'], string> = { idea: 'Idea', contacted: 'Contacted', requested: 'Pricing', quoted: 'Quote in', booked: 'Booked', declined: 'Not going ahead' };
const STATUS_COLOUR: Record<Vendor['status'], string> = { idea: '#e9e2cc', contacted: '#f1e7c9', requested: '#f4dfae', quoted: '#dde7f3', booked: '#dfe5cc', declined: '#eadbd5' };
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
  payments: [],
  dirId: '',
  askedOn: '',
  quoteBy: '',
  chasedOn: '',
  declinedWhy: '',
  ...over,
});
const BLANK_QUOTE: Quote = { id: '', amount: 0, deposit: 0, date: '', validUntil: '', includes: '', excludes: '', notes: '', fileId: '', fileName: '', extract: '', rfq: '', lines: [] };
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : u ? `https://${u}` : '');
/** The quote that counts for comparing: the accepted one, else the cheapest. */
const bestQuote = (v: Vendor) => v.quotes.find((q) => q.id === v.accepted) ?? [...v.quotes].sort((a, b) => (a.amount || Infinity) - (b.amount || Infinity))[0];

export function Vendors() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const [doc, setDoc] = useState<{ data: VendorsDoc; version: number } | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  // The budget's lines (read only here): a booked vendor's payment schedule starts from its budget line.
  const [lines, setLines] = useState<BudgetDoc['lines']>([]);
  useEffect(() => {
    plannerApi.doc<BudgetDoc>(wid, 'budget').then((d) => setLines(d.data.lines), () => setLines([]));
  }, [wid]);
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
  const save = async (next: Vendor[], done?: string, rfqs = doc.data.rfqs) => {
    const before = doc;
    setDoc({ ...doc, data: { list: next, rfqs } });
    try {
      const r = await saveDoc({ list: next, rfqs });
      setDoc((d) => (d ? { ...d, version: r.version } : r)); // keep what's on screen: a later change may be on its way
      if (done) toast(done);
      return true;
    } catch (e) {
      setDoc(before);
      // A vendor's answer (or another device) changed it meanwhile: show the latest.
      toast(e instanceof ApiError && e.status === 409 ? 'A quote came in meanwhile: reloaded. Make your change again.' : (e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
      return false;
    }
  };
  const patch = (id: string, p: Partial<Vendor>, done?: string) => void save(list.map((x) => (x.id === id ? { ...x, ...p } : x)), done);
  const booked = list.filter((v) => v.status === 'booked');
  const committed = booked.reduce((a, v) => a + moneyOf(v).total, 0);
  const paid = booked.reduce((a, v) => a + moneyOf(v).paid, 0);

  // The step you're at: no vendors yet → add them; none quoted → get quotes; quotes in → compare; booked and nothing open → lock in.
  const quotesIn = list.some((v) => v.quotes.length > 0);
  const openWithQuotes = doc.data.rfqs.some((r) => !r.closed && r.vendors.some((rv) => rv.answeredOn || rv.quoteId));
  // Booked ones with the deposit paid and the contract signed are locked in: then it's managing them (step 5).
  const lockedIn = booked.length > 0 && booked.every((v) => (v.payments.length ? v.payments.some((p) => p.paid) : v.depositPaid) && !!v.contractSigned);
  const atStep: 1 | 2 | 3 | 4 | 5 = !list.length ? 1 : booked.length && !openWithQuotes ? (lockedIn ? 5 : 4) : quotesIn ? 3 : 2;
  const shown = step ?? atStep;
  const goStep = (n: 1 | 2 | 3 | 4 | 5) => {
    setStep(n);
    document.getElementById('vendor-steps')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const openVendor = (id: string) => {
    setStep(1);
    setOpen(id);
    setTimeout(() => document.getElementById(`vendor-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const today = dateIn(overview?.wedding.timezone);
  const weddingDay = overview?.events[0] ? dateIn(overview.wedding.timezone, new Date(overview.events[0].startsAt)) : '';
  const STEP_INFO: [string, string, string][] = [
    ['Add vendors', `${list.length} ${list.length === 1 ? 'vendor' : 'vendors'}`, 'Everyone you’re thinking of: add them yourself, or find them in the vendor directory.'],
    ['Get quotes', `${list.filter((v) => v.quotes.length).length} quoted`, 'Ask several vendors to price the same list, or enter quotes you already have.'],
    ['Compare', `${doc.data.rfqs.filter((r) => r.vendors.some((rv) => rv.answeredOn || rv.quoteId)).length} to compare`, 'Side by side, like for like. Then ask your favourite for a better price.'],
    ['Lock in', `${booked.length} booked`, 'Book, then the deposit, the payment schedule, the contract, and meals for vendor teams (for your caterer).'],
    ['Manage', `${booked.length} to the day`, 'Your booked vendors until the day: payments due, the final check-in with each, and the day’s contact sheet.'],
  ];

  return (
    <div className="flex flex-col gap-5">
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

      {/* The four steps: done ones ticked, where you're at in bold; tap any to go there. */}
      <nav id="vendor-steps" aria-label="Vendor steps" className="scroll-mt-4">
        <ol className="m-0 p-0 list-none grid grid-cols-5 gap-1 sm:gap-2">
          {STEP_INFO.map(([label, count], i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4 | 5;
            const here = n === shown;
            const done = n < atStep;
            return (
              <li key={label}>
                <button
                  type="button"
                  aria-current={here ? 'step' : undefined}
                  onClick={() => goStep(n)}
                  className={`w-full h-full flex flex-col items-center gap-1 py-2 px-1 rounded-[12px] border cursor-pointer text-center leading-tight ${here ? 'border-[#33402f] bg-[#f3f6ea] text-[#33402f]' : 'border-[#e2d7bc] bg-[#fbf8f0] text-[#5b6a52]'}`}
                >
                  <span aria-hidden className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-semibold ${done ? 'bg-[#5d6b47] text-[#fbf8f0]' : n === atStep ? 'bg-[#33402f] text-[#fbf8f0]' : 'bg-[#efe7d3] text-[#7a7466]'}`}>
                    {done ? '✓' : n}
                  </span>
                  <span className={`text-[11px] sm:text-[14px] ${here ? 'font-semibold' : ''}`}>{label}</span>
                  <span className="hidden sm:block text-[11px] text-[#7a7466]">{count}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="m-0 mt-2 text-[14px] text-[#5b6a52]">
          <strong className="text-[#33402f]">
            Step {shown}: {STEP_INFO[shown - 1]![0]}.
          </strong>{' '}
          {STEP_INFO[shown - 1]![2]}
        </p>
      </nav>

      {shown === 1 && (
        <section aria-label="Your vendors" className="flex flex-col gap-3">
          <div className="flex justify-between items-end gap-3 flex-wrap">
            <H2>Your vendors</H2>
            <span className="flex gap-2 flex-wrap">
              {list.some((v) => v.phone || v.email) && (
                <Pill
                  onClick={() => {
                    const which = booked.some((v) => v.phone || v.email) ? booked : list;
                    saveContacts(
                      which.map((v) => ({ name: v.contact ? `${v.contact} (${v.name})` : v.name, org: v.name, title: v.category, phone: v.phone, email: v.email, website: v.website, address: v.address, note: v.arrival ? `Arrives on the day: ${v.arrival}` : '' })),
                      'wedding-vendors',
                    );
                    toast(`${which.length} ${which === booked ? 'booked ' : ''}vendors ready to add to your phone's contacts`);
                  }}
                >
                  Save to phone contacts
                </Pill>
              )}
              <Pill
                kind="primary"
                onClick={() => {
                  const v = newVendor({ name: 'New vendor' });
                  setOpen(v.id);
                  void save([...list, v]);
                }}
              >
                + Add a vendor
              </Pill>
            </span>
          </div>
          <p className="m-0 text-[13px] text-[#5b6a52]">
            Their name, what they do and an email or mobile is all a quote request needs. Looking for ideas?{' '}
            <a href="/vendors" target="_blank" rel="noopener" className="!text-[#33402f]">
              Browse the vendor directory
            </a>
            .
          </p>
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
          {!list.length && <p className="m-0 p-4 rounded-[14px] bg-[#fbf8f0] border border-[#e2d7bc] text-[14px] text-[#5b6a52]">No vendors yet. Tap + Add a vendor for each one you’re thinking of.</p>}
          {list.length > 0 && (
            <Pill kind="primary" className="self-start" onClick={() => goStep(2)}>
              Next: get quotes →
            </Pill>
          )}
        </section>
      )}

      {shown === 2 && (
        <>
          <QuoteRequests mode="quotes" list={list} rfqs={doc.data.rfqs} onSave={(l, r, msg) => save(l, msg, r)} onReload={load} onOpen={openVendor} onStep={goStep} />
          <QuoteTracker list={list} onPatch={(id, p, msg) => patch(id, p, msg)} onOpen={openVendor} />
          {quotesIn && (
            <Pill kind="primary" className="self-start" onClick={() => goStep(3)}>
              Next: compare quotes →
            </Pill>
          )}
        </>
      )}

      {shown === 3 && (
        <>
          <QuoteRequests mode="compare" list={list} rfqs={doc.data.rfqs} onSave={(l, r, msg) => save(l, msg, r)} onReload={load} onOpen={openVendor} onStep={goStep} />
          <Compare list={list} />
          <Pill kind="primary" className="self-start" onClick={() => goStep(4)}>
            Next: lock it in →
          </Pill>
        </>
      )}

      {shown === 4 && (
        <>
          {doc.data.rfqs.some((r) => r.vendors.some((rv) => rv.answeredOn || rv.quoteId)) && (
            <QuoteRequests mode="lockin" list={list} rfqs={doc.data.rfqs} onSave={(l, r, msg) => save(l, msg, r)} onReload={load} onOpen={openVendor} onStep={goStep} />
          )}
          <LockedIn list={list} lines={lines} today={today} weddingDay={weddingDay} onPatch={patch} onOpen={openVendor} onStep={goStep} />
          {booked.length > 0 && (
            <Pill kind="primary" className="self-start" onClick={() => goStep(5)}>
              Next: manage them to the day →
            </Pill>
          )}
        </>
      )}

      {shown === 5 && <Manage list={list} lines={lines} today={today} weddingDay={weddingDay} onPatch={patch} onSaveList={(next, done) => void save(next, done)} onOpen={openVendor} onStep={goStep} />}
    </div>
  );
}

/**
 * Step 4 for every booked vendor: what's left to lock them in, ticked off as you go: the deposit, the
 * payment schedule (split into instalments in a tap), the contract (signed, the file, cancellation), their
 * page (with the seating and special meals for the caterer), and meals for their team on the day, which
 * the caterer sees, all added up.
 */
function LockedIn({
  list,
  lines,
  today,
  weddingDay,
  onPatch,
  onOpen,
  onStep,
}: {
  list: Vendor[];
  lines: BudgetDoc['lines'];
  today: string;
  weddingDay: string;
  onPatch: (id: string, p: Partial<Vendor>, done?: string) => void;
  onOpen: (id: string) => void;
  onStep: (n: 1 | 2 | 3 | 4) => void;
}) {
  const booked = list.filter((v) => v.status === 'booked');
  const [schedule, setSchedule] = useState<string | null>(null);
  const meals = booked.reduce((a, v) => a + v.meals, 0);
  const caterers = booked.filter((v) => v.shareSeating || /cater|venue/i.test(`${v.category} ${v.name}`));
  if (!booked.length)
    return (
      <p className="m-0 p-4 rounded-[14px] bg-[#fbf8f0] border border-[#e2d7bc] text-[14px] text-[#5b6a52]">
        Nobody booked yet. Book from your quotes above, or{' '}
        <button type="button" onClick={() => onStep(1)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
          mark a vendor as booked (step 1)
        </button>
        .
      </p>
    );
  const tick = (on: boolean) => (
    <span aria-hidden className={`flex-none w-6 h-6 rounded-full flex items-center justify-center text-[13px] ${on ? 'bg-[#5d6b47] text-[#fbf8f0]' : 'border-2 border-[#c6b794]'}`}>
      {on ? '✓' : ''}
    </span>
  );
  return (
    <section aria-label="Booked vendors" className="flex flex-col gap-3">
      <H2>Your booked vendors</H2>
      <div className="flex flex-col gap-1 p-3 rounded-[14px] bg-[#f3f6ea] border border-[#c9d4b0] text-[14px]">
        <strong>
          Vendor meals on the day: {meals} {meals === 1 ? 'meal' : 'meals'}
        </strong>
        <span className="text-[#5b6a52]">
          {meals
            ? `${booked.filter((v) => v.meals).map((v) => `${v.name} ${v.meals}`).join(', ')}. `
            : 'Add how many of each vendor’s team need a meal (below). '}
          {caterers.length
            ? `${caterers.map((v) => v.name).join(' and ')} ${caterers.length === 1 ? 'sees' : 'see'} this on their page, with the seating and special meals when you share them.`
            : 'Tell your caterer: tick “Share the seating and special meals” on their card and they see it all on their page.'}
        </span>
      </div>
      {booked.map((v) => {
        const m = moneyOf(v, lineFor(v, lines));
        const depositDone = v.payments.length ? v.payments.some((p) => p.paid) : v.depositPaid;
        const scheduled = v.payments.length > 0;
        const steps = [depositDone, scheduled, !!v.contractSigned, v.meals > 0 || !!v.arrival];
        const done = steps.filter(Boolean).length;
        return (
          <article key={v.id} className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <div className="flex justify-between items-baseline gap-2 flex-wrap">
              <span>
                <strong className="text-[17px]">{v.name}</strong>
                {v.category && <span className="text-[13px] text-[#5b6a52]"> · {v.category}</span>}
              </span>
              <span className="text-[13px] text-[#5b6a52]">
                {aud(m.total)} · {aud(m.paid)} paid · {done} of 4 done
              </span>
            </div>
            <ol className="m-0 p-0 list-none flex flex-col gap-3">
              <li className="flex gap-3 items-start">
                {tick(depositDone)}
                <span className="flex-1 text-[15px]">
                  <strong>Deposit</strong>
                  {scheduled ? (
                    <span className="block text-[13px] text-[#5b6a52]">{depositDone ? 'Paid ✓ (in the schedule below).' : 'Tick it paid in the schedule below.'}</span>
                  ) : (
                    <label className="flex items-center gap-2 mt-1 text-[14px] cursor-pointer">
                      <input type="checkbox" checked={v.depositPaid} onChange={(e) => onPatch(v.id, { depositPaid: e.target.checked }, e.target.checked ? `${v.name}: deposit paid ✓` : undefined)} className="w-[18px] h-[18px] accent-[#5d6b47]" />
                      Paid{commitmentOf(v).deposit ? ` (${aud(commitmentOf(v).deposit)})` : ''}
                    </label>
                  )}
                </span>
              </li>
              <li className="flex gap-3 items-start">
                {tick(scheduled)}
                <span className="flex-1 min-w-0 text-[15px]">
                  <strong>Payment schedule</strong>
                  <span className="block text-[13px] text-[#5b6a52]">{scheduled ? 'Set. You’ll get a nudge before each payment.' : 'The deposit and balance, or split into monthly payments. You’ll get a nudge before each.'}</span>
                  <VendorSchedule
                    v={v}
                    lines={lines}
                    today={today}
                    wedding={weddingDay}
                    open={schedule === v.id}
                    onToggle={() => setSchedule(schedule === v.id ? null : v.id)}
                    edit={(fn) => onPatch(v.id, { payments: fn(ownSchedule(v, lines)) }, 'Payment schedule saved')}
                  />
                </span>
              </li>
              <li className="flex gap-3 items-start">
                {tick(!!v.contractSigned)}
                <span className="flex-1 min-w-0 text-[15px]">
                  <strong>Contract</strong>
                  <span className="block text-[13px] text-[#5b6a52] mb-1">When it was signed, the file, and what happens if anyone cancels.</span>
                  <Contract v={v} onChange={(p) => onPatch(v.id, p)} />
                </span>
              </li>
              <li className="flex gap-3 items-start">
                {tick(v.meals > 0 || !!v.arrival)}
                <span className="flex-1 text-[15px]">
                  <strong>On the day</strong>
                  <span className="grid gap-2 grid-cols-2 mt-1 max-w-[420px]">
                    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                      Meals for their team
                      <input type="number" min={0} max={50} value={v.meals} onChange={(e) => onPatch(v.id, { meals: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                      Arriving at
                      <input defaultValue={v.arrival} placeholder="e.g. 11:00am" onBlur={(e) => e.target.value !== v.arrival && onPatch(v.id, { arrival: e.target.value.slice(0, 20) })} className={inputCls} />
                    </label>
                  </span>
                </span>
              </li>
            </ol>
            <TheirPage v={v} onChange={(p, msg) => onPatch(v.id, p, msg)} />
            <button type="button" onClick={() => onOpen(v.id)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
              Their details and notes
            </button>
          </article>
        );
      })}
    </section>
  );
}

/**
 * Step 5, Manage: your booked vendors from now to the day, and after it.
 * - At a glance: days to go, what's paid and still owing, tasks done, vendors confirmed.
 * - Needs you: payments due in the next month (Mark paid), tasks due in the next fortnight or overdue
 *   (Done), contracts not signed, arrival times missing, the final check-in with each vendor in the last
 *   three weeks; after the day, the wrap-up (final balances, hired items back, reviews).
 * - Each vendor: call, text, email; what's paid and what's next; then, opened: their tasks (with the
 *   usual ones for their kind, dated back from the day: the shot list for the photographer, final numbers
 *   for the caterer…), notes of calls and what was agreed, payments, files, and the final check-in.
 * - The day's contact sheet to print, and everyone to your phone's contacts.
 */
function Manage({
  list,
  lines,
  today,
  weddingDay,
  onPatch,
  onSaveList,
  onOpen,
  onStep,
}: {
  list: Vendor[];
  lines: BudgetDoc['lines'];
  today: string;
  weddingDay: string;
  onPatch: (id: string, p: Partial<Vendor>, done?: string) => void;
  onSaveList: (next: Vendor[], done?: string) => void;
  onOpen: (id: string) => void;
  onStep: (n: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const { overview } = useAdmin();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'tasks' | 'notes' | 'payments' | 'files' | 'checkin'>('tasks');
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const booked = list.filter((v) => v.status === 'booked').sort((a, b) => (a.arrival || '99').localeCompare(b.arrival || '99') || a.name.localeCompare(b.name));
  if (!booked.length)
    return (
      <p className="m-0 p-4 rounded-[14px] bg-[#fbf8f0] border border-[#e2d7bc] text-[14px] text-[#5b6a52]">
        Once you’ve booked vendors, they’re all here to keep on track until the day.{' '}
        <button type="button" onClick={() => onStep(4)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
          Lock in (step 4)
        </button>
      </p>
    );
  const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const toGo = weddingDay ? days(today, weddingDay) : null;
  const after = toGo !== null && toGo < 0;
  const couple = overview ? `${overview.wedding.name1.split(' ')[0]} & ${overview.wedding.name2.split(' ')[0]}` : 'us';
  const ev = overview?.events[0];
  const guests = overview?.perEvent?.find((e) => e.key === ev?.key)?.coming ?? 0;
  const dayText = ev ? new Date(ev.startsAt).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: overview?.wedding.timezone }) : 'the day';
  const ctx = { couple, dayText, venue: ev?.venue ?? '', guests };
  const pays = allPayments(lines, list).filter((p) => p.vendorId && !p.paid && p.amount > 0);
  const money = booked.map((v) => moneyOf(v, lineFor(v, lines)));
  const total = money.reduce((a, m) => a + m.total, 0);
  const paidSum = money.reduce((a, m) => a + m.paid, 0);
  const allTasks = booked.flatMap((v) => (v.tasks ?? []).map((t) => ({ v, t })));
  const confirmed = booked.filter((v) => v.confirmedOn).length;
  const checkInDue = toGo !== null && toGo <= 21 && toGo >= 0;

  const setTasks = (v: Vendor, tasks: VendorTask[], done?: string) => onPatch(v.id, { tasks }, done);
  const addNote = (v: Vendor, kind: VendorNote['kind'], text: string) => onPatch(v.id, { log: [{ id: newId(), on: today, kind, text: text.slice(0, 1000) }, ...(v.log ?? [])].slice(0, 200) }, 'Noted');
  const open = (id: string, t: typeof tab) => {
    setOpenId(id);
    setTab(t);
    setTimeout(() => document.getElementById(`manage-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  type Item = { key: string; vendorId: string; text: string; tone: 'late' | 'soon' | 'todo'; action: { label: string; run: () => void } };
  const items: Item[] = [
    ...pays
      .filter((p) => p.due && p.due <= plus(today, 30))
      .sort((a, b) => a.due.localeCompare(b.due))
      .map(
        (p): Item => ({
          key: `pay:${p.key}`,
          vendorId: p.vendorId,
          text: `Pay ${p.who} ${aud(p.amount)}${p.label && p.label !== 'Payment' ? ` (${p.label.toLowerCase()})` : ''}: ${p.due < today ? `overdue since ${shortDate(p.due)}` : `due ${shortDate(p.due)}`}`,
          tone: p.due < today ? 'late' : 'soon',
          action: { label: 'Mark paid', run: () => onSaveList(markPaid(p, true, list, lines, today).vendors, `${p.who}: ${aud(p.amount)} paid ✓`) },
        }),
      ),
    ...allTasks
      .filter(({ t }) => !t.done && t.due && t.due <= plus(today, 14))
      .sort((a, b) => a.t.due.localeCompare(b.t.due))
      .map(
        ({ v, t }): Item => ({
          key: `task:${v.id}:${t.id}`,
          vendorId: v.id,
          text: `${v.name}: ${t.text} (${t.due < today ? `overdue since ${shortDate(t.due)}` : `by ${shortDate(t.due)}`})`,
          tone: t.due < today ? 'late' : 'soon',
          action: { label: 'Done', run: () => setTasks(v, (v.tasks ?? []).map((x) => (x.id === t.id ? { ...x, done: true } : x)), `${t.text} ✓`) },
        }),
      ),
    ...booked.filter((v) => !v.contractSigned).map((v): Item => ({ key: `contract:${v.id}`, vendorId: v.id, text: `Sign ${v.name}’s contract`, tone: 'todo', action: { label: 'Lock in', run: () => onStep(4) } })),
    ...(toGo !== null && toGo <= 60 && !after ? booked.filter((v) => !v.arrival).map((v): Item => ({ key: `arrive:${v.id}`, vendorId: v.id, text: `When does ${v.name} arrive on the day?`, tone: 'todo', action: { label: 'Add it', run: () => open(v.id, 'checkin') } })) : []),
    ...(checkInDue ? booked.filter((v) => !v.confirmedOn).map((v): Item => ({ key: `confirm:${v.id}`, vendorId: v.id, text: `Final check-in with ${v.name}`, tone: 'soon', action: { label: 'Write it', run: () => open(v.id, 'checkin') } })) : []),
    ...(after ? booked.filter((v) => !v.wrapped).map((v): Item => ({ key: `wrap:${v.id}`, vendorId: v.id, text: `Wrap up with ${v.name}: final balance, anything hired back, a thank-you or review`, tone: 'todo', action: { label: 'All done', run: () => onPatch(v.id, { wrapped: true }, `${v.name}: wrapped up ✓`) } })) : []),
  ];
  const TONE = { late: 'border-[#d9a99a] bg-[#f6e2db]', soon: 'border-[#ecd9ae] bg-[#fbf3e1]', todo: 'border-[#e2d7bc] bg-white' } as const;
  const needs = new Set(items.map((i) => i.vendorId));
  const shownVendors = filter === 'attention' ? booked.filter((v) => needs.has(v.id)) : booked;

  /** The day's contact sheet, printed: who, what, when they arrive, and their numbers. */
  const printSheet = () => {
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to print the contact sheet');
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Vendor contacts</title><style>body{font:14px system-ui,sans-serif;color:#222;margin:24px}h1{font:400 26px Georgia,serif;margin:0 0 4px}p{margin:0 0 16px;color:#555}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:8px 6px;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#555}</style>
<h1>Vendors on the day</h1><p>${esc(couple)} · ${esc(dayText)}${ev?.venue ? ` · ${esc(ev.venue)}` : ''}</p>
<table><tr><th>Arrives</th><th>Vendor</th><th>Contact</th><th>Phone</th><th>Meals</th><th>Still to pay</th></tr>${booked
      .map((v, i) => `<tr><td>${esc(v.arrival || '—')}</td><td><strong>${esc(v.name)}</strong><br>${esc(v.category)}</td><td>${esc(v.contact || '')}<br>${esc(v.email)}</td><td>${esc(v.phone)}</td><td>${v.meals || ''}</td><td>${money[i]!.owing ? esc(aud(money[i]!.owing)) : 'Paid'}</td></tr>`)
      .join('')}</table><script>window.onload=()=>window.print()</script>`);
    w.document.close();
  };

  return (
    <section aria-label="Manage your vendors" className="flex flex-col gap-4">
      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        {[
          [toGo === null ? '—' : after ? 'Done' : String(toGo), toGo === null ? 'No date yet' : after ? 'The day has been' : toGo === 1 ? 'day to go' : 'days to go'],
          [aud(total - paidSum), `still to pay of ${aud(total)}`],
          [`${allTasks.filter((x) => x.t.done).length}/${allTasks.length}`, 'tasks done'],
          [`${confirmed}/${booked.length}`, 'confirmed the details'],
        ].map(([n, label]) => (
          <div key={label} className="flex flex-col gap-1 p-3 rounded-[14px] border border-[#e2d7bc] bg-white">
            <span className="font-display text-[26px] leading-none">{n}</span>
            <span className="text-[12px] text-[#5b6a52]">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-baseline gap-2 flex-wrap">
          <strong className="text-[16px]">{items.length ? `Needs you (${items.length})` : 'Nothing needs you right now ✓'}</strong>
          {!after && toGo !== null && toGo > 21 && <span className="text-[12px] text-[#7a7466]">The final check-ins appear here three weeks before the day.</span>}
        </div>
        {items.slice(0, 12).map((it) => (
          <div key={it.key} className={`flex items-center gap-3 flex-wrap p-3 rounded-[12px] border text-[14px] ${TONE[it.tone]}`}>
            <span className="flex-1 min-w-[180px]">{it.text}</span>
            <Pill size="sm" kind={it.tone === 'late' ? 'primary' : 'secondary'} onClick={it.action.run}>
              {it.action.label}
            </Pill>
          </div>
        ))}
        {items.length > 12 && <span className="text-[13px] text-[#5b6a52]">And {items.length - 12} more below, by vendor.</span>}
      </div>

      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div className="flex gap-1" role="radiogroup" aria-label="Show">
          {(
            [
              ['all', `All ${booked.length}`],
              ['attention', `Need you (${needs.size})`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${filter === k ? 'bg-[#33402f] border-[#33402f] text-[#fbf8f0]' : 'bg-white border-[#c6b794] text-[#33402f]'}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="flex gap-2 flex-wrap">
          <Pill
            size="sm"
            onClick={() => {
              saveContacts(
                booked.map((v) => ({ name: v.contact ? `${v.contact} (${v.name})` : v.name, org: v.name, title: v.category, phone: v.phone, email: v.email, website: v.website, address: v.address, note: v.arrival ? `Arrives on the day: ${v.arrival}` : '' })),
                'wedding-vendors',
              );
              toast(`${booked.length} vendors ready to add to your phone's contacts`);
            }}
          >
            Save to phone contacts
          </Pill>
          <Pill size="sm" onClick={printSheet}>
            Print the day’s contact sheet
          </Pill>
        </span>
      </div>

      <ul className="m-0 p-0 list-none flex flex-col gap-3">
        {shownVendors.map((v) => {
          const m = moneyOf(v, lineFor(v, lines));
          const pct = m.total ? Math.round((m.paid / m.total) * 100) : 0;
          const tasks = v.tasks ?? [];
          const isOpen = openId === v.id;
          const mine = items.filter((i) => i.vendorId === v.id).length;
          return (
            <li key={v.id} id={`manage-${v.id}`} className={`flex flex-col gap-2 p-4 rounded-[16px] border scroll-mt-4 ${isOpen ? 'border-[#8a9670] bg-[#f6f8ef]' : 'border-[#e2d7bc] bg-[#fbf8f0]'}`}>
              <button type="button" aria-expanded={isOpen} onClick={() => (isOpen ? setOpenId(null) : open(v.id, 'tasks'))} className="flex justify-between items-baseline gap-2 flex-wrap p-0 border-0 bg-transparent text-left cursor-pointer text-[#33402f]">
                <span>
                  <strong className="text-[16px]">{v.name}</strong>
                  {v.category && <span className="text-[13px] text-[#5b6a52]"> · {v.category}</span>}
                  {mine > 0 && <span className="ml-2 py-[1px] px-2 rounded-full text-[11px] font-semibold bg-[#f4dfae] text-[#6b4f1d]">{mine} to do</span>}
                  {v.confirmedOn && <span className="ml-2 py-[1px] px-2 rounded-full text-[11px] font-semibold bg-[#dfe5cc] text-[#3d4a2f]">Confirmed</span>}
                </span>
                <span className="text-[13px] text-[#5b6a52]">
                  {v.arrival ? `Arrives ${v.arrival}` : 'Arrival not set'} {isOpen ? '▴' : '▾'}
                </span>
              </button>
              <span className="h-[6px] rounded-full bg-[#e9e2cc] overflow-hidden">
                <span className="block h-full bg-[#5d6b47]" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-[13px] text-[#5b6a52]">
                {aud(m.paid)} of {aud(m.total)} paid
                {m.next ? ` · next ${aud(m.next.amount)} ${m.next.due ? shortDate(m.next.due) : '(no date)'}` : m.total ? ' · all paid ✓' : ''} · contract {v.contractSigned ? '✓' : 'not signed'} · {tasks.filter((t) => t.done).length}/{tasks.length} tasks
                {v.meals ? ` · ${v.meals} team ${v.meals === 1 ? 'meal' : 'meals'}` : ''}
              </span>
              <div className="flex gap-2 flex-wrap text-[13px]">
                {v.phone && (
                  <a href={`tel:${v.phone.replace(/[^\d+]/g, '')}`} onClick={() => addNote(v, 'call', 'Called')} className="py-[6px] px-3 rounded-full border border-[#c6b794] bg-white no-underline !text-[#33402f]">
                    Call
                  </a>
                )}
                {v.phone && (
                  <a href={`sms:${v.phone.replace(/[^\d+]/g, '')}`} className="py-[6px] px-3 rounded-full border border-[#c6b794] bg-white no-underline !text-[#33402f]">
                    Text
                  </a>
                )}
                {v.email && (
                  <a href={`mailto:${encodeURIComponent(v.email)}`} className="py-[6px] px-3 rounded-full border border-[#c6b794] bg-white no-underline !text-[#33402f]">
                    Email
                  </a>
                )}
              </div>

              {isOpen && (
                <div className="flex flex-col gap-3 pt-2 border-t border-[#e2d7bc]">
                  <div role="tablist" aria-label={`${v.name}`} className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
                    {(
                      [
                        ['tasks', `Tasks (${tasks.filter((t) => !t.done).length})`],
                        ['notes', `Notes (${(v.log ?? []).length})`],
                        ['payments', 'Payments'],
                        ['files', 'Files'],
                        ['checkin', 'Check-in'],
                      ] as const
                    ).map(([k, label]) => (
                      <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-none py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${tab === k ? 'bg-[#33402f] border-[#33402f] text-[#fbf8f0]' : 'bg-white border-[#c6b794] text-[#33402f]'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {tab === 'tasks' && <Tasks v={v} today={today} weddingDay={weddingDay} onSet={(t, msg) => setTasks(v, t, msg)} />}
                  {tab === 'notes' && <Notes v={v} onAdd={(k, t) => addNote(v, k, t)} onRemove={(id) => onPatch(v.id, { log: (v.log ?? []).filter((n) => n.id !== id) })} />}
                  {tab === 'payments' && (
                    <VendorSchedule v={v} lines={lines} today={today} wedding={weddingDay} open onToggle={() => setTab('tasks')} edit={(fn) => onPatch(v.id, { payments: fn(ownSchedule(v, lines)) }, 'Payment schedule saved')} />
                  )}
                  {tab === 'files' && <Files v={v} />}
                  {tab === 'checkin' && (
                    <CheckIn
                      v={v}
                      ctx={ctx}
                      onArrival={(a) => onPatch(v.id, { arrival: a })}
                      onDone={() => {
                        onPatch(v.id, { confirmedOn: today, log: [{ id: newId(), on: today, kind: 'note' as const, text: 'Confirmed the final details' }, ...(v.log ?? [])].slice(0, 200) }, `${v.name}: confirmed ✓`);
                        setTab('tasks');
                      }}
                      onClose={() => setTab('tasks')}
                    />
                  )}
                  <div className="flex gap-4 flex-wrap text-[13px]">
                    <TheirPage v={v} onChange={(p, msg) => onPatch(v.id, p, msg)} />
                    <button type="button" onClick={() => onOpen(v.id)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                      Their details
                    </button>
                    {after && !v.wrapped && (
                      <button type="button" onClick={() => onPatch(v.id, { wrapped: true }, `${v.name}: wrapped up ✓`)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                        Mark wrapped up
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A vendor's tasks: tick off, date, add your own, or add the usual ones for their kind in a tap. */
function Tasks({ v, today, weddingDay, onSet }: { v: Vendor; today: string; weddingDay: string; onSet: (tasks: VendorTask[], msg?: string) => void }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const tasks = [...(v.tasks ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999'));
  const usual = suggestedTasks(v, weddingDay);
  const kind = vendorKind(v);
  const set = (id: string, p: Partial<VendorTask>) => onSet((v.tasks ?? []).map((t) => (t.id === id ? { ...t, ...p } : t)));
  return (
    <div className="flex flex-col gap-2">
      {usual.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap p-3 rounded-[12px] bg-white border border-dashed border-[#a9b98d] text-[14px]">
          <span className="flex-1 min-w-[180px]">
            The usual for {kind ? `a ${kind.toLowerCase().replace(/^band or dj$/, 'band or DJ')}` : 'any vendor'}: {usual.map((u) => u.text.toLowerCase()).join(', ')}.
          </span>
          <Pill size="sm" kind="primary" onClick={() => onSet([...(v.tasks ?? []), ...usual.map((u) => ({ id: newId(), text: u.text, due: u.due, done: false }))].slice(0, 60), `${usual.length} tasks added`)}>
            Add {usual.length === 1 ? 'it' : `all ${usual.length}`}
          </Pill>
        </div>
      )}
      {tasks.length === 0 && <span className="text-[13px] text-[#5b6a52]">No tasks yet.</span>}
      <ul className="m-0 p-0 list-none flex flex-col">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-2 border-b border-[#efe6d0] text-[14px] flex-wrap">
            <input type="checkbox" checked={t.done} aria-label={t.text} onChange={(e) => set(t.id, { done: e.target.checked })} className="w-[20px] h-[20px] accent-[#5d6b47]" />
            <span className={`flex-1 min-w-[150px] ${t.done ? 'line-through text-[#9a9284]' : ''}`}>{t.text}</span>
            <input
              type="date"
              value={t.due}
              aria-label={`${t.text}: by when`}
              onChange={(e) => set(t.id, { due: e.target.value })}
              className={`py-[4px] px-2 rounded-[8px] border text-[13px] ${!t.done && t.due && t.due < today ? 'border-[#c98f78] bg-[#f6e2db]' : 'border-[#d3c6a4] bg-white'}`}
            />
            <button type="button" aria-label={`Remove ${t.text}`} onClick={() => onSet((v.tasks ?? []).filter((x) => x.id !== t.id))} className="w-8 h-8 rounded-full border border-[#d3c6a4] bg-white cursor-pointer text-[#7a4a37]">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 flex-wrap items-center">
        <input value={text} maxLength={200} placeholder="Add a task, e.g. Send the run sheet" aria-label="New task" onChange={(e) => setText(e.target.value)} className={`${inputCls} flex-1 min-w-[200px]`} />
        <input type="date" value={due} aria-label="New task: by when" onChange={(e) => setDue(e.target.value)} className={`${inputCls} w-[160px]`} />
        <Pill
          size="sm"
          disabled={!text.trim()}
          onClick={() => {
            onSet([...(v.tasks ?? []), { id: newId(), text: text.trim(), due, done: false }].slice(0, 60), 'Task added');
            setText('');
            setDue('');
          }}
        >
          Add
        </Pill>
      </div>
    </div>
  );
}

/** Notes of calls, emails, meetings and what was agreed, newest first. */
function Notes({ v, onAdd, onRemove }: { v: Vendor; onAdd: (kind: VendorNote['kind'], text: string) => void; onRemove: (id: string) => void }) {
  const [kind, setKind] = useState<VendorNote['kind']>('call');
  const [text, setText] = useState('');
  const LABEL: Record<VendorNote['kind'], string> = { call: 'Call', email: 'Email', meeting: 'Meeting', note: 'Note' };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="What kind">
        {(Object.keys(LABEL) as VendorNote['kind'][]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`py-[4px] px-3 rounded-full border text-[12px] cursor-pointer ${kind === k ? 'bg-[#33402f] border-[#33402f] text-[#fbf8f0]' : 'bg-white border-[#c6b794] text-[#33402f]'}`}>
            {LABEL[k]}
          </button>
        ))}
      </div>
      <textarea rows={2} value={text} maxLength={1000} placeholder="What was said or agreed, e.g. Confirmed 11am arrival; they’ll bring their own extension leads" aria-label="New note" onChange={(e) => setText(e.target.value)} className={inputCls} />
      <Pill
        size="sm"
        className="self-start"
        disabled={!text.trim()}
        onClick={() => {
          onAdd(kind, text.trim());
          setText('');
        }}
      >
        Save note
      </Pill>
      <ul className="m-0 p-0 list-none flex flex-col">
        {(v.log ?? []).map((n) => (
          <li key={n.id} className="flex gap-2 py-2 border-b border-[#efe6d0] text-[14px]">
            <span className="flex-none w-[92px] text-[12px] text-[#7a7466]">
              {shortDate(n.on)}
              <span className="block">{LABEL[n.kind]}</span>
            </span>
            <span className="flex-1 whitespace-pre-wrap">{n.text}</span>
            <button type="button" aria-label="Remove note" onClick={() => onRemove(n.id)} className="p-0 border-0 bg-transparent cursor-pointer text-[#9a9284]">
              ×
            </button>
          </li>
        ))}
        {!(v.log ?? []).length && <li className="text-[13px] text-[#5b6a52]">Nothing noted yet. Calls you make from here are noted for you.</li>}
      </ul>
    </div>
  );
}

/** Everything filed for a vendor: their quotes (with the files they came with) and the contract. */
function Files({ v }: { v: Vendor }) {
  const { wid } = useAdmin();
  const files = [
    ...v.quotes.filter((q) => q.fileId).map((q) => ({ id: q.fileId, name: q.fileName || 'Quote', what: `Quote ${q.amount ? aud(q.amount) : ''}${q.id === v.accepted ? ' (accepted)' : ''}` })),
    ...(v.contractFileId ? [{ id: v.contractFileId, name: v.contractFileName || 'Contract', what: `Contract${v.contractSigned ? `, signed ${shortDate(v.contractSigned)}` : ''}` }] : []),
  ];
  if (!files.length) return <span className="text-[13px] text-[#5b6a52]">No files yet. Quotes keep the PDF they came with; add the contract in Lock in (step 4).</span>;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-3 p-2 rounded-[10px] bg-white border border-[#ece3cd] text-[14px]">
          <span aria-hidden>📎</span>
          <span className="flex-1 min-w-0">
            <span className="block truncate">{f.name}</span>
            <span className="text-[12px] text-[#7a7466]">{f.what}</span>
          </span>
          <a href={plannerApi.fileUrl(wid, f.id)} target="_blank" rel="noopener" className="text-[13px] !text-[#33402f]">
            Open
          </a>
        </li>
      ))}
    </ul>
  );
}

type CheckCtx = { couple: string; dayText: string; venue: string; guests: number };
/** The final check-in message: everything they need, for them to confirm. */
const checkInText = (v: Vendor, c: CheckCtx, link: string) =>
  [
    `Hi${v.contact ? ` ${v.contact.split(' ')[0]}` : ''},`,
    '',
    `Not long now! Just confirming the details for ${c.couple}'s wedding on ${c.dayText}${c.venue ? ` at ${c.venue}` : ''}.`,
    v.arrival ? `We have you arriving at ${v.arrival}.` : 'What time will you arrive?',
    c.guests ? `We’re expecting ${c.guests} guests.` : '',
    v.meals ? `There’ll be ${v.meals} ${v.meals === 1 ? 'meal' : 'meals'} for your team.` : '',
    link ? `Everything else (the timeline, who to call on the day, your payments) is on your page, kept up to date: ${link}` : '',
    '',
    'Could you confirm all is good, and let us know if you need anything else from us?',
    '',
    'Thanks so much,',
    c.couple,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

/** The final check-in with one vendor: their arrival time, then the message to send, then "They confirmed". */
function CheckIn({ v, ctx, onArrival, onDone, onClose }: { v: Vendor; ctx: CheckCtx; onArrival: (a: string) => void; onDone: () => void; onClose: () => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  // Their page, for the message (it works without it too).
  const [link, setLink] = useState('');
  const [edited, setEdited] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    plannerApi.vendorHub(wid, v.id).then(
      (r) => live && setLink(r.url),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [wid, v.id]);
  const text = edited ?? checkInText(v, ctx, link);
  const small = 'py-[6px] px-3 rounded-full border border-[#c6b794] bg-white text-[13px] cursor-pointer no-underline !text-[#33402f]';
  return (
    <div className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#8a9670] bg-white">
      <label className="flex items-center gap-2 text-[13px] text-[#5b6a52] flex-wrap">
        Arriving at
        <input defaultValue={v.arrival} placeholder="e.g. 11:00am" onBlur={(e) => e.target.value !== v.arrival && onArrival(e.target.value.slice(0, 20))} className={`${inputCls} max-w-[150px] py-[6px]`} />
      </label>
      <textarea rows={9} value={text} onChange={(e) => setEdited(e.target.value)} aria-label={`Check-in message to ${v.name}`} className={`${inputCls} w-full`} />
      <div className="flex gap-2 flex-wrap items-center">
        {v.email && (
          <a href={`mailto:${encodeURIComponent(v.email)}?subject=${encodeURIComponent('Confirming the wedding details')}&body=${encodeURIComponent(text)}`} className={small}>
            Email it
          </a>
        )}
        {v.phone && (
          <a href={`sms:${v.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(text)}`} className={small}>
            Text it
          </a>
        )}
        <button
          type="button"
          className={small}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast('Message copied');
            } catch {
              window.prompt('Copy this message', text);
            }
          }}
        >
          Copy
        </button>
        <Pill
          size="sm"
          kind="primary"
          onClick={() => {
            onDone();
            onClose();
          }}
        >
          They confirmed ✓
        </Pill>
        <button type="button" onClick={onClose} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
          Close
        </button>
      </div>
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
    <article id={`vendor-${v.id}`} className="rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0] scroll-mt-4">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex justify-between items-center gap-3 py-3 px-4 border-0 bg-transparent text-left cursor-pointer">
        <span className="min-w-0">
          <span className="block font-medium truncate">{v.name}</span>
          <span className="block text-[13px] text-[#5b6a52] truncate">
            {[
              v.category,
              v.km !== null ? `${v.km} km from the venue` : '',
              v.quotes.length ? `${v.quotes.length} ${v.quotes.length === 1 ? 'quote' : 'quotes'}` : '',
              c.amount ? (v.status === 'booked' ? `Booked ${aud(c.amount)}` : `From ${aud(Math.min(...v.quotes.map((q) => q.amount || Infinity), c.amount || Infinity))}`) : '',
              v.status === 'booked' && moneyOf(v).next ? `Next payment ${moneyOf(v).next!.due ? shortDate(moneyOf(v).next!.due) : '(no date)'}` : '',
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
          {v.status === 'booked' && <TheirPage v={v} onChange={onChange} />}
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
                  + Add a quote (type it in, or upload it)
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
                  onChange({ quotes: [...v.quotes, q], ...(v.status === 'idea' || v.status === 'contacted' || v.status === 'requested' ? { status: 'quoted' as const } : {}) }, 'Quote filed');
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
            {v.payments.length ? (
              <p className="m-0 sm:col-span-2 text-[13px] text-[#5b6a52]">
                {v.payments.length} {v.payments.length === 1 ? 'payment' : 'payments'}: {aud(moneyOf(v).paid)} of {aud(moneyOf(v).total)} paid. Change the schedule in Wedding planner → Payments.
              </p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-[14px] cursor-pointer">
                  <input type="checkbox" checked={v.depositPaid} onChange={() => onChange({ depositPaid: !v.depositPaid })} className="w-[18px] h-[18px] accent-[#5d6b47]" />
                  Deposit paid{c.deposit ? ` (${aud(c.deposit)})` : ''}
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                  Balance due (instalments: Payments)
                  <input type="date" value={v.balanceDue} onChange={(e) => onChange({ balanceDue: e.target.value })} className={inputCls} />
                </label>
              </>
            )}
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

/** File a quote: drop the PDF or a photo (the assistant reads the numbers out when it's on), check, save. */
function QuoteForm({ onSave, onCancel }: { onSave: (q: Quote) => void; onCancel: () => void }) {
  const { overview } = useAdmin();
  const [q, setQ] = useState<Quote>({ ...BLANK_QUOTE, id: newId(), date: dateIn(overview?.wedding.timezone) });
  const num = (k: 'amount' | 'deposit', label: string) => (
    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
      {label}
      <MoneyInput value={q[k]} placeholder="0" onValue={(n) => setQ((cur) => ({ ...cur, [k]: n }))} className={`${inputCls} tabular-nums`} />
    </label>
  );
  return (
    <div className="flex flex-col gap-3 p-3 rounded-[10px] border border-dashed border-[#8a9670] bg-white">
      <QuoteFile
        fileId={q.fileId}
        fileName={q.fileName}
        onFiled={(f) => setQ((x) => ({ ...x, fileId: f.id, fileName: f.name }))}
        onRead={(r) =>
          setQ((x) => ({
            ...x,
            amount: r.amount || x.amount,
            deposit: r.deposit || x.deposit,
            validUntil: r.validUntil || x.validUntil,
            date: r.date || x.date,
            includes: r.includes || x.includes,
            excludes: r.excludes || x.excludes,
            extract: r.extract,
          }))
        }
      />
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
      {!q.amount && <span className="text-[12px] text-[#7a7466]">Add the total to save it.</span>}
      <div className="flex gap-2 justify-end">
        <Pill onClick={onCancel}>Cancel</Pill>
        <Pill kind="primary" disabled={!q.amount} onClick={() => onSave(q)}>
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

/** The contract: signed when, what happens if anyone cancels, whether the deposit comes back, the file. */
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

const REASONS = ['Too expensive', 'Not available on the day', 'Went with someone else', 'Didn’t reply', 'Not the right fit'];
const STAGE_COLOUR: Record<QuoteStage, string> = { ask: '#e9e2cc', pricing: '#f4dfae', in: '#dde7f3', booked: '#dfe5cc', out: '#eadbd5' };

/**
 * The quote tracker: every vendor by where their quote is at (to ask, pricing, quote in, booked, not
 * going ahead), how long they've been pricing, who to chase, and a tap to move them along.
 */
function QuoteTracker({ list, onPatch, onOpen }: { list: Vendor[]; onPatch: (id: string, p: Partial<Vendor>, msg?: string) => void; onOpen: (id: string) => void }) {
  const { overview } = useAdmin();
  const today = dateIn(overview?.wedding.timezone);
  const [cat, setCat] = useState('');
  const [declining, setDeclining] = useState<string | null>(null);
  const cats = [...new Set(list.map((v) => v.category.trim() || 'Other'))].sort();
  const shown = list.filter((v) => !cat || (v.category.trim() || 'Other') === cat).map((v) => ({ v, q: quoteStatus(v, today) }));
  const pricing = shown.filter((x) => x.q.stage === 'pricing');
  const chase = pricing.filter((x) => x.q.chase);
  const toDecide = shown.filter((x) => x.q.stage === 'in');
  const took = shown.map((x) => x.q.took).filter((n): n is number => n !== null);
  if (!list.length) return null;
  const btn = 'py-[3px] px-[10px] rounded-full border border-[#c6b794] bg-white text-[12px] cursor-pointer text-[#33402f] hover:bg-[#efe7d3]';
  return (
    <section aria-label="Quote tracker" className="flex flex-col gap-3 p-4 rounded-[18px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <H2>Quote tracker</H2>
        <span className="text-[13px] text-[#5b6a52]">
          {pricing.length} pricing
          {chase.length ? <strong className="text-[#7a4a37] font-semibold"> · {chase.length} to chase</strong> : null} · {toDecide.length} quotes in to decide
          {took.length ? ` · quotes take ${Math.round(took.reduce((a, n) => a + n, 0) / took.length)} days on average` : ''}
        </span>
      </div>
      {cats.length > 1 && (
        <div className="flex gap-[6px] flex-wrap" role="group" aria-label="What they do">
          {['', ...cats].map((c) => (
            <button key={c || 'all'} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={`py-[4px] px-3 rounded-full border text-[12px] cursor-pointer ${cat === c ? 'bg-[#33402f] border-[#33402f] text-[#fbf8f0]' : 'bg-transparent border-[#d3c6a4] text-[#33402f]'}`}>
              {c || 'Everyone'}
              {c && <span className="opacity-70"> · {list.filter((v) => (v.category.trim() || 'Other') === c).length}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {QUOTE_STAGES.map(([stage, label]) => {
          const col = shown.filter((x) => x.q.stage === stage).sort((a, b) => Number(b.q.chase) - Number(a.q.chase) || (b.q.waiting ?? 0) - (a.q.waiting ?? 0));
          return (
            <div key={stage} className="flex-1 min-w-[210px] flex flex-col gap-2">
              <div className="flex justify-between items-center py-1 px-2 rounded-[8px] text-[12px] font-semibold tracking-[.08em] uppercase text-[#33402f]" style={{ background: STAGE_COLOUR[stage] }}>
                <span>{label}</span>
                <span>{col.length}</span>
              </div>
              {col.map(({ v, q }) => (
                <div key={v.id} className={`flex flex-col gap-[6px] p-3 rounded-[12px] bg-white border text-[13px] ${q.chase ? 'border-[#c98f78]' : 'border-[#ece3cd]'}`}>
                  <button type="button" onClick={() => onOpen(v.id)} className="p-0 border-0 bg-transparent text-left cursor-pointer text-[14px] font-medium text-[#33402f]">
                    {v.name}
                    {v.category && <span className="font-normal text-[#7a7466]"> · {v.category}</span>}
                  </button>
                  {stage === 'pricing' && (
                    <>
                      <span className={q.chase ? 'text-[#7a4a37] font-semibold' : 'text-[#5b6a52]'}>
                        {q.waiting !== null ? `Asked ${q.waiting === 0 ? 'today' : `${q.waiting} ${q.waiting === 1 ? 'day' : 'days'} ago`}` : 'Asked'}
                        {q.chase ? ' · time to chase' : q.chaseOn ? ` · chase ${shortDate(q.chaseOn)}` : ''}
                        {v.chasedOn ? ` · last chased ${shortDate(v.chasedOn)}` : ''}
                      </span>
                      <label className="flex items-center gap-2 text-[12px] text-[#5b6a52]">
                        Quote by
                        <input type="date" value={v.quoteBy} onChange={(e) => onPatch(v.id, { quoteBy: e.target.value })} className="py-[2px] px-2 border border-[#d3c6a4] rounded-[8px] bg-[#fbf8f2] text-[12px]" />
                      </label>
                    </>
                  )}
                  {(stage === 'in' || stage === 'booked') && (
                    <span className="text-[#5b6a52]">
                      {q.amount ? <strong className="font-semibold text-[#33402f]">{aud(stage === 'booked' ? commitmentOf(v).amount || q.amount : q.amount)}</strong> : 'No amount yet'}
                      {stage === 'in' && v.quotes.length > 1 ? ` · lowest of ${v.quotes.length}` : ''}
                      {q.took !== null ? ` · came in ${q.took} ${q.took === 1 ? 'day' : 'days'} after asking` : ''}
                      {q.expires ? <span className={q.expires < today ? ' text-[#7a4a37] font-semibold' : ''}>{` · ${q.expires < today ? 'ran out' : 'good to'} ${shortDate(q.expires)}`}</span> : ''}
                    </span>
                  )}
                  {stage === 'out' && v.declinedWhy && <span className="text-[#7a7466] italic">{v.declinedWhy}</span>}
                  {declining === v.id ? (
                    <div className="flex flex-wrap gap-[6px]">
                      {REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={btn}
                          onClick={() => {
                            onPatch(v.id, { status: 'declined', declinedWhy: r }, `${v.name}: not going ahead`);
                            setDeclining(null);
                          }}
                        >
                          {r}
                        </button>
                      ))}
                      <button type="button" className={btn} onClick={() => setDeclining(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-[6px]">
                      {stage === 'ask' && (
                        <button type="button" className={btn} onClick={() => onPatch(v.id, { status: 'requested', askedOn: today, chasedOn: '' }, `Asked ${v.name} for a quote`)}>
                          Asked for a quote
                        </button>
                      )}
                      {stage === 'pricing' && (
                        <>
                          <button type="button" className={btn} onClick={() => onOpen(v.id)}>
                            Quote in
                          </button>
                          <button type="button" className={btn} onClick={() => onPatch(v.id, { chasedOn: today }, `Chased ${v.name}`)}>
                            Chased today
                          </button>
                          {v.phone && (
                            <a href={`tel:${v.phone.replace(/[^\d+]/g, '')}`} className={`${btn} no-underline`}>
                              Call
                            </a>
                          )}
                          {v.email && (
                            <a href={`mailto:${v.email}?subject=${encodeURIComponent('Our wedding quote')}`} className={`${btn} no-underline`}>
                              Email
                            </a>
                          )}
                        </>
                      )}
                      {stage === 'in' && (
                        <button type="button" className={btn} onClick={() => onPatch(v.id, { status: 'booked', ...(v.accepted ? {} : { accepted: [...v.quotes].filter((x) => x.amount > 0).sort((a, b) => a.amount - b.amount)[0]?.id ?? '' }) }, `${v.name} booked`)}>
                          Book them
                        </button>
                      )}
                      {(stage === 'ask' || stage === 'pricing' || stage === 'in') && (
                        <button type="button" className={btn} onClick={() => setDeclining(v.id)}>
                          Not going ahead
                        </button>
                      )}
                      {stage === 'out' && (
                        <button type="button" className={btn} onClick={() => onPatch(v.id, { status: v.quotes.length || v.quote ? 'quoted' : 'idea', declinedWhy: '' }, `${v.name} back on the list`)}>
                          Bring back
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!col.length && <span className="text-[12px] text-[#a39d8e] px-2">None</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * A booked vendor's own page: the day, the venue, when to arrive, the timeline, guest numbers and dietary
 * needs, their payments and who to call, always up to date. Share its link once; it never goes stale.
 */
function TheirPage({ v, onChange }: { v: Vendor; onChange: (p: Partial<Vendor>, msg?: string) => void }) {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const get = async () => {
    try {
      const u = url || (await plannerApi.vendorHub(wid, v.id)).url;
      setUrl(u);
      return u;
    } catch (e) {
      toast((e as Error).message);
      return '';
    }
  };
  const couple = overview ? `${overview.wedding.name1.split(' ')[0]} & ${overview.wedding.name2.split(' ')[0]}` : 'us';
  const msg = (u: string) => `Hi${v.contact ? ` ${v.contact.split(' ')[0]}` : ''}, here are all the details for ${couple}'s wedding, kept up to date (times, guest numbers, dietary needs, who to call on the day): ${u}`;
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-[12px] bg-white border border-[#e2d7bc] text-[13px]">
      <span className="flex-1 min-w-[200px] text-[#5b6a52]">Their page: the day, the timeline, guest numbers and dietary needs, their payments and who to call, always up to date.</span>
      <label className="basis-full flex items-start gap-2 cursor-pointer text-[13px] text-[#33402f]">
        <input
          type="checkbox"
          checked={!!v.shareSeating}
          onChange={(e) => onChange({ shareSeating: e.target.checked }, e.target.checked ? `${v.name} can now see the seating and special meals` : `${v.name} no longer sees the seating`)}
          className="mt-[2px] w-[16px] h-[16px] accent-[#5d6b47]"
        />
        <span>
          Share the seating and special meals (for your caterer): the room plan, and who has a special meal at which table and seat, by name.
        </span>
      </label>
      {v.email && (
        <button type="button" onClick={async () => { const u = await get(); if (u) window.location.href = `mailto:${encodeURIComponent(v.email)}?subject=${encodeURIComponent(`${couple}'s wedding: your details`)}&body=${encodeURIComponent(msg(u))}`; }} className="py-[5px] px-3 rounded-full border border-[#c6b794] bg-transparent text-[12px] cursor-pointer text-[#33402f]">
          Email it
        </button>
      )}
      {v.phone && (
        <button type="button" onClick={async () => { const u = await get(); if (u) window.location.href = `sms:${v.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(msg(u))}`; }} className="py-[5px] px-3 rounded-full border border-[#c6b794] bg-transparent text-[12px] cursor-pointer text-[#33402f]">
          Text it
        </button>
      )}
      <button
        type="button"
        onClick={async () => {
          const u = await get();
          if (!u) return;
          try {
            await navigator.clipboard.writeText(u);
            toast('Link copied');
          } catch {
            window.prompt('Copy this link', u);
          }
        }}
        className="py-[5px] px-3 rounded-full border border-[#c6b794] bg-transparent text-[12px] cursor-pointer text-[#33402f]"
      >
        Copy link
      </button>
      {url && (
        <a href={url} target="_blank" rel="noopener" className="!text-[#33402f] text-[12px]">
          Open it
        </a>
      )}
    </div>
  );
}

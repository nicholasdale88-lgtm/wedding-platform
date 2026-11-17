import type { ListingPackage, ProposalSummary } from '@wp/shared';
import { useEffect, useState } from 'react';
import { proposalsApi } from '../lib/api';

/**
 * Fee proposals, in the vendor's portal: the builder (a title, start from one of their packages or blank,
 * line items with amounts, a deposit, how long it holds, a note, a live total, Send) and their list of
 * proposals with where each is up to. The couple reads a proposal at its link and accepts, declines or asks
 * for changes; the vendor answers a request with a revision (the builder, filled in with the latest one).
 * Once accepted or declined, a proposal is final.
 */

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";
const input = 'w-full py-2 px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px]';
const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
/** A typed amount as whole dollars ("$1,200" → 1200); blank or nonsense → null. */
const dollars = (s: string): number | null => {
  const t = s.replace(/[$,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

type Line = { key: number; what: string; amount: string };
let nextKey = 0;
const line = (what = '', amount = ''): Line => ({ key: ++nextKey, what, amount });
const unitNote = (p: ListingPackage) => (p.unit === 'total' ? '' : ` (${p.unit})`);

export type ProposalTo = { couple: string } | { enquiry: string };

/**
 * A new proposal (to a couple or an enquiry), or the next revision of one (`revise`: filled in with its
 * latest version).
 */
export function FeeProposalBuilder({
  to,
  revise,
  toName,
  packages,
  onSent,
  onClose,
}: {
  to?: ProposalTo;
  revise?: ProposalSummary;
  toName: string;
  packages: ListingPackage[];
  onSent?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(revise?.title ?? '');
  const [start, setStart] = useState('');
  const [lines, setLines] = useState<Line[]>(() => (revise?.lines.length ? revise.lines.map((l) => line(l.what, String(l.amount))) : [line()]));
  const [deposit, setDeposit] = useState(revise?.deposit ? String(revise.deposit) : '');
  const [validUntil, setValidUntil] = useState(revise?.validUntil ?? '');
  const [note, setNote] = useState(revise?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState<{ link: string; emailed: boolean; revision: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const total = lines.reduce((a, l) => a + (dollars(l.amount) ?? 0), 0);
  const fromPackage = (name: string) => {
    setStart(name);
    const p = packages.find((x) => x.name === name);
    if (!p) {
      setLines([line()]);
      return;
    }
    setLines([line(`${p.name}${unitNote(p)}`, p.price ? String(p.price) : '')]);
    if (!title.trim()) setTitle(p.name);
    if (p.includes.length) setNote(`Includes: ${p.includes.join(', ')}.`);
  };
  const change = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const send = async () => {
    setProblem('');
    const ready = lines.filter((l) => l.what.trim() || l.amount.trim());
    if (!title.trim()) return setProblem('Give the proposal a title.');
    if (!ready.length) return setProblem('Add at least one line.');
    if (ready.some((l) => !l.what.trim())) return setProblem('Say what each line is for.');
    if (ready.some((l) => dollars(l.amount) === null)) return setProblem('Add an amount to each line (whole dollars).');
    const dep = deposit.trim() ? dollars(deposit) : 0;
    if (dep === null) return setProblem('Check the deposit (whole dollars).');
    const body = { title: title.trim(), lines: ready.map((l) => ({ what: l.what.trim(), amount: dollars(l.amount)! })), deposit: dep, validUntil, note: note.trim() };
    setBusy(true);
    try {
      if (revise) {
        const r = await proposalsApi.revise(revise.id, body);
        setSent({ link: r.link, emailed: r.emailed, revision: r.revision });
      } else if (to) {
        const r = await proposalsApi.send({ to, ...body });
        setSent({ link: r.link, emailed: r.emailed, revision: 1 });
      }
      onSent?.();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toCouple = revise ? revise.kind === 'couple' : !!to && 'couple' in to;
  if (sent)
    return (
      <section aria-label="Proposal sent" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#b39563] bg-[#fbf3e1]">
        <strong className="text-[17px]" style={{ color: INK }}>
          {sent.revision > 1 ? `Revision ${sent.revision} sent to ${toName}` : `Sent to ${toName}`}
        </strong>
        <p className="m-0 text-[14px]" style={{ color: SOFT }}>
          {toCouple
            ? 'It’s in their planner under Vendors, and in your messages with them.'
            : sent.emailed
              ? 'We emailed it to them.'
              : 'Email isn’t switched on yet, so send them this link yourself.'}{' '}
          They can accept it, decline it or ask for changes at this link:
        </p>
        <div className="flex gap-2 flex-wrap items-center">
          <input readOnly value={sent.link} aria-label="The proposal’s link" className={`${input} flex-[1_1_220px] text-[14px]`} onFocus={(e) => e.target.select()} />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(sent.link).then(() => setCopied(true), () => setCopied(false));
            }}
            className="py-2 px-4 min-h-[40px] rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[14px] font-semibold cursor-pointer"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={sent.link} target="_blank" rel="noreferrer" className="text-[14px]" style={{ color: INK }}>
            See it as they will
          </a>
        </div>
        <button type="button" onClick={onClose} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[14px] min-h-[40px]" style={{ color: INK }}>
          Done
        </button>
      </section>
    );

  return (
    <form
      aria-label={revise ? `Revision for ${toName}` : `Fee proposal for ${toName}`}
      className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <h3 className="m-0 text-[22px] font-normal" style={{ fontFamily: serif, color: INK }}>
          {revise ? `Revision ${revise.revision + 1} for ${toName}` : `A fee proposal for ${toName}`}
        </h3>
        <button type="button" onClick={onClose} className="p-0 border-0 bg-transparent underline cursor-pointer text-[14px]" style={{ color: INK }}>
          Cancel
        </button>
      </div>
      {revise?.request && (
        <p className="m-0 p-3 rounded-[12px] bg-white border border-[#b39563] text-[14px] whitespace-pre-line" style={{ color: INK }}>
          <strong>They asked:</strong> {revise.request.message}
        </p>
      )}
      {!revise && packages.length > 0 && (
        <label className="flex flex-col gap-1 text-[13px]" style={{ color: SOFT }}>
          Start from
          <select aria-label="Start from" value={start} onChange={(e) => fromPackage(e.target.value)} className={input} style={{ color: INK }}>
            <option value="">A blank proposal</option>
            {packages.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
                {p.price ? `, ${aud(p.price)}${unitNote(p)}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-[13px]" style={{ color: SOFT }}>
        Title
        <input aria-label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Ceremony and reception flowers" className={input} style={{ color: INK }} />
      </label>
      <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
        <legend className="p-0 mb-1 text-[13px]" style={{ color: SOFT }}>
          What’s included, and what each costs
        </legend>
        {lines.map((l, i) => (
          <div key={l.key} className="flex gap-2 items-center">
            <input aria-label={`Line ${i + 1}`} value={l.what} maxLength={200} onChange={(e) => change(l.key, { what: e.target.value })} placeholder="Bridal bouquet" className={`${input} flex-[3_1_0]`} style={{ color: INK }} />
            <input aria-label={`Line ${i + 1} amount`} value={l.amount} inputMode="numeric" onChange={(e) => change(l.key, { amount: e.target.value })} placeholder="$0" className={`${input} flex-[1_1_0] min-w-[84px] text-right`} style={{ color: INK }} />
            <button
              type="button"
              aria-label={`Remove line ${i + 1}`}
              disabled={lines.length === 1}
              onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              className="flex-none w-10 h-10 rounded-full border border-[#c6b794] bg-white text-[18px] leading-none cursor-pointer disabled:opacity-40"
              style={{ color: INK }}
            >
              ×
            </button>
          </div>
        ))}
        {lines.length < 30 && (
          <button type="button" onClick={() => setLines((ls) => [...ls, line()])} className="self-start py-2 px-4 min-h-[40px] rounded-full border border-[#c6b794] bg-white text-[14px] cursor-pointer" style={{ color: INK }}>
            Add a line
          </button>
        )}
      </fieldset>
      <p aria-live="polite" className="m-0 flex justify-between items-baseline border-t border-[#e2d7bc] pt-2">
        <span className="text-[13px] font-semibold tracking-[.14em] uppercase" style={{ color: SOFT }}>
          Total{revise && revise.total !== total ? ` (was ${aud(revise.total)})` : ''}
        </span>
        <span data-testid="proposal-total" className="text-[28px]" style={{ fontFamily: serif, color: INK }}>
          {aud(total)}
        </span>
      </p>
      <div className="flex gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-[13px] flex-[1_1_140px]" style={{ color: SOFT }}>
          Deposit
          <input value={deposit} inputMode="numeric" onChange={(e) => setDeposit(e.target.value)} placeholder="$0" className={input} style={{ color: INK }} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] flex-[1_1_160px]" style={{ color: SOFT }}>
          Valid until
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={input} style={{ color: INK }} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[13px]" style={{ color: SOFT }}>
        A note for them
        <textarea aria-label="A note for them" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What’s included, delivery and set-up, how to pay the deposit…" className={`${input} resize-y`} style={{ color: INK }} />
      </label>
      {problem && (
        <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">
          {problem}
        </p>
      )}
      <button type="submit" disabled={busy} className="self-start py-[10px] px-6 min-h-[44px] rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[15px] font-semibold cursor-pointer disabled:opacity-60">
        {busy ? 'Sending…' : `${revise ? 'Send the revision' : 'Send the proposal'} (${aud(total)})`}
      </button>
    </form>
  );
}

const CHIP: Record<ProposalSummary['status'], [string, string]> = {
  sent: ['Sent', 'bg-[#f3ecd6] text-[#5b4a22]'],
  changes: ['Changes asked', 'bg-[#fbe3c4] text-[#7a4a17]'],
  accepted: ['Accepted', 'bg-[#e7eedb] text-[#3d5a2c]'],
  declined: ['Declined', 'bg-[#fbe9e4] text-[#7a2e20]'],
};
const shortDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** The vendor's proposals, those waiting on them first: to whom, how much, and where each is up to. */
export function VendorProposals({ packages = [] }: { packages?: ListingPackage[] }) {
  const [list, setList] = useState<ProposalSummary[] | null>(null);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState('');
  const [revising, setRevising] = useState<string | null>(null);
  const load = () =>
    proposalsApi
      .list()
      .then((r) => setList(r.proposals))
      .catch((e: Error) => setProblem(e.message));
  useEffect(() => {
    void load();
  }, []);
  if (problem) return <p role="alert" className="text-[#7a4a37]">{problem}</p>;
  if (!list) return <div aria-busy="true" style={{ color: SOFT }}>Loading your proposals…</div>;
  const shown = [...list].sort((a, b) => (a.status === 'changes' ? 0 : 1) - (b.status === 'changes' ? 0 : 1));
  return (
    <section aria-label="Proposals" className="flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-[30px] font-normal" style={{ fontFamily: serif, color: INK }}>
          Proposals
        </h2>
        <p className="m-0 text-[14px]" style={{ color: SOFT }}>
          Your fee proposals to couples and enquiries. Send a new one from a couple (Your couples) or an enquiry (Enquiries). When a couple asks for changes, send them a revision; once they accept or decline, it’s final.
        </p>
      </div>
      {!list.length && (
        <p className="m-0 p-4 rounded-[14px] bg-[#fbf8f0] border border-[#e2d7bc] text-[15px]" style={{ color: SOFT }}>
          No proposals yet. Open a couple or an enquiry and choose Send a fee proposal.
        </p>
      )}
      <ul aria-label="Your proposals" className="m-0 p-0 list-none grid gap-3 lg:grid-cols-2">
        {shown.map((p) => (
          <li key={p.id} aria-label={`${p.title} for ${p.to}`} className={`flex flex-col gap-2 p-4 rounded-[16px] border bg-white ${p.status === 'changes' ? 'border-[#b39563] shadow-[0_0_0_1px_#b39563]' : 'border-[#e2d7bc]'}`}>
            <div className="flex justify-between gap-2 flex-wrap items-baseline">
              <strong className="text-[17px]" style={{ color: INK }}>
                {p.title}
              </strong>
              <span className="flex gap-1 items-center">
                {p.revision > 1 && <span className="py-[3px] px-2 rounded-full text-[12px] border border-[#c6b794]" style={{ color: SOFT }}>Revision {p.revision}</span>}
                <span className={`py-[3px] px-3 rounded-full text-[12px] font-semibold ${CHIP[p.status][1]}`}>{CHIP[p.status][0]}</span>
              </span>
            </div>
            <span className="text-[14px]" style={{ color: SOFT }}>
              To {p.to} ({p.kind === 'couple' ? 'your couple' : 'an enquiry'}) · {aud(p.total)} · sent {shortDate(p.at)}
              {p.answeredAt ? ` · answered ${shortDate(p.answeredAt)}` : ''}
            </span>
            {p.status === 'changes' && p.request && (
              <p className="m-0 p-3 rounded-[12px] bg-[#fbf3e1] text-[14px] whitespace-pre-line" style={{ color: INK }}>
                <strong>{p.to} asked for changes:</strong> {p.request.message}
              </p>
            )}
            {revising === p.id ? (
              <FeeProposalBuilder
                key={p.id}
                revise={p}
                toName={p.to}
                packages={packages}
                onSent={() => void load()}
                onClose={() => setRevising(null)}
              />
            ) : (
              <div className="flex gap-4 flex-wrap items-center text-[14px]">
                {(p.status === 'changes' || p.status === 'sent') && (
                  <button
                    type="button"
                    onClick={() => setRevising(p.id)}
                    className={p.status === 'changes' ? 'py-2 px-4 min-h-[40px] rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[14px] font-semibold cursor-pointer' : 'p-0 border-0 bg-transparent underline cursor-pointer text-[14px] min-h-[40px]'}
                    style={p.status === 'changes' ? undefined : { color: INK }}
                  >
                    Send a revision
                  </button>
                )}
                <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[40px]" style={{ color: INK }}>
                  Open it
                </a>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(p.link).then(() => setCopied(p.id), () => setCopied(''))}
                  className="p-0 border-0 bg-transparent underline cursor-pointer text-[14px] min-h-[40px]"
                  style={{ color: INK }}
                >
                  {copied === p.id ? 'Copied' : 'Copy the link'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

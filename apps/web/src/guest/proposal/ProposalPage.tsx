import { proposalChanges, type ProposalLine, type ProposalView } from '@wp/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { proposalsApi } from '../../lib/api';
import { GuestMessage } from '../GuestMessage';

/**
 * /proposal/:token: a vendor's fee proposal, as the couple reads it. A clean priced document on warm paper
 * (who it's from, each line and its amount, the total, the deposit, how long it holds, their note and how to
 * reach them). The couple accepts, declines or asks for changes; the vendor answers a request with a
 * revision, shown here with a "Revision N" badge, what changed since the one before, and the earlier ones
 * folded away. Accepting shows exactly what they're agreeing to first. Accepted or declined is final.
 * /proposal/sample is a made-up one (nothing is sent).
 */

const INK = '#33402f';
const SOFT = '#5b6a52';
const GOLD = '#b39563';
const serif = "'Cormorant Garamond', Georgia, serif";
const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
const longDay = (ymd: string) => {
  try {
    return new Date(`${ymd.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return ymd;
  }
};
const btn = 'py-3 px-7 min-h-[48px] rounded-full text-[16px] cursor-pointer disabled:opacity-60';
const solid = `${btn} border-0 font-semibold`;
const ghost = `${btn} border border-[#c6b794] bg-transparent`;

const DAY = 86_400_000;
const ymd = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const SAMPLE_V1: ProposalLine[] = [
  { what: 'Bridal bouquet and two bridesmaids’ posies', amount: 650 },
  { what: 'Buttonholes for the groom’s party (5)', amount: 150 },
  { what: 'Long-table centrepieces (12)', amount: 1440 },
  { what: 'Delivery, set-up and pack-down', amount: 400 },
];
const SAMPLE_V2: ProposalLine[] = [SAMPLE_V1[0]!, SAMPLE_V1[1]!, { what: 'Long-table centrepieces (10)', amount: 1200 }, SAMPLE_V1[3]!];
const SAMPLE: ProposalView = {
  vendor: { name: 'Wildflower Studio', category: 'Florists', slug: '', contactName: 'Jess Lee', phone: '0400 000 000' },
  revision: 2,
  title: 'Ceremony and reception flowers',
  lines: SAMPLE_V2,
  total: 2400,
  deposit: 600,
  validUntil: ymd(30),
  note: 'Seasonal garden roses, eucalyptus and soft whites. The deposit holds your date; the balance is due two weeks before the wedding.',
  at: new Date(Date.now() - DAY).toISOString(),
  status: 'sent',
  to: 'Harriet & Theo',
  versions: [{ revision: 1, title: 'Ceremony and reception flowers', lines: SAMPLE_V1, total: 2640, deposit: 600, validUntil: ymd(30), note: '', at: new Date(Date.now() - 4 * DAY).toISOString() }],
  requests: [{ revision: 1, message: 'We now have 10 tables, not 12. Could you bring the centrepieces down to match?', at: new Date(Date.now() - 3 * DAY).toISOString() }],
};

/** One revision's lines and total, as a priced table. */
function Lines({ lines, total, big = true }: { lines: ProposalLine[]; total: number; big?: boolean }) {
  return (
    <table className="w-full border-collapse text-[16px]">
      <caption className="sr-only">What’s included and what it costs</caption>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className="border-b border-[#efe6d0]">
            <td className="py-3 pr-4 align-top">{l.what}</td>
            <td className="py-3 text-right align-top whitespace-nowrap tabular-nums">{aud(l.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="pt-4 text-left text-[13px] font-semibold tracking-[.16em] uppercase" style={{ color: SOFT }}>
            Total
          </th>
          <td className={`pt-4 text-right whitespace-nowrap ${big ? 'text-[30px]' : 'text-[22px]'}`} style={{ fontFamily: serif }}>
            {aud(total)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

export function ProposalPage() {
  const { token = '' } = useParams();
  const sample = token === 'sample';
  const [p, setP] = useState<ProposalView | null>(sample ? SAMPLE : null);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState<'accept' | 'decline' | 'changes' | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [justNow, setJustNow] = useState(false);

  const load = () =>
    proposalsApi
      .view(token)
      .then(setP)
      .catch((e: Error) => setErr(e.message || 'That proposal link doesn’t work.'));
  useEffect(() => {
    document.title = 'Fee proposal';
    if (!sample) void load();
  }, [token, sample]); // eslint-disable-line
  if (err) return <GuestMessage message={err} title="Fee proposal" />;
  if (!p) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;

  const answer = async (a: 'accept' | 'decline' | 'changes') => {
    setProblem('');
    if (a === 'changes' && !message.trim()) return setProblem('Say what you’d like changed.');
    setBusy(true);
    try {
      const status = sample ? ({ accept: 'accepted', decline: 'declined', changes: 'changes' } as const)[a] : (await proposalsApi.answer(token, a, p.revision, a === 'changes' ? message.trim() : '')).status;
      setP({ ...p, status, requests: a === 'changes' ? [...p.requests, { revision: p.revision, message: message.trim(), at: new Date().toISOString() }] : p.requests });
      setJustNow(true);
      setAsking(null);
      setMessage('');
    } catch (e) {
      setProblem((e as Error).message);
      // A newer revision (or an answer from the other partner): show it as it is now.
      if (!sample) void load();
    } finally {
      setBusy(false);
    }
  };
  const lapsed = !!p.validUntil && p.validUntil < new Date().toISOString().slice(0, 10);
  const from = p.vendor.contactName ? `${p.vendor.contactName}, ${p.vendor.name}` : p.vendor.name;
  const before = p.versions[p.versions.length - 1];
  const changed = before ? proposalChanges(before, p) : [];
  const lastRequest = p.requests[p.requests.length - 1];
  const final = p.status === 'accepted' || p.status === 'declined';

  return (
    <main className="min-h-screen bg-[#f6f0e2] px-4 py-8 sm:py-14" style={{ color: INK }}>
      <article aria-label={`Fee proposal from ${p.vendor.name}`} className="mx-auto max-w-[640px] flex flex-col gap-6 px-5 py-8 sm:px-10 sm:py-12 rounded-[6px] bg-[#fffdf8] border border-[#e2d7bc] shadow-[0_10px_30px_rgba(51,64,47,.08)]">
        <header className="flex flex-col items-center gap-2 text-center">
          <span className="text-[12px] tracking-[.32em] uppercase" style={{ color: SOFT }}>
            Fee proposal
          </span>
          <h1 className="m-0 text-[clamp(34px,8vw,48px)] leading-[1.05] font-normal" style={{ fontFamily: serif }}>
            {p.vendor.name}
          </h1>
          {p.vendor.category && (
            <span className="text-[14px]" style={{ color: SOFT }}>
              {p.vendor.category}
            </span>
          )}
          <span aria-hidden="true" className="block w-16 h-px mt-2" style={{ background: GOLD }} />
        </header>

        <div className="flex flex-col items-center gap-1 text-center">
          {p.to && (
            <span className="text-[15px]" style={{ color: SOFT }}>
              Prepared for {p.to}
            </span>
          )}
          <h2 className="m-0 text-[26px] font-normal italic" style={{ fontFamily: serif }}>
            {p.title}
          </h2>
          {p.revision > 1 && (
            <span className="mt-1 py-[3px] px-3 rounded-full text-[12px] font-semibold tracking-[.08em] border border-[#b39563]" style={{ color: INK }}>
              Revision {p.revision} · {longDay(p.at)}
            </span>
          )}
        </div>

        {before && (
          <section aria-label="What changed" className="flex flex-col gap-1 p-4 rounded-[4px] border border-[#e2d7bc] bg-[#f9f4e8] text-[15px]">
            <strong className="text-[13px] font-semibold tracking-[.14em] uppercase" style={{ color: SOFT }}>
              What changed since revision {before.revision}
            </strong>
            <ul className="m-0 pl-5 flex flex-col gap-1">
              {changed.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </section>
        )}

        <Lines lines={p.lines} total={p.total} />

        {(p.deposit > 0 || p.validUntil) && (
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-[15px]">
            {p.deposit > 0 && (
              <>
                <dt style={{ color: SOFT }}>Deposit</dt>
                <dd className="m-0 text-right tabular-nums">{aud(p.deposit)} to hold your date</dd>
              </>
            )}
            {p.validUntil && (
              <>
                <dt style={{ color: SOFT }}>Valid until</dt>
                <dd className="m-0 text-right">
                  {longDay(p.validUntil)}
                  {lapsed && !final ? ' (passed: check with them)' : ''}
                </dd>
              </>
            )}
          </dl>
        )}

        {p.note && (
          <p className="m-0 p-4 rounded-[4px] bg-[#f9f4e8] leading-relaxed whitespace-pre-line" style={{ fontFamily: serif, fontSize: 19 }}>
            {p.note}
          </p>
        )}

        {lastRequest && (
          <section aria-label="Your last request" className="flex flex-col gap-1 text-[15px]">
            <strong className="text-[13px] font-semibold tracking-[.14em] uppercase" style={{ color: SOFT }}>
              You asked{lastRequest.revision !== p.revision ? ` (on revision ${lastRequest.revision})` : ''}
            </strong>
            <p className="m-0 italic whitespace-pre-line">“{lastRequest.message}”</p>
          </section>
        )}

        <section aria-label="Their details" className="flex flex-col items-center gap-1 text-center text-[15px]">
          <span style={{ color: SOFT }}>From {from}</span>
          {p.vendor.phone && (
            <a href={`tel:${p.vendor.phone.replace(/[^\d+]/g, '')}`} className="min-h-[40px] inline-flex items-center" style={{ color: INK }}>
              Call {p.vendor.phone}
            </a>
          )}
          {p.vendor.slug && (
            <Link to={`/vendors/${p.vendor.slug}`} className="min-h-[40px] inline-flex items-center" style={{ color: INK }}>
              See their page
            </Link>
          )}
        </section>

        <section aria-label="Your answer" className="flex flex-col items-center gap-3 pt-2 border-t border-[#efe6d0]">
          {final ? (
            <p role="status" className={`m-0 mt-3 py-3 px-5 rounded-[24px] text-center text-[15px] font-semibold ${p.status === 'accepted' ? 'bg-[#e7eedb] text-[#3d5a2c]' : 'bg-[#f3ecd6] text-[#5b4a22]'}`}>
              {p.status === 'accepted'
                ? justNow
                  ? `Accepted. ${p.vendor.name} has been told and will be in touch about the deposit.`
                  : `You accepted this proposal${p.revision > 1 ? ` (revision ${p.revision})` : ''}.`
                : justNow
                  ? `Declined. ${p.vendor.name} has been told. Thank you for letting them know.`
                  : 'You declined this proposal.'}
            </p>
          ) : asking === 'accept' ? (
            <div role="group" aria-label="Confirm you accept" className="w-full flex flex-col gap-3 pt-3">
              <p className="m-0 text-center" style={{ fontFamily: serif, fontSize: 21 }}>
                You’re agreeing to {p.vendor.name}’s proposal{p.revision > 1 ? `, revision ${p.revision}` : ''}:
              </p>
              <div className="p-4 rounded-[4px] border border-[#e2d7bc] bg-[#f9f4e8]">
                <Lines lines={p.lines} total={p.total} big={false} />
                <p className="m-0 mt-3 text-[15px]">
                  {p.deposit > 0 ? `A deposit of ${aud(p.deposit)} to hold your date.` : 'No deposit.'}
                  {p.validUntil ? ` The price holds until ${longDay(p.validUntil)}.` : ''}
                </p>
              </div>
              <p className="m-0 text-[14px] text-center" style={{ color: SOFT }}>
                {p.vendor.name} will be told straight away. Once you accept, it’s final.
              </p>
              <div className="flex gap-3 flex-wrap justify-center">
                <button type="button" disabled={busy} onClick={() => void answer('accept')} className={solid} style={{ background: INK, color: '#fbf8f2' }}>
                  {busy ? 'Sending…' : `Yes, accept ${aud(p.total)}`}
                </button>
                <button type="button" disabled={busy} onClick={() => setAsking(null)} className={ghost} style={{ color: INK }}>
                  Go back
                </button>
              </div>
            </div>
          ) : asking === 'decline' ? (
            <div role="group" aria-label="Confirm you decline" className="flex flex-col items-center gap-3 pt-3">
              <p className="m-0 text-[16px] text-center">Decline this proposal? {p.vendor.name} will be told, and it’s final. To negotiate instead, ask for changes.</p>
              <div className="flex gap-3 flex-wrap justify-center">
                <button type="button" disabled={busy} onClick={() => void answer('decline')} className={solid} style={{ background: INK, color: '#fbf8f2' }}>
                  {busy ? 'Sending…' : 'Yes, decline'}
                </button>
                <button type="button" disabled={busy} onClick={() => setAsking(null)} className={ghost} style={{ color: INK }}>
                  Go back
                </button>
              </div>
            </div>
          ) : asking === 'changes' ? (
            <div role="group" aria-label="Ask for changes" className="w-full flex flex-col gap-3 pt-3">
              <label className="flex flex-col gap-1 text-[15px]">
                What would you like changed?
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Fewer centrepieces, a different flower, a lower deposit…"
                  className="w-full py-2 px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px] resize-y"
                  style={{ color: INK }}
                />
              </label>
              <span className="text-[13px] text-right" style={{ color: SOFT }}>
                {message.length}/2000
              </span>
              <div className="flex gap-3 flex-wrap justify-center">
                <button type="button" disabled={busy} onClick={() => void answer('changes')} className={solid} style={{ background: INK, color: '#fbf8f2' }}>
                  {busy ? 'Sending…' : `Send to ${p.vendor.name}`}
                </button>
                <button type="button" disabled={busy} onClick={() => setAsking(null)} className={ghost} style={{ color: INK }}>
                  Go back
                </button>
              </div>
            </div>
          ) : (
            <>
              {p.status === 'changes' && (
                <p role="status" className="m-0 mt-3 py-3 px-5 rounded-[24px] text-center text-[15px] bg-[#fbf3e1]">
                  <strong>Waiting for {p.vendor.name}’s revised proposal.</strong> You’ve asked for changes; you can still accept this version as it is.
                </p>
              )}
              {justNow && p.status === 'changes' && (
                <p className="m-0 text-[14px] text-center" style={{ color: SOFT }}>
                  Sent. {p.vendor.name} has your request and will send a revision here.
                </p>
              )}
              <div className="flex gap-3 flex-wrap justify-center pt-3">
                <button type="button" onClick={() => setAsking('accept')} className={solid} style={{ background: INK, color: '#fbf8f2' }}>
                  {p.status === 'changes' ? 'Accept this version' : 'Accept'}
                </button>
                <button type="button" onClick={() => setAsking('changes')} className={ghost} style={{ color: INK }}>
                  {p.status === 'changes' ? 'Add to your request' : 'Ask for changes'}
                </button>
                <button type="button" onClick={() => setAsking('decline')} className={ghost} style={{ color: INK }}>
                  Decline
                </button>
              </div>
            </>
          )}
          {problem && (
            <p role="alert" className="m-0 text-[14px] text-center text-[#7a4a37]">
              {problem}
            </p>
          )}
          {sample && <p className="m-0 text-[13px]" style={{ color: SOFT }}>A sample proposal: nothing is sent.</p>}
        </section>

        {p.versions.length > 0 && (
          <details className="border-t border-[#efe6d0] pt-4">
            <summary className="cursor-pointer text-[15px] min-h-[40px] flex items-center" style={{ color: INK }}>
              Earlier versions ({p.versions.length})
            </summary>
            <ol className="m-0 mt-3 p-0 list-none flex flex-col gap-5">
              {[...p.versions].reverse().map((v) => {
                const asked = p.requests.filter((r) => r.revision === v.revision);
                return (
                  <li key={v.revision} className="flex flex-col gap-2 p-4 rounded-[4px] border border-[#efe6d0] bg-[#fbf8f0]">
                    <span className="flex justify-between gap-2 flex-wrap text-[14px]" style={{ color: SOFT }}>
                      <strong style={{ color: INK }}>{v.revision === 1 ? 'The first proposal' : `Revision ${v.revision}`}</strong>
                      <span>
                        {aud(v.total)} · {longDay(v.at)}
                      </span>
                    </span>
                    <Lines lines={v.lines} total={v.total} big={false} />
                    {asked.map((r, i) => (
                      <p key={i} className="m-0 text-[14px] italic" style={{ color: SOFT }}>
                        You asked: “{r.message}”
                      </p>
                    ))}
                  </li>
                );
              })}
            </ol>
          </details>
        )}
      </article>
      <p className="mt-6 text-center text-[12px] tracking-[.28em] uppercase" style={{ color: SOFT }}>
        Sent with The Yes List
      </p>
    </main>
  );
}

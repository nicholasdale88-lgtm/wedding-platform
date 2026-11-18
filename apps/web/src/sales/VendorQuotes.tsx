import type { VendorCouple, VendorQuoteLead } from '../lib/api';
import { deskToday } from './VendorDesk';

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";
const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
const shortDay = (ymd: string) => new Date(`${ymd.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const slot = (at: string) => new Date(`${at}:00Z`).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });

type Row = VendorQuoteLead & { couple: string; date: string };

/**
 * A vendor's Quotes area: every couple's quote request in one place, by what it needs. To price first (soonest
 * wanted first), then tastings booked, then quotes with the couple, then decided (booked you, or not this time).
 * Each opens its own quote page to price, change or look back at.
 */
export function VendorQuotes({ couples }: { couples: VendorCouple[] }) {
  const rows: Row[] = couples.flatMap((c) => (c.quotes ?? []).map((q) => ({ ...q, couple: c.couple, date: c.date })));
  const today = deskToday();
  const toPrice = rows.filter((q) => !q.answered && !q.declined && !q.closed).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const tasting = rows.filter((q) => !q.closed && q.answered && q.tasting).sort((a, b) => a.tasting!.at.localeCompare(b.tasting!.at));
  const withCouple = rows.filter((q) => !q.closed && q.answered && !q.tasting);
  const decided = rows.filter((q) => q.closed || (q.declined && !q.answered));
  const won = rows.filter((q) => q.won);
  const quoted = rows.filter((q) => q.answered);
  if (!rows.length)
    return (
      <div className="flex flex-col gap-2 p-5 rounded-[16px] bg-[#fbf8f0] border border-[#e2d7bc] max-w-[760px]">
        <h2 className="m-0 text-[26px] font-normal" style={{ fontFamily: serif, color: INK }}>
          Quotes
        </h2>
        <p className="m-0 text-[15px]" style={{ color: SOFT }}>
          No quote requests yet. When a couple asks you for a quote from their planner, it lands here. Opened a quote link first? On its page, tap Save to my dashboard.
        </p>
      </div>
    );
  const group = (title: string, list: Row[], note: (q: Row) => string, action: (q: Row) => string, tone = '#ffffff') =>
    list.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-2">
        <h3 className="m-0 text-[13px] tracking-[.14em] uppercase font-semibold" style={{ color: SOFT }}>
          {title} · {list.length}
        </h3>
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {list.map((q) => (
            <li key={q.id} className="flex items-center gap-3 flex-wrap p-3 rounded-[14px] border border-[#e2d7bc]" style={{ background: tone }}>
              <span className="flex-1 min-w-[200px]">
                <strong className="block text-[16px]" style={{ color: INK }}>
                  {q.couple} · {q.title}
                </strong>
                <span className="block text-[13px]" style={{ color: SOFT }}>
                  {[q.date ? `Wedding ${shortDay(q.date)}` : '', `${q.lines} ${q.lines === 1 ? 'item' : 'items'}`, note(q)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <a href={q.link} target="_blank" rel="noreferrer" className="min-h-[44px] inline-flex items-center py-2 px-4 rounded-full no-underline text-[14px] font-semibold" style={{ background: INK, color: '#fbf8f2' }}>
                {action(q)}
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="flex flex-col gap-5 max-w-[860px]">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[30px] font-normal" style={{ fontFamily: serif, color: INK }}>
          Quotes
        </h2>
        <p className="m-0 text-[15px]" style={{ color: SOFT }}>
          Every couple’s quote request in one place. Add samples and tasting times to a quote to stand out; your own payment or booking link goes on it too.
        </p>
      </div>
      <dl className="m-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            ['To price', toPrice.length],
            ['Tastings booked', tasting.length],
            ['With couples', withCouple.length + tasting.length],
            ['Booked you', `${won.length}${quoted.length ? ` of ${quoted.length}` : ''}`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex flex-col p-3 rounded-[14px] bg-[#fbf8f0] border border-[#e2d7bc]">
            <dt className="text-[12px] tracking-[.1em] uppercase" style={{ color: SOFT }}>
              {k}
            </dt>
            <dd className="m-0 text-[28px] leading-[1.1]" style={{ fontFamily: serif, color: INK }}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {group(
        'To price',
        toPrice,
        (q) => (q.due ? (q.due < today ? `was wanted ${shortDay(q.due)}` : `wanted by ${shortDay(q.due)}`) : ''),
        () => 'Price it',
        '#fbf3e1',
      )}
      {group('Tastings booked', tasting, (q) => `${q.amount ? `${aud(q.amount)} · ` : ''}video tasting ${slot(q.tasting!.at)} (${q.tasting!.mins} min)`, () => 'Open')}
      {group('With the couple', withCouple, (q) => [q.amount ? `You quoted ${aud(q.amount)}` : '', q.answeredOn ? `sent ${shortDay(q.answeredOn)}` : '', q.samples ? 'with samples' : ''].filter(Boolean).join(' · '), () => 'Change it')}
      {group('Decided', decided, (q) => (q.won ? `Booked you${q.amount ? ` at ${aud(q.amount)}` : ''} ✓` : q.declined && !q.answered ? 'You couldn’t quote' : 'They went another way'), () => 'See it')}
    </div>
  );
}

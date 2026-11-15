import { useEffect, useState } from 'react';
import { ChatThread } from '../lib/ChatThread';
import { vendorCouplesApi, type VendorChatMessage, type VendorCouple } from '../lib/api';

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";
const DAY = 86_400_000;

const when = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date not set yet');
const daysTo = (iso: string) => (iso ? Math.ceil((Date.parse(iso) - Date.now()) / DAY) : null);
const STATUS: Record<VendorCouple['status'], string> = { booked: 'Booked you', considering: 'Considering you', linked: 'Linked' };
type Filter = 'all' | 'unread' | 'quotes' | 'booked' | 'upcoming';
const toPrice = (c: VendorCouple) => (c.quotes ?? []).filter((x) => !x.answered && !x.declined).length;

/**
 * A vendor's couples: everyone who signed up through their link or added them to their planner. Each with
 * their date, days to go, how many are coming, and a conversation in the app; the couple's details page
 * (what the couple shares with this vendor) when they have them in their planner. Invite a couple by email.
 */
export function VendorCouples({ onUnread }: { onUnread?: (n: number) => void }) {
  const [couples, setCouples] = useState<VendorCouple[] | null>(null);
  const [problem, setProblem] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<VendorChatMessage[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const load = () =>
    vendorCouplesApi
      .list()
      .then((r) => {
        setCouples(r.couples);
        onUnread?.(r.unread);
      })
      .catch((e: Error) => setProblem(e.message));
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line
  const openThread = async (id: string) => {
    setOpen(id);
    setThread([]);
    const r = await vendorCouplesApi.thread(id);
    setThread(r.messages);
    void load();
  };
  if (problem) return <p role="alert" className="text-[#7a4a37]">{problem}</p>;
  if (!couples) return <div aria-busy="true" style={{ color: SOFT }}>Loading your couples…</div>;

  const upcoming = (c: VendorCouple) => (daysTo(c.date) ?? 1) >= 0;
  const shown = couples
    .filter((c) => (filter === 'unread' ? c.unread > 0 : filter === 'quotes' ? toPrice(c) > 0 : filter === 'booked' ? c.status === 'booked' : filter === 'upcoming' ? upcoming(c) : true))
    .filter((c) => !q.trim() || c.couple.toLowerCase().includes(q.trim().toLowerCase()));
  const chosen = couples.find((c) => c.id === open) ?? null;
  const chips: [Filter, string, number][] = [
    ['all', 'All', couples.length],
    ['unread', 'New messages', couples.filter((c) => c.unread > 0).length],
    ['quotes', 'Quotes to price', couples.filter((c) => toPrice(c) > 0).length],
    ['booked', 'Booked you', couples.filter((c) => c.status === 'booked').length],
    ['upcoming', 'Still to come', couples.filter(upcoming).length],
  ];

  return (
    <section aria-label="Your couples" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[30px] font-normal" style={{ fontFamily: serif, color: INK }}>
          Your couples
        </h2>
        <p className="m-0 text-[15px]" style={{ color: SOFT }}>
          Couples who signed up through your link or added you to their planner. Message them here; they reply from their planner. You see their date and numbers, never their guests’ names.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        {[
          ['Couples', couples.length],
          ['Booked you', couples.filter((c) => c.status === 'booked').length],
          ['Weddings in the next 90 days', couples.filter((c) => { const d = daysTo(c.date); return d !== null && d >= 0 && d <= 90; }).length],
          ['New messages', couples.reduce((n, c) => n + c.unread, 0)],
          ['Quotes to price', couples.reduce((n, c) => n + (c.quotes ?? []).filter((x) => !x.answered && !x.declined).length, 0)],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <span className="text-[11px] font-semibold tracking-[.14em] uppercase" style={{ color: SOFT }}>{k}</span>
            <span className="text-[32px] leading-none" style={{ fontFamily: serif, color: INK }}>{v}</span>
          </div>
        ))}
      </div>

      <InviteCouple />

      {couples.length === 0 ? (
        <p className="m-0 p-4 rounded-[14px] bg-[#fbf8f0] border border-[#e2d7bc] text-[15px]" style={{ color: SOFT }}>
          No couples yet. Send couples your link (under Recommend us) or invite one above: when they sign up, or add you to their planner, they appear here.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap items-center">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a couple" aria-label="Find a couple" className="flex-[1_1_180px] py-2 px-3 rounded-full border border-[#d3c6a4] bg-white text-[15px]" />
              {chips.map(([k, label, n]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${filter === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-white border-[#c6b794]'}`}>
                  {label} {n}
                </button>
              ))}
            </div>
            <ul aria-label="Couples" className="m-0 p-0 list-none flex flex-col gap-2">
              {shown.map((c) => {
                const d = daysTo(c.date);
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => void openThread(c.id)} aria-current={open === c.id} className={`w-full text-left flex flex-col gap-1 p-4 rounded-[14px] border cursor-pointer ${open === c.id ? 'border-[#33402f] bg-[#f3ecd6]' : c.unread ? 'border-[#b39563] bg-white' : 'border-[#e2d7bc] bg-white'}`}>
                      <span className="flex justify-between gap-2 flex-wrap">
                        <strong className="text-[17px]" style={{ color: INK }}>{c.couple}</strong>
                        <span className="text-[12px] py-[2px] px-2 rounded-full bg-[#e7eedb]" style={{ color: INK }}>{STATUS[c.status]}</span>
                      </span>
                      <span className="text-[14px]" style={{ color: SOFT }}>
                        {when(c.date)}
                        {d !== null && d >= 0 ? ` · ${d === 0 ? 'today' : `${d} days to go`}` : d !== null ? ' · married' : ''}
                        {c.venue ? ` · ${c.venue}` : ''}
                      </span>
                      <span className="text-[13px]" style={{ color: SOFT }}>
                        {c.coming} coming of {c.invited} invited · {c.via}
                      </span>
                      {toPrice(c) > 0 && <span className="text-[13px] font-semibold text-[#7a4a37]">{toPrice(c)} quote {toPrice(c) === 1 ? 'request' : 'requests'} to price</span>}
                      {c.last && <span className="text-[13px] truncate" style={{ color: INK }}>{c.unread ? <strong>{c.unread} new: </strong> : null}{c.last.body}</span>}
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="text-[14px]" style={{ color: SOFT }}>No couples match.</li>}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            {chosen ? (
              <>
                <div className="flex justify-between items-end gap-2 flex-wrap">
                  <h3 className="m-0 text-[24px] font-normal" style={{ fontFamily: serif, color: INK }}>{chosen.couple}</h3>
                  {chosen.details && (
                    <a href={chosen.details} target="_blank" rel="noreferrer" className="text-[14px]" style={{ color: INK }}>
                      Their wedding details for you
                    </a>
                  )}
                </div>
                {(chosen.quotes ?? []).length > 0 && (
                  <div aria-label="Their quote requests" role="group" className="flex flex-col gap-2 p-3 rounded-[14px] border border-[#b39563] bg-[#fbf3e1]">
                    <strong className="text-[14px]" style={{ color: INK }}>Their quote requests</strong>
                    {chosen.quotes!.map((x) => (
                      <div key={x.id} className="flex justify-between items-center gap-2 flex-wrap text-[14px]">
                        <span>
                          {x.title} · {x.lines} {x.lines === 1 ? 'line' : 'lines'}
                          {x.due ? ` · wanted by ${new Date(`${x.due}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                          {x.answered ? ' · priced ✓' : x.declined ? ' · declined' : ''}
                        </span>
                        <a href={x.link} target="_blank" rel="noreferrer" className="py-[6px] px-4 rounded-full no-underline text-[13px] font-semibold" style={{ background: INK, color: '#fbf8f2' }}>
                          {x.answered ? 'Change your quote' : 'Price it'}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
                <ChatThread
                  messages={thread}
                  mine="vendor"
                  other={chosen.couple}
                  empty={`No messages yet. Say hello to ${chosen.couple}.`}
                  onSend={async (body) => {
                    setThread((await vendorCouplesApi.send(chosen.id, body)).messages);
                    void load();
                  }}
                />
              </>
            ) : (
              <p className="m-0 p-4 rounded-[14px] bg-[#fbf8f0] border border-[#e2d7bc] text-[15px]" style={{ color: SOFT }}>
                Choose a couple to see your messages with them.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** An email from us in the vendor's name, with their link and code to the sample invitation. */
function InviteCouple() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  return (
    <form
      aria-label="Invite a couple"
      className="flex gap-2 flex-wrap items-end p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setNote('');
        vendorCouplesApi
          .invite(name, email)
          .then((r) => {
            setNote(r.sent ? `Sent to ${email}. When they sign up, they appear here.` : 'Email isn’t switched on yet, so copy your link under Recommend us and send it yourself.');
            if (r.sent) {
              setName('');
              setEmail('');
            }
          })
          .catch((err: Error) => setNote(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <strong className="w-full text-[15px]" style={{ color: INK }}>Invite a couple</strong>
      <label className="flex flex-col gap-1 text-[13px] flex-[1_1_160px]">
        Their names
        <input value={name} onChange={(e) => setName(e.target.value)} className="py-2 px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px]" />
      </label>
      <label className="flex flex-col gap-1 text-[13px] flex-[2_1_220px]">
        Their email
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="py-2 px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px]" />
      </label>
      <button type="submit" disabled={busy} className="py-[10px] px-5 rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[15px] cursor-pointer disabled:opacity-60">
        {busy ? 'Sending…' : 'Send an invitation'}
      </button>
      {note && <p role="status" className="w-full m-0 text-[14px]" style={{ color: SOFT }}>{note}</p>}
    </form>
  );
}

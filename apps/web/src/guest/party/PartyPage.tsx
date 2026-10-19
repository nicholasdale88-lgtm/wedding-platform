import { useEffect, useRef, useState } from 'react';
import { themeOf } from '../themeKit';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { guestApi, type PartyAct, type PartyMine, type PartyPayload } from '../invitation/api';

/**
 * /w/:slug/party?g=<token>: a wedding party member's own run sheet. Only the lines meant for them (the
 * whole party, their side, or their role), for the events they're invited to; who's who in the party;
 * the couple's note. On the day, the line happening now is marked.
 */

const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;
const fmtDay = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
  } catch {
    return '';
  }
};
/** "9:30am" on the event's day → a time, to mark what's on now. */
const at = (day: string, t: string) => {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if ((m[3] ?? '').toLowerCase() === 'pm') h += 12;
  if (!m[3] && Number(m[1]) >= 12) h = Number(m[1]);
  const d = new Date(day);
  d.setHours(h, Number(m[2] ?? 0), 0, 0);
  return d.getTime();
};

type Act = (body: Omit<PartyAct, 'token'>, apply: (m: PartyMine) => PartyMine) => void;

/** Their packing list: the couple's list for them plus anything they add, ticked off and saved for them. */
function Packing({ items, me, act, gold }: { items: { text: string }[]; me: PartyMine; act: Act; gold: string }) {
  const [adding, setAdding] = useState('');
  const shared = items.map((i) => ({ text: i.text, done: me.packed.includes(i.text), own: false }));
  const all = [...shared, ...me.pack.map((p) => ({ ...p, own: true }))];
  const left = all.filter((i) => !i.done).length;
  return (
    <div className="flex flex-col gap-2 p-4 rounded-[16px] bg-white/70 border" style={{ borderColor: 'rgba(0,0,0,.08)' }}>
      <div className="flex justify-between items-baseline">
        <h3 className="m-0 font-normal text-[26px]">What to pack</h3>
        <span className="text-[15px] italic opacity-75">{all.length ? (left ? `${left} to go` : 'All packed ✓') : ''}</span>
      </div>
      {all.map((i) => (
        <div key={`${i.own ? 'o' : 's'}-${i.text}`} className="flex items-start gap-3 text-[19px] leading-[1.3]">
          <input
            type="checkbox"
            aria-label={i.text}
            checked={i.done}
            onChange={() =>
              i.own
                ? act({ personId: me.personId, action: 'own-pack', text: i.text, done: !i.done }, (m) => ({ ...m, pack: m.pack.map((x) => (x.text === i.text ? { ...x, done: !i.done } : x)) }))
                : act({ personId: me.personId, action: 'packed', text: i.text, done: !i.done }, (m) => ({ ...m, packed: i.done ? m.packed.filter((x) => x !== i.text) : [...m.packed, i.text] }))
            }
            className="mt-[5px] w-[20px] h-[20px] flex-none cursor-pointer"
            style={{ accentColor: gold }}
          />
          <span className="flex-1" style={i.done ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}>
            {i.text}
          </span>
          {i.own && (
            <button type="button" aria-label={`Remove ${i.text}`} onClick={() => act({ personId: me.personId, action: 'remove-pack', text: i.text }, (m) => ({ ...m, pack: m.pack.filter((x) => x.text !== i.text) }))} className="p-0 border-0 bg-transparent cursor-pointer opacity-60 text-[20px]">
              ×
            </button>
          )}
        </div>
      ))}
      <form
        className="flex gap-2 mt-1"
        onSubmit={(e) => {
          e.preventDefault();
          const text = adding.trim();
          if (!text || all.some((x) => x.text === text)) return;
          act({ personId: me.personId, action: 'add-pack', text }, (m) => ({ ...m, pack: [...m.pack, { text, done: false }] }));
          setAdding('');
        }}
      >
        <input aria-label="Add something to pack" placeholder="Add something to pack" value={adding} maxLength={160} onChange={(e) => setAdding(e.target.value)} className="flex-1 min-w-0 py-2 px-3 rounded-[10px] border bg-white text-[17px]" style={{ borderColor: 'rgba(0,0,0,.15)' }} />
        <button type="submit" className="py-2 px-4 rounded-full border-0 text-[16px] cursor-pointer text-white" style={{ background: '#33402f' }}>
          Add
        </button>
      </form>
    </div>
  );
}

/** Their to-dos before the day: their own and their side's, ticked off here (the couple sees it). They can add their own. */
function Todos({ me, act, gold, many }: { me: PartyMine; act: Act; gold: string; many: boolean }) {
  const [adding, setAdding] = useState('');
  const left = me.tasks.filter((t) => !t.done).length;
  const fmt = (d: string) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '');
  return (
    <section aria-label={`${first(me.name)}’s to-dos`} className="flex flex-col gap-2 p-4 rounded-[16px] bg-white/70 border" style={{ borderColor: 'rgba(0,0,0,.08)' }}>
      <div className="flex justify-between items-baseline">
        <h2 className="m-0 font-normal text-[28px]">{many ? `${first(me.name)}’s to-dos` : 'Your to-dos'}</h2>
        <span className="text-[15px] italic opacity-75">{me.tasks.length ? (left ? `${left} to go` : 'All done ✓') : ''}</span>
      </div>
      {me.tasks.map((t) => (
        <div key={t.id} className="flex items-start gap-3 text-[19px] leading-[1.3]">
          <input
            type="checkbox"
            aria-label={t.text}
            checked={t.done}
            onChange={() => act({ personId: me.personId, action: 'task', id: t.id, done: !t.done }, (m) => ({ ...m, tasks: m.tasks.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)) }))}
            className="mt-[5px] w-[20px] h-[20px] flex-none cursor-pointer"
            style={{ accentColor: gold }}
          />
          <span className="flex-1" style={t.done ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}>
            {t.text}
            {t.due && <span className="ml-2 text-[15px] italic opacity-75">by {fmt(t.due)}</span>}
          </span>
          {t.mine && (
            <button type="button" aria-label={`Remove ${t.text}`} onClick={() => act({ personId: me.personId, action: 'remove-task', id: t.id }, (m) => ({ ...m, tasks: m.tasks.filter((x) => x.id !== t.id) }))} className="p-0 border-0 bg-transparent cursor-pointer opacity-60 text-[20px]">
              ×
            </button>
          )}
        </div>
      ))}
      {!me.tasks.length && <p className="m-0 italic opacity-75">Nothing yet. Add your own below.</p>}
      <form
        className="flex gap-2 mt-1"
        onSubmit={(e) => {
          e.preventDefault();
          const text = adding.trim();
          if (!text) return;
          // Added for real once saved (it needs its id from the couple's plan): the page reloads its lists.
          act({ personId: me.personId, action: 'add-task', text }, (m) => ({ ...m, tasks: [...m.tasks, { id: `new-${Date.now()}`, text, due: '', done: false, mine: true }] }));
          setAdding('');
        }}
      >
        <input aria-label="Add a to-do" placeholder="Add a to-do" value={adding} maxLength={160} onChange={(e) => setAdding(e.target.value)} className="flex-1 min-w-0 py-2 px-3 rounded-[10px] border bg-white text-[17px]" style={{ borderColor: 'rgba(0,0,0,.15)' }} />
        <button type="submit" className="py-2 px-4 rounded-full border-0 text-[16px] cursor-pointer text-white" style={{ background: '#33402f' }}>
          Add
        </button>
      </form>
    </section>
  );
}

/**
 * On the day: what's happening now and what's next, big, at the top (for the event happening today).
 * The MC also gets a speech timer (3, 5 or 8 minutes) that turns gold, then red, as time runs out.
 */
function NowNext({ data, now, gold, isMc }: { data: PartyPayload; now: number; gold: string; isMc: boolean }) {
  const today = data.events.find((e) => new Date(e.startsAt).toDateString() === new Date(now).toDateString());
  const [timer, setTimer] = useState<{ until: number; mins: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [timer]);
  if (!today && !isMc) return null;
  const items = today?.items ?? [];
  const times = items.map((it) => (today ? at(today.startsAt, it.time) : null));
  const cur = times.reduce<number>((acc, t, i) => (t !== null && t <= now ? i : acc), -1);
  const next = items.findIndex((_, i) => i > cur && times[i] !== null);
  const left = timer ? Math.max(0, Math.round((timer.until - Date.now()) / 1000)) : 0;
  void tick;
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <section aria-label="Now and next" className="flex flex-col gap-3 p-5 rounded-[20px] text-[#fbf8f2]" style={{ background: '#33402f' }}>
      {today && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[12px] tracking-[.25em] uppercase font-semibold opacity-80" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: gold }}>
              Now
            </div>
            <div className="text-[26px] leading-tight">{cur >= 0 ? items[cur]!.title : 'Not started yet'}</div>
            {cur >= 0 && items[cur]!.place && <div className="text-[17px] italic opacity-80">{items[cur]!.place}</div>}
          </div>
          <div>
            <div className="text-[12px] tracking-[.25em] uppercase font-semibold opacity-80" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: gold }}>
              Next
            </div>
            <div className="text-[26px] leading-tight">{next >= 0 ? `${items[next]!.time} · ${items[next]!.title}` : 'That’s the lot!'}</div>
            {next >= 0 && times[next] !== null && <div className="text-[17px] italic opacity-80">in {Math.max(0, Math.round((times[next]! - now) / 60_000))} minutes</div>}
          </div>
        </div>
      )}
      {isMc && (
        <div className="flex flex-col gap-2 pt-2 border-t border-white/20">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[18px]">Speech timer</span>
            <span className="flex gap-2">
              {[3, 5, 8].map((m) => (
                <button key={m} type="button" onClick={() => setTimer({ until: Date.now() + m * 60_000, mins: m })} className="py-[6px] px-3 rounded-full border border-white/40 bg-transparent text-[#fbf8f2] text-[16px] cursor-pointer">
                  {m} min
                </button>
              ))}
              {timer && (
                <button type="button" onClick={() => setTimer(null)} className="py-[6px] px-3 rounded-full border-0 bg-white/15 text-[#fbf8f2] text-[16px] cursor-pointer">
                  Stop
                </button>
              )}
            </span>
          </div>
          {timer && (
            <div role="timer" aria-live="off" className="text-center text-[64px] leading-none tabular-nums font-semibold" style={{ color: left === 0 ? '#e8a08a' : left <= 30 ? gold : '#fbf8f2' }}>
              {left === 0 ? 'Time!' : mmss}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function PartyPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [data, setData] = useState<PartyPayload | null>(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [mine, setMine] = useState<PartyMine[]>([]);
  const [note, setNote] = useState('');
  const loaded = useRef(false);

  const load = () =>
    guestApi
      .party(slug, token)
      .then((d) => {
        setData(d);
        loaded.current = true;
        setMine(d.mine ?? []);
      })
      // Once the page is up, a failed refresh keeps what's showing (with a note).
      .catch((e: Error) => {
        if (loaded.current) setNote('Can’t reach the site just now: showing what you had.');
        else setErr(e.message);
      });
  useEffect(() => {
    void load();
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [slug, token]);
  useEffect(() => {
    if (data) document.title = `${data.couple} · wedding party`;
  }, [data]);

  if (err) return <GuestMessage message={err} />;
  if (!data) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  /** Shows the change straight away, saves it, and puts it back (with a note) if it didn't save. */
  const act: Act = (body, apply) => {
    const before = mine;
    setMine((ms) => ms.map((m) => (m.personId === body.personId ? apply(m) : m)));
    setNote('');
    guestApi
      .partyAct(slug, { ...body, token })
      .then(() => {
        if (body.action === 'add-task') void load(); // its real id
      })
      .catch((e: Error) => {
        setMine(before);
        setNote(e.message);
      });
  };
  const theme = themeOf(data.theme);
  const ink = '#33402f';
  const gold = theme.acc ?? '#b39563';
  const roles = [...new Set(data.me.map((m) => m.role))];
  const title = (k: 'p1' | 'p2') => `${data.sides?.[k] || (k === 'p1' ? 'Bride' : 'Groom')}'s side`;
  const sides: [string, string, PartyPayload['party']][] = [
    [title('p1'), data.names.p1, data.party.filter((p) => p.side === 'p1')],
    [title('p2'), data.names.p2, data.party.filter((p) => p.side === 'p2')],
    ['Also helping', '', data.party.filter((p) => !p.side)],
  ];

  return (
    <main className="min-h-screen" style={{ background: '#f6f0e2', color: ink, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      <div className="max-w-[640px] mx-auto px-5 pt-12 pb-24 flex flex-col gap-7">
        <header className="text-center flex flex-col gap-2">
          <div className="text-[13px] tracking-[.3em] uppercase font-semibold opacity-80" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            {data.couple}
          </div>
          <h1 className="m-0 font-normal text-[52px] leading-[1.1]" style={{ fontFamily: "'Pinyon Script', cursive" }}>
            Wedding party
          </h1>
          <span aria-hidden className="mx-auto w-16 h-[2px]" style={{ background: gold }} />
          <p className="m-0 text-[21px] italic">
            {data.me.map((m) => first(m.name)).join(' & ')}, you're {roles.length === 1 ? `our ${roles[0]!.toLowerCase()}` : `in our wedding party (${roles.join(', ')})`}. Thank you!
          </p>
          <a href={`/w/${encodeURIComponent(slug)}?g=${encodeURIComponent(token)}`} className="text-[16px] underline" style={{ color: ink }}>
            ← Your invitation
          </a>
        </header>

        <NowNext data={data} now={now} gold={gold} isMc={roles.some((r) => /\bmc\b|master of ceremonies/i.test(r))} />

        {note && (
          <p role="alert" className="m-0 p-3 rounded-[12px] text-[17px]" style={{ background: '#f4dcd2', color: '#7a4a37' }}>
            {note}
          </p>
        )}
        {mine.map((m) => (
          <Todos key={m.personId} me={m} act={act} gold={gold} many={mine.length > 1} />
        ))}

        {data.events.map((e) => {
          const times = e.items.map((it) => at(e.startsAt, it.time));
          // On the day: the latest line that has started is "now"; the one after it is "next".
          const current = times.reduce<number>((acc, t, i) => (t !== null && t <= now && new Date(e.startsAt).toDateString() === new Date(now).toDateString() ? i : acc), -1);
          return (
            <section key={e.key} aria-label={e.name} className="flex flex-col gap-3">
              <div className="text-center">
                <h2 className="m-0 font-normal text-[34px]">{e.name}</h2>
                <div className="text-[17px] opacity-80">{fmtDay(e.startsAt)}</div>
              </div>
              {e.note && <p className="m-0 p-4 rounded-[16px] bg-white/70 border text-[19px] leading-[1.4] whitespace-pre-wrap" style={{ borderColor: 'rgba(0,0,0,.08)' }}>{e.note}</p>}
              <ol className="m-0 p-0 list-none flex flex-col">
                {e.items.map((it, i) => (
                  <li key={i} className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 py-3 border-t" style={{ borderColor: 'rgba(0,0,0,.08)', background: i === current ? 'rgba(179,149,99,.14)' : undefined }}>
                    <div className="text-right pr-1">
                      <div className="text-[19px] font-semibold">{it.time}</div>
                      {it.until && <div className="text-[14px] opacity-70">to {it.until}</div>}
                      {i === current && (
                        <div className="mt-1 text-[11px] tracking-[.2em] uppercase font-semibold" style={{ color: gold, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                          Now
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="text-[21px] leading-[1.25]">{it.title}</div>
                      {it.place && <div className="text-[16px] italic opacity-80">{it.place}</div>}
                      {it.detail && <div className="text-[17px] leading-[1.4] whitespace-pre-wrap">{it.detail}</div>}
                    </div>
                  </li>
                ))}
              </ol>
              {!e.items.length && <p className="m-0 text-center italic opacity-75">The run sheet for this one is coming.</p>}
              {!!e.holding?.length && (
                <div className="p-4 rounded-[16px] text-[19px]" style={{ background: 'rgba(179,149,99,.14)' }}>
                  <strong className="font-semibold">You’re looking after:</strong> {e.holding.join(', ')}
                </div>
              )}
              {!!e.speeches?.length && (
                <div className="flex flex-col gap-1 p-4 rounded-[16px] bg-white/70 border" style={{ borderColor: 'rgba(0,0,0,.08)' }}>
                  <h3 className="m-0 font-normal text-[26px]">Speeches</h3>
                  {e.speeches.map((s, i) => (
                    <div key={i} className="flex justify-between text-[19px]">
                      <span>
                        {i + 1}. {s.who}
                      </span>
                      <span className="italic opacity-75">{s.minutes} min</span>
                    </div>
                  ))}
                </div>
              )}
              {mine[0] && (!!e.packing?.length || mine[0].pack.length > 0) && <Packing items={e.packing ?? []} me={mine[0]} act={act} gold={gold} />}
            </section>
          );
        })}
        {!data.events.length && <p className="m-0 text-center text-[19px] italic">Your run sheet is on its way. Check back closer to the day.</p>}

        <section aria-label="Who's who" className="flex flex-col gap-3 pt-2">
          <h2 className="m-0 font-normal text-[30px] text-center">Who's who</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {sides
              .filter(([, , ps]) => ps.length)
              .map(([label, who, ps]) => (
                <div key={label} className="flex flex-col gap-1">
                  <div className="text-[12px] tracking-[.2em] uppercase font-semibold opacity-75" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                    {label}
                    {who ? <span className="normal-case tracking-normal font-normal"> · {who}</span> : null}
                  </div>
                  {ps.map((p) => (
                    <div key={`${p.name}-${p.role}`} className="text-[18px]">
                      {p.name} <span className="italic opacity-75">· {p.role}</span>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}

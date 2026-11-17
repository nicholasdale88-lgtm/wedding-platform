import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { guestApi, GuestApiError, type PartyAct, type PartyMine, type PartyPayload } from '../invitation/api';
import { AccountBar, PartySignIn } from './PartyAuth';
import { InstallApp } from '../../lib/InstallApp';
import { partyGroup, PartyHelp, PartyWelcome } from './PartyWelcome';
import { Eyebrow, Heading, Ornament, partyLook, SANS, SERIF, type PartyLook } from './look';
import { WaxSeal } from '../invitation/WaxSeal';

/**
 * /w/:slug/party (signed in to the portal) or ?g=<token> (their private link): a wedding party member's own page.
 * What they see is what the couple allows (Setup → Wedding party access): their own run sheet. Only the lines meant for them (the
 * whole party, their side, or their role), for the events they're invited to; who's who in the party;
 * the couple's note. On the day, the line happening now is marked.
 *
 * In the wedding's own colours, in this order: who they are and their role, what needs them, their day
 * (their own moments marked), then who's who.
 */

type Part = 'home' | 'needs' | 'day' | 'people' | 'more' | 'help';

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
/** A run sheet line meant for them in particular (their side or their role), not the whole party. */
const forYou = (who: string[] | undefined) => !!who?.length && !who.includes('party');

const HOW: Record<string, string> = { buy: 'Buying', hire: 'Hiring', own: 'Wearing your own' };
const shortDay = (d: string) => {
  try {
    return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00`));
  } catch {
    return d;
  }
};
const digits = (p: string) => p.replace(/[^\d+]/g, '');

/** A paper card. */
const cardStyle = (look: PartyLook, extra?: CSSProperties): CSSProperties => ({ background: look.card, border: `1px solid ${look.line}`, boxShadow: look.shadow, ...extra });
/** A small round button-link (Call, Text, Add to calendar): at least 44px tall for a thumb. */
const pill = 'inline-flex items-center justify-center min-h-[44px] px-4 rounded-full no-underline text-[16px] whitespace-nowrap';

function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-3 flex-wrap">
      <h3 className="m-0 font-normal text-[27px] leading-[1.15]">{children}</h3>
      {aside}
    </div>
  );
}

/** What they're wearing: bought, hired or their own, the look, their size and fitting, and the dates that matter. */
function Outfit({ me, look }: { me: PartyMine; look: PartyLook }) {
  const o = me.outfit;
  if (!o || !(o.how || o.payer || o.what || o.size || o.fitting)) return null;
  const rows: [string, string][] = [
    ['How', HOW[o.how] ?? ''],
    ['The look', [o.what, o.colour].filter(Boolean).join(', ')],
    ['From', o.where],
    ['Your size', o.size],
    ['Fitting', o.fitting ? shortDay(o.fitting) : ''],
    [o.how === 'hire' ? 'Pick up by' : 'Order by', o.orderBy ? shortDay(o.orderBy) : ''],
    ['Return by', o.how === 'hire' && o.returnBy ? shortDay(o.returnBy) : ''],
  ];
  // Who's paying: said plainly at the top, a thank-you when the couple are.
  const kind = /bridesmaid|maid|matron|flower girl|bride/i.test(me.role) ? 'dress' : /suit|groom|best man|page|ring/i.test(me.role) ? 'suit' : 'outfit';
  const cost = o.each ? `$${o.each.toLocaleString('en-AU')}` : '';
  const paying =
    o.payer === 'us'
      ? `Your ${kind} is our gift to you. Thank you for wearing it.`
      : o.payer === 'them'
        ? `You’re paying for your own ${kind}${cost ? `: about ${cost}` : ''}.`
        : o.payer === 'split'
          ? `We’re going halves on your ${kind}${o.each ? `: your half is about $${Math.round(o.each / 2).toLocaleString('en-AU')}` : ''}.`
          : '';
  return (
    <section id="outfit" aria-label="Your outfit" className="flex flex-col gap-3 p-5 rounded-[18px] scroll-mt-24" style={cardStyle(look)}>
      <CardTitle aside={o.collected && <span className="text-[16px] italic" style={{ color: look.label }}>Collected ✓</span>}>{`${first(me.name)}’s outfit`}</CardTitle>
      {paying && (
        <p className="m-0 p-4 rounded-[14px] text-[19px] leading-[1.4]" style={{ background: o.payer === 'us' ? look.wash : 'transparent', border: `1px solid ${look.gold}` }}>
          {paying}
        </p>
      )}
      <dl className="m-0 grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 text-[18px] leading-[1.35]">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="py-2 border-t text-[15px] tracking-[.08em] uppercase self-stretch" style={{ borderColor: look.line, color: look.label, fontFamily: SANS }}>
                {k}
              </dt>
              <dd className="m-0 py-2 border-t break-words" style={{ borderColor: look.line }}>
                {v}
              </dd>
            </div>
          ))}
      </dl>
      {o.notes && <p className="m-0 text-[17px] leading-[1.45] whitespace-pre-wrap">{o.notes}</p>}
      {o.how === 'hire' && o.returnBy && <p className="m-0 text-[16px] italic opacity-80">Hired: it goes back by {shortDay(o.returnBy)}, so keep the receipt and the bag.</p>}
    </section>
  );
}

/** Their side's night out (the hens or the bucks). */
function Night({ night, look }: { night: NonNullable<PartyMine['night']>; look: PartyLook }) {
  return (
    <section aria-label={night.title || 'The night out'} className="flex flex-col gap-1 p-5 rounded-[18px] text-[18px]" style={{ background: look.wash, border: `1px solid ${look.gold}` }}>
      <Eyebrow color={look.label}>Save the date</Eyebrow>
      <h3 className="m-0 font-normal text-[27px] leading-[1.15]">{night.title || 'The night out'}</h3>
      {night.date && <span>{fmtDay(`${night.date}T12:00`)}</span>}
      {night.place && <span className="italic">{night.place}</span>}
      {night.organiser && <span className="text-[16px] opacity-80">Organised by {night.organiser}</span>}
    </section>
  );
}

type Act = (body: Omit<PartyAct, 'token'>, apply: (m: PartyMine) => PartyMine) => void;

/** One tickable line: the whole row ticks it (a big target for a thumb); their own ones can be removed. */
function Tick({ text, done, onToggle, onRemove, look, children }: { text: string; done: boolean; onToggle: () => void; onRemove?: () => void; look: PartyLook; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-1 border-t" style={{ borderColor: look.line }}>
      <label className="flex-1 min-w-0 flex items-start gap-3 py-3 min-h-[44px] cursor-pointer text-[19px] leading-[1.3]">
        <input type="checkbox" aria-label={text} checked={done} onChange={onToggle} className="mt-[3px] w-[22px] h-[22px] flex-none cursor-pointer" style={{ accentColor: look.gold }} />
        <span className="flex-1 min-w-0 break-words" style={done ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}>
          {text}
          {children}
        </span>
      </label>
      {onRemove && (
        <button type="button" aria-label={`Remove ${text}`} onClick={onRemove} className="flex-none w-11 h-11 mt-[1px] flex items-center justify-center rounded-full border-0 bg-transparent cursor-pointer opacity-60 text-[22px]" style={{ color: look.ink }}>
          ×
        </button>
      )}
    </div>
  );
}

/** A one-line box to add their own thing. */
function AddLine({ label, onAdd, look }: { label: string; onAdd: (text: string) => boolean; look: PartyLook }) {
  const [adding, setAdding] = useState('');
  return (
    <form
      className="flex gap-2 pt-3 border-t"
      style={{ borderColor: look.line }}
      onSubmit={(e) => {
        e.preventDefault();
        const text = adding.trim();
        if (!text) return;
        if (onAdd(text)) setAdding('');
      }}
    >
      <input aria-label={label} placeholder={label} value={adding} maxLength={160} onChange={(e) => setAdding(e.target.value)} className="flex-1 min-w-0 min-h-[44px] px-3 rounded-[12px] border bg-white text-[17px]" style={{ borderColor: look.line, color: look.ink }} />
      <button type="submit" className="flex-none min-h-[44px] px-5 rounded-full border-0 text-[16px] cursor-pointer" style={{ background: look.ink, color: look.paper, fontFamily: SANS }}>
        Add
      </button>
    </form>
  );
}

const count = (left: number, total: number, all: string, look: PartyLook) =>
  total ? (
    <span className="text-[16px] italic" style={{ color: left ? look.label : look.ink, opacity: left ? 1 : 0.75 }}>
      {left ? `${left} to go` : all}
    </span>
  ) : null;

/** Their packing list: the couple's list for them plus anything they add, ticked off and saved for them. */
function Packing({ items, me, act, look }: { items: { text: string }[]; me: PartyMine; act: Act; look: PartyLook }) {
  const shared = items.map((i) => ({ text: i.text, done: me.packed.includes(i.text), own: false }));
  const all = [...shared, ...me.pack.map((p) => ({ ...p, own: true }))];
  const left = all.filter((i) => !i.done).length;
  return (
    <div className="flex flex-col p-5 rounded-[18px]" style={cardStyle(look)}>
      <div className="pb-2">
        <CardTitle aside={count(left, all.length, 'All packed ✓', look)}>What to pack</CardTitle>
      </div>
      {all.map((i) => (
        <Tick
          key={`${i.own ? 'o' : 's'}-${i.text}`}
          text={i.text}
          done={i.done}
          look={look}
          onToggle={() =>
            i.own
              ? act({ personId: me.personId, action: 'own-pack', text: i.text, done: !i.done }, (m) => ({ ...m, pack: m.pack.map((x) => (x.text === i.text ? { ...x, done: !i.done } : x)) }))
              : act({ personId: me.personId, action: 'packed', text: i.text, done: !i.done }, (m) => ({ ...m, packed: i.done ? m.packed.filter((x) => x !== i.text) : [...m.packed, i.text] }))
          }
          onRemove={i.own ? () => act({ personId: me.personId, action: 'remove-pack', text: i.text }, (m) => ({ ...m, pack: m.pack.filter((x) => x.text !== i.text) })) : undefined}
        />
      ))}
      <AddLine
        label="Add something to pack"
        look={look}
        onAdd={(text) => {
          if (all.some((x) => x.text === text)) return false;
          act({ personId: me.personId, action: 'add-pack', text }, (m) => ({ ...m, pack: [...m.pack, { text, done: false }] }));
          return true;
        }}
      />
    </div>
  );
}

/** Their to-dos before the day: their own and their side's, ticked off here (the couple sees it). They can add their own. */
function Todos({ me, act, look, many, canAdd }: { me: PartyMine; act: Act; look: PartyLook; many: boolean; canAdd: boolean }) {
  const left = me.tasks.filter((t) => !t.done).length;
  const fmt = (d: string) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '');
  return (
    <section id="todos" aria-label={`${first(me.name)}’s to-dos`} className="scroll-mt-24 flex flex-col p-5 rounded-[18px]" style={cardStyle(look)}>
      <div className="pb-2">
        <CardTitle aside={count(left, me.tasks.length, 'All done ✓', look)}>{many ? `${first(me.name)}’s to-dos` : 'Your to-dos'}</CardTitle>
      </div>
      {me.tasks.map((t) => (
        <Tick
          key={t.id}
          text={t.text}
          done={t.done}
          look={look}
          onToggle={() => act({ personId: me.personId, action: 'task', id: t.id, done: !t.done }, (m) => ({ ...m, tasks: m.tasks.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)) }))}
          onRemove={t.mine ? () => act({ personId: me.personId, action: 'remove-task', id: t.id }, (m) => ({ ...m, tasks: m.tasks.filter((x) => x.id !== t.id) })) : undefined}
        >
          {t.due && (
            <span className="ml-2 inline-block text-[15px] italic whitespace-nowrap" style={{ color: look.label }}>
              by {fmt(t.due)}
            </span>
          )}
        </Tick>
      ))}
      {!me.tasks.length && (
        <p className="m-0 py-3 border-t italic opacity-75 text-[18px]" style={{ borderColor: look.line }}>
          {canAdd ? 'Nothing yet. Add your own below.' : 'Nothing yet.'}
        </p>
      )}
      {canAdd && (
        <AddLine
          label="Add a to-do"
          look={look}
          onAdd={(text) => {
            // Added for real once saved (it needs its id from the couple's plan): the page reloads its lists.
            act({ personId: me.personId, action: 'add-task', text }, (m) => ({ ...m, tasks: [...m.tasks, { id: `new-${Date.now()}`, text, due: '', done: false, mine: true }] }));
            return true;
          }}
        />
      )}
    </section>
  );
}

/**
 * On the day: what's happening now and what's next, big, at the top (for the event happening today).
 * The MC also gets a speech timer (3, 5 or 8 minutes) that turns gold, then red, as time runs out.
 */
function NowNext({ data, now, look, isMc }: { data: PartyPayload; now: number; look: PartyLook; isMc: boolean }) {
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
  const tag = (t: string) => (
    <div className="text-[14px] tracking-[.25em] uppercase font-semibold" style={{ fontFamily: SANS, color: look.gold }}>
      {t}
    </div>
  );
  return (
    <section aria-label="Now and next" className="flex flex-col gap-4 p-5 rounded-[20px]" style={{ background: look.ink, color: look.paper, boxShadow: look.shadow }}>
      {today && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            {tag('Now')}
            <div className="text-[27px] leading-tight break-words">{cur >= 0 ? items[cur]!.title : 'Not started yet'}</div>
            {cur >= 0 && items[cur]!.place && <div className="text-[17px] italic opacity-80">{items[cur]!.place}</div>}
          </div>
          <div className="min-w-0 pt-3 border-t sm:pt-0 sm:border-t-0 sm:pl-4 sm:border-l" style={{ borderColor: 'rgba(255,255,255,.2)' }}>
            {tag('Next')}
            <div className="text-[27px] leading-tight break-words">{next >= 0 ? `${items[next]!.time} · ${items[next]!.title}` : 'That’s the lot!'}</div>
            {next >= 0 && times[next] !== null && <div className="text-[17px] italic opacity-80">in {Math.max(0, Math.round((times[next]! - now) / 60_000))} minutes</div>}
          </div>
        </div>
      )}
      {isMc && (
        <div className="flex flex-col gap-3 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,.2)' }}>
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[20px]">Speech timer</span>
            <span className="flex gap-2 flex-wrap">
              {[3, 5, 8].map((m) => (
                <button key={m} type="button" onClick={() => setTimer({ until: Date.now() + m * 60_000, mins: m })} className="min-h-[44px] px-4 rounded-full border bg-transparent text-[16px] cursor-pointer" style={{ borderColor: 'rgba(255,255,255,.4)', color: look.paper, fontFamily: SANS }}>
                  {m} min
                </button>
              ))}
              {timer && (
                <button type="button" onClick={() => setTimer(null)} className="min-h-[44px] px-4 rounded-full border-0 bg-white/15 text-[16px] cursor-pointer" style={{ color: look.paper, fontFamily: SANS }}>
                  Stop
                </button>
              )}
            </span>
          </div>
          {timer && (
            <div role="timer" aria-live="off" className="text-center text-[64px] leading-none tabular-nums font-semibold" style={{ color: left === 0 ? '#e8a08a' : left <= 30 ? look.gold : look.paper }}>
              {left === 0 ? 'Time!' : mmss}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** `sample`: /demo/party, the sample wedding's party page (?as=best | maid | bridesmaid | groomsman); nothing is sent. */
export function PartyPage({ sample = false }: { sample?: boolean } = {}) {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const token = params.get('g') ?? '';
  // Which part is open: the menu ('home'), or one part (in the address, so Back returns to the menu).
  const part = (params.get('part') ?? 'home') as Part;
  const goPart = (to: Part) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      if (to === 'home') n.delete('part');
      else n.set('part', to);
      return n;
    });
  const [data, setData] = useState<PartyPayload | null>(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [mine, setMine] = useState<PartyMine[]>([]);
  const [note, setNote] = useState('');
  const [signIn, setSignIn] = useState(false);
  const loaded = useRef(false);

  const load = () =>
    (sample ? import('../../sales/sampleParty').then((m) => m.sampleParty(params.get('as'))) : guestApi.party(slug, token))
      .then((d) => {
        setData(d);
        loaded.current = true;
        setMine(d.mine ?? []);
        setSignIn(false);
      })
      // Once the page is up, a failed refresh keeps what's showing (with a note).
      .catch((e: Error) => {
        if (e instanceof GuestApiError && (e.status === 401 || (!token && e.status === 404))) setSignIn(true);
        else if (loaded.current) setNote('Can’t reach the site just now: showing what you had.');
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
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [part]);

  if (signIn) return <PartySignIn slug={slug} onDone={() => void load()} />;
  if (err) return <GuestMessage message={err} />;
  if (!data) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const perms = data.perms;
  const link = token || data.account?.token || '';
  /** Shows the change straight away, saves it, and puts it back (with a note) if it didn't save. */
  const act: Act = (body, apply) => {
    const before = mine;
    setMine((ms) => ms.map((m) => (m.personId === body.personId ? apply(m) : m)));
    setNote('');
    if (sample) return; // the sample: shown, kept for this visit only
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
  // The wedding's own colours (its invitation theme).
  const look = partyLook(data.theme);
  const { ink, gold } = look;
  const roles = [...new Set(data.me.map((m) => m.role))];
  const group = partyGroup(roles);
  const title = (k: 'p1' | 'p2') => `${data.sides?.[k] || (k === 'p1' ? 'Bride' : 'Groom')}'s side`;
  const sides: [string, string, PartyPayload['party']][] = [
    [title('p1'), data.names.p1, data.party.filter((p) => p.side === 'p1')],
    [title('p2'), data.names.p2, data.party.filter((p) => p.side === 'p2')],
    ['Also helping', '', data.party.filter((p) => !p.side)],
  ];
  const calendar = mine.some((m) => m.calendar);
  const showTodos = (!perms || perms.tasks) && mine.length > 0;
  const hasOutfit = mine.some((m) => m.outfit && (m.outfit.how || m.outfit.what || m.outfit.size || m.outfit.fitting));
  const nights = [...new Map(mine.filter((m) => m.night).map((m) => [JSON.stringify(m.night), m.night!])).values()];
  const needsYou = showTodos || calendar || hasOutfit || nights.length > 0;
  const cssVars = { '--pi': ink, '--pg': gold, '--pp': look.paper } as CSSProperties;

  const openTodos = mine.reduce((n, m) => n + m.tasks.filter((t) => !t.done).length, 0);
  const yourMoments = data.events.reduce((n, e) => n + e.items.filter((it) => forYou(it.who)).length, 0);
  const hasExtras = !!(data.guests || data.vendors?.length || data.seating?.length);
  const initials = [data.names.p1, data.names.p2].map((n) => n.trim()[0] ?? '').filter(Boolean).join(' & ');
  // The menu: each part of their page, opened one at a time (Back, or Menu, returns here).
  const tiles: { key: Exclude<Part, 'home'>; title: string; sub: string; show: boolean }[] = [
    { key: 'needs', title: 'What needs you', sub: openTodos ? `${openTodos} to do` : showTodos ? 'All done' : 'Outfit, the night out, your calendar', show: needsYou },
    { key: 'day', title: data.events.length > 1 ? 'Your days' : 'The day', sub: yourMoments ? `${yourMoments} of your moments marked` : data.events[0] ? fmtDay(data.events[0].startsAt) || 'The run sheet' : 'Coming soon', show: true },
    { key: 'people', title: 'Who’s who', sub: `${data.party.length} ${data.party.length === 1 ? 'person' : 'people'}, with their numbers`, show: data.party.length > 0 },
    { key: 'more', title: 'Guests and suppliers', sub: [data.guests && 'Numbers', data.vendors?.length && 'suppliers', data.seating?.length && 'seating'].filter(Boolean).join(', '), show: hasExtras },
    { key: 'help', title: 'How it works', sub: 'And putting it on your phone', show: true },
  ];
  const shown = tiles.filter((t) => t.show);
  const here = shown.find((t) => t.key === part);

  return (
    <main className="min-h-screen overflow-x-hidden" style={{ ...cssVars, background: look.bg, color: ink, fontFamily: SERIF }}>
      <div className="max-w-[640px] mx-auto px-4 sm:px-5 pt-10 pb-24 flex flex-col gap-6">
        {!here ? (
          <>
            <header className="text-center flex flex-col items-center gap-3">
              <Eyebrow color={look.label}>{data.couple}</Eyebrow>
              <h1 className="m-0 font-normal text-[50px] leading-[1.1] break-words max-w-full" style={{ fontFamily: "'Pinyon Script', cursive" }}>
                {group.title}
              </h1>
              <Ornament gold={gold} />
            </header>

            {/* Their invitation, on top: an envelope to tap open. */}
            {(link || sample) && <Envelope href={sample ? '/demo' : `/w/${encodeURIComponent(slug)}?g=${encodeURIComponent(link)}`} look={look} initials={initials} />}

            {/* Who they are, and their part. */}
            <section aria-label="Your role" className="flex flex-col items-center gap-2 px-5 py-5 rounded-[22px] text-center" style={cardStyle(look, { border: `1px solid ${gold}` })}>
              {data.me.map((m) => (
                <div key={`${m.name}-${m.role}`} className="flex flex-col items-center gap-2 min-w-0">
                  <div className="text-[30px] leading-[1.1] break-words max-w-full">{m.name}</div>
                  <span className="inline-flex items-center min-h-[32px] px-4 rounded-full text-[14px] tracking-[.12em] uppercase font-semibold" style={{ background: look.wash, color: look.label, fontFamily: SANS, border: `1px solid ${gold}` }}>
                    {m.role}
                  </span>
                </div>
              ))}
              <p className="m-0 text-[19px] italic leading-[1.35]">Thank you for standing with us.</p>
              {data.account && (
                <AccountBar
                  slug={slug}
                  name={data.account.name}
                  onSignedOut={() => {
                    loaded.current = false;
                    setData(null);
                    setSignIn(true);
                  }}
                />
              )}
            </section>

            {data.me
              .filter((m) => HONOUR.test(m.role))
              .map((m) => (
                <Honour key={`h-${m.name}`} name={first(m.name)} role={m.role} couple={data.couple} look={look} />
              ))}

            <NowNext data={data} now={now} look={look} isMc={roles.some((r) => /\bmc\b|master of ceremonies/i.test(r))} />

            {note && (
              <p role="alert" className="m-0 p-3 rounded-[12px] text-[17px]" style={{ background: '#f4dcd2', color: '#7a4a37' }}>
                {note}
              </p>
            )}

            <nav aria-label="Your page" className="grid grid-cols-2 gap-3">
              {shown.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => goPart(t.key)}
                  className={`flex flex-col items-start justify-between gap-2 min-h-[118px] p-4 rounded-[18px] text-left cursor-pointer ${i === 0 && shown.length % 2 ? 'col-span-2' : ''}`}
                  style={{ ...cardStyle(look), color: ink, fontFamily: SERIF }}
                >
                  <span className="text-[24px] leading-[1.15]">{t.title}</span>
                  <span className="text-[14px] leading-[1.35]" style={{ color: look.label, fontFamily: SANS }}>
                    {t.sub} <span aria-hidden>→</span>
                  </span>
                </button>
              ))}
            </nav>
            <InstallApp what="your wedding party page" tone="guest" />
          </>
        ) : (
          <>
            {/* One part at a time, with the way back always in reach. */}
            <div className="sticky top-0 z-10 -mx-4 sm:-mx-5 px-4 sm:px-5 py-2 flex items-center gap-3 backdrop-blur" style={{ background: `${look.paper}f0`, borderBottom: `1px solid ${look.line}`, fontFamily: SANS }}>
              <button type="button" onClick={() => goPart('home')} className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-full border-0 text-[15px] font-semibold cursor-pointer" style={{ background: ink, color: look.paper }}>
                <span aria-hidden>←</span> Menu
              </button>
              <span className="min-w-0 truncate text-[13px] tracking-[.16em] uppercase font-semibold" style={{ color: look.label }}>
                {data.couple}
              </span>
            </div>
            {note && (
              <p role="alert" className="m-0 p-3 rounded-[12px] text-[17px]" style={{ background: '#f4dcd2', color: '#7a4a37' }}>
                {note}
              </p>
            )}
            {part === 'needs' && (
              <div className="flex flex-col gap-4">
                <Heading kicker="Before the day" title="What needs you" look={look} />
                {showTodos && mine.map((m) => <Todos key={m.personId} me={m} act={act} look={look} many={mine.length > 1} canAdd={!perms || perms.addTasks} />)}
                {mine.map((m) => (
                  <Outfit key={`o-${m.personId}`} me={m} look={look} />
                ))}
                {nights.map((n) => (
                  <Night key={`${n.title}-${n.date}`} night={n} look={look} />
                ))}
                {calendar && (
                  <section aria-label="Your calendar" className="flex flex-col gap-2 p-5 rounded-[18px] text-[17px] leading-[1.45]" style={cardStyle(look)}>
                    <h3 className="m-0 font-normal text-[27px] leading-[1.15]">On your phone</h3>
                    <span>Your jobs (with a reminder the morning before), fittings, the hens or bucks, and your moments on the day, in your phone’s calendar. If anything changes, it updates by itself.</span>
                    {mine
                      .filter((m) => m.calendar)
                      .map((m) => {
                        const feed = m.calendar!.replace(/^https?:/, 'webcal:');
                        const android = /android/i.test(navigator.userAgent);
                        return (
                          <a
                            key={m.personId}
                            href={android ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}` : feed}
                            {...(android ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            className={`self-start mt-1 ${pill} whitespace-normal text-center`}
                            style={{ background: ink, color: look.paper, fontFamily: SANS }}
                          >
                            Add {mine.length > 1 ? `${first(m.name)}’s` : 'my'} jobs to my calendar
                          </a>
                        );
                      })}
                  </section>
                )}
              </div>
            )}
            {part === 'day' && (
              <>
              {data.events.map((e) => {
                const times = e.items.map((it) => at(e.startsAt, it.time));
                // On the day: the latest line that has started is "now"; the one after it is "next".
                const current = times.reduce<number>((acc, t, i) => (t !== null && t <= now && new Date(e.startsAt).toDateString() === new Date(now).toDateString() ? i : acc), -1);
                const anyYours = e.items.some((it) => forYou(it.who));
                return (
                  <section key={e.key} id={e.key === data.events[0]?.key ? 'runsheet' : undefined} aria-label={e.name} className="scroll-mt-24 flex flex-col gap-4">
                    <Heading kicker={fmtDay(e.startsAt) || 'Your day'} title={e.name} look={look} />
                    {e.note && (
                      <p className="m-0 p-5 rounded-[18px] text-[19px] leading-[1.45] italic whitespace-pre-wrap" style={cardStyle(look)}>
                        {e.note}
                      </p>
                    )}
                    {anyYours && (
                      <p className="m-0 flex items-center justify-center gap-2 text-[16px] italic">
                        <span aria-hidden="true" className="inline-block w-[10px] h-[10px] rounded-full" style={{ background: gold }} />
                        Your own moments are marked.
                      </p>
                    )}
                    {e.items.length > 0 && (
                      <ol className="m-0 p-0 list-none flex flex-col rounded-[18px] overflow-hidden" style={cardStyle(look)}>
                        {e.items.map((it, i) => {
                          const yours = forYou(it.who);
                          const isNow = i === current;
                          return (
                            <li
                              key={i}
                              className="grid grid-cols-[74px_minmax(0,1fr)] gap-3 py-4 pr-4 pl-3"
                              style={{
                                borderTop: i ? `1px solid ${look.line}` : undefined,
                                background: isNow ? look.nowWash : yours ? look.wash : undefined,
                                boxShadow: yours || isNow ? `inset 4px 0 0 ${gold}` : undefined,
                              }}
                            >
                              <div className="text-right">
                                <div className="text-[19px] font-semibold leading-tight">{it.time}</div>
                                {it.until && <div className="text-[15px] opacity-70">to {it.until}</div>}
                                {isNow && (
                                  <div className="mt-1 text-[14px] tracking-[.18em] uppercase font-semibold" style={{ color: look.label, fontFamily: SANS }}>
                                    Now
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className="text-[21px] leading-[1.25] break-words min-w-0">{it.title}</span>
                                  {yours && (
                                    <span className="text-[14px] tracking-[.12em] uppercase font-semibold" style={{ color: look.label, fontFamily: SANS }}>
                                      Yours
                                    </span>
                                  )}
                                </div>
                                {it.place && <div className="text-[16px] italic opacity-80">{it.place}</div>}
                                {it.detail && <div className="text-[17px] leading-[1.45] whitespace-pre-wrap break-words">{it.detail}</div>}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {!e.items.length && <p className="m-0 text-center text-[18px] italic opacity-75">The run sheet for this one is coming.</p>}
                    {!!e.holding?.length && (
                      <div className="p-5 rounded-[18px] text-[19px] leading-[1.4]" style={{ background: look.wash, border: `1px solid ${gold}` }}>
                        <strong className="font-semibold">You’re looking after:</strong> {e.holding.join(', ')}
                      </div>
                    )}
                    {!!e.speeches?.length && (
                      <div className="flex flex-col p-5 rounded-[18px]" style={cardStyle(look)}>
                        <div className="pb-2">
                          <CardTitle>Speeches</CardTitle>
                        </div>
                        {e.speeches.map((s, i) => (
                          <div key={i} className="flex justify-between gap-3 py-2 border-t text-[19px]" style={{ borderColor: look.line }}>
                            <span className="min-w-0 break-words">
                              {i + 1}. {s.who}
                            </span>
                            <span className="italic opacity-75 whitespace-nowrap">{s.minutes} min</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {mine[0] && (!!e.packing?.length || mine[0].pack.length > 0) && <Packing items={e.packing ?? []} me={mine[0]} act={act} look={look} />}
                  </section>
                );
              })}
              {!data.events.length && <p className="m-0 text-center text-[19px] italic">Your run sheet is on its way. Check back closer to the day.</p>}

              </>
            )}
            {part === 'people' && (
            <section id="whos-who" aria-label="Who's who" className="scroll-mt-24 flex flex-col gap-4">
              <div className="text-center flex flex-col gap-1">
                <Eyebrow color={look.label}>Your people</Eyebrow>
                <h2 className="m-0 font-normal text-[34px] leading-[1.1]">Who's who</h2>
                <div className="pt-1">
                  <Ornament gold={gold} width={84} />
                </div>
              </div>
              {sides
                .filter(([, , ps]) => ps.length)
                .map(([label, who, ps]) => (
                  <div key={label} className="flex flex-col p-5 rounded-[18px]" style={cardStyle(look)}>
                    <div className="pb-2 text-[14px] tracking-[.18em] uppercase font-semibold" style={{ fontFamily: SANS, color: look.label }}>
                      {label}
                      {who ? <span className="normal-case tracking-normal font-normal"> · {who}</span> : null}
                    </div>
                    {ps.map((p) => (
                      <div key={`${p.name}-${p.role}`} className="flex items-center justify-between gap-3 py-3 border-t flex-wrap" style={{ borderColor: look.line }}>
                        <div className="min-w-0 text-[19px] leading-[1.25]">
                          {p.name} <span className="italic opacity-75">· {p.role}</span>
                        </div>
                        {p.phone && (
                          <span className="flex gap-2 flex-none">
                            <a href={`tel:${digits(p.phone)}`} className={pill} style={{ color: ink, border: `1px solid ${gold}`, fontFamily: SANS }}>
                              Call
                            </a>
                            <a href={`sms:${digits(p.phone)}`} className={pill} style={{ color: ink, border: `1px solid ${gold}`, fontFamily: SANS }}>
                              Text
                            </a>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
            </section>
            )}
            {part === 'more' && <Extras data={data} look={look} />}
            {part === 'help' && (
              <>
                <PartyWelcome
                  storeKey={`wp-party-welcome-${slug}-${data.me.map((m) => m.name).join('-')}`}
                  firstNames={data.me.map((m) => first(m.name)).join(' & ')}
                  word={group.word}
                  couple={data.couple}
                  perms={perms}
                  calendar={calendar}
                  gold={gold}
                  ink={ink}
                  paper={look.card}
                />
                <PartyHelp perms={perms} calendar={calendar} gold={gold} />
                <InstallApp what="your wedding party page" tone="guest" />
              </>
            )}
            <button type="button" onClick={() => goPart('home')} className="self-center inline-flex items-center min-h-[44px] px-5 rounded-full text-[15px] cursor-pointer" style={{ border: `1px solid ${gold}`, background: 'transparent', color: ink, fontFamily: SANS }}>
              ← Back to the menu
            </button>
          </>
        )}
      </div>
    </main>
  );
}

/** The two who stand right beside the couple: their page says so, properly. */
const HONOUR = /\b(best man|best woman|maid of honou?r|matron of honou?r|man of honou?r)\b/i;

function Honour({ name, role, couple, look }: { name: string; role: string; couple: string; look: PartyLook }) {
  return (
    <section aria-label={`Thank you, our ${role.toLowerCase()}`} className="relative flex flex-col items-center gap-3 px-6 py-8 rounded-[24px] text-center" style={{ background: look.ink, color: look.paper, boxShadow: `0 0 0 1px ${look.gold}, 0 0 0 6px ${look.ink}, 0 0 0 7px ${look.gold}, ${look.shadow}` }}>
      <span className="text-[12px] tracking-[.3em] uppercase font-semibold" style={{ fontFamily: SANS, color: look.gold }}>
        A very special thank you
      </span>
      <h2 className="m-0 font-normal text-[46px] leading-[1.05]" style={{ fontFamily: "'Pinyon Script', cursive" }}>
        Our {role.toLowerCase()}
      </h2>
      <Ornament gold={look.gold} />
      <p className="m-0 text-[21px] leading-[1.45] italic max-w-[440px]">
        {name}, of everyone we know, we asked you to stand right beside us. Thank you for everything you’ve already done, and everything you’ll do on the day. We truly couldn’t do this without you.
      </p>
      <span className="text-[26px]" style={{ fontFamily: "'Pinyon Script', cursive", color: look.gold }}>
        With all our love, {couple}
      </span>
    </section>
  );
}

/** Their invitation, at the top of their page: a small sealed envelope in the wedding's colours. Tap to open. */
function Envelope({ href, look, initials }: { href: string; look: PartyLook; initials: string }) {
  return (
    <a href={href} aria-label="Your invitation: tap to open" className="block no-underline" style={{ color: look.ink }}>
      <span className="relative block w-full aspect-[16/10] max-h-[260px] rounded-[18px] overflow-hidden [clip-path:inset(0_round_18px)]" style={{ background: look.soft, boxShadow: look.shadow, border: `1px solid ${look.line}` }}>
        <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 100 62" preserveAspectRatio="none">
          <path d="M0 62 L50 34 L100 62Z" fill="rgba(0,0,0,.04)" />
          <path d="M0 0 L50 34 L100 0Z" fill={look.card} stroke={look.line} strokeWidth=".4" />
        </svg>
        <span className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2" style={{ filter: 'drop-shadow(0 3px 4px rgba(40,25,10,.35))' }}>
          <WaxSeal colour="Sandstone" words={initials || '♥'} px={64} still />
        </span>
        <span className="absolute left-0 right-0 bottom-3 text-center text-[13px] tracking-[.28em] uppercase" style={{ fontFamily: SANS, color: look.label }}>
          Your invitation · tap to open
        </span>
      </span>
    </a>
  );
}

/** What the couple lets this member see beyond their part: suppliers on the day, guest numbers, the seating plan. */
function Extras({ data, look }: { data: PartyPayload; look: PartyLook }) {
  const card = 'flex flex-col p-5 rounded-[18px]';
  const style = cardStyle(look);
  const line = { borderColor: look.line };
  return (
    <>
      {data.guests && (
        <section aria-label="Guests" className={`${card} gap-2`} style={style}>
          <h2 className="m-0 font-normal text-[28px]">Guests</h2>
          <div className="flex gap-x-6 gap-y-1 flex-wrap items-baseline text-[19px]">
            <span>
              <strong className="text-[32px] font-semibold" style={{ color: look.label }}>
                {data.guests.coming}
              </strong>{' '}
              coming
            </span>
            <span>{data.guests.waiting} still to reply</span>
            <span>{data.guests.invited} invitations</span>
          </div>
        </section>
      )}
      {!!data.vendors?.length && (
        <section aria-label="Suppliers on the day" className={card} style={style}>
          <h2 className="m-0 pb-2 font-normal text-[28px]">Suppliers on the day</h2>
          {data.vendors.map((v) => (
            <div key={v.name} className="flex justify-between items-center gap-3 py-3 border-t text-[18px]" style={line}>
              <span className="min-w-0 break-words">
                {v.name}
                <span className="block text-[15px] italic opacity-75">{[v.category, v.arrival && `arrives ${v.arrival}`, v.contact].filter(Boolean).join(' · ')}</span>
              </span>
              {v.phone && (
                <a href={`tel:${digits(v.phone)}`} className={`flex-none ${pill}`} style={{ color: look.ink, border: `1px solid ${look.gold}`, fontFamily: SANS }}>
                  Call
                </a>
              )}
            </div>
          ))}
        </section>
      )}
      {!!data.seating?.length && (
        <section aria-label="Seating plan" className={`${card} gap-3`} style={style}>
          <h2 className="m-0 font-normal text-[28px]">Seating plan</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.seating.map((t) => (
              <div key={t.table} className="text-[17px] pt-2 border-t" style={line}>
                <strong className="font-semibold">{/^\d+$/.test(t.table) ? `Table ${t.table}` : t.table}</strong>
                <span className="opacity-70"> · {t.people.length}</span>
                <div className="text-[16px] opacity-85 break-words">{t.people.join(', ') || 'No one yet'}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

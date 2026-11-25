import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDay, fmtWhen } from '../lib/format';
import { AccountHome } from './AccountHome';
import { Card, Kpis } from './hub/Hub';
import { PortalPreviews } from './PortalPreviews';
import { C, Donut } from './hub/charts';
import { useAdmin, useSectionOverview } from './Shell';
import { ErrorState, Eyebrow, H2, Loading } from './ui';
import { envelopeClose } from '../sales/Stills';

/** The overview's cover picture, drawn once per couple (it's a few milliseconds, but no need to redo it). */
const covers = new Map<string, string>();
const coverOf = (initials: string, names: string) => {
  const key = `${initials}|${names}`;
  if (!covers.has(key)) covers.set(key, envelopeClose(undefined, undefined, initials, names));
  return covers.get(key)!;
};


/** design/RSVP Admin.dc.html → Overview. */
export function Overview() {
  const { wid, error, reload, path } = useAdmin();
  // Figures for the section in the address only: while another section's are still on screen, this is loading.
  const o = useSectionOverview();
  const go = useNavigate();
  /** Open a page in the right section of the menu (an event's guests, Account's texting setup…). */
  const to = (link: string, event?: string) => go(path(link, event));
  if (error && !o) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!o) return <Loading />;
  // Account: the setup and settings home. Each event's overview is below.
  if (!o.focus) return <AccountHome o={o} to={to} />;
  const tz = o.wedding.timezone;
  // The event switcher: figures are about the event being looked at.
  const shown = o.focus ? o.events.filter((e) => e.key === o.focus) : o.events;
  const firstEvent = shown[0];
  /** Guest lists, texts and seating live in an event: this one, or the first from Account. */
  const home = o.focus ?? o.events[0]?.key;
  const all = o.focus ? '' : 'show=all&';

  const ev = firstEvent;
  // Counted in guests, as the guest list counts them: coming + can't come + still to reply = everyone invited.
  const n = o.guests ?? { guests: o.seatsHeld, coming: ev?.coming ?? 0, cantCome: 0, awaiting: 0, invitations: o.total, invitationsYes: o.yesInv, invitationsNo: o.noInv, invitationsAwaiting: o.awaiting, children: 0 };
  const inv = (k: number) => `${k} ${k === 1 ? 'invitation' : 'invitations'}`;
  const figures = [
    { label: 'Coming', value: n.coming, sub: `guests · ${inv(n.invitationsYes)} said yes`, go: () => to(ev ? `guests?filter=attending:${ev.key}` : 'guests?show=all', ev?.key ?? home) },
    { label: 'Still to reply', value: n.awaiting, sub: `guests · ${inv(n.invitationsAwaiting)}`, go: () => to(`guests?${all}filter=awaiting`, home), warn: false },
    { label: 'Can’t come', value: n.cantCome, sub: `guests · ${inv(n.invitationsNo)} said no`, go: () => to(`guests?${all}filter=declined`, home) },
    { label: 'Meals & allergies', value: o.diet.people, sub: `${o.diet.serious} serious · ${o.diet.mealsSet} meals set`, go: () => to('dietary', o.focus ?? o.perEvent?.find((e) => e.catered !== false)?.key ?? home), warn: o.diet.serious > 0 && o.diet.mealsSet < o.diet.people },
  ];
  const isWedding = o.focus === o.events[0]?.key;
  const first1 = o.wedding.name1.split(' ')[0] || o.wedding.name1;
  const first2 = o.wedding.name2.split(' ')[0] || o.wedding.name2;
  const cover = coverOf(`${first1[0] ?? ''} & ${first2[0] ?? ''}`, `${first1} & ${first2}`);

  return (
    <div className="flex flex-col gap-[30px]">
      {/* The event's cover: your names over a still life of your sealed invitation, the countdown and the replies so far. */}
      <header
        className="relative overflow-hidden rounded-[28px] border border-[var(--adm-line,#e2d7bc)] shadow-[0_26px_60px_rgba(60,30,40,.12)]"
        style={{ background: 'linear-gradient(120deg, var(--adm-card,#fbf8f0) 0%, var(--adm-card,#fbf8f0) 45%, var(--adm-tint,#f3ecd6) 100%)' }}
      >
        <img
          aria-hidden
          alt=""
          src={cover}
          decoding="async"
          className="absolute inset-y-0 right-0 h-full w-[62%] sm:w-[52%] object-cover opacity-[.42] sm:opacity-100"
          style={{ maskImage: 'linear-gradient(to right, transparent, #000 38%)', WebkitMaskImage: 'linear-gradient(to right, transparent, #000 38%)' }}
        />
        <div className="relative flex flex-col gap-3 p-6 sm:p-9 sm:max-w-[60%]">
          {firstEvent && o.daysToGo !== null && <Eyebrow>{`${o.daysToGo} days to ${firstEvent.name.replace(/^the\s+/i, 'the ')}`}</Eyebrow>}
          <div aria-hidden className="font-display text-[clamp(34px,6vw,52px)] leading-[1.02] text-[var(--adm-ink,#33402f)]">
            {first1}
            <span className="font-script text-[var(--adm-gold,#b9a07a)] mx-2 text-[.9em]">&amp;</span>
            {first2}
          </div>
          <h1 className="m-0 font-display font-medium italic text-[clamp(20px,4vw,26px)] leading-[1.15] [text-wrap:balance] text-[var(--adm-muted,#5b6a52)]">
            {n.guests - n.awaiting} of {n.guests} guests have replied
          </h1>
          <span className="text-[14px] text-[var(--adm-muted,#5b6a52)] -mt-2">
            {n.guests} guests on {inv(n.invitations)}
            {n.children ? ` · ${n.children} ${n.children === 1 ? 'child' : 'children'}` : ''}
          </span>
          <div aria-hidden className="h-[6px] max-w-[320px] rounded-full bg-[var(--adm-line,#e2d7bc)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${n.guests ? Math.round(((n.guests - n.awaiting) / n.guests) * 100) : 0}%`, background: 'linear-gradient(90deg, var(--adm-accent,#5d6b47), var(--adm-gold,#b9a07a))' }} />
          </div>
        </div>
      </header>

      <Kpis label="Replies at a glance" items={figures} />

      {/* The first screen (launch simplification, Jobs 2 and 5): the next three things to do, and what's coming up. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <NextThree o={o} to={to} />
        <ComingUp o={o} to={to} />
      </div>

      {/* Everything else on Home, folded (remembered on this device). */}
      <MoreOnHome wid={wid}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Replies" action={['Guest list', () => to(`guests?${all}`.replace(/[?&]$/, ''), home)]}>
            <Donut
              label="Guests"
              centre={`${n.guests ? Math.round(((n.guests - n.awaiting) / n.guests) * 100) : 0}%`}
              sub="replied"
              slices={[
                { label: 'Coming', value: n.coming, colour: C.accent },
                { label: 'Can’t come', value: n.cantCome, colour: C.gold },
                { label: 'Still to reply', value: n.awaiting, colour: C.sand },
              ]}
            />
          </Card>

          <Card title="Latest replies" action={['Everyone', () => to(`guests?${all}`.replace(/[?&]$/, ''), home)]}>
            <div className="flex flex-col">
              {o.latest.map((r) => (
                <button key={r.id} onClick={() => to(`guests?${all}g=${r.id}`, home)} className="flex flex-col gap-[2px] py-[10px] border-0 border-t border-[var(--adm-line,#ece3cc)] first:border-t-0 bg-transparent text-left cursor-pointer hover:bg-[var(--adm-tint,#f3ecd6)]">
                  <span className="flex justify-between gap-[10px] w-full">
                    <strong className="font-semibold">{r.name}</strong>
                    <span className="text-[12px] text-[var(--adm-muted,#5b6a52)] whitespace-nowrap">{fmtWhen(r.at, tz)}</span>
                  </span>
                  <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">{r.summary}</span>
                  {r.message && <span className="font-display italic text-[17px]">{r.message}</span>}
                </button>
              ))}
              {o.latest.length === 0 && <p className="m-0 text-[14px] text-[var(--adm-muted,#5b6a52)]">No replies yet. They show here as they come in.</p>}
            </div>
          </Card>

          {/* Every portal as its person sees it: the wedding party, vendors, the coordinator, helpers. */}
          {isWedding && <PortalPreviews to={to} />}
        </div>
      </MoreOnHome>
    </div>
  );
}

/** Folded parts of Home, open or shut as last left on this device. */
function MoreOnHome({ wid, children }: { wid: string; children: ReactNode }) {
  const key = `wp.admin.home.${wid}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) === 'open';
    } catch {
      return false;
    }
  });
  return (
    <details
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(now);
        try {
          localStorage.setItem(key, now ? 'open' : 'shut');
        } catch {
          /* this visit only */
        }
      }}
      className="flex flex-col gap-4"
    >
      <summary className="inline-flex items-center min-h-[44px] cursor-pointer text-[14px] font-medium text-[var(--adm-muted,#5b6a52)]">More on Home: the replies, the latest messages and what everyone else sees</summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

type O = NonNullable<ReturnType<typeof useAdmin>['overview']>;

/**
 * "Next 3 things" (Job 2): exactly three, from where the couple actually are: the look, their names and the
 * reply-by date, the first guests, sharing it, their messages. Texts only once they're switched on.
 */
function NextThree({ o, to }: { o: O; to: (link: string, event?: string) => void }) {
  const ev = o.focus ?? o.events[0]?.key;
  const first = o.events[0]?.key;
  const textsOn = o.tools ? o.tools.on.texts : true;
  const unread = o.nav.messages ?? 0;
  const all: { done: boolean; title: string; line: string; cta: string; run: () => void }[] = [
    { done: !!o.wedding.theme, title: 'Choose your look', line: 'A design, the envelope and your wax seal.', cta: 'Choose', run: () => to('pages?page=invitation', first) },
    { done: !!o.wedding.rsvpClose, title: 'Your names and reply-by date', line: 'As your invitation shows them, and when replies close.', cta: 'Add', run: () => to('pages?page=invitation', first) },
    { done: o.nav.guests > 0, title: 'Add your first guests', line: 'From your phone’s contacts, a spreadsheet, or one by one.', cta: 'Add guests', run: () => to('guests?add=1', ev) },
    { done: o.replied > 0 || o.nav.guests === 0, title: 'Share your invitation', line: 'Each guest gets their own link, from your phone or by email.', cta: 'Share', run: () => to('guests', ev) },
    { done: unread === 0, title: 'Reply to messages', line: `${unread} waiting for you.`, cta: 'Open', run: () => to('messages', ev) },
    ...o.needsYou.map((x) => ({ done: false, title: x.title, line: x.detail, cta: x.cta, run: () => to(x.link, x.event ?? ev) })),
    ...(textsOn ? [{ done: o.nav.smsLive, title: 'Send a text', line: 'Your invitation by text, with reminders.', cta: 'Texts', run: () => to('texts', ev) }] : []),
  ];
  const three = all.filter((x) => !x.done && (textsOn || !/text/i.test(x.title))).slice(0, 3);
  return (
    <section aria-label="Next 3 things" className="flex flex-col gap-2 p-5 rounded-[16px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]">
      <div className="flex flex-col">
        <H2>Next 3 things</H2>
        <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">For this week</span>
      </div>
      {three.length ? (
        <ul className="m-0 p-0 list-none flex flex-col">
          {three.map((x) => (
            <li key={x.title} className="flex items-center gap-3 py-3 border-t border-[var(--adm-line,#ece3cc)] first:border-t-0">
              <span aria-hidden className="flex-none w-[18px] h-[18px] rounded-full border-2 border-[var(--adm-accent,#5d6b47)]" />
              <span className="flex-1 min-w-0 flex flex-col">
                <strong className="text-[15px] font-semibold">{x.title}</strong>
                <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">{x.line}</span>
              </span>
              <button type="button" onClick={x.run} className="flex-none inline-flex items-center min-h-[44px] px-4 rounded-full border border-[var(--adm-line,#d3c6a4)] bg-[var(--adm-bg,#f6f0e2)] text-[14px] font-medium cursor-pointer hover:bg-[var(--adm-tint,#efe7d3)]">
                {x.cta}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px] text-[#3d4a2f]">You’re up to date ✓</p>
      )}
    </section>
  );
}

/**
 * Coming up (Job 5): a real calendar, real dates in a 64px date column: replies closing, the wedding day (and
 * each event), and dated texts once texts are on. Expanded unless folded (remembered on this device).
 */
function ComingUp({ o, to }: { o: O; to: (link: string, event?: string) => void }) {
  const tz = o.wedding.timezone;
  const ev = o.focus ?? o.events[0]?.key;
  const textsOn = o.tools ? o.tools.on.texts : true;
  const key = `wp.admin.coming.${o.wedding.id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'shut';
    } catch {
      return true;
    }
  });
  const flip = () => {
    setOpen((x) => {
      try {
        localStorage.setItem(key, x ? 'shut' : 'open');
      } catch {
        /* this visit only */
      }
      return !x;
    });
  };
  const today = new Date().toISOString();
  const rows: { at: string; name: string; go: () => void }[] = [
    ...(o.wedding.rsvpClose ? [{ at: `${o.wedding.rsvpClose}T07:00:00.000Z`, name: 'Replies close', go: () => to('pages?page=invitation', o.events[0]?.key) }] : []),
    ...o.events.map((e) => ({ at: e.startsAt, name: e.name.replace(/^the\s+/i, 'The '), go: () => to('overview', e.key) })),
    ...(textsOn ? o.nextUp.map((u) => ({ at: u.sendAt, name: u.name, go: () => to('texts', ev) })) : []),
  ]
    .filter((r) => r.at && r.at >= today.slice(0, 10))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 6);
  return (
    <section aria-label="Coming up" className="flex flex-col gap-2 p-5 rounded-[16px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]">
      <div className="flex justify-between items-center gap-3">
        <button type="button" aria-expanded={open} onClick={flip} className="inline-flex items-center gap-2 min-h-[44px] p-0 border-0 bg-transparent cursor-pointer text-[var(--adm-ink,#33402f)]">
          <H2>Coming up</H2>
          <span aria-hidden className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        </button>
        <button type="button" onClick={() => to('planner?view=checklist', o.events[0]?.key)} className="inline-flex items-center min-h-[44px] p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[var(--adm-ink,#33402f)]">
          All dates
        </button>
      </div>
      {open &&
        (rows.length ? (
          <div className="flex flex-col">
            {rows.map((r) => (
              <button key={`${r.at}-${r.name}`} onClick={r.go} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 items-baseline min-h-[44px] py-[10px] border-0 border-t border-[var(--adm-line,#ece3cc)] first:border-t-0 bg-transparent text-left cursor-pointer hover:bg-[var(--adm-tint,#f3ecd6)]">
                <span className="font-display text-[20px] italic">{fmtDay(r.at, tz)}</span>
                <span className="font-medium min-w-0">{r.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="m-0 text-[14px] text-[var(--adm-muted,#5b6a52)]">Set your date in Invitation and it shows here, with the day replies close.</p>
        ))}
    </section>
  );
}

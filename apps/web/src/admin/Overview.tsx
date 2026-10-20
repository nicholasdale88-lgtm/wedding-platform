import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDay, fmtEvent, fmtWhen, shortLabel } from '../lib/format';
import { Events } from './events/Events';
import { Hub } from './hub/Hub';
import { useAdmin, useSectionOverview } from './Shell';
import { ErrorState, Eyebrow, H2, Loading, Pill, useMedia, useToast } from './ui';

const pc = (n: number, total: number) => `${total ? ((n / total) * 100).toFixed(1) : 0}%`;
const dot = (bg: string, border?: string) => (
  <span className="w-[9px] h-[9px] rounded-full" style={{ background: bg, border: border ? `1px solid ${border}` : undefined }} />
);

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
  const tz = o.wedding.timezone;
  // The event switcher: figures are about the event being looked at.
  const shown = o.focus ? o.events.filter((e) => e.key === o.focus) : o.events;
  const firstEvent = shown[0];
  /** Guest lists, texts and seating live in an event: this one, or the first from Account. */
  const home = o.focus ?? o.events[0]?.key;
  const all = o.focus ? '' : 'show=all&';

  const figures = [
    ...shown.map((e) => ({ label: shortLabel(e.name), val: e.coming, sub: 'guests coming', link: `guests?filter=attending:${e.key}`, event: e.key })),
    { label: 'Awaiting', val: o.awaiting, sub: 'invitations to reply', link: `guests?${all}filter=awaiting`, event: home },
    { label: 'Dietary', val: o.diet.people, sub: `${o.diet.serious} serious · ${o.diet.mealsSet} meals set`, link: 'dietary', event: o.focus ?? o.perEvent?.find((e) => e.catered !== false)?.key ?? home },
  ];

  return (
    <div className="flex flex-col gap-[34px]">
      {!o.focus && <GettingStarted o={o} to={to} />}
      <header className="flex flex-col gap-[14px]">
        {firstEvent && o.daysToGo !== null && <Eyebrow>{o.daysToGo} days to {firstEvent.name.replace(/^the\s+/i, 'the ')}</Eyebrow>}
        <h1 className="m-0 font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08] [text-wrap:balance]">
          {o.replied} of {o.total} invitations answered
        </h1>
        <div className="flex h-[10px] rounded-[99px] overflow-hidden bg-[#e6dcc4]" aria-hidden="true">
          <div style={{ width: pc(o.yesInv, o.total), background: '#5d6b47' }} />
          <div style={{ width: pc(o.noInv, o.total), background: '#b9a07a' }} />
        </div>
        <div className="flex gap-[18px] flex-wrap text-[13px] text-[#5b6a52]">
          <span className="flex items-center gap-[6px]">{dot('#5d6b47')}{o.yesInv} coming</span>
          <span className="flex items-center gap-[6px]">{dot('#b9a07a')}{o.noInv} declined</span>
          <span className="flex items-center gap-[6px]">{dot('#e6dcc4', '#c6b794')}{o.awaiting} awaiting</span>
        </div>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] border-t-2 border-[#33402f] border-b border-b-[#c6b794]">
        {figures.map((f) => (
          <button key={f.label} onClick={() => to(f.link, f.event)} className="flex flex-col gap-[6px] py-[18px] pr-4 pl-0 border-0 bg-transparent text-left cursor-pointer hover:bg-[#f1e9d6]">
            <Eyebrow>{f.label}</Eyebrow>
            <span className="font-display text-[52px] leading-[.95]">{f.val}</span>
            <span className="text-[13px] text-[#5b6a52]">{f.sub}</span>
          </button>
        ))}
      </div>

      {!o.focus && <Today o={o} to={to} />}

      <section className="flex flex-col gap-1" aria-label="Needs you">
        <div className="flex justify-between items-baseline gap-3 mb-[6px]">
          <H2>Needs you</H2>
          {o.needsYou.length > 0 && (
            <span className="text-[13px] text-[#5b6a52]">{o.needsYou.length} {o.needsYou.length === 1 ? 'thing' : 'things'} to do</span>
          )}
        </div>
        {o.needsYou.map((t) => (
          <div key={t.kind} className="grid grid-cols-[22px_minmax(0,1fr)_auto] gap-3 items-center py-[13px] border-t border-[#e2d7bc]">
            <span className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#8a5a45]" />
            <span className="min-w-0">
              <span className="block font-semibold">{t.title}</span>
              <span className="block text-[13px] text-[#5b6a52] mt-[2px]">{t.detail}</span>
            </span>
            <button onClick={() => to(t.link, t.event)} className="py-2 px-[14px] min-h-[40px] rounded-full border border-[var(--adm-ink,#33402f)] bg-transparent text-[13px] font-medium cursor-pointer whitespace-nowrap hover:bg-[var(--adm-ink,#33402f)] hover:text-[#f3ecd6]">
              {t.cta}
            </button>
          </div>
        ))}
        {o.needsYou.length === 0 && (
          <div className="py-4 border-t border-[#e2d7bc] font-display text-[22px] italic">All caught up. Everything else is running by itself.</div>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-[34px]">
        <section className="flex flex-col" aria-label="Latest replies">
          <div className="mb-2"><H2>Latest replies</H2></div>
          {o.latest.map((r) => (
            <button key={r.id} onClick={() => to(`guests?${all}g=${r.id}`, home)} className="flex flex-col gap-[2px] py-[11px] border-0 border-t border-[#e2d7bc] bg-transparent text-left cursor-pointer hover:bg-[#f1e9d6]">
              <span className="flex justify-between gap-[10px] w-full">
                <strong className="font-semibold">{r.name}</strong>
                <span className="text-[12px] text-[#5b6a52] whitespace-nowrap">{fmtWhen(r.at, tz)}</span>
              </span>
              <span className="text-[13px] text-[#5b6a52]">{r.summary}</span>
              {r.message && <span className="font-display italic text-[17px]">{r.message}</span>}
            </button>
          ))}
          {o.latest.length === 0 && <div className="py-[11px] border-t border-[#e2d7bc] text-[13px] text-[#5b6a52]">No replies yet.</div>}
        </section>
        <section className="flex flex-col" aria-label="Coming up">
          <div className="flex justify-between items-center mb-2">
            <H2>Coming up</H2>
            <button onClick={() => to('texts', home)} className="py-2 px-1 min-h-[40px] border-0 bg-transparent text-[var(--adm-ink,#33402f)] font-medium underline cursor-pointer">All texts</button>
          </div>
          {o.nextUp.map((u) => (
            <button key={u.campaignId} onClick={() => to('texts', home)} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 items-baseline py-[11px] border-0 border-t border-[#e2d7bc] bg-transparent text-left cursor-pointer hover:bg-[#f1e9d6]">
              <span className="font-display text-[20px] italic">{fmtDay(u.sendAt, tz)}</span>
              <span className="font-medium min-w-0">{u.name}</span>
            </button>
          ))}
          {o.nextUp.length === 0 && <div className="py-[11px] border-t border-[#e2d7bc] text-[13px] text-[#5b6a52]">No dated texts scheduled.</div>}
        </section>
      </div>

      {!o.focus && (
        <Dashboard>
          <Hub wid={wid} o={o} to={to} />
        </Dashboard>
      )}

      {!o.focus && (o.perEvent?.length ?? 0) > 1 && (
        <section aria-label="Events side by side" className="flex flex-col gap-3">
          <H2>Side by side</H2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
            {o.perEvent!.map((e, i) => (
              <div
                key={e.key}
                className={`flex flex-col gap-3 p-5 rounded-[16px] border ${i === 1 ? 'bg-[#eef2f8] border-[#c9d5e8]' : 'bg-[#fbf8f0] border-[#e2d7bc]'}`}
              >
                <div>
                  <Eyebrow>{fmtEvent(e.startsAt, tz)}</Eyebrow>
                  <h3 className="m-0 mt-1 font-display font-medium text-[26px]">{e.name}</h3>
                </div>
                <div className="flex h-[8px] rounded-[99px] overflow-hidden bg-[#e6dcc4]" aria-hidden="true">
                  <div style={{ width: pc(e.yes, e.invited), background: i === 1 ? '#2f3d5c' : '#5d6b47' }} />
                  <div style={{ width: pc(e.no, e.invited), background: '#b9a07a' }} />
                </div>
                <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
                  {(
                    [
                      ['Invited', `${e.invited} invitations`],
                      ['Coming', `${e.coming} ${e.coming === 1 ? 'guest' : 'guests'}`],
                      ['Declined', String(e.no)],
                      ['Still to reply', String(e.awaiting)],
                      ['Dietary needs', String(e.diet)],
                      ...(e.hasSeating ? [['Seated', `${e.seated} of ${e.coming}`]] : []),
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[12px] text-[#5b6a52]">{k}</dt>
                      <dd className="m-0 font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  onClick={() => to('overview', e.key)}
                  className="self-start py-2 px-[14px] min-h-[40px] rounded-full border border-[#33402f] bg-transparent text-[13px] font-medium cursor-pointer hover:bg-[#33402f] hover:text-[#f3ecd6]"
                >
                  Open {e.name}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!o.focus && <AddEventToggle />}
    </div>
  );
}

/**
 * Account → Overview: the things you do most, one tap each. Add a guest, answer messages, send a text,
 * share the invitation (the phone's share sheet, or copy the link).
 */
function Today({ o, to }: { o: NonNullable<ReturnType<typeof useAdmin>['overview']>; to: (link: string, event?: string) => void }) {
  const toast = useToast();
  const first = o.events[0]?.key;
  const unread = o.nav.messages ?? 0;
  const share = async () => {
    const url = `${window.location.origin}/w/${o.wedding.slug}/`;
    try {
      if (navigator.share) await navigator.share({ title: 'Our wedding', url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Invitation link copied');
      }
    } catch {
      /* closed the share sheet */
    }
  };
  const actions: { label: string; run: () => void; badge?: number }[] = [
    { label: '+ Add a guest', run: () => to('guests?add=1', first) },
    { label: unread ? 'Reply to messages' : 'Messages', run: () => to('messages', 'all'), badge: unread },
    { label: 'Send a text', run: () => to('texts', o.nav.smsLive ? first : 'all') },
    { label: 'Share the invitation', run: () => void share() },
  ];
  return (
    <section aria-label="Quick actions" className="flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 min-[760px]:mx-0 min-[760px]:px-0 min-[760px]:flex-wrap">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.run}
          className="flex-none flex items-center gap-2 py-[9px] px-4 min-h-[44px] rounded-full border border-[#d3c6a4] bg-[#fbf8f0] text-[14px] font-medium cursor-pointer whitespace-nowrap hover:bg-[#efe7d3]"
        >
          {a.label}
          {!!a.badge && <span className="min-w-[20px] h-[20px] px-1 rounded-full bg-[#a4553c] text-[#fbf8f2] text-[12px] leading-[20px] text-center">{a.badge}</span>}
        </button>
      ))}
    </section>
  );
}

/** The planning charts: open on a computer, one tap away on a phone (so the page isn't fifteen screens long). */
function Dashboard({ children }: { children: ReactNode }) {
  const wide = useMedia('(min-width: 760px)');
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? wide;
  return (
    <section aria-label="Planning dashboard" className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setOpen(!shown)}
        className="flex items-center justify-between gap-3 py-3 px-4 min-h-[48px] rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0] text-left cursor-pointer"
      >
        <span className="font-display text-[24px]">Planning dashboard</span>
        <span className="text-[13px] text-[#5b6a52]">{shown ? 'Hide' : 'Tasks, payments, budget'} <span aria-hidden>{shown ? '▴' : '▾'}</span></span>
      </button>
      {shown && children}
    </section>
  );
}

/** "+ Add an event" opens the form only when you want it. */
function AddEventToggle() {
  const [open, setOpen] = useState(false);
  if (open) return <Events addOnly />;
  return (
    <Pill kind="dashed" className="self-start" onClick={() => setOpen(true)}>
      + Add an event
    </Pill>
  );
}

/**
 * Account → Overview, for a couple starting out: the order to set things up, each step ticked off as
 * it's done, opening the right place. Gone once the essentials are done.
 */
function GettingStarted({ o, to }: { o: NonNullable<ReturnType<typeof useAdmin>['overview']>; to: (link: string, event?: string) => void }) {
  const first = o.events[0]?.key;
  const steps = [
    { done: !!(o.wedding.name1.trim() && o.wedding.name2.trim()), title: 'Your invitation', detail: 'Names, colours, photo and wording (in your first event).', link: 'pages', event: first },
    { done: o.events.length > 0, title: 'Your events', detail: 'Add each celebration below, with its date and place.', link: 'overview', event: 'all' },
    { done: o.nav.guests > 0, title: 'Your guests', detail: 'Import your list or add guests in an event.', link: 'guests?show=all', event: first },
    { done: o.nav.smsLive, title: 'Texting', detail: 'Add your texting number so invitations and reminders send.', link: 'texts', event: 'all' },
    { done: o.nav.smsLive && o.nav.guests > 0 && o.nav.autopilot > 0, title: 'Invitations and reminders', detail: 'Check the send date and messages in each event.', link: 'texts', event: first },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (!left) return null;
  return (
    <section aria-label="Getting started" className="flex flex-col gap-2 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <H2>Getting started</H2>
        <span className="text-[13px] text-[#5b6a52]">
          {steps.length - left} of {steps.length} done
        </span>
      </div>
      <ol className="m-0 p-0 list-none flex flex-col">
        {steps.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 items-center py-3 border-t border-[#ece3cc]">
            <span
              aria-label={s.done ? 'Done' : 'To do'}
              className={`w-[24px] h-[24px] rounded-full flex items-center justify-center text-[13px] font-semibold ${s.done ? 'bg-[var(--adm-accent,#5d6b47)] text-[#f3ecd6]' : 'border-[1.5px] border-[#c6b794] text-[#5b6a52]'}`}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <span className="min-w-0">
              <span className={`block font-semibold ${s.done ? 'opacity-60' : ''}`}>{s.title}</span>
              <span className="block text-[13px] text-[#5b6a52]">{s.detail}</span>
            </span>
            {!s.done && (
              <button type="button" onClick={() => to(s.link, s.event)} className="py-2 px-[14px] rounded-full border border-[#33402f] bg-transparent text-[13px] font-medium cursor-pointer whitespace-nowrap hover:bg-[#33402f] hover:text-[#f3ecd6]">
                Go
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

import { useNavigate } from 'react-router-dom';
import { fmtDay, fmtWhen } from '../lib/format';
import { AccountHome, NeedsYou, RehearseCard } from './AccountHome';
import { Card, Hub, Kpis } from './hub/Hub';
import { C, Donut } from './hub/charts';
import { useAdmin, useSectionOverview } from './Shell';
import { ErrorState, Eyebrow, H2, Loading, useToast } from './ui';


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
  const figures = [
    { label: 'Coming', value: ev ? ev.coming : o.yesInv, sub: ev ? 'guests coming' : 'invitations said yes', go: () => to(ev ? `guests?filter=attending:${ev.key}` : 'guests?show=all', ev?.key ?? home) },
    { label: 'Awaiting', value: o.awaiting, sub: 'invitations to reply', go: () => to(`guests?${all}filter=awaiting`, home), warn: false },
    { label: 'Declined', value: o.noInv, sub: 'invitations said no', go: () => to(`guests?${all}filter=declined`, home) },
    { label: 'Dietary', value: o.diet.people, sub: `${o.diet.serious} serious · ${o.diet.mealsSet} meals set`, go: () => to('dietary', o.focus ?? o.perEvent?.find((e) => e.catered !== false)?.key ?? home), warn: o.diet.serious > 0 && o.diet.mealsSet < o.diet.people },
  ];
  const isWedding = o.focus === o.events[0]?.key;

  return (
    <div className="flex flex-col gap-[30px]">
      <header className="flex flex-col gap-[10px]">
        {firstEvent && o.daysToGo !== null && <Eyebrow>{`${o.daysToGo} days to ${firstEvent.name.replace(/^the\s+/i, 'the ')}`}</Eyebrow>}
        <h1 className="m-0 font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08] [text-wrap:balance]">
          {o.replied} of {o.total} invitations answered
        </h1>
      </header>

      <Kpis label="Replies at a glance" items={figures} />

      {/* Quick actions belong to an event: its guests, its messages, its texts. */}
      <Today o={o} to={to} event={o.focus} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Replies" action={['Guest list', () => to(`guests?${all}`.replace(/[?&]$/, ''), home)]}>
          <Donut
            label="Invitations"
            centre={`${o.total ? Math.round((o.replied / o.total) * 100) : 0}%`}
            sub="answered"
            slices={[
              { label: 'Coming', value: o.yesInv, colour: C.accent },
              { label: 'Declined', value: o.noInv, colour: C.gold },
              { label: 'Awaiting', value: o.awaiting, colour: C.sand },
            ]}
          />
        </Card>

        <NeedsYou o={o} to={to} />

        <Card title="Latest replies" action={['Everyone', () => to(`guests?${all}`.replace(/[?&]$/, ''), home)]}>
          <div className="flex flex-col">
            {o.latest.map((r) => (
              <button key={r.id} onClick={() => to(`guests?${all}g=${r.id}`, home)} className="flex flex-col gap-[2px] py-[10px] border-0 border-t border-[#ece3cc] first:border-t-0 bg-transparent text-left cursor-pointer hover:bg-[#f3ecd6]">
                <span className="flex justify-between gap-[10px] w-full">
                  <strong className="font-semibold">{r.name}</strong>
                  <span className="text-[12px] text-[#5b6a52] whitespace-nowrap">{fmtWhen(r.at, tz)}</span>
                </span>
                <span className="text-[13px] text-[#5b6a52]">{r.summary}</span>
                {r.message && <span className="font-display italic text-[17px]">{r.message}</span>}
              </button>
            ))}
            {o.latest.length === 0 && <p className="m-0 text-[14px] text-[#5b6a52]">No replies yet. They show here as they come in.</p>}
          </div>
        </Card>

        <Card title="Coming up" action={['All texts', () => to('texts', home)]}>
          <div className="flex flex-col">
            {o.nextUp.map((u) => (
              <button key={u.campaignId} onClick={() => to('texts', home)} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 items-baseline py-[10px] border-0 border-t border-[#ece3cc] first:border-t-0 bg-transparent text-left cursor-pointer hover:bg-[#f3ecd6]">
                <span className="font-display text-[20px] italic">{fmtDay(u.sendAt, tz)}</span>
                <span className="font-medium min-w-0">{u.name}</span>
              </button>
            ))}
            {o.nextUp.length === 0 && <p className="m-0 text-[14px] text-[#5b6a52]">No dated texts scheduled.</p>}
          </div>
        </Card>
      </div>

      {/* The planning dashboard (tasks, payments, budget) is the wedding's: it sits in the wedding's overview. */}
      {isWedding && (
        <section aria-label="Planning dashboard" className="flex flex-col gap-4">
          <H2>Planning dashboard</H2>
          <Hub wid={wid} o={o} to={to} />
        </section>
      )}

      <RehearseCard to={to} />
    </div>
  );
}

/**
 * Account → Overview: the things you do most, one tap each. Add a guest, answer messages, send a text,
 * share the invitation (the phone's share sheet, or copy the link).
 */
function Today({ o, to, event }: { o: NonNullable<ReturnType<typeof useAdmin>['overview']>; to: (link: string, event?: string) => void; event: string }) {
  const toast = useToast();
  const unread = o.nav.messages ?? 0;
  const share = async () => {
    // A private wedding's page opens only with each guest's own link: the shared address would say "private".
    if (o.wedding.private) {
      toast('Your invitation is private, so each guest needs their own link: tap a guest in the Guest list to share theirs.');
      to('guests', event);
      return;
    }
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
    { label: '+ Add a guest', run: () => to('guests?add=1', event) },
    { label: unread ? 'Reply to messages' : 'Messages', run: () => to('messages', event), badge: unread },
    { label: 'Send a text', run: () => to('texts', o.nav.smsLive ? event : 'all') },
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

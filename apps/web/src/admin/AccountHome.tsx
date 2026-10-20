import { PLAN_INFO } from '@wp/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { accountApi, photosApi, type Members, type Overview } from '../lib/api';
import { fmtEvent } from '../lib/format';
import { Events } from './events/Events';
import { ALL_EVENTS, useAdmin } from './Shell';
import { usePlan } from './Upgrade';
import { H2, PageHeader, Pill } from './ui';

type To = (link: string, event?: string) => void;

/**
 * Account → Overview: the setup and settings home. What's left to set up (each step opening the right
 * place), your plan, who can sign in, backups, what needs you, and each event as a card that opens it.
 * Guest figures stay light here: each event's own overview has them in full.
 */
export function AccountHome({ o, to }: { o: Overview; to: To }) {
  const { wid } = useAdmin();
  const { plan, has } = usePlan();
  const [members, setMembers] = useState<Members | null>(null);
  const [photos, setPhotos] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    accountApi.members(wid).then((m) => live && setMembers(m), () => undefined);
    photosApi.list(wid).then((p) => live && setPhotos(p.enabled), () => live && setPhotos(null));
    return () => {
      live = false;
    };
  }, [wid]);
  const first = o.events[0]?.key;
  const settings = (view: string) => to(`settings${view ? `?view=${view}` : ''}`, ALL_EVENTS);
  const owners = members?.members.length ?? 0;
  const mainName = members?.members.find((m) => m.id === members.main)?.name;

  const steps: { done: boolean | null; title: string; detail: string; go: () => void }[] = [
    { done: !!(o.wedding.name1.trim() && o.wedding.name2.trim() && first), title: 'Your names and the date', detail: 'As your invitation shows them (in the first event’s Setup).', go: () => to('pages', first) },
    { done: o.events.length > 0, title: 'Your events', detail: 'Each celebration, with its date and place.', go: () => document.getElementById('your-events')?.scrollIntoView({ behavior: 'smooth' }) },
    { done: o.nav.guests > 0, title: 'Your guests', detail: 'Import your list, or add guests one by one.', go: () => to('guests', first) },
    { done: o.nav.smsLive, title: 'Texting', detail: 'Your SMS number, so invitations and reminders send.', go: () => settings('texting') },
    { done: photos, title: 'Where guests’ photos go', detail: 'Link Google Drive, Dropbox or OneDrive (free).', go: () => to('photos', first) },
    { done: members ? owners > 1 || members.invites.length > 0 : null, title: 'Add your partner or a helper', detail: 'So you can both run it, each with your own sign-in.', go: () => to('settings?view=people&invite=1', ALL_EVENTS) },
    { done: !!o.wedding.private, title: 'Keep it private', detail: 'Pages open only with each guest’s own link.', go: () => settings('privacy') },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-[30px]">
      <PageHeader
        eyebrow="Account"
        title="Your wedding admin"
        sub={`${o.daysToGo !== null ? `${o.daysToGo} days to go. ` : ''}Set things up here once; each event has its own section for its guests, texts and day.`}
      />

      <section aria-label="Setting up" className="flex flex-col gap-2 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
        <div className="flex justify-between items-baseline gap-3 flex-wrap">
          <H2>Setting up</H2>
          <span className="text-[13px] text-[#5b6a52]">
            {done} of {steps.length} done
          </span>
        </div>
        <div className="flex h-[8px] rounded-full overflow-hidden bg-[#e6dcc4]" aria-hidden>
          <span style={{ width: `${(done / steps.length) * 100}%`, background: 'var(--adm-accent,#5d6b47)' }} />
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
              <Pill size="sm" kind={s.done ? 'secondary' : 'outline'} onClick={s.go}>
                {s.done ? 'Change' : 'Set up'}
              </Pill>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Status label="Your plan" value={PLAN_INFO[plan].name} sub={plan === 'complete' ? 'Everything included' : 'See what upgrading adds'} go={() => settings('plan')} />
        <Status
          label="Who can sign in"
          value={members ? `${owners} ${owners === 1 ? 'person' : 'people'}` : '…'}
          sub={members ? (members.invites.length ? `${members.invites.length} invited` : mainName ? `${mainName} pays` : 'Add your partner') : ''}
          go={() => settings('people')}
        />
        <Status label="Backups" value={has('dailyBackups') ? 'Every night' : 'Download any time'} sub={has('dailyBackups') ? 'Kept for 30 days' : 'One file with everything'} go={() => settings('backup')} />
      </div>

      <NeedsYou o={o} to={to} />

      <section id="your-events" aria-label="Your events" className="flex flex-col gap-3">
        <H2>Your events</H2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
          {o.events.map((e) => {
            const p = o.perEvent?.find((x) => x.key === e.key);
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => to('overview', e.key)}
                className="flex flex-col gap-2 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] text-left cursor-pointer hover:bg-[#f3ecd6]"
              >
                <span className="text-[11px] font-semibold tracking-[.18em] uppercase text-[#5b6a52]">{fmtEvent(e.startsAt, o.wedding.timezone)}</span>
                <span className="font-display text-[26px] leading-tight">{e.name}</span>
                <span className="text-[14px] text-[#5b6a52]">
                  {e.coming} coming{p ? ` · ${p.awaiting} still to reply` : ''}
                </span>
                <span className="text-[13px] font-medium underline">Open {e.name}</span>
              </button>
            );
          })}
        </div>
        <AddEventToggle />
      </section>
    </div>
  );
}

function Status({ label, value, sub, go }: { label: string; value: string; sub: string; go: () => void }) {
  return (
    <button type="button" onClick={go} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] text-left cursor-pointer hover:bg-[#f3ecd6] min-w-0">
      <span className="text-[11px] font-semibold tracking-[.18em] uppercase text-[#5b6a52]">{label}</span>
      <span className="font-display text-[24px] leading-tight truncate">{value}</span>
      <span className="text-[13px] text-[#5b6a52] truncate">{sub}</span>
    </button>
  );
}

/** What needs doing, across every area, each opening the place to do it. */
export function NeedsYou({ o, to }: { o: Overview; to: To }) {
  return (
    <section className="flex flex-col gap-1" aria-label="Needs you">
      <div className="flex justify-between items-baseline gap-3 mb-[6px]">
        <H2>Needs you</H2>
        {o.needsYou.length > 0 && (
          <span className="text-[13px] text-[#5b6a52]">
            {o.needsYou.length} {o.needsYou.length === 1 ? 'thing' : 'things'} to do
          </span>
        )}
      </div>
      {o.needsYou.map((t) => (
        <div key={t.kind} className="grid grid-cols-[22px_minmax(0,1fr)_auto] gap-3 items-center py-[13px] border-t border-[#e2d7bc]">
          <span className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#8a5a45]" />
          <span className="min-w-0">
            <span className="block font-semibold">{t.title}</span>
            <span className="block text-[13px] text-[#5b6a52] mt-[2px]">{t.detail}</span>
          </span>
          <button
            onClick={() => to(t.link, t.event)}
            className="py-2 px-[14px] min-h-[40px] rounded-full border border-[var(--adm-ink,#33402f)] bg-transparent text-[13px] font-medium cursor-pointer whitespace-nowrap hover:bg-[var(--adm-ink,#33402f)] hover:text-[#f3ecd6]"
          >
            {t.cta}
          </button>
        </div>
      ))}
      {o.needsYou.length === 0 && <div className="py-4 border-t border-[#e2d7bc] font-display text-[22px] italic">All caught up. Everything else is running by itself.</div>}
    </section>
  );
}

/** "+ Add an event" opens the form only when you want it. */
export function AddEventToggle({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return <Events addOnly />;
  return (
    <>
      <Pill kind="dashed" className="self-start" onClick={() => setOpen(true)}>
        + Add an event
      </Pill>
      {children}
    </>
  );
}

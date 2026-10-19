import { useNavigate } from 'react-router-dom';
import { fmtDay, fmtWhen, shortLabel } from '../lib/format';
import { useAdmin } from './Shell';
import { Eyebrow, H2 } from './ui';

const pc = (n: number, total: number) => `${total ? ((n / total) * 100).toFixed(1) : 0}%`;
const dot = (bg: string, border?: string) => (
  <span className="w-[9px] h-[9px] rounded-full" style={{ background: bg, border: border ? `1px solid ${border}` : undefined }} />
);

/** design/RSVP Admin.dc.html → Overview. */
export function Overview() {
  const { wid, overview: o, error } = useAdmin();
  const go = useNavigate();
  const to = (link: string) => go(`/admin/${wid}/${link}`);
  if (error) return <p role="alert" className="text-[#8a5a45]">{error}</p>;
  if (!o) return <div aria-busy="true" className="min-h-[60vh]" />;
  const tz = o.wedding.timezone;
  // The event switcher: figures are about the event being looked at.
  const shown = o.focus ? o.events.filter((e) => e.key === o.focus) : o.events;
  const firstEvent = shown[0];

  const figures = [
    ...shown.map((e) => ({ label: shortLabel(e.name), val: e.coming, sub: 'guests coming', link: `guests?filter=attending:${e.key}` })),
    { label: 'Awaiting', val: o.awaiting, sub: 'invitations to reply', link: 'guests?filter=awaiting' },
    { label: 'Dietary', val: o.diet.people, sub: `${o.diet.serious} serious · ${o.diet.mealsSet} meals set`, link: 'dietary' },
  ];

  return (
    <div className="flex flex-col gap-[34px]">
      <header className="flex flex-col gap-[14px]">
        {firstEvent && o.daysToGo !== null && <Eyebrow>{o.daysToGo} days to {firstEvent.name.replace(/^the\s+/i, 'the ')}</Eyebrow>}
        <h1 className="m-0 font-display font-medium text-[clamp(32px,6vw,46px)] leading-[1.05] [text-wrap:balance]">
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
          <button key={f.label} onClick={() => to(f.link)} className="flex flex-col gap-[6px] py-[18px] pr-4 pl-0 border-0 bg-transparent text-left cursor-pointer hover:bg-[#f1e9d6]">
            <Eyebrow>{f.label}</Eyebrow>
            <span className="font-display text-[52px] leading-[.95]">{f.val}</span>
            <span className="text-[13px] text-[#5b6a52]">{f.sub}</span>
          </button>
        ))}
      </div>

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
            <button onClick={() => to(t.link)} className="py-2 px-[14px] rounded-full border border-[#33402f] bg-transparent text-[13px] font-medium cursor-pointer whitespace-nowrap hover:bg-[#33402f] hover:text-[#f3ecd6]">
              {t.cta}
            </button>
          </div>
        ))}
        {o.needsYou.length === 0 && (
          <div className="py-4 border-t border-[#e2d7bc] font-display text-[22px] italic">All caught up. Everything else is running by itself.</div>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-[34px]">
        <section className="flex flex-col" aria-label="Coming up">
          <div className="flex justify-between items-baseline mb-2">
            <H2>Coming up</H2>
            <button onClick={() => to('texts')} className="p-0 border-0 bg-transparent text-[#5d6b47] font-medium underline cursor-pointer">All texts</button>
          </div>
          {o.nextUp.map((u) => (
            <button key={u.campaignId} onClick={() => to('texts')} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 items-baseline py-[11px] border-0 border-t border-[#e2d7bc] bg-transparent text-left cursor-pointer hover:bg-[#f1e9d6]">
              <span className="font-display text-[20px] italic">{fmtDay(u.sendAt, tz)}</span>
              <span className="font-medium min-w-0">{u.name}</span>
            </button>
          ))}
          {o.nextUp.length === 0 && <div className="py-[11px] border-t border-[#e2d7bc] text-[13px] text-[#5b6a52]">No dated texts scheduled.</div>}
        </section>
        <section className="flex flex-col" aria-label="Latest replies">
          <div className="mb-2"><H2>Latest replies</H2></div>
          {o.latest.map((r) => (
            <button key={r.id} onClick={() => to(`guests?g=${r.id}`)} className="flex flex-col gap-[2px] py-[11px] border-0 border-t border-[#e2d7bc] bg-transparent text-left cursor-pointer hover:bg-[#f1e9d6]">
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
      </div>
    </div>
  );
}

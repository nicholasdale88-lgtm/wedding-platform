import { PLAN_INFO } from '@wp/shared';
import { Link } from 'react-router-dom';
import { fmtEvent } from '../../lib/format';
import { ALL_EVENTS, useAdmin } from '../Shell';
import { usePlan } from '../Upgrade';

/**
 * Settings, at the top: what's set now, in one look. The names, each event's date and venue, the plan
 * and the guest list, each with a link to where it's changed.
 */
export function AtAGlance() {
  const { overview: o, path } = useAdmin();
  const { plan } = usePlan();
  if (!o) return null;
  const w = o.wedding;
  const row = (label: string, value: string, to: string, change = 'Change') => (
    <div key={label + value} className="flex justify-between items-baseline gap-3 py-2 border-b border-[var(--adm-line,#ece3cc)] last:border-b-0">
      <span className="flex flex-col min-w-0 sm:flex-row sm:gap-3 sm:items-baseline">
        <span className="text-[12px] font-semibold tracking-[.12em] uppercase text-[var(--adm-muted,#5b6a52)] sm:w-[120px] shrink-0">{label}</span>
        <span className="text-[15px] min-w-0">{value}</span>
      </span>
      <Link to={to} className="text-[13px] underline shrink-0 text-[var(--adm-text,#33402f)]">
        {change}
      </Link>
    </div>
  );
  return (
    <section aria-label="Your details now" className="flex flex-col p-4 rounded-[14px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]">
      <h2 className="m-0 mb-1 font-display font-medium text-[22px]">Your details now</h2>
      {row('Names', `${w.name1} & ${w.name2}`, `${path('pages', o.events[0]?.key ?? ALL_EVENTS)}`)}
      {o.events.map((e) =>
        row(
          e.name,
          [e.startsAt ? fmtEvent(e.startsAt, w.timezone) : 'No date yet', e.venue || 'No venue yet'].join(' · '),
          `${path('pages', e.key)}?page=details`,
        ),
      )}
      {row('Guests', `${o.total} ${o.total === 1 ? 'invitation' : 'invitations'} · ${o.replied} replied · ${o.awaiting} waiting`, path('guests', o.events[0]?.key ?? ALL_EVENTS), 'See them')}
      {row('Plan', `${PLAN_INFO[plan].name}${w.private ? ' · private' : ''}`, `${path('settings', ALL_EVENTS)}?view=plan`)}
      {o.daysToGo !== null && o.daysToGo >= 0 && row('Countdown', o.daysToGo === 0 ? 'It’s today!' : `${o.daysToGo} ${o.daysToGo === 1 ? 'day' : 'days'} to go`, path('overview', ALL_EVENTS), 'Overview')}
    </section>
  );
}

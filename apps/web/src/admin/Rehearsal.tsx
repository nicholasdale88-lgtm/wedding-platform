import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rehearsalApi, type RehearsalData, type RehearsalFix, type RehearsalLevel, type RehearsalMessage, type RehearsalPersona } from '../lib/api';
import { DevicePreview } from './pages/DevicePreview';
import { ALL_EVENTS, useAdmin } from './Shell';
import { ErrorState, H2, Loading, PageHeader, Pill } from './ui';

/**
 * Account → Rehearsal: the whole wedding run as a dry run on your real guests, words and settings, from
 * the invitations going out to the morning after. Move along the timeline to see, at each moment, the
 * texts and emails that would go (in their real words), each kind of guest's page as it would look then,
 * what the wedding party and the coordinator see, and what would break or embarrass on the day.
 * Nothing is sent or saved: the guest pages open as your preview.
 */

const PERSONAS: [RehearsalPersona, string][] = [
  ['yes', 'Said yes'],
  ['no', 'Said no'],
  ['waiting', 'Not replied'],
];
const DOT: Record<RehearsalLevel, string> = { green: '#5d6b47', amber: '#c9a46a', red: '#a4553c' };
const WORD: Record<RehearsalLevel, string> = { green: 'Ready', amber: 'Check', red: 'Fix' };
const HOW: Record<string, string> = { text: 'by text', email: 'by email', phone: 'from your phone', 'text+email': 'by text and email', post: 'by post only', none: 'with no way to reach them' };

const when = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(/\s?[ap]m/i, (x) => x.trim().toLowerCase());

export function Rehearsal() {
  const { wid, overview, path } = useAdmin();
  const [data, setData] = useState<RehearsalData | null>(null);
  const [error, setError] = useState('');
  const [at, setAt] = useState(0);
  const [who, setWho] = useState<RehearsalPersona>('yes');
  const load = useCallback(() => {
    setError('');
    rehearsalApi.get(wid).then(
      (d) => {
        setData(d);
        setAt(Math.max(0, d.steps.findIndex((s) => s.key === d.current)));
      },
      (e: Error) => setError(e.message),
    );
  }, [wid]);
  useEffect(() => {
    document.title = 'Rehearsal';
    load();
  }, [load]);

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loading label="Setting up the rehearsal…" />;
  const first = overview?.events[0]?.key;
  const fixTo = (f: RehearsalFix) => `${path(f.tab, f.event && first ? first : ALL_EVENTS)}${f.query ? `?${f.query}` : ''}`;
  const step = data.steps[at] ?? data.steps[0];
  if (!step) return <Loading />;
  const tz = data.timezone;
  const reds = data.checks.filter((c) => c.level === 'red').length;
  const guest = step.guests.find((g) => g.persona === who) ?? step.guests[0];
  const stepChecks = data.checks.filter((c) => step.checks.includes(c.key));

  return (
    <div className="flex flex-col gap-7 max-w-[1100px]">
      <PageHeader
        eyebrow="Account"
        title="Rehearse your wedding day"
        sub="A dry run with your real guests, words and settings, from the invitations to the morning after. Nothing is sent and nothing is saved."
        actions={
          <Pill kind="outline" onClick={load}>
            Run it again
          </Pill>
        }
      />

      <section aria-label="Rehearsal checklist" className="flex flex-col gap-3 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
        <div className="flex justify-between items-baseline gap-3 flex-wrap">
          <H2>Rehearsal checklist</H2>
          <span className="text-[13px] text-[#5b6a52]">{data.checks.length ? `${data.checks.length} to look at${reds ? `, ${reds} would go wrong on the day` : ''}` : 'Everything checks out'}</span>
        </div>
        <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-2">
          {data.areas.map((a) => (
            <li key={a.area} className="flex items-center gap-2 py-2 px-3 rounded-[12px] bg-white border border-[#ece3cc]">
              <span aria-hidden className="flex-none w-[12px] h-[12px] rounded-full" style={{ background: DOT[a.level] }} />
              <span className="flex-1 min-w-0 text-[14px] font-medium">{a.label}</span>
              <span className="text-[12px] text-[#5b6a52]">{a.level === 'green' ? WORD.green : `${WORD[a.level]}: ${a.count}`}</span>
            </li>
          ))}
        </ul>
        {data.checks.length > 0 && (
          <ol className="m-0 p-0 list-none flex flex-col">
            {data.checks.map((c) => (
              <li key={c.key} className="grid grid-cols-[14px_minmax(0,1fr)_auto] gap-3 items-center py-3 border-t border-[#ece3cc]">
                <span aria-label={c.level === 'red' ? 'Would go wrong' : 'Worth checking'} className="w-[12px] h-[12px] rounded-full" style={{ background: DOT[c.level] }} />
                <span className="min-w-0">
                  <span className="block font-semibold">{c.title}</span>
                  <span className="block text-[13px] text-[#5b6a52]">{c.detail}</span>
                </span>
                <Link to={fixTo(c.fix)} className="py-2 px-[14px] min-h-[40px] inline-flex items-center rounded-full border border-[#33402f] text-[13px] font-medium no-underline !text-[#33402f] whitespace-nowrap hover:bg-[#33402f] hover:!text-[#f3ecd6]">
                  Fix it
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Timeline" className="flex flex-col gap-3">
        <H2>Jump to a moment</H2>
        <input
          type="range"
          min={0}
          max={data.steps.length - 1}
          step={1}
          value={at}
          onChange={(e) => setAt(Number(e.target.value))}
          aria-label="Moment in the rehearsal"
          aria-valuetext={`${step.label}, ${when(step.at, tz)}`}
          className="w-full accent-[#33402f] min-h-[44px]"
        />
        <div role="tablist" aria-label="Moments" className="flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 min-[760px]:mx-0 min-[760px]:px-0 min-[760px]:flex-wrap">
          {data.steps.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={i === at}
              onClick={() => setAt(i)}
              className={`flex-none py-2 px-3 min-h-[44px] rounded-full border text-[13px] cursor-pointer whitespace-nowrap ${i === at ? 'border-[#33402f] bg-[#33402f] text-[#fbf8f2]' : 'border-[#d3c6a4] bg-[#fbf8f0] text-[#33402f]'}`}
            >
              {s.label}
              {s.checks.length > 0 && <span aria-label={`${s.checks.length} to check`} className="ml-[6px] inline-block w-[8px] h-[8px] rounded-full align-middle" style={{ background: s.checks.some((k) => data.checks.find((c) => c.key === k)?.level === 'red') ? DOT.red : DOT.amber }} />}
            </button>
          ))}
        </div>
      </section>

      <section aria-label={step.label} className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold tracking-[.18em] uppercase text-[#5b6a52]">{step.past ? 'Already happened' : 'Coming up'}</span>
          <h2 className="m-0 font-display font-medium text-[32px] leading-tight">{step.label}</h2>
          <span className="text-[15px] text-[#5b6a52]">{when(step.at, tz)}</span>
        </header>

        {stepChecks.length > 0 && (
          <div role="note" className="flex flex-col gap-2 p-4 rounded-[14px] border border-[#e6c9b8] bg-[#fbf1ec]">
            <strong className="text-[15px]">What would go wrong here</strong>
            {stepChecks.map((c) => (
              <span key={c.key} className="text-[14px]">
                {c.title}.{' '}
                <Link to={fixTo(c.fix)} className="!text-[#33402f]">
                  Fix it
                </Link>
              </span>
            ))}
          </div>
        )}

        <div role="tablist" aria-label="Which guest" className="flex gap-2 flex-wrap">
          {PERSONAS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={who === k} onClick={() => setWho(k)} className={`py-2 px-4 min-h-[44px] rounded-full border text-[14px] cursor-pointer ${who === k ? 'border-[#33402f] bg-[#33402f] text-[#fbf8f2]' : 'border-[#c6b794] bg-white text-[#33402f]'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 min-[900px]:grid-cols-[minmax(0,1fr)_380px] gap-6">
          <div className="flex flex-col gap-6 min-w-0">
            <section aria-label="Messages that go" className="flex flex-col gap-3">
              <H2>What goes out</H2>
              {step.messages.length === 0 && <p className="m-0 text-[14px] text-[#5b6a52]">Nothing is sent at this moment.</p>}
              {step.messages.map((m, i) => (
                <MessageCard key={`${m.campaignId}:${i}`} m={m} tz={tz} who={who} />
              ))}
            </section>

            {guest && (
              <section aria-label="What they see" className="flex flex-col gap-2">
                <H2>What {guest.name} sees</H2>
                {guest.standIn && <p className="m-0 text-[13px] text-[#7a4a37]">Nobody has replied this way yet, so {guest.name} stands in, as if they had.</p>}
                <ul className="m-0 pl-5 flex flex-col gap-1 text-[15px] leading-[1.5]">
                  {guest.sees.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Wedding party and coordinator" className="flex flex-col gap-2">
              <H2>The wedding party and coordinator</H2>
              <ul className="m-0 pl-5 flex flex-col gap-1 text-[15px] leading-[1.5]">
                {[...step.party, ...step.coordinator].map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>

            {data.manual.length > 0 && (
              <p className="m-0 text-[13px] text-[#5b6a52]">Sent only if you send them yourself: {data.manual.map((m) => m.name).join(', ')}.</p>
            )}
          </div>

          {guest && (
            <aside aria-label="Their page" className="flex flex-col gap-2 min-w-0">
              <span className="text-[13px] text-[#5b6a52] text-center">
                {guest.page.kind === 'guide' ? 'Their night-before page' : guest.page.kind === 'photos' ? 'Their photo page' : 'Their invitation'}, as it looks then (a preview: replies aren’t saved)
              </span>
              <DevicePreview device="phone" src={guest.page.path} url={`${window.location.host}${guest.page.path.split('?')[0]}`} title={`${guest.name}: their page`} frameKey={guest.page.path} />
            </aside>
          )}
        </div>
      </section>
    </div>
  );
}

function MessageCard({ m, tz, who }: { m: RehearsalMessage; tz: string; who: RehearsalPersona }) {
  const g = m.gets.find((x) => x.persona === who);
  const reach = Object.entries(m.reach)
    .filter(([, n]) => n > 0)
    .map(([how, n]) => `${n} ${HOW[how] ?? how}`)
    .join(', ');
  return (
    <article className="flex flex-col gap-2 p-4 rounded-[14px] border border-[#e2d7bc] bg-white">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <strong className="text-[16px]">{m.name}</strong>
        <span className="text-[13px] text-[#5b6a52]">{m.sendAt ? when(m.sendAt, tz) : 'As each guest is invited or replies'}</span>
      </div>
      <span className="text-[13px] text-[#5b6a52]">
        {!m.enabled ? 'Switched off: it won’t go. ' : m.sent ? 'Already sent. ' : ''}
        {reach ? `Would reach ${reach}.` : 'Nobody to send it to as things stand.'}
        {m.quiet ? ' Due in your quiet hours, so it waits until the morning.' : ''}
      </span>
      {g?.text && <span className="self-start max-w-[420px] py-2 px-3 rounded-[16px] rounded-bl-[4px] bg-[#f3ecd6] text-[14px] whitespace-pre-wrap break-words">{g.text}</span>}
      {g && <span className="text-[13px] text-[#33402f]">{g.why}</span>}
    </article>
  );
}

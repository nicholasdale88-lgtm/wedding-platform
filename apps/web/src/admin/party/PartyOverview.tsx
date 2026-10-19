import { dateIn, progressOf, type DayChecklist, type PartySide } from '@wp/shared';
import { useEffect, useState } from 'react';
import { plannerApi, type PartyData } from '../../lib/api';
import { Ring } from '../checklists/PhasedChecklist';
import { useAdmin } from '../Shell';
import { H2, Pill } from '../ui';
import { Members, SideNames, type PartyView, type SideName } from './Party';

const card = 'flex flex-col gap-3 p-5 rounded-[18px] border border-[#e2d7bc] bg-[#fbf8f0]';
const EMPTY: PartySide = { tasks: [], glam: { finish: '', hairArtists: 1, makeupArtists: 1, people: [] }, people: {}, party: { title: '', date: '', place: '', organiser: '', budget: 0, notes: '' }, attire: { what: '', colour: '', where: '', each: 0, orderBy: '', notes: '' } };
const longDate = (d: string) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Wedding party → Overview: each side as a card (people, progress, what's next), helpers, the day, your lists. */
export function PartyOverview({ d, setD, sideName, go }: { d: PartyData; setD: (d: PartyData) => void; sideName: SideName; go: (v: PartyView) => void }) {
  const { wid, overview } = useAdmin();
  const [sides, setSides] = useState<Record<'p1' | 'p2', PartySide>>({ p1: EMPTY, p2: EMPTY });
  const [lists, setLists] = useState<DayChecklist | null>(null);
  useEffect(() => {
    plannerApi
      .doc<PartySide>(wid, 'party-p1')
      .then((r) => setSides((s) => ({ ...s, p1: r.data })))
      .catch(() => undefined);
    plannerApi
      .doc<PartySide>(wid, 'party-p2')
      .then((r) => setSides((s) => ({ ...s, p2: r.data })))
      .catch(() => undefined);
    if (d.event)
      plannerApi
        .docFor<DayChecklist>(wid, 'day-checklist', d.event)
        .then((r) => setLists(r.data))
        .catch(() => setLists(null));
  }, [wid, d.event]);
  const today = dateIn(overview?.wedding.timezone);
  const items = d.runsheet?.data.items ?? [];
  const helpers = d.members.filter((m) => !m.side);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {(['p1', 'p2'] as const).map((side) => {
          const doc = sides[side];
          const people = d.members.filter((m) => m.side === side);
          const tp = progressOf(doc.tasks);
          const next = doc.tasks.filter((t) => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0];
          const ready = people.filter((m) => doc.people[m.personId]?.collected).length;
          const title = doc.party.title || (side === 'p1' ? 'The hens' : 'The bucks');
          return (
            <section key={side} aria-label={`${sideName(side)}’s side`} className={card}>
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="font-display text-[28px] leading-tight">{sideName(side)}’s side</div>
                  <div className="text-[12px] tracking-[.12em] uppercase text-[#5b6a52]">
                    {d.names[side]} · {people.length} {people.length === 1 ? 'person' : 'people'}
                  </div>
                </div>
                <Ring done={tp.done} total={tp.total} size={60} label={`${tp.done} of ${tp.total} to-dos done`} />
              </div>
              <div className="flex gap-1 flex-wrap">
                {people.map((m) => (
                  <span key={m.personId} className="py-1 px-3 rounded-full bg-white border border-[#e2d7bc] text-[13px]">
                    {m.name.split(' ')[0]} <span className="text-[#7a7466]">· {m.role}</span>
                  </span>
                ))}
                {!people.length && <span className="text-[13px] text-[#7a7466]">No one yet.</span>}
              </div>
              <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[14px]">
                <dt className="text-[#5b6a52]">Next</dt>
                <dd className={`m-0 ${next?.due && next.due < today ? 'text-[#7a4a37]' : ''}`}>{next ? `${next.text}${next.due ? ` · ${longDate(next.due)}` : ''}` : tp.total ? 'All done ✓' : '—'}</dd>
                <dt className="text-[#5b6a52]">Outfits</dt>
                <dd className="m-0">{people.length ? `${ready} of ${people.length} ready${doc.attire.what ? ` · ${doc.attire.what}` : ''}` : '—'}</dd>
                <dt className="text-[#5b6a52]">{title}</dt>
                <dd className="m-0">{doc.party.date ? `${longDate(doc.party.date)}${doc.party.place ? ` · ${doc.party.place}` : ''}` : 'Not planned yet'}</dd>
              </dl>
              <Pill kind="primary" className="self-start" onClick={() => go(side)}>
                Open {sideName(side).toLowerCase()}’s side
              </Pill>
            </section>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="The run sheet" className={card}>
          <div className="flex justify-between items-start gap-3">
            <div>
              <H2>The run sheet</H2>
              <div className="text-[13px] text-[#5b6a52]">{items.length ? `${items.length} moments, each for everyone, one side or one role.` : 'Not started.'}</div>
            </div>
          </div>
          <ol className="list-none m-0 p-0 flex flex-col">
            {items.slice(0, 4).map((it, i) => (
              <li key={i} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 py-1 text-[14px]">
                <span className="font-semibold tabular-nums text-[#5b6a52]">{it.time}</span>
                <span className="truncate">{it.title}</span>
              </li>
            ))}
          </ol>
          <Pill kind="outline" className="self-start" onClick={() => go('runsheet')}>
            {items.length ? 'Open the run sheet' : 'Build the run sheet'}
          </Pill>
        </section>
        <section aria-label="Your checklists" className={card}>
          <H2>Your checklists</H2>
          <div className="flex gap-5 flex-wrap">
            {(['p1', 'p2', 'both'] as const).map((w) => {
              const p = progressOf(lists?.[w] ?? []);
              return (
                <span key={w} className="flex items-center gap-2">
                  <Ring done={p.done} total={p.total} size={52} />
                  <span className="text-[14px]">{w === 'both' ? 'Together' : d.names[w]}</span>
                </span>
              );
            })}
          </div>
          <Pill kind="outline" className="self-start" onClick={() => go('couple')}>
            Open your checklists
          </Pill>
        </section>
      </div>

      <Members d={d} sideName={sideName} only="" onChange={(members) => setD({ ...d, members })} />
      {!helpers.length && <p className="-mt-4 m-0 text-[13px] text-[#7a7466]">The MC, ushers, readers and the celebrant go here.</p>}

      <section aria-label="Settings" className="flex flex-col gap-2 pt-2 border-t border-[#e2d7bc]">
        <SideNames d={d} onSaved={(setup) => setD({ ...d, setup })} />
      </section>
    </div>
  );
}

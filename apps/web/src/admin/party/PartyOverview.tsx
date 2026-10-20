import { dateIn, progressOf, type DayChecklist, type PartySide } from '@wp/shared';
import { useEffect, useState } from 'react';
import { ApiError, plannerApi, type PartyData, type PartyMember } from '../../lib/api';
import { Ring } from '../checklists/PhasedChecklist';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';
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

      <Jobs d={d} sides={sides} setSides={setSides} today={today} />

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
        <section aria-label="Our to-dos on the day" className={card}>
          <H2>Our to-dos on the day</H2>
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

/** The jobs people usually take on (tap one to fill it in). */
const USUAL_JOBS = ['Hold the rings', 'Look after the vendor envelopes', 'Hold the bouquet at the ceremony', 'Look after the guest book', 'Give a speech', 'Collect the suits', 'Bring the emergency kit', 'Help with the dress and veil'];
type Sides = Record<'p1' | 'p2', PartySide>;

/**
 * Give someone a job: one place to hand the wedding party their jobs (the rings, the envelopes, a speech).
 * Each lands on that person's own page as their to-do, and shows here with who has it.
 */
function Jobs({ d, sides, setSides, today }: { d: PartyData; sides: Sides; setSides: (f: (s: Sides) => Sides) => void; today: string }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const people = d.members.filter((m) => m.side === 'p1' || m.side === 'p2');
  const [text, setText] = useState('');
  const [who, setWho] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  /** Changes one side's document from what's saved now (someone may have just ticked something). */
  const change = async (side: 'p1' | 'p2', fn: (doc: PartySide) => PartySide) => {
    const kind = side === 'p1' ? 'party-p1' : 'party-p2';
    for (let i = 0; i < 3; i++) {
      const cur = await plannerApi.doc<PartySide>(wid, kind);
      try {
        const r = await plannerApi.saveDoc<PartySide>(wid, kind, '', fn(cur.data), cur.version);
        setSides((x) => ({ ...x, [side]: r.data }));
        return;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409) || i === 2) throw e;
      }
    }
  };
  const give = async () => {
    const m = people.find((x) => x.personId === who);
    if (!m || !text.trim()) return toast('Write the job and choose who it is for.');
    setBusy(true);
    try {
      await change(m.side as 'p1' | 'p2', (doc) => ({ ...doc, tasks: [...doc.tasks, { id: crypto.randomUUID().slice(0, 12), text: text.trim().slice(0, 200), person: m.personId, due, done: false }] }));
      toast(`${m.name.split(' ')[0]} has it: it is on their page`);
      setText('');
      setDue('');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const jobs = (['p1', 'p2'] as const).flatMap((side) =>
    sides[side].tasks
      .map((t) => ({ t, side, m: people.find((x) => x.personId === t.person) }))
      .filter((x): x is { t: PartySide['tasks'][number]; side: 'p1' | 'p2'; m: PartyMember } => !!x.m),
  );
  const tick = (side: 'p1' | 'p2', id: string, on: boolean) =>
    void change(side, (doc) => ({ ...doc, tasks: doc.tasks.map((t) => (t.id === id ? { ...t, done: on } : t)) })).catch((e: Error) => toast(e.message));
  const remove = (side: 'p1' | 'p2', id: string) => void change(side, (doc) => ({ ...doc, tasks: doc.tasks.filter((t) => t.id !== id) })).catch((e: Error) => toast(e.message));
  return (
    <section aria-label="Jobs for the wedding party" className={card}>
      <div>
        <H2>Jobs for the wedding party</H2>
        <div className="text-[13px] text-[#5b6a52]">Give bridesmaids and groomsmen their jobs. Each one shows on that person&rsquo;s own page, and they tick it off.</div>
      </div>
      {people.length ? (
        <>
          <div className="flex gap-[6px] flex-wrap" aria-label="Usual jobs">
            {USUAL_JOBS.map((j) => (
              <button key={j} type="button" onClick={() => setText(j)} className="py-[4px] px-3 rounded-full border border-[#d3c6a4] bg-white text-[12px] cursor-pointer text-[#33402f]">
                {j}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2 flex-wrap items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void give();
            }}
          >
            <label className="flex flex-col gap-1 text-[13px] flex-1 min-w-[200px]">
              The job
              <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="e.g. Hold the rings" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] min-w-[170px]">
              Who
              <select value={who} onChange={(e) => setWho(e.target.value)} className={inputCls}>
                <option value="">Choose…</option>
                {people.map((m) => (
                  <option key={m.personId} value={m.personId}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              By (optional)
              <input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} className={inputCls} />
            </label>
            <Pill kind="primary" type="submit" disabled={busy}>
              {busy ? 'Giving…' : 'Give the job'}
            </Pill>
          </form>
          {jobs.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#ece3cd] rounded-[12px] border border-[#e2d7bc] bg-white">
              {jobs.map(({ t, side, m }) => (
                <li key={t.id} className="flex items-center gap-3 py-2 px-3 text-[14px]">
                  <input type="checkbox" checked={t.done} onChange={(e) => tick(side, t.id, e.target.checked)} aria-label={`${t.text} done`} className="w-[16px] h-[16px] accent-[#5d6b47]" />
                  <span className={`flex-1 min-w-0 ${t.done ? 'line-through text-[#7a7466]' : ''}`}>
                    {t.text}
                    <span className="text-[#5b6a52]">
                      {' '}
                      · {m.name.split(' ')[0]} ({m.role}){t.due ? ` · by ${new Date(`${t.due}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                    </span>
                  </span>
                  <button type="button" aria-label={`Remove ${t.text}`} onClick={() => remove(side, t.id)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px]">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="m-0 text-[14px] text-[#7a7466]">Add bridesmaids and groomsmen to the wedding party first (on each side&rsquo;s page), then give them jobs here.</p>
      )}
    </section>
  );
}

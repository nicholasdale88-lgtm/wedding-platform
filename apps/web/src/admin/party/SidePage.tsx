import { dateIn, progressOf, SIDE_TEMPLATE, sideOf, type PartySide, type SidePerson, type SideTask } from '@wp/shared';
import { useState } from 'react';
import type { PartyData } from '../../lib/api';
import { Ring } from '../checklists/PhasedChecklist';
import { useUnsavedChanges } from '../leave';
import { MoneyInput } from '../planner/MoneyInput';
import { useLiveDoc } from '../planner/useDocSave';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';
import { Members, type PartyView, type SideName } from './Party';

const newId = () => crypto.randomUUID().slice(0, 10);
const BLANK_PERSON: SidePerson = { outfit: '', size: '', fitting: '', collected: false, paid: false, gift: '', given: false, notes: '', packed: [], pack: [] };
const card = 'flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]';
const shortDate = (d: string) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '');

/**
 * Wedding party → one side (the bride's or the groom's): its people with what each wears, their size,
 * fittings and thank-you gift; the side's look; the hens or bucks; the side's to-dos; and its part of the day.
 */
export function SidePage({ side, d, setD, sideName, go }: { side: 'p1' | 'p2'; d: PartyData; setD: (d: PartyData) => void; sideName: SideName; go: (v: PartyView) => void }) {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const live = useLiveDoc<PartySide>(wid, side === 'p1' ? 'party-p1' : 'party-p2', '', toast);
  useUnsavedChanges(live.pending);
  const [open, setOpen] = useState<string | null>(null);
  const [task, setTask] = useState({ text: '', person: '', due: '' });
  if (live.error) return <p role="alert" className="text-[#7a4a37]">{live.error}</p>;
  if (!live.doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading {sideName(side).toLowerCase()}’s side…</div>;
  const doc = live.doc.data;
  const set = (p: Partial<PartySide>, now = false) => live.set({ ...doc, ...p }, now);
  const people = d.members.filter((m) => m.side === side);
  const personOf = (id: string) => ({ ...BLANK_PERSON, ...doc.people[id] });
  const setPerson = (id: string, p: Partial<SidePerson>, now = false) => set({ people: { ...doc.people, [id]: { ...personOf(id), ...p } } }, now);
  const today = dateIn(overview?.wedding.timezone);
  const tasks = [...doc.tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999'));
  const tp = progressOf(doc.tasks);
  const partyTitle = doc.party.title || (side === 'p1' ? 'The hens' : 'The bucks');
  const ready = people.filter((m) => personOf(m.personId).collected).length;
  const thanked = people.filter((m) => personOf(m.personId).given).length;
  // The side's part of the day: lines for everyone, this side, or a role on it.
  const sheet = d.runsheet?.data.items ?? [];
  const roles = new Set([...people.map((m) => m.role), ...d.roles.filter((r) => r.side === side).map((r) => r.role)].filter((r) => sideOf(r) === side).map((r) => r.toLowerCase()));
  const day = sheet.filter((it) => !it.who.length || it.who.some((w) => w === 'party' || w === side || roles.has(w.toLowerCase())));
  const setTask_ = (i: string, p: Partial<SideTask>, now = true) => set({ tasks: doc.tasks.map((t) => (t.id === i ? { ...t, ...p } : t)) }, now);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${card} !flex-row items-center`}>
          <Ring done={tp.done} total={tp.total} size={58} />
          <span>
            <span className="block font-display text-[20px] leading-tight">To-dos</span>
            <span className="block text-[12px] text-[#5b6a52]">{tp.total ? `${tp.total - tp.done} to go` : 'None yet'}</span>
          </span>
        </div>
        <div className={`${card} !flex-row items-center`}>
          <Ring done={ready} total={people.length} size={58} />
          <span>
            <span className="block font-display text-[20px] leading-tight">Outfits ready</span>
            <span className="block text-[12px] text-[#5b6a52]">
              {ready} of {people.length} collected
            </span>
          </span>
        </div>
        <div className={`${card} !flex-row items-center`}>
          <Ring done={thanked} total={people.length} size={58} />
          <span>
            <span className="block font-display text-[20px] leading-tight">Thank-you gifts</span>
            <span className="block text-[12px] text-[#5b6a52]">
              {thanked} of {people.length} given
            </span>
          </span>
        </div>
      </div>

      <Members d={d} sideName={sideName} only={side} onChange={(members) => setD({ ...d, members })} />

      {people.length > 0 && (
        <section aria-label="Each person" className="flex flex-col gap-2">
          <H2>Each person</H2>
          <div className="text-[13px] text-[#5b6a52] -mt-1">What they wear, their size and fitting, and their thank-you gift. Tap a name to fill it in.</div>
          {people.map((m) => {
            const p = personOf(m.personId);
            const isOpen = open === m.personId;
            const chips = [p.size && `Size ${p.size}`, p.fitting && `Fitting ${shortDate(p.fitting)}`, p.collected && 'Collected ✓', p.paid && 'Paid ✓', p.given && 'Gift given ✓'].filter(Boolean) as string[];
            return (
              <div key={m.personId} className="rounded-[14px] border border-[#e2d7bc] bg-white">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.personId)} className="w-full flex justify-between items-center gap-3 py-3 px-4 bg-transparent border-0 cursor-pointer text-left">
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{m.name}</span>
                    <span className="block text-[12px] text-[#5b6a52]">{m.role}</span>
                  </span>
                  <span className="flex gap-1 flex-wrap justify-end">
                    {chips.length ? chips.map((c) => <span key={c} className="py-[2px] px-2 rounded-full bg-[#efe7d3] text-[12px]">{c}</span>) : <span className="text-[12px] text-[#7a7466]">Add details</span>}
                  </span>
                </button>
                {isOpen && (
                  <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                      Wearing
                      <input value={p.outfit} maxLength={120} placeholder={doc.attire.what || (side === 'p1' ? 'e.g. Sage satin dress' : 'e.g. Navy suit')} onChange={(e) => setPerson(m.personId, { outfit: e.target.value })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                      Size or measurements
                      <input value={p.size} maxLength={40} onChange={(e) => setPerson(m.personId, { size: e.target.value })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                      Fitting
                      <input type="date" value={p.fitting} onChange={(e) => setPerson(m.personId, { fitting: e.target.value }, true)} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
                      Thank-you gift
                      <input value={p.gift} maxLength={120} onChange={(e) => setPerson(m.personId, { gift: e.target.value })} className={inputCls} />
                    </label>
                    <div className="flex gap-4 flex-wrap sm:col-span-2 text-[14px]">
                      {(
                        [
                          ['collected', 'Outfit collected'],
                          ['paid', 'Paid for'],
                          ['given', 'Gift given'],
                        ] as const
                      ).map(([k, text]) => (
                        <label key={k} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={p[k]} onChange={(e) => setPerson(m.personId, { [k]: e.target.checked } as Partial<SidePerson>, true)} className="w-[18px] h-[18px] accent-[#5d6b47]" />
                          {text}
                        </label>
                      ))}
                    </div>
                    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] sm:col-span-2">
                      Notes
                      <textarea rows={2} value={p.notes} maxLength={500} onChange={(e) => setPerson(m.personId, { notes: e.target.value })} className={`${inputCls} resize-y`} />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="What they wear" className={card}>
          <H2>What they wear</H2>
          <div className="grid gap-2 sm:grid-cols-2">
            <input aria-label="The look" placeholder={side === 'p1' ? 'The look, e.g. Floor-length satin' : 'The look, e.g. Three-piece suit'} value={doc.attire.what} maxLength={120} onChange={(e) => set({ attire: { ...doc.attire, what: e.target.value } })} className={inputCls} />
            <input aria-label="Colour" placeholder="Colour" value={doc.attire.colour} maxLength={60} onChange={(e) => set({ attire: { ...doc.attire, colour: e.target.value } })} className={inputCls} />
            <input aria-label="From" placeholder="Shop or hire company" value={doc.attire.where} maxLength={160} onChange={(e) => set({ attire: { ...doc.attire, where: e.target.value } })} className={inputCls} />
            <label className="flex items-center gap-2 text-[13px] text-[#5b6a52]">
              About $
              <MoneyInput aria-label="Cost each" placeholder="each" value={doc.attire.each} onValue={(n) => set({ attire: { ...doc.attire, each: n } })} className={`${inputCls} w-full`} />
              each
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] sm:col-span-2">
              Order by
              <input type="date" value={doc.attire.orderBy} onChange={(e) => set({ attire: { ...doc.attire, orderBy: e.target.value } }, true)} className={inputCls} />
            </label>
          </div>
          {doc.attire.orderBy && doc.attire.orderBy < today && ready < people.length && <p className="m-0 text-[13px] text-[#7a4a37]">The order-by date has passed and not everyone has their outfit.</p>}
        </section>

        <section aria-label={partyTitle} className={card}>
          <H2>{partyTitle}</H2>
          <div className="grid gap-2 sm:grid-cols-2">
            <input aria-label="Called" placeholder={side === 'p1' ? 'The hens' : 'The bucks'} value={doc.party.title} maxLength={60} onChange={(e) => set({ party: { ...doc.party, title: e.target.value } })} className={inputCls} />
            <input type="date" aria-label="Date" value={doc.party.date} onChange={(e) => set({ party: { ...doc.party, date: e.target.value } }, true)} className={inputCls} />
            <input aria-label="Where" placeholder="Where" value={doc.party.place} maxLength={200} onChange={(e) => set({ party: { ...doc.party, place: e.target.value } })} className={inputCls} />
            <input aria-label="Organised by" placeholder={side === 'p1' ? 'Organised by (the maid of honour?)' : 'Organised by (the best man?)'} value={doc.party.organiser} maxLength={80} onChange={(e) => set({ party: { ...doc.party, organiser: e.target.value } })} className={inputCls} />
            <label className="flex items-center gap-2 text-[13px] text-[#5b6a52] sm:col-span-2">
              Budget $
              <MoneyInput aria-label="Budget" value={doc.party.budget} onValue={(n) => set({ party: { ...doc.party, budget: n } })} className={`${inputCls} w-[120px]`} />
              {doc.party.budget > 0 && people.length > 0 && <span>≈ ${Math.round(doc.party.budget / people.length)} a head for the {people.length} of them</span>}
            </label>
          </div>
          <textarea aria-label="Plan" rows={3} placeholder="The plan: what you'll do, who's coming, what to bring" value={doc.party.notes} maxLength={1000} onChange={(e) => set({ party: { ...doc.party, notes: e.target.value } })} className={`${inputCls} resize-y`} />
        </section>
      </div>

      <section aria-label="To-dos" className="flex flex-col gap-3">
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <div>
            <H2>To-dos</H2>
            <div className="text-[13px] text-[#5b6a52]">For the whole side or one person, with a date if it has one.</div>
          </div>
          {!doc.tasks.length && (
            <Pill kind="dashed" onClick={() => set({ tasks: SIDE_TEMPLATE[side].map((t) => ({ ...t, id: newId() })) }, true)}>
              Start with the usual {SIDE_TEMPLATE[side].length}
            </Pill>
          )}
        </div>
        <ul className="list-none m-0 p-0 flex flex-col rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
          {tasks.map((t) => {
            const late = !t.done && t.due && t.due < today;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2 px-4 border-t border-[#ece3cd] first:border-t-0 flex-wrap">
                <input type="checkbox" checked={t.done} onChange={() => setTask_(t.id, { done: !t.done })} aria-label={t.text} className="w-5 h-5 accent-[#5d6b47] flex-none cursor-pointer" />
                <input aria-label="To-do" value={t.text} maxLength={200} onChange={(e) => setTask_(t.id, { text: e.target.value }, false)} className={`flex-1 min-w-[160px] bg-transparent border-0 p-0 text-[15px] ${t.done ? 'line-through text-[#7a7466]' : 'text-[#33402f]'}`} />
                <select aria-label="Who" value={t.person} onChange={(e) => setTask_(t.id, { person: e.target.value })} className={`${inputCls} !py-[5px] !text-[13px] max-w-[160px]`}>
                  <option value="">Everyone</option>
                  {people.map((m) => (
                    <option key={m.personId} value={m.personId}>
                      {m.name.split(' ')[0]}
                    </option>
                  ))}
                </select>
                <input type="date" aria-label="Due" value={t.due} onChange={(e) => setTask_(t.id, { due: e.target.value })} className={`${inputCls} !py-[5px] !text-[13px] ${late ? '!border-[#a5533c] text-[#7a4a37]' : ''}`} />
                <button type="button" aria-label={`Remove ${t.text}`} onClick={() => set({ tasks: doc.tasks.filter((x) => x.id !== t.id) }, true)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px]">
                  ×
                </button>
              </li>
            );
          })}
          {!tasks.length && <li className="py-3 px-4 text-[14px] text-[#7a7466]">No to-dos yet.</li>}
        </ul>
        <form
          className="flex gap-2 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (!task.text.trim()) return;
            set({ tasks: [...doc.tasks, { id: newId(), text: task.text.trim(), person: task.person, due: task.due, done: false }] }, true);
            setTask({ text: '', person: task.person, due: '' });
          }}
        >
          <input aria-label="New to-do" placeholder="Add a to-do" value={task.text} maxLength={200} onChange={(e) => setTask({ ...task, text: e.target.value })} className={`${inputCls} flex-1 min-w-[180px] !py-2`} />
          <select aria-label="For" value={task.person} onChange={(e) => setTask({ ...task, person: e.target.value })} className={`${inputCls} !py-2`}>
            <option value="">Everyone</option>
            {people.map((m) => (
              <option key={m.personId} value={m.personId}>
                {m.name.split(' ')[0]}
              </option>
            ))}
          </select>
          <input type="date" aria-label="Due date" value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} className={`${inputCls} !py-2`} />
          <Pill type="submit" kind="outline">
            Add
          </Pill>
        </form>
      </section>

      <section aria-label="Their day" className={card}>
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <div>
            <H2>Their day</H2>
            <div className="text-[13px] text-[#5b6a52]">What {sideName(side).toLowerCase()}’s side sees on their own page, from the run sheet.</div>
          </div>
          <Pill kind="outline" onClick={() => go('runsheet')}>
            Edit the run sheet
          </Pill>
        </div>
        {day.length ? (
          <ol className="list-none m-0 p-0 flex flex-col">
            {day.map((it, i) => (
              <li key={i} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-2 border-t border-[#ece3cd] first:border-t-0">
                <span className="text-[14px] font-semibold tabular-nums text-[#5b6a52]">{it.time}</span>
                <span>
                  <span className="block font-medium">{it.title}</span>
                  {it.place && <span className="block text-[13px] italic text-[#5b6a52]">{it.place}</span>}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-[14px] text-[#7a7466]">Nothing on the run sheet for this side yet.</p>
        )}
      </section>
      <p className="m-0 text-[12px] text-[#7a7466]">{live.pending ? 'Saving…' : 'Saved as you go.'}</p>
    </div>
  );
}

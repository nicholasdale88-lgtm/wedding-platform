import { dietCategories, isSerious, suggestMenu, type Menu, type Menus } from '@wp/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type EventInfo, type Guest, type Person } from '../../lib/api';
import { fileName } from '../../lib/csv';
import { fmtWeekday, shortLabel } from '../../lib/format';
import { downloadDressed } from '../exportLook';
import { useAdmin, useSectionName } from '../Shell';
import { useUnsavedChanges } from '../leave';
import { useLiveDoc } from '../planner/useDocSave';
import { Eyebrow, inputCls, Pill, useAutoRefresh, useToast } from '../ui';
import { MenusPanel } from './MenusPanel';

/**
 * Admin → Dietary (design: isDiet). For the caterer: everyone with a dietary need per event, serious
 * ones flagged, what the kitchen serves each of them course by course (shown on their place card),
 * exports, and the messages guests left.
 */

const coming = (g: Guest, e: EventInfo) => g.invited.includes(e.key) && g.rsvp[e.key]?.attending === true;

export function Dietary() {
  const { wid, overview, event: chosen, path } = useAdmin();
  const section = useSectionName();
  const navigate = useNavigate();
  const [data, setData] = useState<{ events: EventInfo[]; guests: Guest[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.guests(wid));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  useAutoRefresh(load);

  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const slug = overview?.wedding.slug ?? 'wedding';
  const view = useMemo(() => {
    if (!data) return null;
    // The sidebar's event: only people coming to it, and their messages about it.
    const focus = data.events.find((e) => e.key === chosen);
    const people = focus
      ? data.guests.filter((g) => coming(g, focus)).flatMap((g) => g.people.slice(0, Math.max(1, g.rsvp[focus.key]?.count ?? g.people.length)).map((p) => ({ g, p })))
      : data.guests.flatMap((g) => g.people.map((p) => ({ g, p })));
    const withDiet = people.filter(({ p }) => p.diet.trim());
    const counts = new Map<string, number>();
    for (const { p } of withDiet) for (const c of dietCategories(p.diet)) counts.set(c, (counts.get(c) ?? 0) + 1);
    const notes = data.guests.flatMap((g) => {
      const m = (focus ? [g.rsvp[focus.key]?.message ?? ''] : Object.values(g.rsvp).map((r) => r.message)).map((x) => x.trim()).find(Boolean);
      return m ? [{ g, m }] : [];
    });
    return { withDiet, counts, notes, focus };
  }, [data, chosen]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!data || !view) return <div aria-busy="true" className="text-[#5b6a52]">Loading dietary needs…</div>;

  const open = (g: Guest) => navigate(path(`guests?g=${g.id}`));
  const shown = view.focus ? [view.focus] : data.events;
  const catered = shown.filter((e) => e.catered);
  const mealEvent = catered.find((e) => e.hasSeating) ?? catered[0];

  const exportAll = () =>
    void downloadDressed(wid, overview, fileName(slug, 'dietary', 'xlsx'), 'Dietary list', [{ name: 'Dietary', rows: [
      ['Name', 'Dietary', 'Serious', 'Table', ...shown.map((e) => `Coming to ${shortLabel(e.name)}`)],
      ...view.withDiet.map(({ g, p }) => [p.name, p.diet, isSerious(p.diet) ? 'Yes' : '', p.table ?? '', ...shown.map((e) => (coming(g, e) ? 'Yes' : ''))]),
    ] }], shown.map((e) => e.key));
  const exportEvent = (e: EventInfo) =>
    void downloadDressed(wid, overview, fileName(slug, `${e.key}-caterer`, 'xlsx'), `For the caterer`, [{ name: shortLabel(e.name), rows: [
      ['Name', 'Table', 'Dietary', 'Serious', 'Entrée', 'Main', 'Dessert'],
      ...data.guests
        .filter((g) => coming(g, e))
        .flatMap((g) => g.people.slice(0, Math.max(1, g.rsvp[e.key]?.count ?? g.people.length)))
        .map((p) => [p.name, p.table ?? '', p.diet, isSerious(p.diet) ? 'Yes' : '', p.meal.entree, p.meal.main, p.meal.dessert]),
    ] }], [e.key]);

  return (
    <div className="flex flex-col gap-7">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <Eyebrow>{section} · Dietary</Eyebrow>
          <h1 className="m-0 mt-[6px] font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">For the caterer</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Pill onClick={exportAll}>Dietary list</Pill>
          {catered.map((e) => (
            <Pill key={e.key} onClick={() => exportEvent(e)}>
              Export for {shortLabel(e.name).toLowerCase() === 'wedding' ? 'the wedding venue' : `${shortLabel(e.name)} caterer`}
            </Pill>
          ))}
        </div>
      </header>

      {mealEvent && <Meals event={mealEvent} guests={data.guests} onSaved={load} />}

      {view.counts.size > 0 && (
        <div className="flex gap-2 flex-wrap">
          {[...view.counts.entries()].map(([label, n]) => (
            <span key={label} className="py-[6px] px-3 rounded-full bg-[#efe7d3] text-[14px]">
              {label} <strong className="font-semibold">{n}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {catered.map((e) => {
          const rows = data.guests.filter((g) => coming(g, e)).flatMap((g) => g.people.filter((p) => p.diet.trim()).map((p) => ({ g, p })));
          return (
            <section key={e.key} className="flex flex-col">
              <Eyebrow>{fmtWeekday(e.startsAt, tz)}</Eyebrow>
              <h2 className="m-0 mt-1 mb-2 font-display font-medium text-[26px]">{shortLabel(e.name)}</h2>
              {rows.map(({ g, p }) => (
                <button key={p.id} type="button" onClick={() => open(g)} className="flex flex-col gap-1 py-3 border-0 border-t border-solid border-[#e2d7bc] bg-transparent text-left cursor-pointer text-[#33402f] hover:bg-[#f3ecd6]">
                  <span className="flex justify-between gap-3">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[13px] text-[#7a7466]">{p.table ? `Table ${p.table}` : ''}</span>
                  </span>
                  <span className="flex gap-2 items-center text-[14px]">
                    <span>{p.diet}</span>
                    {isSerious(p.diet) && <SeriousTag />}
                  </span>
                </button>
              ))}
              {!rows.length && <div className="py-3 border-t border-[#e2d7bc] text-[14px] text-[#5b6a52]">No dietary requirements from guests coming so far.</div>}
            </section>
          );
        })}
      </div>

      <section className="flex flex-col">
        <h2 className="m-0 font-display font-medium text-[26px]">Messages from guests</h2>
        <div className="mb-2 text-[14px] text-[#5b6a52]">Access needs and questions often turn up here.</div>
        {view.notes.map(({ g, m }) => (
          <button key={g.id} type="button" onClick={() => open(g)} className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 py-3 border-0 border-t border-solid border-[#e2d7bc] bg-transparent text-left cursor-pointer text-[#33402f] hover:bg-[#f3ecd6]">
            <span className="font-medium">{g.people[0]?.name}</span>
            <span className="italic text-[15px]">“{m}”</span>
          </button>
        ))}
        {!view.notes.length && <div className="py-3 border-t border-[#e2d7bc] text-[14px] text-[#5b6a52]">No messages yet.</div>}
      </section>
    </div>
  );
}

const SeriousTag = () => <span className="py-[2px] px-2 rounded-full bg-[#f1e1d6] text-[#7a4a37] text-[11px] font-semibold uppercase tracking-[.08em]">Serious</span>;

/** What the kitchen serves each person with a dietary need, course by course. Saves as you leave each box. */
function Meals({ event, guests, onSaved }: { event: EventInfo; guests: Guest[]; onSaved: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const live = useLiveDoc<Menus>(wid, 'menus', event.key, toast);
  useUnsavedChanges(live.pending);
  const [giving, setGiving] = useState(false);
  const menus = live.doc?.data;
  // Everyone invited who hasn't declined: meals get planned before every reply is in.
  const people = guests.filter((g) => g.invited.includes(event.key) && g.rsvp[event.key]?.attending !== false).flatMap((g) => g.people);
  const withDiet = people.filter((p) => p.diet.trim());
  const set = people.length - withDiet.length;
  const unmatched = menus ? withDiet.filter((p) => !p.meal.entree && !p.meal.main && !p.meal.dessert && suggestMenu(p.diet, menus.special)) : [];
  /** Everyone with a need and no meals yet gets the special menu that suits what they wrote. */
  const giveSuggested = async () => {
    if (!menus) return;
    setGiving(true);
    let n = 0;
    try {
      for (const p of unmatched) {
        const m = suggestMenu(p.diet, menus.special)!;
        await api.setMeal(wid, p.id, { entree: m.entree, main: m.main, dessert: m.dessert });
        n++;
      }
      toast(`${n} ${n === 1 ? 'guest has' : 'guests have'} their menu`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setGiving(false);
      await onSaved();
    }
  };
  return (
    <>
    {menus && <MenusPanel menus={menus} set={live.set} />}
    <section className="flex flex-col gap-3 p-5 rounded-[14px] bg-[#efe7d3]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h2 className="m-0 font-display font-medium text-[26px]">Meals for {shortLabel(event.name).toLowerCase() === 'wedding' ? 'the wedding' : shortLabel(event.name)}</h2>
        <span className="text-[13px] text-[#5b6a52]">
          {withDiet.filter((p) => p.meal.entree || p.meal.main || p.meal.dessert).length} of {withDiet.length} set
        </span>
      </div>
      <p className="m-0 text-[14px] text-[#5b6a52]">
        Give each person a special menu, or write what the kitchen serves them course by course. A blank course means the set menu dish. It shows on their night-before place card and in the caterer export.
      </p>
      {unmatched.length > 0 && (
        <div className="flex justify-between items-center gap-3 flex-wrap py-2 px-4 rounded-[12px] bg-[#fbf8f0] text-[14px]">
          <span>
            {unmatched.length} {unmatched.length === 1 ? 'guest has' : 'guests have'} a special menu that suits them.
          </span>
          <Pill kind="primary" disabled={giving} onClick={() => void giveSuggested()}>
            {giving ? 'Giving…' : 'Give them their menus'}
          </Pill>
        </div>
      )}
      {withDiet.map((p) => (
        <MealRow key={`${p.id}:${p.meal.entree}|${p.meal.main}|${p.meal.dessert}`} wid={wid} p={p} onSaved={onSaved} menus={menus} />
      ))}
      <div className="flex justify-between gap-3 pt-3 border-t border-[#e2d7bc] text-[14px]">
        <span>
          <strong className="font-semibold">{set} guests</strong> · no dietary requirements
        </span>
        <span>Set menu</span>
      </div>
      {!withDiet.length && <div className="text-[14px] text-[#5b6a52]">No dietary requirements, so everyone is on the set menu. Nothing to do here.</div>}
    </section>
    </>
  );
}

const same = (a: { entree: string; main: string; dessert: string }, b: { entree: string; main: string; dessert: string }) => a.entree === b.entree && a.main === b.main && a.dessert === b.dessert;

function MealRow({ wid, p, onSaved, menus }: { wid: string; p: Person; onSaved: () => Promise<void>; menus?: Menus }) {
  const toast = useToast();
  const [m, setM] = useState(p.meal);
  const saved = useRef(p.meal);
  const save = async () => {
    if (m.entree === saved.current.entree && m.main === saved.current.main && m.dessert === saved.current.dessert) return;
    try {
      await api.setMeal(wid, p.id, m);
      saved.current = m;
      toast(`Saved ${p.name.split(' ')[0]}'s meals`);
      void onSaved();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const special = menus?.special ?? [];
  const chosen = special.find((x) => (x.entree || x.main || x.dessert) && same(x, m));
  const suggested = suggestMenu(p.diet, special);
  /** Picking a menu fills in its courses and saves straight away. */
  const pick = async (menu: Menu | null) => {
    const next = menu ? { entree: menu.entree, main: menu.main, dessert: menu.dessert } : { entree: '', main: '', dessert: '' };
    setM(next);
    try {
      await api.setMeal(wid, p.id, next);
      saved.current = next;
      toast(menu ? `${p.name.split(' ')[0]}: ${menu.name}` : `${p.name.split(' ')[0]}: set menu`);
      void onSaved();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const field = (k: keyof Person['meal'], label: string, ph: string) => (
    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
      {label}
      <input value={m[k]} placeholder={ph} onChange={(e) => setM({ ...m, [k]: e.target.value })} onBlur={() => void save()} aria-label={`${label} for ${p.name}`} className={`${inputCls} !py-2 !text-[14px]`} />
    </label>
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-3 pt-3 border-t border-[#e2d7bc]">
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          {p.name} <span className="text-[13px] font-normal text-[#7a7466]">{p.table ? `· Table ${p.table}` : ''}</span>
        </span>
        <span className="flex gap-2 items-center text-[14px]">
          {p.diet} {isSerious(p.diet) && <SeriousTag />}
        </span>
        {special.length > 0 && (
          <select
            aria-label={`Menu for ${p.name}`}
            value={chosen?.id ?? (m.entree || m.main || m.dessert ? 'custom' : 'set')}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'set') void pick(null);
              else if (v !== 'custom') void pick(special.find((x) => x.id === v) ?? null);
            }}
            className={`${inputCls} !py-[6px] !text-[13px] mt-1`}
          >
            <option value="set">Set menu</option>
            {special.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {suggested?.id === x.id ? ' (suits them)' : ''}
              </option>
            ))}
            <option value="custom">Their own (written below)</option>
          </select>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {field('entree', 'Entrée', 'e.g. Tomato, no burrata')}
        {field('main', 'Main', 'e.g. Mushroom risotto')}
        {field('dessert', 'Dessert', 'e.g. Sorbet and berries')}
      </div>
    </div>
  );
}

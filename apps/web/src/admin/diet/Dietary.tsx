import { dietCategories, isSerious, mealWarning, menuFit, NO_MEAL, servedMeal, suggestMenu, type MealChoice, type Menu, type Menus } from '@wp/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, plannerApi, type EventInfo, type Guest, type Person } from '../../lib/api';
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
  // Each catered event's menus, for the caterer export (the Meals panel keeps its own, live).
  const [menusFor, setMenusFor] = useState<Record<string, Menus | undefined>>({});
  useEffect(() => {
    for (const e of data?.events.filter((x) => x.catered) ?? [])
      plannerApi.docFor<Menus>(wid, 'menus', e.key).then((r) => setMenusFor((m) => ({ ...m, [e.key]: r.data })), () => undefined);
  }, [wid, data?.events.length]); // eslint-disable-line
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
  /** The caterer's list, with the menus as they are now (fetched afresh: an edit made a moment ago counts). */
  const exportEvent = async (e: EventInfo) => {
    const menus = await plannerApi.docFor<Menus>(wid, 'menus', e.key).then((r) => r.data, () => menusFor[e.key]);
    return downloadDressed(wid, overview, fileName(slug, `${e.key}-caterer`, 'xlsx'), `For the caterer`, [{ name: shortLabel(e.name), rows: [
      ['Name', 'Table', 'Dietary', 'Serious', 'Menu', 'Entrée', 'Main', 'Dessert', 'Check'],
      ...data.guests
        .filter((g) => coming(g, e))
        .flatMap((g) => g.people.slice(0, Math.max(1, g.rsvp[e.key]?.count ?? g.people.length)))
        .map((p) => {
          const c = p.meals?.[e.key];
          const m = servedMeal(c, menus);
          return [p.name, p.table ?? '', p.diet, isSerious(p.diet) ? 'Yes' : '', m.menu, m.entree, m.main, m.dessert, p.diet.trim() ? mealWarning(p.diet, c, menus) : ''];
        }),
    ] }], [e.key]);
  };

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
            <Pill key={e.key} onClick={() => void exportEvent(e)}>
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
          <button key={g.id} type="button" onClick={() => open(g)} className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-1 sm:gap-3 py-3 border-0 border-t border-solid border-[#e2d7bc] bg-transparent text-left cursor-pointer text-[#33402f] hover:bg-[#f3ecd6]">
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

/** Their meal at this event (nothing chosen yet: the set menu). */
const choiceOf = (p: Person, eventKey: string): MealChoice => p.meals?.[eventKey] ?? NO_MEAL;
const isChosen = (c: MealChoice) => !!(c.menu || c.entree || c.main || c.dessert);

/**
 * What the kitchen serves each person with a dietary need at this event. Give them a special menu (edits to
 * the menu reach them), or change a course just for them. Anything to check is flagged: a need their meal
 * isn't marked safe for, or needs no single menu covers.
 */
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
  const special = menus?.special ?? [];
  const rows = withDiet.map((p) => {
    const choice = choiceOf(p, event.key);
    return { p, choice, warning: mealWarning(p.diet, choice, menus), suggested: suggestMenu(p.diet, special), needs: menuFit(p.diet, undefined).needs };
  });
  const toGive = rows.filter((r) => !isChosen(r.choice) && r.suggested);
  const ownPlate = rows.filter((r) => !isChosen(r.choice) && !r.suggested && r.needs.length > 0);
  const toCheck = rows.filter((r) => r.warning);
  const done = rows.filter((r) => isChosen(r.choice) && !r.warning).length;
  /** Everyone with a need and nothing chosen gets the special menu that covers all they wrote. */
  const giveSuggested = async () => {
    setGiving(true);
    let n = 0;
    try {
      for (const r of toGive) {
        await api.setMeal(wid, r.p.id, { event: event.key, menu: r.suggested!.id, entree: '', main: '', dessert: '' });
        n++;
      }
      toast(`${n} ${n === 1 ? 'guest has' : 'guests have'} their menu`);
    } catch (e) {
      toast(`${n} given; then: ${(e as Error).message}`);
    } finally {
      setGiving(false);
      await onSaved();
    }
  };
  const where = shortLabel(event.name).toLowerCase() === 'wedding' ? 'the wedding' : shortLabel(event.name);
  return (
    <>
      {menus && <MenusPanel menus={menus} set={live.set} />}
      <section aria-label={`Meals for ${where}`} className="flex flex-col gap-3 p-5 rounded-[14px] bg-[#efe7d3]">
        <div className="flex justify-between items-baseline gap-3 flex-wrap">
          <h2 className="m-0 font-display font-medium text-[26px]">Meals for {where}</h2>
          <span className="text-[13px] text-[#5b6a52]">
            {done} of {rows.length} sorted
          </span>
        </div>
        <p className="m-0 text-[14px] text-[#5b6a52]">
          Give each person with a dietary need a menu that suits them, or change a course just for them. It shows on their night-before place card and in the
          caterer export. Everyone else has the set menu.
        </p>
        {toGive.length > 0 && (
          <div className="flex justify-between items-center gap-3 flex-wrap py-2 px-4 rounded-[12px] bg-[#fbf8f0] text-[14px]">
            <span>
              {toGive.length} {toGive.length === 1 ? 'guest has a menu' : 'guests have menus'} that suit{toGive.length === 1 ? 's' : ''} everything they wrote.
            </span>
            <Pill kind="primary" disabled={giving} onClick={() => void giveSuggested()}>
              {giving ? 'Giving…' : 'Give them their menus'}
            </Pill>
          </div>
        )}
        {(toCheck.length > 0 || ownPlate.length > 0) && (
          <div role="status" className="flex flex-col gap-1 py-2 px-4 rounded-[12px] bg-[#f1e1d6] text-[14px] text-[#7a4a37]">
            {toCheck.length > 0 && <span>{toCheck.length} to check with the caterer: their meal isn’t marked safe for something they need.</span>}
            {ownPlate.length > 0 && <span>{ownPlate.length} need their own plate: no menu covers everything they wrote. Add a menu, or write their courses.</span>}
          </div>
        )}
        {rows.map(({ p, choice, warning, suggested, needs }) => (
          <MealRow
            key={`${p.id}:${event.key}`}
            wid={wid}
            eventKey={event.key}
            p={p}
            choice={choice}
            menus={menus}
            warning={warning}
            suggested={suggested}
            ownPlate={!isChosen(choice) && !suggested && needs.length > 0}
            onSaved={onSaved}
          />
        ))}
        <div className="flex justify-between gap-3 pt-3 border-t border-[#e2d7bc] text-[14px]">
          <span>
            <strong className="font-semibold">{people.length - withDiet.length} {people.length - withDiet.length === 1 ? 'guest' : 'guests'}</strong> · no dietary requirements
          </span>
          <span>Set menu</span>
        </div>
        {!withDiet.length && <div className="text-[14px] text-[#5b6a52]">No dietary requirements, so everyone is on the set menu. Nothing to do here.</div>}
      </section>
    </>
  );
}

function MealRow({
  wid,
  eventKey,
  p,
  choice,
  menus,
  warning,
  suggested,
  ownPlate,
  onSaved,
}: {
  wid: string;
  eventKey: string;
  p: Person;
  choice: MealChoice;
  menus?: Menus;
  warning: string;
  suggested?: Menu;
  ownPlate: boolean;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [c, setC] = useState(choice);
  const saved = useRef(choice);
  // A change made elsewhere (another device, Give them their menus) shows here; our own saves already do.
  const incoming = `${choice.menu}|${choice.entree}|${choice.main}|${choice.dessert}`;
  useEffect(() => {
    const s = saved.current;
    if (incoming === `${s.menu}|${s.entree}|${s.main}|${s.dessert}`) return;
    saved.current = choice;
    setC(choice);
  }, [incoming]); // eslint-disable-line
  const special = menus?.special ?? [];
  const served = servedMeal(c, menus);
  const first = p.name.split(' ')[0];
  const save = async (next: MealChoice, msg: string) => {
    if (next.menu === saved.current.menu && next.entree === saved.current.entree && next.main === saved.current.main && next.dessert === saved.current.dessert) return;
    try {
      await api.setMeal(wid, p.id, { event: eventKey, ...next });
      saved.current = next;
      toast(msg);
      void onSaved();
    } catch (e) {
      toast((e as Error).message);
      setC(saved.current);
    }
  };
  /** Picking a menu saves straight away (courses changed for them are kept). */
  const pick = (menu: string) => {
    const next = { ...c, menu };
    setC(next);
    void save(next, `${first}: ${special.find((x) => x.id === menu)?.name ?? 'set menu'}`);
  };
  const menuCourse = (k: 'entree' | 'main' | 'dessert') => servedMeal({ ...c, [k]: '' }, menus)[k];
  const field = (k: 'entree' | 'main' | 'dessert', label: string) => (
    <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
      {label}
      <input
        value={c[k]}
        placeholder={menuCourse(k) || 'As the set menu'}
        onChange={(e) => setC({ ...c, [k]: e.target.value })}
        onBlur={() => void save(c, `Saved ${first}'s meal`)}
        aria-label={`${label} for ${p.name}`}
        className={`${inputCls} !py-2 !text-[14px]`}
      />
    </label>
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-3 pt-3 border-t border-[#e2d7bc]">
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          {p.name} <span className="text-[13px] font-normal text-[#7a7466]">{p.table ? `· Table ${p.table}` : ''}</span>
        </span>
        <span className="flex gap-2 items-center flex-wrap text-[14px]">
          {p.diet} {isSerious(p.diet) && <SeriousTag />}
        </span>
        <select aria-label={`Menu for ${p.name}`} value={special.some((x) => x.id === c.menu) ? c.menu : ''} onChange={(e) => pick(e.target.value)} className={`${inputCls} !py-[6px] !text-[13px] mt-1`}>
          <option value="">Set menu</option>
          {special.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {suggested?.id === x.id ? ' (suits them)' : ''}
            </option>
          ))}
        </select>
        {warning && (
          <span role="alert" className="text-[13px] font-semibold text-[#a4553c]">
            ⚠ {warning}
          </span>
        )}
        {!warning && ownPlate && <span className="text-[13px] font-semibold text-[#a4553c]">No menu covers all of this: write their courses, or add a menu.</span>}
      </div>
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {field('entree', 'Entrée')}
          {field('main', 'Main')}
          {field('dessert', 'Dessert')}
        </div>
        <span className="text-[12px] text-[#7a7466]">
          {served.menu}
          {served.main ? `: ${[served.entree, served.main, served.dessert].filter(Boolean).join(' · ')}` : ''}. Write in a box only to change that course for them.
        </span>
      </div>
    </div>
  );
}

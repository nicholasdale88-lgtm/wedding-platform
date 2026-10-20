import { Menus, servedMeal, type MealChoice } from '@wp/shared';
import { safeJson } from './security';

export type Served = { e: string; m: string; d: string; menu: string };
const NOTHING: Served = { e: '', m: '', d: '', menu: '' };

/**
 * What each person is served at one event, course by course (their changes, else their menu's, else the
 * set menu's), from meal_choice and the event's menus. Someone given nothing gets blank courses (the
 * guide then says "Set menu"), so the set menu's dishes only show for people given a menu.
 */
export async function servedAt(db: D1Database, weddingId: string, ev: { id: string; key: string }): Promise<(personId: string) => Served> {
  const [rows, doc] = await db.batch([
    db.prepare(`SELECT person_id, menu_id, entree, main, dessert FROM meal_choice WHERE event_id = ?`).bind(ev.id),
    db.prepare(`SELECT data FROM planner_doc WHERE wedding_id = ? AND kind = 'menus' AND scope = ?`).bind(weddingId, ev.key),
  ]);
  const choices = new Map(
    (rows!.results as { person_id: string; menu_id: string; entree: string; main: string; dessert: string }[]).map((r) => [
      r.person_id,
      { menu: r.menu_id, entree: r.entree, main: r.main, dessert: r.dessert } as MealChoice,
    ]),
  );
  const menus = Menus.safeParse(safeJson(((doc!.results[0] ?? {}) as { data?: string }).data, {})).data;
  return (personId) => {
    const c = choices.get(personId);
    if (!c || (!c.menu && !c.entree && !c.main && !c.dessert)) return NOTHING;
    const s = servedMeal(c, menus);
    return { e: s.entree, m: s.main, d: s.dessert, menu: s.menu };
  };
}

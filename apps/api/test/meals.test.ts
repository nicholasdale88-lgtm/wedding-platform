import { dietCategories } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Dietary → meals: saved per person, shown on their night-before place card. */
describe('meals API', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
  });
  afterEach(() => t.dispose());

  it("saves a person's meals, and their guide's place card shows them", async () => {
    const p = await t.db.prepare(`SELECT p.id, i.token FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE p.idx = 0 AND p.name = 'Margaret Bloor'`).first<{ id: string; token: string }>();
    const res = await call(`/a/w/${wid}/people/${p!.id}/meal`, { method: 'PUT', body: JSON.stringify({ entree: 'Soup', main: ' Risotto ', dessert: '' }) });
    expect(res.status).toBe(200);
    const guide = (await (await call(`/p/sophie-and-nicholas/guide?g=${p!.token}&event=wedding`)).json()) as { guest: { people: { name: string; meals: { e: string; m: string; d: string } }[] } };
    expect(guide.guest.people[0]!.meals).toEqual({ e: 'Soup', m: 'Risotto', d: '' });
  });

  it("can't touch another wedding's guests, and viewers can't edit", async () => {
    expect((await call(`/a/w/${wid}/people/not-a-person/meal`, { method: 'PUT', body: JSON.stringify({ entree: '', main: '', dessert: '' }) })).status).toBe(404);
    expect((await call(`/a/w/${wid}/people/x/meal`, { method: 'PUT', body: JSON.stringify({ entree: 'x'.repeat(201), main: '', dessert: '' }) })).status).toBe(400);
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    expect((await call(`/a/w/${wid}/people/x/meal`, { method: 'PUT', body: JSON.stringify({ entree: '', main: '', dessert: '' }) })).status).toBe(403);
  });

  /** Someone invited to both events (the guide works for each). */
  const both = async () =>
    (await t.db
      .prepare(
        `SELECT p.id, i.id AS inv, i.token, i.version FROM person p JOIN invitation i ON i.id = p.invitation_id
          WHERE p.idx = 0 AND p.deleted_at IS NULL AND (SELECT COUNT(*) FROM invite_event ie WHERE ie.invitation_id = i.id) >= 2 LIMIT 1`,
      )
      .first<{ id: string; inv: string; token: string; version: number }>())!;
  const guideMeals = async (token: string, event: string) =>
    ((await (await call(`/p/sophie-and-nicholas/guide?g=${token}&event=${event}`)).json()) as { guest?: { people: { meals: { e: string; m: string; d: string } }[] } }).guest?.people[0]?.meals;
  const setMenus = (event: string, menus: unknown) =>
    t.db
      .prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?, 'menus', ?, ?, 1, 'now') ON CONFLICT (wedding_id, kind, scope) DO UPDATE SET data = excluded.data`)
      .bind(wid, event, JSON.stringify(menus))
      .run();
  const menus = (main: string) => ({
    set: { id: '', name: 'Set menu', suits: '', entree: 'Burrata', main: 'Lamb', dessert: 'Pavlova' },
    special: [{ id: 'vegan', name: 'Vegan', suits: 'vegan', entree: 'Tomato', main, dessert: '' }],
    files: [],
  });

  it('meals are per event: someone at both can have a different meal at each', async () => {
    const p = await both();
    await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', entree: '', main: 'Fish', dessert: '' }) });
    await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: '30th', entree: '', main: 'Pizza', dessert: '' }) });
    expect((await guideMeals(p.token, 'wedding'))?.m).toBe('Fish');
    expect((await guideMeals(p.token, '30th'))?.m).toBe('Pizza');
    const g = (await (await call(`/a/w/${wid}/guests/${p.inv}`)).json()) as { guest: { people: { id: string; meals: Record<string, { main: string }> }[] } };
    expect(g.guest.people.find((x) => x.id === p.id)!.meals).toMatchObject({ wedding: { main: 'Fish' }, '30th': { main: 'Pizza' } });
  });

  it('a guest given a special menu gets its courses, and editing the menu reaches them; a course changed for them stays', async () => {
    const p = await both();
    await setMenus('wedding', menus('Risotto'));
    await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', menu: 'vegan', entree: '', main: '', dessert: '' }) });
    expect(await guideMeals(p.token, 'wedding')).toEqual({ e: 'Tomato', m: 'Risotto', d: 'Pavlova' }); // the menu has no dessert: the set one
    await setMenus('wedding', menus('Gnocchi'));
    expect((await guideMeals(p.token, 'wedding'))?.m).toBe('Gnocchi');
    await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', menu: 'vegan', entree: '', main: '', dessert: 'Sorbet' }) });
    expect(await guideMeals(p.token, 'wedding')).toEqual({ e: 'Tomato', m: 'Gnocchi', d: 'Sorbet' });
    // The menu is removed: back to the set menu, never a blank plate.
    await setMenus('wedding', { ...menus('x'), special: [] });
    expect(await guideMeals(p.token, 'wedding')).toEqual({ e: 'Burrata', m: 'Lamb', d: 'Sorbet' });
  });

  it('saying no to an event clears their meal there (the caterer never counts them), and keeps the other event', async () => {
    const p = await both();
    await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', entree: '', main: 'Fish', dessert: '' }) });
    await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: '30th', entree: '', main: 'Pizza', dessert: '' }) });
    const res = await call(`/a/w/${wid}/guests/${p.inv}/rsvp`, { method: 'PUT', headers: { 'If-Match': String(p.version) }, body: JSON.stringify({ events: { '30th': { attending: false } } }) });
    expect(res.status).toBe(200);
    const left = await t.db.prepare(`SELECT e.key, m.main FROM meal_choice m JOIN event e ON e.id = m.event_id WHERE m.person_id = ?`).bind(p.id).all<{ key: string; main: string }>();
    expect(left.results).toEqual([{ key: 'wedding', main: 'Fish' }]);
  });

  it('a stress run: 120 meals saved at once all land, each exactly once', async () => {
    const { results: ppl } = await t.db
      .prepare(`SELECT p.id FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ? AND p.deleted_at IS NULL LIMIT 120`)
      .bind(wid)
      .all<{ id: string }>();
    const codes = await Promise.all(ppl.map(async (x, i) => (await call(`/a/w/${wid}/people/${x.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', menu: i % 2 ? 'vegan' : '', entree: '', main: `Dish ${i}`, dessert: '' }) })).status));
    expect(codes.filter((c) => c !== 200)).toEqual([]);
    const n = await t.db.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT person_id) AS people FROM meal_choice m JOIN event e ON e.id = m.event_id AND e.key = 'wedding'`).first<{ n: number; people: number }>();
    expect(n).toEqual({ n: ppl.length, people: ppl.length });
  });

  it('bad input never lands: an unknown event, a too-long menu id, extra fields', async () => {
    const p = await both();
    expect((await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'no-such-event', entree: '', main: '', dessert: '' }) })).status).toBe(404);
    expect((await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', menu: 'x'.repeat(41), entree: '', main: '', dessert: '' }) })).status).toBe(400);
    expect((await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', entree: '', main: '', dessert: '', price: 5 }) })).status).toBe(400);
    expect((await call(`/a/w/${wid}/people/${p.id}/meal`, { method: 'PUT', body: 'not json' })).status).toBe(400);
  });

  it('sorts dietary notes into kitchen headings', () => {
    expect(dietCategories('Vegetarian, nut allergy')).toEqual(['Vegetarian', 'Nut allergy']);
    expect(dietCategories('Coeliac')).toEqual(['Gluten free']);
    expect(dietCategories('No coriander please')).toEqual(['Other']);
    expect(dietCategories('  ')).toEqual([]);
  });
});

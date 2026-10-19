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

  it('sorts dietary notes into kitchen headings', () => {
    expect(dietCategories('Vegetarian, nut allergy')).toEqual(['Vegetarian', 'Nut allergy']);
    expect(dietCategories('Coeliac')).toEqual(['Gluten free']);
    expect(dietCategories('No coriander please')).toEqual(['Other']);
    expect(dietCategories('  ')).toEqual([]);
  });
});

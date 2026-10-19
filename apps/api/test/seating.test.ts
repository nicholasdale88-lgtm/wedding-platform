import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Admin → Seating: the floor plan and who sits where, saved in one go. */
describe('seating API', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  type Table = { id: string; name: string; shape: 'round' | 'long'; dir: 'h' | 'v'; len: number; x: number; y: number; seats: number };
  type Seating = { version: number; event: { key: string }; aspect: string; tables: Table[]; areas: { label: string; x: number; y: number; w: number; h: number }[]; people: { id: string; name: string; tableId: string | null; coming: boolean }[] };
  const get = async (q = '') => (await (await call(`/a/w/${wid}/seating${q}`)).json()) as Seating;
  const put = (s: Seating, over: Partial<{ tables: Table[]; seats: Record<string, string | null>; areas: Seating['areas'] }> = {}, v = s.version) =>
    call(`/a/w/${wid}/seating`, {
      method: 'PUT',
      headers: { 'If-Match': String(v) },
      body: JSON.stringify({ event: s.event.key, aspect: s.aspect, tables: s.tables, areas: s.areas, seats: Object.fromEntries(s.people.map((p) => [p.id, p.tableId])), ...over }),
    });

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

  it('opens on the event with seating, with its tables, areas and everyone not declined', async () => {
    const s = await get();
    expect(s.event.key).toBe('wedding');
    expect(s.tables.length).toBeGreaterThan(1);
    expect(s.people.length).toBeGreaterThan(10);
    expect(s.people.some((p) => p.tableId)).toBe(true);
  });

  it('adds, moves and removes tables, seats people, and the guide shows it', async () => {
    const s = await get();
    const gone = s.tables[0]!;
    const added: Table = { id: crypto.randomUUID(), name: 'Willow', shape: 'long', dir: 'h', len: 40, x: 50, y: 80, seats: 12 };
    const someone = s.people.find((p) => p.tableId === gone.id) ?? s.people[0]!;
    const tables = [...s.tables.slice(1).map((x) => ({ ...x, x: 10 })), added];
    const res = await put(s, { tables, seats: { ...Object.fromEntries(s.people.map((p) => [p.id, p.tableId === gone.id ? null : p.tableId])), [someone.id]: added.id }, areas: [{ label: 'Dance floor', x: 50, y: 50, w: 20, h: 15 }] });
    expect(res.status).toBe(200);
    const after = (await res.json()) as Seating;
    expect(after.version).toBe(s.version + 1);
    expect(after.tables.map((x) => x.id)).not.toContain(gone.id);
    expect(after.tables.find((x) => x.id === added.id)).toMatchObject({ name: 'Willow', shape: 'long', seats: 12 });
    expect(after.people.find((p) => p.id === someone.id)!.tableId).toBe(added.id);
    expect(after.areas).toEqual([{ label: 'Dance floor', x: 50, y: 50, w: 20, h: 15 }]);
    expect(after.people.filter((p) => p.tableId === gone.id)).toHaveLength(0);
  });

  it('refuses stale saves, unknown people, tables that are not there, and taking over another table', async () => {
    const s = await get();
    expect((await put(s)).status).toBe(200);
    expect((await put(s)).status).toBe(409);
    const s2 = await get();
    expect((await put(s2, { seats: { 'not-a-person': null } })).status).toBe(400);
    expect((await put(s2, { seats: { [s2.people[0]!.id]: crypto.randomUUID() } })).status).toBe(400);
    const other = await t.db.prepare(`SELECT id FROM seat_table LIMIT 1`).first<{ id: string }>();
    await t.db.prepare(`UPDATE seat_table SET event_id = 'elsewhere' WHERE id = ?`).bind(other!.id).run();
    const s3 = await get();
    expect((await put(s3, { tables: [...s3.tables, { id: other!.id, name: 'Mine now', shape: 'round', dir: 'h', len: 40, x: 1, y: 1, seats: 8 }] })).status).toBe(400);
  });

  it('viewers can look but not change the seating', async () => {
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    const s = await get();
    expect((await put(s)).status).toBe(403);
  });
});

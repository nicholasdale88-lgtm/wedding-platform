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
    const someone = s.people.find((p) => p.tableId === gone.id) ?? s.people.find((p) => p.coming)!;
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
    await t.db.prepare(`UPDATE seat_table SET event_id = (SELECT id FROM event WHERE key = '30th') WHERE id = ?`).bind(other!.id).run(); // now belongs to another event
    const s3 = await get();
    expect((await put(s3, { tables: [...s3.tables, { id: other!.id, name: 'Mine now', shape: 'round', dir: 'h', len: 40, x: 1, y: 1, seats: 8 }] })).status).toBe(400);
  });

  it('seating follows replies: declining (by the guest or the couple) or being un-invited frees the seat', async () => {
    const seatedInv = await t.db
      .prepare(
        `SELECT i.id, i.token FROM invitation i JOIN person p ON p.invitation_id = i.id JOIN seat_table st ON st.id = p.table_id JOIN event e ON e.id = st.event_id
          WHERE e.key = 'wedding' AND i.deleted_at IS NULL LIMIT 1`,
      )
      .first<{ id: string; token: string }>();
    const seatedCount = async (id: string) => (await t.db.prepare(`SELECT COUNT(*) AS n FROM person WHERE invitation_id = ? AND table_id IS NOT NULL`).bind(id).first<{ n: number }>())!.n;
    expect(await seatedCount(seatedInv!.id)).toBeGreaterThan(0);

    // The guest declines on their invitation.
    await app.request('/api/p/sophie-and-nicholas/rsvp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: seatedInv!.token, events: { wedding: { attending: false } } }) }, env, ctx);
    expect(await seatedCount(seatedInv!.id)).toBe(0);

    // Seat someone else, then the couple records a decline for them.
    const s = await get();
    const other = s.people.find((p) => p.tableId)!;
    const inv = (await t.db.prepare(`SELECT invitation_id AS id, (SELECT version FROM invitation WHERE id = invitation_id) AS v FROM person WHERE id = ?`).bind(other.id).first<{ id: string; v: number }>())!;
    await call(`/a/w/${wid}/guests/${inv.id}/rsvp`, { method: 'PUT', headers: { 'If-Match': String(inv.v) }, body: JSON.stringify({ events: { wedding: { attending: false } } }) });
    expect(await seatedCount(inv.id)).toBe(0);
    expect((await get()).people.some((p) => p.id === other.id)).toBe(false); // declined: not on the seating list at all
  });

  it('guests see only the published plan; later changes wait for Publish again', async () => {
    type Pub = Seating & { published: { at: string; changes: number } | null };
    const guide = async (token: string) =>
      (await (await app.request(`/api/p/sophie-and-nicholas/guide?g=${token}&event=wedding`, {}, env, ctx)).json()) as { guest: { people: { tableId: string | null }[] }; seating: { tables: { name: string }[] } | null };
    const s = (await get()) as Pub;
    expect(s.published).toBeNull();
    const seated = s.people.find((p) => p.tableId)!;
    const tok = (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id WHERE p.id = ?`).bind(seated.id).first<{ token: string }>())!.token;
    expect((await guide(tok)).seating).toBeNull(); // draft only

    const publish = (v: number) => call(`/a/w/${wid}/seating/publish`, { method: 'POST', headers: { 'If-Match': String(v) }, body: JSON.stringify({ event: 'wedding' }) });
    const p1 = (await (await publish(s.version)).json()) as Pub;
    expect(p1.published).toMatchObject({ changes: 0 });
    const g1 = await guide(tok);
    expect(g1.seating!.tables.length).toBe(s.tables.length);
    expect(g1.guest.people.some((p) => p.tableId === seated.tableId)).toBe(true);

    // A later edit is saved as a draft: guests still see the published plan.
    const renamed = s.tables.map((x) => (x.id === seated.tableId ? { ...x, name: 'Renamed' } : x));
    const saved = (await (await put(p1, { tables: renamed })).json()) as Pub;
    expect(saved.published!.changes).toBe(1);
    expect((await guide(tok)).seating!.tables.map((x) => x.name)).not.toContain('Renamed');
    expect((await publish(saved.version - 1)).status).toBe(409); // stale
    await publish(saved.version);
    expect((await guide(tok)).seating!.tables.map((x) => x.name)).toContain('Renamed');
    expect(((await get()) as Pub).published!.changes).toBe(0);
  });

  it('only guests who said yes can be seated', async () => {
    const s = await get();
    const awaiting = s.people.find((p) => !p.coming)!;
    const res = await put(s, { seats: { ...Object.fromEntries(s.people.map((p) => [p.id, p.tableId])), [awaiting.id]: s.tables[0]!.id } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/said yes/);
  });

  it('viewers can look but not change the seating', async () => {
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    const s = await get();
    expect((await put(s)).status).toBe(403);
  });
});

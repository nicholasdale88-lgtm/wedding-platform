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

  it('keeps each guest's chosen chair and each table's size in metres, and the room can be measured in metres', async () => {
    const s = await get();
    const tbl = s.tables[0]!;
    const two = s.people.filter((p) => p.coming).slice(0, 2);
    const seats = { ...Object.fromEntries(s.people.map((p) => [p.id, p.tableId])), [two[0]!.id]: tbl.id, [two[1]!.id]: tbl.id };
    const res = await call(`/a/w/${wid}/seating`, {
      method: 'PUT',
      headers: { 'If-Match': String(s.version) },
      body: JSON.stringify({ event: s.event.key, aspect: '24 / 18 m', tables: s.tables.map((x) => (x.id === tbl.id ? { ...x, size: 2.4 } : x)), areas: s.areas, seats, chairs: { [two[0]!.id]: 3, [two[1]!.id]: 1 } }),
    });
    expect(res.status).toBe(200);
    const after = (await res.json()) as Seating & { tables: (Table & { size: number | null })[]; people: { id: string; chair: number | null }[] };
    expect(after.aspect).toBe('24 / 18 m');
    expect(after.tables.find((x) => x.id === tbl.id)!.size).toBe(2.4);
    expect(after.people.find((p) => p.id === two[0]!.id)!.chair).toBe(3);
    expect(after.people.find((p) => p.id === two[1]!.id)!.chair).toBe(1);
    // A chair past the table's seats isn't kept; a room size that isn't metres or a usual shape is refused.
    const bad = await call(`/a/w/${wid}/seating`, {
      method: 'PUT',
      headers: { 'If-Match': String(after.version) },
      body: JSON.stringify({ event: s.event.key, aspect: '24 / 18 ft', tables: after.tables, areas: after.areas, seats }),
    });
    expect(bad.status).toBe(400);
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

  it("a guest has a seat at each event: saving the second event's plan leaves the first event's seats alone", async () => {
    const wedding = await get('?event=wedding');
    const seated = wedding.people.find((p) => p.tableId)!;
    // Make them coming to the second event too, then seat them there.
    const inv = (await t.db.prepare(`SELECT invitation_id FROM person WHERE id = ?`).bind(seated.id).first<{ invitation_id: string }>())!.invitation_id;
    const second = (await t.db.prepare(`SELECT id FROM event WHERE key = '30th'`).first<{ id: string }>())!.id;
    await t.db.batch([
      t.db.prepare(`INSERT OR IGNORE INTO invite_event (invitation_id, event_id) VALUES (?, ?)`).bind(inv, second),
      t.db.prepare(`INSERT OR REPLACE INTO rsvp (invitation_id, event_id, attending, count, updated_at) VALUES (?, ?, 1, 1, '2026-10-19T00:00:00Z')`).bind(inv, second),
    ]);
    const b = await get('?event=30th');
    const table: Table = { id: crypto.randomUUID(), name: 'Picnic 1', shape: 'round', dir: 'h', len: 40, x: 50, y: 50, seats: 10 };
    expect((await put(b, { tables: [...b.tables, table], seats: { ...Object.fromEntries(b.people.map((p) => [p.id, p.tableId])), [seated.id]: table.id } })).status).toBe(200);
    expect((await get('?event=30th')).people.find((p) => p.id === seated.id)!.tableId).toBe(table.id);
    expect((await get('?event=wedding')).people.find((p) => p.id === seated.id)!.tableId).toBe(seated.tableId); // still there
  });

  it('seating follows replies: declining (by the guest or the couple) or being un-invited frees the seat', async () => {
    const seatedInv = await t.db
      .prepare(
        `SELECT i.id, i.token FROM invitation i JOIN person p ON p.invitation_id = i.id JOIN seat s ON s.person_id = p.id JOIN event e ON e.id = s.event_id
          WHERE e.key = 'wedding' AND i.deleted_at IS NULL LIMIT 1`,
      )
      .first<{ id: string; token: string }>();
    const seatedCount = async (id: string) => (await t.db.prepare(`SELECT COUNT(*) AS n FROM seat s JOIN person p ON p.id = s.person_id WHERE p.invitation_id = ?`).bind(id).first<{ n: number }>())!.n;
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

  /** The invitation token of a person on the seating list. */
  const tokenOf = async (personId: string) => (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id WHERE p.id = ?`).bind(personId).first<{ token: string }>())!.token;
  const reply = (token: string, attending: boolean) =>
    app.request('/api/p/sophie-and-nicholas/rsvp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, events: { wedding: { attending } } }) }, env, ctx);
  const seatsOf = (s: Seating) => Object.fromEntries(s.people.map((p) => [p.id, p.tableId]));

  it('guests still to reply can be pencilled in, and keep their seat until they say no', async () => {
    const s = await get();
    const awaiting = s.people.find((p) => !p.coming)!;
    const table = s.tables[0]!.id;
    const res = await put(s, { seats: { ...seatsOf(s), [awaiting.id]: table } });
    expect(res.status).toBe(200);
    const after = (await res.json()) as Seating;
    expect(after.people.find((p) => p.id === awaiting.id)).toMatchObject({ tableId: table, coming: false }); // pencilled in

    // Saying yes keeps the seat (now confirmed); saying no frees it at once.
    expect((await reply(await tokenOf(awaiting.id), true)).status).toBe(200);
    expect((await get()).people.find((p) => p.id === awaiting.id)).toMatchObject({ tableId: table, coming: true });
    expect((await reply(await tokenOf(awaiting.id), false)).status).toBe(200);
    expect((await get()).people.some((p) => p.id === awaiting.id)).toBe(false);
    expect(await t.db.prepare(`SELECT COUNT(*) AS n FROM seat WHERE person_id = ?`).bind(awaiting.id).first<{ n: number }>()).toEqual({ n: 0 });
  });

  it('publishing shows guests only people who said yes: no pencilled-in table mates', async () => {
    type Pub = Seating & { published: { at: string; changes: number } | null };
    const s = (await get()) as Pub;
    const yes = s.people.find((p) => p.coming && p.tableId)!;
    const awaiting = s.people.find((p) => !p.coming)!;
    const saved = (await (await put(s, { seats: { ...seatsOf(s), [awaiting.id]: yes.tableId } })).json()) as Pub;
    const pub = (await (await call(`/a/w/${wid}/seating/publish`, { method: 'POST', headers: { 'If-Match': String(saved.version) }, body: JSON.stringify({ event: 'wedding' }) })).json()) as Pub;
    expect(pub.published).toMatchObject({ changes: 0 }); // pencilled-in seats never count as waiting to go live

    const snap = JSON.parse((await t.db.prepare(`SELECT snapshot FROM seat_publish`).first<{ snapshot: string }>())!.snapshot) as { seats: Record<string, string> };
    expect(snap.seats[yes.id]).toBe(yes.tableId);
    expect(snap.seats[awaiting.id]).toBeUndefined();
    const guide = (await (await app.request(`/api/p/sophie-and-nicholas/guide?g=${await tokenOf(yes.id)}&event=wedding`, {}, env, ctx)).json()) as { mates: Record<string, string[]> };
    expect(Object.values(guide.mates).flat()).not.toContain(awaiting.name);
    const theirs = (await (await app.request(`/api/p/sophie-and-nicholas/guide?g=${await tokenOf(awaiting.id)}&event=wedding`, {}, env, ctx)).json()) as { guest: { people: { tableId: string | null }[] } };
    expect(theirs.guest.people.every((p) => !p.tableId)).toBe(true); // no table shown before they say yes

    // Once they say yes, publishing again shows them.
    await reply(await tokenOf(awaiting.id), true);
    expect(((await get()) as Pub).published!.changes).toBeGreaterThan(0);
  });

  it('says what changed since the last save (said yes, can no longer come, new), and Mark as seen clears it', async () => {
    type Since = Seating & { sinceSave: { saidYes: string[]; cantCome: { name: string; table: string }[]; newGuests: string[] } | null };
    const s = (await get()) as Since;
    expect(s.sinceSave).toBeNull(); // never saved here
    const pending = s.people.filter((p) => !p.coming);
    const invOf = async (id: string) => (await t.db.prepare(`SELECT invitation_id AS i FROM person WHERE id = ?`).bind(id).first<{ i: string }>())!.i;
    const a = pending[0]!;
    const aInv = await invOf(a.id);
    const b = (await Promise.all(pending.map(async (p) => ({ p, inv: await invOf(p.id) })))).find((x) => x.inv !== aInv)!.p;
    const tA = s.tables[0]!;
    const tB = s.tables[1]!;
    const saved = (await (await put(s, { seats: { ...seatsOf(s), [a.id]: tA.id, [b.id]: tB.id } })).json()) as Since;
    expect(saved.sinceSave).toBeNull();

    await reply(await tokenOf(a.id), true);
    await reply(await tokenOf(b.id), false);
    const now = (await get()) as Since;
    expect(now.sinceSave!.saidYes).toContain(a.name);
    expect(now.sinceSave!.cantCome).toContainEqual({ name: b.name, table: tB.name });
    expect(now.people.find((p) => p.id === a.id)!.tableId).toBe(tA.id); // nothing moved for them

    const seen = (await (await call(`/a/w/${wid}/seating/seen`, { method: 'POST', body: JSON.stringify({ event: 'wedding' }) })).json()) as Since;
    expect(seen.sinceSave).toBeNull();
    expect(((await get()) as Since).sinceSave).toBeNull();
  });

  it('works out the stage from the replies, and the couple can choose one', async () => {
    type Staged = Seating & { stage: { auto: string; chosen: string | null; invited: number; replied: number } };
    const s = (await get()) as Staged;
    expect(s.stage.invited).toBeGreaterThan(0);
    expect(['draft', 'replies', 'final']).toContain(s.stage.auto);
    expect(s.stage.chosen).toBeNull();
    const set = async (stage: string | null) => (await (await call(`/a/w/${wid}/seating/stage`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', stage }) })).json()) as Staged;
    expect((await set('final')).stage.chosen).toBe('final');
    expect(((await get()) as Staged).stage.chosen).toBe('final');
    expect((await set(null)).stage.chosen).toBeNull();
    expect((await call(`/a/w/${wid}/seating/stage`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', stage: 'someday' }) })).status).toBe(400);
    // Published: the stage says so.
    await call(`/a/w/${wid}/seating/publish`, { method: 'POST', headers: { 'If-Match': String(s.version) }, body: JSON.stringify({ event: 'wedding' }) });
    expect(((await get()) as Staged).stage.auto).toBe('published');
  });

  it('saves named versions, shows one without changing anything, and nominates the current arrangement', async () => {
    type Ver = Seating & { versions: { id: string; name: string; tables: number; seated: number }[]; current: { id: string; name: string; changes: number } | null };
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) => call(`/a/w/${wid}/seating${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const s = (await get()) as Ver;
    expect(s.versions).toEqual([]);
    expect(s.current).toBeNull();
    expect((await post('/versions', { event: 'wedding', name: '  ' })).status).toBe(400);

    // "Family draft" is the plan as saved; it becomes current.
    const a = (await (await post('/versions', { event: 'wedding', name: 'Family draft' })).json()) as Ver;
    const draft = a.versions[0]!;
    expect(draft).toMatchObject({ name: 'Family draft', tables: s.tables.length, seated: s.people.filter((p) => p.tableId).length });
    expect(a.current).toMatchObject({ id: draft.id, changes: 0 });

    // Try another arrangement: nobody seated, one table fewer. Current shows the changes since.
    const b = (await (await put(a, { tables: a.tables.slice(1), seats: Object.fromEntries(a.people.map((p) => [p.id, null])) })).json()) as Ver;
    expect(b.current!.changes).toBeGreaterThan(1);
    const c = (await (await post('/versions', { event: 'wedding', name: 'Empty room' })).json()) as Ver;
    expect(c.versions.map((v) => v.name)).toEqual(['Empty room', 'Family draft']);
    expect(c.current!.name).toBe('Empty room');

    // Looking at a version changes nothing.
    const look = (await (await call(`/a/w/${wid}/seating/versions/${draft.id}`)).json()) as { name: string; tables: Table[]; seats: Record<string, string> };
    expect(look.name).toBe('Family draft');
    expect(look.tables).toHaveLength(s.tables.length);
    expect(((await get()) as Ver).tables).toHaveLength(s.tables.length - 1);

    // Making it current brings back its tables and seats (stale version refused).
    expect((await post(`/versions/${draft.id}/current`, {}, { 'If-Match': String(c.version - 1) })).status).toBe(409);
    const back = (await (await post(`/versions/${draft.id}/current`, {}, { 'If-Match': String(c.version) })).json()) as Ver;
    expect(back.current).toMatchObject({ id: draft.id, changes: 0 });
    expect(back.tables.map((x) => x.id).sort()).toEqual(s.tables.map((x) => x.id).sort());
    expect(Object.fromEntries(back.people.map((p) => [p.id, p.tableId]))).toEqual(Object.fromEntries(s.people.map((p) => [p.id, p.tableId])));

    // Rename and delete; deleting the current one leaves the plan alone.
    const renamed = (await (await call(`/a/w/${wid}/seating/versions/${draft.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Final' }) })).json()) as Ver;
    expect(renamed.current!.name).toBe('Final');
    const gone = (await (await call(`/a/w/${wid}/seating/versions/${draft.id}`, { method: 'DELETE', body: '{}' })).json()) as Ver;
    expect(gone.versions.map((v) => v.name)).toEqual(['Empty room']);
    expect(gone.current).toBeNull();
    expect(gone.tables).toHaveLength(s.tables.length);

    // Another wedding's version id is not found; viewers can't save one.
    expect((await call(`/a/w/${wid}/seating/versions/${crypto.randomUUID()}`)).status).toBe(404);
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    expect((await post('/versions', { event: 'wedding', name: 'Nope' })).status).toBe(403);
  });

  it('viewers can look but not change the seating', async () => {
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    const s = await get();
    expect((await put(s)).status).toBe(403);
  });
});

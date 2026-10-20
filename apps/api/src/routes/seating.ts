import { TABLE_SHAPES } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJson, safeJson } from '../lib/security';
import { unseatEveryoneNotComing } from '../lib/seatingRules';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Admin → Seating (/api/a/w/:wid/seating?event=<key>): the floor plan for one event. Tables and areas
 * are placed in % of the plan, so it looks the same at any size. Saving sends the whole layout and
 * who sits where, applied in one batch (If-Match: the wedding's version).
 *
 * Versions (/seating/versions): name a snapshot of the saved plan ("Family draft", "Final"), look back at
 * any of them, and nominate one as the current arrangement (it's copied into the working plan).
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 428, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;
const pct = z.number().min(0).max(100);

const Save = z
  .object({
    event: z.string().max(40),
    aspect: z.string().regex(/^\d{1,2} \/ \d{1,2}$/),
    tables: z
      .array(
        z.object({
          id: z.string().uuid(),
          name: z.string().trim().min(1).max(40),
          shape: z.enum(TABLE_SHAPES),
          dir: z.enum(['h', 'v']),
          len: z.number().int().min(10).max(90),
          x: pct,
          y: pct,
          seats: z.number().int().min(1).max(60),
          /** Long and head tables: 2 both sides, 1 or -1 one side only. */
          sides: z.union([z.literal(2), z.literal(1), z.literal(-1)]).default(2),
        }),
      )
      .max(120),
    areas: z.array(z.object({ label: z.string().trim().min(1).max(40), x: pct, y: pct, w: z.number().min(2).max(100), h: z.number().min(2).max(100) })).max(40),
    seats: z.record(z.string().max(60), z.string().uuid().nullable()),
  })
  .strict();

export function seatingRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());

  async function load(c: C, eventKey?: string) {
    const db = c.env.DB;
    const w = await db.prepare(`SELECT id, version FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(wid(c)).first<{ id: string; version: number }>();
    if (!w) return null;
    const { results: events } = await db
      .prepare(`SELECT id, key, name, has_seating, catered FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`)
      .bind(w.id)
      .all<{ id: string; key: string; name: string; has_seating: number; catered: number }>();
    const ev = events.find((e) => e.key === eventKey) ?? events.find((e) => e.has_seating) ?? events.find((e) => e.catered) ?? events[0];
    if (!ev) return null;
    const [plan, tables, areas, people, pub, vers] = await db.batch([
      db.prepare(`SELECT aspect, image_key, current_version FROM seat_plan WHERE event_id = ?`).bind(ev.id),
      db.prepare(`SELECT id, name, shape, dir, length_pct AS len, x, y, seats, sides FROM seat_table WHERE event_id = ? AND deleted_at IS NULL ORDER BY name`).bind(ev.id),
      db.prepare(`SELECT label, x, y, w, h FROM seat_area WHERE event_id = ? AND deleted_at IS NULL`).bind(ev.id),
      db.prepare(
        `SELECT p.id, p.invitation_id AS invitationId, p.idx, p.name, p.diet, (SELECT s.table_id FROM seat s WHERE s.person_id = p.id AND s.event_id = ?1) AS tableId,
                p.meal_entree AS e, p.meal_main AS m, p.meal_dessert AS d, i.party,
                ie.event_id IS NOT NULL AS invited, r.attending
           FROM person p JOIN invitation i ON i.id = p.invitation_id
           LEFT JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = ?1
           LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ?1
          WHERE i.wedding_id = ?2 AND i.deleted_at IS NULL AND p.deleted_at IS NULL
          ORDER BY i.created_at, p.idx`,
      ).bind(ev.id, w.id),
      db.prepare(`SELECT snapshot, published_at FROM seat_publish WHERE event_id = ?`).bind(ev.id),
      db.prepare(`SELECT id, name, snapshot, created_at FROM seat_version WHERE event_id = ? ORDER BY created_at DESC`).bind(ev.id),
    ]);
    const versionRows = vers!.results as { id: string; name: string; snapshot: string; created_at: string }[];
    const tableIds = new Set((tables!.results as { id: string }[]).map((t) => t.id));
    const p = plan!.results[0] as { aspect: string; image_key: string | null; current_version: string | null } | undefined;
    const draft: Snapshot = {
      aspect: p?.aspect ?? '4 / 3',
      tables: tables!.results as Snapshot['tables'],
      areas: areas!.results as Snapshot['areas'],
      seats: Object.fromEntries(
        (people!.results as { id: string; tableId: string | null; invited: number; attending: number | null }[])
          .filter((x) => x.invited && x.attending === 1 && x.tableId && tableIds.has(x.tableId))
          .map((x) => [x.id, x.tableId!]),
      ),
    };
    const pubRow = pub!.results[0] as { snapshot: string; published_at: string } | undefined;
    const empty = { aspect: '', tables: [], areas: [], seats: {} } as unknown as Snapshot;
    const cur = versionRows.find((x) => x.id === p?.current_version);
    const versions = versionRows.map((x) => {
      const snap = safeJson<Snapshot>(x.snapshot, empty);
      return { id: x.id, name: x.name, at: x.created_at, tables: snap.tables.length, seated: Object.keys(snap.seats).length };
    });
    const published = pubRow ? { at: pubRow.published_at, changes: changesBetween(safeJson<Snapshot>(pubRow.snapshot, { aspect: '', tables: [], areas: [], seats: {} } as unknown as Snapshot), draft) } : null;
    return {
      eventId: ev.id,
      draft,
      view: {
        published,
        versions,
        /** The nominated arrangement, and how many saved edits differ from it since. */
        current: cur ? { id: cur.id, name: cur.name, changes: changesBetween(safeJson<Snapshot>(cur.snapshot, empty), draft) } : null,
        version: w.version,
        event: { key: ev.key, name: ev.name },
        events: events.map((e) => ({ key: e.key, name: e.name })),
        aspect: p?.aspect ?? '4 / 3',
        planImg: '', // plan photos arrive with uploads (R2)
        tables: tables!.results as { id: string; name: string; shape: string; dir: string; len: number; x: number; y: number; seats: number }[],
        areas: areas!.results,
        people: (people!.results as { id: string; invitationId: string; idx: number; name: string; diet: string; tableId: string | null; e: string; m: string; d: string; party: string; invited: number; attending: number | null }[])
          .filter((x) => x.invited && x.attending !== 0)
          .map((x) => ({ id: x.id, invitationId: x.invitationId, name: x.name, party: x.party, diet: x.diet, meal: { e: x.e, m: x.m, d: x.d }, tableId: x.attending === 1 && x.tableId && tableIds.has(x.tableId) ? x.tableId : null, coming: x.attending === 1 })),
      },
    };
  }

  app.get('/', async (c) => {
    const s = await load(c, c.req.query('event'));
    if (!s) return err(c, 404, 'not_found', 'No events yet.');
    return c.json(s.view);
  });

  app.put('/', requireMember('owner', 'editor'), async (c) => {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return err(c, 428, 'version_required', 'Reload and try again.');
    const body = Save.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', body.error.issues[0]?.message ?? 'Please check the seating.');
    const b = body.data;
    const loaded = await load(c, b.event);
    const cur = loaded?.view;
    if (!loaded || !cur || cur.event.key !== b.event) return err(c, 404, 'not_found', 'That event no longer exists.');
    if (cur.version !== v) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    const db = c.env.DB;
    const ev = loaded.eventId;

    // A table id that belongs to another event or wedding can't be taken over.
    const known = new Set((cur.tables as { id: string }[]).map((t) => t.id));
    const fresh = b.tables.filter((t) => !known.has(t.id)).map((t) => t.id);
    if (fresh.length) {
      const clash = await db.prepare(`SELECT COUNT(*) AS n FROM seat_table WHERE id IN (${fresh.map(() => '?').join(',')})`).bind(...fresh).first<{ n: number }>();
      if (clash!.n) return err(c, 400, 'invalid', 'Reload and try again.');
    }
    const keep = new Set(b.tables.map((t) => t.id));
    const people = new Set(cur.people.map((p) => p.id));
    for (const [pid, tid] of Object.entries(b.seats)) {
      if (!people.has(pid)) return err(c, 400, 'invalid', 'Someone in the seating is no longer coming. Reload and try again.');
      if (tid && !keep.has(tid)) return err(c, 400, 'invalid', 'A table in the seating no longer exists.');
      const who = cur.people.find((p) => p.id === pid)!;
      if (tid && !who.coming) return err(c, 400, 'not_coming', `Only guests who said yes can have a seat. ${who.name} hasn't said yes.`);
    }

    // Claim the version first: a batch doesn't stop when an UPDATE matches nothing.
    const now = new Date().toISOString();
    const claim = await db.prepare(`UPDATE wedding SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?`).bind(now, wid(c), v).run();
    if (!claim.meta.changes) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    const stmts: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO seat_plan (event_id, aspect) VALUES (?1, ?2) ON CONFLICT (event_id) DO UPDATE SET aspect = ?2`).bind(ev, b.aspect),
      // Adding tables turns the plan on; it is only switched off by the couple (Setup → Details).
      db.prepare(`UPDATE event SET has_seating = CASE WHEN ?1 THEN 1 ELSE has_seating END WHERE id = ?2`).bind(b.tables.length ? 1 : 0, ev),
    ];
    for (const t of b.tables) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO seat_table (id, wedding_id, event_id, name, shape, dir, length_pct, x, y, seats, sides) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT (id) DO UPDATE SET name = ?4, shape = ?5, dir = ?6, length_pct = ?7, x = ?8, y = ?9, seats = ?10, sides = ?11, deleted_at = NULL, version = version + 1`,
          )
          .bind(t.id, wid(c), ev, t.name, t.shape, t.dir, t.len, t.x, t.y, t.seats, t.sides),
      );
    }
    for (const id of known) {
      if (keep.has(id)) continue;
      stmts.push(db.prepare(`UPDATE seat_table SET deleted_at = ? WHERE id = ?`).bind(now, id));
      stmts.push(db.prepare(`DELETE FROM seat WHERE table_id = ?`).bind(id));
    }
    stmts.push(db.prepare(`DELETE FROM seat_area WHERE event_id = ?`).bind(ev));
    for (const a of b.areas) {
      stmts.push(db.prepare(`INSERT INTO seat_area (id, wedding_id, event_id, label, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), ev, a.label, a.x, a.y, a.w, a.h));
    }
    // Only this event's seats change: the same guest's seat at another event is left alone.
    for (const [pid, tid] of Object.entries(b.seats)) {
      stmts.push(
        tid
          ? db.prepare(`INSERT INTO seat (person_id, event_id, table_id) VALUES (?1, ?2, ?3) ON CONFLICT (person_id, event_id) DO UPDATE SET table_id = ?3`).bind(pid, ev, tid)
          : db.prepare(`DELETE FROM seat WHERE person_id = ? AND event_id = ?`).bind(pid, ev),
      );
    }
    stmts.push(unseatEveryoneNotComing(db, ev)); // a reply that changed while this was open still wins
    stmts.push(
      db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'seating.save', ?, ?, ?)`).bind(
        crypto.randomUUID(), wid(c), c.get('user').id, b.event, JSON.stringify({ tables: b.tables.length, seated: Object.values(b.seats).filter(Boolean).length }), now,
      ),
    );

    await db.batch(stmts);
    return c.json((await load(c, b.event))!.view);
  });

  /**
   * Publish: the saved plan becomes what guests see (guides and the night-before text's {table}).
   * Only guests who said yes are in it. Publish again after any change.
   */
  app.post('/publish', requireMember('owner', 'editor'), async (c) => {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return err(c, 428, 'version_required', 'Reload and try again.');
    const body = z.object({ event: z.string().max(40) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose an event.');
    const loaded = await load(c, body.data.event);
    if (!loaded || loaded.view.event.key !== body.data.event) return err(c, 404, 'not_found', 'That event no longer exists.');
    if (loaded.view.version !== v) return err(c, 409, 'conflict', 'Save your changes (or reload) before publishing.');
    const db = c.env.DB;
    const now = new Date().toISOString();
    const claim = await db.prepare(`UPDATE wedding SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?`).bind(now, wid(c), v).run();
    if (!claim.meta.changes) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    await db.batch([
      db
        .prepare(`INSERT INTO seat_publish (event_id, snapshot, published_at, published_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (event_id) DO UPDATE SET snapshot = ?2, published_at = ?3, published_by = ?4`)
        .bind(loaded.eventId, JSON.stringify(loaded.draft), now, c.get('user').id),
      db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'seating.publish', ?, ?, ?)`).bind(
        crypto.randomUUID(), wid(c), c.get('user').id, body.data.event, JSON.stringify({ tables: loaded.draft.tables.length, seated: Object.keys(loaded.draft.seats).length }), now,
      ),
    ]);
    return c.json((await load(c, body.data.event))!.view);
  });

  // ---------------------------------------------------------------- versions
  const VersionName = z.string().trim().min(1, 'Give the version a name.').max(60);
  const ownVersion = (c: C, id: string) =>
    c.env.DB.prepare(`SELECT v.id, v.event_id, v.name, v.snapshot, e.key FROM seat_version v JOIN event e ON e.id = v.event_id WHERE v.id = ? AND v.wedding_id = ?`)
      .bind(id, wid(c))
      .first<{ id: string; event_id: string; name: string; snapshot: string; key: string }>();

  /** Name the saved plan as a version; it becomes the current arrangement. */
  app.post('/versions', requireMember('owner', 'editor'), async (c) => {
    const body = z.object({ event: z.string().max(40), name: VersionName }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', body.error.issues[0]?.message ?? 'Give the version a name.');
    const loaded = await load(c, body.data.event);
    if (!loaded || loaded.view.event.key !== body.data.event) return err(c, 404, 'not_found', 'That event no longer exists.');
    if (loaded.view.versions.length >= MAX_VERSIONS) return err(c, 400, 'too_many', `Up to ${MAX_VERSIONS} versions per event. Delete an old one first.`);
    const db = c.env.DB;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO seat_version (id, wedding_id, event_id, name, snapshot, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, wid(c), loaded.eventId, body.data.name, JSON.stringify(loaded.draft), now, c.get('user').id),
      db.prepare(`INSERT INTO seat_plan (event_id, aspect, current_version) VALUES (?1, ?2, ?3) ON CONFLICT (event_id) DO UPDATE SET current_version = ?3`).bind(loaded.eventId, loaded.draft.aspect, id),
      db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'seating.version', ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), c.get('user').id, body.data.event, JSON.stringify({ name: body.data.name }), now),
    ]);
    return c.json((await load(c, body.data.event))!.view);
  });

  /** One version's plan, to look at (nothing changes). */
  app.get('/versions/:id', async (c) => {
    const v = await ownVersion(c, c.req.param('id'));
    if (!v) return err(c, 404, 'not_found', 'That version no longer exists.');
    return c.json({ id: v.id, name: v.name, ...safeJson<Snapshot>(v.snapshot, { aspect: '4 / 3', tables: [], areas: [], seats: {} }) });
  });

  app.patch('/versions/:id', requireMember('owner', 'editor'), async (c) => {
    const body = z.object({ name: VersionName }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', body.error.issues[0]?.message ?? 'Give the version a name.');
    const v = await ownVersion(c, c.req.param('id'));
    if (!v) return err(c, 404, 'not_found', 'That version no longer exists.');
    await c.env.DB.prepare(`UPDATE seat_version SET name = ? WHERE id = ?`).bind(body.data.name, v.id).run();
    return c.json((await load(c, v.key))!.view);
  });

  app.delete('/versions/:id', requireMember('owner', 'editor'), async (c) => {
    const v = await ownVersion(c, c.req.param('id'));
    if (!v) return err(c, 404, 'not_found', 'That version no longer exists.');
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM seat_version WHERE id = ?`).bind(v.id),
      c.env.DB.prepare(`UPDATE seat_plan SET current_version = NULL WHERE event_id = ? AND current_version = ?`).bind(v.event_id, v.id),
    ]);
    return c.json((await load(c, v.key))!.view);
  });

  /**
   * Nominate a version as the current arrangement: its tables, areas and seats become the working plan.
   * Guests who've since said no, or are no longer on the list, aren't seated; publish to show guests.
   */
  app.post('/versions/:id/current', requireMember('owner', 'editor'), async (c) => {
    const ver = Number(c.req.header('If-Match'));
    if (!Number.isInteger(ver)) return err(c, 428, 'version_required', 'Reload and try again.');
    const v = await ownVersion(c, c.req.param('id'));
    if (!v) return err(c, 404, 'not_found', 'That version no longer exists.');
    const loaded = await load(c, v.key);
    if (!loaded || loaded.eventId !== v.event_id) return err(c, 404, 'not_found', 'That event no longer exists.');
    if (loaded.view.version !== ver) return err(c, 409, 'conflict', 'Save your changes (or reload) first.');
    const snap = safeJson<Snapshot>(v.snapshot, { aspect: '4 / 3', tables: [], areas: [], seats: {} });
    const db = c.env.DB;
    const ev = loaded.eventId;
    const now = new Date().toISOString();
    const claim = await db.prepare(`UPDATE wedding SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?`).bind(now, wid(c), ver).run();
    if (!claim.meta.changes) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    const keep = new Set(snap.tables.map((t) => t.id));
    const coming = new Set(loaded.view.people.filter((p) => p.coming).map((p) => p.id));
    const stmts: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO seat_plan (event_id, aspect, current_version) VALUES (?1, ?2, ?3) ON CONFLICT (event_id) DO UPDATE SET aspect = ?2, current_version = ?3`).bind(ev, snap.aspect || '4 / 3', v.id),
      db.prepare(`DELETE FROM seat WHERE event_id = ?`).bind(ev),
      db.prepare(`DELETE FROM seat_area WHERE event_id = ?`).bind(ev),
    ];
    for (const t of snap.tables) {
      // Only this event's own tables come back (an id can't take over another event's table).
      stmts.push(
        db
          .prepare(
            `INSERT INTO seat_table (id, wedding_id, event_id, name, shape, dir, length_pct, x, y, seats, sides) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT (id) DO UPDATE SET name = ?4, shape = ?5, dir = ?6, length_pct = ?7, x = ?8, y = ?9, seats = ?10, sides = ?11, deleted_at = NULL, version = version + 1
             WHERE seat_table.event_id = ?3`,
          )
          .bind(t.id, wid(c), ev, t.name, t.shape, t.dir, t.len, t.x, t.y, t.seats, (t as { sides?: number }).sides ?? 2),
      );
    }
    for (const t of loaded.view.tables) if (!keep.has(t.id)) stmts.push(db.prepare(`UPDATE seat_table SET deleted_at = ? WHERE id = ?`).bind(now, t.id));
    for (const a of snap.areas) stmts.push(db.prepare(`INSERT INTO seat_area (id, wedding_id, event_id, label, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), ev, a.label, a.x, a.y, a.w, a.h));
    for (const [pid, tid] of Object.entries(snap.seats)) {
      if (coming.has(pid) && keep.has(tid)) stmts.push(db.prepare(`INSERT INTO seat (person_id, event_id, table_id) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM seat_table WHERE id = ?3 AND event_id = ?2)`).bind(pid, ev, tid));
    }
    stmts.push(unseatEveryoneNotComing(db, ev));
    stmts.push(db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'seating.current', ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), c.get('user').id, v.key, JSON.stringify({ name: v.name }), now));
    await db.batch(stmts);
    return c.json((await load(c, v.key))!.view);
  });

  return app;
}

const MAX_VERSIONS = 30;

/** What guests see: the plan and who sits where (people ids -> table ids). */
export interface Snapshot {
  aspect: string;
  tables: { id: string; name: string; shape: string; dir: string; len: number; x: number; y: number; seats: number }[];
  areas: { label: string; x: number; y: number; w: number; h: number }[];
  seats: Record<string, string>;
}

/** How many tables, areas and seats differ between what's published and the saved draft. */
export function changesBetween(a: Snapshot, b: Snapshot): number {
  let n = 0;
  const key = (t: Snapshot['tables'][number]) => JSON.stringify([t.name, t.shape, t.dir, t.len, t.x, t.y, t.seats]);
  const at = new Map(a.tables.map((t) => [t.id, key(t)]));
  const bt = new Map(b.tables.map((t) => [t.id, key(t)]));
  for (const [id, k] of bt) if (at.get(id) !== k) n++;
  for (const id of at.keys()) if (!bt.has(id)) n++;
  if (JSON.stringify(a.areas) !== JSON.stringify(b.areas) || a.aspect !== b.aspect) n++;
  for (const id of new Set([...Object.keys(a.seats), ...Object.keys(b.seats)])) if (a.seats[id] !== b.seats[id]) n++;
  return n;
}

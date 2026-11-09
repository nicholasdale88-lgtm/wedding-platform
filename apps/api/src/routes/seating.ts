import { anyChanges, seatBaseline, seatChanges, seatStage, splitCircles, TABLE_SHAPES, type SeatBaseline, type SeatStage } from '@wp/shared';
import { hasFeature, needsUpgrade } from '../lib/plan';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJson, safeJson } from '../lib/security';
import { unseatEveryoneNotComing } from '../lib/seatingRules';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { servedAt } from '../lib/meals';

/**
 * Admin → Seating (/api/a/w/:wid/seating?event=<key>): the floor plan for one event. Tables and areas
 * are placed in % of the plan, so it looks the same at any size. Saving sends the whole layout and
 * who sits where, applied in one batch (If-Match: the wedding's version).
 *
 * Versions (/seating/versions): name a snapshot of the saved plan ("Family draft", "Final"), look back at
 * any of them, and nominate one as the current arrangement (it's copied into the working plan).
 *
 * Stage (/seating/stage): Draft → Replies coming in → Final → Published, worked out from the replies
 * (the couple can choose one instead). Each save keeps who was on the plan (a "baseline", in planner_doc
 * 'seat-baseline'), so the next visit can say who said yes, who can't come and who's new since.
 */

type C = Context<AdminEnv>;
/** The couple's own places in the seating (they're not people on an invitation). */
export const COUPLE_IDS = ['couple-1', 'couple-2'] as const;
const err = (c: C, status: 400 | 404 | 409 | 428, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;
const pct = z.number().min(0).max(100);

const Save = z
  .object({
    event: z.string().max(40),
    // The room's shape, and its size when bigger ("4 / 3 x2"); or measured in metres ("24 / 18 m").
    aspect: z.string().regex(/^(\d{1,2} \/ \d{1,2}( x(1\.5|2|3|4))?|\d{1,3}(\.5)? \/ \d{1,3}(\.5)? m)$/),
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
          /** Its real size in metres (diameter, side or length); null: the usual size for its shape. */
          size: z.number().min(0.4).max(40).nullable().default(null),
        }),
      )
      .max(120),
    areas: z.array(z.object({ label: z.string().trim().min(1).max(40), x: pct, y: pct, w: z.number().min(2).max(100), h: z.number().min(2).max(100) })).max(40),
    seats: z.record(z.string().max(60), z.string().uuid().nullable()),
    /** Which chair each guest has at their table (1 = the first); anyone left out takes the next free chair. */
    chairs: z.record(z.string().max(60), z.number().int().min(1).max(60)).default({}),
  })
  .strict();

/**
 * An event's seating, as saved (the draft) and as published to guests, with everyone invited to it. The
 * admin's seating page and a caterer's page both read it.
 *
 * The draft seats everyone invited who hasn't said no: guests still to reply can be pencilled in before
 * replies arrive. What guests are shown (`publishable`) has only the people who said yes, so nobody's
 * guide lists a table mate who may not come.
 */
export async function loadSeating(db: D1Database, weddingId: string, eventKey?: string) {
    const w = await db.prepare(`SELECT id, version, content, name1, name2 FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(weddingId).first<{ id: string; version: number; content: string | null; name1: string; name2: string }>();
    if (!w) return null;
    const { results: events } = await db
      .prepare(`SELECT id, key, name, has_seating, catered FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`)
      .bind(w.id)
      .all<{ id: string; key: string; name: string; has_seating: number; catered: number }>();
    const ev = events.find((e) => e.key === eventKey) ?? events.find((e) => e.has_seating) ?? events.find((e) => e.catered) ?? events[0];
    if (!ev) return null;
    const [plan, tables, areas, people, pub, vers, docs, sent, coupleSeats] = await db.batch([
      db.prepare(`SELECT aspect, image_key, current_version FROM seat_plan WHERE event_id = ?`).bind(ev.id),
      db.prepare(`SELECT id, name, shape, dir, length_pct AS len, x, y, seats, sides, size_m AS size FROM seat_table WHERE event_id = ? AND deleted_at IS NULL ORDER BY name`).bind(ev.id),
      db.prepare(`SELECT label, x, y, w, h FROM seat_area WHERE event_id = ? AND deleted_at IS NULL`).bind(ev.id),
      db.prepare(
        `SELECT p.id, p.invitation_id AS invitationId, p.idx, p.name, p.diet, (SELECT s.table_id FROM seat s WHERE s.person_id = p.id AND s.event_id = ?1) AS tableId,
                (SELECT s.chair FROM seat s WHERE s.person_id = p.id AND s.event_id = ?1) AS chair,
                i.party, i.side, i.relation, i.circles, p.party_role AS role,
                ie.event_id IS NOT NULL AS invited, r.attending, r.count
           FROM person p JOIN invitation i ON i.id = p.invitation_id
           LEFT JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = ?1
           LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ?1
          WHERE i.wedding_id = ?2 AND i.deleted_at IS NULL AND p.deleted_at IS NULL
          ORDER BY i.created_at, p.idx`,
      ).bind(ev.id, w.id),
      db.prepare(`SELECT snapshot, published_at FROM seat_publish WHERE event_id = ?`).bind(ev.id),
      db.prepare(`SELECT id, name, snapshot, created_at FROM seat_version WHERE event_id = ? ORDER BY created_at DESC`).bind(ev.id),
      db.prepare(`SELECT kind, data FROM planner_doc WHERE wedding_id = ? AND scope = ? AND kind IN ('seat-baseline', 'seat-stage')`).bind(w.id, ev.key),
      // Invitations are out once any text has gone, or anyone has opened theirs.
      db.prepare(
        `SELECT EXISTS (SELECT 1 FROM sms_out WHERE wedding_id = ?1 AND invitation_id IS NOT NULL AND status IN ('sent', 'delivered'))
             OR EXISTS (SELECT 1 FROM invitation WHERE wedding_id = ?1 AND opened_at IS NOT NULL AND deleted_at IS NULL) AS sent`,
      ).bind(w.id),
      db.prepare(`SELECT person_id AS id, table_id AS tableId, chair FROM seat WHERE event_id = ? AND person_id IN ('${COUPLE_IDS[0]}', '${COUPLE_IDS[1]}')`).bind(ev.id),
    ]);
    const versionRows = vers!.results as { id: string; name: string; snapshot: string; created_at: string }[];
    const tableIds = new Set((tables!.results as { id: string }[]).map((t) => t.id));
    const p = plan!.results[0] as { aspect: string; image_key: string | null; current_version: string | null } | undefined;
    type Row = { id: string; invitationId: string; idx: number; name: string; diet: string; tableId: string | null; chair: number | null; party: string; side: string; relation: string; circles: string; role: string; invited: number; attending: number | null; count: number | null };
    const guestRows = people!.results as Row[];
    // The couple are always in the seating (they aren't on their own guest list): two people, coming.
    const theirSeats = coupleSeats!.results as { id: string; tableId: string | null; chair: number | null }[];
    const couple: Row[] = [w.name1, w.name2].map((name, idx) => {
      const id = COUPLE_IDS[idx]!;
      const s = theirSeats.find((x) => x.id === id);
      return { id, invitationId: 'couple', idx, name: (name ?? '').trim() || (idx ? 'Partner two' : 'Partner one'), diet: '', tableId: s?.tableId ?? null, chair: s?.chair ?? null, party: 'The couple', side: idx ? 'p2' : 'p1', relation: '', circles: '', role: '', invited: 1, attending: 1, count: 2 };
    });
    const rows = [...couple, ...guestRows];
    // A yes is for the first N people on the invitation (N = the reply's count, as the overview counts them):
    // the others on it aren't coming, so they get no seat and are never shown to guests.
    const beyondCount = (x: Row) => x.attending === 1 && x.idx >= Math.max(1, x.count ?? 1);
    // A seat needs an invitation to this event and no "no" (still to reply is fine: pencilled in).
    const seatable = (x: Row) => !!x.invited && x.attending !== 0 && !beyondCount(x);
    const seatOf = (x: Row) => (seatable(x) && x.tableId && tableIds.has(x.tableId) ? x.tableId : null);
    const draft: Snapshot = {
      aspect: p?.aspect ?? '4 / 3',
      tables: tables!.results as Snapshot['tables'],
      areas: areas!.results as Snapshot['areas'],
      seats: Object.fromEntries(rows.filter(seatOf).map((x) => [x.id, seatOf(x)!])),
      chairs: Object.fromEntries(rows.filter((x) => seatOf(x) && x.chair).map((x) => [x.id, x.chair!])),
    };
    const yes = new Set(rows.filter((x) => x.invited && x.attending === 1 && !beyondCount(x)).map((x) => x.id));
    const publishable: Snapshot = {
      ...draft,
      seats: Object.fromEntries(Object.entries(draft.seats).filter(([id]) => yes.has(id))),
      chairs: Object.fromEntries(Object.entries(draft.chairs ?? {}).filter(([id]) => yes.has(id))),
    };
    const pubRow = pub!.results[0] as { snapshot: string; published_at: string } | undefined;
    const empty = { aspect: '', tables: [], areas: [], seats: {} } as unknown as Snapshot;
    const pubSnap = pubRow ? safeJson<Snapshot>(pubRow.snapshot, empty) : null;
    // Guests shown at a table who have since said no (or are no longer invited): their seat is empty now.
    const gone = pubSnap ? rows.filter((x) => pubSnap.seats[x.id] && !seatable(x)).map((x) => x.name) : [];
    const cur = versionRows.find((x) => x.id === p?.current_version);
    const versions = versionRows.map((x) => {
      const snap = safeJson<Snapshot>(x.snapshot, empty);
      return { id: x.id, name: x.name, at: x.created_at, tables: snap.tables.length, seated: Object.keys(snap.seats).length };
    });
    // Pencilled-in guests are never shown to guests, so they don't count as changes waiting to go live.
    const published = pubRow && pubSnap ? { at: pubRow.published_at, changes: changesBetween(pubSnap, publishable), saidNo: gone } : null;
    const served = await servedAt(db, w.id, ev);
    const asPerson = (x: Row) => ({ id: x.id, invitationId: x.invitationId, name: x.name, party: x.party, side: x.side ?? '', relation: x.relation ?? '', circles: splitCircles(x.circles), role: x.role, diet: x.diet, meal: (({ e, m, d }) => ({ e, m, d }))(served(x.id)), tableId: seatOf(x), chair: seatOf(x) ? (x.chair ?? null) : null, coming: x.attending === 1 });
    const list = guestRows.filter(seatable).map(asPerson);
    /** The couple: always in the seating, without being on their own guest list. */
    const coupleList = couple.map(asPerson);

    // Where the plan is in its life, and what changed since it was last saved.
    const doc = (kind: string) => (docs!.results as { kind: string; data: string }[]).find((d) => d.kind === kind)?.data;
    const baseline = safeJson<SeatBaseline | null>(doc('seat-baseline') ?? 'null', null);
    const chosen = safeJson<{ stage?: SeatStage } | null>(doc('seat-stage') ?? 'null', null)?.stage ?? null;
    const close = safeJson<{ invitation?: { rsvpClose?: unknown } }>(w.content ?? '{}', {}).invitation?.rsvpClose;
    const invitedRows = guestRows.filter((x) => x.invited);
    const facts = {
      sent: !!(sent!.results[0] as { sent: number } | undefined)?.sent,
      invited: invitedRows.length,
      replied: invitedRows.filter((x) => x.attending !== null).length,
      closed: typeof close === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(close) && close < new Date().toISOString().slice(0, 10),
      published: !!pubRow,
    };
    const changes = seatChanges(baseline, list);
    return {
      eventId: ev.id,
      draft,
      /** The draft as guests would see it: only people who said yes. */
      publishable,
      /** What guests were last shown (null: never published). */
      publishedPlan: pubSnap,
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
        tables: tables!.results as Snapshot['tables'],
        areas: areas!.results,
        people: list,
        couple: coupleList,
        stage: { auto: seatStage(facts), chosen, ...facts },
        /** Since the plan was last saved (null: never saved, or nothing changed). */
        sinceSave: baseline && anyChanges(changes) ? { at: baseline.at, ...changes } : null,
      },
    };
}

/** Remember who is on the plan now (after a save), so the next visit can say what changed since. */
export async function keepBaseline(db: D1Database, weddingId: string, eventKey: string) {
  const s = await loadSeating(db, weddingId, eventKey);
  if (!s) return null;
  const now = new Date().toISOString();
  const data = JSON.stringify(seatBaseline(now, s.view.people, s.view.tables));
  await db
    .prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?1, 'seat-baseline', ?2, ?3, 1, ?4) ON CONFLICT (wedding_id, kind, scope) DO UPDATE SET data = ?3, version = version + 1, updated_at = ?4`)
    .bind(weddingId, s.view.event.key, data, now)
    .run();
  return { ...s, view: { ...s.view, sinceSave: null } };
}

export function seatingRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const load = (c: C, eventKey?: string) => loadSeating(c.env.DB, wid(c), eventKey);
  // Seating comes with Essentials. Anyone can look (and see what they'd get); saving a plan, its versions,
  // its stage and publishing it need the plan. Deleting a version and "seen" are always allowed.
  app.use('*', async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'DELETE' || c.req.path.endsWith('/seen')) return next();
    if (!(await hasFeature(c.env.DB, wid(c), 'seating'))) return needsUpgrade(c, 'seating', true);
    return next();
  });

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
    const people = new Set([...cur.people, ...cur.couple].map((p) => p.id));
    // Everyone in the seating is invited and hasn't said no (still to reply is fine: pencilled in).
    for (const [pid, tid] of Object.entries(b.seats)) {
      if (!people.has(pid)) return err(c, 400, 'invalid', 'Someone in the seating is no longer coming. Reload and try again.');
      if (tid && !keep.has(tid)) return err(c, 400, 'invalid', 'A table in the seating no longer exists.');
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
            `INSERT INTO seat_table (id, wedding_id, event_id, name, shape, dir, length_pct, x, y, seats, sides, size_m) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT (id) DO UPDATE SET name = ?4, shape = ?5, dir = ?6, length_pct = ?7, x = ?8, y = ?9, seats = ?10, sides = ?11, size_m = ?12, deleted_at = NULL, version = version + 1`,
          )
          .bind(t.id, wid(c), ev, t.name, t.shape, t.dir, t.len, t.x, t.y, t.seats, t.sides, t.size),
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
          ? db
              .prepare(`INSERT INTO seat (person_id, event_id, table_id, chair) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (person_id, event_id) DO UPDATE SET table_id = ?3, chair = ?4`)
              .bind(pid, ev, tid, (b.chairs[pid] ?? 0) <= (b.tables.find((t) => t.id === tid)?.seats ?? 0) ? (b.chairs[pid] ?? null) : null)
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
    return c.json((await keepBaseline(db, wid(c), b.event))!.view);
  });

  /**
   * Stage: choose where the plan is (Draft, Replies coming in, Final, Published), or null to have it
   * worked out from the replies again. Only changes what the page suggests; the plan itself is untouched.
   */
  app.put('/stage', requireMember('owner', 'editor'), async (c) => {
    const body = z.object({ event: z.string().max(40), stage: z.enum(['draft', 'replies', 'final', 'published']).nullable() }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose a stage.');
    const loaded = await load(c, body.data.event);
    if (!loaded || loaded.view.event.key !== body.data.event) return err(c, 404, 'not_found', 'That event no longer exists.');
    const db = c.env.DB;
    await (body.data.stage
      ? db
          .prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?1, 'seat-stage', ?2, ?3, 1, ?4) ON CONFLICT (wedding_id, kind, scope) DO UPDATE SET data = ?3, version = version + 1, updated_at = ?4`)
          .bind(wid(c), body.data.event, JSON.stringify({ stage: body.data.stage }), new Date().toISOString())
      : db.prepare(`DELETE FROM planner_doc WHERE wedding_id = ? AND kind = 'seat-stage' AND scope = ?`).bind(wid(c), body.data.event)
    ).run();
    return c.json((await load(c, body.data.event))!.view);
  });

  /** "Seen": the changes since the last save are noted without saving the plan (the summary clears). */
  app.post('/seen', requireMember('owner', 'editor'), async (c) => {
    const body = z.object({ event: z.string().max(40) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose an event.');
    const s = await keepBaseline(c.env.DB, wid(c), body.data.event);
    if (!s || s.view.event.key !== body.data.event) return err(c, 404, 'not_found', 'That event no longer exists.');
    return c.json(s.view);
  });

  /**
   * Publish: the saved plan becomes what guests see (guides and the night-before text's {table}).
   * Only guests who said yes are in it (pencilled-in guests appear once they say yes and it's published
   * again). Publish again after any change.
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
        .bind(loaded.eventId, JSON.stringify(loaded.publishable), now, c.get('user').id),
      db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'seating.publish', ?, ?, ?)`).bind(
        crypto.randomUUID(), wid(c), c.get('user').id, body.data.event, JSON.stringify({ tables: loaded.publishable.tables.length, seated: Object.keys(loaded.publishable.seats).length }), now,
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

  /**
   * "Suggest a plan from who knows who": the suggested seats (worked out on the couple's screen) kept as a
   * new version beside the saved plan. Nothing else changes: the current arrangement stays current until
   * the couple makes this one current (or deletes it).
   */
  app.post('/versions/suggest', requireMember('owner', 'editor'), async (c) => {
    const body = z
      .object({ event: z.string().max(40), name: VersionName, seats: z.record(z.string().max(60), z.string().max(60).nullable()) })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', body.error.issues[0]?.message ?? 'Check the suggestion.');
    const loaded = await load(c, body.data.event);
    if (!loaded || loaded.view.event.key !== body.data.event) return err(c, 404, 'not_found', 'That event no longer exists.');
    if (loaded.view.versions.length >= MAX_VERSIONS) return err(c, 400, 'too_many', `Up to ${MAX_VERSIONS} versions per event. Delete an old one first.`);
    const people = new Set([...loaded.view.people, ...loaded.view.couple].map((p) => p.id));
    const tables = new Set(loaded.draft.tables.map((t) => t.id));
    const seats: Record<string, string> = {};
    for (const [pid, tid] of Object.entries(body.data.seats)) {
      if (!tid) continue;
      if (!people.has(pid) || !tables.has(tid)) return err(c, 400, 'invalid', 'The plan changed while that was worked out. Try again.');
      seats[pid] = tid;
    }
    const db = c.env.DB;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO seat_version (id, wedding_id, event_id, name, snapshot, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, wid(c), loaded.eventId, body.data.name, JSON.stringify({ ...loaded.draft, seats, chairs: Object.fromEntries(Object.entries(loaded.draft.chairs ?? {}).filter(([pid]) => seats[pid] === loaded.draft.seats[pid])) }), now, c.get('user').id),
      db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'seating.suggest', ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), c.get('user').id, body.data.event, JSON.stringify({ name: body.data.name, seated: Object.keys(seats).length }), now),
    ]);
    return c.json({ ...(await load(c, body.data.event))!.view, created: id });
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
   * Guests who've since said no, or are no longer invited, aren't seated; publish to show guests.
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
    const coming = new Set(loaded.view.people.map((p) => p.id)); // invited and not said no
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
            `INSERT INTO seat_table (id, wedding_id, event_id, name, shape, dir, length_pct, x, y, seats, sides, size_m) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT (id) DO UPDATE SET name = ?4, shape = ?5, dir = ?6, length_pct = ?7, x = ?8, y = ?9, seats = ?10, sides = ?11, size_m = ?12, deleted_at = NULL, version = version + 1
             WHERE seat_table.event_id = ?3`,
          )
          .bind(t.id, wid(c), ev, t.name, t.shape, t.dir, t.len, t.x, t.y, t.seats, t.sides ?? 2, t.size ?? null),
      );
    }
    for (const t of loaded.view.tables) if (!keep.has(t.id)) stmts.push(db.prepare(`UPDATE seat_table SET deleted_at = ? WHERE id = ?`).bind(now, t.id));
    for (const a of snap.areas) stmts.push(db.prepare(`INSERT INTO seat_area (id, wedding_id, event_id, label, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), ev, a.label, a.x, a.y, a.w, a.h));
    for (const [pid, tid] of Object.entries(snap.seats)) {
      const chair = snap.chairs?.[pid];
      if (coming.has(pid) && keep.has(tid))
        stmts.push(
          db
            .prepare(`INSERT INTO seat (person_id, event_id, table_id, chair) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM seat_table WHERE id = ?3 AND event_id = ?2)`)
            .bind(pid, ev, tid, Number.isInteger(chair) && chair! >= 1 && chair! <= 60 ? chair : null),
        );
    }
    stmts.push(unseatEveryoneNotComing(db, ev));
    stmts.push(db.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'seating.current', ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), c.get('user').id, v.key, JSON.stringify({ name: v.name }), now));
    await db.batch(stmts);
    return c.json((await keepBaseline(db, wid(c), v.key))!.view);
  });

  return app;
}

const MAX_VERSIONS = 30;

/** What guests see: the plan and who sits where (people ids -> table ids). */
export interface Snapshot {
  aspect: string;
  tables: { id: string; name: string; shape: string; dir: string; len: number; x: number; y: number; seats: number; sides?: number; size?: number | null }[];
  areas: { label: string; x: number; y: number; w: number; h: number }[];
  seats: Record<string, string>;
  /** Which chair each guest has at their table (1 = the first). Older plans have none: chairs fill in order. */
  chairs?: Record<string, number>;
}

/** How many tables, areas and seats differ between what's published and the saved draft. */
export function changesBetween(a: Snapshot, b: Snapshot): number {
  let n = 0;
  const key = (t: Snapshot['tables'][number]) => JSON.stringify([t.name, t.shape, t.dir, t.len, t.x, t.y, t.seats, t.sides ?? 2, t.size ?? null]);
  const at = new Map(a.tables.map((t) => [t.id, key(t)]));
  const bt = new Map(b.tables.map((t) => [t.id, key(t)]));
  for (const [id, k] of bt) if (at.get(id) !== k) n++;
  for (const id of at.keys()) if (!bt.has(id)) n++;
  if (JSON.stringify(a.areas) !== JSON.stringify(b.areas) || a.aspect !== b.aspect) n++;
  for (const id of new Set([...Object.keys(a.seats), ...Object.keys(b.seats)])) if (a.seats[id] !== b.seats[id] || (a.chairs?.[id] ?? null) !== (b.chairs?.[id] ?? null)) n++;
  return n;
}

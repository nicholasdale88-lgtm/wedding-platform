import { PartySetup, randomToken, splitDiet, toE164 } from '@wp/shared';
import { clearDietIfDeclinedAll, releaseShuttlesIfDeclined, unseatIfNotComing } from '../lib/seatingRules';
import { MAX_IMPORT, readJson } from '../lib/security';
import { needsUpgrade, roomFor, weddingPlan } from '../lib/plan';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { loadWedding } from '../admin/data';
import { buildOverview } from '../admin/overview';
import type { Env } from '../env';
import { estimate, sendNow, type EngineDeps } from '../sms/engine';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { plannerNeedsYou } from './planner';

/**
 * Per-wedding admin API (/api/a/w/:wid/...). Every route needs a session and membership;
 * writes need owner or editor. Edits to an invitation send If-Match: <version> and get 409
 * if someone else changed it first ("Updated elsewhere, reloaded").
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 428, code: string, message: string) => c.json({ error: { code, message } }, status);
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const wid = (c: C) => c.req.param('wid')!;

const GuestPatch = z
  .object({
    people: z.array(z.string().trim().max(120)).min(1).max(30),
    phone: z.string().max(40).nullable(),
    seatsHeld: z.number().int().min(1).max(60),
    party: z.string().trim().max(60),
    invited: z.array(z.string()).max(20),
    table: z.string().trim().max(40).nullable(),
  })
  .partial()
  .strict();

const RsvpPut = z
  .object({
    events: z.record(z.object({ attending: z.boolean().nullable(), answers: z.record(z.string().max(200)).optional() })),
    count: z.number().int().min(1).max(60).optional(),
    diet: z.string().max(500).optional(),
    message: z.string().max(1000).optional(),
  })
  .strict();

const AdminLook = z
  .object({ palette: z.enum(['invitation', 'sage', 'eucalyptus', 'navy', 'blush', 'terracotta', 'charcoal']), eventColours: z.boolean(), large: z.boolean() })
  .partial()
  .strict();

export function adminRoutes(deps: (env: Env) => EngineDeps) {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');

  const audit = (c: C, action: string, target: string, detail?: unknown) =>
    c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id(), wid(c), c.get('user').id, action, target, detail === undefined ? null : JSON.stringify(detail), now());

  /** Bump the version if it matches; false means someone else saved first (or it doesn't exist). */
  async function claimVersion(c: C, invitationId: string): Promise<'ok' | 'missing' | 'conflict' | 'no-version'> {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return 'no-version';
    const r = await c.env.DB.prepare(
      `UPDATE invitation SET version = version + 1, updated_at = ? WHERE id = ? AND wedding_id = ? AND version = ? AND deleted_at IS NULL`,
    )
      .bind(now(), invitationId, wid(c), v)
      .run();
    if (r.meta.changes) return 'ok';
    const exists = await c.env.DB.prepare(`SELECT 1 FROM invitation WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(invitationId, wid(c)).first();
    return exists ? 'conflict' : 'missing';
  }
  const versionError = (c: C, r: 'missing' | 'conflict' | 'no-version') =>
    r === 'missing'
      ? err(c, 404, 'not_found', 'That guest no longer exists.')
      : r === 'conflict'
        ? err(c, 409, 'conflict', 'Updated elsewhere, reloaded.')
        : err(c, 428, 'version_required', 'Reload and try again.');

  async function guestJson(c: C, guestId: string) {
    const data = await loadWedding(c.env.DB, wid(c));
    const g = data?.guests.find((x) => x.id === guestId);
    if (!data || !g) return null;
    const row = await c.env.DB.prepare(`SELECT token FROM invitation WHERE id = ?`).bind(guestId).first<{ token: string }>();
    const { results: sms } = await c.env.DB.prepare(
      `SELECT COALESCE(c.name, CASE o.kind WHEN 'reply' THEN 'Reply to their text' ELSE 'Text' END) AS name,
              COALESCE(o.sent_at, o.created_at) AS at, o.status
         FROM sms_out o LEFT JOIN campaign c ON c.id = o.campaign_id
        WHERE o.invitation_id = ? AND o.status != 'cancelled' ORDER BY at DESC LIMIT 50`,
    )
      .bind(guestId)
      .all<{ name: string; at: string; status: string }>();
    const base = (c.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
    // A guest's link lets anyone answer as them: owners and editors only (a viewer only reads).
    const link = c.get('role') === 'viewer' ? '' : `${base}/w/${data.wedding.slug}/?g=${row!.token}`;
    return { guest: g, link, sms, events: data.events, campaigns: data.campaigns.map(({ id, name }) => ({ id, name })) };
  }

  app.get('/overview', async (c) => {
    const data = await loadWedding(c.env.DB, wid(c));
    if (!data) return err(c, 404, 'not_found', 'Wedding not found.');
    const w = data.wedding;
    const now = new Date();
    const ov = buildOverview(data, now, c.req.query('event') || undefined);
    // The planner lives with the first event: its reminders show in Account and in that event.
    const first = data.events[0];
    if (first && (!ov.focus || ov.focus === first.key)) {
      ov.needsYou.push(...(await plannerNeedsYou(c.env.DB, wid(c), { key: first.key, starts_at: first.startsAt }, now, w.timezone).catch(() => [])));
    }
    // What the wedding party's two sides are called (the menu shows them under Wedding party).
    const setupRow = await c.env.DB.prepare(`SELECT data FROM planner_doc WHERE wedding_id = ? AND kind = 'party-setup' AND scope = ''`).bind(wid(c)).first<{ data: string }>();
    let setup = PartySetup.parse({});
    try {
      setup = PartySetup.parse(setupRow ? JSON.parse(setupRow.data) : {});
    } catch {
      /* the defaults */
    }
    return c.json({
      wedding: {
        id: w.id,
        slug: w.slug,
        name1: w.name1,
        name2: w.name2,
        monogram: w.monogram,
        theme: w.theme,
        timezone: w.timezone,
        adminName: (w.content.adminName as string | undefined) ?? '',
        adminLook: AdminLook.safeParse(w.content.adminLook ?? {}).data ?? {},
        // What this wedding's plan includes (the admin shows Upgrade where it doesn't).
        plan: await weddingPlan(c.env.DB, w.id),
        planRequested: (w.content.planRequested as string | undefined) ?? '',
        // Private: its pages open only with each guest's own link.
        private: w.content.private === true,
      },
      ...ov,
      partySides: { p1: setup.p1, p2: setup.p2 },
    });
  });

  /** Account → Admin look: the admin's colours for everyone who runs this wedding. */
  app.put('/look', writer, async (c) => {
    const body = AdminLook.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose a look.');
    await c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.adminLook', json(?)), updated_at = ? WHERE id = ? AND json_valid(content)`)
      .bind(JSON.stringify(body.data), new Date().toISOString(), wid(c))
      .run();
    return c.json({ ok: true, look: body.data });
  });

  /** Account → Admin look → Name: what the admin's header calls this wedding ('' shows the couple's names). */
  app.put('/admin-name', writer, async (c) => {
    const body = z.object({ name: z.string().trim().max(80) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Use up to 80 characters.');
    await c.env.DB.prepare(`UPDATE wedding SET content = json_set(content, '$.adminName', ?), updated_at = ? WHERE id = ? AND json_valid(content)`)
      .bind(body.data.name, new Date().toISOString(), wid(c))
      .run();
    return c.json({ ok: true, name: body.data.name });
  });

  app.get('/guests', async (c) => {
    const data = await loadWedding(c.env.DB, wid(c));
    if (!data) return err(c, 404, 'not_found', 'Wedding not found.');
    // Each guest's personal invitation link (for exports and sending by WhatsApp or Messenger).
    const base = (c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '');
    const { results } = await c.env.DB.prepare(`SELECT id, token FROM invitation WHERE wedding_id = ? AND deleted_at IS NULL`).bind(wid(c)).all<{ id: string; token: string }>();
    const links = c.get('role') === 'viewer' ? {} : Object.fromEntries(results.map((r) => [r.id, `${base}/w/${data.wedding.slug}/?g=${r.token}`]));
    return c.json({ events: data.events, guests: data.guests, links });
  });

  app.get('/guests/:id', async (c) => {
    const g = await guestJson(c, c.req.param('id'));
    return g ? c.json(g) : err(c, 404, 'not_found', 'That guest no longer exists.');
  });

  app.post('/guests', writer, async (c) => {
    const w = wid(c);
    if (!(await roomFor(c.env.DB, w, 1))) return needsUpgrade(c, 'unlimitedGuests');
    const invId = id();
    const t = now();
    const { results: all } = await c.env.DB.prepare(`SELECT id, key FROM event WHERE wedding_id = ? AND deleted_at IS NULL`).bind(w).all<{ id: string; key: string }>();
    // Added from inside an event's section: invited to that event only. Otherwise to every event.
    const body = z.object({ invited: z.array(z.string().max(40)).max(20).optional() }).safeParse(await readJson(c.req.raw).catch(() => ({})));
    const wanted = body.success ? body.data.invited : undefined;
    const events = wanted?.length ? all.filter((e) => wanted.includes(e.key)) : all;
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO invitation (id, wedding_id, token, seats_held, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`).bind(invId, w, randomToken(), t, t),
      c.env.DB.prepare(`INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, 0, '')`).bind(id(), invId),
      ...events.map((e) => c.env.DB.prepare(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`).bind(invId, e.id)),
      audit(c, 'guest.add', invId),
    ]);
    return c.json(await guestJson(c, invId), 201);
  });

  /**
   * Import from a spreadsheet. Every row is checked first; anyone already on the list (same mobile or
   * same main name) is skipped, never doubled. ?dry=1 reports what would happen without adding anyone.
   */
  app.post('/guests/import', writer, async (c) => {
    const Row = z.object({
      people: z.array(z.string().trim().max(120)).max(12),
      phone: z.string().max(40).optional(),
      seats: z.number().int().min(1).max(60).optional(),
      party: z.string().trim().max(60).optional(),
      invited: z.array(z.string().max(40)).max(20).optional(),
    });
    const body = z.object({ rows: z.array(Row).min(1).max(1000) }).strict().safeParse(await readJson(c.req.raw, MAX_IMPORT));
    if (!body.success) return err(c, 400, 'invalid', 'That file could not be read. Up to 1,000 rows at a time.');
    const w = wid(c);
    const db = c.env.DB;
    const [{ results: events }, { results: existing }] = await Promise.all([
      db.prepare(`SELECT id, key FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(w).all<{ id: string; key: string }>(),
      db
        .prepare(
          `SELECT i.phone, (SELECT p.name FROM person p WHERE p.invitation_id = i.id AND p.idx = 0) AS name
             FROM invitation i WHERE i.wedding_id = ? AND i.deleted_at IS NULL`,
        )
        .bind(w)
        .all<{ phone: string | null; name: string | null }>(),
    ]);
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const phones = new Set(existing.map((e) => e.phone).filter(Boolean));
    const names = new Set(existing.map((e) => norm(e.name ?? '')).filter(Boolean));
    const byKey = new Map(events.map((e) => [e.key, e.id]));

    const ok: { people: string[]; phone: string | null; seats: number; party: string; eventIds: string[] }[] = [];
    const skipped: { row: number; name: string; reason: string }[] = [];
    const problems: { row: number; name: string; reason: string }[] = [];
    body.data.rows.forEach((r, i) => {
      const row = i + 1;
      const people = r.people.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const name = people[0] ?? '';
      if (!name) return problems.push({ row, name: '', reason: 'No name' });
      const phone = r.phone && r.phone.trim() ? toE164(r.phone) : null;
      if (r.phone && r.phone.trim() && !phone) return problems.push({ row, name, reason: `Mobile "${r.phone}" doesn't look Australian` });
      const unknown = (r.invited ?? []).filter((k) => !byKey.has(k));
      if (unknown.length) return problems.push({ row, name, reason: `Unknown event "${unknown[0]}"` });
      if ((phone && phones.has(phone)) || names.has(norm(name))) return skipped.push({ row, name, reason: 'Already on your list' });
      if (phone) phones.add(phone);
      names.add(norm(name));
      ok.push({ people, phone, seats: r.seats ?? people.length, party: r.party ?? '', eventIds: (r.invited?.length ? r.invited : events.map((e) => e.key)).map((k) => byKey.get(k)!) });
    });

    if (c.req.query('dry') || problems.length) {
      const refused = problems.length > 0 && !c.req.query('dry');
      return c.json(
        { added: 0, wouldAdd: ok.length, skipped, problems, dry: true, ...(refused ? { error: { code: 'problems', message: `${problems.length} ${problems.length === 1 ? 'row needs' : 'rows need'} fixing first.` } } : {}) },
        refused ? 400 : 200,
      );
    }

    if (!(await roomFor(db, w, ok.reduce((n, g) => n + g.people.length, 0)))) return needsUpgrade(c, 'unlimitedGuests');
    const t = now();
    // D1 batches are all-or-nothing and up to ~100 statements: pack whole guests, never half of one.
    // A batch that fails is retried once (each batch is all-or-nothing). If it still fails, say exactly how many
    // were added: running the import again adds the rest and skips everyone already added.
    let added = 0;
    let pending = 0;
    const commit = async (stmts: D1PreparedStatement[], guests: number) => {
      try {
        await db.batch(stmts);
      } catch {
        await db.batch(stmts);
      }
      added += guests;
    };
    let batch: D1PreparedStatement[] = [];
    try {
    for (const g of ok) {
      const invId = id();
      const one = [
        db.prepare(`INSERT INTO invitation (id, wedding_id, token, phone, seats_held, party, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(invId, w, randomToken(), g.phone, Math.max(g.seats, g.people.length), g.party, t, t),
        ...g.people.map((p, idx) => db.prepare(`INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, ?, ?)`).bind(id(), invId, idx, p)),
        ...g.eventIds.map((e) => db.prepare(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`).bind(invId, e)),
      ];
      if (batch.length + one.length > 90) {
        await commit(batch, pending);
        batch = [];
        pending = 0;
      }
      batch.push(...one);
      pending++;
    }
    if (batch.length) await commit(batch, pending);
    } catch {
      await audit(c, 'guest.import', w, { added, skipped: skipped.length, stopped: true }).run().catch(() => {});
      return c.json(
        { error: { code: 'import_partial', message: `Added ${added} of ${ok.length} guests before the connection dropped. Run the same import again to add the rest: nobody is added twice.` }, added },
        503,
      );
    }
    await audit(c, 'guest.import', w, { added, skipped: skipped.length }).run();
    return c.json({ added, wouldAdd: ok.length, skipped, problems: [], dry: false });
  });

  app.patch('/guests/:id', writer, async (c) => {
    const body = GuestPatch.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Check the details and try again.');
    const p = body.data;
    const invId = c.req.param('id');

    let phone: string | null | undefined;
    if (p.phone !== undefined) {
      phone = p.phone && p.phone.trim() ? toE164(p.phone) : null;
      if (p.phone && p.phone.trim() && !phone) {
        return err(c, 400, 'bad_mobile', 'This mobile looks wrong. Australian mobiles start with 04 and have 10 digits.');
      }
    }
    let tableId: string | null | undefined;
    let tableEvent = '';
    if (p.table !== undefined) {
      tableId = null;
      if (p.table) {
        const t = await c.env.DB.prepare(
          `SELECT t.id, t.event_id, e.name AS event,
                  EXISTS (SELECT 1 FROM rsvp r JOIN invite_event ie ON ie.invitation_id = r.invitation_id AND ie.event_id = r.event_id
                           WHERE r.invitation_id = ? AND r.event_id = t.event_id AND r.attending = 1) AS coming
             FROM seat_table t JOIN event e ON e.id = t.event_id
            WHERE t.wedding_id = ? AND t.deleted_at IS NULL AND lower(t.name) = lower(?) ORDER BY e.has_seating DESC, e.sort LIMIT 1`,
        )
          .bind(invId, wid(c), p.table)
          .first<{ id: string; event_id: string; event: string; coming: number }>();
        if (!t) return err(c, 400, 'no_table', `There's no table called "${p.table}" yet. Add it in Seating.`);
        // Same rule as Seating: only guests who have said yes to that event get a table.
        if (!t.coming) return err(c, 400, 'not_coming', `They haven't said yes to the ${t.event} yet, so they can't have a table. Record their RSVP first.`);
        tableId = t.id;
        tableEvent = t.event_id;
      }
    }

    const v = await claimVersion(c, invId);
    if (v !== 'ok') return versionError(c, v);

    const db = c.env.DB;
    const stmts: D1PreparedStatement[] = [];
    if (phone !== undefined) stmts.push(db.prepare(`UPDATE invitation SET phone = ? WHERE id = ?`).bind(phone, invId));
    if (p.seatsHeld !== undefined) stmts.push(db.prepare(`UPDATE invitation SET seats_held = ? WHERE id = ?`).bind(p.seatsHeld, invId));
    if (p.party !== undefined) stmts.push(db.prepare(`UPDATE invitation SET party = ? WHERE id = ?`).bind(p.party, invId));
    if (p.people) {
      const names = p.people.map((n, i) => n || (i === 0 ? '' : 'Guest'));
      names.forEach((name, idx) =>
        stmts.push(
          db
            .prepare(
              `INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, ?, ?)
               ON CONFLICT (invitation_id, idx) DO UPDATE SET name = excluded.name, deleted_at = NULL, version = version + 1`,
            )
            .bind(id(), invId, idx, name),
        ),
      );
      stmts.push(db.prepare(`UPDATE person SET deleted_at = ? WHERE invitation_id = ? AND idx >= ? AND deleted_at IS NULL`).bind(now(), invId, names.length));
    }
    if (p.invited) {
      stmts.push(db.prepare(`DELETE FROM invite_event WHERE invitation_id = ?`).bind(invId));
      stmts.push(
        db
          .prepare(
            `INSERT INTO invite_event (invitation_id, event_id)
             SELECT ?, id FROM event WHERE wedding_id = ? AND deleted_at IS NULL AND key IN (SELECT value FROM json_each(?))`,
          )
          .bind(invId, wid(c), JSON.stringify(p.invited)),
      );
    }
    // A table belongs to one event: the party sits there for that event (no table = no seats at all).
    if (tableId === null) stmts.push(db.prepare(`DELETE FROM seat WHERE person_id IN (SELECT id FROM person WHERE invitation_id = ?)`).bind(invId));
    if (tableId) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO seat (person_id, event_id, table_id) SELECT id, ?2, ?3 FROM person WHERE invitation_id = ?1 AND deleted_at IS NULL
             ON CONFLICT (person_id, event_id) DO UPDATE SET table_id = excluded.table_id`,
          )
          .bind(invId, tableEvent, tableId),
      );
    }
    if (p.invited || tableId !== undefined) stmts.push(unseatIfNotComing(db, invId)); // not invited any more, or declined
    stmts.push(audit(c, 'guest.edit', invId, p));
    await db.batch(stmts);
    return c.json(await guestJson(c, invId));
  });

  /** The couple records or corrects a reply (by phone, in person, on paper). */
  app.put('/guests/:id/rsvp', writer, async (c) => {
    const body = RsvpPut.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Check the reply and try again.');
    const r = body.data;
    const invId = c.req.param('id');
    const v = await claimVersion(c, invId);
    if (v !== 'ok') return versionError(c, v);

    const db = c.env.DB;
    const t = now();
    const { results: events } = await db
      .prepare(`SELECT e.id, e.key FROM invite_event ie JOIN event e ON e.id = ie.event_id WHERE ie.invitation_id = ? AND e.deleted_at IS NULL ORDER BY e.sort`)
      .bind(invId)
      .all<{ id: string; key: string }>();
    const stmts: D1PreparedStatement[] = [];
    events.forEach((e, i) => {
      const ev = r.events[e.key];
      if (!ev && r.count === undefined && r.message === undefined) return;
      stmts.push(
        db
          .prepare(
            `INSERT INTO rsvp (invitation_id, event_id, attending, count, answers, message, via, updated_at)
             VALUES (?1, ?2, ?3, COALESCE(?4, 1), COALESCE(?5, '{}'), COALESCE(?6, ''), 'admin', ?7)
             ON CONFLICT (invitation_id, event_id) DO UPDATE SET
               attending = CASE WHEN ?8 THEN ?3 ELSE attending END,
               count = COALESCE(?4, count),
               answers = COALESCE(?5, answers),
               message = COALESCE(?6, message),
               via = 'admin',
               -- the reply time moves only when the answer itself changes (it drives the thank-you text)
               updated_at = CASE WHEN ?8 AND attending IS NOT ?3 THEN ?7 ELSE updated_at END`,
          )
          .bind(
            invId, e.id, ev ? (ev.attending === null ? null : ev.attending ? 1 : 0) : null, r.count ?? null,
            ev?.answers ? JSON.stringify(ev.answers) : null, i === 0 ? (r.message ?? null) : null, t, ev ? 1 : 0,
          ),
      );
    });
    if (r.diet !== undefined) {
      const { results: people } = await db.prepare(`SELECT idx, name FROM person WHERE invitation_id = ? AND deleted_at IS NULL ORDER BY idx`).bind(invId).all<{ idx: number; name: string }>();
      // One note for the invitation, split so each person gets their own part (splitDiet).
      const parts = splitDiet(r.diet, people.map((p) => p.name));
      people.forEach((p, i) => stmts.push(db.prepare(`UPDATE person SET diet = ? WHERE invitation_id = ? AND idx = ? AND deleted_at IS NULL`).bind(parts[i] ?? '', invId, p.idx)));
    }
    stmts.push(unseatIfNotComing(db, invId)); // declined: their seat is freed
    stmts.push(releaseShuttlesIfDeclined(db, invId)); // and their shuttle seats
    stmts.push(clearDietIfDeclinedAll(db, invId)); // not coming to anything: no dietary on any list
    stmts.push(audit(c, 'guest.rsvp', invId, r));
    await db.batch(stmts);
    return c.json(await guestJson(c, invId));
  });

  app.delete('/guests/:id', writer, async (c) => {
    const invId = c.req.param('id');
    const r = await c.env.DB.prepare(`UPDATE invitation SET deleted_at = ?, version = version + 1 WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`)
      .bind(now(), invId, wid(c))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'That guest no longer exists.');
    // Texts waiting to go to them don't (ones already handed to the provider can't be recalled).
    await c.env.DB.prepare(`UPDATE sms_out SET status = 'cancelled', error = 'Guest removed' WHERE invitation_id = ? AND status = 'queued' AND batch_key IS NULL`).bind(invId).run();
    await audit(c, 'guest.remove', invId).run();
    return c.json({ ok: true });
  });

  app.post('/guests/:id/restore', writer, async (c) => {
    const invId = c.req.param('id');
    const r = await c.env.DB.prepare(`UPDATE invitation SET deleted_at = NULL, version = version + 1 WHERE id = ? AND wedding_id = ? AND deleted_at IS NOT NULL`)
      .bind(invId, wid(c))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'Nothing to restore.');
    await audit(c, 'guest.restore', invId).run();
    return c.json(await guestJson(c, invId));
  });

  /** Dietary → meals: what the kitchen serves this person, course by course (blank = set menu). */
  app.put('/people/:pid/meal', writer, async (c) => {
    const body = z
      .object({ entree: z.string().trim().max(200), main: z.string().trim().max(200), dessert: z.string().trim().max(200) })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Keep each course under 200 characters.');
    const pid = c.req.param('pid');
    const r = await c.env.DB.prepare(
      `UPDATE person SET meal_entree = ?, meal_main = ?, meal_dessert = ?, version = version + 1
        WHERE id = ? AND deleted_at IS NULL AND invitation_id IN (SELECT id FROM invitation WHERE wedding_id = ?)`,
    )
      .bind(body.data.entree, body.data.main, body.data.dessert, pid, wid(c))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'Guest not found.');
    await audit(c, 'meal.set', pid, body.data).run();
    return c.json({ ok: true });
  });

  /** "Send now" from the guest drawer: one text to this guest. Shows count and cost first via ?dry=1. */
  app.post('/guests/:id/send', writer, async (c) => {
    const body = z.object({ campaignId: z.string() }).safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose a message.');
    const d = deps(c.env);
    const invId = c.req.param('id');
    try {
      if (c.req.query('dry')) return c.json(await estimate(d, wid(c), body.data.campaignId, [invId]));
      const res = await sendNow(d, wid(c), body.data.campaignId, [invId]);
      await audit(c, 'sms.send-one', invId, { campaignId: body.data.campaignId, sent: res.sent }).run();
      return c.json(res);
    } catch (e) {
      return err(c, 400, 'send_failed', (e as Error).message);
    }
  });

  return app;
}

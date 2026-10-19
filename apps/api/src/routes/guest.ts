import { attachDiet, dropControls, GUIDE_PAGE, guidesOf, InvitationContent, isToken, textsFor } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { imageType } from '../lib/images';
import { MAX_PHOTO, readBytes, readJson } from '../lib/security';
import { forecastFor } from '../lib/weather';

/**
 * Guest-facing API (/api/p/:slug/...). No sign-in: the private link token identifies the invitation.
 * Returns only that invitation's own details, and only content for the events it is invited to.
 */

type GEnv = { Bindings: Env };
type C = Context<GEnv>;
const err = (c: C, status: 400 | 404 | 413 | 415 | 429 | 503, code: string, message: string) => c.json({ error: { code, message } }, status);
const json = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};
/** The wedding's pictures by slot ("lookout"), shared by every guest page. */
const imagesOf = (content: Record<string, unknown>) => {
  const inv = InvitationContent.safeParse(content.invitation ?? {});
  return (inv.success && inv.data.images) || {};
};
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

interface WeddingRow {
  id: string; slug: string; name1: string; name2: string; monogram: string; theme: string; timezone: string; content: string; guide: string; music_key: string | null;
}
interface EventRow { id: string; key: string; name: string; starts_at: string; sort: number; questions: string }

async function wedding(c: C) {
  return c.env.DB.prepare(`SELECT id, slug, name1, name2, monogram, theme, timezone, content, guide, music_key FROM wedding WHERE slug = ? AND deleted_at IS NULL`)
    .bind(c.req.param('slug'))
    .first<WeddingRow>();
}

/** The invitation as its guest sees it. */
async function invitationJson(db: D1Database, invId: string, events: EventRow[]) {
  const [inv, people, invites, rsvps] = await db.batch([
    db.prepare(`SELECT id, token, seats_held FROM invitation WHERE id = ? AND deleted_at IS NULL`).bind(invId),
    db.prepare(`SELECT idx, name, diet FROM person WHERE invitation_id = ? AND deleted_at IS NULL ORDER BY idx`).bind(invId),
    db.prepare(`SELECT event_id FROM invite_event WHERE invitation_id = ?`).bind(invId),
    db.prepare(`SELECT event_id, attending, count, answers, message, updated_at FROM rsvp WHERE invitation_id = ?`).bind(invId),
  ]);
  const i = inv!.results[0] as { id: string; token: string; seats_held: number } | undefined;
  if (!i) return null;
  const invitedIds = new Set((invites!.results as { event_id: string }[]).map((x) => x.event_id));
  const byEvent = new Map((rsvps!.results as { event_id: string; attending: number | null; count: number; answers: string; message: string; updated_at: string }[]).map((r) => [r.event_id, r]));
  const rsvp: Record<string, { attending: boolean | null; count: number; answers: Record<string, string> }> = {};
  let message = '';
  let repliedAt: string | null = null;
  for (const e of events) {
    const r = byEvent.get(e.id);
    if (!invitedIds.has(e.id) || !r) continue;
    rsvp[e.key] = { attending: r.attending === null ? null : !!r.attending, count: r.count, answers: json(r.answers, {}) };
    if (r.message && !message) message = r.message;
    if (r.attending !== null && (!repliedAt || r.updated_at > repliedAt)) repliedAt = r.updated_at;
  }
  return {
    token: i.token,
    people: (people!.results as { idx: number; name: string; diet: string }[]).map((p) => ({ idx: p.idx, name: p.name, diet: p.diet })),
    seatsHeld: i.seats_held,
    invited: events.filter((e) => invitedIds.has(e.id)).map((e) => e.key),
    rsvp,
    message,
    repliedAt,
  };
}

async function eventsOf(db: D1Database, weddingId: string) {
  const { results } = await db.prepare(`SELECT id, key, name, starts_at, sort, questions FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(weddingId).all<EventRow>();
  return results;
}

async function invitePayload(c: C, w: WeddingRow, invId: string | null) {
  const events = await eventsOf(c.env.DB, w.id);
  const invitation = invId ? await invitationJson(c.env.DB, invId, events) : null;
  const content = json<Record<string, unknown>>(w.content, {});
  const slots = invitation ? (events.map((e, i) => (invitation.invited.includes(e.key) ? i : -1)).filter((i) => i === 0 || i === 1) as (0 | 1)[]) : null;
  const visibleEvents = invitation ? events.filter((e) => invitation.invited.includes(e.key)) : events;
  const base = (c.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  const music = w.music_key ? `${base}/api/p/${w.slug}/media/${encodeURIComponent(w.music_key)}` : undefined;
  const inv = InvitationContent.safeParse(content.invitation ?? {});
  return {
    wedding: { slug: w.slug, name1: w.name1, name2: w.name2, monogram: w.monogram, theme: w.theme, timezone: w.timezone },
    content: { ...(inv.success ? inv.data : {}), ...(music ? { audioUrl: music } : {}) },
    texts: textsFor('inv', (content.texts as Record<string, string> | undefined) ?? {}, slots),
    events: visibleEvents.map((e) => ({ key: e.key, name: e.name, startsAt: e.starts_at, slot: events.indexOf(e), questions: json(e.questions, []) })),
    invitation,
  };
}

const Rsvp = z
  .object({
    token: z.string().refine(isToken),
    events: z.record(z.object({ attending: z.boolean(), answers: z.record(z.string().max(200)).optional() })),
    count: z.number().int().min(1).max(60).optional(),
    diet: z.string().max(500).optional(),
    message: z.string().max(1000).optional(),
  })
  .strict();

export function guestRoutes() {
  const app = new Hono<GEnv>();

  app.use('*', async (c, next) => {
    const upload = c.req.method === 'PUT' && c.req.path.endsWith('/photos'); // a photo, checked in its route
    if (c.req.method !== 'GET' && !upload && !(c.req.header('content-type') ?? '').startsWith('application/json')) return err(c, 400, 'json_required', 'Send JSON.');
    await next();
  });

  app.get('/invite', async (c) => {
    const w = await wedding(c);
    if (!w) return err(c, 404, 'not_found', 'We could not find this invitation.');
    const token = c.req.query('g') ?? '';
    let invId: string | null = null;
    if (token) {
      const row = isToken(token)
        ? await c.env.DB.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>()
        : null;
      // A bad or old link still shows the invitation, with the name lookup (docs/09 §A).
      invId = row?.id ?? null;
      if (row && !c.req.query('preview')) {
        await c.env.DB.prepare(`UPDATE invitation SET opened_at = COALESCE(opened_at, ?) WHERE id = ?`).bind(new Date().toISOString(), row.id).run();
      }
    }
    return c.json(await invitePayload(c, w, invId));
  });

  /**
   * The night-before guide for one event (?event=<key>; default: their first). Needs the guest's own
   * link, and only for an event they're invited to: the guide has the address, menu and phone numbers.
   */
  app.get('/guide', async (c) => {
    const w = await wedding(c);
    const token = c.req.query('g') ?? '';
    if (!w || !isToken(token)) return err(c, 404, 'no_link', 'Please open your guide from the link in your text.');
    const db = c.env.DB;
    const inv = await db.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>();
    if (!inv) return err(c, 404, 'no_link', 'Please open your guide from the link in your text.');
    const events = await eventsOf(db, w.id);
    const { results: inviteRows } = await db.prepare(`SELECT event_id FROM invite_event WHERE invitation_id = ?`).bind(inv.id).all<{ event_id: string }>();
    const invited = new Set(inviteRows.map((r) => r.event_id));
    const wanted = c.req.query('event');
    const ev = events.find((e) => invited.has(e.id) && (!wanted || e.key === wanted));
    if (!ev) return err(c, 404, 'not_invited', 'This guide is not part of your invitation.');
    const guide = guidesOf(json(w.guide, {}), events.map((e) => e.key))[ev.key];
    if (!guide) return err(c, 404, 'not_ready', 'The guide for this event is not ready yet.');

    const [people, rsvp, tables, areas, plan] = await db.batch([
      db.prepare(`SELECT idx, name, diet, meal_entree, meal_main, meal_dessert, table_id FROM person WHERE invitation_id = ? AND deleted_at IS NULL ORDER BY idx`).bind(inv.id),
      db.prepare(`SELECT attending, answers FROM rsvp WHERE invitation_id = ? AND event_id = ?`).bind(inv.id, ev.id),
      db.prepare(`SELECT id, name, shape, dir, length_pct, x, y, seats FROM seat_table WHERE event_id = ? AND deleted_at IS NULL ORDER BY name`).bind(ev.id),
      db.prepare(`SELECT label, x, y, w, h FROM seat_area WHERE event_id = ? AND deleted_at IS NULL`).bind(ev.id),
      db.prepare(`SELECT image_key, aspect FROM seat_plan WHERE event_id = ?`).bind(ev.id),
    ]);
    type Person = { idx: number; name: string; diet: string; meal_entree: string; meal_main: string; meal_dessert: string; table_id: string | null };
    type Table = { id: string; name: string; shape: 'round' | 'long'; dir: string; length_pct: number; x: number; y: number; seats: number };
    const ppl = people!.results as Person[];
    const tbl = tables!.results as Table[];
    const tableIds = new Set(tbl.map((t) => t.id));
    const mine = [...new Set(ppl.map((p) => p.table_id).filter((id): id is string => !!id && tableIds.has(id)))];

    // Table mates: names only, only at their own tables.
    const mates: Record<string, string[]> = {};
    if (mine.length) {
      const { results } = await db
        .prepare(
          `SELECT p.table_id, p.name FROM person p JOIN invitation i ON i.id = p.invitation_id
            WHERE p.table_id IN (${mine.map(() => '?').join(',')}) AND p.invitation_id != ? AND p.deleted_at IS NULL AND i.deleted_at IS NULL
            ORDER BY p.name`,
        )
        .bind(...mine, inv.id)
        .all<{ table_id: string; name: string }>();
      for (const r of results) (mates[r.table_id] ??= []).push(r.name);
    }

    const r = rsvp!.results[0] as { attending: number | null; answers: string } | undefined;
    const base = (c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '');
    const planRow = plan!.results[0] as { image_key: string | null; aspect: string } | undefined;
    const weather =
      guide.lat !== undefined && guide.lon !== undefined
        ? await forecastFor(db, { eventId: ev.id, lat: guide.lat, lon: guide.lon, timezone: w.timezone, startsAt: ev.starts_at, times: (guide.runsheet ?? []).map((x) => x.t) }).catch(() => null)
        : null;
    const content = json<Record<string, unknown>>(w.content, {});
    return c.json({
      wedding: { slug: w.slug, name1: w.name1, name2: w.name2, monogram: w.monogram, theme: w.theme, timezone: w.timezone },
      images: imagesOf(content),
      event: { key: ev.key, name: ev.name, startsAt: ev.starts_at, slot: events.indexOf(ev) },
      guide,
      texts: textsFor(GUIDE_PAGE[guide.style], (content.texts as Record<string, string> | undefined) ?? {}, null),
      guest: {
        token,
        people: ppl.map((p) => ({ idx: p.idx, name: p.name, diet: p.diet, tableId: p.table_id && tableIds.has(p.table_id) ? p.table_id : null, meals: { e: p.meal_entree, m: p.meal_main, d: p.meal_dessert } })),
        attending: r ? (r.attending === null ? null : !!r.attending) : null,
        answers: json<Record<string, string>>(r?.answers, {}),
      },
      seating: tbl.length
        ? {
            aspect: planRow?.aspect ?? '4 / 3',
            planImg: planRow?.image_key ? `${base}/api/p/${w.slug}/media/${encodeURIComponent(planRow.image_key)}` : '',
            tables: tbl.map((t) => ({ id: t.id, name: t.name, shape: t.shape, dir: t.dir, len: t.length_pct, x: t.x, y: t.y })),
            features: areas!.results as { label: string; x: number; y: number; w: number; h: number }[],
          }
        : null,
      mates,
      weather,
      photoUrl: (guide.style === 'reception' && guide.photoUrl) || `${base}/w/${w.slug}/photos?g=${token}`,
    });
  });

  /** The photo page: who is adding photos, whether uploads are open, and the page's wording. */
  app.get('/photos', async (c) => {
    const w = await wedding(c);
    if (!w) return err(c, 404, 'not_found', 'We could not find this page.');
    const token = c.req.query('g') ?? '';
    const who = isToken(token)
      ? await c.env.DB.prepare(
          `SELECT p.name FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 AND p.deleted_at IS NULL
            WHERE i.token = ? AND i.wedding_id = ? AND i.deleted_at IS NULL`,
        )
          .bind(token, w.id)
          .first<{ name: string }>()
      : null;
    const content = json<Record<string, unknown>>(w.content, {});
    return c.json({
      wedding: { slug: w.slug, name1: w.name1, name2: w.name2, theme: w.theme },
      images: imagesOf(content),
      name: who?.name ?? '',
      linked: !!who,
      open: !!c.env.MEDIA && !!who,
      texts: textsFor('ph', (content.texts as Record<string, string> | undefined) ?? {}, null),
    });
  });

  /**
   * One photo per request (PUT, the image bytes). Needs the guest's own link, is checked to really be
   * a photo, capped in size, and rate limited per invitation. Stored privately in R2 for the couple.
   */
  app.put('/photos', async (c) => {
    const w = await wedding(c);
    const token = c.req.query('g') ?? '';
    if (!w || !isToken(token)) return err(c, 404, 'no_link', 'Please open this page from the link in your text.');
    const db = c.env.DB;
    const inv = await db.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>();
    if (!inv) return err(c, 404, 'no_link', 'Please open this page from the link in your text.');
    if (!c.env.MEDIA) return err(c, 503, 'closed', 'Photo uploads are not open yet.');
    if (!(await allow(db, `photo:${inv.id}`, 300, 3_600_000))) return err(c, 429, 'slow_down', 'That is a lot of photos at once. Please wait a little and try again.');
    const bytes = await readBytes(c.req.raw, MAX_PHOTO);
    if (!bytes) return err(c, 413, 'too_large', 'That photo is too large.');
    const kind = imageType(bytes);
    if (!kind) return err(c, 415, 'not_photo', 'That file is not a photo.');
    let by = '';
    try {
      by = dropControls(decodeURIComponent(c.req.header('X-Photo-By') ?? '')).trim().slice(0, 120);
    } catch {
      /* a garbled name is just left off */
    }
    const id = crypto.randomUUID();
    const key = `w/${w.id}/photos/${id}.${kind.ext}`;
    await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: kind.type } });
    await db
      .prepare(`INSERT INTO media (id, wedding_id, kind, key, content_type, bytes, uploaded_by, invitation_id, created_at) VALUES (?, ?, 'photo', ?, ?, ?, ?, ?, ?)`)
      .bind(id, w.id, key, kind.type, bytes.byteLength, by || null, inv.id, new Date().toISOString())
      .run();
    return c.json({ ok: true, id });
  });

  app.post('/find', async (c) => {
    const w = await wedding(c);
    if (!w) return err(c, 404, 'not_found', 'We could not find this invitation.');
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `find:${ip}`, 10, 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Please wait a minute.');
    const body = z.object({ name: z.string().max(120) }).safeParse(await readJson(c.req.raw));
    const q = body.success ? norm(body.data.name) : '';
    if (!q) return err(c, 400, 'invalid', 'Please enter your name.');
    const { results } = await c.env.DB.prepare(
      `SELECT p.invitation_id, p.name FROM person p JOIN invitation i ON i.id = p.invitation_id
        WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL`,
    )
      .bind(w.id)
      .all<{ invitation_id: string; name: string }>();
    const hit = results.find((p) => norm(p.name) === q);
    if (!hit) return err(c, 404, 'no_match', 'We could not find that name. Please enter it as it appears on your invitation.');
    return c.json(await invitePayload(c, w, hit.invitation_id));
  });

  app.post('/rsvp', async (c) => {
    const w = await wedding(c);
    if (!w) return err(c, 404, 'not_found', 'We could not find this invitation.');
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `rsvp:${ip}`, 30, 60_000))) return err(c, 429, 'slow_down', 'Too many tries. Please wait a minute.');
    const body = Rsvp.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Please check your answers and try again.');
    const r = body.data;
    const db = c.env.DB;
    const inv = await db.prepare(`SELECT id, seats_held FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(r.token, w.id).first<{ id: string; seats_held: number }>();
    if (!inv) return err(c, 404, 'not_found', 'We could not find your invitation. Please use the link from your text.');
    const { results: events } = await db
      .prepare(`SELECT e.id, e.key FROM invite_event ie JOIN event e ON e.id = ie.event_id WHERE ie.invitation_id = ? AND e.deleted_at IS NULL ORDER BY e.sort`)
      .bind(inv.id)
      .all<{ id: string; key: string }>();
    const answered = events.filter((e) => r.events[e.key]); // events they're not invited to are ignored
    if (!answered.length) return err(c, 400, 'invalid', 'Please answer for each event.');
    const count = Math.max(1, Math.min(inv.seats_held, r.count ?? 1));
    const now = new Date().toISOString();
    const stmts: D1PreparedStatement[] = answered.map((e, i) => {
      const a = r.events[e.key]!;
      return db
        .prepare(
          `INSERT INTO rsvp (invitation_id, event_id, attending, count, answers, message, via, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'invitation', ?7)
           ON CONFLICT (invitation_id, event_id) DO UPDATE SET
             count = ?4, answers = ?5, message = ?6, via = 'invitation',
             updated_at = CASE WHEN attending IS NOT ?3 THEN ?7 ELSE updated_at END,
             attending = ?3`,
        )
        .bind(inv.id, e.id, a.attending ? 1 : 0, count, JSON.stringify(a.answers ?? {}), i === 0 ? (r.message ?? '').trim() : '', now);
    });
    if (r.diet !== undefined) {
      const { results: people } = await db.prepare(`SELECT idx, name FROM person WHERE invitation_id = ? AND deleted_at IS NULL ORDER BY idx`).bind(inv.id).all<{ idx: number; name: string }>();
      const who = attachDiet(r.diet, people.map((p) => p.name));
      stmts.push(db.prepare(`UPDATE person SET diet = CASE WHEN idx = ? THEN ? ELSE '' END WHERE invitation_id = ? AND deleted_at IS NULL`).bind(who, r.diet.trim(), inv.id));
    }
    // Bump the version so an admin with this guest open sees "updated elsewhere" instead of overwriting the reply.
    stmts.push(db.prepare(`UPDATE invitation SET version = version + 1, updated_at = ? WHERE id = ?`).bind(now, inv.id));
    await db.batch(stmts);
    return c.json({ ok: true, invitation: await invitationJson(db, inv.id, await eventsOf(db, w.id)) });
  });

  return app;
}

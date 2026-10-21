import { allows, dateIn, dropControls, GUIDE_PAGE, guidesOf, InvitationContent, isToken, listsFor, PARTY_ROLES, PartySetup, sideOf, splitDiet, textsFor, type TableShape } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { engineDeps, type Env } from '../env';
import { sendReply, type EngineDeps } from '../sms/engine';
import { SESSION_COOKIE, sessionId } from '../lib/auth';
import { allow } from '../lib/rateLimit';
import { clearDietIfDeclinedAll, clearMealsIfDeclined, releaseShuttlesIfDeclined, unseatIfNotComing } from '../lib/seatingRules';
import { servedAt } from '../lib/meals';
import type { Snapshot as SeatSnapshot } from './seating';
import { imageType, videoType } from '../lib/images';
import { MAX_PHOTO, MAX_VIDEO, readBytes, readJson } from '../lib/security';
import { forecastFor } from '../lib/weather';
import { canStore, storePhoto } from '../photos/store';
import { isPhotoCode } from '../lib/photoQr';
import { weddingPlan } from '../lib/plan';
import { withDefaults } from '../lib/defaultTexts';

/** The site's own photo storage per wedding: inside R2's free 10 GB. */
const ALBUM_BYTES = 9 * 1024 ** 3;

/**
 * Guest-facing API (/api/p/:slug/...). No sign-in: the private link token identifies the invitation.
 * Returns only that invitation's own details, and only content for the events it is invited to.
 */

type GEnv = { Bindings: Env };
type C = Context<GEnv>;
const err = (c: C, status: 400 | 403 | 404 | 413 | 415 | 429 | 502 | 503, code: string, message: string) => c.json({ error: { code, message } }, status);
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

/** Whether the request carries a live admin session for this wedding (the couple previewing their pages). */
async function isAdminOf(c: C, weddingId: string): Promise<boolean> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !c.env.SESSION_SECRET) return false;
  const row = await c.env.DB.prepare(
    `SELECT 1 AS ok FROM session s JOIN membership m ON m.user_id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND m.wedding_id = ?`,
  )
    .bind(await sessionId(token, c.env.SESSION_SECRET), new Date().toISOString(), weddingId)
    .first<{ ok: number }>();
  return !!row;
}

/** A private wedding: its pages open only with a guest's own link (or for the couple, signed in). */
const isPrivate = (w: { content: string }) => json<Record<string, unknown>>(w.content, {}).private === true;
const PRIVATE = (c: C) => c.json({ error: { code: 'private', message: 'This invitation is private. Please open it from the link in your text.' } }, 404);

interface WeddingRow {
  id: string; slug: string; name1: string; name2: string; monogram: string; theme: string; timezone: string; content: string; guide: string; music_key: string | null;
}
interface EventRow { id: string; key: string; name: string; starts_at: string; sort: number; questions: string; venue: string | null; address: string | null }

async function wedding(c: C) {
  return c.env.DB.prepare(`SELECT id, slug, name1, name2, monogram, theme, timezone, content, guide, music_key FROM wedding WHERE slug = ? AND deleted_at IS NULL`)
    .bind(c.req.param('slug'))
    .first<WeddingRow>();
}

/** The invitation as its guest sees it. */
async function invitationJson(db: D1Database, invId: string, events: EventRow[]) {
  const [inv, people, invites, rsvps] = await db.batch([
    db.prepare(`SELECT id, token, seats_held FROM invitation WHERE id = ? AND deleted_at IS NULL`).bind(invId),
    db.prepare(`SELECT idx, name, diet, party_role FROM person WHERE invitation_id = ? AND deleted_at IS NULL ORDER BY idx`).bind(invId),
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
    people: (people!.results as { idx: number; name: string; diet: string; party_role: string }[]).map((p) => ({ idx: p.idx, name: p.name, diet: p.diet })),
    // In the wedding party: their page has the party's own run sheet (/w/:slug/party).
    party: (people!.results as { party_role: string }[]).some((p) => !!p.party_role),
    seatsHeld: i.seats_held,
    invited: events.filter((e) => invitedIds.has(e.id)).map((e) => e.key),
    rsvp,
    message,
    repliedAt,
  };
}

async function eventsOf(db: D1Database, weddingId: string) {
  const { results } = await db.prepare(`SELECT id, key, name, starts_at, sort, questions, venue, address FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(weddingId).all<EventRow>();
  return results;
}

/** "Who's who" for the invitation, when the couple has switched it on: names and roles, by side, in role order. */
async function whosWho(db: D1Database, weddingId: string) {
  const [setupRow, crew] = await db.batch([
    db.prepare(`SELECT data FROM planner_doc WHERE wedding_id = ? AND kind = 'party-setup' AND scope = ''`).bind(weddingId),
    db.prepare(
      `SELECT p.name, p.party_role FROM person p JOIN invitation i ON i.id = p.invitation_id
        WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND p.party_role != '' AND p.name != ''`,
    ).bind(weddingId),
  ]);
  const setup = PartySetup.safeParse(json((setupRow!.results[0] as { data: string } | undefined)?.data, {}));
  if (!setup.success || !setup.data.showOnInvite) return null;
  const rank = (role: string) => {
    const i = PARTY_ROLES.findIndex((r) => r.role.toLowerCase() === role.trim().toLowerCase());
    return i < 0 ? PARTY_ROLES.length : i;
  };
  const people = (crew!.results as { name: string; party_role: string }[])
    .map((p) => ({ name: p.name, role: p.party_role, side: sideOf(p.party_role) }))
    .sort((a, b) => rank(a.role) - rank(b.role) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  return people.length ? { sides: { p1: setup.data.p1, p2: setup.data.p2 }, people } : null;
}

async function invitePayload(c: C, w: WeddingRow, invId: string | null) {
  const events = await eventsOf(c.env.DB, w.id);
  const invitation = invId ? await invitationJson(c.env.DB, invId, events) : null;
  const content = json<Record<string, unknown>>(w.content, {});
  const slots = invitation ? (events.map((e, i) => (invitation.invited.includes(e.key) ? i : -1)).filter((i) => i === 0 || i === 1) as (0 | 1)[]) : null;
  const visibleEvents = invitation ? events.filter((e) => invitation.invited.includes(e.key)) : events;
  const inv = InvitationContent.safeParse(content.invitation ?? {});
  const { results: withShuttles } = await c.env.DB.prepare(`SELECT scope FROM planner_doc WHERE wedding_id = ? AND kind = 'shuttles' AND json_array_length(json_extract(data, '$.list')) > 0`)
    .bind(w.id)
    .all<{ scope: string }>();
  const shuttles = new Set(withShuttles.map((r) => r.scope));
  return {
    wedding: { slug: w.slug, name1: w.name1, name2: w.name2, monogram: w.monogram, theme: w.theme, timezone: w.timezone },
    // Music is the link set in Setup (MP3 or YouTube): there are no uploaded music files to point at.
    content: { ...(inv.success ? inv.data : {}), lists: listsFor(inv.success ? inv.data.lists : undefined, slots) },
    texts: textsFor('inv', withDefaults(content.texts as Record<string, string> | undefined, { tz: w.timezone, events: content.dateToBeSet ? events.map((e) => ({ ...e, starts_at: '' })) : events, rsvpClose: inv.success ? inv.data.rsvpClose : undefined }), slots),
    events: visibleEvents.map((e) => ({ key: e.key, name: e.name, startsAt: e.starts_at, slot: events.indexOf(e), questions: json(e.questions, []), shuttles: shuttles.has(e.key) })),
    invitation,
    // Only for a guest opening their own link (not the public page).
    party: invitation ? await whosWho(c.env.DB, w.id) : null,
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

export function guestRoutes(deps: (env: Env) => EngineDeps = engineDeps) {
  const app = new Hono<GEnv>();

  app.use('*', async (c, next) => {
    const upload = c.req.method === 'PUT' && (c.req.path.endsWith('/photos') || /\/photos\/[^/]+\/thumb$/.test(c.req.path)); // a photo (or its small copy), checked in its route
    if (c.req.method !== 'GET' && !upload && !(c.req.header('content-type') ?? '').startsWith('application/json')) return err(c, 400, 'json_required', 'Send JSON.');
    await next();
  });

  /** The save the date: the names, the date and the place in the invitation's look (it doesn't count as opening the invitation). */
  app.get('/save-the-date', async (c) => {
    const w = await wedding(c);
    if (!w) return err(c, 404, 'not_found', 'We could not find this page.');
    const token = c.req.query('g') ?? '';
    const who = isToken(token)
      ? await c.env.DB.prepare(
          `SELECT p.name FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 AND p.deleted_at IS NULL WHERE i.token = ? AND i.wedding_id = ? AND i.deleted_at IS NULL`,
        )
          .bind(token, w.id)
          .first<{ name: string }>()
      : null;
    if (!who && isPrivate(w) && !(await isAdminOf(c, w.id))) return PRIVATE(c);
    const first = await c.env.DB.prepare(`SELECT key, name, starts_at, venue, address FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(w.id).first<{ key: string; name: string; starts_at: string; venue: string | null; address: string | null }>();
    const content = json<Record<string, unknown>>(w.content, {});
    const inv = InvitationContent.safeParse(content.invitation ?? {});
    return c.json({
      wedding: { slug: w.slug, name1: w.name1, name2: w.name2, monogram: w.monogram, theme: w.theme, timezone: w.timezone },
      custom: inv.success ? (inv.data.custom ?? {}) : {},
      guest: who ? who.name.split(' ')[0] : '',
      event: first ? { key: first.key, name: first.name, startsAt: first.starts_at, venue: first.venue ?? '', address: first.address ?? '' } : null,
    });
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
    // Private: no page without a guest's own link (the couple, signed in, still see it to preview).
    if (!invId && isPrivate(w) && !(await isAdminOf(c, w.id))) {
      const share = json<Record<string, unknown>>(w.content, {}).previewShare as string | undefined;
      if (!(share && share.length >= 20 && c.req.query('share') === share)) return PRIVATE(c);
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
    // The couple previewing from Guest pages with no guest picked: a stand-in guest, signed-in admins only.
    // Or someone the couple sent a preview link to (Setup → Share a preview): same stand-in guest, nothing saved.
    const shared = (() => {
      const want = (w && json<Record<string, unknown>>(w.content, {}).previewShare) as string | undefined;
      const got = c.req.query('share') ?? '';
      return !!want && want.length >= 20 && got === want;
    })();
    const couple = !token && c.req.query('preview') === '1' && !!w && (shared || (await isAdminOf(c, w.id)));
    if (!w || (!couple && !isToken(token))) return err(c, 404, 'no_link', 'Please open your guide from the link in your text.');
    const db = c.env.DB;
    const inv = couple
      ? { id: '' }
      : await db.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>();
    if (!inv) return err(c, 404, 'no_link', 'Please open your guide from the link in your text.');
    const events = await eventsOf(db, w.id);
    const { results: inviteRows } = couple
      ? { results: events.map((e) => ({ event_id: e.id })) }
      : await db.prepare(`SELECT event_id FROM invite_event WHERE invitation_id = ?`).bind(inv.id).all<{ event_id: string }>();
    const invited = new Set(inviteRows.map((r) => r.event_id));
    const wanted = c.req.query('event');
    const ev = events.find((e) => invited.has(e.id) && (!wanted || e.key === wanted));
    if (!ev) return err(c, 404, 'not_invited', 'This guide is not part of your invitation.');
    const guide = guidesOf(json(w.guide, {}), events.map((e) => e.key))[ev.key];
    if (!guide) return err(c, 404, 'not_ready', 'The guide for this event is not ready yet.');

    const [people, rsvp, pub] = await db.batch([
      db.prepare(`SELECT id, idx, name, diet FROM person WHERE invitation_id = ? AND deleted_at IS NULL ORDER BY idx`).bind(inv.id),
      db.prepare(`SELECT attending, answers FROM rsvp WHERE invitation_id = ? AND event_id = ?`).bind(inv.id, ev.id),
      db.prepare(`SELECT snapshot FROM seat_publish WHERE event_id = ?`).bind(ev.id),
    ]);
    type Person = { id: string; idx: number; name: string; diet: string };
    const ppl = couple ? [{ id: '', idx: 0, name: 'Your guest', diet: '' }] : (people!.results as Person[]);
    // What each of them is served at this event (their menu's courses, or ones written for them).
    const served = await servedAt(db, w.id, ev);
    const r = couple ? { attending: 1, answers: '{}' } : (rsvp!.results[0] as { attending: number | null; answers: string } | undefined);
    const coming = r?.attending === 1;

    // Guests only ever see the *published* seating (Admin → Seating → Publish), and only once they've said yes.
    const pubRow = pub!.results[0] as { snapshot: string } | undefined;
    const snap = pubRow ? json<SeatSnapshot | null>(pubRow.snapshot, null) : null;
    // The stand-in guest sits at the first published table, so the couple sees how the table card looks.
    const tableOf = (personId: string) => (couple ? snap?.tables[0]?.id : coming && snap?.seats[personId]) || null;
    const mine = [...new Set(ppl.map((p) => tableOf(p.id)).filter((id): id is string => !!id))];

    // Table mates: names only, only at their own tables, only people still coming.
    const mates: Record<string, string[]> = {};
    const mateIds = snap ? Object.entries(snap.seats).filter(([pid, tid]) => mine.includes(tid) && !ppl.some((p) => p.id === pid)) : [];
    if (mateIds.length) {
      const { results } = await db
        .prepare(
          `SELECT p.id, p.name FROM person p JOIN invitation i ON i.id = p.invitation_id
             JOIN rsvp rr ON rr.invitation_id = i.id AND rr.event_id = ? AND rr.attending = 1
            WHERE p.id IN (${mateIds.map(() => '?').join(',')}) AND p.deleted_at IS NULL AND i.deleted_at IS NULL
            ORDER BY p.name`,
        )
        .bind(ev.id, ...mateIds.map(([pid]) => pid))
        .all<{ id: string; name: string }>();
      const tableFor = new Map(mateIds);
      for (const m of results) (mates[tableFor.get(m.id)!] ??= []).push(m.name);
    }

    const base = (c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '');
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
      texts: textsFor(GUIDE_PAGE[guide.style], withDefaults(content.texts as Record<string, string> | undefined, { tz: w.timezone, events }), null),
      guest: {
        token,
        people: ppl.map((p) => ({ idx: p.idx, name: p.name, diet: p.diet, tableId: tableOf(p.id), meals: (({ e, m, d }) => ({ e, m, d }))(served(p.id)) })),
        attending: r ? (r.attending === null ? null : !!r.attending) : null,
        answers: json<Record<string, string>>(r?.answers, {}),
      },
      seating: snap?.tables.length
        ? {
            aspect: snap.aspect,
            planImg: '', // plan photos arrive with uploads (R2)
            tables: snap.tables.map((t) => ({ id: t.id, name: t.name, shape: t.shape as TableShape, dir: t.dir as 'h' | 'v', len: t.len, x: t.x, y: t.y })),
            features: snap.areas,
          }
        : null,
      mates,
      weather,
      photoUrl: (guide.style === 'reception' && guide.photoUrl) || `${base}/w/${w.slug}/photos/${encodeURIComponent(ev.key)}${couple ? '' : `?g=${token}`}`,
    });
  });

  /** The photo page: who is adding photos, whether uploads are open, and the page's wording. */
  app.get('/photos', async (c) => {
    const w = await wedding(c);
    if (!w) return err(c, 404, 'not_found', 'We could not find this page.');
    const token = c.req.query('g') ?? '';
    const who = isToken(token)
      ? await c.env.DB.prepare(
          `SELECT p.name, i.id AS inv FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 AND p.deleted_at IS NULL
            WHERE i.token = ? AND i.wedding_id = ? AND i.deleted_at IS NULL`,
        )
          .bind(token, w.id)
          .first<{ name: string; inv: string }>()
      : null;
    // The table-card QR code: anyone at the tables can add photos, giving their name.
    const qr = !who && (await isPhotoCode(c.env.SESSION_SECRET, w.id, c.req.query('t') ?? '')) && allows(await weddingPlan(c.env.DB, w.id), 'photoQr');
    if (!who && !qr && isPrivate(w) && !(await isAdminOf(c, w.id))) return PRIVATE(c);
    // Each event has its own album; the page offers the events this guest is invited to (all, on the public page).
    const all = await eventsOf(c.env.DB, w.id);
    const mine = who ? new Set((await c.env.DB.prepare(`SELECT event_id FROM invite_event WHERE invitation_id = ?`).bind(who.inv).all<{ event_id: string }>()).results.map((r) => r.event_id)) : null;
    const events = mine ? all.filter((e) => mine.has(e.id)) : all;
    const ev = events.find((e) => e.key === c.req.query('event')) ?? null;
    const content = json<Record<string, unknown>>(w.content, {});
    return c.json({
      wedding: { slug: w.slug, name1: w.name1, name2: w.name2, theme: w.theme, monogram: w.monogram, timezone: w.timezone },
      events: events.map((e) => ({ key: e.key, name: e.name, startsAt: e.starts_at, slot: all.indexOf(e) })),
      event: ev ? { key: ev.key, name: ev.name, startsAt: ev.starts_at, slot: all.indexOf(ev) } : null,
      images: imagesOf(content),
      name: who?.name ?? '',
      linked: !!who,
      qr,
      open: (!!who || qr) && (await canStore(c.env, w.id)),
      // The couple has shared the album: guests can see everyone's photos (/w/:slug/album).
      album: !!who && content.albumShared === true,
      // The frames and looks the couple offers (all of them until they choose), and the look to start on.
      looks: (content.photoLooks as { frames?: string[]; looks?: string[]; def?: string } | undefined) ?? null,
      texts: textsFor('ph', withDefaults(content.texts as Record<string, string> | undefined, { tz: w.timezone, events: all }), null),
    });
  });

  /**
   * One photo per request (PUT, the image bytes). Needs the guest's own link, is checked to really be
   * a photo, capped in size, and rate limited per invitation. Stored privately in R2 for the couple.
   */
  app.put('/photos', async (c) => {
    const w = await wedding(c);
    const token = c.req.query('g') ?? '';
    if (!w) return err(c, 404, 'no_link', 'Please open this page from the link in your text.');
    const db = c.env.DB;
    const inv = isToken(token) ? await db.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>() : null;
    // Or the table-card QR code: limited per phone (network) and per wedding instead of per invitation.
    const qr = !inv && (await isPhotoCode(c.env.SESSION_SECRET, w.id, c.req.query('t') ?? '')) && allows(await weddingPlan(db, w.id), 'photoQr');
    if (!inv && !qr) return err(c, 404, 'no_link', 'Please open this page from the link in your text.');
    const who = inv ? inv.id : `qr:${w.id}:${c.req.header('CF-Connecting-IP') ?? 'local'}`;
    if (!(await canStore(c.env, w.id))) return err(c, 503, 'closed', 'Photo uploads are not open yet.');
    if (!(await allow(db, `photo:${who}`, qr ? 80 : 150, 3_600_000)) || !(await allow(db, `photo-day:${who}`, qr ? 300 : 600, 86_400_000)) || (qr && !(await allow(db, `photo-qr-day:${w.id}`, 5000, 86_400_000)))) {
      return err(c, 429, 'slow_down', 'That is a lot of photos at once. Please wait a little and try again.');
    }
    // The site's own storage stays inside its free 10 GB (photos kept in the couple's linked storage don't count).
    if (c.env.MEDIA) {
      const used = await db.prepare(`SELECT COALESCE(SUM(bytes), 0) AS n FROM media WHERE wedding_id = ? AND deleted_at IS NULL AND key NOT LIKE 'link:%'`).bind(w.id).first<{ n: number }>();
      if ((used?.n ?? 0) > ALBUM_BYTES) return err(c, 503, 'full', 'The album is full for now. Please let the couple know.');
    }
    const bytes = await readBytes(c.req.raw, MAX_VIDEO);
    if (!bytes) return err(c, 413, 'too_large', 'That video is too large. Try a shorter clip (about a minute).');
    const photo = imageType(bytes);
    const video = photo ? null : videoType(bytes);
    const kind = photo ?? video;
    if (!kind) return err(c, 415, 'not_photo', 'That file is not a photo or a video.');
    if (photo && bytes.byteLength > MAX_PHOTO) return err(c, 413, 'too_large', 'That photo is too large.');
    // A video's look (shown when it plays): one of the page's looks, by name.
    const asked = c.req.header('X-Photo-Look') ?? '';
    const look = video && ['golden', 'film', 'classic', 'blush', 'moody', 'airy', 'vintage', 'disposable', 'cinematic', 'glow', 'noir'].includes(asked) ? asked : '';
    // A video is big: twenty a day each, so one phone can't fill the album or the couple's Drive.
    if (video && !(await allow(db, `video-day:${who}`, qr ? 10 : 20, 86_400_000))) return err(c, 429, 'slow_down', 'That’s a lot of videos today. Please try again tomorrow.');
    let by = '';
    try {
      by = dropControls(decodeURIComponent(c.req.header('X-Photo-By') ?? '')).trim().slice(0, 120);
    } catch {
      /* a garbled name is just left off */
    }
    const evKey = c.req.query('event') ?? '';
    const ev = evKey ? (await eventsOf(db, w.id)).find((e) => e.key === evKey) : undefined;
    // The original of a photo this phone just sent (no frame or look): kept beside it, never listed on its own.
    let rawOf: string | null = null;
    if (c.req.query('raw')) {
      if (!photo) return err(c, 415, 'not_photo', 'Originals are photos.');
      const since = new Date(Date.now() - 30 * 60_000).toISOString();
      const framed = await db
        .prepare(`SELECT id FROM media WHERE id = ? AND wedding_id = ? AND raw_of IS NULL AND deleted_at IS NULL AND created_at > ? AND invitation_id IS ? AND NOT EXISTS (SELECT 1 FROM media r WHERE r.raw_of = media.id)`)
        .bind(c.req.query('raw'), w.id, since, inv?.id ?? null)
        .first<{ id: string }>();
      if (!framed) return err(c, 404, 'not_found', 'That photo isn’t yours.');
      rawOf = framed.id;
    }
    const r = await storePhoto(c.env, (p) => c.executionCtx.waitUntil(p), { weddingId: w.id, bytes, kind, by, invitationId: inv?.id ?? null, eventKey: ev?.key ?? null, media: video ? 'video' : 'photo', look, rawOf });
    if (!r.ok) return err(c, r.status, 'not_saved', r.message);
    return c.json({ ok: true, id: r.id });
  });

  /** A photo's small copy from the phone that sent it (a JPEG up to 120 KB), for the grids. */
  app.put('/photos/:id/thumb', async (c) => {
    const w = await wedding(c);
    const token = c.req.query('g') ?? '';
    if (!w || !isToken(token)) return err(c, 404, 'no_link', 'Please open this page from your link.');
    const db = c.env.DB;
    const inv = await db.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>();
    // Only for a photo this guest sent.
    const m = inv ? await db.prepare(`SELECT id FROM media WHERE id = ? AND wedding_id = ? AND invitation_id = ? AND deleted_at IS NULL`).bind(c.req.param('id'), w.id, inv.id).first<{ id: string }>() : null;
    if (!m) return err(c, 404, 'not_found', 'That photo isn’t yours.');
    const bytes = await readBytes(c.req.raw, 120_000);
    if (!bytes || imageType(bytes)?.type !== 'image/jpeg') return err(c, 415, 'not_photo', 'A small JPEG, please.');
    await db.prepare(`INSERT INTO photo_thumb (media_id, wedding_id, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (media_id) DO NOTHING`).bind(m.id, w.id, bytes, new Date().toISOString()).run();
    return c.json({ ok: true });
  });

  /**
   * Messages with the couple (support, questions) from the guest's own page: their conversation, and
   * writing a new message. Needs their link; replies from the couple show here (and are marked seen).
   */
  app.get('/messages', async (c) => {
    const w = await wedding(c);
    const token = c.req.query('g') ?? '';
    if (!w || !isToken(token)) return err(c, 404, 'no_link', 'Please open this page from the link in your text.');
    const db = c.env.DB;
    const inv = await db.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>();
    if (!inv) return err(c, 404, 'no_link', 'Please open this page from the link in your text.');
    const { results } = await db
      .prepare(`SELECT id, from_guest, kind, body, created_at FROM message WHERE wedding_id = ? AND invitation_id = ? ORDER BY created_at LIMIT 200`)
      .bind(w.id, inv.id)
      .all<{ id: string; from_guest: number; kind: string; body: string; created_at: string }>();
    await db.prepare(`UPDATE message SET read_at = ? WHERE invitation_id = ? AND from_guest = 0 AND read_at IS NULL`).bind(new Date().toISOString(), inv.id).run();
    return c.json({
      couple: `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`,
      messages: results.map((m) => ({ id: m.id, from: m.from_guest ? 'guest' : 'couple', kind: m.kind, body: m.body, at: m.created_at })),
    });
  });

  app.post('/messages', async (c) => {
    const w = await wedding(c);
    const body = z
      .object({ token: z.string().refine(isToken), body: z.string().trim().min(1).max(1000), kind: z.enum(['message', 'support', 'question']).default('message') })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!w || !body.success) return err(c, 400, 'invalid', 'Write your message first (up to 1,000 characters).');
    const db = c.env.DB;
    const inv = await db.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(body.data.token, w.id).first<{ id: string }>();
    if (!inv) return err(c, 404, 'no_link', 'Please open this page from the link in your text.');
    if (!(await allow(db, `msg:${inv.id}`, 30, 3_600_000))) return err(c, 429, 'slow_down', 'That is a lot of messages. Please wait a little and try again.');
    await db
      .prepare(`INSERT INTO message (id, wedding_id, invitation_id, from_guest, kind, body, created_at) VALUES (?, ?, ?, 1, ?, ?, ?)`)
      .bind(crypto.randomUUID(), w.id, inv.id, body.data.kind, dropControls(body.data.body), new Date().toISOString())
      .run();
    return c.json({ ok: true });
  });

  app.post('/find', async (c) => {
    const w = await wedding(c);
    if (!w) return err(c, 404, 'not_found', 'We could not find this invitation.');
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `find:${ip}`, 10, 60_000)) || !(await allow(c.env.DB, `find-w:${w.id}`, 120, 3_600_000))) return err(c, 429, 'slow_down', 'Too many tries. Please wait a minute.');
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
    // A name is not a secret (names show on the message board), so finding one never hands over the
    // guest's link. The link is texted to the mobile on that invitation instead (at most 3 a day).
    const inv = await c.env.DB.prepare(
      `SELECT i.id, i.token, i.phone, i.sms_optout, EXISTS (SELECT 1 FROM opt_out o WHERE o.phone = i.phone) AS opted_out FROM invitation i WHERE i.id = ?`,
    )
      .bind(hit.invitation_id)
      .first<{ id: string; token: string; phone: string | null; sms_optout: number; opted_out: number }>();
    const ending = (inv?.phone ?? '').replace(/\D/g, '').slice(-3);
    const ws = await c.env.DB.prepare(`SELECT sms_sender, sms_paused FROM wedding WHERE id = ?`).bind(w.id).first<{ sms_sender: string | null; sms_paused: number }>();
    if (!inv?.phone || inv.sms_optout || inv.opted_out || !ws?.sms_sender || ws.sms_paused) return c.json({ found: true, texted: false });
    if (!(await allow(c.env.DB, `findtext:${inv.id}`, 3, 86_400_000))) return c.json({ found: true, texted: true, ending, again: true });
    const link = `${c.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/w/${w.slug}?g=${inv.token}`;
    try {
      const r = await sendReply(deps(c.env), w.id, inv.id, inv.phone, `Here is your invitation from ${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}: ${link}`, `find:${inv.id}:${Date.now()}`);
      if (r.stopped) return c.json({ found: true, texted: false });
    } catch {
      return c.json({ found: true, texted: false });
    }
    return c.json({ found: true, texted: true, ending });
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
    // After the closing date a reply can't be changed online (a first, late reply still counts).
    const inv0 = InvitationContent.safeParse(json<Record<string, unknown>>(w.content, {}).invitation ?? {});
    const close = inv0.success ? inv0.data.rsvpClose : '';
    if (close && dateIn(w.timezone) > close) {
      const replied = await db.prepare(`SELECT 1 FROM rsvp WHERE invitation_id = ? AND attending IS NOT NULL LIMIT 1`).bind(inv.id).first();
      if (replied) {
        const email = inv0.success ? inv0.data.rsvpEmail?.trim() : '';
        const day = new Date(`${close}T00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
        return err(c, 403, 'closed', `Replies closed on ${day}. To change yours, please email us${email ? ` at ${email}` : ''}.`);
      }
    }
    const count = Math.max(1, Math.min(inv.seats_held, r.count ?? 1));
    const now = new Date().toISOString();
    const stmts: D1PreparedStatement[] = answered.map((e, i) => {
      const a = r.events[e.key]!;
      return db
        .prepare(
          `INSERT INTO rsvp (invitation_id, event_id, attending, count, answers, message, via, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'invitation', ?7)
           ON CONFLICT (invitation_id, event_id) DO UPDATE SET
             count = ?4, answers = ?5, message = CASE WHEN ?8 THEN ?6 ELSE message END, via = 'invitation',
             updated_at = CASE WHEN attending IS NOT ?3 THEN ?7 ELSE updated_at END,
             attending = ?3`,
        )
        .bind(inv.id, e.id, a.attending ? 1 : 0, count, JSON.stringify(a.answers ?? {}), i === 0 ? (r.message ?? '').trim() : '', now, i === 0 && r.message !== undefined ? 1 : 0);
    });
    if (r.diet !== undefined) {
      const { results: people } = await db.prepare(`SELECT idx, name FROM person WHERE invitation_id = ? AND deleted_at IS NULL ORDER BY idx`).bind(inv.id).all<{ idx: number; name: string }>();
      // One note for the invitation, split so each person gets their own part (splitDiet).
      const parts = splitDiet(r.diet, people.map((p) => p.name));
      people.forEach((p, i) => stmts.push(db.prepare(`UPDATE person SET diet = ? WHERE invitation_id = ? AND idx = ? AND deleted_at IS NULL`).bind(parts[i] ?? '', inv.id, p.idx)));
    }
    stmts.push(unseatIfNotComing(db, inv.id)); // declined: their seat is freed
    stmts.push(releaseShuttlesIfDeclined(db, inv.id)); // and their shuttle seats
    stmts.push(clearMealsIfDeclined(db, inv.id)); // and their meals at the events they said no to
    stmts.push(clearDietIfDeclinedAll(db, inv.id)); // not coming to anything: no dietary on any list
    // Bump the version so an admin with this guest open sees "updated elsewhere" instead of overwriting the reply.
    stmts.push(db.prepare(`UPDATE invitation SET version = version + 1, updated_at = ? WHERE id = ?`).bind(now, inv.id));
    await db.batch(stmts);
    return c.json({ ok: true, invitation: await invitationJson(db, inv.id, await eventsOf(db, w.id)) });
  });

  return app;
}

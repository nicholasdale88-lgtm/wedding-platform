import { isToken, itemsFor, PARTY_ROLES, PLANNER_DOCS, sideOf, type PlannerKind } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * The planner. Admin (/api/a/w/:wid/planner): the wedding party (roles on guests), its run sheet per
 * event, the partners' on-the-day checklists, and the generic planning documents behind them (JSON with
 * a version, checked against the shared schema on every save). Guests (/api/p/:slug/party?g=): a party
 * member's own run sheet, only the items for them, only for events they're invited to.
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;
const json = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};
const isKind = (k: string): k is PlannerKind => k in PLANNER_DOCS;

type DocOf<K extends PlannerKind> = z.infer<(typeof PLANNER_DOCS)[K]>;
async function readDoc<K extends PlannerKind>(db: D1Database, weddingId: string, kind: K, scope: string): Promise<{ data: DocOf<K>; version: number }> {
  const row = await db.prepare(`SELECT data, version FROM planner_doc WHERE wedding_id = ? AND kind = ? AND scope = ?`).bind(weddingId, kind, scope).first<{ data: string; version: number }>();
  const schema = PLANNER_DOCS[kind];
  const parsed = schema.safeParse(json(row?.data, {}));
  return { data: (parsed.success ? parsed.data : schema.parse({})) as DocOf<K>, version: row?.version ?? 0 };
}

async function members(db: D1Database, weddingId: string) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.invitation_id, p.name, p.party_role FROM person p JOIN invitation i ON i.id = p.invitation_id
        WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND p.party_role != '' ORDER BY p.party_role, p.name`,
    )
    .bind(weddingId)
    .all<{ id: string; invitation_id: string; name: string; party_role: string }>();
  return results.map((r) => ({ personId: r.id, invitationId: r.invitation_id, name: r.name, role: r.party_role, side: sideOf(r.party_role) }));
}

export function plannerRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');
  const audit = (c: C, action: string, target: string) =>
    c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), wid(c), c.get('user').id, action, target, new Date().toISOString());

  /** Everything the Wedding party screen needs, for one event. */
  app.get('/party', async (c) => {
    const db = c.env.DB;
    const w = await db.prepare(`SELECT slug, name1, name2 FROM wedding WHERE id = ?`).bind(wid(c)).first<{ slug: string; name1: string; name2: string }>();
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    const { results: events } = await db
      .prepare(`SELECT key, name, starts_at FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`)
      .bind(wid(c))
      .all<{ key: string; name: string; starts_at: string }>();
    const ev = events.find((e) => e.key === c.req.query('event')) ?? events[0];
    const people = await members(db, wid(c));
    // A member's own page opens with their link (owners and editors only: it lets them act as that guest).
    const tokens =
      c.get('role') === 'viewer' || !people.length
        ? new Map<string, string>()
        : new Map(
            (
              await db
                .prepare(`SELECT id, token FROM invitation WHERE id IN (${people.map(() => '?').join(',')})`)
                .bind(...people.map((p) => p.invitationId))
                .all<{ id: string; token: string }>()
            ).results.map((r) => [r.id, r.token]),
          );
    return c.json({
      slug: w.slug,
      names: { p1: w.name1.split(' ')[0] ?? '', p2: w.name2.split(' ')[0] ?? '' },
      roles: PARTY_ROLES,
      events: events.map((e) => ({ key: e.key, name: e.name, startsAt: e.starts_at })),
      event: ev?.key ?? null,
      members: people.map((p) => ({ ...p, token: tokens.get(p.invitationId) ?? null })),
      runsheet: ev ? await readDoc(db, wid(c), 'party-runsheet', ev.key) : null,
      checklist: ev ? await readDoc(db, wid(c), 'day-checklist', ev.key) : null,
    });
  });

  /** Give someone a wedding party role (or '' to take it away). */
  app.put('/people/:pid/role', writer, async (c) => {
    const body = z.object({ role: z.string().trim().max(40) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Keep the role under 40 characters.');
    const pid = c.req.param('pid');
    const r = await c.env.DB.prepare(
      `UPDATE person SET party_role = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL AND invitation_id IN (SELECT id FROM invitation WHERE wedding_id = ? AND deleted_at IS NULL)`,
    )
      .bind(body.data.role, pid, wid(c))
      .run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'Guest not found.');
    await audit(c, 'party.role', pid).run();
    return c.json({ ok: true, members: await members(c.env.DB, wid(c)) });
  });

  /** A planning document. Saving needs the version you loaded (If-Match): two people never overwrite each other. */
  app.get('/doc/:kind/:scope?', async (c) => {
    const kind = c.req.param('kind');
    if (!isKind(kind)) return err(c, 404, 'not_found', 'Unknown document.');
    return c.json(await readDoc(c.env.DB, wid(c), kind, c.req.param('scope') ?? ''));
  });

  app.put('/doc/:kind/:scope?', writer, async (c) => {
    const kind = c.req.param('kind');
    if (!isKind(kind)) return err(c, 404, 'not_found', 'Unknown document.');
    const scope = c.req.param('scope') ?? '';
    if (scope) {
      const ev = await c.env.DB.prepare(`SELECT 1 FROM event WHERE wedding_id = ? AND key = ? AND deleted_at IS NULL`).bind(wid(c), scope).first();
      if (!ev) return err(c, 404, 'not_found', 'That event no longer exists.');
    }
    const parsed = PLANNER_DOCS[kind].safeParse((await readJson(c.req.raw)) ?? undefined);
    if (!parsed.success) return err(c, 400, 'invalid', 'Some of it is too long or missing. Check and try again.');
    const v = Number(c.req.header('If-Match') ?? '0');
    const now = new Date().toISOString();
    const data = JSON.stringify(parsed.data);
    // Version 0 = it didn't exist yet: insert (losing if someone else made it first); else bump only from v.
    const res =
      v === 0
        ? await c.env.DB.prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT DO NOTHING`)
            .bind(wid(c), kind, scope, data, now)
            .run()
        : await c.env.DB.prepare(`UPDATE planner_doc SET data = ?, version = version + 1, updated_at = ? WHERE wedding_id = ? AND kind = ? AND scope = ? AND version = ?`)
            .bind(data, now, wid(c), kind, scope, v)
            .run();
    if (!res.meta.changes) return c.json({ error: { code: 'conflict', message: 'Changed elsewhere, so this has been reloaded. Make your change again.' }, current: await readDoc(c.env.DB, wid(c), kind, scope) }, 409);
    await audit(c, `planner.${kind}`, scope).run();
    return c.json(await readDoc(c.env.DB, wid(c), kind, scope));
  });

  return app;
}

/** A wedding party member's run sheet: /api/p/:slug/party?g=<their token>. */
export function partyGuestRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/', async (c) => {
    const token = c.req.query('g') ?? '';
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `party:${ip}`, 120, 60_000))) return c.json({ error: { code: 'slow_down', message: 'Too many tries. Please wait a minute.' } }, 429);
    const db = c.env.DB;
    const w = await db.prepare(`SELECT id, name1, name2, theme FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug')).first<{ id: string; name1: string; name2: string; theme: string }>();
    const inv = w && isToken(token) ? await db.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(token, w.id).first<{ id: string }>() : null;
    if (!w || !inv) return c.json({ error: { code: 'no_link', message: 'Please open this page from the link you were sent.' } }, 404);
    const { results: mine } = await db.prepare(`SELECT name, party_role FROM person WHERE invitation_id = ? AND deleted_at IS NULL AND party_role != '' ORDER BY idx`).bind(inv.id).all<{ name: string; party_role: string }>();
    if (!mine.length) return c.json({ error: { code: 'not_party', message: 'This page is for the wedding party.' } }, 404);
    const { results: events } = await db
      .prepare(`SELECT e.key, e.name, e.starts_at FROM event e JOIN invite_event ie ON ie.event_id = e.id AND ie.invitation_id = ? WHERE e.deleted_at IS NULL ORDER BY e.sort`)
      .bind(inv.id)
      .all<{ key: string; name: string; starts_at: string }>();
    const roles = [...new Set(mine.map((m) => m.party_role))];
    const out = [];
    for (const e of events) {
      const doc = await readDoc(db, w.id, 'party-runsheet', e.key);
      const seen = new Set<string>();
      // Everything for any of the roles on this invitation, once each, in the couple's order.
      const items = doc.data.items.filter((it) => roles.some((r) => itemsFor([it], r).length) && !seen.has(JSON.stringify(it)) && seen.add(JSON.stringify(it)));
      if (items.length || doc.data.note) out.push({ key: e.key, name: e.name, startsAt: e.starts_at, note: doc.data.note, items });
    }
    const crew = await members(db, w.id);
    return c.json({
      couple: `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`,
      names: { p1: w.name1.split(' ')[0] ?? '', p2: w.name2.split(' ')[0] ?? '' },
      theme: w.theme,
      me: mine.map((m) => ({ name: m.name, role: m.party_role })),
      // Who's who in the party (names and roles only).
      party: crew.map((m) => ({ name: m.name, role: m.role, side: m.side })),
      events: out,
    });
  });
  return app;
}


import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { readJson, safeJson } from '../lib/security';
import { needsUpgrade, weddingPlan } from '../lib/plan';
import { allows } from '@wp/shared';
import { estimate, sendNow, sendTest, type EngineDeps } from '../sms/engine';
import { recipientsFor } from '../sms/audience';
import { Audience } from '../sms/types';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Admin → SMS messages (/api/a/w/:wid/texts): every message, when it goes and to whom, replies
 * from guests, and what has been sent. Editing a message never sends it; sending always shows
 * the count and cost first (POST …/estimate).
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 428, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;
const nowIso = () => new Date().toISOString();

/** Groups a message can go to, built from the wedding's own events. */
function audiences(events: { key: string; name: string }[]) {
  const lower = (s: string) => s.replace(/^The\s/, 'the ');
  return [
    { label: 'Everyone with a mobile', audience: { all: true } as Audience },
    { label: 'Still to reply', audience: { awaitingAny: true, invitedBefore: true } as Audience },
    ...events.flatMap((e) => [
      { label: `Everyone invited to ${lower(e.name)}`, audience: { invitedTo: e.key } as Audience },
      { label: `Coming to ${lower(e.name)}`, audience: { attending: e.key } as Audience },
    ]),
    { label: 'Declined everything', audience: { declinedAll: true } as Audience },
  ].map((a) => ({ ...a, key: JSON.stringify(a.audience) }));
}

const audienceKey = (a: Audience) => JSON.stringify(Object.fromEntries(Object.entries(a).sort(([x], [y]) => x.localeCompare(y))));

const Patch = z
  .object({
    name: z.string().trim().min(1).max(80),
    body: z.string().max(1600),
    enabled: z.boolean(),
    audience: Audience,
    excluded: z.array(z.string().max(60)).max(2000),
    dates: z.array(z.string().datetime()).max(20),
  })
  .partial()
  .strict();
const Draft = z.object({ body: z.string().max(1600), audience: Audience, excluded: z.array(z.string()).max(2000), only: z.array(z.string()).max(2000) }).partial().strict();

export function textRoutes(deps: (env: Env) => EngineDeps) {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  const writer = requireMember('owner', 'editor');
  const audit = (c: C, action: string, target: string, detail?: unknown) =>
    c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), wid(c), c.get('user').id, action, target, detail === undefined ? null : JSON.stringify(detail), nowIso())
      .run();

  app.get('/', async (c) => {
    const d = deps(c.env);
    const db = c.env.DB;
    const w = await d.store.wedding(wid(c));
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    const [campaigns, { events, recipients }, invitedBefore] = await Promise.all([d.store.campaigns(w.id), d.store.audience(w.id), d.store.invitedIds(w.id)]);
    const [meta, slots, inbox, history, content] = await db.batch([
      db.prepare(`SELECT id, key, version, sort FROM campaign WHERE wedding_id = ? AND deleted_at IS NULL`).bind(w.id),
      db.prepare(`SELECT s.id, s.campaign_id, s.send_at, s.status, s.last_error FROM campaign_slot s JOIN campaign c ON c.id = s.campaign_id WHERE c.wedding_id = ? ORDER BY s.send_at`).bind(w.id),
      db.prepare(
        `SELECT i.id, i.received_at, i.from_phone, i.body, i.action, i.handled,
                (SELECT p.name FROM person p WHERE p.invitation_id = i.invitation_id AND p.idx = 0) AS name
           FROM sms_in i WHERE i.wedding_id = ? ORDER BY i.received_at DESC LIMIT 100`,
      ).bind(w.id),
      db.prepare(
        `SELECT o.campaign_id, o.kind, substr(o.created_at, 1, 16) AS minute, COUNT(*) AS n, MIN(o.body) AS sample,
                SUM(o.status IN ('sent', 'delivered')) AS ok, SUM(o.status IN ('failed', 'blocked')) AS bad, c.name AS campaign
           FROM sms_out o LEFT JOIN campaign c ON c.id = o.campaign_id
          WHERE o.wedding_id = ? GROUP BY o.campaign_id, o.kind, minute ORDER BY minute DESC LIMIT 60`,
      ).bind(w.id),
      db.prepare(`SELECT content FROM wedding WHERE id = ?`).bind(w.id),
    ]);
    const m = new Map((meta!.results as { id: string; key: string; version: number }[]).map((r) => [r.id, r]));
    const evs = events.map((e) => ({ key: e.key, name: e.name }));
    const groups = audiences(evs);
    const label = (a: Audience) => groups.find((g) => audienceKey(g.audience) === audienceKey(a))?.label ?? 'A custom group';
    const presets = safeJson<{ smsPresets?: unknown[] }>((content!.results[0] as { content: string } | undefined)?.content, {}).smsPresets ?? [];
    return c.json({
      live: !!w.sender,
      sender: w.sender,
      paused: w.paused,
      adminMobile: w.adminMobile,
      timezone: w.timezone,
      invitesFrom: w.invitesFrom ?? null,
      invitesFromCustom: !!w.invitesFromCustom,
      quiet: { start: w.quietStart, end: w.quietEnd },
      events: evs,
      audiences: groups,
      presets,
      people: recipients.map((r) => ({ id: r.id, name: r.people.join(' & '), phone: !!r.phone, optOut: r.optOut })),
      campaigns: campaigns.map((cp) => ({
        id: cp.id,
        key: cp.key,
        name: cp.name,
        body: cp.body,
        mode: cp.mode,
        enabled: cp.enabled,
        trigger: cp.trigger,
        audience: cp.audience,
        audienceLabel: label(cp.audience),
        excluded: cp.excluded,
        custom: cp.key.startsWith('custom-'),
        version: m.get(cp.id)?.version ?? 1,
        count: recipientsFor(cp, recipients, invitedBefore).length,
        slots: (slots!.results as { id: string; campaign_id: string; send_at: string; status: string; last_error: string | null }[])
          .filter((s) => s.campaign_id === cp.id)
          .map((s) => ({ id: s.id, sendAt: s.send_at, status: s.status, error: s.last_error })),
      })),
      inbox: (inbox!.results as { id: string; received_at: string; from_phone: string; body: string; action: string; handled: number; name: string | null }[]).map((r) => ({
        id: r.id, at: r.received_at, name: r.name ?? r.from_phone, body: r.body, action: r.action, handled: !!r.handled,
      })),
      history: (history!.results as { campaign_id: string | null; kind: string; minute: string; n: number; sample: string; ok: number; bad: number; campaign: string | null }[]).map((h) => ({
        at: `${h.minute}:00.000Z`,
        name: h.campaign ?? (h.kind === 'reply' ? 'Automatic reply' : h.kind === 'forward' ? 'Forwarded to you' : h.kind === 'test' ? 'Test to you' : 'Message'),
        count: h.n, sent: h.ok, failed: h.bad, sample: h.sample,
      })),
    });
  });

  /**
   * A new message of your own: switched off and sent by hand, unless it comes with its dates (e.g. the
   * "last call" a week before RSVPs close), when it's on autopilot for those dates straight away.
   */
  app.post('/', writer, async (c) => {
    const body = z
      .object({ name: z.string().trim().min(1).max(80), audience: Audience, body: z.string().max(1600).optional(), dates: z.array(z.string().datetime()).max(20).optional() })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Give the message a name and choose who it goes to.');
    const id = crypto.randomUUID();
    const now = nowIso();
    const dates = [...new Set(body.data.dates ?? [])].filter((x) => x > now);
    if (body.data.dates?.length && !dates.length) return err(c, 400, 'invalid', 'That date has already passed.');
    if (dates.length && !body.data.body?.trim()) return err(c, 400, 'invalid', 'Write the message first.');
    const sort = (await c.env.DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM campaign WHERE wedding_id = ?`).bind(wid(c)).first<{ n: number }>())!.n;
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO campaign (id, wedding_id, key, name, body, mode, enabled, audience, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        id, wid(c), `custom-${id.slice(0, 8)}`, body.data.name, body.data.body ?? '', dates.length ? 'dates' : 'manual', dates.length ? 1 : 0, JSON.stringify(body.data.audience), sort,
      ),
      ...dates.map((at) => c.env.DB.prepare(`INSERT INTO campaign_slot (id, campaign_id, send_at) VALUES (?, ?, ?)`).bind(crypto.randomUUID(), id, at)),
    ]);
    await audit(c, 'sms.campaign.add', id);
    return c.json({ id });
  });

  app.patch('/:cid', writer, async (c) => {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return err(c, 428, 'version_required', 'Reload and try again.');
    const body = Patch.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', body.error.issues[0]?.message ?? 'Please check the message.');
    const cid = c.req.param('cid');
    const cur = await c.env.DB.prepare(`SELECT key, mode, version FROM campaign WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(cid, wid(c)).first<{ key: string; mode: string; version: number }>();
    if (!cur) return err(c, 404, 'not_found', 'Message not found.');
    if (cur.version !== v) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    const p = body.data;
    if (p.name !== undefined && !cur.key.startsWith('custom-')) return err(c, 400, 'invalid', 'Built-in messages keep their names.');

    const sets: string[] = [];
    const vals: (string | number)[] = [];
    const set = (col: string, val: string | number) => (sets.push(`${col} = ?`), vals.push(val));
    if (p.name !== undefined) set('name', p.name);
    if (p.body !== undefined) set('body', p.body);
    if (p.enabled !== undefined) set('enabled', p.enabled ? 1 : 0);
    if (p.audience !== undefined) set('audience', JSON.stringify(p.audience));
    if (p.excluded !== undefined) set('excluded', JSON.stringify(p.excluded));
    if (p.dates !== undefined && cur.key.startsWith('custom-')) set('mode', p.dates.length ? 'dates' : 'manual');
    // Claim the version first, on its own: a batch doesn't stop when an UPDATE matches nothing, so a
    // losing save must never reach the send dates below.
    const claimed = await c.env.DB.prepare(`UPDATE campaign SET ${[...sets, 'version = version + 1'].join(', ')} WHERE id = ? AND version = ?`).bind(...vals, cid, v).run();
    if (!claimed.meta.changes) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    const stmts: D1PreparedStatement[] = [];
    if (p.dates !== undefined) {
      // Pending dates are replaced; ones already sent (or failed) stay as history.
      stmts.push(c.env.DB.prepare(`DELETE FROM campaign_slot WHERE campaign_id = ? AND status = 'pending'`).bind(cid));
      const now = nowIso();
      for (const at of [...new Set(p.dates)].filter((x) => x > now)) {
        stmts.push(c.env.DB.prepare(`INSERT INTO campaign_slot (id, campaign_id, send_at) VALUES (?, ?, ?)`).bind(crypto.randomUUID(), cid, at));
      }
    }
    if (stmts.length) await c.env.DB.batch(stmts);
    await audit(c, 'sms.campaign.edit', cid, Object.keys(p));
    return c.json({ ok: true, version: v + 1 });
  });

  app.delete('/:cid', writer, async (c) => {
    const cid = c.req.param('cid');
    const r = await c.env.DB.prepare(`UPDATE campaign SET deleted_at = ?, enabled = 0 WHERE id = ? AND wedding_id = ? AND key LIKE 'custom-%' AND deleted_at IS NULL`).bind(nowIso(), cid, wid(c)).run();
    if (!r.meta.changes) return err(c, 400, 'invalid', 'Built-in messages can be switched off, not deleted.');
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE campaign_slot SET status = 'cancelled' WHERE campaign_id = ? AND status = 'pending'`).bind(cid),
      // Texts already queued for it (e.g. held for the morning) don't go either. (Ones already handed to the provider can't be recalled.)
      c.env.DB.prepare(`UPDATE sms_out SET status = 'cancelled', error = 'Message deleted' WHERE campaign_id = ? AND status = 'queued' AND batch_key IS NULL`).bind(cid),
    ]);
    await audit(c, 'sms.campaign.delete', cid);
    return c.json({ ok: true });
  });

  /** When invitations start going out (null = back to 8 months before the first event). */
  app.put('/invites-from', writer, async (c) => {
    const body = z.object({ date: z.string().datetime().nullable() }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose a date.');
    await c.env.DB.prepare(`UPDATE wedding SET invites_from = ?, version = version + 1, updated_at = ? WHERE id = ?`).bind(body.data.date, nowIso(), wid(c)).run();
    await audit(c, 'sms.invites-from', wid(c), body.data);
    const w = await deps(c.env).store.wedding(wid(c));
    return c.json({ invitesFrom: w?.invitesFrom ?? null, invitesFromCustom: !!w?.invitesFromCustom });
  });

  /** Count, cost and a sample, for the saved message or a draft. Never sends. */
  app.post('/:cid/estimate', async (c) => {
    const body = Draft.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Please check the message.');
    const { only, ...draft } = body.data;
    try {
      return c.json(await estimate(deps(c.env), wid(c), c.req.param('cid'), only, draft));
    } catch (e) {
      return err(c, 404, 'not_found', (e as Error).message);
    }
  });

  app.post('/:cid/send', writer, async (c) => {
    if (!allows(await weddingPlan(c.env.DB, wid(c)), 'texts')) return needsUpgrade(c, 'texts');
    const body = z.object({ only: z.array(z.string()).max(2000).optional() }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Please choose who to send to.');
    try {
      const res = await sendNow(deps(c.env), wid(c), c.req.param('cid'), body.data.only);
      await audit(c, 'sms.send', c.req.param('cid'), { queued: res.queued, sent: res.sent, failed: res.failed });
      return c.json(res);
    } catch (e) {
      return err(c, 400, 'send_failed', (e as Error).message);
    }
  });

  /** "Send me a test": to the couple's own mobile, any hour. */
  app.post('/test', writer, async (c) => {
    if (!allows(await weddingPlan(c.env.DB, wid(c)), 'texts')) return needsUpgrade(c, 'texts');
    const body = z.object({ body: z.string().min(1).max(1600) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Write the message first.');
    const d = deps(c.env);
    const w = await d.store.wedding(wid(c));
    if (!w?.adminMobile) return err(c, 400, 'no_mobile', 'Add your mobile in SMS setup first.');
    try {
      const res = await sendTest(d, w.id, w.adminMobile, body.data.body);
      await audit(c, 'sms.test', w.id, res);
      return c.json(res);
    } catch (e) {
      return err(c, 400, 'send_failed', (e as Error).message);
    }
  });

  return app;
}

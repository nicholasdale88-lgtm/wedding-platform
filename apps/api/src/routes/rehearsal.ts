import { guidesOf } from '@wp/shared';
import { Hono } from 'hono';
import type { Env } from '../env';
import { rehearse, type RehearsalEvent, type RehearsalFacts } from '../lib/rehearsal';
import { safeJson } from '../lib/security';
import { canStore } from '../photos/store';
import type { EngineDeps } from '../sms/engine';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { sendViaOf } from './ownPhone';
import { readDoc } from './planner';

/**
 * The D-Day rehearsal (/api/a/w/:wid/rehearsal?asOf=<ISO>): the wedding run as a simulation on the
 * couple's real guests, words and settings (lib/rehearsal.ts). `asOf` says which moment is "now" in the
 * simulation; every moment comes back, so the page can move along the timeline without asking again.
 * Read-only: it sends nothing, saves nothing and never marks an invitation as opened.
 */
export function rehearsalRoutes(deps: (env: Env) => EngineDeps) {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());

  app.get('/', async (c) => {
    const d = deps(c.env);
    const wid = c.req.param('wid')!;
    const w = await d.store.wedding(wid);
    if (!w) return c.json({ error: { code: 'not_found', message: 'Wedding not found.' } }, 404);
    const db = c.env.DB;
    const [{ events: eventInfo, recipients }, campaigns, invitedBefore, via, photos] = await Promise.all([
      d.store.audience(w.id),
      d.store.campaigns(w.id),
      d.store.invitedIds(w.id),
      sendViaOf(db, w.id),
      canStore(c.env, w.id).catch(() => false),
    ]);
    const [evRows, slotRows, peopleRows, tableRows, pubRows, wRow, partyRow, signInRow] = await db.batch([
      db.prepare(`SELECT id, key, name, starts_at, venue, address, catered FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(w.id),
      db.prepare(`SELECT s.campaign_id, s.send_at, s.status FROM campaign_slot s JOIN campaign c ON c.id = s.campaign_id WHERE c.wedding_id = ? ORDER BY s.send_at`).bind(w.id),
      db.prepare(
        `SELECT p.id, p.invitation_id, p.idx, p.name, p.diet FROM person p JOIN invitation i ON i.id = p.invitation_id
          WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY p.invitation_id, p.idx`,
      ).bind(w.id),
      db.prepare(`SELECT event_id, COUNT(*) AS n FROM seat_table WHERE wedding_id = ? AND deleted_at IS NULL GROUP BY event_id`).bind(w.id),
      db.prepare(`SELECT sp.event_id, sp.snapshot FROM seat_publish sp JOIN event e ON e.id = sp.event_id WHERE e.wedding_id = ?`).bind(w.id),
      db.prepare(`SELECT content, guide FROM wedding WHERE id = ?`).bind(w.id),
      db.prepare(
        `SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id
          WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND p.party_role != ''`,
      ).bind(w.id),
      db.prepare(`SELECT COUNT(*) AS n FROM party_account WHERE wedding_id = ? AND deleted_at IS NULL AND pass_hash IS NOT NULL`).bind(w.id),
    ]);
    type EvRow = { id: string; key: string; name: string; starts_at: string; venue: string | null; address: string | null; catered: number | null };
    const evs = evRows!.results as EvRow[];
    const row = wRow!.results[0] as { content: string; guide: string } | undefined;
    const content = safeJson<Record<string, unknown>>(row?.content, {});
    const guides = guidesOf(safeJson(row?.guide, {}), evs.map((e) => e.key));
    const tables = new Map((tableRows!.results as { event_id: string; n: number }[]).map((t) => [t.event_id, Number(t.n)]));
    const pubs = new Map((pubRows!.results as { event_id: string; snapshot: string }[]).map((p) => [p.event_id, safeJson<{ seats?: Record<string, string>; tables?: { id: string; name: string }[] } | null>(p.snapshot, null)]));
    const events: RehearsalEvent[] = evs.map((e) => {
      const snap = pubs.get(e.id);
      return {
        id: e.id,
        key: e.key,
        name: e.name,
        startsAt: e.starts_at,
        venue: e.venue ?? '',
        address: e.address ?? '',
        catered: e.catered !== 0,
        guide: guides[e.key] ?? null,
        tables: tables.get(e.id) ?? 0,
        published: snap ? { seats: snap.seats ?? {}, tables: (snap.tables ?? []).map((t) => ({ id: t.id, name: t.name })) } : null,
      };
    });
    const slots = slotRows!.results as { campaign_id: string; send_at: string; status: string }[];
    const coord = (content.coordinator ?? null) as { key?: string; name?: string } | null;
    const first = events[0];
    const facts: RehearsalFacts = {
      now: d.now().toISOString(),
      wedding: w,
      via: via.via,
      dateToBeSet: content.dateToBeSet === true,
      events,
      eventInfo,
      recipients,
      people: (peopleRows!.results as { id: string; invitation_id: string; idx: number; name: string; diet: string | null }[]).map((p) => ({ id: p.id, invitationId: p.invitation_id, idx: p.idx, name: p.name, diet: p.diet ?? '' })),
      campaigns: campaigns.map((cp) => ({ ...cp, slots: slots.filter((s) => s.campaign_id === cp.id).map((s) => ({ sendAt: s.send_at, status: s.status })) })),
      invitedBefore,
      party: {
        members: Number((partyRow!.results[0] as { n: number } | undefined)?.n ?? 0),
        signIns: Number((signInRow!.results[0] as { n: number } | undefined)?.n ?? 0),
        runsheet: first ? (await readDoc(db, w.id, 'party-runsheet', first.key)).data.items : [],
      },
      coordinator: { on: !!coord?.key, name: coord?.name ?? '' },
      photos,
    };
    return c.json(rehearse(facts, c.req.query('asOf')));
  });

  return app;
}

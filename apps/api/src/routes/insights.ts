import { dietCategories, InvitationContent, Shuttles } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { safeJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Wedding planner → Insights: the numbers behind the plan. Replies per event (invited, opened, replied,
 * yes, people coming) and how they came in over time; each guest group's replies; what's been sent;
 * what guests are doing (photos, board, songs, emails). The planning documents are read by the page.
 */

type C = Context<AdminEnv>;
const wid = (c: C) => c.req.param('wid')!;

export function insightsRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());

  app.get('/', async (c) => {
    const db = c.env.DB;
    const w = wid(c);
    const [events, perEvent, opened, byDay, groups, sms, photos, board, songs, emails, party] = await db.batch([
      db.prepare(`SELECT id, key, name, starts_at FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(w),
      db.prepare(
        `SELECT ie.event_id,
                COUNT(*) AS invited,
                SUM(r.attending = 1) AS yes,
                SUM(r.attending = 0) AS no,
                SUM(CASE WHEN r.attending = 1 THEN r.count ELSE 0 END) AS people,
                SUM((SELECT COUNT(*) FROM person p WHERE p.invitation_id = i.id AND p.deleted_at IS NULL)) AS seats
           FROM invite_event ie JOIN invitation i ON i.id = ie.invitation_id AND i.deleted_at IS NULL AND i.wedding_id = ?
           LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ie.event_id
          GROUP BY ie.event_id`,
      ).bind(w),
      db.prepare(`SELECT COUNT(*) AS n, SUM(opened_at IS NOT NULL) AS opened FROM invitation WHERE wedding_id = ? AND deleted_at IS NULL`).bind(w),
      db.prepare(
        `SELECT substr(r.updated_at, 1, 10) AS day, COUNT(*) AS n FROM rsvp r JOIN invitation i ON i.id = r.invitation_id AND i.wedding_id = ? AND i.deleted_at IS NULL
          WHERE r.attending IS NOT NULL GROUP BY day ORDER BY day`,
      ).bind(w),
      db.prepare(
        `SELECT CASE WHEN i.party = '' THEN 'No group' ELSE i.party END AS grp, COUNT(DISTINCT i.id) AS invited,
                COUNT(DISTINCT CASE WHEN r.attending = 1 THEN i.id END) AS yes, COUNT(DISTINCT CASE WHEN r.attending = 0 THEN i.id END) AS no
           FROM invitation i LEFT JOIN rsvp r ON r.invitation_id = i.id
          WHERE i.wedding_id = ? AND i.deleted_at IS NULL GROUP BY grp ORDER BY invited DESC LIMIT 30`,
      ).bind(w),
      db.prepare(`SELECT COUNT(*) AS texts, COALESCE(SUM(parts), 0) AS parts, SUM(status = 'failed') AS failed FROM sms_out WHERE wedding_id = ? AND status IN ('sent', 'delivered', 'failed')`).bind(w),
      db.prepare(`SELECT COUNT(*) AS n FROM media WHERE wedding_id = ? AND kind IN ('photo', 'video') AND deleted_at IS NULL`).bind(w),
      db.prepare(`SELECT COUNT(*) AS n FROM board_post WHERE wedding_id = ? AND status = 'shown'`).bind(w),
      db.prepare(`SELECT COUNT(*) AS n FROM song_request WHERE wedding_id = ? AND deleted_at IS NULL`).bind(w),
      db.prepare(`SELECT COUNT(*) AS n, SUM(kind = 'vendor') AS vendors, SUM(kind = 'guest') AS guests FROM inbox_email WHERE wedding_id = ?`).bind(w),
      db.prepare(`SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND p.party_role != ''`).bind(w),
    ]);
    // The first event (the wedding): catering, seating and shuttles.
    const firstEv = (events!.results as { id: string; key: string }[])[0];
    const extra = firstEv
      ? await db.batch([
          db.prepare(
            `SELECT p.diet, p.meal_main AS main FROM person p JOIN invitation i ON i.id = p.invitation_id AND i.wedding_id = ? AND i.deleted_at IS NULL
               JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ? AND r.attending = 1 WHERE p.deleted_at IS NULL`,
          ).bind(w, firstEv.id),
          db.prepare(`SELECT COUNT(*) AS tables, COALESCE(SUM(seats), 0) AS seats FROM seat_table WHERE event_id = ? AND deleted_at IS NULL`).bind(firstEv.id),
          db.prepare(`SELECT COUNT(*) AS n FROM seat WHERE event_id = ?`).bind(firstEv.id),
          db.prepare(`SELECT data FROM planner_doc WHERE wedding_id = ? AND kind = 'shuttles' AND scope = ?`).bind(w, firstEv.key),
          db.prepare(`SELECT COALESCE(SUM(seats), 0) AS n FROM shuttle_booking WHERE wedding_id = ?`).bind(w),
          db.prepare(`SELECT content FROM wedding WHERE id = ?`).bind(w),
        ])
      : null;
    const coming = (extra?.[0]?.results ?? []) as { diet: string; main: string }[];
    const dietCounts = new Map<string, number>();
    for (const p of coming) for (const k of dietCategories(p.diet)) dietCounts.set(k, (dietCounts.get(k) ?? 0) + 1);
    const mains = new Map<string, number>();
    for (const p of coming) if (p.diet.trim()) mains.set(p.main.trim() || 'Not set yet', (mains.get(p.main.trim() || 'Not set yet') ?? 0) + 1);
    const runs = Shuttles.safeParse(safeJson(((extra?.[3]?.results[0] ?? {}) as { data?: string }).data, {})).data?.list ?? [];
    const inv = InvitationContent.safeParse(safeJson<Record<string, unknown>>(((extra?.[5]?.results[0] ?? {}) as { content?: string }).content, {}).invitation ?? {});
    type Row = Record<string, number | null>;
    const one = (r: D1Result | undefined) => ((r?.results[0] ?? {}) as Row);
    const n = (x: number | null | undefined) => Number(x ?? 0);
    const stats = new Map((perEvent!.results as (Row & { event_id: string })[]).map((r) => [r.event_id, r]));
    return c.json({
      events: (events!.results as { id: string; key: string; name: string; starts_at: string }[]).map((e) => {
        const s = stats.get(e.id);
        const invited = n(s?.invited);
        const yes = n(s?.yes);
        const no = n(s?.no);
        return { key: e.key, name: e.name, startsAt: e.starts_at, invited, yes, no, awaiting: Math.max(0, invited - yes - no), people: n(s?.people), seats: n(s?.seats) };
      }),
      opened: { invitations: n(one(opened).n), opened: n(one(opened).opened) },
      repliesByDay: (byDay!.results as { day: string; n: number }[]).map((r) => ({ day: r.day, n: n(r.n) })),
      groups: (groups!.results as { grp: string; invited: number; yes: number; no: number }[]).map((g) => ({ group: g.grp, invited: n(g.invited), yes: n(g.yes), no: n(g.no) })),
      texts: { sent: n(one(sms).texts), parts: n(one(sms).parts), failed: n(one(sms).failed) },
      catering: { people: coming.length, withNeeds: coming.filter((p) => p.diet.trim()).length, diets: [...dietCounts.entries()].sort((a, b) => b[1] - a[1]), mains: [...mains.entries()].sort((a, b) => b[1] - a[1]) },
      seating: { tables: n(one(extra?.[1]).tables), seats: n(one(extra?.[1]).seats), seated: n(one(extra?.[2]).n) },
      shuttles: { runs: runs.length, capacity: runs.reduce((a, s) => a + s.seats, 0), booked: n(one(extra?.[4]).n) },
      rsvpClose: inv.success ? (inv.data.rsvpClose ?? '') : '',
      guests: { photos: n(one(photos).n), board: n(one(board).n), songs: n(one(songs).n), emails: n(one(emails).n), vendorEmails: n(one(emails).vendors), guestEmails: n(one(emails).guests), party: n(one(party).n) },
    });
  });
  return app;
}

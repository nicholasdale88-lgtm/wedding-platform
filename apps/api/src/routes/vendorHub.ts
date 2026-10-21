import { guidesOf, isSerious, scheduleOf } from '@wp/shared';
import { Hono } from 'hono';
import type { Env } from '../env';
import { sessionId } from '../lib/auth';
import { allow } from '../lib/rateLimit';
import { safeJson } from '../lib/security';
import { readDoc } from './planner';
import { loadSeating } from './seating';

/**
 * A vendor's own page (the celebrant, the caterer, the photographer…): /api/p/:slug/vendor/:vid/:key. The
 * details they need, always up to date: the day, the venue, when to arrive, the timeline, guest numbers
 * and dietary needs (for whoever feeds people), their meals, their payments, and who to call on the day.
 * Nothing about guests by name, unless the couple shares the seating with this vendor (the caterer): then
 * each table, and who has a special meal at which seat. The key is made from the vendor and the server
 * secret: it can't be guessed, and removing the vendor ends it.
 */
export async function vendorHubKey(secret: string, weddingId: string, vendorId: string) {
  return (await sessionId(`vendor-hub:${weddingId}:${vendorId}`, secret)).slice(0, 24);
}

export function vendorHubRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/:vid/:key', async (c) => {
    const none = () => c.json({ error: { code: 'no_link', message: 'This page isn’t available. Please ask the couple for a new link.' } }, 404);
    if (!(await allow(c.env.DB, `vendor-hub:${c.req.header('CF-Connecting-IP') ?? 'local'}`, 120, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const secret = c.env.SESSION_SECRET;
    const db = c.env.DB;
    const w = await db.prepare(`SELECT id, name1, name2, timezone, guide, admin_mobile FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug')).first<{ id: string; name1: string; name2: string; timezone: string; guide: string; admin_mobile: string | null }>();
    if (!w || !secret || c.req.param('key') !== (await vendorHubKey(secret, w.id, c.req.param('vid')))) return none();
    const v = (await readDoc(db, w.id, 'vendors', '')).data.list.find((x) => x.id === c.req.param('vid'));
    if (!v || v.status === 'declined') return none();
    const ev = await db.prepare(`SELECT id, key, name, starts_at, venue, address FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(w.id).first<{ id: string; key: string; name: string; starts_at: string; venue: string | null; address: string | null }>();
    // How many are coming, and what they can't eat (counts only, never names).
    const counts = ev
      ? await db
          .prepare(
            `SELECT COALESCE(SUM(CASE WHEN r.attending = 1 THEN r.count ELSE 0 END), 0) AS coming,
                    COALESCE(SUM(CASE WHEN r.attending IS NULL THEN i.seats_held ELSE 0 END), 0) AS waiting
               FROM invitation i JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = ?1
               LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ?1
              WHERE i.wedding_id = ?2 AND i.deleted_at IS NULL`,
          )
          .bind(ev.id, w.id)
          .first<{ coming: number; waiting: number }>()
      : null;
    const { results: diets } = ev
      ? await db
          .prepare(
            `SELECT p.diet FROM person p JOIN invitation i ON i.id = p.invitation_id JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = ? AND r.attending = 1
              WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND trim(p.diet) != ''`,
          )
          .bind(ev.id, w.id)
          .all<{ diet: string }>()
      : { results: [] as { diet: string }[] };
    const tally = new Map<string, number>();
    for (const d of diets) for (const part of d.diet.split(/[;,]\s*/).map((x) => x.trim()).filter(Boolean)) tally.set(part, (tally.get(part) ?? 0) + 1);
    const guide = ev ? guidesOf(safeJson(w.guide, {}), [ev.key])[ev.key] : undefined;
    const g = guide as Record<string, unknown> | undefined;
    const contacts = (g?.contacts as { name: string; role: string; phone: string }[] | undefined) ?? [];
    // The caterer's table plan: what guests were shown (or the saved plan, if it isn't published yet).
    let seating = null;
    if (v.shareSeating) {
      const s = await loadSeating(db, w.id);
      if (s) {
        const plan = s.publishedPlan ?? s.draft;
        const people = s.view.people.filter((p) => p.coming && plan.seats[p.id]);
        const num = (t: string) => (/^\d+$/.test(t) ? `Table ${t}` : t);
        const tables = [...plan.tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        const special = (p: (typeof people)[number]) => !!(p.diet.trim() || p.meal.e || p.meal.m || p.meal.d);
        const rows = tables.flatMap((t) =>
          people
            .filter((p) => plan.seats[p.id] === t.id)
            .map((p, i) => ({ table: num(t.name), tableId: t.id, seat: i + 1, name: p.name, diet: p.diet, meal: p.meal, serious: isSerious(p.diet), special: special(p) })),
        );
        seating = {
          event: s.view.event.name,
          aspect: plan.aspect || s.view.aspect,
          published: !!s.publishedPlan,
          tables: tables.map((t) => {
            const here = rows.filter((r) => r.tableId === t.id);
            return { id: t.id, name: num(t.name), shape: t.shape, dir: t.dir, len: t.len, x: t.x, y: t.y, seats: t.seats, guests: here.length, special: here.filter((r) => r.special).length, serious: here.some((r) => r.serious) };
          }),
          areas: plan.areas,
          special: rows.filter((r) => r.special).map((r) => ({ table: r.table, seat: r.seat, name: r.name, diet: r.diet, meal: r.meal, serious: r.serious })),
          notSeated: s.view.people.filter((p) => p.coming && !plan.seats[p.id] && special(p)).map((p) => ({ name: p.name, diet: p.diet, meal: p.meal, serious: isSerious(p.diet) })),
        };
      }
    }
    return c.json({
      couple: `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`,
      seating,
      vendor: { name: v.name, category: v.category, arrival: v.arrival, meals: v.meals, notes: '' },
      event: ev ? { name: ev.name, startsAt: ev.starts_at, venue: ev.venue ?? '', address: ev.address ?? '' } : null,
      timezone: w.timezone,
      parking: [g?.parking, g?.parkDirections].filter((x): x is string => typeof x === 'string' && !!x.trim()).join(' '),
      timeline: ((g?.runsheet as { t: string; what: string; where: string }[] | undefined) ?? []).filter((r) => r.t || r.what),
      guests: counts ? { coming: counts.coming, waiting: counts.waiting } : null,
      dietary: [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([diet, n]) => ({ diet, n, serious: isSerious(diet) })),
      payments: scheduleOf(v).map((p) => ({ label: p.label, amount: p.amount, due: p.due, paid: p.paid })),
      // Who to call on the day: the guide's contacts (the coordinator first), else the couple.
      contacts: contacts.length ? contacts : w.admin_mobile ? [{ name: `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`, role: 'The couple', phone: w.admin_mobile }] : [],
      updatedAt: new Date().toISOString(),
    });
  });
  return app;
}

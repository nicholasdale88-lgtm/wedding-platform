import { commitmentOf, dateIn, guidesOf, isToken, itemsFor, PARTY_ROLES, PartySide, PLANNER_DOCS, sideDoc, sideOf, VENDOR_SEARCH, type PlannerKind } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { MAX_PLANNER_FILE, readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * The planner. Admin (/api/a/w/:wid/planner): the wedding party (roles on guests), its run sheet per
 * event, the partners' on-the-day checklists, and the generic planning documents behind them (JSON with
 * a version, checked against the shared schema on every save). Guests (/api/p/:slug/party?g=): a party
 * member's own run sheet, only the items for them, only for events they're invited to.
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 429 | 502, code: string, message: string) => c.json({ error: { code, message } }, status);
const wid = (c: C) => c.req.param('wid')!;
const json = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};
const isKind = (k: string): k is PlannerKind => Object.prototype.hasOwnProperty.call(PLANNER_DOCS, k); // not 'constructor' and friends

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
      `SELECT p.id, p.invitation_id, p.name, p.party_role, i.phone FROM person p JOIN invitation i ON i.id = p.invitation_id
        WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND p.party_role != '' ORDER BY p.party_role, p.name`,
    )
    .bind(weddingId)
    .all<{ id: string; invitation_id: string; name: string; party_role: string; phone: string | null }>();
  return results.map((r) => ({ personId: r.id, invitationId: r.invitation_id, name: r.name, role: r.party_role, side: sideOf(r.party_role), phone: r.phone ?? '' }));
}

/** Change one side's document on behalf of a member (read, change, save only if no one saved in between; retried). */
async function changeSide(db: D1Database, weddingId: string, kind: 'party-p1' | 'party-p2' | 'party-help', fn: (d: PartySide) => void): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await readDoc(db, weddingId, kind, '');
    const next = structuredClone(cur.data);
    fn(next);
    const parsed = PartySide.safeParse(next);
    if (!parsed.success) return false;
    const data = JSON.stringify(parsed.data);
    const now = new Date().toISOString();
    const res =
      cur.version === 0
        ? await db.prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?, ?, '', ?, 1, ?) ON CONFLICT DO NOTHING`).bind(weddingId, kind, data, now).run()
        : await db.prepare(`UPDATE planner_doc SET data = ?, version = version + 1, updated_at = ? WHERE wedding_id = ? AND kind = ? AND scope = '' AND version = ?`).bind(data, now, weddingId, kind, cur.version).run();
    if (res.meta.changes) return true;
  }
  return false;
}

/**
 * The planner's part of Overview → Needs you: overdue checklist tasks (legal ones first), payments due in
 * the next fortnight or overdue, quotes about to lapse, new song requests. They open the Wedding planner
 * in the first event's section.
 */
export async function plannerNeedsYou(db: D1Database, weddingId: string, first: { key: string; starts_at: string } | undefined, now: Date, tz = 'Australia/Sydney') {
  if (!first) return [];
  const day = Date.parse(first.starts_at);
  const [checklist, budget, vendors, songs] = await Promise.all([
    readDoc(db, weddingId, 'checklist', ''),
    readDoc(db, weddingId, 'budget', ''),
    readDoc(db, weddingId, 'vendors', ''),
    db.prepare(`SELECT COUNT(*) AS n FROM song_request WHERE wedding_id = ? AND status = 'new' AND invitation_id IS NOT NULL AND deleted_at IS NULL`).bind(weddingId).first<{ n: number }>(),
  ]);
  const out: { kind: string; title: string; detail: string; cta: string; link: string; event: string }[] = [];
  const iso = (ms: number) => dateIn(tz, new Date(ms)); // dates where the wedding is
  const today = iso(now.getTime());
  const soon = iso(now.getTime() + 14 * 86_400_000);
  const overdue = Number.isNaN(day) ? [] : checklist.data.tasks.filter((t) => !t.done && day - t.before * 86_400_000 < now.getTime());
  if (overdue.length) {
    const legal = overdue.find((t) => t.legal);
    out.push({
      kind: 'plan-overdue',
      title: overdue.length === 1 ? `Overdue: ${overdue[0]!.text}` : `${overdue.length} planning tasks overdue`,
      detail: legal ? `Including a legal one: ${legal.text}` : overdue.slice(0, 2).map((t) => t.text).join('; '),
      cta: 'Checklist',
      link: 'planner?view=checklist',
      event: first.key,
    });
  }
  const named = new Set(budget.data.lines.map((l) => l.vendor.trim().toLowerCase()).filter(Boolean));
  const due = [
    ...budget.data.lines.filter((l) => l.due && l.due <= soon && (l.quote || l.estimate) > l.paid).map((l) => ({ what: l.item || l.category, due: l.due, amount: (l.quote || l.estimate) - l.paid })),
    ...vendors.data.list
      .filter((v) => v.status === 'booked' && v.balanceDue && v.balanceDue <= soon && !named.has(v.name.trim().toLowerCase()))
      .map((v) => ({ what: v.name, due: v.balanceDue, amount: commitmentOf(v).amount - (v.depositPaid ? commitmentOf(v).deposit : 0) })),
  ].filter((p) => p.amount > 0);
  if (due.length) {
    const late = due.filter((p) => p.due < today);
    out.push({
      kind: 'payments-due',
      title: late.length ? `${late.length} ${late.length === 1 ? 'payment' : 'payments'} overdue` : `${due.length} ${due.length === 1 ? 'payment' : 'payments'} due in the next fortnight`,
      detail: due
        .sort((a, b) => a.due.localeCompare(b.due))
        .slice(0, 3)
        .map((p) => `${p.what} $${Math.round(p.amount)}`)
        .join(', '),
      cta: 'Budget',
      link: 'planner?view=budget',
      event: first.key,
    });
  }
  const lapsing = vendors.data.list.flatMap((v) => (v.status === 'booked' ? [] : v.quotes.filter((q) => q.validUntil && q.validUntil >= today && q.validUntil <= soon).map(() => v.name)));
  if (lapsing.length) {
    out.push({ kind: 'quotes-lapsing', title: `${lapsing.length === 1 ? 'A quote runs' : `${lapsing.length} quotes run`} out soon`, detail: [...new Set(lapsing)].join(', '), cta: 'Vendors', link: 'planner?view=vendors', event: first.key });
  }
  if (songs?.n) {
    out.push({ kind: 'songs-new', title: `${songs.n} new song ${songs.n === 1 ? 'request' : 'requests'}`, detail: 'Mark them for the DJ: must play, maybe or don’t play.', cta: 'Music', link: 'planner?view=music', event: first.key });
  }
  return out;
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
      setup: await readDoc(db, wid(c), 'party-setup', ''),
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

  /**
   * Find vendors near the venue: OpenStreetMap (free, no key) within `km` of the event's venue (its
   * latitude and longitude from Setup → Night-before page), nearest first.
   */
  app.get('/vendors/search', async (c) => {
    const cat = VENDOR_SEARCH[c.req.query('category') ?? ''];
    const km = Math.min(100, Math.max(1, Number(c.req.query('km')) || 25));
    if (!cat) return err(c, 400, 'invalid', 'Choose what to look for.');
    if (!(await allow(c.env.DB, `vendors:${wid(c)}`, 40, 3_600_000))) return err(c, 429, 'slow_down', 'That is a lot of searches. Try again in a little while.');
    const db = c.env.DB;
    const w = await db.prepare(`SELECT guide FROM wedding WHERE id = ?`).bind(wid(c)).first<{ guide: string }>();
    const { results: evs } = await db.prepare(`SELECT key, name FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(wid(c)).all<{ key: string; name: string }>();
    const guides = guidesOf(json(w?.guide, {}), evs.map((e) => e.key));
    const ev = evs.find((e) => e.key === c.req.query('event') && guides[e.key]?.lat !== undefined) ?? evs.find((e) => guides[e.key]?.lat !== undefined);
    const g = ev ? guides[ev.key] : undefined;
    if (!ev || g?.lat === undefined || g.lon === undefined) {
      return err(c, 400, 'no_venue', "Add your venue's latitude and longitude first (Setup → Night-before page → Arrival and parking).");
    }
    const lat0 = g.lat;
    const lon0 = g.lon;
    const filters = cat.tags.map((t) => {
      const [k, v] = t.split('=');
      return `nwr["${k}"="${v}"](around:${km * 1000},${lat0},${lon0});`;
    });
    const query = `[out:json][timeout:20];(${filters.join('')});out center tags 80;`;
    let els: { lat?: number; lon?: number; center?: { lat: number; lon: number }; id: number; type: string; tags?: Record<string, string> }[] = [];
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'wedding-platform vendor finder' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(String(res.status));
      els = ((await res.json()) as { elements: typeof els }).elements ?? [];
    } catch {
      return err(c, 502, 'unavailable', 'The map search is busy. Please try again in a minute.');
    }
    const rad = (d: number) => (d * Math.PI) / 180;
    const dist = (lat: number, lon: number) => {
      const a = Math.sin(rad(lat - lat0) / 2) ** 2 + Math.cos(rad(lat0)) * Math.cos(rad(lat)) * Math.sin(rad(lon - lon0) / 2) ** 2;
      return 6371 * 2 * Math.asin(Math.sqrt(a));
    };
    const seen = new Set<string>();
    const found = els
      .map((e) => {
        const t = e.tags ?? {};
        const lat = e.lat ?? e.center?.lat;
        const lon = e.lon ?? e.center?.lon;
        if (!t.name || lat === undefined || lon === undefined) return null;
        const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
        return {
          osm: `${e.type}/${e.id}`,
          name: t.name,
          address: [street, t['addr:suburb'] ?? t['addr:city'], t['addr:postcode']].filter(Boolean).join(', '),
          phone: t.phone ?? t['contact:phone'] ?? '',
          email: t.email ?? t['contact:email'] ?? '',
          website: t.website ?? t['contact:website'] ?? '',
          km: Math.round(dist(lat, lon) * 10) / 10,
          lat,
          lon,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x && !seen.has(x.name.toLowerCase()) && !!seen.add(x.name.toLowerCase()))
      .sort((a, b) => a.km - b.km)
      .slice(0, 40);
    return c.json({ venue: { event: ev.name, lat: lat0, lon: lon0 }, km, category: cat.label, results: found });
  });

  /**
   * The planning assistant: answers from this wedding's own details (dates, numbers, budget, vendors,
   * the party), on Workers AI's free allowance; at most 40 questions a day per wedding.
   */
  /** Whether the assistant (and reading quotes) is switched on for this site. */
  app.get('/ask', async (c) => c.json({ on: !!c.env.AI, readsFiles: !!c.env.AI?.toMarkdown }));

  app.post('/ask', writer, async (c) => {
    const body = z
      .object({ question: z.string().trim().min(1).max(800), history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) })).max(8).default([]) })
      .strict()
      .safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Ask a question (up to 800 characters).');
    if (!c.env.AI) return err(c, 400, 'off', "The planning assistant isn't switched on for this site yet.");
    if (!(await allow(c.env.DB, `ask:${wid(c)}`, 40, 86_400_000))) return err(c, 429, 'slow_down', "That's today's questions used up. Ask again tomorrow.");
    const db = c.env.DB;
    const w = await db.prepare(`SELECT name1, name2, timezone FROM wedding WHERE id = ?`).bind(wid(c)).first<{ name1: string; name2: string; timezone: string }>();
    const { results: events } = await db
      .prepare(
        `SELECT e.key, e.name, e.starts_at, e.venue,
                (SELECT COUNT(*) FROM invite_event ie JOIN invitation i ON i.id = ie.invitation_id AND i.deleted_at IS NULL WHERE ie.event_id = e.id) AS invited,
                (SELECT COUNT(*) FROM rsvp r WHERE r.event_id = e.id AND r.attending = 1) AS yes,
                (SELECT COALESCE(SUM(r.count), 0) FROM rsvp r WHERE r.event_id = e.id AND r.attending = 1) AS coming
           FROM event e WHERE e.wedding_id = ? AND e.deleted_at IS NULL ORDER BY e.sort`,
      )
      .bind(wid(c))
      .all<{ key: string; name: string; starts_at: string; venue: string | null; invited: number; yes: number; coming: number }>();
    const budget = (await readDoc(db, wid(c), 'budget', '')).data;
    const vendors = (await readDoc(db, wid(c), 'vendors', '')).data.list;
    const crew = await members(db, wid(c));
    const spend = budget.lines.reduce((a, l) => a + (l.quote || l.estimate), 0);
    const paid = budget.lines.reduce((a, l) => a + l.paid, 0);
    const facts = [
      `Today: ${dateIn(w?.timezone)}. Couple: ${w?.name1} and ${w?.name2}. Timezone ${w?.timezone}.`,
      ...events.map((e) => `Event "${e.name}" on ${e.starts_at.slice(0, 16).replace('T', ' ')}${e.venue ? ` at ${e.venue}` : ''}: ${e.invited} invitations, ${e.yes} replied yes (${e.coming} people coming).`),
      budget.total ? `Budget: $${budget.total} total, $${spend} committed, $${paid} paid.` : 'No budget entered yet.',
      ...budget.lines.filter((l) => (l.quote || l.estimate) > l.paid && l.due).slice(0, 8).map((l) => `Owing: ${l.item || l.category} $${(l.quote || l.estimate) - l.paid} due ${l.due}.`),
      vendors.length ? `Vendors: ${vendors.map((v) => `${v.name} (${v.category || 'vendor'}, ${v.status})`).join('; ')}.` : 'No vendors recorded yet.',
      crew.length ? `Wedding party: ${crew.map((m) => `${m.name} (${m.role})`).join('; ')}.` : 'No wedding party recorded yet.',
    ].join('\n');
    const system =
      'You are a warm, practical wedding planning assistant for an Australian couple using their wedding app. Use Australian spelling. ' +
      'Be concise: short paragraphs or a short list, under 220 words unless asked for a draft (vows, speeches, wording). ' +
      'Use the facts below about their wedding; never invent bookings, names, prices or dates that are not there, and say when something is missing. ' +
      'Australian law: the Notice of Intended Marriage must reach the celebrant at least one month (and no more than 18 months) before the wedding. ' +
      'When useful, point them to the app: Guest planning, Wedding party, SMS, Photos, Setup, Budget, Vendors.\n\nFacts:\n' +
      facts;
    try {
      const out = (await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'system', content: system }, ...body.data.history.map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: body.data.question }],
        max_tokens: 700,
        temperature: 0.4,
      })) as { response?: string };
      const answer = (out.response ?? '').trim();
      if (!answer) throw new Error('empty');
      return c.json({ answer });
    } catch {
      return err(c, 502, 'unavailable', 'The assistant is busy right now. Please try again in a minute.');
    }
  });

  // ---------------------------------------------------------------- quote files

  /** File a quote (a PDF or photo, base64 in JSON, up to 1.5 MB). Returns its id for the vendor's quote. */
  app.post('/files', writer, async (c) => {
    const body = z
      .object({ name: z.string().trim().min(1).max(160), type: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']), data: z.string().max(Math.ceil(MAX_PLANNER_FILE * 1.4)) })
      .strict()
      .safeParse(await readJson(c.req.raw, Math.ceil(MAX_PLANNER_FILE * 1.4) + 4096));
    if (!body.success) return err(c, 400, 'invalid', 'Choose a PDF or a photo of the quote, up to 1.5 MB.');
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(body.data.data), (ch) => ch.charCodeAt(0));
    } catch {
      return err(c, 400, 'invalid', 'That file could not be read.');
    }
    if (bytes.byteLength > MAX_PLANNER_FILE) return err(c, 400, 'too_large', 'That file is over 1.5 MB. Try a smaller PDF or a photo.');
    // It must really be what it says (a PDF starts %PDF; images by their first bytes).
    const head = String.fromCharCode(...bytes.slice(0, 12));
    const t = body.data.type;
    const real =
      t === 'application/pdf'
        ? head.startsWith('%PDF')
        : t === 'image/jpeg'
          ? bytes[0] === 0xff && bytes[1] === 0xd8
          : t === 'image/png'
            ? bytes[0] === 0x89 && head.slice(1, 4) === 'PNG'
            : t === 'image/webp'
              ? head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP'
              : head.slice(4, 8) === 'ftyp';
    if (!real) return err(c, 400, 'invalid', "That file isn't the PDF or photo it says it is.");
    const id = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO planner_file (id, wedding_id, name, type, bytes, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        id,
        wid(c),
        body.data.name,
        t,
        bytes.byteLength,
        bytes,
        new Date().toISOString(),
      ),
      audit(c, 'planner.file', id),
    ]);
    return c.json({ id, name: body.data.name });
  });

  const fileOf = (c: C, id: string) =>
    c.env.DB.prepare(`SELECT name, type, data FROM planner_file WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`)
      .bind(id, wid(c))
      .first<{ name: string; type: string; data: ArrayBuffer | number[] }>();
  const asBytes = (d: ArrayBuffer | number[]) => (d instanceof ArrayBuffer ? new Uint8Array(d) : Uint8Array.from(d));

  /** The file itself, for members only; shown in the browser, never run. */
  app.get('/files/:id', async (c) => {
    const f = await fileOf(c, c.req.param('id'));
    if (!f) return err(c, 404, 'not_found', 'File not found.');
    return new Response(asBytes(f.data), {
      headers: {
        'content-type': f.type,
        'content-disposition': `inline; filename="${f.name.replace(/[^\w. -]/g, '_')}"`,
        'cache-control': 'private, max-age=3600',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        'x-content-type-options': 'nosniff',
      },
    });
  });

  app.delete('/files/:id', writer, async (c) => {
    const r = await c.env.DB.prepare(`UPDATE planner_file SET deleted_at = ? WHERE id = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(new Date().toISOString(), c.req.param('id'), wid(c)).run();
    if (!r.meta.changes) return err(c, 404, 'not_found', 'File not found.');
    return c.json({ ok: true });
  });

  /**
   * Read a quote for you: the file to text (Workers AI), then the numbers and what's in and out.
   * Returns a suggestion to check before saving; nothing is changed.
   */
  app.post('/files/:id/read', writer, async (c) => {
    if (!c.env.AI?.toMarkdown) return err(c, 400, 'off', "Reading quotes needs the planning assistant, which isn't switched on yet.");
    if (!(await allow(c.env.DB, `ask:${wid(c)}`, 40, 86_400_000))) return err(c, 429, 'slow_down', "That's today's assistant use up. Fill it in yourself, or try tomorrow.");
    const f = await fileOf(c, c.req.param('id'));
    if (!f) return err(c, 404, 'not_found', 'File not found.');
    let text = '';
    try {
      const md = await c.env.AI.toMarkdown([{ name: f.name, blob: new Blob([asBytes(f.data)], { type: f.type }) }]);
      text = (md[0]?.data ?? '').replace(/[ \t]+\n/g, '\n').slice(0, 12000);
    } catch {
      /* falls through to "couldn't read it" */
    }
    if (text.trim().length < 20) return err(c, 502, 'unreadable', "Couldn't read words in that file (a blurry photo?). Enter the numbers yourself.");
    try {
      const out = (await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {
            role: 'system',
            content:
              'You read wedding vendor quotes. Reply with JSON only, no other text: {"amount": total price in AUD as a number (0 if not stated), "deposit": deposit in AUD as a number (0 if none), "validUntil": "yyyy-mm-dd" or "", "date": "yyyy-mm-dd" or "", "includes": "short list of what is included", "excludes": "short list of what is not included or costs extra", "summary": "two sentences: what this quote is for and anything to watch"}. Never guess numbers that are not in the text.',
          },
          { role: 'user', content: text.slice(0, 9000) },
        ],
        max_tokens: 600,
        temperature: 0,
      })) as { response?: string };
      const r = out.response ?? '';
      const j = JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)) as Record<string, unknown>;
      const num = (v: unknown) => Math.max(0, Math.min(10_000_000, Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0));
      const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '');
      const str = (v: unknown, n: number) => String(v ?? '').slice(0, n);
      return c.json({
        amount: num(j.amount),
        deposit: num(j.deposit),
        validUntil: day(j.validUntil),
        date: day(j.date),
        includes: str(j.includes, 1500),
        excludes: str(j.excludes, 1500),
        extract: `${str(j.summary, 600)}\n\n${text}`.slice(0, 6000),
      });
    } catch {
      return err(c, 502, 'unavailable', "The assistant couldn't make sense of it just now. Enter the numbers yourself, or try again.");
    }
  });

  /** Compare the quotes of the vendors you pick, with the assistant's view. */
  app.post('/compare', writer, async (c) => {
    const body = z.object({ vendorIds: z.array(z.string().max(40)).min(2).max(8) }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Choose two or more vendors to compare.');
    if (!c.env.AI) return err(c, 400, 'off', "The planning assistant isn't switched on for this site yet.");
    const list = (await readDoc(c.env.DB, wid(c), 'vendors', '')).data.list.filter((v) => body.data.vendorIds.includes(v.id));
    if (list.length < 2) return err(c, 400, 'invalid', 'Choose two or more vendors to compare.');
    if (!(await allow(c.env.DB, `ask:${wid(c)}`, 40, 86_400_000))) return err(c, 429, 'slow_down', "That's today's assistant use up. Try again tomorrow.");
    const budget = (await readDoc(c.env.DB, wid(c), 'budget', '')).data;
    const facts = list
      .map((v) => {
        const qs = v.quotes.length
          ? v.quotes
              .map(
                (q) =>
                  `  Quote $${q.amount}${q.deposit ? `, deposit $${q.deposit}` : ''}${q.validUntil ? `, valid until ${q.validUntil}` : ''}. Includes: ${q.includes || '-'}. Excludes: ${q.excludes || '-'}.${q.notes ? ` Notes: ${q.notes}.` : ''}${q.extract ? `\n  From the quote: ${q.extract.slice(0, 1500)}` : ''}`,
              )
              .join('\n')
          : `  ${commitmentOf(v).amount ? `Quote $${commitmentOf(v).amount}` : 'No quote yet'}.`;
        return `${v.name} (${v.category || 'vendor'}, ${v.status}${v.km !== null ? `, ${v.km} km from the venue` : ''})${v.notes ? `. Our notes: ${v.notes}` : ''}\n${qs}`;
      })
      .join('\n\n');
    const word = (list[0]!.category.toLowerCase().split(' ')[0] ?? '').replace(/s$/, '');
    const line = word ? budget.lines.find((l) => l.category.toLowerCase().includes(word)) : undefined;
    try {
      const out = (await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {
            role: 'system',
            content:
              'You help an Australian couple compare wedding vendor quotes. Use Australian spelling and only the facts given; never invent prices or inclusions. ' +
              'Reply in this shape: a one-line verdict; then "Price" (compare like for like, noting what is excluded); then "What you get"; then "Watch out for"; then "Ask them" (2 to 4 questions to send each vendor). Keep it under 260 words.' +
              (line ? ` Their budget for this is about $${line.quote || line.estimate}.` : ''),
          },
          { role: 'user', content: facts.slice(0, 11000) },
        ],
        max_tokens: 750,
        temperature: 0.3,
      })) as { response?: string };
      const answer = (out.response ?? '').trim();
      if (!answer) throw new Error('empty');
      return c.json({ answer });
    } catch {
      return err(c, 502, 'unavailable', 'The assistant is busy right now. Please try again in a minute.');
    }
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
    const setupDoc = (await readDoc(db, w.id, 'party-setup', '')).data;
    const { results: everyone } = await db.prepare(`SELECT id, name, party_role FROM person WHERE invitation_id = ? AND deleted_at IS NULL AND party_role != '' ORDER BY idx`).bind(inv.id).all<{ id: string; name: string; party_role: string }>();
    if (!everyone.length) return c.json({ error: { code: 'not_party', message: 'This page is for the wedding party.' } }, 404);
    // The couple can pause a member's page (Setup → Wedding party access).
    const mine = everyone.filter((m) => setupDoc.access[m.id] !== false);
    if (!mine.length) return c.json({ error: { code: 'paused', message: 'This page is paused for now. The couple will let you know when it’s back.' } }, 403);
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
      const packSeen = new Set<string>();
      const packing = doc.data.packing.filter((p) => roles.some((r) => itemsFor([p], r).length) && !packSeen.has(p.text) && !!packSeen.add(p.text));
      if (items.length || doc.data.note || packing.length) out.push({ key: e.key, name: e.name, startsAt: e.starts_at, note: doc.data.note, items, packing });
    }
    const crew = await members(db, w.id);
    const setup = setupDoc;
    // Each member's own to-dos (theirs and their whole side's) and packing ticks, kept with their side.
    const own = [];
    for (const m of mine) {
      const side = sideOf(m.party_role);
      const doc = (await readDoc(db, w.id, sideDoc(side), '')).data;
      const p = doc.people[m.id];
      own.push({
        personId: m.id,
        name: m.name,
        role: m.party_role,
        tasks: doc.tasks.filter((t) => t.person === m.id || (!t.person && side)).map((t) => ({ id: t.id, text: t.text, due: t.due, done: t.done, mine: t.person === m.id })),
        packed: p?.packed ?? [],
        pack: p?.pack ?? [],
      });
    }
    return c.json({
      mine: own,
      couple: `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`,
      sides: setup,
      names: { p1: w.name1.split(' ')[0] ?? '', p2: w.name2.split(' ')[0] ?? '' },
      theme: w.theme,
      me: mine.map((m) => ({ name: m.name, role: m.party_role })),
      // Who's who in the party (names and roles only).
      party: crew.map((m) => ({ name: m.name, role: m.role, side: m.side })),
      events: out,
    });
  });

  /** A member ticks or adds their own things: a to-do, a packing item, or one of the shared packing list. */
  const Act = z
    .object({
      token: z.string(),
      personId: z.string().max(40),
      action: z.enum(['task', 'add-task', 'remove-task', 'packed', 'add-pack', 'own-pack', 'remove-pack']),
      id: z.string().max(40).optional(),
      text: z.string().trim().min(1).max(160).optional(),
      done: z.boolean().optional(),
    })
    .strict();
  app.post('/', async (c) => {
    const body = Act.safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json({ error: { code: 'invalid', message: 'That didn’t save. Please try again.' } }, 400);
    const a = body.data;
    const db = c.env.DB;
    const w = await db.prepare(`SELECT id FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug')).first<{ id: string }>();
    const inv = w && isToken(a.token) ? await db.prepare(`SELECT id FROM invitation WHERE token = ? AND wedding_id = ? AND deleted_at IS NULL`).bind(a.token, w.id).first<{ id: string }>() : null;
    if (!w || !inv) return c.json({ error: { code: 'no_link', message: 'Please open this page from the link you were sent.' } }, 404);
    if (!(await allow(db, `party-act:${inv.id}`, 240, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const me = await db.prepare(`SELECT id, party_role FROM person WHERE id = ? AND invitation_id = ? AND deleted_at IS NULL AND party_role != ''`).bind(a.personId, inv.id).first<{ id: string; party_role: string }>();
    const setup = (await readDoc(db, w.id, 'party-setup', '')).data;
    if (!me || setup.access[me.id] === false) return c.json({ error: { code: 'not_party', message: 'This page is for the wedding party.' } }, 403);
    const side = sideOf(me.party_role);
    const person = (d: PartySide) => (d.people[me.id] ??= { outfit: '', size: '', fitting: '', collected: false, paid: false, gift: '', given: false, notes: '', packed: [], pack: [] });
    let ok = true;
    const saved = await changeSide(db, w.id, sideDoc(side), (d) => {
      switch (a.action) {
        case 'task': {
          // Their own to-dos, or their whole side's.
          const t = d.tasks.find((x) => x.id === a.id && (x.person === me.id || (!x.person && side)));
          if (t) t.done = !!a.done;
          else ok = false;
          break;
        }
        case 'add-task':
          if (!a.text || d.tasks.length >= 80) ok = false;
          else d.tasks.push({ id: crypto.randomUUID().slice(0, 10), text: a.text, person: me.id, due: '', done: false });
          break;
        case 'remove-task': {
          const n = d.tasks.length;
          d.tasks = d.tasks.filter((x) => !(x.id === a.id && x.person === me.id)); // only ones they added for themselves
          ok = d.tasks.length < n;
          break;
        }
        case 'packed': {
          if (!a.text) ok = false;
          else {
            const p = person(d);
            p.packed = a.done ? [...new Set([...p.packed, a.text])] : p.packed.filter((x) => x !== a.text);
          }
          break;
        }
        case 'add-pack': {
          const p = person(d);
          if (!a.text || p.pack.length >= 40) ok = false;
          else p.pack.push({ text: a.text, done: false });
          break;
        }
        case 'own-pack': {
          const it = person(d).pack.find((x) => x.text === a.text);
          if (it) it.done = !!a.done;
          else ok = false;
          break;
        }
        case 'remove-pack': {
          const p = person(d);
          p.pack = p.pack.filter((x) => x.text !== a.text);
          break;
        }
      }
    });
    if (!ok) return c.json({ error: { code: 'not_found', message: 'That one’s not on your list any more. Refresh the page.' } }, 404);
    if (!saved) return c.json({ error: { code: 'busy', message: 'Busy right now. Please try again.' } }, 409);
    return c.json({ ok: true });
  });
  return app;
}


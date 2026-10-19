import { GuideContent, guidesOf, InvitationContent } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';

/**
 * Admin → Guest pages (/api/a/w/:wid/pages): everything a guest sees, in one place.
 *   GET  -> the invitation settings, each event's night-before guide, every word, and sample guests to preview as
 *   PUT  -> save any part of it (If-Match: <wedding version>; 409 if someone else saved first)
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 428, code: string, message: string) => c.json({ error: { code, message } }, status);
const parse = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** Wording keys guests can see: the catalogue of each guest page. */
const TEXT_KEY = /^(inv|gd|g30|ph)\.[A-Za-z0-9.]{1,60}$/;

const PagesPut = z
  .object({
    theme: z.string().trim().min(1).max(40),
    invitation: InvitationContent,
    guides: z.record(z.string().max(40), GuideContent),
    texts: z.record(z.string().regex(TEXT_KEY), z.string().max(4000)),
    /** The couple's names and monogram, as on the invitation (and the admin's title). */
    names: z.object({ name1: z.string().trim().min(1).max(80), name2: z.string().trim().min(1).max(80), monogram: z.string().trim().max(12) }),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b.texts ?? {}).length <= 1000, 'Too many wording changes at once');

interface WRow {
  id: string;
  slug: string;
  theme: string;
  name1: string;
  name2: string;
  monogram: string;
  content: string;
  guide: string;
  version: number;
}

export function pagesRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());

  const load = (c: C) =>
    c.env.DB.prepare(`SELECT id, slug, theme, name1, name2, monogram, content, guide, version FROM wedding WHERE id = ? AND deleted_at IS NULL`).bind(c.req.param('wid')).first<WRow>();

  async function payload(c: C, w: WRow) {
    const db = c.env.DB;
    const [events, people] = await db.batch([
      db.prepare(`SELECT key, name FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(w.id),
      db.prepare(
        `SELECT i.token,
                (SELECT GROUP_CONCAT(name, ' & ') FROM (SELECT name FROM person WHERE invitation_id = i.id AND deleted_at IS NULL ORDER BY idx)) AS names,
                (SELECT GROUP_CONCAT(e.key) FROM invite_event ie JOIN event e ON e.id = ie.event_id WHERE ie.invitation_id = i.id) AS invited
           FROM invitation i
          WHERE i.wedding_id = ? AND i.deleted_at IS NULL
          ORDER BY names LIMIT 500`,
      ).bind(w.id),
    ]);
    const evs = events!.results as { key: string; name: string }[];
    const content = parse<Record<string, unknown>>(w.content, {});
    const inv = InvitationContent.safeParse(content.invitation ?? {});
    return {
      version: w.version,
      slug: w.slug,
      theme: w.theme,
      names: { name1: w.name1, name2: w.name2, monogram: w.monogram },
      events: evs,
      invitation: inv.success ? inv.data : {},
      guides: guidesOf(parse(w.guide, {}), evs.map((e) => e.key)),
      // The secret preview code (Setup → Share a preview), admins only.
      share: typeof content.previewShare === 'string' ? content.previewShare : null,
      texts: (content.texts as Record<string, string> | undefined) ?? {},
      // Previewing as a real guest uses their link: owners and editors only.
      samples: (c.get('role') === 'viewer' ? [] : (people!.results as { token: string; names: string; invited: string | null }[])).map((r) => ({
        token: r.token,
        label: r.names,
        invited: (r.invited ?? '').split(',').filter(Boolean),
      })),
    };
  }

  app.get('/', async (c) => {
    const w = await load(c);
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    return c.json(await payload(c, w));
  });

  /**
   * Share a preview (for people's opinion): a secret code that lets anyone with the link see the
   * night-before pages with a stand-in guest. Nothing is sent and no reply is recorded. Off removes the
   * code, so every link shared so far stops working; on again makes a new one.
   */
  app.post('/share', requireMember('owner', 'editor'), async (c) => {
    const body = z.object({ on: z.boolean() }).strict().safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', 'Check the details and try again.');
    const w = await load(c);
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    // Only the share code changes (json_set / json_remove), so a page edit saved at the same moment is never lost.
    const code = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await c.env.DB.prepare(
      body.data.on
        ? `UPDATE wedding SET content = CASE WHEN json_type(content, '$.previewShare') = 'text' THEN content ELSE json_set(content, '$.previewShare', ?1) END, version = version + 1, updated_at = ?2 WHERE id = ?3 AND json_valid(content)`
        : `UPDATE wedding SET content = json_remove(content, '$.previewShare'), version = version + 1, updated_at = ?2 WHERE id = ?3 AND json_valid(content) AND ?1 IS NOT NULL`,
    )
      .bind(code, new Date().toISOString(), w.id)
      .run();
    await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'pages.share', ?, ?, ?)`)
      .bind(crypto.randomUUID(), w.id, c.get('user').id, w.id, JSON.stringify({ on: body.data.on }), new Date().toISOString())
      .run();
    return c.json(await payload(c, (await load(c))!));
  });

  app.put('/', requireMember('owner', 'editor'), async (c) => {
    const v = Number(c.req.header('If-Match'));
    if (!Number.isInteger(v)) return err(c, 428, 'version_required', 'Reload and try again.');
    const body = PagesPut.safeParse(await readJson(c.req.raw));
    if (!body.success) return err(c, 400, 'invalid', body.error.issues[0]?.message ?? 'Please check the highlighted fields.');
    const w = await load(c);
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    if (w.version !== v) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');

    const b = body.data;
    const content = parse<Record<string, unknown>>(w.content, {});
    if (b.invitation) content.invitation = { ...(content.invitation as object), ...b.invitation };
    if (b.texts) content.texts = { ...(content.texts as object), ...b.texts };
    const guides = parse<Record<string, unknown>>(w.guide, {});
    if (b.guides) {
      const keys = new Set(
        (await c.env.DB.prepare(`SELECT key FROM event WHERE wedding_id = ? AND deleted_at IS NULL`).bind(w.id).all<{ key: string }>()).results.map((r) => r.key),
      );
      for (const [k, g] of Object.entries(b.guides)) {
        if (!keys.has(k)) return err(c, 400, 'invalid', 'That event no longer exists. Reload and try again.');
        guides[k] = g;
      }
    }

    const now = new Date().toISOString();
    const res = await c.env.DB.prepare(
      `UPDATE wedding SET content = ?, guide = ?, theme = ?, name1 = ?, name2 = ?, monogram = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
    )
      .bind(JSON.stringify(content), JSON.stringify(guides), b.theme ?? w.theme, b.names?.name1 ?? w.name1, b.names?.name2 ?? w.name2, b.names?.monogram ?? w.monogram, now, w.id, v)
      .run();
    if (!res.meta.changes) return err(c, 409, 'conflict', 'Updated elsewhere, reloaded.');
    await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, ?, ?, 'pages.save', ?, ?, ?)`)
      .bind(crypto.randomUUID(), w.id, c.get('user').id, Object.keys(b).join(','), JSON.stringify({ texts: Object.keys(b.texts ?? {}).length }), now)
      .run();
    return c.json(await payload(c, { ...w, content: JSON.stringify(content), guide: JSON.stringify(guides), theme: b.theme ?? w.theme, name1: b.names?.name1 ?? w.name1, name2: b.names?.name2 ?? w.name2, monogram: b.names?.monogram ?? w.monogram, version: v + 1 }));
  });

  return app;
}

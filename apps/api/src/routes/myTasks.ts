import { dateIn, statusOf, taskDue, withStatus } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { isBusy, readJson } from '../lib/security';
import { changeDoc, readDoc } from './planner';

/**
 * A helper's own task list (a parent, a bridesmaid, a friend): /api/p/:slug/tasks?k=<their key>. What the
 * couple has given them, with due dates, and a tap to mark each to do, doing or done. The couple add
 * helpers and hand out tasks in Wedding planner → Checklist.
 */

type C = Context<{ Bindings: Env }>;
const helperOf = async (c: C, k: string) => {
  if (k.length < 20) return null;
  const w = await c.env.DB.prepare(`SELECT id, name1, name2, timezone FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(c.req.param('slug') ?? '').first<{ id: string; name1: string; name2: string; timezone: string }>();
  if (!w) return null;
  const doc = await readDoc(c.env.DB, w.id, 'checklist', '');
  const helper = doc.data.helpers.find((h) => h.key === k);
  return helper ? { w, helper, doc } : null;
};

export function myTaskRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const view = async (c: C, k: string) => {
    const found = await helperOf(c, k);
    if (!found) return null;
    const { w, helper, doc } = found;
    const first = await c.env.DB.prepare(`SELECT name, starts_at FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(w.id).first<{ name: string; starts_at: string }>();
    const day = first ? dateIn(w.timezone, new Date(first.starts_at)) : '';
    return {
      couple: `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`,
      name: helper.name,
      event: first ? { name: first.name, date: day } : null,
      today: dateIn(w.timezone),
      tasks: doc.data.tasks
        .filter((t) => t.helper === helper.id)
        .sort((a, b) => b.before - a.before)
        .map((t) => ({ id: t.id, text: t.text, note: t.note, due: day ? taskDue(t, day) : '', status: statusOf(t) })),
    };
  };

  app.get('/', async (c) => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await allow(c.env.DB, `mytasks:${ip}`, 240, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const v = await view(c, c.req.query('k') ?? '');
    if (!v) return c.json({ error: { code: 'no_link', message: 'This link isn’t working. Ask the couple for your task list link.' } }, 404);
    return c.json(v);
  });

  /** Mark one of their tasks to do, doing or done. */
  app.post('/', async (c) => {
    const b = z.object({ k: z.string().max(60), id: z.string().max(40), status: z.enum(['todo', 'doing', 'done']) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'That didn’t save.' } }, 400);
    const found = await helperOf(c, b.data.k);
    if (!found) return c.json({ error: { code: 'no_link', message: 'This link isn’t working.' } }, 404);
    if (!(await allow(c.env.DB, `mytasks-save:${found.w.id}:${found.helper.id}`, 300, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const today = dateIn(found.w.timezone);
    const found_ = { theirs: false };
    // A database that's briefly busy (many helpers at once) answers "try again", which the page does.
    const saved = await changeDoc(c.env.DB, found.w.id, 'checklist', '', (d) => {
      const i = d.tasks.findIndex((t) => t.id === b.data.id && t.helper === found.helper.id);
      if (i < 0) return false;
      found_.theirs = true;
      if (statusOf(d.tasks[i]!) === b.data.status) return false;
      d.tasks[i] = withStatus(d.tasks[i]!, b.data.status, today);
    }).catch((e: unknown) => {
      if (!isBusy(e)) throw e;
      found_.theirs = true;
      return false;
    });
    if (!found_.theirs) return c.json({ error: { code: 'not_yours', message: 'That task isn’t on your list any more.' } }, 404);
    if (!saved) return c.json({ error: { code: 'busy', message: 'Busy, try again.' } }, 409);
    return c.json((await view(c, b.data.k))!);
  });
  return app;
}

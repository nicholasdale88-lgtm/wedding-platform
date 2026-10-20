import { clockMinutes, dateIn, PARTY_PHASES, phaseDate, statusOf, taskDue, WEDDING_PHASES, withStatus, zonedToUtc, type CheckItem } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { isBusy, readJson } from '../lib/security';
import { changeDoc, readDoc } from './planner';

/**
 * A helper's own task list (a parent, a bridesmaid, a friend): /api/p/:slug/tasks?k=<their key>. What the
 * couple has given them, with due dates, and a tap to mark each to do, doing or done. The couple add
 * helpers and hand out tasks in Wedding planner → Checklist; things on the day checklists (the couple's,
 * or another event's) can be handed to them too. /cal/<key>.ics puts all of it in their phone's calendar.
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

type Ev = { key: string; name: string; starts_at: string };
const eventsOf = async (c: C, wid: string) =>
  (await c.env.DB.prepare(`SELECT key, name, starts_at FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`).bind(wid).all<Ev>()).results;

/** Things on the day checklists handed to this helper: the wedding's (the couple's lists) and other events'. */
async function dayItems(c: C, w: { id: string; timezone: string }, helperId: string) {
  const out: { event: string; eventName: string; id: string; text: string; time: string; note: string; when: string; date: string; done: boolean }[] = [];
  const evs = await eventsOf(c, w.id);
  for (const [i, ev] of evs.entries()) {
    const day = ev.starts_at ? dateIn(w.timezone, new Date(ev.starts_at)) : '';
    // The first event is the wedding (the couple's lists); others have their own day checklist.
    const lists: [CheckItem[], Record<string, string>][] = [];
    if (i === 0) {
      const d = (await readDoc(c.env.DB, w.id, 'day-checklist', ev.key)).data;
      lists.push([[...d.p1, ...d.p2, ...d.both], WEDDING_PHASES]);
    }
    lists.push([(await readDoc(c.env.DB, w.id, 'event-checklist', ev.key)).data.items, PARTY_PHASES]);
    for (const [items, labels] of lists)
      for (const it of items)
        if (it.helper === helperId && it.id)
          out.push({ event: ev.key, eventName: ev.name, id: it.id, text: it.text, time: it.time, note: it.note, when: labels[it.phase] ?? '', date: phaseDate(it.phase, day), done: it.done });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (clockMinutes(a.time) ?? 0) - (clockMinutes(b.time) ?? 0));
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (line: string) => {
  const rows: string[] = [];
  let cur = '';
  let n = 0;
  for (const ch of line) {
    if (n === 72) {
      rows.push(cur);
      cur = ' ';
      n = 1;
    }
    cur += ch;
    n++;
  }
  rows.push(cur);
  return rows.join('\r\n');
};
const ymd = (d: string) => d.replace(/-/g, '');
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

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
      day: await dayItems(c, w, helper.id),
      calendar: `${c.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/p/${encodeURIComponent(c.req.param('slug') ?? '')}/tasks/cal/${k}.ics`,
    };
  };

  /** Their calendar: jobs on their due day (a reminder the morning before) and day-checklist things at their time. */
  app.get('/cal/:file', async (c) => {
    if (!(await allow(c.env.DB, `mytasks-cal:${c.req.header('CF-Connecting-IP') ?? 'local'}`, 240, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const found = await helperOf(c, c.req.param('file').replace(/\.ics$/, ''));
    if (!found) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    const { w, helper, doc } = found;
    const couple = `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`;
    const evs = await eventsOf(c, w.id);
    const day = evs[0]?.starts_at ? dateIn(w.timezone, new Date(evs[0].starts_at)) : '';
    const now = stamp(new Date());
    const out: string[] = [];
    const allDay = (uid: string, date: string, title: string, note: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      out.push('BEGIN:VEVENT', `UID:${uid}@wedding-platform`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${nextDay(date)}`, `SUMMARY:${esc(title)}`);
      if (note) out.push(`DESCRIPTION:${esc(note)}`);
      // 9am the day before (an all-day event starts at midnight).
      out.push('BEGIN:VALARM', 'TRIGGER:-PT15H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Tomorrow: ${title}`)}`, 'END:VALARM', 'END:VEVENT');
    };
    for (const t of doc.data.tasks) if (t.helper === helper.id && !t.done && day) allDay(`help-${t.id}`, taskDue(t, day), t.text, [t.note, `Your job for ${couple}`].filter(Boolean).join('\n'));
    for (const it of await dayItems(c, w, helper.id)) {
      if (it.done) continue;
      const m = clockMinutes(it.time);
      const note = [it.note, `${it.when} · ${it.eventName}`].filter(Boolean).join('\n');
      if (m === null || !it.date) {
        allDay(`help-day-${it.event}-${it.id}`, it.date, it.text, note);
        continue;
      }
      const start = zonedToUtc(`${it.date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, w.timezone);
      out.push('BEGIN:VEVENT', `UID:help-day-${it.event}-${it.id}@wedding-platform`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 30 * 60_000))}`, `SUMMARY:${esc(it.text)}`, `DESCRIPTION:${esc(note)}`);
      out.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`In 30 minutes: ${it.text}`)}`, 'END:VALARM', 'END:VEVENT');
    }
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wedding-platform//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(`${helper.name.split(' ')[0]}'s jobs for ${couple}`)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H', ...out, 'END:VCALENDAR'];
    return new Response(lines.map(fold).join('\r\n') + '\r\n', { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex' } });
  });

  /** Tick (or untick) a day-checklist thing handed to them. */
  app.post('/day', async (c) => {
    const b = z.object({ k: z.string().max(60), event: z.string().max(60), id: z.string().min(1).max(40), done: z.boolean() }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'That didn’t save.' } }, 400);
    const found = await helperOf(c, b.data.k);
    if (!found) return c.json({ error: { code: 'no_link', message: 'This link isn’t working.' } }, 404);
    if (!(await allow(c.env.DB, `mytasks-save:${found.w.id}:${found.helper.id}`, 300, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a minute.' } }, 429);
    const evs = await eventsOf(c, found.w.id);
    const at = evs.findIndex((e) => e.key === b.data.event);
    if (at < 0) return c.json({ error: { code: 'not_yours', message: 'That isn’t on your list any more.' } }, 404);
    const mine = (it: CheckItem) => it.id === b.data.id && it.helper === found.helper.id;
    const hit = { theirs: false };
    const tick = (items: CheckItem[]) => {
      const it = items.find(mine);
      if (!it) return false;
      hit.theirs = true;
      if (it.done === b.data.done) return false;
      it.done = b.data.done;
      return true;
    };
    const busy = (e: unknown) => {
      if (!isBusy(e)) throw e;
      hit.theirs = true;
      return null;
    };
    // The wedding's lists first (the couple's), then the event's own day checklist.
    let saved: unknown = false;
    if (at === 0)
      saved = await changeDoc(c.env.DB, found.w.id, 'day-checklist', b.data.event, (d) => {
        if (!(tick(d.p1) || tick(d.p2) || tick(d.both))) return false;
      }).catch(busy);
    if (!hit.theirs)
      saved = await changeDoc(c.env.DB, found.w.id, 'event-checklist', b.data.event, (d) => {
        if (!tick(d.items)) return false;
      }).catch(busy);
    if (!hit.theirs) return c.json({ error: { code: 'not_yours', message: 'That isn’t on your list any more.' } }, 404);
    if (saved !== true) return c.json({ error: { code: 'busy', message: 'Busy, try again.' } }, 409);
    return c.json((await view(c, b.data.k))!);
  });

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

import { isToken } from '@wp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { readDoc } from './planner';

/**
 * "How well do you know the couple?" Guests play once from their own link (/api/p/:slug/quiz): the questions
 * without the answers; then their score, the right answers and the leaderboard. The couple writes the
 * questions in the Wedding planner (planner document "quiz") and sees everyone's scores (/api/a/w/:wid/quiz).
 */

const board = async (db: D1Database, weddingId: string) =>
  (
    await db.prepare(`SELECT name, score FROM quiz_answer WHERE wedding_id = ? ORDER BY score DESC, created_at LIMIT 10`).bind(weddingId).all<{ name: string; score: number }>()
  ).results;

export function quizAdminRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember());
  app.get('/', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT name, score, created_at FROM quiz_answer WHERE wedding_id = ? ORDER BY score DESC, created_at`).bind(c.req.param('wid')).all<{ name: string; score: number; created_at: string }>();
    return c.json({ players: results.map((r) => ({ name: r.name, score: r.score, at: r.created_at })) });
  });
  return app;
}

export function quizGuestRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const guest = async (db: D1Database, slug: string, token: string) => {
    const w = await db.prepare(`SELECT id, name1, name2 FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(slug).first<{ id: string; name1: string; name2: string }>();
    if (!w || !isToken(token)) return null;
    const who = await db
      .prepare(`SELECT i.id, p.name FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 AND p.deleted_at IS NULL WHERE i.token = ? AND i.wedding_id = ? AND i.deleted_at IS NULL`)
      .bind(token, w.id)
      .first<{ id: string; name: string }>();
    return who ? { w, who } : null;
  };
  const names = (w: { name1: string; name2: string }, s: string) => s.replace(/Partner 1/g, w.name1.split(' ')[0] ?? '').replace(/Partner 2/g, w.name2.split(' ')[0] ?? '');

  app.get('/', async (c) => {
    const g = await guest(c.env.DB, c.req.param('slug') ?? '', c.req.query('g') ?? '');
    if (!g) return c.json({ error: { code: 'no_link', message: 'Please open this from your own link.' } }, 404);
    const quiz = (await readDoc(c.env.DB, g.w.id, 'quiz', '')).data;
    if (!quiz.on || !quiz.questions.length) return c.json({ error: { code: 'off', message: 'The quiz isn’t open yet.' } }, 404);
    const mine = await c.env.DB.prepare(`SELECT answers, score FROM quiz_answer WHERE wedding_id = ? AND invitation_id = ?`).bind(g.w.id, g.who.id).first<{ answers: string; score: number }>();
    return c.json({
      couple: `${g.w.name1.split(' ')[0]} & ${g.w.name2.split(' ')[0]}`,
      title: quiz.title || `How well do you know ${g.w.name1.split(' ')[0]} & ${g.w.name2.split(' ')[0]}?`,
      first: g.who.name.split(' ')[0],
      questions: quiz.questions.map((q) => ({ id: q.id, q: names(g.w, q.q), options: q.options.map((o) => names(g.w, o)) })),
      // Once played: their answers, the right ones, their score.
      played: mine ? { answers: JSON.parse(mine.answers) as number[], score: mine.score, right: quiz.questions.map((q) => q.answer) } : null,
      leaders: mine ? await board(c.env.DB, g.w.id) : [],
    });
  });

  app.post('/', async (c) => {
    const b = z.object({ token: z.string(), answers: z.array(z.number().int().min(-1).max(4)).max(20) }).strict().safeParse(await readJson(c.req.raw));
    if (!b.success) return c.json({ error: { code: 'invalid', message: 'Please answer and try again.' } }, 400);
    const g = await guest(c.env.DB, c.req.param('slug') ?? '', b.data.token);
    if (!g) return c.json({ error: { code: 'no_link', message: 'Please open this from your own link.' } }, 404);
    if (!(await allow(c.env.DB, `quiz:${g.who.id}`, 10, 3_600_000))) return c.json({ error: { code: 'slow_down', message: 'Please wait a little.' } }, 429);
    const quiz = (await readDoc(c.env.DB, g.w.id, 'quiz', '')).data;
    if (!quiz.on || !quiz.questions.length) return c.json({ error: { code: 'off', message: 'The quiz isn’t open.' } }, 404);
    const score = quiz.questions.reduce((a, q, i) => a + (b.data.answers[i] === q.answer ? 1 : 0), 0);
    // One go each: a second try keeps the first score.
    await c.env.DB.prepare(`INSERT INTO quiz_answer (wedding_id, invitation_id, name, answers, score, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
      .bind(g.w.id, g.who.id, g.who.name.split(' ')[0] ?? g.who.name, JSON.stringify(b.data.answers.slice(0, quiz.questions.length)), score, new Date().toISOString())
      .run();
    const mine = await c.env.DB.prepare(`SELECT answers, score FROM quiz_answer WHERE wedding_id = ? AND invitation_id = ?`).bind(g.w.id, g.who.id).first<{ answers: string; score: number }>();
    return c.json({ played: { answers: JSON.parse(mine!.answers) as number[], score: mine!.score, right: quiz.questions.map((q) => q.answer) }, leaders: await board(c.env.DB, g.w.id) });
  });
  return app;
}

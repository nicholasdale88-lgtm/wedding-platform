import { Hono } from 'hono';
import { engineDeps, type Env } from './env';
import { hardening } from './lib/security';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { guestRoutes } from './routes/guest';
import { hookRoutes } from './routes/hooks';
import { pagesRoutes } from './routes/pages';
import { photoRoutes } from './routes/photos';
import { seatingRoutes } from './routes/seating';
import { settingsRoutes } from './routes/settings';
import { textRoutes } from './routes/texts';
import { runAutopilot, type EngineDeps } from './sms/engine';
import { sweepInbound } from './sms/inbound';

/** The app, with dependencies injectable for tests. */
export function createApp(deps: (env: Env) => EngineDeps = engineDeps) {
  const app = new Hono<{ Bindings: Env }>().basePath('/api');
  app.use('*', hardening());
  app.get('/health', (c) => c.json({ ok: true }));
  app.route('/hooks', hookRoutes(deps));
  app.route('/a', authRoutes());
  app.route('/a/w/:wid/pages', pagesRoutes());
  app.route('/a/w/:wid/texts', textRoutes(deps));
  app.route('/a/w/:wid/settings', settingsRoutes(deps));
  app.route('/a/w/:wid/seating', seatingRoutes());
  app.route('/a/w/:wid/photos', photoRoutes());
  app.route('/a/w/:wid', adminRoutes(deps));
  app.route('/p/:slug', guestRoutes());
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: { code: 'server_error', message: 'Something went wrong. Your changes are safe.' } }, 500);
  });
  return app;
}

/** Cron, every 15 minutes: finish any unprocessed replies, then run the autopilot. */
export async function scheduled(env: Env, deps: (env: Env) => EngineDeps = engineDeps) {
  const d = deps(env);
  const swept = await sweepInbound(d);
  const report = await runAutopilot(d);
  console.log(JSON.stringify({ cron: 'sms', swept, ...report }));
  return { swept, ...report };
}

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(scheduled(env)),
} satisfies ExportedHandler<Env>;

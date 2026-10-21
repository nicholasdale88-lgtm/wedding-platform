import { Hono } from 'hono';
import { engineDeps, type Env } from './env';
import { hardening, isBusy } from './lib/security';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { accountRoutes, memberRoutes } from './routes/accounts';
import { guestRoutes } from './routes/guest';
import { hookRoutes } from './routes/hooks';
import { pagesRoutes } from './routes/pages';
import { photoRoutes } from './routes/photos';
import { oauthRoutes, photoLinkRoutes } from './routes/photoLinks';
import { partyGuestRoutes, plannerRoutes } from './routes/planner';
import { liveAdminRoutes, liveScreenRoutes } from './routes/live';
import { songAdminRoutes, songGuestRoutes } from './routes/songs';
import { calendarRoutes } from './routes/calendar';
import { shuttleAdminRoutes, shuttleGuestRoutes } from './routes/shuttles';
import { albumAdminRoutes, albumGuestRoutes } from './routes/album';
import { runCopies } from './photos/store';
import { runBackups } from './lib/backup';
import { runDigests } from './lib/digest';
import { runQuoteFollowUps } from './lib/quoteRequests';
import { rfqRoutes } from './routes/rfq';
import { planRoutes, signupRoutes } from './routes/signup';
import { billingRoutes, stripeHookRoutes } from './routes/billing';
import { partyCalendarRoutes } from './routes/partyCalendar';
import { vendorHubRoutes } from './routes/vendorHub';
import { purgeExpired } from './lib/rateLimit';
import { eventRoutes } from './routes/events';
import { seatingRoutes } from './routes/seating';
import { settingsRoutes } from './routes/settings';
import { textRoutes } from './routes/texts';
import { messageRoutes } from './routes/messages';
import { inboxRoutes, receiveEmail } from './routes/inbox';
import { insightsRoutes } from './routes/insights';
import { coordinatorAdminRoutes, coordinatorPageRoutes } from './routes/coordinator';
import { plannerCalendarAdminRoutes, plannerCalendarFeed } from './routes/plannerCalendar';
import { paymentReminderRoutes, runPaymentReminders } from './routes/paymentReminders';
import { myTaskRoutes } from './routes/myTasks';
import { directoryRoutes, vendorAccountRoutes } from './routes/vendorListings';
import { manifestRoutes } from './routes/manifest';
import { partyAccountRoutes, partyPortalRoutes } from './routes/partyPortal';
import { boardAdminRoutes, boardGuestRoutes } from './routes/board';
import { runAutopilot, type EngineDeps } from './sms/engine';
import { sweepInbound } from './sms/inbound';

/** The app, with dependencies injectable for tests. */
export function createApp(deps: (env: Env) => EngineDeps = engineDeps) {
  const app = new Hono<{ Bindings: Env }>().basePath('/api');
  app.use('*', hardening());
  app.get('/health', (c) => c.json({ ok: true }));
  // Stripe signs its own requests: before /hooks, whose ?k= key is for the SMS providers.
  app.route('/hooks/stripe', stripeHookRoutes());
  app.route('/hooks', hookRoutes(deps));
  // The vendor directory (public) and a vendor's own listing: before the admin's /a routes.
  app.route('/directory', directoryRoutes());
  app.route('/a/vendor', vendorAccountRoutes());
  app.route('/a/signup', signupRoutes());
  app.route('/a', planRoutes());
  app.route('/a', billingRoutes());
  app.route('/a', authRoutes());
  app.route('/a', accountRoutes());
  app.route('/a/w/:wid/members', memberRoutes());
  app.route('/a/w/:wid/pages', pagesRoutes());
  app.route('/a/w/:wid/texts', textRoutes(deps));
  app.route('/a/w/:wid/messages', messageRoutes(deps));
  app.route('/a/w/:wid/inbox', inboxRoutes());
  app.route('/a/w/:wid/insights', insightsRoutes());
  app.route('/a/w/:wid/coordinator', coordinatorAdminRoutes());
  app.route('/a/w/:wid/planner-calendar', plannerCalendarAdminRoutes());
  app.route('/a/w/:wid/pay-reminders', paymentReminderRoutes());
  app.route('/a/w/:wid/party-accounts', partyAccountRoutes());
  app.route('/cal', plannerCalendarFeed());
  app.route('/a/w/:wid/board', boardAdminRoutes());
  app.route('/a/w/:wid/settings', settingsRoutes(deps));
  app.route('/a/w/:wid/seating', seatingRoutes());
  app.route('/a/w/:wid/photos', photoRoutes());
  app.route('/a/w/:wid/photo-links', photoLinkRoutes());
  app.route('/a/w/:wid/planner', plannerRoutes());
  app.route('/a/w/:wid/live', liveAdminRoutes());
  app.route('/a/w/:wid/songs', songAdminRoutes());
  app.route('/a/w/:wid/shuttles', shuttleAdminRoutes());
  app.route('/a/w/:wid/album', albumAdminRoutes());
  app.route('/oauth', oauthRoutes());
  app.route('/a/w/:wid/events', eventRoutes());
  app.route('/a/w/:wid', adminRoutes(deps));
  app.route('/p/:slug/board', boardGuestRoutes());
  app.route('/p/:slug/party/cal', partyCalendarRoutes());
  app.route('/p/:slug/vendor', vendorHubRoutes());
  app.route('/p/:slug/party', partyGuestRoutes());
  app.route('/p/:slug/portal', partyPortalRoutes());
  app.route('/p/:slug/manifest', manifestRoutes());
  app.route('/p/:slug/coordinator', coordinatorPageRoutes());
  app.route('/p/:slug/tasks', myTaskRoutes());
  app.route('/p/:slug/live', liveScreenRoutes());
  app.route('/p/:slug/songs', songGuestRoutes());
  app.route('/p/:slug/calendar', calendarRoutes());
  app.route('/p/:slug/shuttles', shuttleGuestRoutes());
  app.route('/p/:slug/album', albumGuestRoutes());
  app.route('/p/:slug/rfq', rfqRoutes());
  app.route('/p/:slug', guestRoutes(deps));
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));
  app.onError((err, c) => {
    console.error(err);
    // Briefly busy (a burst of saves at once): ask the page to try again rather than reporting a fault.
    if (isBusy(err)) return c.json({ error: { code: 'busy', message: 'Busy for a moment. Please try again.' } }, 503, { 'Retry-After': '1' });
    return c.json({ error: { code: 'server_error', message: 'Something went wrong. Your changes are safe.' } }, 500);
  });
  return app;
}

/** Cron, every 15 minutes: finish any unprocessed replies, then run the autopilot. */
export async function scheduled(env: Env, deps: (env: Env) => EngineDeps = engineDeps) {
  const d = deps(env);
  const swept = await sweepInbound(d);
  const report = await runAutopilot(d);
  // Photo copies to the couple's linked storage that are still owed (a failure here never stops the texts).
  const photos = await runCopies(env, { limit: 30 }).catch((e) => ({ error: String(e) }));
  // Payment reminders to the couple (only where switched on; never in quiet hours).
  const payReminders = await runPaymentReminders(env, d).catch((e) => ({ error: String(e) }));
  // A daily backup of each wedding to its linked Drive, Dropbox or OneDrive (a couple per run).
  const backups = await runBackups(env).catch((e) => ({ error: String(e) }));
  // The couple's daily summary email, at about 6pm their time (only with news, only once a day).
  const digests = await runDigests(env).catch((e) => ({ error: String(e) }));
  const quoteFollowUps = await runQuoteFollowUps(env).catch((e) => ({ error: String(e) }));
  await purgeExpired(env.DB, d.now()).catch(() => undefined);
  console.log(JSON.stringify({ cron: 'sms', swept, ...report, photos, payReminders, backups, digests, quoteFollowUps }));
  return { swept, ...report };
}

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(scheduled(env)),
  /** Emails to the event's address (Cloudflare Email Routing → this Worker): kept in Messages → Email. */
  email: async (message: ForwardableEmailMessage, env: Env) => {
    try {
      await receiveEmail(message, env);
    } catch (e) {
      console.error('email', e);
    }
  },
} satisfies ExportedHandler<Env>;

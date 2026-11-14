import { AD_IMAGES, adCopyProblems, adDecisions, AdDraft, adRef, AdsSettingsIn, AdsState, AdVariant, dateIn } from '@wp/shared';
import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { adInsights, ensureCampaign, MetaError, metaConfig, publishAd, setDailyBudget, setStatus, type MetaConfig } from '../lib/metaAds';
import type { AdminEnv } from './auth';

/**
 * The Ads bot (/api/a/company/ads, inside the company portal, so only staff reach it; each route needs Promote).
 * - Anyone with Promote (a bot too) writes drafts, pauses an ad, presses Stop all and runs a check.
 * - Only a person who can see Money (an owner or manager) approves a draft (it goes live and spends), starts a
 *   paused ad again, starts everything again, or changes the caps. A bot never can.
 * - Once a day (cron, after 8am Sydney) runAdsDaily reads spend, counts sign-ups and sales from each ad's link,
 *   pauses losers and reports to the inbox.
 * Everything is kept in platform_setting 'ads' (AdsState), and each change is in Activity.
 */

type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 403 | 404 | 429 | 502, code: string, message: string) => c.json({ error: { code, message } }, status);

export async function readAds(db: D1Database): Promise<AdsState> {
  const row = await db.prepare(`SELECT value FROM platform_setting WHERE key = 'ads'`).first<{ value: string }>();
  let raw: unknown = {};
  try {
    raw = row ? JSON.parse(row.value) : {};
  } catch {
    raw = {};
  }
  const p = AdsState.safeParse(raw);
  return p.success ? p.data : AdsState.parse({});
}
async function writeAds(db: D1Database, s: AdsState) {
  await db
    .prepare(`INSERT INTO platform_setting (key, value, updated_at) VALUES ('ads', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(s), new Date().toISOString())
    .run();
}
const note = (s: AdsState, text: string) => {
  s.log = [{ at: new Date().toISOString(), text: text.slice(0, 300) }, ...s.log].slice(0, 60);
};

async function log(c: C, action: string, target: string, detail: unknown) {
  await c.env.DB.prepare(`INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at) VALUES (?, NULL, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), c.get('user').id, action, target, JSON.stringify(detail), new Date().toISOString())
    .run();
}
async function nameOf(c: C): Promise<string> {
  const u = await c.env.DB.prepare(`SELECT COALESCE(first_name, name, email, '') AS n FROM user WHERE id = ?`).bind(c.get('user').id).first<{ n: string }>();
  return (u?.n || c.get('user').email).slice(0, 80);
}
/** A person (not a bot) whose role reaches Money: the only ones who can make the ads spend. */
const canSpend = (c: C) => !c.get('user').bot && c.get('user').perms.includes('money');

async function report(db: D1Database, title: string, body: string) {
  await db.prepare(`INSERT INTO company_task (id, kind, title, body, action, created_by, status, created_at) VALUES (?, 'report', ?, ?, '', 'ads-bot', 'waiting', ?)`)
    .bind(crypto.randomUUID(), title.slice(0, 140), body.slice(0, 4000), new Date().toISOString())
    .run();
}

/** Sign-ups and paid weddings per ad, from the ?ref=meta-<id> each ad's link carries. */
async function refCounts(db: D1Database): Promise<Record<string, { signups: number; paid: number }>> {
  const { results } = await db
    .prepare(
      `SELECT json_extract(w.content, '$.ref') AS ref, COUNT(*) AS n,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM audit a WHERE a.wedding_id = w.id AND a.action = 'plan.paid') THEN 1 ELSE 0 END) AS paid
         FROM wedding w WHERE w.deleted_at IS NULL AND json_valid(w.content) AND json_extract(w.content, '$.ref') LIKE 'meta-%'
        GROUP BY ref`,
    )
    .all<{ ref: string; n: number; paid: number }>();
  return Object.fromEntries(results.map((r) => [r.ref, { signups: r.n, paid: r.paid ?? 0 }]));
}

/** Reads the numbers, pauses the losers (or stops everything at the total cap). Returns what changed, in words. */
export async function checkAds(env: Env, s: AdsState, cfg: MetaConfig): Promise<string[]> {
  const changed: string[] = [];
  if (!s.adsetId) return changed;
  const [ins, refs] = await Promise.all([adInsights(cfg, s.adsetId), refCounts(env.DB)]);
  const at = new Date().toISOString();
  for (const v of s.variants) {
    const i = v.metaAdId ? ins[v.metaAdId] : undefined;
    const r = refs[adRef(v.id)];
    if (i) Object.assign(v.stats, i);
    if (r) Object.assign(v.stats, r);
    if (i || r) v.stats.at = at;
  }
  if (s.stoppedAll) return changed;
  const { decisions, stopAll } = adDecisions(s);
  if (stopAll) {
    await setStatus(cfg, s.campaignId, false);
    s.stoppedAll = true;
    for (const v of s.variants) if (v.status === 'live') Object.assign(v, { status: 'paused', why: stopAll });
    changed.push(`Stopped every ad: ${stopAll}`);
  }
  for (const d of decisions) {
    const v = s.variants.find((x) => x.id === d.id);
    if (!v?.metaAdId) continue;
    await setStatus(cfg, v.metaAdId, false);
    Object.assign(v, { status: 'paused', why: d.why });
    changed.push(`Paused “${v.name}”: ${d.why}`);
  }
  for (const t of changed) note(s, t);
  return changed;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
function summary(s: AdsState): string {
  const rows = s.variants.filter((v) => v.metaAdId).map((v) => `- ${v.name} (${v.status}): ${money(v.stats.spendCents)} spent, ${v.stats.clicks} clicks, ${v.stats.signups} sign-ups, ${v.stats.paid} paid`);
  const spent = s.variants.reduce((a, v) => a + v.stats.spendCents, 0);
  return [`Spent so far: ${money(spent)} of the ${money(s.settings.totalCapCents)} cap.`, ...rows].join('\n');
}

/**
 * Cron (every 15 minutes): once a Sydney day, after 8am, when there's anything live. Reports to the inbox when
 * it paused something, and every Monday with the week's numbers.
 */
export async function runAdsDaily(env: Env, now = new Date()): Promise<string> {
  const cfg = metaConfig(env);
  if ('missing' in cfg) return 'not connected';
  const s = await readAds(env.DB);
  const today = dateIn('Australia/Sydney', now);
  const hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (s.lastRun === today || hour < 8 || !s.adsetId) return 'not due';
  s.lastRun = today;
  await writeAds(env.DB, s); // claimed first, so an error can't make it run every 15 minutes
  try {
    const changed = await checkAds(env, s, cfg);
    await writeAds(env.DB, s);
    const monday = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short' }).format(now) === 'Mon';
    if (changed.length) await report(env.DB, `Ads bot: ${changed.length === 1 ? changed[0]!.slice(0, 120) : `${changed.length} changes to the ads`}`, `${changed.join('\n')}\n\n${summary(s)}\n\nPromote → Ads has the details. A draft with new words is the way to replace a paused ad.`);
    else if (monday) await report(env.DB, 'Ads bot: this week’s numbers', `${summary(s)}\n\nNothing needed pausing.`);
    return changed.length ? `${changed.length} changes` : 'checked';
  } catch (e) {
    const m = e instanceof MetaError ? e.message : 'Meta couldn’t be reached.';
    note(s, `The daily check failed: ${m}`);
    await writeAds(env.DB, s);
    await report(env.DB, 'Ads bot: the daily check failed', `${m}\n\nIf the token has expired, make a new one and paste it in Settings → Connections. The ads keep running under the daily cap meanwhile; press Stop all in Promote → Ads to stop them.`);
    return `failed: ${m}`;
  }
}

export function adsRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', async (c, next) => {
    if (!c.get('user').perms.includes('promote')) return err(c, 403, 'forbidden', 'Your role can’t do that. Ask an owner.');
    await next();
  });

  app.get('/', async (c) => {
    const s = await readAds(c.env.DB);
    const cfg = metaConfig(c.env);
    return c.json({ ...s, images: AD_IMAGES, connected: !('missing' in cfg), missing: 'missing' in cfg ? cfg.missing : [], canSpend: canSpend(c) });
  });

  /** A new draft, or new words for a draft (only drafts change: a live ad is replaced by a new draft). */
  app.post('/drafts', async (c) => {
    const b = AdDraft.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the draft.');
    const problems = adCopyProblems(b.data);
    if (problems.length) return err(c, 400, 'copy', problems.join(' '));
    const s = await readAds(c.env.DB);
    const had = s.variants.find((v) => v.id === b.data.id);
    if (had && had.status !== 'draft') return err(c, 400, 'taken', 'That name is already an ad that ran. Pick a new name, so its numbers stay its own.');
    if (!had && s.variants.filter((v) => v.status === 'draft').length >= 12) return err(c, 429, 'busy', 'Twelve drafts are waiting already. Let a person decide on those first.');
    if (!had && s.variants.length >= 40) return err(c, 429, 'busy', 'Forty ads is the most. Remove some old drafts first.');
    const by = await nameOf(c);
    const v = AdVariant.parse({ ...b.data, status: 'draft', by, createdAt: new Date().toISOString() });
    s.variants = had ? s.variants.map((x) => (x.id === v.id ? v : x)) : [...s.variants, v];
    note(s, `${by} ${had ? 'changed' : 'wrote'} the draft “${v.name}”.`);
    await writeAds(c.env.DB, s);
    await log(c, 'ads.draft', v.id, { name: v.name });
    if (!had && c.get('user').bot) await report(c.env.DB, `New ad draft: ${v.name}`, `${v.primary}\n\n${v.headline}\n\nApprove it, or leave it, in Promote → Ads. Nothing spends until a person approves.`);
    return c.json({ ok: true, variant: v });
  });
  app.delete('/drafts/:id', async (c) => {
    const s = await readAds(c.env.DB);
    const v = s.variants.find((x) => x.id === c.req.param('id'));
    if (!v || v.status !== 'draft') return err(c, 404, 'not_found', 'No draft by that name.');
    s.variants = s.variants.filter((x) => x !== v);
    note(s, `${await nameOf(c)} removed the draft “${v.name}”.`);
    await writeAds(c.env.DB, s);
    await log(c, 'ads.remove', v.id, {});
    return c.json({ ok: true });
  });

  const withMeta = async (c: C, fn: (cfg: MetaConfig, s: AdsState) => Promise<Response>) => {
    const cfg = metaConfig(c.env);
    if ('missing' in cfg) return err(c, 400, 'not_connected', 'Meta isn’t connected yet: paste the token, ad account and Page in Settings → Connections.');
    const s = await readAds(c.env.DB);
    try {
      return await fn(cfg, s);
    } catch (e) {
      const m = e instanceof MetaError ? e.message : 'Meta couldn’t be reached.';
      note(s, `Meta said no: ${m}`);
      await writeAds(c.env.DB, s);
      return err(c, 502, 'meta', `Meta said: ${m}`);
    }
  };

  /** Approve: the draft goes live (the campaign and ad set are made the first time). People who can see Money only. */
  app.post('/:id/approve', async (c) => {
    if (!canSpend(c)) return err(c, 403, 'forbidden', 'Only an owner or manager (a person, not a bot) can put an ad live.');
    return withMeta(c, async (cfg, s) => {
      const v = s.variants.find((x) => x.id === c.req.param('id'));
      if (!v || v.status !== 'draft') return err(c, 404, 'not_found', 'No draft by that name.');
      const problems = adCopyProblems(v);
      if (problems.length) return err(c, 400, 'copy', problems.join(' '));
      const ids = await ensureCampaign(cfg, s.settings, s);
      Object.assign(s, ids);
      await writeAds(c.env.DB, s); // the campaign is kept even if the ad itself fails
      v.metaAdId = await publishAd(cfg, c.env, s.adsetId, v);
      if (!s.stoppedAll) {
        await setStatus(cfg, s.adsetId, true);
        await setStatus(cfg, s.campaignId, true);
      }
      const who = await nameOf(c);
      Object.assign(v, { status: 'live', approvedBy: who, why: '' });
      note(s, `${who} approved “${v.name}”: it’s live${s.stoppedAll ? ' once the ads are started again' : ''}.`);
      await writeAds(c.env.DB, s);
      await log(c, 'ads.approve', v.id, { name: v.name, adId: v.metaAdId });
      return c.json({ ok: true, variant: v });
    });
  });

  /** Pause one ad: anyone with Promote, bots too (stopping spend is always safe). */
  app.post('/:id/pause', async (c) =>
    withMeta(c, async (cfg, s) => {
      const v = s.variants.find((x) => x.id === c.req.param('id'));
      if (!v || v.status !== 'live') return err(c, 404, 'not_found', 'No live ad by that name.');
      await setStatus(cfg, v.metaAdId, false);
      const who = await nameOf(c);
      Object.assign(v, { status: 'paused', why: `Paused by ${who}.` });
      note(s, `${who} paused “${v.name}”.`);
      await writeAds(c.env.DB, s);
      await log(c, 'ads.pause', v.id, {});
      return c.json({ ok: true });
    }),
  );
  app.post('/:id/resume', async (c) => {
    if (!canSpend(c)) return err(c, 403, 'forbidden', 'Only an owner or manager (a person, not a bot) can start an ad again.');
    return withMeta(c, async (cfg, s) => {
      const v = s.variants.find((x) => x.id === c.req.param('id'));
      if (!v || v.status !== 'paused' || !v.metaAdId) return err(c, 404, 'not_found', 'No paused ad by that name.');
      await setStatus(cfg, v.metaAdId, true);
      const who = await nameOf(c);
      Object.assign(v, { status: 'live', why: '' });
      note(s, `${who} started “${v.name}” again.`);
      await writeAds(c.env.DB, s);
      await log(c, 'ads.resume', v.id, {});
      return c.json({ ok: true });
    });
  });

  /** Stop everything (the campaign): anyone with Promote, bots too. */
  app.post('/stop-all', async (c) =>
    withMeta(c, async (cfg, s) => {
      if (s.campaignId) await setStatus(cfg, s.campaignId, false);
      s.stoppedAll = true;
      note(s, `${await nameOf(c)} stopped all the ads.`);
      await writeAds(c.env.DB, s);
      await log(c, 'ads.stop_all', '', {});
      return c.json({ ok: true });
    }),
  );
  app.post('/start-all', async (c) => {
    if (!canSpend(c)) return err(c, 403, 'forbidden', 'Only an owner or manager (a person, not a bot) can start the ads again.');
    return withMeta(c, async (cfg, s) => {
      const spent = s.variants.reduce((a, v) => a + v.stats.spendCents, 0);
      if (spent >= s.settings.totalCapCents) return err(c, 400, 'cap', 'The total cap has been reached. Raise it first (Caps), if you mean to spend more.');
      if (s.campaignId) {
        await setStatus(cfg, s.adsetId, true);
        await setStatus(cfg, s.campaignId, true);
      }
      s.stoppedAll = false;
      note(s, `${await nameOf(c)} started the ads again.`);
      await writeAds(c.env.DB, s);
      await log(c, 'ads.start_all', '', {});
      return c.json({ ok: true });
    });
  });

  /** The caps and audience: people who can see Money only. The daily cap goes to Meta straight away. */
  app.put('/settings', async (c) => {
    if (!canSpend(c)) return err(c, 403, 'forbidden', 'Only an owner or manager (a person, not a bot) can change what the ads spend.');
    const b = AdsSettingsIn.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the caps.');
    const s = await readAds(c.env.DB);
    const cfg = metaConfig(c.env);
    if (s.adsetId && b.data.dailyCapCents !== s.settings.dailyCapCents && !('missing' in cfg)) {
      try {
        await setDailyBudget(cfg, s.adsetId, b.data.dailyCapCents);
      } catch (e) {
        return err(c, 502, 'meta', `Meta said: ${e instanceof MetaError ? e.message : 'it couldn’t be reached.'}`);
      }
    }
    s.settings = b.data;
    note(s, `${await nameOf(c)} set the caps: ${money(b.data.dailyCapCents)} a day, ${money(b.data.totalCapCents)} in all.`);
    await writeAds(c.env.DB, s);
    await log(c, 'ads.settings', '', b.data);
    return c.json({ ok: true, settings: s.settings });
  });

  /** Check now (fresh numbers and the same pausing as the daily run): a few times an hour. */
  app.post('/run', async (c) => {
    if (!(await allow(c.env.DB, 'ads-run', 6, 3_600_000))) return err(c, 429, 'slow_down', 'Checked enough for this hour. Meta’s numbers only move every few hours anyway.');
    return withMeta(c, async (cfg, s) => {
      const changed = await checkAds(c.env, s, cfg);
      await writeAds(c.env.DB, s);
      if (changed.length) await log(c, 'ads.check', '', { changed });
      return c.json({ ok: true, changed, state: s });
    });
  });

  return app;
}

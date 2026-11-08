import { allows, EVENT_ADDON, EVENTS_INCLUDED, FEATURE_LABEL, FREE_GUEST_LIMIT, PLAN_INFO, planFor, planOf, type Feature, type Plan } from '@wp/shared';
import type { Context } from 'hono';

/** The wedding's plan (Free, Essentials or Deluxe; older weddings and the platform's own have everything). */
export async function weddingPlan(db: D1Database, weddingId: string): Promise<Plan> {
  const w = await db.prepare(`SELECT plan FROM wedding WHERE id = ?`).bind(weddingId).first<{ plan: string }>();
  return planOf(w?.plan);
}

/**
 * "That's in Essentials": the answer when a plan doesn't include something (402, with which feature). With
 * `saving`, it's something they made (a seating plan, a budget) that can be looked at but not saved yet.
 */
export const needsUpgrade = (c: Context, f: Feature, saving = false) =>
  c.json(
    {
      error: {
        code: 'upgrade',
        feature: f,
        message:
          f === 'extraEvent'
            ? `Your plan includes the events you have. Another event is an add-on (${EVENT_ADDON.price}): ask for it in Account → Settings → Your plan.`
            : `${FEATURE_LABEL[f]} comes with ${PLAN_INFO[planFor(f)].name}, ${PLAN_INFO[planFor(f)].price} once. ${saving ? 'Upgrade to save it.' : 'Upgrade in Account → Settings → Your plan.'}`,
      },
    },
    402,
  );

/** Whether this wedding's plan includes a feature (Founders' weddings, stored as 'trial', have everything). */
export const hasFeature = async (db: D1Database, weddingId: string, f: Feature) => allows(await weddingPlan(db, weddingId), f);

/**
 * Room for another event: the plan's events plus any add-ons bought (content.extraEvents). Weddings from
 * before plans ('trial') aren't limited.
 */
export async function eventRoom(db: D1Database, weddingId: string): Promise<boolean> {
  const w = await db
    .prepare(
      `SELECT plan, CASE WHEN json_valid(content) THEN COALESCE(json_extract(content, '$.extraEvents'), 0) ELSE 0 END AS extra,
              (SELECT COUNT(*) FROM event e WHERE e.wedding_id = wedding.id AND e.deleted_at IS NULL) AS n
         FROM wedding WHERE id = ?`,
    )
    .bind(weddingId)
    .first<{ plan: string; extra: number; n: number }>();
  if (!w || w.plan === 'trial') return true;
  return w.n < EVENTS_INCLUDED[planOf(w.plan)] + Number(w.extra || 0);
}

/** How many guests (people) a wedding has. */
export async function peopleCount(db: D1Database, weddingId: string): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL`)
    .bind(weddingId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Room for `adding` more guests on this wedding's plan. */
export async function roomFor(db: D1Database, weddingId: string, adding: number): Promise<boolean> {
  if ((await weddingPlan(db, weddingId)) !== 'free') return true;
  return (await peopleCount(db, weddingId)) + adding <= FREE_GUEST_LIMIT;
}

import { allows, EVENT_ADDON, EVENTS_INCLUDED, FEATURE_LABEL, PLAN_INFO, planFor, planOf, type Feature, type Plan } from '@wp/shared';
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
            ? `Your plan includes two events. Another event is an add-on (${EVENT_ADDON.price}): ask for it in Settings → Plan & billing.`
            : `${FEATURE_LABEL[f]} comes with ${PLAN_INFO[planFor(f)].name}, ${PLAN_INFO[planFor(f)].price} once. ${saving ? 'Pay for your plan to save it.' : 'See Settings → Plan & billing.'}`,
      },
    },
    402,
  );

/**
 * Whether this wedding can use a feature. One plan: everything, except texting, which waits until the plan is
 * paid (an unpaid wedding's invitations aren't live, so nothing is texted; credits are needed as well).
 * Founders' weddings ('trial') have everything.
 */
export const hasFeature = async (db: D1Database, weddingId: string, f: Feature) => {
  const plan = await weddingPlan(db, weddingId);
  return f === 'texts' ? plan !== 'free' : allows(plan, f);
};

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

/** How many guests (named people) a wedding has: a blank line from Add guest isn't one. */
export async function peopleCount(db: D1Database, weddingId: string): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL AND trim(p.name) != ''`)
    .bind(weddingId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Room for `adding` more guests: always (one plan, as many guests as you like). Kept for its callers. */
export async function roomFor(db: D1Database, weddingId: string, adding: number): Promise<boolean> {
  void db;
  void weddingId;
  void adding;
  return true;
}

import { FEATURE_LABEL, FREE_GUEST_LIMIT, PLAN_INFO, planFor, planOf, type Feature, type Plan } from '@wp/shared';
import type { Context } from 'hono';

/** The wedding's plan (Free, Essentials or Complete; older weddings and the platform's own have everything). */
export async function weddingPlan(db: D1Database, weddingId: string): Promise<Plan> {
  const w = await db.prepare(`SELECT plan FROM wedding WHERE id = ?`).bind(weddingId).first<{ plan: string }>();
  return planOf(w?.plan);
}

/** "That's in Essentials": the answer when a plan doesn't include something (402, with which feature). */
export const needsUpgrade = (c: Context, f: Feature) =>
  c.json({ error: { code: 'upgrade', feature: f, message: `${FEATURE_LABEL[f]} comes with ${PLAN_INFO[planFor(f)].name}. Upgrade in Account → Settings → Your plan.` } }, 402);

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

/**
 * Fixed-window counter in D1 (table rate_limit). Returns true while under the limit.
 * One atomic upsert, so concurrent requests can't slip past the count.
 */
/** Cron: drop finished windows and expired sessions, so neither table grows for ever. */
export async function purgeExpired(db: D1Database, now = new Date()) {
  const iso = now.toISOString();
  await db.batch([
    db.prepare(`DELETE FROM rate_limit WHERE reset_at <= ?`).bind(iso),
    db.prepare(`DELETE FROM session WHERE expires_at <= ?`).bind(iso),
    db.prepare(`DELETE FROM oauth_state WHERE created_at <= ?`).bind(new Date(now.getTime() - 3_600_000).toISOString()),
  ]);
}

export async function allow(db: D1Database, key: string, limit: number, windowMs: number, now = new Date()): Promise<boolean> {
  const nowIso = now.toISOString();
  const reset = new Date(now.getTime() + windowMs).toISOString();
  const row = await db
    .prepare(
      `INSERT INTO rate_limit (k, n, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT (k) DO UPDATE SET
         n = CASE WHEN reset_at <= ?3 THEN 1 ELSE n + 1 END,
         reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END
       RETURNING n`,
    )
    .bind(key, reset, nowIso)
    .first<{ n: number }>();
  return (row?.n ?? 1) <= limit;
}

/**
 * Traffic and errors, for the company portal's Traffic & errors tab.
 * - Page views: a count per day and kind of page (no addresses kept).
 * - Visitors: a fingerprint of (network, browser, day, secret) that changes every day, so the same person
 *   counts once a day and can't be followed from one day to the next. No cookies.
 * - Errors: the server's own (from onError) and visitors' browsers' (reported by the page), kept 90 days.
 */

/** The kinds of page counted (anything else counts as "other"). */
export const PAGES = ['home', 'designs', 'demo', 'vendors', 'legal', 'invitation', 'guide', 'photos', 'guest-other', 'admin', 'company', 'other'] as const;
export type PageKind = (typeof PAGES)[number];

const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

async function hex(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function recordHit(db: D1Database, page: string, ip: string, ua: string, secret: string) {
  const kind: PageKind = (PAGES as readonly string[]).includes(page) ? (page as PageKind) : 'other';
  const day = ymd();
  const fp = (await hex(`${ip}|${ua}|${day}|${secret}`)).slice(0, 32);
  await db.batch([
    db.prepare(`INSERT INTO site_day (day, page, views) VALUES (?1, ?2, 1) ON CONFLICT (day, page) DO UPDATE SET views = views + 1`).bind(day, kind),
    db.prepare(`INSERT OR IGNORE INTO site_visitor (day, hash) VALUES (?, ?)`).bind(day, fp),
  ]);
}

export async function recordError(db: D1Database, source: 'server' | 'browser', path: string, message: string, detail: string) {
  const now = new Date();
  await db.batch([
    db.prepare(`INSERT INTO error_log (id, at, source, path, message, detail) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), now.toISOString(), source, path.slice(0, 200), message.slice(0, 500), detail.slice(0, 2000)),
    db.prepare(`DELETE FROM error_log WHERE at < ?`).bind(new Date(now.getTime() - 90 * 86_400_000).toISOString()),
    db.prepare(`DELETE FROM site_visitor WHERE day < ?`).bind(ymd(new Date(now.getTime() - 120 * 86_400_000))),
  ]);
}

/** The last `days` days: visitors and views a day, views by page, sign-ins, new couples, and errors. */
export async function traffic(db: D1Database, days = 30) {
  const from = ymd(new Date(Date.now() - (days - 1) * 86_400_000));
  const fromIso = `${from}T00:00:00.000Z`;
  const [views, visitors, pages, logins, couples, errDays, errors] = await db.batch([
    db.prepare(`SELECT day, SUM(views) AS n FROM site_day WHERE day >= ? GROUP BY day`).bind(from),
    db.prepare(`SELECT day, COUNT(*) AS n FROM site_visitor WHERE day >= ? GROUP BY day`).bind(from),
    db.prepare(`SELECT page, SUM(views) AS n FROM site_day WHERE day >= ? GROUP BY page ORDER BY n DESC`).bind(from),
    db.prepare(`SELECT substr(at, 1, 10) AS day, action, COUNT(*) AS n FROM audit WHERE at >= ? AND action IN ('auth.login', 'auth.login_failed') GROUP BY day, action`).bind(fromIso),
    db.prepare(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM wedding WHERE created_at >= ? AND deleted_at IS NULL GROUP BY day`).bind(fromIso),
    db.prepare(`SELECT substr(at, 1, 10) AS day, COUNT(*) AS n FROM error_log WHERE at >= ? GROUP BY day`).bind(fromIso),
    db.prepare(
      `SELECT message, source, COUNT(*) AS n, MAX(at) AS last, MIN(at) AS first,
              (SELECT e2.path FROM error_log e2 WHERE e2.message = e.message AND e2.source = e.source ORDER BY e2.at DESC LIMIT 1) AS path,
              (SELECT e2.detail FROM error_log e2 WHERE e2.message = e.message AND e2.source = e.source ORDER BY e2.at DESC LIMIT 1) AS detail
         FROM error_log e WHERE at >= ? GROUP BY message, source ORDER BY last DESC LIMIT 100`,
    ).bind(fromIso),
  ]);
  const byDay = (rows: unknown) => new Map((rows as { results: { day: string; n: number }[] }).results.map((r) => [r.day, Number(r.n)]));
  const v = byDay(views), u = byDay(visitors), c = byDay(couples), e = byDay(errDays);
  const ok = new Map<string, number>(), bad = new Map<string, number>();
  for (const r of (logins as { results: { day: string; action: string; n: number }[] }).results) (r.action === 'auth.login' ? ok : bad).set(r.day, Number(r.n));
  const list = Array.from({ length: days }, (_, i) => ymd(new Date(Date.now() - (days - 1 - i) * 86_400_000)));
  return {
    days: list.map((day) => ({ day, visitors: u.get(day) ?? 0, views: v.get(day) ?? 0, logins: ok.get(day) ?? 0, failedLogins: bad.get(day) ?? 0, newCouples: c.get(day) ?? 0, errors: e.get(day) ?? 0 })),
    pages: (pages as { results: { page: string; n: number }[] }).results.map((r) => ({ page: r.page, views: Number(r.n) })),
    errors: (errors as { results: { message: string; source: string; n: number; last: string; first: string; path: string; detail: string }[] }).results.map((r) => ({ ...r, n: Number(r.n) })),
  };
}

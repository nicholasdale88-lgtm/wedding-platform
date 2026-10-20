import { commitmentOf, searchKeyOf, VENDOR_SEARCH, type Vendor } from '@wp/shared';

/**
 * The shared vendor directory: wedding suppliers by area, for every wedding.
 * - Vendors are found by a box of latitude and longitude around the venue; each is filed under its grid
 *   square (about 22 km across) for the price ranges.
 * - The first search of a category around a venue (its square, out to 25, 50 or 100 km) fills it from
 *   OpenStreetMap (free, no key); that's kept for 30 days, so later searches are instant and still work when
 *   the map service is down.
 * - Couples' own booked vendors join it (at their venue's square), so it grows with every wedding.
 * - How often each vendor is added or booked, and what couples paid, come from vendor_use. Prices only show
 *   as a range for an area once three weddings have them (never one couple's price).
 */

const CELL = 0.2;
const FRESH_DAYS = 30;
export const cellOf = (lat: number, lon: number) => `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;

/** The box of latitude and longitude around a point, `km` each way. */
export function boxAround(lat: number, lon: number, km: number) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { lat0: lat - dLat, lat1: lat + dLat, lon0: lon - dLon, lon1: lon + dLon };
}
/** A searched area: the venue's square, out to 25, 50 or 100 km (a wider search covers a narrower one). */
const reach = (km: number) => (km <= 25 ? 25 : km <= 50 ? 50 : 100);

const rad = (d: number) => (d * Math.PI) / 180;
export const kmBetween = (lat0: number, lon0: number, lat: number, lon: number) => {
  const a = Math.sin(rad(lat - lat0) / 2) ** 2 + Math.cos(rad(lat0)) * Math.cos(rad(lat)) * Math.sin(rad(lon - lon0) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

type Osm = { lat?: number; lon?: number; center?: { lat: number; lon: number }; id: number; type: string; tags?: Record<string, string> };

/** Ask OpenStreetMap for a category around a point (null when it can't be reached). */
async function fromOsm(category: string, lat: number, lon: number, km: number): Promise<Osm[] | null> {
  const tags = VENDOR_SEARCH[category]?.tags ?? [];
  if (!tags.length) return [];
  const filters = tags.map((t) => {
    const [k, v] = t.split('=');
    return `nwr["${k}"="${v}"](around:${km * 1000},${lat},${lon});`;
  });
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'wedding-platform vendor directory' },
      body: `data=${encodeURIComponent(`[out:json][timeout:20];(${filters.join('')});out center tags 120;`)}`,
    });
    if (!res.ok) return null;
    return ((await res.json()) as { elements?: Osm[] }).elements ?? [];
  } catch {
    return null;
  }
}

export interface DirectoryHit {
  id: string;
  osm: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  km: number;
  lat: number;
  lon: number;
  source: string;
  /** Weddings that added it, and that booked it. */
  added: number;
  booked: number;
}

/**
 * The directory for a category near a point: filled from OpenStreetMap when the area is new or stale,
 * nearest first, with how often couples chose each, and the price range couples nearby paid.
 */
export async function searchDirectory(db: D1Database, category: string, lat: number, lon: number, km: number) {
  const now = new Date().toISOString();
  const here = cellOf(lat, lon);
  const want = reach(km);
  // Fresh when this square has been searched this wide (or wider) in the last 30 days.
  const since = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
  const { results: marks } = await db
    .prepare(`SELECT cell FROM vendor_area_search WHERE category = ? AND cell IN (?, ?, ?) AND searched_at > ?`)
    .bind(category, `${here}~25`, `${here}~50`, `${here}~100`, since)
    .all<{ cell: string }>();
  const stale = !marks.some((m) => Number(m.cell.split('~')[1]) >= want);
  let offline = false;
  if (stale) {
    const els = await fromOsm(category, lat, lon, want);
    if (els === null) offline = true;
    else {
      const rows = els
        .map((e) => {
          const t = e.tags ?? {};
          const la = e.lat ?? e.center?.lat;
          const lo = e.lon ?? e.center?.lon;
          if (!t.name || la === undefined || lo === undefined) return null;
          const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
          return {
            id: `osm:${e.type}/${e.id}`,
            name: t.name.slice(0, 160),
            lat: la,
            lon: lo,
            address: [street, t['addr:suburb'] ?? t['addr:city'], t['addr:postcode']].filter(Boolean).join(', ').slice(0, 300),
            phone: (t.phone ?? t['contact:phone'] ?? '').slice(0, 40),
            email: (t.email ?? t['contact:email'] ?? '').slice(0, 120),
            website: (t.website ?? t['contact:website'] ?? '').slice(0, 300),
          };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      const stmts: D1PreparedStatement[] = rows.map((r) =>
        db
          .prepare(
            `INSERT INTO vendor_directory (id, source, category, name, lat, lon, cell, address, phone, email, website, hidden, first_seen, updated_at)
             VALUES (?, 'osm', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name, lat = excluded.lat, lon = excluded.lon, cell = excluded.cell, address = excluded.address,
               phone = excluded.phone, email = excluded.email, website = excluded.website, updated_at = excluded.updated_at`,
          )
          .bind(r.id, category, r.name, r.lat, r.lon, cellOf(r.lat, r.lon), r.address, r.phone, r.email, r.website, now, now),
      );
      stmts.push(db.prepare(`INSERT INTO vendor_area_search (category, cell, searched_at) VALUES (?, ?, ?) ON CONFLICT (category, cell) DO UPDATE SET searched_at = excluded.searched_at`).bind(category, `${here}~${want}`, now));
      for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
    }
  }
  const b = boxAround(lat, lon, km);
  const { results } = await db
    .prepare(
      `SELECT d.id, d.source, d.name, d.lat, d.lon, d.address, d.phone, d.email, d.website,
              (SELECT COUNT(*) FROM vendor_use u WHERE u.dir_id = d.id) AS added,
              (SELECT COUNT(*) FROM vendor_use u WHERE u.dir_id = d.id AND u.booked = 1) AS booked
         FROM vendor_directory d WHERE d.category = ? AND d.hidden = 0 AND d.lat BETWEEN ? AND ? AND d.lon BETWEEN ? AND ?`,
    )
    .bind(category, b.lat0, b.lat1, b.lon0, b.lon1)
    .all<{ id: string; source: string; name: string; lat: number; lon: number; address: string; phone: string; email: string; website: string; added: number; booked: number }>();
  const seen = new Set<string>();
  const hits: DirectoryHit[] = results
    .map((r) => ({ ...r, osm: r.id.startsWith('osm:') ? r.id.slice(4) : '', km: Math.round(kmBetween(lat, lon, r.lat, r.lon) * 10) / 10 }))
    .filter((r) => r.km <= km && !seen.has(r.name.toLowerCase()) && !!seen.add(r.name.toLowerCase()))
    .sort((a, b) => b.booked - a.booked || a.km - b.km)
    .slice(0, 60);
  // What couples nearby paid for this kind of supplier: a range, once three weddings have prices.
  const { results: prices } = await db
    .prepare(
      `SELECT u.amount FROM vendor_use u JOIN vendor_directory d ON d.id = u.dir_id
        WHERE d.category = ? AND d.lat BETWEEN ? AND ? AND d.lon BETWEEN ? AND ? AND u.booked = 1 AND u.amount > 0 ORDER BY u.amount`,
    )
    .bind(category, b.lat0, b.lat1, b.lon0, b.lon1)
    .all<{ amount: number }>();
  const amounts = prices.map((p) => p.amount);
  // The middle half (quartiles, rounded outwards) and the median.
  const n = amounts.length;
  const pick = (i: number) => amounts[Math.min(n - 1, Math.max(0, i))]!;
  const price = n >= 3 ? { low: Math.round(pick(Math.floor(0.25 * (n - 1)))), typical: Math.round(pick(Math.round(0.5 * (n - 1)))), high: Math.round(pick(Math.ceil(0.75 * (n - 1)))), weddings: n } : null;
  return { results: hits, price, offline: offline && !hits.length };
}

/**
 * After a wedding saves its vendors: each vendor from the directory records whether it's booked and what
 * it cost; a booked vendor that isn't in the directory yet joins it (at the venue's square), as long as it
 * has something to find it by (a phone, a website or an email).
 */
export async function recordUse(db: D1Database, weddingId: string, list: Vendor[], venue: { lat: number; lon: number } | null) {
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  const keep: string[] = [];
  for (const v of list) {
    let dir = v.dirId;
    if (!dir && venue && v.status === 'booked' && (v.phone || v.website || v.email)) {
      const category = searchKeyOf(`${v.category} ${v.name}`);
      if (category) {
        dir = `c:${category}:${v.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}:${cellOf(venue.lat, venue.lon)}`;
        stmts.push(
          db
            .prepare(
              `INSERT INTO vendor_directory (id, source, category, name, lat, lon, cell, address, phone, email, website, hidden, first_seen, updated_at)
               VALUES (?, 'couple', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT (id) DO NOTHING`,
            )
            .bind(dir, category, v.name.slice(0, 160), venue.lat, venue.lon, cellOf(venue.lat, venue.lon), v.address.slice(0, 300), v.phone.slice(0, 40), v.email.slice(0, 120), v.website.slice(0, 300), now, now),
        );
      }
    }
    if (!dir) continue;
    keep.push(dir);
    const booked = v.status === 'booked';
    stmts.push(
      db
        .prepare(
          `INSERT INTO vendor_use (wedding_id, dir_id, booked, amount, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (wedding_id, dir_id) DO UPDATE SET booked = excluded.booked, amount = excluded.amount, updated_at = excluded.updated_at`,
        )
        .bind(weddingId, dir, booked ? 1 : 0, booked ? commitmentOf(v).amount : 0, now),
    );
  }
  // A vendor taken off their list no longer counts for them.
  const { results: had } = await db.prepare(`SELECT dir_id FROM vendor_use WHERE wedding_id = ?`).bind(weddingId).all<{ dir_id: string }>();
  const kept = new Set(keep);
  for (const h of had) if (!kept.has(h.dir_id)) stmts.push(db.prepare(`DELETE FROM vendor_use WHERE wedding_id = ? AND dir_id = ?`).bind(weddingId, h.dir_id));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

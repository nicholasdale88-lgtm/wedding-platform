import { localParts, weatherWords, type Forecast } from '@wp/shared';

/**
 * Live forecast for a guide (Open-Meteo: free, no key). Only within its 16-day range; cached per
 * event for 30 minutes in D1 so a busy night-before costs one request. Any failure means "no forecast"
 * and the guide says so; it never shows invented weather.
 */

const TTL_MS = 30 * 60 * 1000;
const RANGE_DAYS = 15;

export interface WeatherQuery {
  eventId: string;
  lat: number;
  lon: number;
  timezone: string;
  /** Event start (UTC ISO); the forecast is for that local day. */
  startsAt: string;
  /** Times to show, from the run of the day ("2:00pm"). First four on that day. */
  times: string[];
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function forecastFor(db: D1Database, q: WeatherQuery, now = new Date(), fetcher: Fetcher = fetch): Promise<Forecast | null> {
  const days = (Date.parse(q.startsAt) - now.getTime()) / 864e5;
  if (!(days < RANGE_DAYS && days > -1)) return null;

  const cached = await db.prepare(`SELECT json, fetched_at FROM weather_cache WHERE event_id = ?`).bind(q.eventId).first<{ json: string; fetched_at: string }>();
  if (cached && now.getTime() - Date.parse(cached.fetched_at) < TTL_MS) return JSON.parse(cached.json) as Forecast;

  const fresh = await fetchForecast(q, now, fetcher).catch(() => null);
  if (!fresh) return cached ? (JSON.parse(cached.json) as Forecast) : null; // stale beats nothing
  await db
    .prepare(`INSERT INTO weather_cache (event_id, json, fetched_at) VALUES (?1, ?2, ?3) ON CONFLICT (event_id) DO UPDATE SET json = ?2, fetched_at = ?3`)
    .bind(q.eventId, JSON.stringify(fresh), now.toISOString())
    .run();
  return fresh;
}

/** "2:00pm" -> 14; null if not a time. */
export function hourOf(t: string): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h >= 0 && h < 24 ? h : null;
}

async function fetchForecast(q: WeatherQuery, now: Date, fetcher: Fetcher): Promise<Forecast | null> {
  const p = localParts(new Date(q.startsAt), q.timezone);
  const day = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${q.lat}&longitude=${q.lon}` +
    `&hourly=temperature_2m,precipitation_probability&daily=weather_code,temperature_2m_max` +
    `&timezone=${encodeURIComponent(q.timezone)}&start_date=${day}&end_date=${day}`;
  const res = await fetcher(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    hourly?: { time: string[]; temperature_2m: (number | null)[]; precipitation_probability: (number | null)[] };
    daily?: { weather_code: (number | null)[]; temperature_2m_max: (number | null)[] };
  };
  const code = j.daily?.weather_code[0];
  const max = j.daily?.temperature_2m_max[0];
  if (code == null || max == null || !j.hourly) return null;
  const hours: Forecast['hours'] = [];
  for (const t of q.times) {
    const h = hourOf(t);
    if (h === null) continue;
    const temp = j.hourly.temperature_2m[h];
    const rain = j.hourly.precipitation_probability[h];
    if (temp == null) continue;
    hours.push({ label: t.replace(/:00/, ''), temp: `${Math.round(temp)}°`, rain: `${Math.round(rain ?? 0)}` });
    if (hours.length === 4) break;
  }
  return { summary: weatherWords(code), detail: '', max: Math.round(max), hours, updated: now.toISOString() };
}

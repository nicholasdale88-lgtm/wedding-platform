import { localParts, type Forecast } from '@wp/shared';

/**
 * Live forecast for a guide from MET Norway's Locationforecast (api.met.no): free, no key, commercial
 * use allowed under CC BY 4.0 with credit (on the Terms page). Their terms ask for an identifying
 * User-Agent, at most four decimals of lat/lon, and caching: cached per event for 30 minutes in D1 so
 * a busy night-before costs one request. Only within its ~9-day range. Any failure means "no forecast"
 * and the guide says so; it never shows invented weather.
 */

const TTL_MS = 30 * 60 * 1000;
const RANGE_DAYS = 9;
const USER_AGENT = 'TheYesList/1.0 (+https://wedding-platform-nd.pages.dev)';

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
  const dayKey = (d: Date) => {
    const p = localParts(d, q.timezone);
    return { key: `${p.year}-${p.month}-${p.day}`, hour: p.hour % 24 };
  };
  const day = dayKey(new Date(q.startsAt)).key;
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${+q.lat.toFixed(4)}&lon=${+q.lon.toFixed(4)}`;
  const res = await fetcher(url, { signal: AbortSignal.timeout(3000), headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) return null;
  const j = (await res.json()) as { properties?: { timeseries?: MetStep[] } };

  // The steps on the event's local day (hourly for the first couple of days, then every six hours).
  const steps = (j.properties?.timeseries ?? [])
    .map((s) => ({ s, ...dayKey(new Date(s.time)) }))
    .filter((x) => x.key === day && typeof x.s.data?.instant?.details?.air_temperature === 'number');
  if (!steps.length) return null;

  const temps = steps.map((x) => x.s.data.instant.details.air_temperature as number);
  const maxes = steps.map((x) => x.s.data.next_6_hours?.details?.air_temperature_max).filter((n): n is number => typeof n === 'number');
  const max = Math.max(...temps, ...maxes);

  // The day's look: the most common symbol between 9am and 9pm (the worse one on a tie).
  const tally = new Map<string, number>();
  for (const x of steps) {
    if (x.hour < 9 || x.hour > 21) continue;
    const w = symbolWords(x.s.data.next_1_hours?.summary?.symbol_code ?? x.s.data.next_6_hours?.summary?.symbol_code);
    if (w) tally.set(w, (tally.get(w) ?? 0) + 1);
  }
  const summary = [...tally].sort((a, b) => b[1] - a[1] || SEVERITY.indexOf(b[0]) - SEVERITY.indexOf(a[0]))[0]?.[0];
  if (!summary) return null;

  const hours: Forecast['hours'] = [];
  for (const t of q.times) {
    const h = hourOf(t);
    if (h === null) continue;
    // That hour's step, or the nearest within three hours once the forecast goes six-hourly.
    const near = steps.reduce<(typeof steps)[number] | null>((best, x) => (!best || Math.abs(x.hour - h) < Math.abs(best.hour - h) ? x : best), null);
    if (!near || Math.abs(near.hour - h) > 3) continue;
    const d = near.s.data;
    hours.push({ label: t.replace(/:00/, ''), temp: `${Math.round(d.instant.details.air_temperature as number)}°`, rain: `${rainChance(d)}` });
    if (hours.length === 4) break;
  }
  return { summary, detail: '', max: Math.round(max), hours, updated: now.toISOString() };
}

interface MetPeriod {
  summary?: { symbol_code?: string };
  details?: { precipitation_amount?: number; probability_of_precipitation?: number; air_temperature_max?: number };
}
interface MetStep {
  time: string;
  data: { instant: { details: { air_temperature?: number } }; next_1_hours?: MetPeriod; next_6_hours?: MetPeriod; next_12_hours?: MetPeriod };
}

/** Chance of rain (%): MET's own probability where it gives one, else read from the expected amount. */
function rainChance(d: MetStep['data']): number {
  const pop = d.next_1_hours?.details?.probability_of_precipitation ?? d.next_6_hours?.details?.probability_of_precipitation ?? d.next_12_hours?.details?.probability_of_precipitation;
  if (typeof pop === 'number') return Math.round(pop);
  const mm = d.next_1_hours?.details?.precipitation_amount ?? (d.next_6_hours?.details?.precipitation_amount ?? 0) / 6;
  return mm <= 0 ? 0 : mm < 0.5 ? 30 : mm < 2 ? 60 : 80;
}

/** Mildest first: a tie in the day's tally goes to the later one. */
const SEVERITY = ['Sunny', 'Mostly sunny', 'Cloudy', 'Foggy', 'Drizzle', 'Showers', 'Rain', 'Snow', 'Storms'];

/** MET Norway symbol ("lightrainshowers_day") -> a word or two. */
export function symbolWords(code: string | undefined): string | null {
  if (!code) return null;
  const c = code.replace(/_(day|night|polartwilight)$/, '');
  if (c.includes('thunder')) return 'Storms';
  if (c.includes('snow') || c.includes('sleet')) return 'Snow';
  if (c.includes('showers')) return 'Showers';
  if (c === 'lightrain') return 'Drizzle';
  if (c.includes('rain')) return 'Rain';
  if (c === 'fog') return 'Foggy';
  if (c === 'cloudy') return 'Cloudy';
  if (c === 'clearsky') return 'Sunny';
  if (c === 'fair' || c === 'partlycloudy') return 'Mostly sunny';
  return null;
}

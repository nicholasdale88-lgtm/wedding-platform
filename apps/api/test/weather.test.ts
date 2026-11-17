import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forecastFor, hourOf, symbolWords, type WeatherQuery } from '../src/lib/weather';
import { testD1 } from './support/d1';

describe('guide forecast (MET Norway)', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  beforeEach(async () => (t = await testD1()));
  afterEach(() => t.dispose());

  const q: WeatherQuery = { eventId: 'e1', lat: -33.371234, lon: 151.19, timezone: 'Australia/Sydney', startsAt: '2027-11-18T03:00:00.000Z', times: ['1:30pm', '2:00pm', 'late', '6:00pm', '11:00pm', '11:30pm'] };
  const now = new Date('2027-11-15T00:00:00Z');
  // Sydney is UTC+11 in November: local hour h on the 18th is 13:00Z on the 17th plus h hours.
  // Hourly steps for that whole local day, plus a step the day before and after that must be ignored.
  const step = (iso: string, temp: number, symbol: string, extra: Record<string, number> = {}) => ({
    time: iso,
    data: { instant: { details: { air_temperature: temp } }, next_1_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: 0, ...extra } } },
  });
  const series = () => {
    const out = [step('2027-11-17T12:00:00Z', 40, 'clearsky_day')]; // 11pm on the 17th, local
    for (let h = 0; h < 24; h++) {
      const at = new Date(Date.UTC(2027, 10, 17, 13 + h)).toISOString();
      out.push(step(at, 10 + h / 2, h >= 9 && h <= 15 ? 'rain' : 'cloudy', h === 14 ? { probability_of_precipitation: 70.4 } : h === 18 ? { precipitation_amount: 1.2 } : {}));
    }
    out.push(step('2027-11-18T13:00:00Z', 41, 'clearsky_night')); // midnight on the 19th, local
    return out;
  };
  let calls: { url: string; init?: RequestInit }[] = [];
  const ok = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ properties: { timeseries: series() } }));
  };
  beforeEach(() => (calls = []));

  it('reads the local day, the run-of-day hours, and caches for 30 minutes', async () => {
    const f = await forecastFor(t.db, q, now, ok);
    expect(calls[0]!.url).toBe('https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=-33.3712&lon=151.19');
    expect(new Headers(calls[0]!.init?.headers).get('User-Agent')).toMatch(/^TheYesList\/1\.0 \(\+https:\/\//);
    expect(f).toMatchObject({ summary: 'Rain', max: 22 });
    expect(f!.hours.map((h) => h.label)).toEqual(['1:30pm', '2pm', '6pm', '11pm']);
    expect(f!.hours[1]).toEqual({ label: '2pm', temp: '17°', rain: '70' });
    expect(f!.hours[2]).toEqual({ label: '6pm', temp: '19°', rain: '60' }); // 1.2 mm expected, no probability given
    expect(f!.hours[3]!.rain).toBe('0');
    await forecastFor(t.db, q, new Date(now.getTime() + 20 * 60_000), ok);
    expect(calls).toHaveLength(1);
    await forecastFor(t.db, q, new Date(now.getTime() + 31 * 60_000), ok);
    expect(calls).toHaveLength(2);
  });

  it('nothing outside the forecast range, and no invented weather on failure', async () => {
    expect(await forecastFor(t.db, q, new Date('2027-11-05T00:00:00Z'), ok)).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await forecastFor(t.db, q, now, async () => new Response('down', { status: 503 }))).toBeNull();
    expect(await forecastFor(t.db, q, now, async () => { throw new Error('offline'); })).toBeNull();
    expect(await forecastFor(t.db, q, now, async () => new Response(JSON.stringify({ properties: { timeseries: [] } })))).toBeNull();
  });

  it('a failed refresh keeps the last good forecast', async () => {
    await forecastFor(t.db, q, now, ok);
    const later = await forecastFor(t.db, q, new Date(now.getTime() + 2 * 3600_000), async () => { throw new Error('offline'); });
    expect(later).toMatchObject({ summary: 'Rain' });
  });

  it('understands run-of-day times', () => {
    expect([hourOf('2:00pm'), hourOf('12pm'), hourOf('12:30am'), hourOf('9:30'), hourOf('late'), hourOf('13:00')]).toEqual([14, 12, 0, 9, null, 13]);
  });

  it('turns MET symbols into words', () => {
    expect(['clearsky_day', 'fair_night', 'partlycloudy_day', 'cloudy', 'fog', 'lightrain', 'heavyrain', 'lightrainshowers_day', 'rainandthunder', 'sleet', 'what']
      .map(symbolWords)).toEqual(['Sunny', 'Mostly sunny', 'Mostly sunny', 'Cloudy', 'Foggy', 'Drizzle', 'Rain', 'Showers', 'Storms', 'Snow', null]);
  });
});

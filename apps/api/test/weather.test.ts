import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forecastFor, hourOf, type WeatherQuery } from '../src/lib/weather';
import { testD1 } from './support/d1';

describe('guide forecast (Open-Meteo)', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  beforeEach(async () => (t = await testD1()));
  afterEach(() => t.dispose());

  const q: WeatherQuery = { eventId: 'e1', lat: -33.37, lon: 151.19, timezone: 'Australia/Sydney', startsAt: '2027-11-18T03:00:00.000Z', times: ['1:30pm', '2:00pm', 'late', '6:00pm', '11:00pm', '11:30pm'] };
  const now = new Date('2027-11-15T00:00:00Z');
  const hourly = (n: number) => Array.from({ length: 24 }, (_, h) => n + h / 2);
  let calls: string[] = [];
  const ok = async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({ hourly: { time: [], temperature_2m: hourly(10), precipitation_probability: hourly(0) }, daily: { weather_code: [61], temperature_2m_max: [27.4] } }));
  };
  beforeEach(() => (calls = []));

  it('reads the local day, the run-of-day hours, and caches for an hour', async () => {
    const f = await forecastFor(t.db, q, now, ok);
    expect(calls[0]).toContain('start_date=2027-11-18&end_date=2027-11-18');
    expect(calls[0]).toContain('timezone=Australia%2FSydney');
    expect(f).toMatchObject({ summary: 'Rain', max: 27 });
    expect(f!.hours.map((h) => h.label)).toEqual(['1:30pm', '2pm', '6pm', '11pm']);
    expect(f!.hours[1]).toEqual({ label: '2pm', temp: '17°', rain: '7' });
    await forecastFor(t.db, q, new Date(now.getTime() + 30 * 60_000), ok);
    expect(calls).toHaveLength(1);
    await forecastFor(t.db, q, new Date(now.getTime() + 61 * 60_000), ok);
    expect(calls).toHaveLength(2);
  });

  it('nothing outside the forecast range, and no invented weather on failure', async () => {
    expect(await forecastFor(t.db, q, new Date('2027-10-01T00:00:00Z'), ok)).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await forecastFor(t.db, q, now, async () => new Response('down', { status: 503 }))).toBeNull();
    expect(await forecastFor(t.db, q, now, async () => { throw new Error('offline'); })).toBeNull();
  });

  it('a failed refresh keeps the last good forecast', async () => {
    await forecastFor(t.db, q, now, ok);
    const later = await forecastFor(t.db, q, new Date(now.getTime() + 2 * 3600_000), async () => { throw new Error('offline'); });
    expect(later).toMatchObject({ summary: 'Rain' });
  });

  it('understands run-of-day times', () => {
    expect([hourOf('2:00pm'), hourOf('12pm'), hourOf('12:30am'), hourOf('9:30'), hourOf('late'), hourOf('13:00')]).toEqual([14, 12, 0, 9, null, 13]);
  });
});

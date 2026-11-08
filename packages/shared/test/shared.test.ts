import { describe, expect, it } from 'vitest';
import {
  displayPhone, inQuietHours, isToken, joinDiet, joinFirstNames, localParts, nonGsmChars, randomToken, render, segments,
  splitDiet, toE164, toGsm, toProviderFormat, unknownPlaceholders, zonedToUtc,
} from '../src';

const TZ = 'Australia/Sydney';

describe('phone', () => {
  it.each([
    ['0412 381 904', '+61412381904'],
    ['+61 412 381 904', '+61412381904'],
    ['61412381904', '+61412381904'],
    ['412381904', '+61412381904'],
    ['(0412) 381-904', '+61412381904'],
    ['0061412381904', '+61412381904'],
  ])('normalises %s', (input, out) => expect(toE164(input)).toBe(out));

  it.each(['', '02 4375 1222', '0412 381', 'abc', null])('rejects %s', (input) => expect(toE164(input)).toBeNull());

  it('displays and formats for the provider', () => {
    expect(displayPhone('+61412381904')).toBe('0412 381 904');
    expect(toProviderFormat('+61412381904')).toBe('0412381904');
  });
});

describe('tokens', () => {
  it('are 22 url-safe chars and unique', () => {
    const set = new Set(Array.from({ length: 5000 }, () => randomToken()));
    expect(set.size).toBe(5000);
    for (const t of set) expect(isToken(t)).toBe(true);
  });
});

describe('time (Sydney, DST-safe)', () => {
  it('converts wall-clock to UTC in summer (AEDT, +11)', () => {
    expect(zonedToUtc('2027-11-17T17:00', TZ).toISOString()).toBe('2027-11-17T06:00:00.000Z');
  });
  it('converts wall-clock to UTC in winter (AEST, +10)', () => {
    expect(zonedToUtc('2027-06-18T10:00', TZ).toISOString()).toBe('2027-06-18T00:00:00.000Z');
  });
  it('round-trips across the October DST change', () => {
    const utc = zonedToUtc('2027-10-03T09:00', TZ);
    expect(localParts(utc, TZ)).toMatchObject({ day: 3, hour: 9, minute: 0 });
  });
  it('quiet hours are 20:00-08:00 local', () => {
    expect(inQuietHours(zonedToUtc('2027-06-18T07:59', TZ), TZ)).toBe(true);
    expect(inQuietHours(zonedToUtc('2027-06-18T08:00', TZ), TZ)).toBe(false);
    expect(inQuietHours(zonedToUtc('2027-06-18T19:59', TZ), TZ)).toBe(false);
    expect(inQuietHours(zonedToUtc('2027-06-18T20:00', TZ), TZ)).toBe(true);
  });
});

describe('sms segments', () => {
  it('counts GSM parts', () => {
    expect(segments('a'.repeat(160)).parts).toBe(1);
    expect(segments('a'.repeat(161)).parts).toBe(2);
    expect(segments('a'.repeat(306)).parts).toBe(2);
    expect(segments('a'.repeat(307)).parts).toBe(3);
  });
  it('extension chars cost two', () => expect(segments('€'.repeat(80)).length).toBe(160));
  it('emoji forces unicode', () => {
    const s = segments('Hi 🎉');
    expect(s.unicode).toBe(true);
    expect(nonGsmChars('Hi 🎉')).toEqual(['🎉']);
  });
  it('replaces smart punctuation', () => expect(toGsm('Nick’s “day” – yes…')).toBe('Nick\'s "day" - yes...'));
});

describe('templates', () => {
  it('joins first names', () => {
    expect(joinFirstNames(['Margaret Bloor'])).toBe('Margaret');
    expect(joinFirstNames(['Margaret Bloor', 'Peter Bloor'])).toBe('Margaret and Peter');
    expect(joinFirstNames(['Charlotte Wilson', 'Ben Wilson', 'Archie', 'Lily'])).toBe('Charlotte, Ben, Archie and Lily');
    expect(joinFirstNames([])).toBe('there');
  });
  it('flags unknown placeholders, allows per-event guides', () => {
    expect(unknownPlaceholders('Hi {first} {link} {guide30} {frist}')).toEqual(['frist']);
  });
  it('renders', () => expect(render('Hi {first}: {link}', { first: 'Ella', link: 'x/y' })).toBe('Hi Ella: x/y'));
});

describe('splitDiet / joinDiet (one note per invitation, one per person)', () => {
  const two = ['Margaret Bloor', 'Peter Bloor'];
  it('gives each person their own part', () => {
    expect(splitDiet('Margaret vegetarian, Peter coeliac', two)).toEqual(['Vegetarian', 'Coeliac']);
    expect(splitDiet('Peter: nut allergy (severe); Margaret: no pork', two)).toEqual(['No pork', 'Nut allergy (severe)']);
    expect(splitDiet("Peter is gluten free. Margaret's vegan", two)).toEqual(['Vegan', 'Gluten free']);
  });
  it('a note naming nobody belongs to the main contact; a single guest gets it all', () => {
    expect(splitDiet('Vegetarian', two)).toEqual(['Vegetarian', '']);
    expect(splitDiet('Vegetarian, no nuts', ['Ella Thompson'])).toEqual(['Vegetarian, no nuts']);
    expect(splitDiet('  ', two)).toEqual(['', '']);
  });
  it('text after a name stays with that person until the next name', () => {
    expect(splitDiet('Peter coeliac; also no dairy', two)).toEqual(['', 'Coeliac; Also no dairy']);
  });
  it('round-trips: what the form shows is read back the same way', () => {
    const people = [
      { name: 'Margaret Bloor', diet: 'Vegetarian' },
      { name: 'Peter Bloor', diet: 'Coeliac' },
    ];
    expect(joinDiet(people)).toBe('Margaret: Vegetarian; Peter: Coeliac');
    expect(splitDiet(joinDiet(people), two)).toEqual(['Vegetarian', 'Coeliac']);
    expect(joinDiet([{ name: 'Ella T', diet: 'Vegan' }])).toBe('Vegan');
  });
});

describe('room size', () => {
  it('a bigger room keeps its shape and makes every table smaller on the plan', async () => {
    const { tableBox, roomAspect, roomScale, roomShape, cssAspect, aspectRatio } = await import('../src/seating');
    expect(roomAspect('16 / 9', 2)).toBe('16 / 9 x2');
    expect(roomAspect('16 / 9 x2', 1)).toBe('16 / 9');
    expect([roomScale('4 / 3 x1.5'), roomScale('4 / 3'), roomScale('4 / 3 x9')]).toEqual([1.5, 1, 1]);
    expect(roomShape('2 / 1 x3')).toBe('2 / 1');
    expect(cssAspect('4 / 3 x2')).toBe('4/3');
    expect(aspectRatio('4 / 3 x2')).toBeCloseTo(4 / 3);
    const t = { shape: 'round' as const, dir: 'h' as const, len: 40 };
    expect(tableBox(t, '4 / 3 x2').w).toBeCloseTo(tableBox(t, '4 / 3').w / 2);
  });

  it('a room in metres draws every table to scale, and a table can be given its own size', async () => {
    const { tableBox, roomMetres, metresAspect, roomShape, cssAspect, aspectRatio, roomScale } = await import('../src/seating');
    expect(metresAspect(24.2, 18)).toBe('24 / 18 m');
    expect(roomMetres('24 / 18 m')).toEqual({ w: 24, h: 18 });
    expect(roomMetres('4 / 3')).toBeNull();
    expect(cssAspect('24 / 18 m')).toBe('24/18');
    expect(aspectRatio('30 / 15 m')).toBe(2);
    expect(roomScale('24 / 18 m')).toBe(1);
    expect(roomShape('30 / 15 m')).toBe('2 / 1'); // the closest usual shape
    // A 1.8 m round table in a 24 m wide room: 7.5% of its width; given 3 m, 12.5%.
    const t = { shape: 'round' as const, dir: 'h' as const, len: 40 };
    expect(tableBox(t, '24 / 18 m').w).toBeCloseTo(7.5);
    expect(tableBox({ ...t, size: 3 }, '24 / 18 m').w).toBeCloseTo(12.5);
    // A 6 m banquet table standing up and down: 6 m of the 18 m depth.
    expect(tableBox({ shape: 'long', dir: 'v', len: 40, size: 6 }, '24 / 18 m').h).toBeCloseTo(100 / 3);
  });
});

describe('chairs', () => {
  it('keeps chosen chairs and fills the rest in order', async () => {
    const { chairsAt } = await import('../src/seating');
    const p = (id: string) => ({ id });
    const a = p('a');
    const b = p('b');
    const c = p('c');
    expect(chairsAt([a, b, c], {}, 4)).toEqual([a, b, c, null]);
    expect(chairsAt([a, b, c], { c: 1, a: 4 }, 4)).toEqual([c, b, null, a]);
    // Two asking for one chair: the first keeps it. A chair past the seats is ignored.
    expect(chairsAt([a, b], { a: 2, b: 2 }, 3)).toEqual([b, a, null]);
    expect(chairsAt([a], { a: 9 }, 2)).toEqual([a, null]);
    // More people than seats: the extra one comes last.
    expect(chairsAt([a, b, c], {}, 2)).toEqual([a, b, c]);
  });
});

describe('contact gaps', () => {
  it("flags a guest the chosen way can't reach", async () => {
    const { contactGaps } = await import('../src/contacts');
    expect(contactGaps({ phone: '+61412000111', channel: '' })).toEqual([]);
    expect(contactGaps({ channel: '' })).toEqual(['contact']);
    expect(contactGaps({ email: 'a@b.co', channel: 'text' })).toEqual(['mobile']);
    expect(contactGaps({ phone: '+61412000111', channel: 'both' })).toEqual(['email']);
    expect(contactGaps({ channel: 'phone' })).toEqual(['mobile']);
    expect(contactGaps({ delivery: 'post', channel: 'email' })).toEqual(['address']);
    expect(contactGaps({ delivery: 'both', email: 'a@b.co', address: { street: '1 Rose St' } })).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { exportRows, toImportRows } from '../src/admin/guestImport';
import { parseTable } from '../src/lib/csv';
import { events, guests } from './fixtures';

describe('reading a guest spreadsheet', () => {
  it('reads CSV with quotes, and cells pasted from Excel (tabs)', () => {
    expect(parseTable('Name,Mobile\n"Lee, Alex & Sam",0412 345 678\n\n')).toEqual([['Name', 'Mobile'], ['Lee, Alex & Sam', '0412 345 678']]);
    expect(parseTable('Name\tSeats\r\nJo Banks\t1\r\n')).toEqual([['Name', 'Seats'], ['Jo Banks', '1']]);
    expect(parseTable(`${String.fromCharCode(0xfeff)}Name\nX`)).toEqual([['Name'], ['X']]);
  });

  it('understands names in one cell or their own columns, mobiles, seats and event columns', () => {
    const ev = events.map((e) => e.name);
    const table = parseTable(`Guest name,Partner,Mobile,Seats,${ev.join(',')}\nAlex Lee & Sam Lee,,0412 345 678,2,${ev.map(() => 'yes').join(',')}\nJo Banks,Chris Banks,,,${ev.map((_, i) => (i === 0 ? 'y' : 'no')).join(',')}`);
    const { rows } = toImportRows(table, events);
    expect(rows[0]).toEqual({ people: ['Alex Lee', 'Sam Lee'], phone: '0412 345 678', seats: 2, invited: events.map((e) => e.key) });
    expect(rows[1]).toEqual({ people: ['Jo Banks', 'Chris Banks'], invited: [events[0]!.key] });
  });

  it('without event columns, nobody is limited (the server invites them to everything)', () => {
    const { rows } = toImportRows(parseTable('Name\nPat Solo'), events);
    expect(rows).toEqual([{ people: ['Pat Solo'] }]);
  });

  it('exports every invitation with replies per event', () => {
    const out = exportRows(guests, events);
    expect(out[0]).toEqual(expect.arrayContaining(['Main contact', 'Mobile', 'Dietary']));
    expect(out).toHaveLength(guests.length + 1);
  });
});

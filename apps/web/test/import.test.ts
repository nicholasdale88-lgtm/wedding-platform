import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportRows, exportSheets, toImportRows } from '../src/admin/guestImport';
import { parseTable } from '../src/lib/csv';
import { readTableFile, readXlsx, writeXlsx } from '../src/lib/xlsx';
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

describe('Excel files (.xlsx)', () => {
  it('a workbook we write reads back exactly: text stays text, numbers stay numbers', () => {
    const rows = [['Name', 'Mobile', 'Seats', 'Note'], ['Alex & Sam', '0412 345 678', 2, '=1+1 <b>&"quotes"'], ['Jo', '', 1, 'Line one\nline two']];
    const back = readXlsx(writeXlsx([{ name: 'Guests', rows }]));
    expect(back).toEqual([['Name', 'Mobile', 'Seats', 'Note'], ['Alex & Sam', '0412 345 678', '2', '=1+1 <b>&"quotes"'], ['Jo', '', '1', 'Line one\nline two']]);
  });

  it('a dressed export: title band, event lines, filters, frozen themed header, seal; it still imports straight back', () => {
    const sheets = exportSheets(guests, events, {});
    const head = { title: 'Alex & Blair · Guest list', lines: ['The wedding · Sat 6 Mar 2027, 4:00pm · The Garden', 'Exported Tue 19 Oct, 9:00am'] };
    const seal = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const file = writeXlsx([{ ...sheets[0]!, head }], { ink: '#46543a', soft: '#ece8d3', band: '#f6f0e2', line: '#d3cba9', seal });
    const zip = unzipSync(file);
    const xml = strFromU8(zip['xl/worksheets/sheet1.xml']!);
    const lastRow = sheets[0]!.rows.length + 3; // title, two event lines, a gap, then the table
    expect(xml).toContain('Alex &amp; Blair · Guest list');
    expect(xml).toContain('The wedding · Sat 6 Mar 2027, 4:00pm · The Garden');
    expect(xml).toMatch(new RegExp(`<autoFilter ref="A4:[A-Z]+${lastRow}"/>`));
    expect(xml).toContain('<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>');
    expect(xml).toContain('<mergeCell ref="A1:');
    expect(xml).toContain('<drawing r:id="rId1"/>');
    expect(strFromU8(zip['xl/styles.xml']!)).toContain('FF46543A'); // the theme's ink
    expect(zip['xl/media/seal.png']).toEqual(seal);
    expect(strFromU8(zip['xl/workbook.xml']!)).toContain('_xlnm._FilterDatabase');
    const { rows } = toImportRows(readXlsx(file), events);
    expect(rows.length).toBe(guests.length);
  });

  it('the full export has invitations, people and a summary; it imports straight back', () => {
    const sheets = exportSheets(guests, events, { [guests[0]!.id]: 'https://example.com/w/x/?g=abc' });
    expect(sheets.map((s) => s.name)).toEqual(['Invitations', 'People', 'Summary']);
    expect(sheets[0]!.rows[0]).toEqual(expect.arrayContaining(['Group', 'Personal link', 'Texts allowed']));
    expect(sheets[1]!.rows.length).toBe(guests.flatMap((g) => g.people).length + 1);
    const { rows } = toImportRows(readXlsx(writeXlsx([sheets[0]!])), events);
    expect(rows.length).toBe(guests.length);
    expect(rows[0]!.party).toBe('Family');
  });

  it('mobiles Excel turned into numbers get their 0 back; groups are read', () => {
    const { rows } = toImportRows([['Name', 'Mobile', 'Side'], ['Pat Solo', '412345678', "Sophie's side"]], events);
    expect(rows[0]).toEqual({ people: ['Pat Solo'], phone: '0412345678', party: "Sophie's side" });
  });

  it('refuses things that are not workbooks, in plain English', async () => {
    expect(() => readXlsx(new TextEncoder().encode('not a zip'))).toThrow(/isn't an Excel workbook/);
    await expect(readTableFile(new File(['x'], 'old.xls'), parseTable)).rejects.toThrow(/Save As/);
  });
});

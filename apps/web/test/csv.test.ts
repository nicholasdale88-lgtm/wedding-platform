import { describe, expect, it } from 'vitest';
import { cell, toCsv } from '../src/lib/csv';

describe('spreadsheet exports', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(toCsv([['Name', 'Note'], ['Robin, Sam', 'Says "hi"\nthere']])).toBe('Name,Note\r\nRobin, Sam'.replace('Robin, Sam', '"Robin, Sam"') + ',"Says ""hi""\nthere"');
  });
  it('a guest-typed formula is plain text when opened in Excel (CSV injection)', () => {
    for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)']) expect(cell(evil).replace(/^"/, '').startsWith("'")).toBe(true);
    expect(cell('Vegetarian')).toBe('Vegetarian');
    expect(cell(null)).toBe('');
  });
});

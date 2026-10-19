/**
 * Spreadsheet exports (open straight in Excel or Google Sheets).
 * Guests type these values, so a cell that starts like a formula (= + - @) is made plain text:
 * opening the file can never run anything (CSV injection).
 */

export function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n');

/** Save as a .csv file (with a byte-order mark so Excel reads accents correctly). */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob([String.fromCharCode(0xfeff), toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "sophie-and-nicholas-dietary-2026-10-19.csv" */
export const fileName = (slug: string, what: string) => `${slug}-${what}-${new Date().toISOString().slice(0, 10)}.csv`;

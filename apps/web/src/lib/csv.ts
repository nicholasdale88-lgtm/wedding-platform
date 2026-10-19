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
export const fileName = (slug: string, what: string, ext: 'csv' | 'xlsx' = 'csv') => `${slug}-${what}-${new Date().toISOString().slice(0, 10)}.${ext}`;

/**
 * Read a CSV file or cells pasted from Excel / Google Sheets (tab-separated) into rows.
 * Handles quoted cells with commas, quotes and line breaks. Empty rows are dropped.
 */
export function parseTable(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // byte-order mark from Excel
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur === '') quoted = true;
    else if (ch === sep) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  row.push(cur);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

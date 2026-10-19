import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Real Excel files (.xlsx), written and read in the browser with no extra library.
 * Writing: one or more sheets, bold frozen header row, column widths that fit, text kept as text
 * (so a mobile keeps its leading 0 and nothing a guest typed can become a formula).
 * Reading: the first sheet of any workbook Excel, Numbers or Google Sheets saves.
 */

export interface Sheet {
  name: string;
  rows: unknown[][];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Excel refuses control characters in cells; drop them.
const clean = (s: string) => Array.from(s).filter((ch) => ch.charCodeAt(0) >= 32 || ch === '\n' || ch === '\t').join('');
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const sheetName = (s: string) => (s.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31);

function sheetXml(rows: unknown[][]): string {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const widths = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(8, ...rows.map((r) => String(r[c] ?? '').length + 2))));
  const body = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          const style = ri === 0 ? ' s="1"' : '';
          if (v === null || v === undefined || v === '') return '';
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(clean(String(v)))}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    (width ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '') +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

export function writeXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheets.map((s, i) => sheetName(s.name) || `Sheet${i + 1}`);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows))));
  return zipSync(files);
}

export function downloadXlsx(filename: string, sheets: Sheet[]) {
  const blob = new Blob([writeXlsx(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** The first sheet of an .xlsx as rows of text. Throws a plain-English error for anything else. */
export function readXlsx(data: Uint8Array): string[][] {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(data);
  } catch {
    throw new Error("That file isn't an Excel workbook. Save it as .xlsx or .csv and try again.");
  }
  const xml = (path: string) => (zip[path] ? new DOMParser().parseFromString(strFromU8(zip[path]!), 'application/xml') : null);
  const wb = xml('xl/workbook.xml');
  const first = wb?.getElementsByTagName('sheet')[0];
  if (!wb || !first) throw new Error("That workbook has no sheets we can read.");
  const rid = first.getAttribute('r:id') ?? first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rels = xml('xl/_rels/workbook.xml.rels');
  const target = [...(rels?.getElementsByTagName('Relationship') ?? [])].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target') ?? 'worksheets/sheet1.xml';
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheet = xml(path);
  if (!sheet) throw new Error("That workbook's first sheet couldn't be read.");

  const shared = [...(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? [])].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''));
  const colIndex = (ref: string) => [...(/^[A-Z]+/.exec(ref)?.[0] ?? 'A')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows: string[][] = [];
  for (const row of sheet.getElementsByTagName('row')) {
    const r = Number(row.getAttribute('r') ?? rows.length + 1) - 1;
    const out: string[] = [];
    for (const c of row.getElementsByTagName('c')) {
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const text =
        t === 's' ? (shared[Number(v)] ?? '') : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map((x) => x.textContent ?? '').join('') : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
      out[colIndex(c.getAttribute('r') ?? colName(out.length))] = text.trim();
    }
    rows[r] = Array.from(out, (x) => x ?? '');
  }
  return Array.from(rows, (r) => r ?? []).filter((r) => r.some(Boolean));
}

/** Read a guest list file: .xlsx, or CSV / tab-separated text. */
export async function readTableFile(file: File, parseText: (s: string) => string[][]): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml')) return readXlsx(new Uint8Array(await file.arrayBuffer()));
  if (/\.xls$/i.test(file.name)) throw new Error('That is an old Excel file (.xls). In Excel choose File → Save As → Excel Workbook (.xlsx), then upload that.');
  return parseText(await file.text());
}

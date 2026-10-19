import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Real Excel files (.xlsx), written and read in the browser with no extra library.
 * Writing: dressed in the wedding's colours. A title band with the couple's monogram seal, a line per
 * event (what, when, where) so whoever receives it knows what it's for, then the table: coloured
 * header with filters on every column, banded rows, frozen header, column widths that fit, and
 * landscape printing with the header on every page. Text stays text (a mobile keeps its leading 0
 * and nothing a guest typed can become a formula).
 * Reading: the first sheet of any workbook Excel, Numbers or Google Sheets saves (our own exports
 * included: the title block above the filter row is skipped).
 */

export interface SheetHead {
  /** "Alex & Sam · Guest list" */
  title: string;
  /** One line each: the events it covers, when it was exported. */
  lines: string[];
}

export interface Sheet {
  name: string;
  rows: unknown[][];
  head?: SheetHead;
}

/** The wedding's colours (hex like "#46543a") and, when the browser can draw one, the monogram seal as a PNG. */
export interface XlsxLook {
  ink: string;
  soft: string;
  band: string;
  line: string;
  seal?: Uint8Array;
}

const PLAIN: XlsxLook = { ink: '#33402f', soft: '#efe7d3', band: '#f8f4ea', line: '#d3c6a4' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Excel refuses control characters in cells; drop them.
const clean = (s: string) => Array.from(s).filter((ch) => ch.charCodeAt(0) >= 32 || ch === '\n' || ch === '\t').join('');
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const sheetName = (s: string) => (s.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31);
const argb = (hex: string) => `FF${(/^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? '33402F').toUpperCase()}`;

// Cell styles (indexes into cellXfs below).
const S = { plain: 0, header: 1, title: 2, line: 3, body: 4, band: 5 } as const;

function stylesXml(look: XlsxLook): string {
  const fill = (hex: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${argb(hex)}"/><bgColor indexed="64"/></patternFill></fill>`;
  const edge = `<left style="thin"><color rgb="${argb(look.line)}"/></left><right style="thin"><color rgb="${argb(look.line)}"/></right><top style="thin"><color rgb="${argb(look.line)}"/></top><bottom style="thin"><color rgb="${argb(look.line)}"/></bottom><diagonal/>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><sz val="20"/><color rgb="FFFFFFFF"/><name val="Georgia"/></font>' +
    `<font><i/><sz val="11"/><color rgb="${argb(look.ink)}"/><name val="Georgia"/></font>` +
    '</fonts>' +
    `<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill(look.ink)}${fill(look.soft)}${fill(look.band)}</fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${edge}</border></borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs></styleSheet>'
  );
}

/** Rows of the sheet as written: title, event lines, a gap, then the table (its first row is the header). */
function layout(s: Sheet): { rows: { cells: unknown[]; style: number; height?: number }[]; headerRow: number } {
  const out: { cells: unknown[]; style: number; height?: number }[] = [];
  if (s.head) {
    out.push({ cells: [s.head.title], style: S.title, height: 48 });
    for (const l of s.head.lines) out.push({ cells: [l], style: S.line, height: 20 });
    out.push({ cells: [], style: S.plain, height: 8 });
  }
  const headerRow = out.length + 1;
  s.rows.forEach((r, i) => out.push({ cells: r, style: i === 0 ? S.header : i % 2 ? S.body : S.band, height: i === 0 ? 30 : undefined }));
  return { rows: out, headerRow };
}

function sheetXml(s: Sheet, hasSeal: boolean): string {
  const { rows, headerRow } = layout(s);
  const width = Math.max(1, ...s.rows.map((r) => r.length));
  const last = colName(width - 1);
  const widths = Array.from({ length: width }, (_, c) => Math.min(48, Math.max(10, ...s.rows.map((r) => String(r[c] ?? '').length + 3))));
  const banded = (style: number) => style === S.title || style === S.line || style === S.header || style === S.body || style === S.band;
  const body = rows
    .map((row, ri) => {
      const r = ri + 1;
      // Title and event lines colour the whole band; table rows have a border on every cell, even empty ones.
      const span = row.style === S.title || row.style === S.line ? width : row.style === S.plain ? 0 : width;
      const cells = Array.from({ length: Math.max(span, row.cells.length) }, (_, ci) => {
        const v = row.cells[ci];
        const ref = `${colName(ci)}${r}`;
        const st = banded(row.style) ? ` s="${row.style}"` : '';
        if (v === null || v === undefined || v === '') return st ? `<c r="${ref}"${st}/>` : '';
        if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${esc(clean(String(v)))}</t></is></c>`;
      }).join('');
      return `<row r="${r}"${row.height ? ` ht="${row.height}" customHeight="1"` : ''}>${cells}</row>`;
    })
    .join('');
  const merges = s.head ? Array.from({ length: s.head.lines.length + 1 }, (_, i) => `<mergeCell ref="A${i + 1}:${last}${i + 1}"/>`) : [];
  const lastRow = rows.length;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${body}</sheetData>` +
    (s.rows.length ? `<autoFilter ref="A${headerRow}:${last}${Math.max(lastRow, headerRow)}"/>` : '') +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : '') +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    (hasSeal ? '<drawing r:id="rId1"/>' : '') +
    '</worksheet>'
  );
}

/** The seal sits at the right-hand end of the title band. */
function drawingXml(col: number): string {
  const emu = 9525; // per pixel
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${4 * emu}</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${56 * emu}" cy="${56 * emu}"/>` +
    '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Seal"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
    '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${56 * emu}" cy="${56 * emu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
    '<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>'
  );
}

export function writeXlsx(sheets: Sheet[], look: XlsxLook = PLAIN): Uint8Array {
  const names = sheets.map((s, i) => sheetName(s.name) || `Sheet${i + 1}`);
  const seal = look.seal?.length ? look.seal : undefined;
  const sealed = sheets.map((s) => !!(seal && s.head));
  const printTitles = sheets
    .map((s, i) => (s.rows.length ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(names[i]!.replace(/'/g, "''"))}'!$${layout(s).headerRow}:$${layout(s).headerRow}</definedName>` : ''))
    .join('');
  const filters = sheets
    .map((s, i) => {
      if (!s.rows.length) return '';
      const { rows, headerRow } = layout(s);
      const last = colName(Math.max(1, ...s.rows.map((r) => r.length)) - 1);
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i]!.replace(/'/g, "''"))}'!$A$${headerRow}:$${last}$${Math.max(rows.length, headerRow)}</definedName>`;
    })
    .join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        (seal ? '<Default Extension="png" ContentType="image/png"/>' : '') +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        sheets.map((_, i) => (sealed[i] ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : '')).join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets>' +
        (filters || printTitles ? `<definedNames>${filters}${printTitles}</definedNames>` : '') +
        '</workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(stylesXml(look)),
  };
  if (seal) files['xl/media/seal.png'] = seal;
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s, sealed[i]!));
    if (!sealed[i]) return;
    const width = Math.max(1, ...s.rows.map((r) => r.length));
    files[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>`,
    );
    files[`xl/drawings/drawing${i + 1}.xml`] = strToU8(drawingXml(Math.max(0, width - 1)));
    files[`xl/drawings/_rels/drawing${i + 1}.xml.rels`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/seal.png"/></Relationships>',
    );
  });
  return zipSync(files);
}

export function downloadXlsx(filename: string, sheets: Sheet[], look?: XlsxLook) {
  const blob = new Blob([writeXlsx(sheets, look) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
  // Our own exports have a title block above the table; the filter row is where the table starts.
  const filter = sheet.getElementsByTagName('autoFilter')[0]?.getAttribute('ref') ?? '';
  const start = Math.max(0, Number(/\d+/.exec(filter)?.[0] ?? 1) - 1);
  return Array.from(rows, (r) => r ?? []).slice(start).filter((r) => r.some(Boolean));
}

/** Read a guest list file: .xlsx, or CSV / tab-separated text. */
export async function readTableFile(file: File, parseText: (s: string) => string[][]): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml')) return readXlsx(new Uint8Array(await file.arrayBuffer()));
  if (/\.xls$/i.test(file.name)) throw new Error('That is an old Excel file (.xls). In Excel choose File → Save As → Excel Workbook (.xlsx), then upload that.');
  return parseText(await file.text());
}

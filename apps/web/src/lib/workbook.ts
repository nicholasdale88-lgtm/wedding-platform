import type { Cell, Sheet } from '@wp/shared';
import { strFromU8, unzipSync } from 'fflate';

/**
 * Every sheet of an Excel workbook (.xlsx), in order, as rows of cells, for imports that read more than
 * the first sheet (a budget: tracker, payments, savings). Numbers stay numbers, so dates arrive as serial
 * numbers; formulas give the value Excel last saved. (lib/xlsx reads one table, as text, for guest lists.)
 */
export async function readWorkbook(file: Blob): Promise<Sheet[]> {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("That file isn't an Excel workbook (.xlsx).");
  }
  const xml = (path: string) => (zip[path] ? new DOMParser().parseFromString(strFromU8(zip[path]!), 'application/xml') : null);
  const wb = xml('xl/workbook.xml');
  if (!wb) throw new Error("That file isn't an Excel workbook (.xlsx).");
  const rels = xml('xl/_rels/workbook.xml.rels');
  const target = new Map([...(rels?.getElementsByTagName('Relationship') ?? [])].map((r) => [r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? '']));
  const shared = [...(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? [])].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''));
  const colIndex = (ref: string) => [...(/^[A-Z]+/.exec(ref)?.[0] ?? 'A')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const sheets: Sheet[] = [];
  [...wb.getElementsByTagName('sheet')].forEach((sh, i) => {
    const rid = sh.getAttribute('r:id') ?? sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '';
    const t = target.get(rid) ?? `worksheets/sheet${i + 1}.xml`;
    const doc = xml(t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`);
    if (!doc) return;
    const rows: Cell[][] = [];
    for (const row of doc.getElementsByTagName('row')) {
      const r = Number(row.getAttribute('r') ?? rows.length + 1) - 1;
      const out: Cell[] = [];
      for (const c of row.getElementsByTagName('c')) {
        const type = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent ?? null;
        const value: Cell =
          type === 's'
            ? v === null
              ? null
              : (shared[Number(v)] ?? '')
            : type === 'inlineStr'
              ? [...c.getElementsByTagName('t')].map((x) => x.textContent ?? '').join('')
              : type === 'str' || type === 'e'
                ? v
                : type === 'b'
                  ? v === '1'
                  : v === null || v === ''
                    ? null
                    : Number(v);
        out[colIndex(c.getAttribute('r') ?? 'A')] = value;
      }
      rows[r] = Array.from(out, (x) => x ?? null);
    }
    sheets.push({ name: sh.getAttribute('name') ?? `Sheet ${i + 1}`, rows: Array.from(rows, (x) => x ?? []) });
  });
  if (!sheets.length) throw new Error('That workbook has no sheets we can read.');
  return sheets;
}

import type { ReactNode } from 'react';
import { LogoMark } from '../sales/Art';

/**
 * The Yes List's dress for everything printed or saved as a PDF: our mark and name at the top, the
 * couple and the event beside it, a gold rule, and a quiet footer. Colours print as shown
 * (print-color-adjust) so the document never comes out plain.
 */
export const BRAND = { ink: '#33402f', soft: '#5b6a52', gold: '#b39563', goldLight: '#e6cf9e', paper: '#fbf8f2', tint: '#f3ecd9', line: '#e2d7bc', sage: '#5d6b47', amber: '#d9a441', red: '#b4473a' };
export const SERIF = "'Cormorant Garamond', Georgia, serif";
export const SANS = "'DM Sans Variable', 'DM Sans', Arial, sans-serif";
export const SCRIPT = "'Pinyon Script', 'Great Vibes', cursive";

/** The CSS every branded print needs (once per document). */
export const PRINT_BASE_CSS = `
.yl-doc { color: ${BRAND.ink}; font-family: ${SANS}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.yl-doc table { border-collapse: collapse; width: 100%; }
.yl-doc th { text-align: left; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: ${BRAND.soft}; font-weight: 600; padding: 2mm 2mm 1.5mm; border-bottom: 1.2pt solid ${BRAND.gold}; }
.yl-doc td { font-size: 10pt; padding: 1.6mm 2mm; border-bottom: .5pt solid ${BRAND.line}; vertical-align: top; }
.yl-doc tr.yl-alt td { background: #faf6ec; }
.yl-doc tr.yl-serious td { background: #f8e3dd; }
.yl-doc thead { display: table-header-group; }
.yl-doc tr { break-inside: avoid; }
.yl-sheet { background: #fff; }
@media screen {
  .yl-doc { background: #e9e4d7; padding: 16px 0; }
  .yl-sheet { width: 210mm; min-height: 297mm; margin: 0 auto 16px; padding: 12mm 12mm 14mm; box-shadow: 0 6px 24px rgba(27,34,24,.18); box-sizing: border-box; }
}
@media screen and (max-width: 820px) {
  .yl-sheet { width: auto; min-height: 0; margin: 0 8px 12px; padding: 16px; }
}
@media print {
  @page { size: A4; margin: 11mm 11mm 13mm; }
  /* Printing from the admin: only the document, not the screens around it. */
  html.seat-printing body > *:not(.seat-print) { display: none !important; }
  .yl-sheet { break-after: page; padding: 0; }
  .yl-sheet:last-child { break-after: auto; }
}`;

/** The top of each page: our mark, then the couple and what this is. */
export function PrintHeader({ couple, title, lines }: { couple: string; title: string; lines: string[] }) {
  return (
    <header style={{ marginBottom: '6mm' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4mm' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5mm' }}>
          <LogoMark size={30} />
          <span style={{ fontFamily: SERIF, fontSize: '15pt', color: BRAND.ink }}>
            The <em style={{ color: BRAND.gold }}>Yes</em> List
          </span>
        </div>
        <span style={{ fontSize: '8pt', letterSpacing: '.24em', textTransform: 'uppercase', color: BRAND.soft }}>{title}</span>
      </div>
      <div style={{ height: '1.2pt', background: `linear-gradient(90deg, ${BRAND.gold}, ${BRAND.goldLight}, ${BRAND.gold})`, margin: '3mm 0 4mm' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6mm', flexWrap: 'wrap' }}>
        {couple && <div style={{ fontFamily: SCRIPT, fontSize: '28pt', lineHeight: 1, color: BRAND.ink }}>{couple}</div>}
        <div style={{ textAlign: 'right', fontSize: '9.5pt', color: BRAND.soft, lineHeight: 1.5 }}>
          {lines.filter(Boolean).map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      </div>
    </header>
  );
}

export function PrintFooter({ note }: { note?: string }) {
  return (
    <footer style={{ marginTop: '6mm', paddingTop: '2mm', borderTop: `.6pt solid ${BRAND.line}`, display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt', color: BRAND.soft }}>
      <span>Made with The Yes List · weddings, beautifully organised</span>
      <span>{note ?? `Printed ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`}</span>
    </footer>
  );
}

/** A section heading inside a page. */
export function PrintH({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ margin: '0 0 3mm' }}>
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: '20pt', margin: 0, color: BRAND.ink }}>{children}</h2>
      {sub && <div style={{ fontSize: '9.5pt', color: BRAND.soft, marginTop: '1mm' }}>{sub}</div>}
    </div>
  );
}

/** A figure in a box: the summary at the top of a document. */
export function PrintFigure({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: '28mm', padding: '3mm 3.5mm', borderRadius: '2.5mm', background: tone === 'warn' ? '#f8e3dd' : BRAND.tint, border: `.6pt solid ${tone === 'warn' ? '#e5b7aa' : BRAND.line}` }}>
      <div style={{ fontSize: '7.5pt', letterSpacing: '.14em', textTransform: 'uppercase', color: BRAND.soft }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: '20pt', lineHeight: 1.1, color: tone === 'warn' ? BRAND.red : BRAND.ink }}>{value}</div>
    </div>
  );
}

/** SMS text rules shared by the editor (live counter) and the engine. */

// GSM 03.38 basic set plus the extension table (extension chars cost 2).
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';

const SMART_REPLACEMENTS: Record<string, string> = {
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', '…': '...', ' ': ' ',
};

/** Swap curly quotes, dashes and ellipses for GSM equivalents. */
export function toGsm(text: string): string {
  return text.replace(/[‘’“”–—… ]/g, (c) => SMART_REPLACEMENTS[c] ?? c);
}

/** Characters that would force UCS-2 (e.g. emoji). Empty means GSM-safe. */
export function nonGsmChars(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) if (!GSM_BASIC.includes(ch) && !GSM_EXT.includes(ch)) bad.add(ch);
  return [...bad];
}

export interface Segments {
  parts: number;
  length: number;
  unicode: boolean;
}

/** Message parts: GSM 160 / 153 per part; UCS-2 70 / 67. */
export function segments(text: string): Segments {
  const unicode = nonGsmChars(text).length > 0;
  let length = 0;
  for (const ch of text) length += !unicode && GSM_EXT.includes(ch) ? 2 : 1;
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  const parts = length === 0 ? 1 : length <= single ? 1 : Math.ceil(length / multi);
  return { parts, length, unicode };
}

/** Cost in cents for `parts` at a per-part rate stored as hundredths of a cent (176 = 1.76c). */
export const costCents = (parts: number, rateX100: number): number => (parts * rateX100) / 100;

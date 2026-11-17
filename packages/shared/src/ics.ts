/**
 * Calendar files (.ics, RFC 5545), written the same way everywhere: guests' calendars, the vendor's day, the
 * planner and party feeds.
 */

/** Text in a calendar file: backslashes, semicolons, commas and line breaks escaped (a lone CR too). */
export const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

/** UTF-8 bytes in one character (code point). */
const octets = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};

/**
 * One line folded as the format asks: at most 75 octets per line (the leading space of a continuation counts),
 * never splitting a character. Counting characters instead let lines with accents, other scripts or emoji run
 * past 75 octets, which some calendar apps reject or show garbled.
 */
export function icsFold(line: string): string {
  const rows: string[] = [];
  let cur = '';
  let n = 0;
  for (const ch of line) {
    const size = octets(ch);
    if (n + size > 75) {
      rows.push(cur);
      cur = ' ';
      n = 1;
    }
    cur += ch;
    n += size;
  }
  rows.push(cur);
  return rows.join('\r\n');
}

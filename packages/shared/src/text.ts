/** Remove control characters (and spaces too, if asked): for names in headers and URL scheme checks. */
export const dropControls = (s: string, spaces = false) =>
  Array.from(s)
    .filter((ch) => {
      const n = ch.codePointAt(0)!;
      return n >= 0x20 && n !== 0x7f && !(spaces && n === 0x20);
    })
    .join('');

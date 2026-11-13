/** Remove control characters (and spaces too, if asked): for names in headers and URL scheme checks. */
export const dropControls = (s: string, spaces = false) =>
  Array.from(s)
    .filter((ch) => {
      const n = ch.codePointAt(0)!;
      return n >= 0x20 && n !== 0x7f && !(spaces && n === 0x20);
    })
    .join('');

/**
 * A referral or campaign source as kept on a sign-up: letters, numbers, dots, dashes, underscores.
 * Kept here (no zod) so the front page can use it without loading the sign-up and company schemas.
 */
export const cleanRef = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60);

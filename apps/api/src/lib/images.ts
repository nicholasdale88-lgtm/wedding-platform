/**
 * What a guest upload really is, from its first bytes (never trust the declared type or name).
 * Only photo formats phones produce; anything else is refused.
 */
export function imageType(b: Uint8Array): { type: string; ext: string } | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  const ascii = (i: number, s: string) => [...s].every((ch, j) => b[i + j] === ch.charCodeAt(0));
  if (at(0, 0xff, 0xd8, 0xff)) return { type: 'image/jpeg', ext: 'jpg' };
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: 'image/png', ext: 'png' };
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { type: 'image/webp', ext: 'webp' };
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return { type: 'image/gif', ext: 'gif' };
  if (ascii(4, 'ftyp')) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return { type: 'image/heic', ext: 'heic' };
    if (/^avi[fs]$/.test(brand)) return { type: 'image/avif', ext: 'avif' };
  }
  return null;
}

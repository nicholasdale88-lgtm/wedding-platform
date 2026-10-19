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

/** A video phones make (MP4, MOV, WebM), from its first bytes. */
export function videoType(b: Uint8Array): { type: string; ext: string } | null {
  const ascii = (i: number, s: string) => [...s].every((ch, j) => b[i + j] === ch.charCodeAt(0));
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { type: 'video/webm', ext: 'webm' };
  if (ascii(4, 'ftyp')) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (brand === 'qt  ') return { type: 'video/quicktime', ext: 'mov' };
    if (/^(isom|iso[2-6]|mp41|mp42|avc1|M4V |M4VP|3gp[4-6]|3g2a|dash|mmp4|MSNV)$/.test(brand)) return { type: 'video/mp4', ext: 'mp4' };
  }
  return null;
}

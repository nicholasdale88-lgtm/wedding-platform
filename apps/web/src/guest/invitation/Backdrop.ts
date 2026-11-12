/**
 * The couple's photo behind the words of the invitation (Setup → Extras → Photo behind the words):
 * - welcome: it fills the opening (their names), and the paper card there turns softly see-through;
 * - all: it stays still behind the whole invitation while the sections scroll over it, frosted.
 * A veil in the paper's colour (0 to .8) keeps every word easy to read. Plain CSS over the design's own
 * page: nothing extra to load but the photo.
 */
export type BackdropWhere = 'none' | 'welcome' | 'all';

const cssUrl = (u: string) => `url("${u.replace(/["\\\n\r]/g, '')}")`;
const rgba = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0xfbf8f2;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`;
};

export function backdropCss(photo: string | undefined, where: BackdropWhere | undefined, veil: number | undefined, paper: string): string {
  const src = photo?.trim();
  if (!src || !where || where === 'none') return '';
  if (!/^(https:\/\/|\/|data:image\/(jpeg|png|webp);base64,)/.test(src)) return '';
  const v = Math.min(0.8, Math.max(0, veil ?? 0.25));
  const img = `linear-gradient(${rgba(paper, v)},${rgba(paper, v)}),${cssUrl(src)}`;
  const welcome = '#inv-scroll section[data-screen-label="01 Welcome"]';
  if (where === 'welcome') {
    return `${welcome}{background:${img} center/cover no-repeat !important}${welcome}>div:first-child{opacity:.74}`;
  }
  return (
    `#inv-scroll{background:${img} center/cover no-repeat !important}` +
    `#inv-scroll>section{background:${rgba(paper, 0.8)} !important;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}` +
    `${welcome}{background:transparent !important;-webkit-backdrop-filter:none;backdrop-filter:none}${welcome}>div:first-child{opacity:.74}`
  );
}

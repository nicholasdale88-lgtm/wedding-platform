/**
 * Each design's cover still: its closed envelope, photographed from the real sample invitation (Harriet & Theo,
 * their H&T seal) by apps/e2e/covers/capture.mjs, at /covers/<slug>.jpg (each under 30 KB).
 */
export const coverSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
/**
 * Designs whose new portrait cover (the artwork brief's, apps/web/public/themes/covers/<slug>.webp) has landed:
 * add a slug here when its file is committed. Every other design keeps its still in /covers.
 */
export const NEW_COVERS: ReadonlySet<string> = new Set<string>([]);
export const coverOf = (name: string) => {
  const slug = coverSlug(name);
  return NEW_COVERS.has(slug) ? `/themes/covers/${slug}.webp` : `/covers/${slug}.jpg`;
};

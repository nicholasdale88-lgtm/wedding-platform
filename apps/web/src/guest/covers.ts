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
export const coverOf = (name: string) => `/covers/${coverSlug(name)}.jpg`;

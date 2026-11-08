/**
 * The clock a guest page counts down with. Normally now. In the couple's preview (?preview=1) an
 * `asOf` date (Rehearsal: "jump to the night before") moves the page's clock there, so the countdown
 * reads as it will on that day. Only ever in a preview: a guest's own link always uses the real time.
 */
export function previewOffset(search: string = typeof window === 'undefined' ? '' : window.location.search, realNow: number = Date.now()): number {
  const q = new URLSearchParams(search);
  if (q.get('preview') !== '1') return 0;
  const at = Date.parse(q.get('asOf') ?? '');
  return Number.isFinite(at) ? at - realNow : 0;
}

/** Now, as the page should see it (moved by a preview's `asOf`). */
export function previewNow(search?: string): number {
  const real = Date.now();
  return real + previewOffset(search, real);
}

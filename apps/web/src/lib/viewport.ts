/**
 * iPhone Safari: after switching to another app and back (or after the keyboard was up), Safari can leave the
 * page drawn shifted, half off the screen, until the next touch. This puts it straight again:
 * - leaving the page takes the cursor out of any box (it saves, as boxes do when you leave them, and the
 *   keyboard isn't left half-open behind the app switcher);
 * - coming back (or returning from Safari's back/forward cache) re-anchors the page where it is;
 * - when the keyboard closes, the same.
 */
export function keepViewportSteady() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const settle = () =>
    requestAnimationFrame(() => {
      const vv = window.visualViewport;
      // The visible part drifted from the page (the half-off look): scroll to where it should be.
      if (vv && (Math.abs(vv.offsetTop) > 1 || Math.abs(vv.offsetLeft) > 1)) window.scrollTo(window.scrollX + vv.offsetLeft, window.scrollY + vv.offsetTop);
      else window.scrollTo(window.scrollX, window.scrollY);
    });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable="true"]')) el.blur();
    } else settle();
  });
  window.addEventListener('pageshow', settle);
  window.addEventListener('orientationchange', settle);
  window.visualViewport?.addEventListener('resize', () => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !el.matches('input, textarea, select, [contenteditable="true"]')) settle();
  });
}

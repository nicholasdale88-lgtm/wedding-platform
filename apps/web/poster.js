/* global URL */
// The sample invitation's first paint (/demo on a phone): a still of the closed envelope, sent in the page's own
// HTML so it shows before any script has run. It is the page's largest paint (LCP); the live invitation then
// draws over it and React replaces it. Used by functions/_middleware.ts (the live site) and by the Screens
// workflow's measurement (apps/e2e/screens/capture.mjs), so both apply exactly the same thing.
export const DEMO_POSTER_SRC = '/marketing/demo-poster-390.webp';

/** Only the plain sample (not the front page's embedded phone, a design's cover still or another design). */
export function wantsDemoPoster(url) {
  const u = new URL(url);
  return u.pathname === '/demo' && !['embed', 'cover', 'theme', 'mine'].some((k) => u.searchParams.has(k));
}

/** Into <head>: fetch the still at once (phones only), and keep it off wider screens. */
export const DEMO_POSTER_HEAD =
  `<link rel="preload" as="image" href="${DEMO_POSTER_SRC}" fetchpriority="high" media="(max-width: 599px)">` +
  '<style>@media (min-width: 600px){[data-demo-poster]{display:none}}</style>';

/** Into #root, first: the still itself, full screen, under where the live envelope will draw. */
// Below the sample bar's slot, as the live invitation is: a picture filling the whole screen would be taken for a
// background and not count as the page's paint.
export const DEMO_POSTER_ROOT = `<img data-demo-poster alt="" aria-hidden="true" src="${DEMO_POSTER_SRC}" width="390" height="788" fetchpriority="high" style="position:fixed;left:0;right:0;bottom:0;top:calc(56px + env(safe-area-inset-top));width:100%;height:calc(100% - 56px - env(safe-area-inset-top));object-fit:cover;object-position:top center;z-index:0">`;

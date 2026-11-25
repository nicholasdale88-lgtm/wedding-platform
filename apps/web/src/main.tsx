import '@fontsource-variable/dm-sans';
import { reportErrors } from './lib/stats';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/pinyon-script';
// The other names styles on the invitation (each font file loads only if a wedding uses it).
import '@fontsource/great-vibes';
import '@fontsource/parisienne';
import '@fontsource/playfair-display/400.css';
import dmSans from '@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url';
import cgItalic from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2?url';
import cgRegular from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2?url';
import cgSemi from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2?url';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setUpInstall } from './lib/install';
import { keepViewportSteady } from './lib/viewport';

// The guest page designs ask for 'DM Sans'; the package registers it as 'DM Sans Variable'. Same file, both names.
if (typeof FontFace !== 'undefined' && document.fonts) {
  new FontFace('DM Sans', `url(${dmSans}) format('woff2')`, { weight: '100 1000', display: 'swap' })
    .load()
    .then((f) => document.fonts.add(f))
    .catch(() => undefined);
}

// The serif every page opens with (headings, the invitation's names and its wax seal's initials): fetched now, as
// the app starts, rather than once the page has drawn and asked for it (the seal is /demo's largest paint).
for (const href of [cgItalic, cgRegular, cgSemi]) {
  const link = document.createElement('link');
  Object.assign(link, { rel: 'preload', as: 'font', type: 'font/woff2', href, crossOrigin: 'anonymous' });
  document.head.appendChild(link);
}

// The right home-screen app for this page (the admin, or the wedding for its guests).
setUpInstall();
// iPhone: no page left half off the screen after switching apps.
reportErrors();
keepViewportSteady();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import '@fontsource-variable/dm-sans';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/pinyon-script';
import dmSans from '@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// The guest page designs ask for 'DM Sans'; the package registers it as 'DM Sans Variable'. Same file, both names.
if (typeof FontFace !== 'undefined' && document.fonts) {
  new FontFace('DM Sans', `url(${dmSans}) format('woff2')`, { weight: '100 1000', display: 'swap' })
    .load()
    .then((f) => document.fonts.add(f))
    .catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

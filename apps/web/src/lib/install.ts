/**
 * The site as an app on the home screen. Each page gets the right manifest (the admin's, or the
 * wedding's own for guests, opening their own link) and the iPhone tags; the browser's install offer is
 * kept so a button can show it. iPhones have no offer: the button explains Share → Add to Home Screen.
 */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let offer: InstallEvent | null = null;
const listeners = new Set<() => void>();

export function setUpInstall() {
  const path = window.location.pathname;
  const guest = /^\/w\/([^/]+)/.exec(path);
  const token = new URLSearchParams(window.location.search).get('g');
  const manifest = path.startsWith('/admin') ? '/admin.webmanifest' : guest ? `/api/p/${guest[1]}/manifest${token ? `?g=${encodeURIComponent(token)}` : ''}` : '';
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  };
  if (manifest) add('link', { rel: 'manifest', href: manifest });
  add('link', { rel: 'apple-touch-icon', href: '/icons/icon-180.png' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offer = e as InstallEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    listeners.forEach((f) => f());
  });
}

/** Already opened from the home screen. */
export const installed = () => !!window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canOffer = () => !!offer;
/** Show the browser's install offer; true when they said yes. */
export async function install(): Promise<boolean> {
  if (!offer) return false;
  const o = offer;
  await o.prompt();
  const r = await o.userChoice;
  offer = null;
  listeners.forEach((f) => f());
  return r.outcome === 'accepted';
}
export function onInstallChange(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

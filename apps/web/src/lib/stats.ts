/**
 * For the company portal's Traffic & errors: which kind of page was opened (never the address itself, which
 * can hold a guest's own link), and errors in the browser. Sent with sendBeacon so it never slows a page.
 */
export function pageKind(path: string): string {
  if (path === '/' || path === '') return 'home';
  if (path.startsWith('/designs') || path.startsWith('/templates')) return 'designs';
  if (path.startsWith('/demo')) return 'demo';
  if (path.startsWith('/vendors')) return 'vendors';
  if (/^\/(privacy|terms|contact)/.test(path)) return 'legal';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/company')) return 'company';
  const w = /^\/w\/[^/]+\/?([^/]*)/.exec(path);
  if (w) return !w[1] ? 'invitation' : w[1] === 'tomorrow' ? 'guide' : w[1] === 'photos' ? 'photos' : 'guest-other';
  return 'other';
}

function beacon(url: string, body: unknown) {
  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (navigator.sendBeacon?.(url, blob)) return;
    void fetch(url, { method: 'POST', body: blob, keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' } }).catch(() => undefined);
  } catch {
    /* never in the way */
  }
}

let last = '';
/** A page was opened (each kind once per address change). */
export function countPage(path: string) {
  if (typeof navigator === 'undefined' || navigator.webdriver || /localhost|127\.0\.0\.1/.test(location.hostname)) return;
  const kind = pageKind(path);
  // Public and guest pages only: clicks around the admin would cost a database write each.
  if (kind === 'admin' || kind === 'company') return;
  if (`${kind}|${path}` === last) return;
  last = `${kind}|${path}`;
  beacon('/api/site/hit', { page: kind });
}

/** Errors in the browser, sent once each (at most 10 a visit). */
export function reportErrors() {
  if (typeof window === 'undefined') return;
  const seen = new Set<string>();
  const send = (message: string, detail: string) => {
    if (!message || seen.has(message) || seen.size >= 10) return;
    // Noise from browser extensions and network blips, not our code.
    if (/ResizeObserver loop|Script error\.?$|extension:\/\/|Load failed|Failed to fetch|NetworkError/i.test(`${message} ${detail}`)) return;
    seen.add(message);
    beacon('/api/site/error', { message: message.slice(0, 500), detail: detail.slice(0, 2000), path: pageKind(location.pathname) });
  };
  window.addEventListener('error', (e) => send(e.message || 'Error', `${e.filename ?? ''}:${e.lineno ?? ''}:${e.colno ?? ''}\n${(e.error as Error | undefined)?.stack ?? ''}`));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | string | undefined;
    send(typeof r === 'string' ? r : (r?.message ?? 'Unhandled promise rejection'), typeof r === 'object' ? (r?.stack ?? '') : '');
  });
}

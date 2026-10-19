import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The site's security headers must stay strict without breaking what guests use (music, video, maps, preview). */
const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const csp = Object.fromEntries(
  (/Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '').split(';').map((d) => {
    const [name, ...vals] = d.trim().split(/\s+/);
    return [name, vals];
  }),
) as Record<string, string[]>;

describe('site security headers', () => {
  it('invitation music (YouTube player) can load and play', () => {
    expect(csp['script-src']).toEqual(expect.arrayContaining(["'self'", 'https://www.youtube.com', 'https://s.ytimg.com']));
    expect(csp['frame-src']).toEqual(expect.arrayContaining(['https://www.youtube.com']));
    expect(csp['media-src']).toEqual(expect.arrayContaining(["'self'", 'https:']));
  });

  it('the admin can preview guest pages; no other site can frame them', () => {
    expect(csp['frame-src']).toContain("'self'");
    expect(csp['frame-ancestors']).toEqual(["'self'"]);
    expect(headers).toMatch(/X-Frame-Options: SAMEORIGIN/);
  });

  it('stays strict: no inline or eval scripts, no plugins, HTTPS only', () => {
    expect(csp['script-src']).not.toContain("'unsafe-inline'");
    expect(csp['script-src']).not.toContain("'unsafe-eval'");
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['upgrade-insecure-requests']).toBeDefined();
    expect(headers).toMatch(/Strict-Transport-Security: max-age=\d{8,}/);
    expect(headers).toMatch(/Referrer-Policy: same-origin/);
  });
});

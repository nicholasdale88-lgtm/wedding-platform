import type { CSSProperties } from 'react';

/**
 * The design's inline CSS, used verbatim: "a:b;c:d" -> React style object.
 * Splits on ";" only outside quotes and brackets (data URIs and gradients contain both), keeps
 * custom properties (--x) as they are, and caches by string so re-renders cost nothing.
 */
const cache = new Map<string, CSSProperties>();

export function sx(css: string): CSSProperties {
  let style = cache.get(css);
  if (style) return style;
  style = {};
  const out = style as Record<string, string>;
  let depth = 0;
  let quote = '';
  let start = 0;
  const take = (decl: string) => {
    const i = decl.indexOf(':');
    if (i < 0) return;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) return;
    const key = prop.startsWith('--')
      ? prop
      : prop.replace(/^-(webkit|moz|ms)-/, (_m, v: string) => `${v.charAt(0).toUpperCase()}${v.slice(1)}-`).replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[key.replace(/^Ms/, 'ms')] = value;
  };
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]!;
    if (quote) {
      if (ch === quote && css[i - 1] !== '\\') quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) {
      take(css.slice(start, i));
      start = i + 1;
    }
  }
  take(css.slice(start));
  if (cache.size > 5000) cache.clear();
  cache.set(css, style);
  return style;
}

/**
 * Cloudflare Pages Function, in front of every page: the link preview tags. Shared front-page links show
 * the front page's picture (at this site's own address, so it keeps working after a change of domain);
 * guest links (/w/…) say "You're invited" with an envelope instead of the front page's pitch. Anything
 * that isn't a page (the API, files) passes straight through.
 */
import { DEMO_POSTER_HEAD, DEMO_POSTER_ROOT, wantsDemoPoster } from '../poster.js';

interface Element {
  setAttribute(name: string, value: string): void;
  append(content: string, options: { html: boolean }): void;
  prepend(content: string, options: { html: boolean }): void;
}
declare class HTMLRewriter {
  on(selector: string, handlers: { element(e: Element): void }): HTMLRewriter;
  transform(response: Response): Response;
}

const INVITED = { title: 'You’re invited', description: 'Tap to open your invitation and reply.' };

export const onRequest = async (ctx: { request: Request; next: () => Promise<Response> }) => {
  const res = await ctx.next();
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res;
  const url = new URL(ctx.request.url);
  const guest = url.pathname.startsWith('/w/');
  const set = (value: string) => ({ element: (e: Element) => e.setAttribute('content', value) });
  let r = new HTMLRewriter()
    .on('meta[property="og:image"]', set(`${url.origin}/${guest ? 'og-invite.png' : 'og.png'}`))
    .on('meta[name="twitter:image"]', set(`${url.origin}/${guest ? 'og-invite.png' : 'og.png'}`))
    .on('meta[property="og:url"]', set(`${url.origin}${url.pathname}`));
  if (guest)
    r = r
      .on('meta[property="og:title"]', set(INVITED.title))
      .on('meta[name="twitter:title"]', set(INVITED.title))
      .on('meta[property="og:description"]', set(INVITED.description))
      .on('meta[name="twitter:description"]', set(INVITED.description))
      .on('meta[name="description"]', set(INVITED.description));
  // The sample invitation on a phone: its closed envelope as a still in the HTML, the first and largest paint.
  if (wantsDemoPoster(ctx.request.url))
    r = r.on('head', { element: (e) => e.append(DEMO_POSTER_HEAD, { html: true }) }).on('#root', { element: (e) => e.prepend(DEMO_POSTER_ROOT, { html: true }) });
  return r.transform(res);
};

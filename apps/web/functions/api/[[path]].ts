/**
 * Cloudflare Pages Function: every /api/* request goes to the API Worker through a
 * service binding, so the site and the API share one origin (no CORS, first-party cookies).
 */
interface Env {
  API: { fetch: (request: Request) => Promise<Response> };
}

export const onRequest = (ctx: { request: Request; env: Env }) => ctx.env.API.fetch(ctx.request);

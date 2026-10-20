import { isToken } from '@wp/shared';
import { Hono } from 'hono';
import type { Env } from '../env';

/**
 * The guest pages as an app on a phone's home screen: /api/p/:slug/manifest?g=<their token>. Named for
 * the couple, opening the guest's own invitation (their link).
 */
export function manifestRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/', async (c) => {
    const slug = c.req.param('slug') ?? '';
    const w = await c.env.DB.prepare(`SELECT name1, name2 FROM wedding WHERE slug = ? AND deleted_at IS NULL`).bind(slug).first<{ name1: string; name2: string }>();
    if (!w) return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    const g = c.req.query('g') ?? '';
    const couple = `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`;
    const base = `/w/${encodeURIComponent(slug)}`;
    const body = {
      name: couple,
      short_name: couple.length > 12 ? `${w.name1.charAt(0)} & ${w.name2.charAt(0)}` : couple,
      description: `${couple}'s wedding: the invitation, the day and the photos.`,
      start_url: isToken(g) ? `${base}?g=${g}` : base,
      scope: base,
      display: 'standalone',
      background_color: '#f6f0e2',
      theme_color: '#33402f',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } });
  });
  return app;
}

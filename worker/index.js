import { ASSETS } from '../generated/assets.js';
import { D1Store, handleAPI } from '../server/api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleAPI(request, env.DB ? new D1Store(env.DB) : null);
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const asset = ASSETS[path];
    if (!asset) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const body = asset.base64 ? Uint8Array.from(atob(asset.body), c => c.charCodeAt(0)) : asset.body;
    return new Response(request.method === 'HEAD' ? null : body, { headers: {
      'Content-Type': asset.type,
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    }});
  }
};

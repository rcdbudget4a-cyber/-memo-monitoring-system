/**
 * Cloudflare Worker / Pages Static Asset Handler
 * RCD Memorandum Monitoring System (PRO 4A)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // If Cloudflare ASSETS binding is present, serve static assets (index.html, JS, CSS, assets)
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) {
        return response;
      }
      // SPA Fallback to index.html
      return env.ASSETS.fetch(new URL('/index.html', request.url));
    }

    return new Response('RCD Memorandum Monitoring System', {
      headers: { 'content-type': 'text/html;charset=UTF-8' }
    });
  }
};

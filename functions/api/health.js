/**
 * Cloudflare Pages Function: /api/health
 * Returns status health check for RCD Memorandum Monitoring System
 */
export async function onRequest(context) {
  const data = {
    status: "ok",
    system: "RCD Memorandum Monitoring System (PRO 4A)",
    platform: "Cloudflare Pages & Workers Edge Network",
    timestamp: new Date().toISOString(),
    cf: context.request.cf || {}
  };

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "access-control-allow-origin": "*"
    }
  });
}

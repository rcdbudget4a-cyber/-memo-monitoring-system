/**
 * Cloudflare Worker / Pages Static Asset Handler
 * RCD Memorandum Monitoring System (PRO 4A)
 *
 * Attachment flow:
 * Browser -> /api/drive-upload -> Google Apps Script -> Google Drive
 * Firestore stores only memo metadata + returned Drive URL.
 */
const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxpRqR02DdjkHG07lSxfofyjXsvO-rnfYAv_InZl5GvmcqWzwmgW-F-lVVWP5ZNzh-J8g/exec";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Same-origin upload endpoint used by js/app.js.
    if (url.pathname === "/api/drive-upload") {
      if (request.method !== "POST") {
        return Response.json(
          { ok: false, error: "Method not allowed" },
          { status: 405, headers: { "Cache-Control": "no-store" } }
        );
      }

      try {
        const payload = await request.json();

        if (!payload || !payload.fileData || !payload.filename) {
          return Response.json(
            { ok: false, error: "Missing fileData or filename." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
          );
        }

        // Base64 has ~33% overhead. This allows roughly a 12 MB source file.
        if (String(payload.fileData).length > 17_000_000) {
          return Response.json(
            { ok: false, error: "Attachment is too large. Maximum supported scan size is about 12 MB." },
            { status: 413, headers: { "Cache-Control": "no-store" } }
          );
        }

        const upstream = await fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: String(payload.filename),
            mimeType: String(payload.mimeType || "application/pdf"),
            fileData: String(payload.fileData)
          }),
          redirect: "follow"
        });

        const responseText = await upstream.text();
        let driveResult = null;

        try {
          driveResult = JSON.parse(responseText);
        } catch (_) {
          return Response.json(
            { ok: false, error: "Google Drive upload returned an invalid response." },
            { status: 502, headers: { "Cache-Control": "no-store" } }
          );
        }

        if (!upstream.ok || driveResult?.result !== "success" || !driveResult?.fileUrl) {
          return Response.json(
            { ok: false, error: driveResult?.error || "Google Drive upload failed." },
            { status: 502, headers: { "Cache-Control": "no-store" } }
          );
        }

        return Response.json(
          {
            ok: true,
            fileUrl: driveResult.fileUrl,
            fileId: driveResult.fileId || ""
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      } catch (err) {
        return Response.json(
          { ok: false, error: err?.message || "Attachment upload failed." },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // Static application files.
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;

      // SPA fallback.
      return env.ASSETS.fetch(new URL("/index.html", request.url));
    }

    return new Response("RCD Memorandum Monitoring System", {
      headers: { "content-type": "text/html;charset=UTF-8" }
    });
  }
};

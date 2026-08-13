/**
 * Cloudflare Worker / Pages Static Asset Handler
 * RCD Memorandum Monitoring System (PRO 4A)
 *
 * Attachment flow:
 * Browser -> Cloudflare Worker -> Google Apps Script -> Google Drive
 * Firestore stores memo metadata + Drive URL only.
 */

const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxpRqR02DdjkHG07lSxfofyjXsvO-rnfYAv_InZl5GvmcqWzwmgW-F-lVVWP5ZNzh-J8g/exec";

const GOOGLE_DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh?usp=sharing";

function findDriveUrl(value, depth = 0) {
  if (depth > 5 || value == null) return "";

  if (typeof value === "string") {
    const s = value.trim();
    if (
      s.startsWith("https://drive.google.com/") ||
      s.startsWith("https://docs.google.com/")
    ) {
      return s;
    }

    // Some Apps Script deployments return JSON as a string.
    if (
      (s.startsWith("{") && s.endsWith("}")) ||
      (s.startsWith("[") && s.endsWith("]"))
    ) {
      try {
        return findDriveUrl(JSON.parse(s), depth + 1);
      } catch (_) {}
    }

    // Last resort: locate a Drive URL embedded inside ordinary response text.
    const match = s.match(
      /https:\/\/(?:drive|docs)\.google\.com\/[^\s"'<>]+/i
    );
    return match ? match[0] : "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDriveUrl(item, depth + 1);
      if (found) return found;
    }
    return "";
  }

  if (typeof value === "object") {
    // Check likely URL properties first.
    const preferredKeys = [
      "fileUrl",
      "fileURL",
      "url",
      "driveUrl",
      "driveURL",
      "webViewLink",
      "webContentLink",
      "link"
    ];

    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const found = findDriveUrl(value[key], depth + 1);
        if (found) return found;
      }
    }

    // Then search the rest of the response recursively.
    for (const key of Object.keys(value)) {
      const found = findDriveUrl(value[key], depth + 1);
      if (found) return found;
    }
  }

  return "";
}

function responseIndicatesFailure(data, rawText) {
  if (data && typeof data === "object") {
    if (data.ok === false || data.success === false) return true;

    const status = String(
      data.status ?? data.result ?? data.state ?? ""
    ).toLowerCase();

    if (
      ["error", "failed", "failure", "denied", "unauthorized"].includes(status)
    ) {
      return true;
    }

    if (data.error && !findDriveUrl(data)) return true;
  }

  const text = String(rawText || "").toLowerCase();
  return (
    text.includes("exception:") ||
    text.includes("permission denied") ||
    text.includes("authorization is required")
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/drive-upload") {
      // Diagnostic GET: opening this URL in a browser should return JSON.
      // If it returns the RCD web page instead, Cloudflare is still serving
      // static assets without executing this Worker.
      if (request.method === "GET") {
        return Response.json(
          {
            ok: true,
            workerRouteActive: true,
            route: "/api/drive-upload",
            uploadMethod: "POST",
            driveFolderId: "1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh"
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

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

        // Base64 adds roughly 33% overhead: about 12 MB source-file limit.
        if (String(payload.fileData).length > 17_000_000) {
          return Response.json(
            {
              ok: false,
              error:
                "Attachment is too large. Maximum supported scan size is about 12 MB."
            },
            { status: 413, headers: { "Cache-Control": "no-store" } }
          );
        }

        const upstream = await fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Preserve the payload format already used by the original RCD app.
            filename: String(payload.filename),
            mimeType: String(payload.mimeType || "application/pdf"),
            fileData: String(payload.fileData)
          }),
          redirect: "follow"
        });

        const rawText = await upstream.text();

        let data = null;
        try {
          data = JSON.parse(rawText);
        } catch (_) {
          data = rawText;
        }

        if (!upstream.ok) {
          return Response.json(
            {
              ok: false,
              error: `Google Apps Script returned HTTP ${upstream.status}.`,
              upstreamPreview: rawText.slice(0, 500)
            },
            { status: 502, headers: { "Cache-Control": "no-store" } }
          );
        }

        if (responseIndicatesFailure(data, rawText)) {
          const errorMessage =
            (data && typeof data === "object" && data.error) ||
            "Google Apps Script reported an upload error.";

          return Response.json(
            {
              ok: false,
              error: String(errorMessage),
              upstreamPreview: rawText.slice(0, 500)
            },
            { status: 502, headers: { "Cache-Control": "no-store" } }
          );
        }

        // Apps Script success payloads vary. Find a Drive URL anywhere in
        // the response instead of requiring one exact JSON schema.
        const returnedDriveUrl = findDriveUrl(data) || findDriveUrl(rawText);

        // HTTP 200 with no explicit URL is treated as accepted because the
        // original RCD uploader used no-cors and did not require a response.
        // The confirmed RCD Drive folder is stored as a safe fallback link.
        return Response.json(
          {
            ok: true,
            uploaded: true,
            fileUrl: returnedDriveUrl || GOOGLE_DRIVE_FOLDER_URL,
            directFileUrl: returnedDriveUrl || "",
            usedFolderFallback: !returnedDriveUrl,
            upstreamStatus: upstream.status
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      } catch (err) {
        return Response.json(
          {
            ok: false,
            error: err?.message || "Attachment upload proxy failed."
          },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;

      return env.ASSETS.fetch(new URL("/index.html", request.url));
    }

    return new Response("RCD Memorandum Monitoring System", {
      headers: { "content-type": "text/html;charset=UTF-8" }
    });
  }
};

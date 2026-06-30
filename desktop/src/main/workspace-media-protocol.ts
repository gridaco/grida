/**
 * GRIDA-SEC-004 — `grida-workspace://` privileged media protocol (#924).
 *
 * The desktop workspace media viewer renders `<img>` / `<video src>` pointing
 * at `grida-workspace://workspace/<workspaceId>/<relPath>` instead of inlining
 * the file as base64 (which capped the viewer at 1 MiB). This main-process
 * handler resolves that scheme by PROXYING to the sidecar's streamed
 * `GET /workspaces/file` route — forwarding the renderer's `Range` header and
 * injecting the sidecar Basic-Auth the renderer never sees.
 *
 * The handler holds NO filesystem authority of its own: path containment is the
 * sidecar's `workspaceFs` check, identical to every other workspace read. The
 * scheme is a transport for an already-exposed capability, gated by CSP to
 * `img-src`/`media-src` (see editor/lib/desktop/csp.ts) — NOT a new file-read
 * origin in the main process.
 *
 * URL shape: a constant host (`workspace`) carries no data; both the
 * `workspaceId` and the `relPath` live in the path so Chromium's standard-URL
 * host canonicalization (which lowercases the host) can't corrupt the id. The
 * preload builds this string; keep both sides in lockstep (desktop/src/preload).
 */

import { protocol } from "electron";
import { agentSidecarClient } from "./agent-sidecar-client";

const SCHEME = "grida-workspace";
// The authority is a fixed, data-less literal — both ids live in the path (see
// the preload, which builds `grida-workspace://workspace/<id>/<relPath>`). The
// parser rejects any other host so a malformed URL can't masquerade as a read.
const MEDIA_HOST = "workspace";

/**
 * Privilege registration MUST run before `app.whenReady()`. `stream` lets the
 * handler return a streaming body (needed for video seeking via Range);
 * `supportFetchAPI` + `standard` make it a normal fetchable origin; `secure`
 * keeps it a trusted context. Deliberately NOT `bypassCSP` — CSP gates the
 * scheme explicitly to img/media-src.
 */
export function registerWorkspaceMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Install the protocol handler. MUST run after `app.whenReady()`. A request
 * that arrives before the sidecar is up resolves to 503 (the viewer retries
 * naturally on the next load).
 */
export function handleWorkspaceMediaProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const target = parseWorkspaceMediaUrl(request.url);
    if (!target) return new Response("bad request", { status: 400 });

    const range = request.headers.get("range");
    const query =
      `?workspace_id=${encodeURIComponent(target.workspaceId)}` +
      `&rel_path=${encodeURIComponent(target.relPath)}`;

    try {
      // Forward the Range header so the sidecar answers 206 + Content-Range and
      // the renderer's media element can seek. The returned Response (status,
      // headers, streaming body) is passed straight through.
      return await agentSidecarClient.fetch(`/workspaces/file${query}`, {
        method: "GET",
        headers: range ? { range } : undefined,
      });
    } catch (err) {
      if (err instanceof agentSidecarClient.AgentSidecarNotReadyError) {
        return new Response("agent sidecar not ready", { status: 503 });
      }
      console.error("[grida] grida-workspace:// proxy failed:", err);
      return new Response("internal error", { status: 500 });
    }
  });
}

/**
 * Parse `grida-workspace://workspace/<workspaceId>/<relPath>` → its parts. The
 * first path segment is the (percent-decoded) workspaceId; the remaining
 * segments, decoded and re-joined with `/`, are the relPath. Returns null on a
 * malformed URL, the wrong scheme, or a missing workspaceId/relPath. The
 * sidecar re-validates containment — this is shape parsing + decode only, not a
 * trust boundary.
 */
export function parseWorkspaceMediaUrl(
  rawUrl: string
): { workspaceId: string; relPath: string } | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:`) return null;
  // Authority is fixed + data-less: a non-`workspace` host, or any userinfo/port,
  // means a malformed URL that must not resolve to a workspace read.
  if (
    url.hostname !== MEDIA_HOST ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    return null;
  }
  const segments = url.pathname.replace(/^\/+/, "").split("/");
  const rawWorkspaceId = segments.shift();
  if (!rawWorkspaceId) return null;
  const workspaceId = safeDecode(rawWorkspaceId);
  const relPath = segments.map(safeDecode).join("/");
  // Reject empties and any null byte — a malformed %-escape decodes to the "\0"
  // sentinel below, so this one check covers both bad input and bad encoding.
  if (
    !workspaceId ||
    workspaceId.includes("\0") ||
    relPath === "" ||
    relPath.includes("\0")
  ) {
    return null;
  }
  return { workspaceId, relPath };
}

/**
 * decodeURIComponent that yields the "\0" sentinel on a malformed escape
 * instead of throwing — the caller's null-byte check then rejects it.
 */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return "\0";
  }
}

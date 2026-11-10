/**
 * GRIDA-SEC-004 — `grida-workspace://` privileged media protocol (#924).
 *
 * The desktop workspace media viewer renders `<img>` / `<video src>` pointing
 * at `grida-workspace://workspace/<workspaceId>/<relPath>` instead of inlining
 * the file as base64 (which capped the viewer at 1 MiB). This main-process
 * handler streams through an exact registered native scope on the qualified
 * packaged profile. The compatibility profile proxies to the sidecar's
 * `GET /workspaces/file` route with its private authorization. CSP admits the
 * scheme for images and media.
 *
 * URL shape: a constant host (`workspace`) carries no data; both the
 * `workspaceId` and the `relPath` live in the path so Chromium's standard-URL
 * host canonicalization (which lowercases the host) can't corrupt the id. The
 * preload builds this string; keep both sides in lockstep (desktop/src/preload).
 */

import { protocol } from "electron";
import { workspaceFileResponse } from "@grida/daemon/server";
import { agentSidecarClient } from "./agent-sidecar-client";
import { nativeWorkspaceMedia } from "./workspace-media-access";
import { WorkspaceMediaError } from "./workspace-media-registry";

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
  const native = nativeWorkspaceMedia();
  protocol.handle(SCHEME, async (request) => {
    const target = parseWorkspaceMediaUrl(request.url);
    if (!target) return new Response("bad request", { status: 400 });

    const range = request.headers.get("range");
    const query =
      `?workspace_id=${encodeURIComponent(target.workspaceId)}` +
      `&rel_path=${encodeURIComponent(target.relPath)}`;

    try {
      if (native) {
        const grant = await native.registry.grant(
          target.workspaceId,
          agentSidecarClient.listWorkspaces
        );
        const file = await native.workers.open(
          grant,
          target.relPath,
          request.signal
        );
        try {
          return await workspaceFileResponse(
            target.relPath,
            range ?? undefined,
            file
          );
        } catch (error) {
          await file.close().catch(() => {});
          throw error;
        }
      }
      // Forward the Range header so the sidecar answers 206 + Content-Range and
      // the renderer's media element can seek. The returned Response (status,
      // headers, streaming body) is passed straight through.
      return await agentSidecarClient.fetch(`/workspaces/file${query}`, {
        method: "GET",
        headers: range ? { range } : undefined,
      });
    } catch (err) {
      if (err instanceof WorkspaceMediaError) {
        return new Response(err.message, { status: err.status });
      }
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
 * selected file owner re-validates containment after URL decoding.
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

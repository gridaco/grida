/**
 * GRIDA-SEC-004 — `/workspaces/*` routes.
 *
 * Two surfaces in one file:
 *
 *   1. Registry: `list`, `open`, `pin`, `forget`. The welcome page
 *      uses these to surface "Open Folder" + "Recent Workspaces."
 *   2. Filesystem (workspace-scoped, opaque-id addressing):
 *      `readdir`, `readfile`, `writefile`. Client talks in
 *      `{workspaceId, relPath}` — agent host resolves against the
 *      workspace's `root` and enforces containment in `workspace/fs.ts`.
 *
 * Why route the workspace fs through `/workspaces/*` rather than
 * `/files/*`: `/files/*` is opaque-docId-addressed because the client
 * isn't supposed to know the path. For a workspace tree the client
 * already knows the workspace root (it shows it in the title bar) —
 * an opaque docId per file would force a register-on-every-click dance
 * for no privacy gain. `{workspaceId, relPath}` is the natural shape.
 *
 * Auth/Origin/Referer guards from the global middleware apply.
 */
import { Readable } from "node:stream";
import type { Context, Hono } from "hono";
import type { Workspace, WorkspaceRegistry } from "../../workspaces";
import { workspaceFs } from "../../workspaces/fs";
import { body, v } from "../validate";

/**
 * Resolve a workspace by id, or return a 404 JSON response. Caller
 * does `if (ws instanceof Response) return ws;` to short-circuit.
 */
async function requireWorkspace(
  c: Context,
  registry: WorkspaceRegistry,
  id: string
): Promise<Workspace | Response> {
  const ws = await registry.findById(id);
  if (ws) return ws;
  return c.json(
    { error: "workspace not found", code: "workspace-not-found" },
    404
  );
}

export function registerWorkspacesRoutes(
  app: Hono,
  registry: WorkspaceRegistry
) {
  app.post("/workspaces/list", async (c) => c.json(await registry.list()));

  app.post("/workspaces/open", async (c) => {
    const r = await body(c, { path: v.string });
    if (!r.ok) return r.res;
    try {
      const workspace = await registry.open(r.data.path);
      return c.json(workspace);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "couldn't open workspace";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/workspaces/pin", async (c) => {
    const r = await body(c, { id: v.string, pinned: v.boolean });
    if (!r.ok) return r.res;
    await registry.pin(r.data.id, r.data.pinned);
    return c.json({});
  });

  app.post("/workspaces/forget", async (c) => {
    const r = await body(c, { id: v.string });
    if (!r.ok) return r.res;
    await registry.forget(r.data.id);
    return c.json({});
  });

  // ── filesystem surface ─────────────────────────────────────────

  // POST /workspaces/readdir { workspaceId, relPath? } → entries[]
  // Lists immediate children of relPath. relPath defaults to ""
  // (workspace root). Returns 404 when workspaceId is unknown
  // (forgotten or never opened); 400 on path escape; 500 on
  // unexpected fs errors. ENOENT/ENOTDIR/EACCES surface as 4xx via
  // their Node `code`.
  app.post("/workspaces/readdir", async (c) => {
    const r = await body(c, {
      workspace_id: v.string,
      rel_path: v.optional(v.stringAllowEmpty),
    });
    if (!r.ok) return r.res;
    const workspace = await requireWorkspace(c, registry, r.data.workspace_id);
    if (workspace instanceof Response) return workspace;
    try {
      const entries = await workspaceFs.readDir(
        workspace,
        r.data.rel_path ?? ""
      );
      return c.json(entries);
    } catch (err) {
      return mapFsError(err, c);
    }
  });

  // POST /workspaces/readfile { workspaceId, relPath } → {content, mtime}
  app.post("/workspaces/readfile", async (c) => {
    const r = await body(c, {
      workspace_id: v.string,
      rel_path: v.string,
    });
    if (!r.ok) return r.res;
    const workspace = await requireWorkspace(c, registry, r.data.workspace_id);
    if (workspace instanceof Response) return workspace;
    try {
      const result = await workspaceFs.readFile(workspace, r.data.rel_path);
      return c.json(result);
    } catch (err) {
      return mapFsError(err, c);
    }
  });

  // POST /workspaces/readfilebytes { workspaceId, relPath }
  //   → {base64, size, mtime}
  // Sister to /readfile for the read-only image viewer; same size cap,
  // no UTF-8 check.
  app.post("/workspaces/readfilebytes", async (c) => {
    const r = await body(c, {
      workspace_id: v.string,
      rel_path: v.string,
    });
    if (!r.ok) return r.res;
    const workspace = await requireWorkspace(c, registry, r.data.workspace_id);
    if (workspace instanceof Response) return workspace;
    try {
      const result = await workspaceFs.readFileBytes(
        workspace,
        r.data.rel_path
      );
      return c.json(result);
    } catch (err) {
      return mapFsError(err, c);
    }
  });

  // GET /workspaces/file?workspace_id=&rel_path=  → streamed file bytes
  //
  // GRIDA-SEC-004 — the streamed sibling of /readfilebytes for the desktop
  // media viewer (#924). Unlike the base64 POST routes this NEVER buffers the
  // whole file: it stats for size, honors a Range request, and pipes a
  // `fs.createReadStream` straight to the response (constant memory, no size
  // cap). The desktop `grida-workspace://` privileged protocol proxies to this
  // route, forwarding the inbound Range header + the same Basic-Auth the other
  // workspace reads use — containment is the same `workspaceFs` check, so the
  // Electron main process gains no independent fs authority. GET (not POST) so
  // Range/caching semantics are conventional; still behind the global
  // Auth/Origin/Referer middleware.
  app.get("/workspaces/file", async (c) => {
    const workspaceId = c.req.query("workspace_id");
    const relPath = c.req.query("rel_path");
    if (!workspaceId || relPath === undefined) {
      return c.json({ error: "workspace_id and rel_path are required" }, 400);
    }
    const workspace = await requireWorkspace(c, registry, workspaceId);
    if (workspace instanceof Response) return workspace;

    let file: Awaited<ReturnType<typeof workspaceFs.openFile>>;
    try {
      file = await workspaceFs.openFile(workspace, relPath);
    } catch (err) {
      return mapFsError(err, c);
    }

    // `file` holds an open descriptor: the streaming path hands it to a stream
    // that auto-closes on end/abort; every other exit MUST close it explicitly.
    try {
      const { size } = file;
      const range = parseRange(c.req.header("range"), size);
      if (range === "unsatisfiable") {
        await file.close();
        return c.body(null, 416, {
          "content-range": `bytes */${size}`,
          "accept-ranges": "bytes",
        });
      }

      // Normalize: a full read is just the whole-file span.
      const { start, end } = range ?? {
        start: 0,
        end: size === 0 ? 0 : size - 1,
      };
      const headers: Record<string, string> = {
        "content-type": contentTypeFor(relPath),
        "accept-ranges": "bytes",
        // Workspace files can change on disk under the viewer; don't let a
        // privileged-scheme response get cached stale.
        "cache-control": "no-store",
        "content-length": String(size === 0 ? 0 : end - start + 1),
      };
      if (range) headers["content-range"] = `bytes ${start}-${end}/${size}`;

      // Empty file: an empty stream would try to read 1 byte of a 0-byte file,
      // so send a null body — and close the handle the stream would have owned.
      if (size === 0) {
        await file.close();
        return new Response(null, { status: range ? 206 : 200, headers });
      }
      const webBody = Readable.toWeb(
        file.stream({ start, end })
      ) as unknown as ReadableStream;
      return new Response(webBody, { status: range ? 206 : 200, headers });
    } catch (err) {
      await file.close();
      return mapFsError(err, c);
    }
  });

  // POST /workspaces/writefile
  //   { workspaceId, relPath, content, expected_mtime? } → {mtime}
  // expected_mtime is the optimistic-concurrency token (issue #805):
  // when present and the file on disk has advanced past it, the write is
  // rejected with 409 `modified-since` carrying the current mtime.
  app.post("/workspaces/writefile", async (c) => {
    const r = await body(c, {
      workspace_id: v.string,
      rel_path: v.string,
      content: v.stringAllowEmpty,
      expected_mtime: v.optional(v.number),
    });
    if (!r.ok) return r.res;
    const workspace = await requireWorkspace(c, registry, r.data.workspace_id);
    if (workspace instanceof Response) return workspace;
    try {
      const result = await workspaceFs.writeFile(
        workspace,
        r.data.rel_path,
        r.data.content,
        { expected_mtime: r.data.expected_mtime }
      );
      return c.json(result);
    } catch (err) {
      return mapFsError(err, c);
    }
  });
}

/**
 * Translate a thrown fs error into a structured 4xx/5xx JSON response.
 * `workspaceFs.Exception` carries our policy errors (escape, oversize,
 * binary, etc.); raw Node errors with `code` map to ENOENT/EACCES/etc.
 */
function mapFsError(err: unknown, c: Context) {
  if (err instanceof workspaceFs.Exception) {
    const status =
      err.detail.code === "path-escapes-workspace"
        ? 403
        : err.detail.code === "modified-since"
          ? 409
          : 400;
    return c.json(
      {
        error: err.detail.code,
        code: err.detail.code,
        rel_path: err.detail.rel_path,
        size: err.detail.size,
        mtime: err.detail.mtime,
      },
      status
    );
  }
  const nodeErr = err as NodeJS.ErrnoException;
  if (nodeErr && typeof nodeErr.code === "string") {
    if (nodeErr.code === "ENOENT")
      return c.json({ error: "not found", code: "enoent" }, 404);
    if (nodeErr.code === "EACCES" || nodeErr.code === "EPERM")
      return c.json({ error: "permission denied", code: nodeErr.code }, 403);
    // O_NOFOLLOW open of a (race-)swapped symlink target — treat as an escape.
    if (nodeErr.code === "ELOOP")
      return c.json({ error: "symlink not allowed", code: "eloop" }, 403);
    if (nodeErr.code === "ENOTDIR")
      return c.json({ error: "not a directory", code: "enotdir" }, 400);
    if (nodeErr.code === "EISDIR")
      return c.json({ error: "is a directory", code: "eisdir" }, 400);
  }
  console.error("[agent-host] workspaces fs error:", err);
  return c.json({ error: "internal error" }, 500);
}

/**
 * Parse a single-range HTTP `Range` header against a known file size.
 * Returns inclusive `{start, end}` for a satisfiable range,
 * `"unsatisfiable"` for a syntactically-valid-but-out-of-bounds range (→ 416),
 * or `null` when there's no header or it's malformed (→ serve the full 200
 * body, per RFC 7233 §3.1 "a server that supports range requests MAY ignore an
 * unsatisfiable-to-parse Range"). Only the first byte-range is honored —
 * browsers seeking media send a single `bytes=` range.
 */
function parseRange(
  header: string | undefined,
  size: number
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;
  let start: number;
  let end: number;
  if (rawStart === "") {
    // suffix form `bytes=-N`: the last N bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (size === 0 || start >= size || start > end) return "unsatisfiable";
  if (end >= size) end = size - 1; // clamp an over-long end to the last byte
  return { start, end };
}

/**
 * Extension → media MIME for the streamed file route (#924). MIME ownership
 * lives server-side here — the route sets `Content-Type` on the response —
 * rather than on a client-built `data:` URL (the base64 fallback still infers
 * its own). Unknown extensions fall back to `application/octet-stream`; the
 * browser still sniffs common formats, but we don't promise a type we can't
 * name.
 */
const FILE_MIME: Record<string, string> = {
  // images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
  svg: "image/svg+xml",
  // video
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  // audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  flac: "audio/flac",
};

function contentTypeFor(relPath: string): string {
  const name = relPath.split("/").pop() ?? relPath;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return (
    FILE_MIME[name.slice(dot + 1).toLowerCase()] ?? "application/octet-stream"
  );
}

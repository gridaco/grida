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

  // POST /workspaces/writefile { workspaceId, relPath, content } → {mtime}
  app.post("/workspaces/writefile", async (c) => {
    const r = await body(c, {
      workspace_id: v.string,
      rel_path: v.string,
      content: v.stringAllowEmpty,
    });
    if (!r.ok) return r.res;
    const workspace = await requireWorkspace(c, registry, r.data.workspace_id);
    if (workspace instanceof Response) return workspace;
    try {
      const result = await workspaceFs.writeFile(
        workspace,
        r.data.rel_path,
        r.data.content
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
    const status = err.detail.code === "path-escapes-workspace" ? 403 : 400;
    return c.json(
      {
        error: err.detail.code,
        code: err.detail.code,
        rel_path: err.detail.rel_path,
        size: err.detail.size,
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
    if (nodeErr.code === "ENOTDIR")
      return c.json({ error: "not a directory", code: "enotdir" }, 400);
    if (nodeErr.code === "EISDIR")
      return c.json({ error: "is a directory", code: "eisdir" }, 400);
  }
  console.error("[agent-host] workspaces fs error:", err);
  return c.json({ error: "internal error" }, 500);
}

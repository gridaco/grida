// GRIDA-SEC-004 / GRIDA-SEC-016 — only a trusted workbench can request FX file data.
import { createHash } from "node:crypto";
import path from "node:path";
import type { WebContents } from "electron";
import { DesktopBrowser, type DesktopFxViewer } from "@grida/desktop-bridge";
import { MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES } from "@grida/daemon/server";
import type {
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
} from "@grida/daemon";
import type { DesktopBrowserTools } from "./desktop-browser-tools";
import type { FxResolvedFile } from "./fx-viewer";

type WorkspaceRead = {
  list(
    workspaceId: string,
    parent: string,
    signal: AbortSignal
  ): Promise<WorkspaceFsEntry[]>;
  bytes(
    workspaceId: string,
    relativePath: string,
    signal: AbortSignal
  ): Promise<WorkspaceReadFileBytesResult>;
};

export class FxWorkspaceFiles {
  private readonly pending = new WeakSet<WebContents>();

  constructor(
    private readonly tools: Pick<DesktopBrowserTools, "activateFxViewerFile">,
    private readonly workspace: WorkspaceRead
  ) {}

  /** Callable only after native IPC admits the exact top-level workbench. */
  async prepare(
    sender: WebContents,
    value: unknown
  ): Promise<DesktopFxViewer.FileResult> {
    const request = parse(value);
    if (!request || this.pending.has(sender)) return { kind: "unavailable" };
    this.pending.add(sender);
    try {
      let file: DesktopFxViewer.File | null = null;
      const outcome = await this.tools.activateFxViewerFile(
        sender,
        request.pageId,
        request.reference,
        {
          // Invoking this purpose-specific first-party route is the explicit
          // authorization. There is no relay from a website message to it.
          authorize: async () => true,
          open: async (resolved, current, signal) => {
            if (!current()) return false;
            file = await this.read(resolved, signal);
            return file !== null && current();
          },
        },
        AbortSignal.timeout(10000)
      );
      if (outcome !== "opened") return { kind: outcome };
      return file ? { kind: "ready", file } : { kind: "unavailable" };
    } finally {
      this.pending.delete(sender);
    }
  }

  private async read(
    file: FxResolvedFile,
    signal: AbortSignal
  ): Promise<DesktopFxViewer.File | null> {
    const { workspaceId, relativePath, sourceMatch, artifact } = file;
    if (!artifact) {
      const parent = path.posix.dirname(relativePath);
      const entries = await this.workspace.list(
        workspaceId,
        parent === "." ? "" : parent,
        signal
      );
      return entries.some(
        (entry) => entry.kind === "file" && entry.rel_path === relativePath
      )
        ? { kind: "source", relativePath, sourceMatch }
        : null;
    }
    if (
      artifact.size <= 0 ||
      artifact.size > MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES
    )
      return null;
    const result = await this.workspace.bytes(
      workspaceId,
      relativePath,
      signal
    );
    if (
      result.size !== artifact.size ||
      typeof result.base64 !== "string" ||
      result.base64.length !== 4 * Math.ceil(artifact.size / 3)
    )
      return null;
    const bytes = Buffer.from(result.base64, "base64");
    if (
      bytes.length !== artifact.size ||
      bytes.toString("base64") !== result.base64 ||
      createHash("sha256").update(bytes).digest("hex") !== artifact.digest
    )
      return null;
    const mimeType = rasterMime(bytes);
    return mimeType
      ? {
          kind: "artifact",
          name: artifact.name,
          digest: artifact.digest,
          mimeType,
          base64: result.base64,
        }
      : null;
  }
}

function parse(value: unknown): DesktopFxViewer.FileRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { pageId, reference } = value as Record<string, unknown>;
  return Object.keys(value).length === 2 &&
    DesktopBrowser.isIdentity(pageId) &&
    reference &&
    typeof reference === "object" &&
    !Array.isArray(reference)
    ? { pageId, reference }
    : null;
}

function rasterMime(
  bytes: Buffer
): DesktopFxViewer.Artifact["mimeType"] | null {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")))
    return "image/jpeg";
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (
    bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
    bytes.subarray(0, 6).toString("ascii") === "GIF89a"
  )
    return "image/gif";
  return null;
}

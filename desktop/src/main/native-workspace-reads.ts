// GRIDA-SEC-004 / GRIDA-SEC-014 — bounded editor reads use the scoped native worker.
import path from "node:path";
import {
  MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES,
  workspaceFs,
} from "@grida/daemon/server";
import type {
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
} from "@grida/daemon";
import type { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import type { WorkspaceFileWorkers } from "./workspace-file-worker";

const MAX_ACTIVE_READS = 4;
const READ_DEADLINE_MS = 15_000;
const MAX_PATH_BYTES = 4096;

export class NativeWorkspaceReads {
  private active = 0;

  constructor(
    private readonly catalog: Pick<NativeWorkspaceCatalog, "fileGrant">,
    private readonly workers: Pick<WorkspaceFileWorkers, "open">
  ) {}

  async read(
    workspaceId: string,
    relative: string,
    kind: "text" | "bytes",
    owner: AbortSignal
  ): Promise<WorkspaceReadFileResult | WorkspaceReadFileBytesResult> {
    const scope = { id: workspaceId };
    const filename = relativeFilePath(scope, relative);
    const max =
      kind === "text"
        ? workspaceFs.MAX_FILE_BYTES
        : MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES;
    if (this.active >= MAX_ACTIVE_READS)
      throw new Error("workspace_read_capacity");
    this.active++;
    const signal = AbortSignal.any([
      owner,
      AbortSignal.timeout(READ_DEADLINE_MS),
    ]);
    try {
      signal.throwIfAborted();
      const grant = await this.catalog.fileGrant(workspaceId);
      const file = await this.workers.open(grant, filename, signal, true);
      try {
        if (file.mtime === undefined) throw unavailable();
        if (file.size > max)
          throw new workspaceFs.Exception({
            code: "file-too-large",
            workspace_id: workspaceId,
            rel_path: relative,
            size: file.size,
          });
        const bytes = Buffer.alloc(file.size);
        const reader = file.stream(0, file.size).getReader();
        let offset = 0;
        try {
          for (;;) {
            const item = await reader.read();
            if (item.done) break;
            if (offset + item.value.length > bytes.length) throw unavailable();
            bytes.set(item.value, offset);
            offset += item.value.length;
          }
          if (offset !== bytes.length) throw unavailable();
        } finally {
          reader.releaseLock();
        }
        const current = await this.catalog.fileGrant(workspaceId);
        signal.throwIfAborted();
        if (
          grant.root !== current.root ||
          grant.identity.device !== current.identity.device ||
          grant.identity.inode !== current.identity.inode ||
          grant.identity.birthTimeNs !== current.identity.birthTimeNs
        )
          throw new Error("workspace_directory_changed");
        return kind === "text"
          ? {
              content: workspaceFs.decodeText(scope, relative, bytes),
              mtime: file.mtime,
            }
          : {
              base64: bytes.toString("base64"),
              size: file.size,
              mtime: file.mtime,
            };
      } catch (error) {
        await file.close().catch(() => {});
        throw error;
      }
    } finally {
      this.active--;
    }
  }
}

function relativeFilePath(scope: { id: string }, value: string): string {
  const error = (code: workspaceFs.ErrorCode) =>
    new workspaceFs.Exception({
      code,
      workspace_id: scope.id,
      rel_path: value,
    });
  if (value.includes("\0")) throw error("path-contains-null");
  if (
    !value ||
    path.posix.isAbsolute(value) ||
    Buffer.byteLength(value) > MAX_PATH_BYTES
  )
    throw error("path-not-relative");
  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../"))
    throw error("path-escapes-workspace");
  if (normalized === "." || normalized.endsWith("/")) throw error("not-a-file");
  return normalized;
}

function unavailable(): Error {
  return new Error("workspace_read_unavailable");
}

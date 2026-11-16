// GRIDA-SEC-004 / GRIDA-SEC-014 — bounded editor reads use the scoped native worker.
import path from "node:path";
import {
  MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES,
  workspaceFs,
} from "@grida/daemon/server";
import type {
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceFsEntry,
} from "@grida/daemon";
import type { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import type { WorkspaceFileWorkers } from "./workspace-file-worker";
import type { WorkspaceMediaGrant } from "./workspace-media-registry";

const MAX_ACTIVE_READS = 4;
const MAX_PENDING_READS = 32;
const READ_DEADLINE_MS = 15_000;
const MAX_PATH_BYTES = 4096;

export class NativeWorkspaceReads {
  private active = 0;
  private readonly pending = new Set<() => void>();

  constructor(
    private readonly catalog: Pick<NativeWorkspaceCatalog, "fileGrant">,
    private readonly workers: Pick<WorkspaceFileWorkers, "open" | "list">
  ) {}

  async read(
    workspaceId: string,
    relative: string,
    kind: "text" | "bytes",
    owner: AbortSignal
  ): Promise<WorkspaceReadFileResult | WorkspaceReadFileBytesResult> {
    const scope = { id: workspaceId };
    const filename = workspaceFilePath(workspaceId, relative);
    const max =
      kind === "text"
        ? workspaceFs.MAX_FILE_BYTES
        : MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES;
    const { bytes, mtime } = await this.withGrant(
      workspaceId,
      owner,
      (grant, signal) => this.buffer(grant, filename, relative, max, signal)
    );
    return kind === "text"
      ? { content: workspaceFs.decodeText(scope, relative, bytes), mtime }
      : { base64: bytes.toString("base64"), size: bytes.length, mtime };
  }

  async list(
    workspaceId: string,
    relative: string,
    owner: AbortSignal
  ): Promise<WorkspaceFsEntry[]> {
    const normalized = relativePath({ id: workspaceId }, relative);
    const directory = normalized === "." ? "" : normalized;
    const entries = await this.withGrant(workspaceId, owner, (grant, signal) =>
      this.workers.list(grant, directory, signal)
    );
    return workspaceFs.projectDirectory(relative, entries);
  }

  private async withGrant<T>(
    workspaceId: string,
    owner: AbortSignal,
    run: (grant: WorkspaceMediaGrant, signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const signal = AbortSignal.any([
      owner,
      AbortSignal.timeout(READ_DEADLINE_MS),
    ]);
    await this.acquire(signal);
    try {
      signal.throwIfAborted();
      const grant = await this.catalog.fileGrant(workspaceId);
      signal.throwIfAborted();
      const result = await run(grant, signal);
      const current = await this.catalog.fileGrant(workspaceId);
      signal.throwIfAborted();
      if (
        grant.root !== current.root ||
        grant.identity.device !== current.identity.device ||
        grant.identity.inode !== current.identity.inode ||
        grant.identity.birthTimeNs !== current.identity.birthTimeNs
      )
        throw new Error("workspace_directory_changed");
      return result;
    } finally {
      const next = this.pending.values().next().value;
      if (next) {
        // Transfer the occupied slot so fresh reads cannot overtake the queue.
        this.pending.delete(next);
        next();
      } else {
        this.active--;
      }
    }
  }

  private async acquire(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.active < MAX_ACTIVE_READS) {
      this.active++;
      return;
    }
    if (this.pending.size >= MAX_PENDING_READS)
      throw new Error("workspace_read_capacity");
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        this.pending.delete(start);
        reject(signal.reason);
      };
      this.pending.add(start);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  private async buffer(
    grant: WorkspaceMediaGrant,
    filename: string,
    relative: string,
    max: number,
    signal: AbortSignal
  ): Promise<{ bytes: Buffer; mtime: number }> {
    const file = await this.workers.open(grant, filename, signal, true);
    try {
      if (file.mtime === undefined) throw unavailable();
      if (file.size > max)
        throw new workspaceFs.Exception({
          code: "file-too-large",
          workspace_id: grant.workspaceId,
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
      return { bytes, mtime: file.mtime };
    } catch (error) {
      await file.close().catch(() => {});
      throw error;
    }
  }
}

export function workspaceFilePath(
  workspaceId: string,
  relative: string
): string {
  const scope = { id: workspaceId };
  const filename = relativePath(scope, relative);
  if (!relative) throw pathError(scope, relative, "path-not-relative");
  if (filename === "." || filename.endsWith("/"))
    throw pathError(scope, relative, "not-a-file");
  return filename;
}

function relativePath(scope: { id: string }, value: string): string {
  if (value.includes("\0")) throw pathError(scope, value, "path-contains-null");
  if (path.posix.isAbsolute(value) || Buffer.byteLength(value) > MAX_PATH_BYTES)
    throw pathError(scope, value, "path-not-relative");
  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../"))
    throw pathError(scope, value, "path-escapes-workspace");
  return normalized;
}

function pathError(
  scope: { id: string },
  value: string,
  code: workspaceFs.ErrorCode
) {
  return new workspaceFs.Exception({
    code,
    workspace_id: scope.id,
    rel_path: value,
  });
}

function unavailable(): Error {
  return new Error("workspace_read_unavailable");
}

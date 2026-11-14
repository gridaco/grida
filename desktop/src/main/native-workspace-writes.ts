// GRIDA-SEC-004 / GRIDA-SEC-014 — explicitly admitted, bounded native editor saves.
import type { WorkspaceWriteFileResult } from "@grida/daemon";
import type { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import { workspaceFilePath } from "./native-workspace-reads";
import type { WorkspaceFileWorkers } from "./workspace-file-worker";

const MAX_WRITE_BYTES = 64 * 1024 * 1024;
const MAX_PENDING_WRITES = 2;

export class NativeWorkspaceWrites {
  private pending = 0;

  constructor(
    private readonly catalog: Pick<NativeWorkspaceCatalog, "withWriteGrant">,
    private readonly workers: Pick<WorkspaceFileWorkers, "write">
  ) {}

  async save(
    workspaceId: string,
    relative: string,
    content: string,
    expectedMtime: number | undefined,
    signal: AbortSignal,
    check: () => void
  ): Promise<WorkspaceWriteFileResult> {
    const filename = workspaceFilePath(workspaceId, relative);
    if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES)
      throw new Error("workspace_write_limit");
    if (this.pending >= MAX_PENDING_WRITES)
      throw new Error("workspace_write_capacity");
    this.pending++;
    try {
      return await this.catalog.withWriteGrant(workspaceId, (grant) => {
        check();
        return this.workers.write(
          grant,
          filename,
          Buffer.from(content, "utf8"),
          expectedMtime,
          signal,
          check
        );
      });
    } finally {
      this.pending--;
    }
  }
}

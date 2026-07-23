import type { AgentSurface } from "@grida/agent/surface";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import type { EditorGroup } from "./editor-group";

/**
 * Interactive surface host for one workspace workbench.
 *
 * The host validates every model-supplied path against live workspace
 * directory truth before handing a relative id to the editor group. The
 * server owns the tool result; this renderer adapter only applies the
 * presentation request as an auxiliary side effect. Tab mutation stays in
 * `EditorGroup`.
 */
export class WorkspaceSurfaceHost implements AgentSurface.Host {
  constructor(
    private readonly readdir: WorkspaceArtifact.Readdir,
    private readonly group: Pick<EditorGroup, "getSnapshot" | "open">,
    private readonly isVirtual: (id: string) => boolean = (id) =>
      id.startsWith("virtual://")
  ) {}

  async open(path: string): Promise<void> {
    const relPath = WorkspaceArtifact.fromAgentPath(path);
    if (relPath === null) return;
    const expectedSnapshot = this.group.getSnapshot();
    await this.openValidated(relPath, expectedSnapshot);
  }

  /**
   * Restore a persisted Desktop-relative path through the same live validation
   * used for model calls.
   */
  async openRelative(path: string): Promise<void> {
    await this.openValidated(path);
  }

  private async openValidated(
    path: string,
    expectedSnapshot?: ReturnType<EditorGroup["getSnapshot"]>
  ): Promise<void> {
    const relPath = WorkspaceArtifact.normalizeRelativePath(path);
    if (relPath === null) return;

    let entry;
    try {
      entry = await WorkspaceArtifact.find(this.readdir, relPath);
    } catch {
      return;
    }
    if (!entry || !WorkspaceArtifact.isOpenable(entry)) return;

    // Validation crosses the asynchronous Desktop bridge. Any tab mutation in
    // the meantime is newer navigation and supersedes this auxiliary agent
    // presentation request. Explicit cold-start restoration uses
    // `openRelative`, which deliberately has no preemption snapshot.
    if (
      expectedSnapshot !== undefined &&
      this.group.getSnapshot() !== expectedSnapshot
    ) {
      return;
    }
    this.group.open(relPath);
  }

  listOpen(): AgentSurface.Snapshot {
    const { tabs, active } = this.group.getSnapshot();
    const open = tabs.flatMap((id) => {
      if (this.isVirtual(id)) return [];
      const path = WorkspaceArtifact.toAgentPath(id);
      return path === null ? [] : [path];
    });
    const activePath =
      active === null || this.isVirtual(active)
        ? null
        : WorkspaceArtifact.toAgentPath(active);
    return { active: activePath, open };
  }

  /**
   * Pick the relative artifact path safe to restore on a later cold start.
   *
   * A virtual tab can own focus while real tabs are independently closed.
   * Persisting the old active path in that state resurrects a closed artifact,
   * so fall back to the last still-open real tab, or clear the path when none
   * remain.
   */
  rememberedRelativePath(): string | null {
    const { tabs, active } = this.group.getSnapshot();
    if (active !== null && !this.isVirtual(active)) {
      return WorkspaceArtifact.normalizeRelativePath(active);
    }
    for (let index = tabs.length - 1; index >= 0; index--) {
      const id = tabs[index];
      if (this.isVirtual(id)) continue;
      const path = WorkspaceArtifact.normalizeRelativePath(id);
      if (path !== null) return path;
    }
    return null;
  }
}

import type { AgentSurface } from "@grida/agent/surface";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import type { WorkspaceViewState } from "@/lib/desktop/workspace-view-state";
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
    private readonly group: Pick<
      EditorGroup,
      "getSnapshot" | "open" | "restore"
    >,
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
   * Restore an ordered persisted tab set after validating every path against
   * live workspace truth. The group is replaced once, so React never renders
   * intermediate active tabs while the bridge checks the saved paths.
   */
  async restoreRelative(state: WorkspaceViewState.Tabs): Promise<void> {
    const expectedSnapshot = this.group.getSnapshot();
    const restored = await Promise.all(
      state.open.map((path) => this.resolveOpenableRelative(path))
    );
    if (this.group.getSnapshot() !== expectedSnapshot) return;

    const tabs = restored.filter((path): path is string => path !== null);
    const requestedActive =
      state.active === null
        ? null
        : WorkspaceArtifact.normalizeRelativePath(state.active);
    this.group.restore({
      tabs,
      active:
        requestedActive !== null && tabs.includes(requestedActive)
          ? requestedActive
          : null,
    });
  }

  private async openValidated(
    path: string,
    expectedSnapshot?: ReturnType<EditorGroup["getSnapshot"]>
  ): Promise<void> {
    const relPath = await this.resolveOpenableRelative(path);
    if (relPath === null) return;

    // Validation crosses the asynchronous Desktop bridge. Any tab mutation in
    // the meantime is newer navigation and supersedes this auxiliary agent
    // presentation request. `restoreRelative` independently guards its whole
    // batch against the same race.
    if (
      expectedSnapshot !== undefined &&
      this.group.getSnapshot() !== expectedSnapshot
    ) {
      return;
    }
    this.group.open(relPath);
  }

  private async resolveOpenableRelative(path: string): Promise<string | null> {
    const relPath = WorkspaceArtifact.normalizeRelativePath(path);
    if (relPath === null) return null;

    try {
      const entry = await WorkspaceArtifact.find(this.readdir, relPath);
      return entry && WorkspaceArtifact.isOpenable(entry) ? relPath : null;
    } catch {
      return null;
    }
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
   * Pick the ordered real tabs safe to persist for a later workspace restore.
   *
   * A virtual tab can own focus while real tabs are independently closed.
   * Persisting the old active path in that state resurrects a closed artifact,
   * so fall back to the last still-open real tab, or clear the path when none
   * remain.
   */
  rememberedTabs(): WorkspaceViewState.Tabs {
    const { tabs, active } = this.group.getSnapshot();
    const open = tabs.flatMap((id) => {
      if (this.isVirtual(id)) return [];
      const path = WorkspaceArtifact.normalizeRelativePath(id);
      return path === null ? [] : [path];
    });
    if (active !== null && !this.isVirtual(active)) {
      const normalized = WorkspaceArtifact.normalizeRelativePath(active);
      if (normalized !== null && open.includes(normalized)) {
        return { open, active: normalized };
      }
    }
    return { open, active: open.at(-1) ?? null };
  }
}

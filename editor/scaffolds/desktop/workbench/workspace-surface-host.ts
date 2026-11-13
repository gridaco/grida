import {
  NativeEditorSurfaces,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import type { WorkspaceViewState } from "@/lib/desktop/workspace-view-state";
import type { EditorGroup } from "./editor-group";
import { WorkspaceSvgText } from "./workspace-svg-text";

/**
 * Interactive surface host for one workspace workbench.
 *
 * The host validates every agent-supplied path against live workspace
 * directory truth before handing a relative id to the editor group. The
 * agent owns the tool result; this renderer adapter only applies the
 * presentation request as an auxiliary side effect. Tab mutation stays in
 * `EditorGroup`.
 */
export class WorkspaceSurfaceHost {
  readonly svgText: WorkspaceSvgText;

  constructor(
    private readonly readdir: WorkspaceArtifact.Readdir,
    private readonly group: Pick<
      EditorGroup,
      "getSnapshot" | "open" | "restore" | "subscribe"
    >
  ) {
    this.svgText = new WorkspaceSvgText(this.group.getSnapshot);
  }

  async open(
    path: string,
    requireCurrent: () => boolean = () => true
  ): Promise<void> {
    if (!requireCurrent()) return;
    const relPath = WorkspaceArtifact.fromAgentPath(path);
    if (relPath === null) return;
    const expectedSnapshot = this.group.getSnapshot();
    const target = await this.resolveOpenableRelative(relPath);
    if (
      target !== null &&
      requireCurrent() &&
      this.group.getSnapshot() === expectedSnapshot
    )
      this.group.open(target);
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

  /** Agent paths of the open tabs, and the active one. */
  listOpen(): { active: string | null; open: string[] } {
    const { tabs, active } = this.group.getSnapshot();
    const open = tabs.flatMap((id) => {
      const path = WorkspaceArtifact.toAgentPath(id);
      return path === null ? [] : [path];
    });
    const activePath =
      active === null ? null : WorkspaceArtifact.toAgentPath(active);
    return { active: activePath, open };
  }

  readEditorSurfaces() {
    return NativeEditorSurfaces.capture(this.listOpen());
  }

  subscribeToEditorSurfaces(listener: () => void): () => void {
    return this.group.subscribe(listener);
  }

  publishEditorSurfaces(
    publish: (snapshot: NativeEditorSurfaceSnapshot) => Promise<boolean>
  ): () => void {
    let current = true;
    let pending = false;
    let dirty = false;
    const flush = async () => {
      while (current && dirty) {
        dirty = false;
        current =
          (await publish(this.readEditorSurfaces()).catch(() => false)) &&
          current;
      }
      pending = false;
    };
    const update = () => {
      if (!current) return;
      dirty = true;
      if (pending) return;
      pending = true;
      void flush();
    };
    const unsubscribe = this.subscribeToEditorSurfaces(update);
    update();
    return () => {
      current = false;
      unsubscribe();
    };
  }

  /**
   * Pick the ordered tabs safe to persist for a later workspace restore.
   *
   * Only an active path that is still open is persisted; otherwise fall back
   * to the last open tab, or clear the path when none remain.
   */
  rememberedTabs(): WorkspaceViewState.Tabs {
    const { tabs, active } = this.group.getSnapshot();
    const open = tabs.flatMap((id) => {
      const path = WorkspaceArtifact.normalizeRelativePath(id);
      return path === null ? [] : [path];
    });
    if (active !== null) {
      const normalized = WorkspaceArtifact.normalizeRelativePath(active);
      if (normalized !== null && open.includes(normalized)) {
        return { open, active: normalized };
      }
    }
    return { open, active: open.at(-1) ?? null };
  }
}

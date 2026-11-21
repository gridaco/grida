import {
  NativeEditorSurfaces,
  type DesktopBridge,
  type DesktopFxViewer,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import type { SvgEditor } from "@grida/svg-editor";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import type { WorkspaceViewState } from "@/lib/desktop/workspace-view-state";
import type { CanvasBoard } from "../canvas/board-store";
import { EditorSelectionSurface } from "../shared/editor-selection-surface";
import type { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";

/**
 * Interactive surface host for one workspace workbench.
 *
 * The host validates every agent-supplied path against live workspace
 * directory truth before handing a relative id to the editor group. The
 * agent owns the tool result; this renderer adapter only applies the
 * presentation request as an auxiliary side effect. Tab mutation stays in
 * `EditorGroup`. The host deals in file tabs only: panels are neither listed
 * to the agent nor remembered for a later restore.
 */
export class WorkspaceSurfaceHost {
  private readonly surfaces: EditorSelectionSurface;
  readonly editorSelection: EditorSelectionSurface["selection"];
  readonly subscribeToEditorSurfaces: EditorSelectionSurface["subscribe"];

  constructor(
    private readonly readdir: WorkspaceArtifact.Readdir,
    private readonly group: Pick<
      EditorGroup,
      "getSnapshot" | "open" | "restore" | "subscribe"
    >
  ) {
    this.surfaces = new EditorSelectionSurface(
      () => this.group.getSnapshot().active,
      this.group.subscribe
    );
    this.editorSelection = this.surfaces.selection;
    this.subscribeToEditorSurfaces = this.surfaces.subscribe;
  }

  /** A tab can host its own SVG or an editable SVG inside a deck. */
  readonly bindSvgEditor = (
    tabPath: string,
    documentPath: string,
    editor: SvgEditor
  ): (() => void) | undefined => {
    const path = WorkspaceArtifact.toAgentPath(documentPath);
    if (path)
      return this.surfaces.bindSvg(WorkbenchTab.file(tabPath), path, editor);
  };

  readonly bindBoardSelection = (tabPath: string, board: CanvasBoard) => {
    const boardPath = WorkspaceArtifact.toAgentPath(tabPath);
    if (boardPath)
      return this.surfaces.bindDocument(WorkbenchTab.file(tabPath), {
        read: () => board.selectedDocument(boardPath),
        clear: () => board.selectFrame(null),
        subscribe: board.subscribe,
      });
  };

  async open(
    path: string,
    requireCurrent: () => boolean = () => true
  ): Promise<void> {
    await this.tryOpen(path, requireCurrent);
  }

  private async tryOpen(
    path: string,
    requireCurrent: () => boolean
  ): Promise<boolean> {
    if (!requireCurrent()) return false;
    const relPath = WorkspaceArtifact.fromAgentPath(path);
    if (relPath === null) return false;
    const expectedSnapshot = this.group.getSnapshot();
    const target = await this.resolveOpenableRelative(relPath);
    if (
      target === null ||
      !requireCurrent() ||
      this.group.getSnapshot() !== expectedSnapshot
    )
      return false;
    this.group.open(WorkbenchTab.file(target));
    return true;
  }

  /** Product chooses when to call this and where to present a read-only artifact. */
  async openFxFile(
    request: DesktopFxViewer.FileRequest,
    prepare: DesktopBridge["workspaces"]["prepareFxFile"],
    presentArtifact: (artifact: DesktopFxViewer.Artifact) => boolean,
    requireCurrent: () => boolean = () => true
  ): Promise<"opened" | DesktopFxViewer.FileOutcome> {
    if (!prepare) return "unavailable";
    const expected = this.group.getSnapshot();
    const current = () =>
      requireCurrent() && this.group.getSnapshot() === expected;
    if (!current()) return "stale";
    let result: DesktopFxViewer.FileResult;
    try {
      result = await prepare(request);
    } catch {
      return "unavailable";
    }
    if (!current()) return "stale";
    if (result.kind !== "ready") return result.kind;
    if (result.file.kind === "artifact") {
      try {
        return presentArtifact(result.file) ? "opened" : "unavailable";
      } catch {
        return "unknown";
      }
    }
    const file = WorkspaceArtifact.toAgentPath(result.file.relativePath);
    if (!file) return "unavailable";
    const opened = await this.tryOpen(file, current);
    return opened ? "opened" : current() ? "unavailable" : "stale";
  }

  /**
   * Restore an ordered persisted tab set after validating every path against
   * live workspace truth. The group is replaced once, so React never renders
   * intermediate active tabs while the bridge checks the saved paths.
   */
  async restoreRelative(state: WorkspaceViewState.Tabs): Promise<void> {
    const expectedSnapshot = this.group.getSnapshot();
    const restored = await this.resolveRelativePaths(state.open);
    if (this.group.getSnapshot() !== expectedSnapshot) return;

    const paths = restored.filter((path): path is string => path !== null);
    const requestedActive =
      state.active === null
        ? null
        : WorkspaceArtifact.normalizeRelativePath(state.active);
    this.group.restore({
      tabs: paths.map(WorkbenchTab.file),
      active:
        requestedActive !== null && paths.includes(requestedActive)
          ? WorkbenchTab.file(requestedActive)
          : null,
    });
  }

  /** Resolve remembered file paths without mutating the tab group. */
  async resolveRelativePaths(paths: readonly string[]): Promise<string[]> {
    const resolved = await Promise.all(
      paths.map((path) => this.resolveOpenableRelative(path))
    );
    return resolved.filter((path): path is string => path !== null);
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

  /** Agent paths of the open file tabs, and the active one. */
  listOpen(): { active: string | null; open: string[] } {
    const { tabs, active } = this.group.getSnapshot();
    const open = tabs.flatMap((key) => {
      const relPath = WorkbenchTab.relPath(key);
      const path =
        relPath === null ? null : WorkspaceArtifact.toAgentPath(relPath);
      return path === null ? [] : [path];
    });
    const activeRelPath = WorkbenchTab.relPath(active);
    const activePath =
      activeRelPath === null
        ? null
        : WorkspaceArtifact.toAgentPath(activeRelPath);
    return { active: activePath, open };
  }

  readEditorSurfaces() {
    return NativeEditorSurfaces.capture({
      ...this.listOpen(),
      selection: this.editorSelection.readSubject(),
    });
  }

  publishEditorSurfaces(
    publish: (snapshot: NativeEditorSurfaceSnapshot) => Promise<boolean>,
    additionalChanges?: (listener: () => void) => () => void
  ): () => void {
    let current = true;
    let pending = false;
    let dirty = false;
    const flush = async () => {
      while (current && dirty) {
        dirty = false;
        current =
          (await publish(NativeEditorSurfaces.capture(this.listOpen())).catch(
            () => false
          )) && current;
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
    const unsubscribe = this.group.subscribe(update);
    const unsubscribeAdditional = additionalChanges?.(update);
    update();
    return () => {
      current = false;
      unsubscribe();
      unsubscribeAdditional?.();
    };
  }

  bindAutomation(
    automation: NonNullable<DesktopBridge["workspaces"]["automation"]>,
    activePage: () => string | null,
    subscribePages: (listener: () => void) => () => void
  ): () => void {
    let current = true;
    let lastPublication: string | undefined;
    const unlisten = automation.onOpenFile(({ path, expiresAtMs }) => {
      void this.open(path, () => current && Date.now() < expiresAtMs);
    });
    const unpublish = this.publishEditorSurfaces((snapshot) => {
      const pageId = activePage();
      const publication = JSON.stringify([snapshot, pageId]);
      if (publication === lastPublication) return Promise.resolve(true);
      lastPublication = publication;
      return automation.publish(snapshot, pageId);
    }, subscribePages);
    return () => {
      current = false;
      unpublish();
      unlisten();
    };
  }

  /**
   * Pick the ordered tabs safe to persist for a later workspace restore.
   *
   * Only file tabs are persisted. Only an active path that is still open is
   * persisted; otherwise fall back to the last open file, or clear the path
   * when none remain.
   */
  rememberedTabs(): WorkspaceViewState.Tabs {
    const { tabs, active } = this.group.getSnapshot();
    const open = tabs.flatMap((key) => {
      const relPath = WorkbenchTab.relPath(key);
      const path =
        relPath === null
          ? null
          : WorkspaceArtifact.normalizeRelativePath(relPath);
      return path === null ? [] : [path];
    });
    const activeRelPath = WorkbenchTab.relPath(active);
    if (activeRelPath !== null) {
      const normalized = WorkspaceArtifact.normalizeRelativePath(activeRelPath);
      if (normalized !== null && open.includes(normalized)) {
        return { open, active: normalized };
      }
    }
    return { open, active: open.at(-1) ?? null };
  }
}

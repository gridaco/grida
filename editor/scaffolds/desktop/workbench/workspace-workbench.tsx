/**
 * Workspace workbench — agent-first split layout for a single opened
 * workspace.
 *
 * Layout:
 *
 *   ┌─ Left ──────────────┬─ Main ───────────────────┬─ Right? ────┐
 *   │ TitleBar            │ TitleBar: tabs ···       │ toggle      │
 *   │ Agent Pane          │ focused content          │ file tree   │
 *   │                     ├───────────────────────────┤             │
 *   │                     │ utilities?                │             │
 *   └─────────────────────┴───────────────────────────┴─────────────┘
 *
 * Each column owns its title bar. The file tree starts closed; while closed,
 * its toggle lives at the end of the main title bar, and while open it moves
 * into the file tree's own title bar. Documents and optional workspace utilities
 * use floating surfaces. The file tree is a docked utility column with a hard left
 * divider, and its resize boundary spans the full main/right height.
 *
 * The workbench owns the small amount of cross-pane state: which tabs
 * are open, which is active, and a refresh counter that the file tree pane
 * reads when one pane mutates the filesystem (a save in the editor,
 * an mkdir/cp/git-mv from the agent pane). Pure prop drilling — no
 * context, no store — because nothing else needs to subscribe.
 *
 * Tabs are files or panels (`workbench-tab.ts`). Each of the agent pane's
 * side chats opens as its own panel tab through `SideChatTabPlacement`,
 * handed down to the chat like the surface host.
 *
 * The host (`page.tsx`) is responsible for resolving the workspace
 * from the `?id=` query param; this component renders against an
 * already-resolved `Workspace` so it never needs to deal with the
 * empty-bridge / loading state.
 */
"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { usePanelRef } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/ui/components/resizable";
import {
  DESKTOP_WINDOW_CONTROLS_RIGHT_INSET,
  TitleBar,
} from "@/scaffolds/desktop/chrome/title-bar";
import { LastWorkspaceMarker } from "@/scaffolds/desktop/shared/last-workspace-marker";
import {
  terminal as bridgeTerminal,
  workspaces as workspacesNs,
  type Workspace,
} from "@/lib/desktop/bridge";
import {
  confirmAndTrashEntry,
  copyAbsolutePath,
  copyRelativePath,
  matchFileActionShortcut,
  revealInFinder,
} from "./workbench-file-actions";
import {
  isTerminalToggleEvent,
  WORKSPACE_TERMINAL_TOGGLE_COMMAND,
  WORKSPACE_WORKBENCH_COMMAND_EVENT,
} from "./workspace-workbench-keybindings";
import { FileTreePane } from "./file-tree-pane";
import { EditorPane, WorkspaceExplorerToggleButton } from "./editor-pane";
import { WorkspaceTitleMenu } from "./workspace-title-menu";
import { AgentPane } from "./agent-pane";
import { WorkspaceUtilities } from "./workspace-utilities";
import { WorkspaceUtilitiesPanel } from "./workspace-utilities-panel";
import type { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";
import { WorkspaceChangesProvider } from "./workspace-changes";
import { WorkspaceBrowserSession } from "./workspace-browser-session";
import { WorkbenchTab } from "./workbench-tab";
import { WorkbenchPanels } from "./workbench-panels";
import { SideChatTabPlacement } from "./side-chat-tab-placement";
import { SubagentTabPlacement } from "./subagent-tab-placement";
import { WorkspaceSurfaceHost } from "./workspace-surface-host";
import { WorkspaceCanvasCreation } from "./workspace-canvas-creation";
import styles from "./workspace-workbench.module.css";
import "./browser-guest-mounts.css";

/**
 * Pane sizing for the agent-first split:
 *   - Default size as a percentage (scales with window width).
 *   - Min (and optional max) as pixels (pane readability is a pixel concern).
 *
 * The chat gets a stable conversational width while the document region takes
 * the majority of the window. The optional file tree is a third visual column
 * nested inside the non-chat region, so opening it never changes chat width.
 */
const FILE_TREE_PANE_DEFAULT = "24%";
const FILE_TREE_PANE_MIN = "200px";
const FILE_TREE_PANE_MAX = "360px";
const AGENT_PANE_DEFAULT = "30%";
const AGENT_PANE_MIN = "320px";
const EDITOR_PANE_MIN = "360px";
const FLOATING_BOTTOM_SURFACE_GUTTER_CLASS =
  "h-full min-h-0 pb-3 pl-1.5 pr-3 pt-1.5";
const FLOATING_UTILITY_SURFACE_CLASS =
  "relative h-full min-h-0 overflow-hidden rounded-lg border border-border/60 bg-background shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-8px_rgb(0_0_0/0.12)]";
const RESIZE_HANDLE_HIGHLIGHT_CLASS =
  "before:pointer-events-none before:absolute before:z-10 before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-linear-to-b before:from-transparent before:via-muted-foreground/55 before:to-transparent before:opacity-0 before:transition-opacity hover:before:opacity-100 active:before:via-foreground/70 active:before:opacity-100 focus-visible:before:opacity-100 aria-[orientation=horizontal]:before:inset-x-0 aria-[orientation=horizontal]:before:inset-y-auto aria-[orientation=horizontal]:before:left-0 aria-[orientation=horizontal]:before:top-1/2 aria-[orientation=horizontal]:before:h-px aria-[orientation=horizontal]:before:w-full aria-[orientation=horizontal]:before:-translate-y-1/2 aria-[orientation=horizontal]:before:translate-x-0 aria-[orientation=horizontal]:before:bg-linear-to-r";
const RESIZE_GUTTER_CLASS = `z-20 w-1.5 cursor-col-resize bg-transparent after:w-3 aria-[orientation=horizontal]:h-1.5 aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:h-3 ${RESIZE_HANDLE_HIGHLIGHT_CLASS}`;
const DOCKED_PANE_RESIZE_HANDLE_CLASS = `desktop-no-drag z-20 -mx-1.5 w-3 cursor-col-resize bg-transparent after:w-3 ${RESIZE_HANDLE_HIGHLIGHT_CLASS}`;
// Bottom utility panel (VSCode-style). Collapsible: dragging it under
// its min snaps it closed, and ctrl+` collapse/expand keeps the shell
// process alive (the panel content stays mounted at zero height).
const UTILITY_PANE_DEFAULT = "30%";
const UTILITY_PANE_MIN = "120px";

/**
 * Separators remain keyboard-focusable for arrow-key resizing, but pointer
 * interaction should not leave their focus ring pinned on screen afterward.
 */
function releaseResizeHandlePointerFocus(
  event: ReactPointerEvent<HTMLDivElement>
) {
  event.currentTarget.blur();
}

/**
 * Whether a keyboard event originated inside an editable surface (text
 * input, textarea, or contenteditable — which covers the agent chat box
 * and the code editor's textarea). Used to keep the global ⌘⌫ trash
 * shortcut from firing while the user is editing text, where ⌘⌫ means
 * "delete to start of line."
 *
 * (see test/desktop-workbench-trash-shortcut-text-guard.md)
 */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
}

export function WorkspaceWorkbench({
  workspace,
  initialActiveRelPath,
}: {
  workspace: Workspace;
  initialActiveRelPath?: string;
}) {
  // The editor group (VSCode's tab model) owns all tab state + rules — open
  // order, the active-tab-on-close neighbor rule, and reopen-closed history —
  // as a plain, unit-tested class. React is a
  // wire: `useSyncExternalStore` mirrors its snapshot, and the handlers below are
  // one-line calls into it. `active === null` means no tabs open; otherwise it's
  // always one of `tabs`. (Per the `code-react` doctrine: load-bearing UX logic
  // lives where it's testable, not smeared across effects + refs + nested
  // setState updaters.)
  const browserSession = useMemo(
    () =>
      WorkspaceBrowserSession.for(
        typeof document === "undefined" ? null : document,
        workspace.id
      ),
    [workspace.id]
  );
  const { group, browsers } = browserSession;
  const [browserUIOwner] = useState(() => ({}));
  useLayoutEffect(
    () => browserSession.bindUI(browserUIOwner),
    [browserSession, browserUIOwner]
  );
  const panels = useMemo(() => new WorkbenchPanels(group), [group]);
  const sideChatPlacement = useMemo(
    () => new SideChatTabPlacement(panels),
    [panels]
  );
  const subagentPlacement = useMemo(
    () => new SubagentTabPlacement(panels),
    [panels]
  );
  const surfaceHost = useMemo(
    () =>
      new WorkspaceSurfaceHost(
        (relPath) => workspacesNs.readdir(workspace.id, relPath),
        group
      ),
    [group, workspace.id]
  );
  const { tabs: openTabs, active: activeTab } = useSyncExternalStore(
    group.subscribe,
    group.getSnapshot,
    group.getSnapshot
  );
  // File rules (reveal, copy path, trash, tree selection) follow the active
  // tab only when it is a file.
  const activeRelPath = WorkbenchTab.relPath(activeTab);
  const [restoreSettled, setRestoreSettled] = useState(false);

  useEffect(() => {
    if (restoreSettled)
      return surfaceHost.publishEditorSurfaces(
        workspacesNs.publishEditorSurfaces
      );
  }, [restoreSettled, surfaceHost]);

  // File admission and native page attachment settle before the Start surface.
  useEffect(() => {
    let current = true;
    setRestoreSettled(false);
    void browserSession
      .start(
        window.localStorage,
        (paths) => surfaceHost.resolveRelativePaths(paths),
        initialActiveRelPath
      )
      .finally(() => {
        if (current) setRestoreSettled(true);
      });
    return () => {
      current = false;
    };
  }, [browserSession, initialActiveRelPath, surfaceHost]);

  // Do not flash Start while a remembered artifact is still being validated.
  // Once restoration settles, an actually-empty editor group owns the faux tab.
  // (see test/desktop-workbench-start-tab.md)
  const showStart = restoreSettled && openTabs.length === 0;
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  // File tree pane visibility. It starts hidden so the primary agent + editor
  // surfaces get the full workspace; ⌘B / Ctrl+B toggles it. The main title
  // bar carries the toggle while closed; the tree's own title bar carries it
  // while open.
  // Conditional render (not `display: none`) so the resizable-panel
  // group redistributes space cleanly to the EditorPane when the file tree pane
  // is hidden.
  const [showTree, setShowTree] = useState(false);

  // Terminal and agent Processes share a utility panel, with separate lifetimes.
  // Processes alone never creates a PTY; switching tabs or collapsing keeps
  // an existing shell mounted. Older bridges can still show agent processes.
  const supportsTerminal = bridgeTerminal.isSupported();
  const [utilities] = useState(
    () => new WorkspaceUtilities(supportsTerminal ? "terminal" : "processes")
  );
  const utilityView = useSyncExternalStore(
    utilities.subscribe,
    utilities.read,
    utilities.read
  );
  const utilityPanelRef = usePanelRef();
  const [utilitiesVisible, setUtilitiesVisible] = useState(false);
  const [processes, setProcesses] =
    useState<NativeBackgroundProcessController | null>(null);
  const toggleTerminal = useCallback(
    () => utilities.toggleTerminal(utilityPanelRef.current ?? undefined),
    [utilities, utilityPanelRef]
  );
  const toggleUtilities = useCallback(
    () => utilities.toggle(utilityPanelRef.current ?? undefined),
    [utilities, utilityPanelRef]
  );
  const closeUtilities = useCallback(
    () => utilityPanelRef.current?.collapse(),
    [utilityPanelRef]
  );

  const bumpTreeRefresh = useCallback(() => {
    setTreeRefreshKey((k) => k + 1);
  }, []);

  const toggleTree = useCallback(() => {
    setShowTree((v) => !v);
  }, []);

  const openTree = useCallback(() => {
    setShowTree(true);
  }, []);

  // A trashed entry: drop the affected tab(s) — a file closes its own
  // tab; a folder closes every open tab under it (its whole subtree).
  // We activate the nearest surviving tab to the left of the one that
  // was active (VSCode-like), and never record any of them for "reopen
  // closed tab" — Cmd/Ctrl+Shift+T must not resurrect a deleted entry.
  // Then bump the tree so the row disappears. Declared above the keydown
  // effect that references it (its dep array is read at render).
  const handleEntryTrashed = useCallback(
    (relPath: string, isDirectory: boolean) => {
      // A trashed file closes its own tab; a trashed folder closes its whole
      // subtree. The group focuses the nearest surviving tab and (being a trash,
      // not a close) never records them for reopen.
      group.closeMatching(WorkbenchTab.trashed(relPath, isDirectory));
      bumpTreeRefresh();
    },
    [group, bumpTreeRefresh]
  );

  // ⌘B / Ctrl+B toggles the file tree pane. We intentionally don't
  // scope this to a particular focused element — the shortcut is
  // global within the workspace window, matching VSCode. Editable
  // children that need ⌘B for their own action (rich-text bold, etc.)
  // would have to consume the event before bubbling, but none of the
  // current viewers do.
  //
  // The same listener also dispatches the three file actions
  // (Reveal in Finder / Copy path / Copy relative path) against the
  // active tab. They live up here rather than per-tab because the
  // shortcuts are workspace-wide — they fire whether or not the user
  // has clicked into the tab strip. If there's no active tab, the
  // file-action shortcuts are no-ops (same UX as the context-menu
  // entries being unavailable on an empty viewer).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ctrl+` toggles the terminal pane (VSCode). The terminal pane's
      // xterm key handler deliberately lets this chord bubble up here,
      // so the toggle works even while the shell has focus. Key-repeat
      // is swallowed (preventDefault, no toggle): one press = one state
      // change, and held-chord repeats must not leak into the shell.
      if (supportsTerminal && isTerminalToggleEvent(e)) {
        e.preventDefault();
        if (!e.repeat) toggleTerminal();
        return;
      }
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && !e.shiftKey && !e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        toggleTree();
        return;
      }
      const action = matchFileActionShortcut(e);
      if (!action) return;
      // ⌘⌫ must defer to text editing: when an input/textarea/editor is
      // focused it means "delete to start of line." Bail BEFORE
      // preventDefault so the focused field keeps its native behaviour.
      if (action === "trash" && isEditableTarget(e.target)) return;
      // The shortcuts collide with the browser's default Cmd+R (reload)
      // and Cmd+Shift+C (devtools), so preventDefault unconditionally —
      // even when there's no active tab — to keep the surface
      // predictable. The shortcut "did nothing" rather than reloading
      // the renderer.
      e.preventDefault();
      if (!activeRelPath) return;
      switch (action) {
        case "reveal":
          void revealInFinder(workspace, activeRelPath);
          return;
        case "copy-path":
          void copyAbsolutePath(workspace, activeRelPath);
          return;
        case "copy-relative-path":
          void copyRelativePath(activeRelPath);
          return;
        case "trash":
          // Confirms via a native dialog, then drops the tab + refreshes
          // the tree. If the file tree has focus, it handles this chord
          // first and stops propagation so folders can be targeted by the
          // tree's focused-node selection. This window-level fallback targets
          // the active editor tab only.
          void confirmAndTrashEntry(workspace, activeRelPath, false).then(
            (trashed) => {
              if (trashed) handleEntryTrashed(activeRelPath, false);
            }
          );
          return;
      }
    }

    function onWorkspaceCommand(event: Event) {
      const command = (event as CustomEvent<unknown>).detail;
      if (command !== WORKSPACE_TERMINAL_TOGGLE_COMMAND || !supportsTerminal) {
        return;
      }
      toggleTerminal();
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener(
      WORKSPACE_WORKBENCH_COMMAND_EVENT,
      onWorkspaceCommand
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(
        WORKSPACE_WORKBENCH_COMMAND_EVENT,
        onWorkspaceCommand
      );
    };
  }, [
    toggleTree,
    activeRelPath,
    workspace,
    handleEntryTrashed,
    supportsTerminal,
    toggleTerminal,
  ]);

  const openFile = useCallback(
    (relPath: string) => group.open(WorkbenchTab.file(relPath)),
    [group]
  );
  const createCanvas = useCallback(
    async (editor: WorkspaceCanvasCreation.Editor, replaceTab?: string) => {
      const relPath = await WorkspaceCanvasCreation.create(
        workspace.id,
        editor
      );
      bumpTreeRefresh();
      const key = WorkbenchTab.file(relPath);
      if (replaceTab) group.replace(replaceTab, key);
      group.open(key);
    },
    [workspace.id, group, bumpTreeRefresh]
  );
  const activateTab = useCallback(
    (tab: string) => group.activate(tab),
    [group]
  );
  const closeTab = useCallback(
    async (tab: string): Promise<boolean> => {
      const target = WorkbenchTab.parse(tab);
      if (target.kind === "browser") return browsers.close(target.id);
      group.close(tab);
      return true;
    },
    [group, browsers]
  );
  const reopenClosedTab = useCallback(() => group.reopenClosed(), [group]);

  return (
    <WorkspaceChangesProvider workspaceId={workspace.id}>
      <LastWorkspaceMarker workspaceId={workspace.id} surface="workbench" />
      <div
        data-testid="workspace-workbench"
        className="h-screen w-screen overflow-hidden"
      >
        <ResizablePanelGroup className={styles.decorativeOverflow}>
          {/* The title bar belongs to the agent column. This keeps the right
              region vertically uninterrupted while retaining the workspace
              identity, navigation, and utility controls exactly where the
              conversation begins. */}
          <ResizablePanel
            defaultSize={AGENT_PANE_DEFAULT}
            minSize={AGENT_PANE_MIN}
            className="bg-background"
          >
            <div className="flex h-full min-h-0 flex-col">
              <TitleBar
                className="border-b-0"
                reserveRightWindowControls={false}
              >
                {/* The menu owns name truncation; keep this wrapper unclipped so
                    its external keyboard-focus ring can paint in full. */}
                <div className="flex min-w-0 flex-1 items-center">
                  <WorkspaceTitleMenu workspace={workspace} />
                </div>
              </TitleBar>
              <div className="min-h-0 flex-1">
                <AgentPane
                  workspace={workspace}
                  surfaceHost={surfaceHost}
                  sideChatPlacement={sideChatPlacement}
                  subagentPlacement={subagentPlacement}
                  onProcessesChange={setProcesses}
                />
              </div>
            </div>
          </ResizablePanel>

          {/* A generous, invisible gutter preserves resizing without putting
              a divider back into the visual hierarchy. */}
          <ResizableHandle
            aria-label="Resize chat and document"
            className={RESIZE_GUTTER_CLASS}
            onPointerUp={releaseResizeHandlePointerFocus}
            onPointerCancel={releaseResizeHandlePointerFocus}
          />

          <ResizablePanel
            data-workbench-decorative-overflow
            minSize={EDITOR_PANE_MIN}
          >
            <div className="h-full">
              {/* Main and file tree are full-height siblings, so their resize
                  boundary includes both title bars. Workspace utilities stay
                  within main, above the bottom edge of the docked tree. */}
              <ResizablePanelGroup className={styles.decorativeOverflow}>
                <ResizablePanel
                  data-workbench-decorative-overflow
                  minSize={EDITOR_PANE_MIN}
                >
                  <ResizablePanelGroup
                    className={styles.decorativeOverflow}
                    orientation="vertical"
                  >
                    <ResizablePanel data-workbench-decorative-overflow>
                      <EditorPane
                        workspace={workspace}
                        svgText={surfaceHost.svgText}
                        panels={panels}
                        browsers={browsers}
                        openTabs={openTabs}
                        activeTab={activeTab}
                        onSelectTab={activateTab}
                        onCloseTab={closeTab}
                        onReopenClosedTab={reopenClosedTab}
                        showStart={showStart}
                        onOpenFileExplorer={openTree}
                        onCreateCanvas={createCanvas}
                        treeVisible={showTree}
                        onToggleTree={toggleTree}
                        hasBottomPane={utilityView.mounted && utilitiesVisible}
                        utilitiesVisible={utilitiesVisible}
                        onToggleUtilities={toggleUtilities}
                        onSaved={bumpTreeRefresh}
                        onFileTrashed={(rp) => handleEntryTrashed(rp, false)}
                      />
                    </ResizablePanel>
                    {utilityView.mounted && (
                      <>
                        <ResizableHandle
                          aria-label="Resize document and workspace utilities"
                          className={RESIZE_GUTTER_CLASS}
                          onPointerUp={releaseResizeHandlePointerFocus}
                          onPointerCancel={releaseResizeHandlePointerFocus}
                        />
                        <ResizablePanel
                          data-workbench-decorative-overflow
                          panelRef={utilityPanelRef}
                          onResize={(size) =>
                            setUtilitiesVisible(size.asPercentage > 0)
                          }
                          collapsible
                          defaultSize={UTILITY_PANE_DEFAULT}
                          minSize={UTILITY_PANE_MIN}
                        >
                          <div className={FLOATING_BOTTOM_SURFACE_GUTTER_CLASS}>
                            <div className={FLOATING_UTILITY_SURFACE_CLASS}>
                              <WorkspaceUtilitiesPanel
                                workspace={workspace}
                                utilities={utilities}
                                processes={processes}
                                supportsTerminal={supportsTerminal}
                                onClose={closeUtilities}
                              />
                            </div>
                          </div>
                        </ResizablePanel>
                      </>
                    )}
                  </ResizablePanelGroup>
                </ResizablePanel>
                {showTree && (
                  <>
                    <ResizableHandle
                      aria-label="Resize document and file tree"
                      className={DOCKED_PANE_RESIZE_HANDLE_CLASS}
                      onPointerUp={releaseResizeHandlePointerFocus}
                      onPointerCancel={releaseResizeHandlePointerFocus}
                    />
                    <ResizablePanel
                      defaultSize={FILE_TREE_PANE_DEFAULT}
                      minSize={FILE_TREE_PANE_MIN}
                      maxSize={FILE_TREE_PANE_MAX}
                    >
                      <div className="flex h-full min-h-0 flex-col border-l border-border bg-background">
                        <div
                          className="desktop-drag-area flex h-11 shrink-0 items-center justify-end"
                          style={{
                            paddingRight: DESKTOP_WINDOW_CONTROLS_RIGHT_INSET,
                          }}
                        >
                          <WorkspaceExplorerToggleButton
                            open
                            onToggle={toggleTree}
                            className="mr-3"
                          />
                        </div>
                        <div className="min-h-0 flex-1">
                          <FileTreePane
                            workspace={workspace}
                            activeRelPath={activeRelPath}
                            onOpenFile={(rp) => {
                              if (rp) openFile(rp);
                            }}
                            refreshKey={treeRefreshKey}
                            onEntryTrashed={handleEntryTrashed}
                          />
                        </div>
                      </div>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </WorkspaceChangesProvider>
  );
}

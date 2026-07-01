/**
 * Workspace workbench — VSCode-like three-pane layout for a single
 * opened workspace.
 *
 * Layout:
 *
 *   ┌─ TitleBar ────────────────────────────────────────────────┐
 *   ├─ Agent Pane ────────┬─ Editor Pane ───────────┬─ File Tree Pane ┐
 *   │ agent + workspace-  │  tab strip + per-file   │ files     │
 *   │ scoped commands     │  viewers/editors        │ folders   │
 *   └─────────────────────┴─────────────────────────┴───────────┘
 *
 * No secondary header strip — the TitleBar above carries the only
 * cross-pane chrome (back/forward via Chromium history). The
 * workspace name lives in the file tree pane's root row, which is already
 * the right place for it.
 *
 * The workbench owns the small amount of cross-pane state: which tabs
 * are open, which is active, and a refresh counter that the file tree pane
 * reads when one pane mutates the filesystem (a save in the editor,
 * an mkdir/cp/git-mv from the agent pane). Pure prop drilling — no
 * context, no store — because nothing else needs to subscribe.
 *
 * The host (`page.tsx`) is responsible for resolving the workspace
 * from the `?id=` query param; this component renders against an
 * already-resolved `Workspace` so it never needs to deal with the
 * empty-bridge / loading state.
 */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  FolderIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { usePanelRef } from "react-resizable-panels";
import { Button } from "@app/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/ui/components/resizable";
import {
  TitleBar,
  TITLEBAR_NO_DRAG_STYLE,
} from "@/scaffolds/desktop/chrome/title-bar";
import {
  terminal as bridgeTerminal,
  type Workspace,
} from "@/lib/desktop/bridge";
import {
  confirmAndTrashEntry,
  copyAbsolutePath,
  copyRelativePath,
  matchFileActionShortcut,
  revealInFinder,
} from "./workbench-file-actions";
import { isTerminalToggleEvent } from "./workspace-workbench-keybindings";
import { FileTreePane } from "./file-tree-pane";
import { EditorPane } from "./editor-pane";
import { WorkspaceOpenInMenu } from "./workspace-open-in-menu";
import { AgentPane } from "./agent-pane";
import { TerminalPane } from "./terminal-pane";
import { WorkspaceChangesProvider } from "./workspace-changes";
import { EditorGroup } from "./editor-group";
import {
  DESIGN_SEARCH_TAB_ID,
  isVirtualTab,
  pickToolCallId,
  type DesignSearchSession,
} from "./design-search-tab";

/**
 * Pane sizing, matching the file window's shell conventions:
 *   - Default size as a percentage (scales with window width).
 *   - Min (and optional max) as pixels (pane readability is a pixel concern).
 *
 * Side panes stay compact (15–25%); the editor pane fills the
 * rest. The agent pane sits at ~25% because that's what the SVG
 * workstation already established as a "comfortable chat width."
 */
const FILE_TREE_PANE_DEFAULT = "18%";
const FILE_TREE_PANE_MIN = "180px";
const FILE_TREE_PANE_MAX = "360px";
const AGENT_PANE_DEFAULT = "25%";
const AGENT_PANE_MIN = "280px";
// No max: the agent pane grows as far as the user drags it (bounded only by
// the other panes' mins). Only a min is enforced, for readability.
// The editor pane fills the slack (defaultSize below), but needs its own min
// so widening the now-uncapped chat can't crush it to zero width.
const EDITOR_PANE_MIN = "360px";
// Bottom terminal panel (VSCode-style). Collapsible: dragging it under
// its min snaps it closed, and ctrl+` collapse/expand keeps the shell
// process alive (the panel content stays mounted at zero height).
const TERMINAL_PANE_DEFAULT = "30%";
const TERMINAL_PANE_MIN = "120px";

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

export function WorkspaceWorkbench({ workspace }: { workspace: Workspace }) {
  // The editor group (VSCode's tab model) owns all tab state + rules — open
  // order, the active-tab-on-close neighbor rule, reopen-closed history, and the
  // picker's preview-tab lifecycle — as a plain, unit-tested class. React is a
  // wire: `useSyncExternalStore` mirrors its snapshot, and the handlers below are
  // one-line calls into it. `active === null` means no tabs open; otherwise it's
  // always one of `tabs`. (Per the `code-react` doctrine: load-bearing UX logic
  // lives where it's testable, not smeared across effects + refs + nested
  // setState updaters.)
  const group = useMemo(() => new EditorGroup(isVirtualTab), []);
  const { tabs: openTabs, active: activeRelPath } = useSyncExternalStore(
    group.subscribe,
    group.getSnapshot,
    group.getSnapshot
  );
  // The active tab can now be the picker's VIRTUAL id (`virtual://…`), which is
  // not a workspace file. The filesystem shortcuts (reveal / copy path / trash)
  // must never be handed that sentinel, so derive a file-only active path they
  // key on — null when the active tab is virtual.
  const activeFileRelPath =
    activeRelPath && !isVirtualTab(activeRelPath) ? activeRelPath : null;
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  // The live `design_search` pick, lifted from the agent pane so the editor
  // pane can host the picker as a virtual tab (the agent pane owns the chat +
  // `addToolResult`; it pushes the session up via `onDesignSearchChange`). null
  // when no pick is pending.
  const [designSearch, setDesignSearch] = useState<DesignSearchSession | null>(
    null
  );
  // File tree pane visibility. VSCode convention: ⌘B / Ctrl+B
  // toggles, and the TitleBar carries the persistent toggle button.
  // Conditional render (not `display: none`) so the resizable-panel
  // group redistributes space cleanly to the EditorPane when the file tree pane
  // is hidden.
  const [showTree, setShowTree] = useState(true);

  // Terminal pane (ctrl+` / TitleBar toggle), VSCode-style. Two facts:
  // `terminalSpawned` — the bottom panel (and its PTY) exists; flips on
  // first open and back off when the shell exits. `terminalOpen` —
  // panel is expanded; derived from the panel's onResize so dragging
  // the handle and the imperative collapse/expand stay in sync without
  // a second source of truth. Collapse keeps the pane mounted (and the
  // shell alive); only unmount kills the PTY.
  // Hidden entirely against older desktop binaries whose bridge
  // predates `terminal` (additive capability on protocol 1).
  const supportsTerminal = bridgeTerminal.isSupported();
  const [terminalSpawned, setTerminalSpawned] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const terminalPanelRef = usePanelRef();

  const toggleTerminal = useCallback(() => {
    if (!terminalSpawned) {
      setTerminalSpawned(true); // mounts expanded at its default size
      return;
    }
    const panel = terminalPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [terminalSpawned, terminalPanelRef]);

  const handleTerminalSessionEnded = useCallback(() => {
    setTerminalSpawned(false);
    setTerminalOpen(false);
  }, []);

  const bumpTreeRefresh = useCallback(() => {
    setTreeRefreshKey((k) => k + 1);
  }, []);

  const toggleTree = useCallback(() => {
    setShowTree((v) => !v);
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
      group.closeMatching((tab) =>
        isDirectory
          ? tab === relPath || tab.startsWith(`${relPath}/`)
          : tab === relPath
      );
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
      if (!activeFileRelPath) return;
      switch (action) {
        case "reveal":
          void revealInFinder(workspace, activeFileRelPath);
          return;
        case "copy-path":
          void copyAbsolutePath(workspace, activeFileRelPath);
          return;
        case "copy-relative-path":
          void copyRelativePath(activeFileRelPath);
          return;
        case "trash":
          // Confirms via a native dialog, then drops the tab + refreshes
          // the tree. If the file tree has focus, it handles this chord
          // first and stops propagation so folders can be targeted by the
          // tree's focused-node selection. This window-level fallback targets
          // the active editor tab only.
          void confirmAndTrashEntry(workspace, activeFileRelPath, false).then(
            (trashed) => {
              if (trashed) handleEntryTrashed(activeFileRelPath, false);
            }
          );
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    toggleTree,
    activeFileRelPath,
    workspace,
    handleEntryTrashed,
    supportsTerminal,
    toggleTerminal,
  ]);

  const openFile = useCallback(
    (relPath: string) => group.open(relPath),
    [group]
  );
  const activateTab = useCallback(
    (relPath: string) => group.activate(relPath),
    [group]
  );
  const closeTab = useCallback(
    (relPath: string) => group.close(relPath),
    [group]
  );
  const reopenClosedTab = useCallback(() => group.reopenClosed(), [group]);

  // Reopen/focus the picker for the current pending pick (the agent-pane note's
  // affordance after a manual close). Only meaningful while a pick is pending.
  const focusDesignSearchTab = useCallback(() => {
    if (designSearch) group.open(DESIGN_SEARCH_TAB_ID);
  }, [group, designSearch]);

  // Wire the lifted pick session into the group's ephemeral (preview) tab: a new
  // pending pick opens + focuses it, resolving it (session → null) closes it. All
  // the rising-edge / neighbor-restore logic lives in EditorGroup (tested); this
  // is a pure wire.
  useEffect(() => {
    group.syncEphemeral(
      DESIGN_SEARCH_TAB_ID,
      designSearch ? pickToolCallId(designSearch.entry) : null
    );
  }, [group, designSearch]);

  return (
    <WorkspaceChangesProvider workspaceId={workspace.id}>
      <div className="flex h-screen w-screen flex-col bg-background">
        {/* The TitleBar exposes back/forward (Chromium history) and
          carries the workspace workbench's own chrome. Workspace-level
          actions sit flush right so they don't compete with the
          back/forward pair that NavButtons pins to the left. */}
        <TitleBar>
          <div className="flex min-w-0 flex-1 items-center overflow-hidden">
            <div className="flex min-w-0 items-center gap-1.5">
              <FolderIcon className="size-3.5 shrink-0 text-sky-500" />
              <span className="truncate font-medium text-foreground">
                {workspace.name}
              </span>
              <span className="truncate font-mono text-muted-foreground">
                {workspace.root}
              </span>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <WorkspaceOpenInMenu workspace={workspace} />
            {supportsTerminal && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                style={TITLEBAR_NO_DRAG_STYLE}
                onClick={toggleTerminal}
                aria-label={
                  terminalOpen ? "Hide terminal pane" : "Show terminal pane"
                }
                aria-pressed={terminalOpen}
                title={
                  terminalOpen
                    ? "Hide terminal pane (⌃`)"
                    : "Show terminal pane (⌃`)"
                }
              >
                <SquareTerminalIcon />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              style={TITLEBAR_NO_DRAG_STYLE}
              onClick={toggleTree}
              aria-label={
                showTree ? "Hide file tree pane" : "Show file tree pane"
              }
              aria-pressed={showTree}
              title={
                showTree
                  ? "Hide file tree pane (⌘B)"
                  : "Show file tree pane (⌘B)"
              }
            >
              {showTree ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
            </Button>
          </div>
        </TitleBar>

        <div className="min-h-0 flex-1">
          {/* Vertical split: the three workbench panes on top, the
            terminal panel at the bottom (VSCode-style). The bottom pair
            mounts on first ctrl+` and stays mounted while collapsed so
            the shell survives toggling; shell exit unmounts it. */}
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel>
              {/* Horizontal is the default orientation in
                react-resizable-panels v4 — omit the prop.
                Order: AgentPane | EditorPane | FileTreePane. Agent-first puts the
                agent pane in the dominant left position; the file tree pane
                sits on the right as a secondary navigator and is
                conditionally rendered so the EditorPane absorbs its
                space when hidden. */}
              <ResizablePanelGroup>
                <ResizablePanel
                  defaultSize={AGENT_PANE_DEFAULT}
                  minSize={AGENT_PANE_MIN}
                >
                  <AgentPane
                    workspace={workspace}
                    activeRelPath={activeRelPath}
                    onMaybeMutated={bumpTreeRefresh}
                    onDesignSearchChange={setDesignSearch}
                    onOpenPicker={focusDesignSearchTab}
                  />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize="57%" minSize={EDITOR_PANE_MIN}>
                  <EditorPane
                    workspace={workspace}
                    openTabs={openTabs}
                    activeRelPath={activeRelPath}
                    onSelectTab={activateTab}
                    onCloseTab={closeTab}
                    onReopenClosedTab={reopenClosedTab}
                    onSaved={bumpTreeRefresh}
                    onFileTrashed={(rp) => handleEntryTrashed(rp, false)}
                    designSearch={designSearch}
                  />
                </ResizablePanel>
                {showTree && (
                  <>
                    <ResizableHandle />
                    <ResizablePanel
                      defaultSize={FILE_TREE_PANE_DEFAULT}
                      minSize={FILE_TREE_PANE_MIN}
                      maxSize={FILE_TREE_PANE_MAX}
                      className="bg-muted/20"
                    >
                      <FileTreePane
                        workspace={workspace}
                        activeRelPath={activeRelPath}
                        onOpenFile={(rp) => {
                          if (rp) openFile(rp);
                        }}
                        refreshKey={treeRefreshKey}
                        onEntryTrashed={handleEntryTrashed}
                      />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>
            {terminalSpawned && (
              <>
                <ResizableHandle />
                <ResizablePanel
                  panelRef={terminalPanelRef}
                  collapsible
                  defaultSize={TERMINAL_PANE_DEFAULT}
                  minSize={TERMINAL_PANE_MIN}
                  onResize={(size) => setTerminalOpen(size.inPixels > 0)}
                >
                  <TerminalPane
                    workspace={workspace}
                    onSessionEnded={handleTerminalSessionEnded}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>
    </WorkspaceChangesProvider>
  );
}

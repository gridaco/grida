/**
 * Workspace editor region: a persistent title bar over the focused document.
 *
 * Open, active, and close state lives in `workspace-workbench.tsx`; this
 * component owns only transient per-tab dirty state for the title bar.
 */
"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ImagesIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { getDesktopBridge, type Workspace } from "@/lib/desktop/bridge";
import { DESKTOP_WINDOW_CONTROLS_RIGHT_INSET } from "@/scaffolds/desktop/chrome/title-bar";
import { EditorPaneTab } from "./editor-pane-tab";
import { EditorPaneDesignSearch } from "./editor-pane-design-search";
import { EditorPaneStart } from "./editor-pane-start";
import { EditorTabPreview } from "./editor-tab-preview";
import { isVirtualTab, type DesignSearchSession } from "./design-search-tab";
import { TabPreviewController } from "./tab-preview-controller";
import type { WorkspaceCanvasCreation } from "./workspace-canvas-creation";
import { useWorkspaceChanges } from "./workspace-changes";
import { WorkspaceFileIcon } from "./workspace-file-icon";
import { WorkspaceTabThumbnail } from "./workspace-tab-thumbnail";
import { FileContextMenu } from "./workbench-file-context-menu";
import {
  isWorkspaceWorkbenchCommand,
  matchWorkspaceWorkbenchKeybinding,
  WORKSPACE_WORKBENCH_COMMAND_EVENT,
  type WorkspaceWorkbenchCommand,
} from "./workspace-workbench-keybindings";

export type EditorPaneProps = {
  workspace: Workspace;
  openTabs: readonly string[];
  activeRelPath: string | null;
  onSelectTab: (relPath: string) => void;
  onCloseTab: (relPath: string) => void;
  onReopenClosedTab: () => void;
  /** Show the workspace-local faux Start tab while the real group is empty. */
  showStart: boolean;
  onOpenFileExplorer: () => void;
  onCreateCanvas: (editor: WorkspaceCanvasCreation.Editor) => Promise<void>;
  treeVisible: boolean;
  onToggleTree: () => void;
  hasBottomPane?: boolean;
  className?: string;
  onSaved?: () => void;
  /** Called after a tab's "Move to Trash" succeeds (drops the tab +
   * refreshes the tree). Same handler the file tree uses. */
  onFileTrashed?: (relPath: string) => void;
  /** The live `design_search` pick, when one is open as the virtual picker tab
   * ({@link DESIGN_SEARCH_TAB_ID}). Lifted from the agent pane; null when no
   * pick is pending. */
  designSearch?: DesignSearchSession | null;
};

export function EditorPane({
  workspace,
  openTabs,
  activeRelPath,
  onSelectTab,
  onCloseTab,
  onReopenClosedTab,
  showStart,
  onOpenFileExplorer,
  onCreateCanvas,
  treeVisible,
  onToggleTree,
  hasBottomPane = false,
  className,
  onSaved,
  onFileTrashed,
  designSearch,
}: EditorPaneProps) {
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(() => new Set());

  const onTabDirtyChange = useCallback((relPath: string, dirty: boolean) => {
    setDirtyPaths((prev) => {
      const had = prev.has(relPath);
      if (had === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(relPath);
      else next.delete(relPath);
      return next;
    });
  }, []);

  const handleClose = useCallback(
    (relPath: string) => {
      if (dirtyPaths.has(relPath)) {
        const name = relPath.split("/").pop() ?? relPath;
        const ok = window.confirm(
          `"${name}" has unsaved changes. Close anyway?`
        );
        if (!ok) return;
      }
      setDirtyPaths((prev) => {
        if (!prev.has(relPath)) return prev;
        const next = new Set(prev);
        next.delete(relPath);
        return next;
      });
      onCloseTab(relPath);
    },
    [dirtyPaths, onCloseTab]
  );

  const dispatchWorkspaceCommand = useCallback(
    (command: WorkspaceWorkbenchCommand) => {
      switch (command) {
        case "workspace.tabs.close-active": {
          if (activeRelPath) {
            handleClose(activeRelPath);
            return;
          }
          void getDesktopBridge()?.window.close();
          return;
        }
        case "workspace.tabs.reopen-closed": {
          onReopenClosedTab();
          return;
        }
        case "workspace.tabs.select-next":
        case "workspace.tabs.select-previous": {
          if (!activeRelPath || openTabs.length < 2) return;
          const idx = openTabs.indexOf(activeRelPath);
          if (idx < 0) return;
          const delta = command === "workspace.tabs.select-next" ? 1 : -1;
          const nextIdx = (idx + delta + openTabs.length) % openTabs.length;
          onSelectTab(openTabs[nextIdx]);
          return;
        }
        default: {
          command satisfies never;
        }
      }
    },
    [activeRelPath, openTabs, onSelectTab, handleClose, onReopenClosedTab]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const command = matchWorkspaceWorkbenchKeybinding(event);
      if (!command) return;
      event.preventDefault();
      dispatchWorkspaceCommand(command);
    }

    function onWorkbenchCommand(event: Event) {
      const command = (event as CustomEvent<unknown>).detail;
      if (!isWorkspaceWorkbenchCommand(command)) return;
      dispatchWorkspaceCommand(command);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(
      WORKSPACE_WORKBENCH_COMMAND_EVENT,
      onWorkbenchCommand
    );
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(
        WORKSPACE_WORKBENCH_COMMAND_EVENT,
        onWorkbenchCommand
      );
    };
  }, [dispatchWorkspaceCommand]);

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <EditorTitleBar
        workspace={workspace}
        tabs={openTabs}
        activeRelPath={activeRelPath}
        dirtyPaths={dirtyPaths}
        onSelect={onSelectTab}
        onClose={handleClose}
        showStart={showStart}
        treeVisible={treeVisible}
        onToggleTree={onToggleTree}
        onFileTrashed={onFileTrashed}
      />
      <div className="min-h-0 flex-1">
        {(showStart || openTabs.length > 0) && (
          /* The resizable ancestors allow decorative overflow, while this
             surface remains clipped so only its shadow escapes. */
          <div
            className={cn(
              "h-full min-h-0 pl-1.5 pr-3",
              hasBottomPane ? "pb-1.5" : "pb-3"
            )}
          >
            <div className="relative h-full overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-8px_rgb(0_0_0/0.12)]">
              {showStart ? (
                <EditorPaneStart
                  onOpenFileExplorer={onOpenFileExplorer}
                  onCreateCanvas={onCreateCanvas}
                />
              ) : (
                openTabs.map((relPath) => {
                  // A virtual tab has no file body — render its bespoke
                  // surface, kept mounted-but-hidden when inactive like a file
                  // tab so its fetched results survive a tab switch.
                  if (isVirtualTab(relPath)) {
                    const active = relPath === activeRelPath;
                    return (
                      <div
                        key={`${workspace.id}:${relPath}`}
                        className={cn(
                          "absolute inset-0",
                          !active && "invisible pointer-events-none"
                        )}
                        aria-hidden={!active}
                      >
                        {designSearch ? (
                          <EditorPaneDesignSearch session={designSearch} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                            No references to pick.
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <EditorPaneTab
                      key={`${workspace.id}:${relPath}`}
                      workspaceId={workspace.id}
                      relPath={relPath}
                      active={relPath === activeRelPath}
                      onDirtyChange={onTabDirtyChange}
                      onSaved={onSaved}
                    />
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditorTitleBar({
  workspace,
  tabs,
  activeRelPath,
  dirtyPaths,
  onSelect,
  onClose,
  showStart,
  treeVisible,
  onToggleTree,
  onFileTrashed,
}: {
  workspace: Workspace;
  tabs: readonly string[];
  activeRelPath: string | null;
  dirtyPaths: Set<string>;
  onSelect: (relPath: string) => void;
  onClose: (relPath: string) => void;
  showStart: boolean;
  treeVisible: boolean;
  onToggleTree: () => void;
  onFileTrashed?: (relPath: string) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [previewController] = useState(() => new TabPreviewController());
  const [thumbnailCache] = useState(() => new WorkspaceTabThumbnail.Cache());
  const [previewRevision, setPreviewRevision] = useState(0);

  useEffect(() => {
    previewController.reconcile(
      tabs.filter((relPath) => !isVirtualTab(relPath))
    );
  }, [previewController, tabs]);

  useEffect(() => {
    const dismiss = () => previewController.dismiss();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    const onVisibilityChange = () => {
      if (document.hidden) dismiss();
    };

    window.addEventListener("blur", dismiss);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Effects are deliberately replayed in React development. Cancel live
      // work without terminally disposing the state object that the replay
      // reuses.
      previewController.dismiss();
      thumbnailCache.clear();
    };
  }, [previewController, thumbnailCache]);

  useWorkspaceChanges((events) => {
    for (const event of events) {
      thumbnailCache.invalidateChangedPath(workspace.id, event.rel_path);
    }
    if (
      events.some((event) =>
        previewController.matchesChangedPath(event.rel_path)
      )
    ) {
      setPreviewRevision((value) => value + 1);
    }
  });

  return (
    <div
      className="desktop-drag-area relative flex h-11 shrink-0 items-center"
      style={{
        // While the file tree is closed, this is the rightmost title bar and
        // must keep its toggle/tabs out from under Windows/Linux controls. When
        // the tree opens, its own title bar becomes the rightmost owner.
        paddingRight: treeVisible
          ? undefined
          : DESKTOP_WINDOW_CONTROLS_RIGHT_INSET,
      }}
    >
      <div
        ref={railRef}
        role="tablist"
        aria-label="Open editors"
        className="desktop-no-drag scroll-fade-x scroll-fade-3 no-scrollbar flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pl-1.5 pr-2 scroll-pl-1.5 scroll-pr-2"
        onPointerLeave={(event) =>
          previewController.railLeave(event.pointerType)
        }
      >
        {showStart && <StartTabItem />}
        {tabs.map((relPath) => {
          const virtual = isVirtualTab(relPath);
          return (
            <TabItem
              key={relPath}
              workspace={workspace}
              relPath={relPath}
              virtual={virtual}
              label={virtual ? "Pick references" : undefined}
              active={relPath === activeRelPath}
              dirty={dirtyPaths.has(relPath)}
              icon={
                virtual ? (
                  <ImagesIcon className="size-3.5 shrink-0" />
                ) : (
                  <WorkspaceFileIcon
                    relPath={relPath}
                    className="size-3.5 shrink-0"
                  />
                )
              }
              onSelect={() => onSelect(relPath)}
              onClose={() => onClose(relPath)}
              onTrashed={
                onFileTrashed && !virtual
                  ? () => onFileTrashed(relPath)
                  : undefined
              }
              previewController={previewController}
            />
          );
        })}
        {/* Keep unused title-bar space draggable without turning the gaps
            between scrollable tabs back into Electron drag regions. */}
        <div
          role="presentation"
          className="desktop-drag-area h-full min-w-0 flex-1"
        />
      </div>
      <EditorTabPreview
        controller={previewController}
        railRef={railRef}
        workspaceId={workspace.id}
        dirtyPaths={dirtyPaths}
        revision={previewRevision}
        thumbnailCache={thumbnailCache}
      />
      {!treeVisible && (
        <WorkspaceExplorerToggleButton
          open={false}
          onToggle={onToggleTree}
          className="mr-3"
        />
      )}
    </div>
  );
}

function StartTabItem() {
  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected
      className="desktop-no-drag flex h-6 shrink-0 select-none items-center rounded-md bg-muted px-2 text-xs text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      Quick Start
    </div>
  );
}

export function WorkspaceExplorerToggleButton({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("desktop-no-drag shrink-0", className)}
      onClick={onToggle}
      aria-label={open ? "Hide file tree pane" : "Show file tree pane"}
      aria-pressed={open}
      title={open ? "Hide file tree pane (⌘B)" : "Show file tree pane (⌘B)"}
    >
      {open ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
    </Button>
  );
}

function TabItem({
  workspace,
  relPath,
  virtual,
  label,
  active,
  dirty,
  icon,
  onSelect,
  onClose,
  onTrashed,
  previewController,
}: {
  workspace: Workspace;
  relPath: string;
  /** A non-file tab (e.g. the design-search picker): no filename label, no file
   *  context menu. */
  virtual?: boolean;
  /** Display label override (for virtual tabs that aren't a file path). */
  label?: string;
  active: boolean;
  dirty: boolean;
  icon?: ReactNode;
  onSelect: () => void;
  onClose: () => void;
  onTrashed?: () => void;
  previewController: TabPreviewController;
}) {
  const tabRef = useRef<HTMLDivElement | null>(null);
  const name = label ?? relPath.split("/").pop() ?? relPath;

  useEffect(() => {
    if (!active) return;
    tabRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [active]);

  const tab = (
    <div
      ref={tabRef}
      role="tab"
      tabIndex={0}
      aria-selected={active}
      title={virtual ? name : undefined}
      onPointerEnter={(event) => {
        if (!virtual) {
          previewController.pointerEnter(
            { relPath, anchor: event.currentTarget },
            event.pointerType
          );
        }
      }}
      onPointerLeave={(event) => {
        if (!virtual) {
          previewController.pointerLeave(relPath, event.pointerType);
        }
      }}
      onClick={() => {
        previewController.dismiss();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          previewController.dismiss();
          onSelect();
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          previewController.dismiss();
          onClose();
        }
      }}
      className={cn(
        "desktop-no-drag group flex h-6 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors",
        active
          ? "bg-muted text-foreground shadow-xs"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      )}
    >
      {icon}
      <span className="max-w-[180px] truncate">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          previewController.dismiss();
          onClose();
        }}
        className={cn(
          "desktop-no-drag ml-1 grid size-4 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
          active || dirty ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        aria-label={dirty ? `Close ${name} (unsaved)` : `Close ${name}`}
      >
        {dirty ? (
          <>
            <span
              className="size-1.5 rounded-full bg-amber-500 group-hover:hidden"
              aria-hidden
            />
            <XIcon className="hidden size-3 group-hover:block" />
          </>
        ) : (
          <XIcon className="size-3" />
        )}
      </button>
    </div>
  );

  // A virtual tab isn't a real file — no Reveal/Copy-path/Trash menu.
  if (virtual) return tab;
  return (
    <FileContextMenu
      workspace={workspace}
      relPath={relPath}
      onTrashed={onTrashed}
      onOpenChange={(open) => {
        if (open) previewController.dismiss();
      }}
    >
      {tab}
    </FileContextMenu>
  );
}

/**
 * Workspace editor region: a persistent title bar over the focused tab.
 *
 * Open, active, close, and dirty state lives in `workspace-workbench.tsx`. Tabs
 * are keyed through `WorkbenchTab`: a file tab shows its viewer and file
 * menu; a panel tab shows the content its owner placed in `WorkbenchPanels`.
 */
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Loader2Icon,
  PanelBottomIcon,
  PanelRightIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { Toggle } from "@app/ui/components/toggle";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@app/ui/components/context-menu";
import { Kbd } from "@app/ui/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import { cn } from "@app/ui/lib/utils";
import { getDesktopBridge, type Workspace } from "@/lib/desktop/bridge";
import { DESKTOP_WINDOW_CONTROLS_RIGHT_INSET } from "@/scaffolds/desktop/chrome/title-bar";
import { EditorPaneTab, type EditorPaneTabProps } from "./editor-pane-tab";
import { EditorPaneStart } from "./editor-pane-start";
import { BrowserPane } from "./browser-pane";
import { BrowserTabIcon } from "./browser-tab-icon";
import type { WorkspaceBrowserTabs } from "./workspace-browser-tabs";
import { EditorTabPreview } from "./editor-tab-preview";
import { TabNativeDragRegion } from "./tab-native-drag-region";
import { TabPreviewController } from "./tab-preview-controller";
import type { WorkspaceCanvasCreation } from "./workspace-canvas-creation";
import { useWorkspaceChanges } from "./workspace-changes";
import { WorkspaceFileIcon } from "./workspace-file-icon";
import { WorkspaceTabThumbnail } from "./workspace-tab-thumbnail";
import { WorkbenchTab } from "./workbench-tab";
import { PanelTabContent } from "./workbench-panel-content";
import { WorkbenchPanelTab } from "./workbench-panel-tab";
import type { WorkbenchPanel, WorkbenchPanels } from "./workbench-panels";
import { FileContextMenu } from "./workbench-file-context-menu";
import {
  isWorkspaceWorkbenchCommand,
  matchWorkspaceWorkbenchKeybinding,
  WORKSPACE_WORKBENCH_COMMAND_EVENT,
  type WorkspaceWorkbenchCommand,
} from "./workspace-workbench-keybindings";

const START_PANEL_ID = "quick-start";
const TAB_MOVE_SHORTCUTS = "Alt+Shift+ArrowLeft Alt+Shift+ArrowRight";

export type EditorPaneProps = {
  workspace: Workspace;
  surfaceHost?: EditorPaneTabProps["surfaceHost"];
  /** Content of the open panel tabs. */
  panels: WorkbenchPanels;
  browsers?: WorkspaceBrowserTabs;
  /** Tab keys (`WorkbenchTab`) in strip order. */
  openTabs: readonly string[];
  activeTab: string | null;
  dirtyPaths: ReadonlySet<string>;
  /** Files with live references in other chat views in this workspace window. */
  retainedFilePaths?: ReadonlySet<string>;
  onTabDirtyChange: (relPath: string, dirty: boolean) => void;
  onSelectTab: (tab: string) => void;
  onMoveTab: (tab: string, target: string) => void;
  onCloseTab: (tab: string) => void | Promise<boolean>;
  onReopenClosedTab: () => void;
  /** Show the workspace-local faux Start tab while the real group is empty. */
  showStart: boolean;
  onOpenFileExplorer: () => void;
  onCreateCanvas: (
    editor: WorkspaceCanvasCreation.Editor,
    replaceTab?: string
  ) => Promise<void>;
  treeVisible: boolean;
  onToggleTree: () => void;
  hasBottomPane?: boolean;
  utilitiesVisible?: boolean;
  onToggleUtilities?: () => void;
  className?: string;
  onSaved?: () => void;
  /** Called after a tab's "Move to Trash" succeeds (drops the tab +
   * refreshes the tree). Same handler the file tree uses. */
  onFileTrashed?: (relPath: string) => void;
};

export function EditorPane({
  workspace,
  surfaceHost,
  panels,
  browsers,
  openTabs,
  activeTab,
  dirtyPaths,
  retainedFilePaths,
  onTabDirtyChange,
  onSelectTab,
  onMoveTab,
  onCloseTab,
  onReopenClosedTab,
  showStart,
  onOpenFileExplorer,
  onCreateCanvas,
  treeVisible,
  onToggleTree,
  hasBottomPane = false,
  utilitiesVisible = false,
  onToggleUtilities,
  className,
  onSaved,
  onFileTrashed,
}: EditorPaneProps) {
  const browserState = useSyncExternalStore(
    browsers?.subscribe ?? noBrowserSubscription,
    browsers?.getSnapshot ?? emptyBrowserSnapshot,
    browsers?.getSnapshot ?? emptyBrowserSnapshot
  );
  const handleOpenStart = useCallback(() => {
    if (showStart) return;
    panels.show(
      START_PANEL_ID,
      {
        title: "Quick Start",
        content: (
          <StartTabContent
            browsers={browsers}
            replaceTab={WorkbenchTab.panel(START_PANEL_ID)}
            onOpenFileExplorer={onOpenFileExplorer}
            onCreateCanvas={onCreateCanvas}
          />
        ),
      },
      () => {}
    );
    panels.reveal(START_PANEL_ID);
  }, [showStart, panels, browsers, onOpenFileExplorer, onCreateCanvas]);
  const handleCloseOthers = useCallback(
    async (keep: string) => {
      for (const tab of openTabs) if (tab !== keep) await onCloseTab(tab);
    },
    [openTabs, onCloseTab]
  );
  const shownPanels = useSyncExternalStore(
    panels.subscribe,
    panels.getSnapshot,
    panels.getSnapshot
  );

  const dispatchWorkspaceCommand = useCallback(
    (command: WorkspaceWorkbenchCommand) => {
      switch (command) {
        case "workspace.tabs.close-active": {
          if (activeTab) {
            void onCloseTab(activeTab);
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
          if (!activeTab || openTabs.length < 2) return;
          const idx = openTabs.indexOf(activeTab);
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
    [activeTab, openTabs, onSelectTab, onCloseTab, onReopenClosedTab]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.isComposing
      ) {
        const action =
          event.key === "+" || event.key === "="
            ? "zoom-in"
            : event.key === "-"
              ? "zoom-out"
              : event.key === "0"
                ? "zoom-reset"
                : !event.shiftKey && event.key.toLowerCase() === "p"
                  ? "print"
                  : null;
        if (action && browsers?.commandActive(action)) {
          event.preventDefault();
          return;
        }
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (
          event.key.toLowerCase() === "f" &&
          !event.isComposing &&
          activeTab &&
          WorkbenchTab.parse(activeTab).kind === "browser" &&
          browsers?.findActive()
        ) {
          event.preventDefault();
          return;
        }
        if (event.key.toLowerCase() === "t") {
          event.preventDefault();
          handleOpenStart();
          return;
        }
        if (
          event.key.toLowerCase() === "l" &&
          activeTab &&
          WorkbenchTab.parse(activeTab).kind === "browser"
        ) {
          event.preventDefault();
          browsers?.focusLocation();
          return;
        }
      }
      const command = matchWorkspaceWorkbenchKeybinding(event);
      if (!command) return;
      event.preventDefault();
      dispatchWorkspaceCommand(command);
    }

    function onWorkbenchCommand(event: Event) {
      const command = (event as CustomEvent<unknown>).detail;
      if (
        command === "workspace.tabs.new" ||
        // Older native menus forward the former browser-specific command.
        command === "workspace.browser.new"
      ) {
        handleOpenStart();
        return;
      }
      if (command === "workspace.browser.find") {
        browsers?.findActive();
        return;
      }
      if (command === "workspace.browser.focus-location") {
        browsers?.focusLocation();
        return;
      }
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
  }, [dispatchWorkspaceCommand, handleOpenStart, browsers, activeTab]);

  // The workspace owns unsaved buffers. Keep them mounted at the same keys
  // even when the selected chat's tab group has no reference to them.
  const mountedTabs = new Set(openTabs);
  if (retainedFilePaths)
    for (const path of retainedFilePaths)
      mountedTabs.add(WorkbenchTab.file(path));
  for (const path of dirtyPaths) mountedTabs.add(WorkbenchTab.file(path));
  const showContent = showStart || openTabs.length > 0;

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <EditorTitleBar
        workspace={workspace}
        tabs={openTabs}
        panels={shownPanels}
        browserEntries={browserState.entries}
        browsers={browsers}
        onOpenStart={handleOpenStart}
        activeTab={activeTab}
        dirtyPaths={dirtyPaths}
        onSelect={onSelectTab}
        onMove={onMoveTab}
        onClose={onCloseTab}
        onCloseOthers={handleCloseOthers}
        showStart={showStart}
        treeVisible={treeVisible}
        onToggleTree={onToggleTree}
        utilitiesVisible={utilitiesVisible}
        onToggleUtilities={onToggleUtilities}
        onFileTrashed={onFileTrashed}
      />
      <div className="min-h-0 flex-1">
        {(showStart || mountedTabs.size > 0) && (
          /* The resizable ancestors allow decorative overflow, while this
             surface remains clipped so only its shadow escapes. */
          <div
            className={cn(
              "h-full min-h-0 pr-3",
              hasBottomPane ? "pb-1.5" : "pb-3",
              !showContent && "invisible"
            )}
          >
            <div
              tabIndex={-1}
              className="grida-content-frame relative h-full overflow-hidden border-border bg-background shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-8px_rgb(0_0_0/0.12)]"
            >
              {showStart && (
                <StartTabContent
                  browsers={browsers}
                  onOpenFileExplorer={onOpenFileExplorer}
                  onCreateCanvas={onCreateCanvas}
                />
              )}
              {Array.from(mountedTabs, (tab) => {
                const target = WorkbenchTab.parse(tab);
                return target.kind === "file" ? (
                  <EditorPaneTab
                    key={`${workspace.id}:${tab}`}
                    workspace={workspace}
                    surfaceHost={surfaceHost}
                    relPath={target.relPath}
                    active={tab === activeTab}
                    onDirtyChange={onTabDirtyChange}
                    onSaved={onSaved}
                  />
                ) : target.kind === "browser" ? (
                  browsers && browserState.entries.get(target.id) ? (
                    <BrowserPane
                      key={tab}
                      tabs={browsers}
                      entry={browserState.entries.get(target.id)!}
                      active={tab === activeTab}
                    />
                  ) : null
                ) : (
                  <PanelTabContent
                    key={tab}
                    panel={shownPanels.get(target.id)}
                    active={tab === activeTab}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Shared by the empty workspace and the reusable Quick Start panel tab. */
function StartTabContent({
  browsers,
  replaceTab,
  onOpenFileExplorer,
  onCreateCanvas,
}: Pick<
  EditorPaneProps,
  "browsers" | "onOpenFileExplorer" | "onCreateCanvas"
> & { replaceTab?: string }) {
  const browserState = useSyncExternalStore(
    browsers?.subscribe ?? noBrowserSubscription,
    browsers?.getSnapshot ?? emptyBrowserSnapshot,
    browsers?.getSnapshot ?? emptyBrowserSnapshot
  );
  return (
    <div className="flex h-full flex-col">
      {browserState.error && (
        <p role="alert" className="px-6 pt-4 text-xs text-muted-foreground">
          {browserState.error}
        </p>
      )}
      <EditorPaneStart
        onOpenFileExplorer={onOpenFileExplorer}
        onCreateCanvas={(editor) => onCreateCanvas(editor, replaceTab)}
        onOpenBrowser={
          browserState.supported && browserState.ready && !browserState.error
            ? () => browsers?.open(undefined, replaceTab)
            : undefined
        }
      />
    </div>
  );
}

export function EditorTitleBar({
  workspace,
  tabs,
  panels,
  browserEntries,
  browsers,
  onOpenStart,
  activeTab,
  dirtyPaths,
  onSelect,
  onMove,
  onClose,
  onCloseOthers,
  showStart,
  treeVisible = false,
  onToggleTree,
  utilitiesVisible,
  onToggleUtilities,
  onFileTrashed,
}: {
  workspace: Workspace;
  tabs: readonly string[];
  panels: ReadonlyMap<string, WorkbenchPanel>;
  browserEntries: ReadonlyMap<string, WorkspaceBrowserTabs.Entry>;
  browsers?: WorkspaceBrowserTabs;
  onOpenStart: () => void;
  activeTab: string | null;
  dirtyPaths: ReadonlySet<string>;
  onSelect: (tab: string) => void;
  onMove: (tab: string, target: string) => void;
  onClose: (tab: string) => void;
  onCloseOthers: (keep: string) => Promise<void>;
  showStart: boolean;
  treeVisible?: boolean;
  onToggleTree?: () => void;
  utilitiesVisible: boolean;
  onToggleUtilities?: () => void;
  onFileTrashed?: (relPath: string) => void;
}) {
  const onlyQuickStart =
    (showStart && tabs.length === 0) ||
    (!showStart &&
      tabs.length === 1 &&
      tabs[0] === WorkbenchTab.panel(START_PANEL_ID));
  const railRef = useRef<HTMLDivElement | null>(null);
  const nativeDragExclusionLayerRef = useRef<HTMLDivElement | null>(null);
  const [previewController] = useState(() => new TabPreviewController());
  const [thumbnailCache] = useState(() => new WorkspaceTabThumbnail.Cache());
  const [previewRevision, setPreviewRevision] = useState(0);
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: { x: 5 } },
    onActivation: ({ event }) => {
      // Capture on the original hit element so a plain click keeps its target.
      if (event instanceof PointerEvent && event.target instanceof Element)
        event.target.setPointerCapture(event.pointerId);
    },
  });

  useEffect(() => {
    // Files have semantic thumbnails; a panel may supply informational content.
    previewController.reconcile(
      tabs.filter((tab) => {
        const target = WorkbenchTab.parse(tab);
        return (
          target.kind === "file" ||
          (target.kind === "browser" && browserEntries.has(target.id)) ||
          (target.kind === "panel" && !!panels.get(target.id)?.preview)
        );
      })
    );
  }, [previewController, tabs, panels, browserEntries]);

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

  useLayoutEffect(() => {
    const rail = railRef.current;
    const exclusionLayer = nativeDragExclusionLayerRef.current;
    if (!rail || !exclusionLayer) return;

    const controller = new TabNativeDragRegion.Controller(rail, exclusionLayer);
    controller.connect();
    return () => controller.dispose();
  }, [showStart, tabs]);

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
      <DndContext
        sensors={[pointerSensor]}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        autoScroll={{ canScroll: (element) => element === railRef.current }}
        onDragStart={() => previewController.dismiss()}
        onDragEnd={({ active, over }) => {
          if (over) onMove(String(active.id), String(over.id));
        }}
      >
        <div
          ref={railRef}
          role="tablist"
          aria-label="Open editors"
          className="desktop-native-drag-scroll-viewport scroll-fade-x scroll-fade-3 no-scrollbar flex h-full min-w-0 flex-initial items-center overflow-x-auto overscroll-x-contain pr-2 scroll-pr-2"
          onPointerLeave={(event) =>
            previewController.railLeave(event.pointerType)
          }
        >
          {/* Translated tabs must not extend the rail's scroll range. */}
          <div
            role="presentation"
            className="flex h-full shrink-0 items-center gap-1 overflow-clip"
          >
            {showStart && <StartTabItem />}
            <SortableContext
              items={[...tabs]}
              strategy={horizontalListSortingStrategy}
            >
              {tabs.map((tab) => {
                const target = WorkbenchTab.parse(tab);
                const item =
                  target.kind === "file" ? (
                    <TabItem
                      workspace={workspace}
                      tabKey={tab}
                      relPath={target.relPath}
                      active={tab === activeTab}
                      dirty={dirtyPaths.has(target.relPath)}
                      onSelect={() => onSelect(tab)}
                      onClose={() => onClose(tab)}
                      onTrashed={
                        onFileTrashed
                          ? () => onFileTrashed(target.relPath)
                          : undefined
                      }
                      previewController={previewController}
                    />
                  ) : target.kind === "browser" ? (
                    <BrowserTabItem
                      tabKey={tab}
                      onCloseOthers={() => {
                        previewController.dismiss();
                        void onCloseOthers(tab);
                      }}
                      entry={browserEntries.get(target.id)}
                      previewController={previewController}
                      active={tab === activeTab}
                      onSelect={() => {
                        previewController.dismiss();
                        onSelect(tab);
                      }}
                      onClose={() => {
                        previewController.dismiss();
                        onClose(tab);
                      }}
                    />
                  ) : (
                    <PanelTabItem
                      tabKey={tab}
                      panel={panels.get(target.id)}
                      previewController={previewController}
                      active={tab === activeTab}
                      onSelect={() => {
                        previewController.dismiss();
                        onSelect(tab);
                      }}
                      onClose={() => {
                        previewController.dismiss();
                        onClose(tab);
                      }}
                    />
                  );
                return (
                  <SortableEditorTab
                    key={tab}
                    id={tab}
                    disabled={tabs.length < 2}
                    onMove={onMove}
                  >
                    {item}
                  </SortableEditorTab>
                );
              })}
            </SortableContext>
          </div>
        </div>
      </DndContext>
      {!onlyQuickStart && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="New tab"
                onClick={onOpenStart}
                className="desktop-no-drag mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PlusIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={6}
              className="flex items-center gap-2"
            >
              New tab <Kbd>⌘T</Kbd>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {/* Let the rail shrink on overflow while keeping + visible. Unused
          title-bar space belongs after + and remains natively draggable. */}
      <div role="presentation" className="h-full min-w-0 flex-1" />
      {/* Chromium does not clip native app-region boxes to scrollports. Keep
          moving tab descendants region-free and mirror their visible interaction
          run (tabs plus following gaps) here. This layer is stationary and
          pointer-transparent.
          (see test/desktop-workbench-scrolled-tab-drag-region.md) */}
      <div
        ref={nativeDragExclusionLayerRef}
        className="pointer-events-none absolute inset-0"
        aria-hidden
      >
        {showStart && (
          <div
            data-tab-native-drag-region-exclusion="start"
            className="desktop-no-drag absolute"
            style={{ display: "none" }}
          />
        )}
        {tabs.map((tab) => (
          <div
            key={tab}
            data-tab-native-drag-region-exclusion={tab}
            className="desktop-no-drag absolute"
            style={{ display: "none" }}
          />
        ))}
      </div>
      <EditorTabPreview
        controller={previewController}
        railRef={railRef}
        workspaceId={workspace.id}
        dirtyPaths={dirtyPaths}
        revision={previewRevision}
        thumbnailCache={thumbnailCache}
        panels={panels}
        browsers={browsers}
        browserEntries={browserEntries}
      />
      {onToggleUtilities && (
        <Toggle
          type="button"
          size="sm"
          pressed={utilitiesVisible}
          className="desktop-no-drag mr-1 size-7 min-w-7 shrink-0 p-0 [&_svg:not([class*='size-'])]:size-3.5"
          onPressedChange={onToggleUtilities}
          aria-label={
            utilitiesVisible
              ? "Hide workspace utilities"
              : "Show workspace utilities"
          }
          title={
            utilitiesVisible
              ? "Hide workspace utilities"
              : "Show workspace utilities"
          }
        >
          <PanelBottomIcon
            className={cn(
              !utilitiesVisible && "fill-muted text-muted-foreground"
            )}
          />
        </Toggle>
      )}
      {onToggleTree && !treeVisible && (
        <WorkspaceExplorerToggleButton
          open={false}
          onToggle={onToggleTree}
          className="mr-3"
        />
      )}
    </div>
  );
}

function SortableEditorTab({
  id,
  disabled,
  onMove,
  children,
}: {
  id: string;
  disabled: boolean;
  onMove: (tab: string, target: string) => void;
  children: ReactNode;
}) {
  const {
    setNodeRef,
    listeners,
    items,
    index,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  // Keep the native no-drag geometry in place while the tab itself moves.
  return (
    <div
      ref={setNodeRef}
      role="presentation"
      data-tab-native-drag-region-target={id}
      className={cn(
        "relative shrink-0",
        !disabled && "touch-pan-y",
        isDragging && "z-10"
      )}
      onPointerDown={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          event.currentTarget.contains(target) &&
          !target.closest("button")
        ) {
          listeners?.onPointerDown?.(event);
        }
      }}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          !event.altKey ||
          !event.shiftKey ||
          event.metaKey ||
          event.ctrlKey ||
          !(event.target instanceof Element) ||
          event.target.getAttribute("role") !== "tab" ||
          (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
        )
          return;

        const target = items[index + (event.key === "ArrowLeft" ? -1 : 1)];
        if (typeof target !== "string") return;
        event.preventDefault();
        onMove(id, target);
      }}
    >
      <div
        className={cn(
          "motion-reduce:transition-none!",
          isDragging && "rounded-md bg-background shadow-sm"
        )}
        style={{ transform: CSS.Translate.toString(transform), transition }}
      >
        {children}
      </div>
    </div>
  );
}

function StartTabItem() {
  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected
      data-tab-native-drag-region-target="start"
      className="flex h-7 shrink-0 select-none items-center rounded-md bg-muted px-2 text-xs text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
    <Toggle
      type="button"
      size="sm"
      pressed={open}
      className={cn(
        "desktop-no-drag size-7 min-w-7 shrink-0 p-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      onPressedChange={onToggle}
      aria-label={open ? "Hide file tree pane" : "Show file tree pane"}
      title={open ? "Hide file tree pane (⌘B)" : "Show file tree pane (⌘B)"}
    >
      <PanelRightIcon
        className={cn(!open && "fill-muted text-muted-foreground")}
      />
    </Toggle>
  );
}

function TabItem({
  workspace,
  tabKey,
  relPath,
  active,
  dirty,
  onSelect,
  onClose,
  onTrashed,
  previewController,
}: {
  workspace: Workspace;
  tabKey: string;
  relPath: string;
  active: boolean;
  dirty: boolean;
  onSelect: () => void;
  onClose: () => void;
  onTrashed?: () => void;
  previewController: TabPreviewController;
}) {
  const tabRef = useRef<HTMLDivElement | null>(null);
  const name = relPath.split("/").pop() ?? relPath;

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
      aria-keyshortcuts={TAB_MOVE_SHORTCUTS}
      onPointerEnter={(event) =>
        previewController.pointerEnter(
          { tabKey, anchor: event.currentTarget },
          event.pointerType
        )
      }
      onPointerLeave={(event) =>
        previewController.pointerLeave(tabKey, event.pointerType)
      }
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
        "group flex h-7 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors",
        active
          ? "bg-muted text-foreground shadow-xs"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      )}
    >
      <WorkspaceFileIcon relPath={relPath} className="size-3.5 shrink-0" />
      <span className="max-w-[180px] truncate">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          previewController.dismiss();
          onClose();
        }}
        className={cn(
          "ml-1 grid size-4 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
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

/** A panel's strip tab, with its owner's optional informational preview. */
function PanelTabItem({
  tabKey,
  panel,
  active,
  onSelect,
  onClose,
  previewController,
}: {
  tabKey: string;
  panel: WorkbenchPanel | undefined;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  previewController: TabPreviewController;
}) {
  const tabRef = useRef<HTMLDivElement | null>(null);
  const title = panel?.title ?? "";

  useEffect(() => {
    if (!active) return;
    tabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <WorkbenchPanelTab
      ref={tabRef}
      title={title}
      icon={panel?.icon}
      active={active}
      onSelect={onSelect}
      onClose={onClose}
      aria-keyshortcuts={TAB_MOVE_SHORTCUTS}
      onPointerEnter={(event) => {
        if (panel?.preview)
          previewController.pointerEnter(
            { tabKey, anchor: event.currentTarget },
            event.pointerType
          );
        else previewController.dismiss();
      }}
      onPointerLeave={(event) =>
        previewController.pointerLeave(tabKey, event.pointerType)
      }
    />
  );
}

const emptyBrowsers: WorkspaceBrowserTabs.State = {
  supported: false,
  ready: false,
  entries: new Map(),
  error: null,
};
const emptyBrowserSnapshot = () => emptyBrowsers;
const noBrowserSubscription = () => () => {};

function BrowserTabItem({
  tabKey,
  onCloseOthers,
  entry,
  active,
  onSelect,
  onClose,
  previewController,
}: {
  tabKey: string;
  entry?: WorkspaceBrowserTabs.Entry;
  active: boolean;
  onSelect(): void;
  onClose(): void;
  onCloseOthers(): void;
  previewController: TabPreviewController;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active)
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  let title = entry?.page?.title;
  if (!title && entry?.url) {
    try {
      title = new URL(entry.url).host;
    } catch {}
  }
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) previewController.dismiss();
      }}
    >
      <ContextMenuTrigger asChild>
        <WorkbenchPanelTab
          ref={ref}
          aria-keyshortcuts={TAB_MOVE_SHORTCUTS}
          title={title || "Browser"}
          icon={
            entry?.page?.loading ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <BrowserTabIcon favicon={entry?.favicon} />
            )
          }
          active={active}
          onSelect={onSelect}
          onClose={onClose}
          onPointerEnter={(event) =>
            previewController.pointerEnter(
              { tabKey, anchor: event.currentTarget },
              event.pointerType
            )
          }
          onPointerLeave={(event) =>
            previewController.pointerLeave(tabKey, event.pointerType)
          }
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onClose}>Close tab</ContextMenuItem>
        <ContextMenuItem onSelect={onCloseOthers}>
          Close other tabs
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

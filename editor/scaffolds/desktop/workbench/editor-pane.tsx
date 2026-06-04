/**
 * Workspace editor pane: a VSCode-style tab strip over mounted file tabs.
 *
 * Open, active, and close state lives in `workspace-workbench.tsx`; this
 * component owns only transient per-tab dirty state for the tab strip.
 */
"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FileIcon, XIcon } from "lucide-react";
import { cn } from "@/components/lib/utils/index";
import { getDesktopBridge, type Workspace } from "@/lib/desktop/bridge";
import { EditorPaneTab } from "./editor-pane-tab";
import { FileContextMenu } from "./workbench-file-context-menu";
import {
  isWorkspaceWorkbenchCommand,
  matchWorkspaceWorkbenchKeybinding,
  WORKSPACE_WORKBENCH_COMMAND_EVENT,
  type WorkspaceWorkbenchCommand,
} from "./workspace-workbench-keybindings";

export type EditorPaneProps = {
  workspace: Workspace;
  openTabs: string[];
  activeRelPath: string | null;
  onSelectTab: (relPath: string) => void;
  onCloseTab: (relPath: string) => void;
  onReopenClosedTab: () => void;
  className?: string;
  onSaved?: () => void;
  /** Called after a tab's "Move to Trash" succeeds (drops the tab +
   * refreshes the tree). Same handler the file tree uses. */
  onFileTrashed?: (relPath: string) => void;
};

export function EditorPane({
  workspace,
  openTabs,
  activeRelPath,
  onSelectTab,
  onCloseTab,
  onReopenClosedTab,
  className,
  onSaved,
  onFileTrashed,
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

  if (openTabs.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground",
          className
        )}
      >
        Pick a file from the file tree pane to open it as a tab.
      </div>
    );
  }

  return (
    <div className={cn("flex h-full w-full flex-col bg-background", className)}>
      <TabStrip
        workspace={workspace}
        tabs={openTabs}
        activeRelPath={activeRelPath}
        dirtyPaths={dirtyPaths}
        onSelect={onSelectTab}
        onClose={handleClose}
        onFileTrashed={onFileTrashed}
      />
      <div className="relative min-h-0 flex-1">
        {openTabs.map((relPath) => (
          <EditorPaneTab
            key={`${workspace.id}:${relPath}`}
            workspaceId={workspace.id}
            relPath={relPath}
            active={relPath === activeRelPath}
            onDirtyChange={onTabDirtyChange}
            onSaved={onSaved}
          />
        ))}
      </div>
    </div>
  );
}

function TabStrip({
  workspace,
  tabs,
  activeRelPath,
  dirtyPaths,
  onSelect,
  onClose,
  onFileTrashed,
}: {
  workspace: Workspace;
  tabs: string[];
  activeRelPath: string | null;
  dirtyPaths: Set<string>;
  onSelect: (relPath: string) => void;
  onClose: (relPath: string) => void;
  onFileTrashed?: (relPath: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Open files"
      className="no-scrollbar flex h-9 shrink-0 items-stretch overflow-x-auto overscroll-x-contain border-b bg-muted/30"
    >
      {tabs.map((relPath) => (
        <TabItem
          key={relPath}
          workspace={workspace}
          relPath={relPath}
          active={relPath === activeRelPath}
          dirty={dirtyPaths.has(relPath)}
          icon={<FileIcon className="size-3.5 shrink-0" />}
          onSelect={() => onSelect(relPath)}
          onClose={() => onClose(relPath)}
          onTrashed={onFileTrashed ? () => onFileTrashed(relPath) : undefined}
        />
      ))}
    </div>
  );
}

function TabItem({
  workspace,
  relPath,
  active,
  dirty,
  icon,
  onSelect,
  onClose,
  onTrashed,
}: {
  workspace: Workspace;
  relPath: string;
  active: boolean;
  dirty: boolean;
  icon?: ReactNode;
  onSelect: () => void;
  onClose: () => void;
  onTrashed?: () => void;
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

  return (
    <FileContextMenu
      workspace={workspace}
      relPath={relPath}
      onTrashed={onTrashed}
    >
      <div
        ref={tabRef}
        role="tab"
        tabIndex={0}
        aria-selected={active}
        title={relPath}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        onMouseDown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            onClose();
          }
        }}
        className={cn(
          "group flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r px-2 text-xs outline-none",
          active
            ? "bg-background text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        )}
      >
        {icon}
        <span className="max-w-[180px] truncate">{name}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn(
            "ml-1 grid size-4 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
            active || dirty
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
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
    </FileContextMenu>
  );
}

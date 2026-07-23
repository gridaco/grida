/**
 * Workspace file tree pane.
 *
 * Lazy directory listing is delegated to `@grida/tree-view/async`: the
 * desktop bridge remains the source of filesystem truth, while the SDK owns
 * expansion, focus, selection, keyboard navigation, row flattening, and async
 * load/error state.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  RefreshCwIcon,
} from "lucide-react";
import {
  defaultKeymap,
  modeFromEvent,
  TreeController,
  type Keymap,
  type KeyEventLike,
  type NodeId,
  type Row,
} from "@grida/tree-view";
import {
  bindAsyncTreeController,
  createAsyncTreeSource,
  type AsyncTreeSourceHandle,
} from "@grida/tree-view/async";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import { ScrollArea } from "@app/ui/components/scroll-area";
import { cn } from "@app/ui/lib/utils";
import {
  workspaces as workspacesNs,
  type Workspace,
} from "@/lib/desktop/bridge";
import { FileContextMenu } from "./workbench-file-context-menu";
import { confirmAndTrashEntry } from "./workbench-file-actions";
import { WorkspaceFileTree } from "./file-tree-source";
import { WorkspaceFileIcon } from "./workspace-file-icon";
import { useWorkspaceChanges } from "./workspace-changes";

const INDENT_STEP = 12;
const INDENT_BASE = 4;
const FILE_TREE_SCROLL_AREA_CLASS =
  "[&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-viewport]]:scroll-fade-y [&_[data-slot=scroll-area-viewport]]:scroll-fade-4";

const FILE_TREE_KEYMAP: Keymap = {
  ...defaultKeymap,
  Enter: "activate",
  F2: undefined,
  Delete: undefined,
  Backspace: undefined,
};

type WorkspaceFileTreeRuntime = {
  controller: TreeController<WorkspaceFileTree.Meta>;
  handle: AsyncTreeSourceHandle<WorkspaceFileTree.Meta>;
  dispose: () => void;
};

export type FileTreePaneProps = {
  workspace: Workspace;
  activeRelPath: string | null;
  onOpenFile: (relPath: string) => void;
  className?: string;
  /** Bumping this triggers a root-level refresh. */
  refreshKey?: number;
  /** Called after a row's "Move to Trash" succeeds. */
  onEntryTrashed?: (relPath: string, isDirectory: boolean) => void;
};

export function FileTreePane({
  workspace,
  activeRelPath,
  onOpenFile,
  className,
  refreshKey,
  onEntryTrashed,
}: FileTreePaneProps) {
  const [runtime, setRuntime] = useState<WorkspaceFileTreeRuntime | null>(null);

  useEffect(() => {
    const provider = WorkspaceFileTree.createProvider({
      rootName: workspace.name,
      readdir: (relPath) => workspacesNs.readdir(workspace.id, relPath),
    });
    const handle = createAsyncTreeSource(provider);
    const controller = new TreeController<WorkspaceFileTree.Meta>({
      source: handle.source,
    });
    const unbind = bindAsyncTreeController(controller, handle);

    const next: WorkspaceFileTreeRuntime = {
      controller,
      handle,
      dispose() {
        unbind();
        controller.dispose();
        handle.dispose();
      },
    };

    setRuntime(next);
    return () => {
      next.dispose();
    };
  }, [workspace.id, workspace.name]);

  if (!runtime) {
    return (
      <ScrollArea
        className={cn("h-full w-full", FILE_TREE_SCROLL_AREA_CLASS, className)}
      >
        <LoadingRow depth={0} />
      </ScrollArea>
    );
  }

  return (
    <TreeProvider controller={runtime.controller}>
      <FileTreePaneInner
        workspace={workspace}
        activeRelPath={activeRelPath}
        onOpenFile={onOpenFile}
        className={className}
        refreshKey={refreshKey}
        onEntryTrashed={onEntryTrashed}
        handle={runtime.handle}
      />
    </TreeProvider>
  );
}

function FileTreePaneInner({
  workspace,
  activeRelPath,
  onOpenFile,
  className,
  refreshKey,
  onEntryTrashed,
  handle,
}: FileTreePaneProps & {
  handle: AsyncTreeSourceHandle<WorkspaceFileTree.Meta>;
}) {
  const controller = useTree<WorkspaceFileTree.Meta>();
  const rows = useTreeSnapshot((c) => c.getRows());
  const selection = useTreeSnapshot((c) => c.getSelection());
  const focused = useTreeSnapshot((c) => c.getFocused());
  const sourceVersion = useTreeSnapshot((c) => c.source.getVersion());
  const mirroredActiveRelPathRef = useRef<string | null>(null);

  const reload = useCallback(
    (id: NodeId) => {
      if (!handle.hasNode(id)) return;
      handle.invalidate(id);
      handle.load(id);
    },
    [handle]
  );

  const reloadParent = useCallback(
    (relPath: string) => {
      reload(WorkspaceFileTree.parentRelPath(relPath));
    },
    [reload]
  );

  // External file changes (issue #805): surgically reload the parent dir
  // of each changed path. Events arrive already coalesced by the host;
  // we dedupe by parent so one `git checkout` touching many files reloads
  // each affected (and currently-expanded) folder once. `reload` no-ops
  // for dirs that were never listed, so a change deep in a collapsed
  // subtree costs nothing.
  useWorkspaceChanges((events) => {
    const parents = new Set<string>();
    for (const e of events) {
      parents.add(WorkspaceFileTree.parentRelPath(e.rel_path));
    }
    for (const parent of parents) reload(parent);
  });

  const afterTrashed = useCallback(
    (relPath: string, isDirectory: boolean) => {
      reloadParent(relPath);
      onEntryTrashed?.(relPath, isDirectory);
    },
    [onEntryTrashed, reloadParent]
  );

  const handleActivateIntent = useCallback(
    (id: NodeId) => {
      const meta = readMeta(controller, id);
      if (!meta) return;
      controller.focus(id);
      // A `.canvas` bundle is a directory on disk but opens like a file (its
      // deck), so only real containers toggle; everything else opens.
      if (meta.kind === "directory" && !meta.bundle) {
        controller.toggle(id);
      } else {
        onOpenFile(id);
      }
    },
    [controller, onOpenFile]
  );

  const trash = useCallback(
    async (id: NodeId) => {
      if (id === WorkspaceFileTree.ROOT_ID) return;
      const meta = readMeta(controller, id);
      if (!meta) return;
      const isDirectory = meta.kind === "directory";
      const trashed = await confirmAndTrashEntry(workspace, id, isDirectory);
      if (trashed) afterTrashed(id, isDirectory);
    },
    [afterTrashed, controller, workspace]
  );

  useEffect(() => {
    return controller.subscribe("intent", (intent) => {
      switch (intent.kind) {
        case "activate":
          handleActivateIntent(intent.id);
          return;
        case "delete":
          void trash(intent.ids[0]);
          return;
        case "rename":
        case "move":
        case "copy":
          return;
      }
    });
  }, [controller, handleActivateIntent, trash]);

  useEffect(() => {
    if (refreshKey === undefined) return;
    reload(WorkspaceFileTree.ROOT_ID);
  }, [refreshKey, reload]);

  useEffect(() => {
    if (!activeRelPath) {
      mirroredActiveRelPathRef.current = null;
      return;
    }
    if (mirroredActiveRelPathRef.current === activeRelPath) return;
    if (!handle.hasNode(activeRelPath)) return;
    controller.reveal(activeRelPath, { select: false });
    mirroredActiveRelPathRef.current = activeRelPath;
  }, [activeRelPath, controller, handle, rows]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditableTarget(e.target)) return;
      if (isTreeTrashKey(e.nativeEvent)) {
        e.preventDefault();
        e.stopPropagation();
        const target = focused ?? selection[0] ?? null;
        if (target) controller.emitDeleteIntent([target]);
        return;
      }
      const r = controller.keyDown(e.nativeEvent, FILE_TREE_KEYMAP);
      if (r.handled) e.preventDefault();
    },
    [controller, focused, selection, trash]
  );

  const selectedSet = useMemo(() => new Set(selection), [selection]);

  return (
    <ScrollArea
      className={cn("h-full w-full", FILE_TREE_SCROLL_AREA_CLASS, className)}
    >
      <div
        role="tree"
        tabIndex={0}
        data-testid="desktop-workspace-file-tree"
        className="px-1 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onKeyDown={onKeyDown}
      >
        <RootStatus handle={handle} />
        {rows.map((row) => (
          <FileTreeRow
            key={row.id}
            workspace={workspace}
            row={row}
            handle={handle}
            selected={selectedSet.has(row.id)}
            focused={focused === row.id}
            sourceVersion={sourceVersion}
            onEntryTrashed={afterTrashed}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function RootStatus({
  handle,
}: {
  handle: AsyncTreeSourceHandle<WorkspaceFileTree.Meta>;
}) {
  useTreeSnapshot((c) => c.source.getVersion());
  if (!handle.hasNode(WorkspaceFileTree.ROOT_ID)) return null;
  const state = handle.getLoadState(WorkspaceFileTree.ROOT_ID);
  if (state !== "error") return null;
  return (
    <StatusRow
      depth={0}
      message={messageOf(handle.getError(WorkspaceFileTree.ROOT_ID))}
      onRetry={() => {
        handle.invalidate(WorkspaceFileTree.ROOT_ID);
        handle.load(WorkspaceFileTree.ROOT_ID);
      }}
    />
  );
}

function FileTreeRow({
  workspace,
  row,
  handle,
  selected,
  focused,
  sourceVersion,
  onEntryTrashed,
}: {
  workspace: Workspace;
  row: Row;
  handle: AsyncTreeSourceHandle<WorkspaceFileTree.Meta>;
  selected: boolean;
  focused: boolean;
  sourceVersion: number;
  onEntryTrashed?: (relPath: string, isDirectory: boolean) => void;
}) {
  const controller = useTree<WorkspaceFileTree.Meta>();
  const meta = readMeta(controller, row.id);
  if (!meta) return null;

  const isDirectory = meta.kind === "directory";
  // A `.canvas` bundle is a directory we present as an opaque package: no
  // chevron, click opens the deck. `isContainer` = a directory the tree
  // actually descends into (everything expand-related keys off it).
  const isBundle = meta.bundle;
  const isContainer = isDirectory && !isBundle;
  const loadState = handle.hasNode(row.id)
    ? handle.getLoadState(row.id)
    : "loaded";
  const error = handle.hasNode(row.id) ? handle.getError(row.id) : null;
  const childCount = controller.source.getNode(row.id).children.length;
  const showLoading = isContainer && row.isExpanded && loadState === "loading";
  const showError = isContainer && row.isExpanded && loadState === "error";
  const showEmpty =
    isContainer && row.isExpanded && loadState === "loaded" && childCount === 0;

  const button = (
    <button
      type="button"
      role="treeitem"
      aria-selected={selected}
      aria-expanded={isContainer ? row.isExpanded : undefined}
      aria-level={row.depth + 1}
      data-tree-row-id={row.id}
      data-row-depth={row.depth}
      data-source-version={sourceVersion}
      className={cn(
        "group flex w-full items-center gap-1 rounded-sm px-1.5 py-0.5 text-left text-xs outline-none",
        selected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/60 hover:text-accent-foreground",
        focused && !selected && "bg-accent/40 text-accent-foreground"
      )}
      style={{ paddingLeft: `${row.depth * INDENT_STEP + INDENT_BASE}px` }}
      onClick={(e) => {
        controller.focus(row.id);
        controller.select([row.id], modeFromEvent(e));
        if (isContainer) controller.toggle(row.id);
        else controller.dispatch("activate");
      }}
    >
      <ChevronRightIcon
        className={cn(
          "size-3 shrink-0 text-muted-foreground transition-transform",
          isContainer && row.isExpanded && "rotate-90",
          !isContainer && "invisible"
        )}
      />
      {isBundle ? (
        <WorkspaceFileIcon
          relPath={row.id}
          className="size-3.5 shrink-0 text-violet-500"
        />
      ) : isDirectory ? (
        row.isExpanded ? (
          <FolderOpenIcon className="size-3.5 shrink-0 text-sky-500" />
        ) : (
          <FolderIcon className="size-3.5 shrink-0 text-sky-500" />
        )
      ) : (
        <WorkspaceFileIcon
          relPath={row.id}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      )}
      <span className="truncate">{meta.name}</span>
      {meta.kind === "symlink" && (
        <span className="ml-auto text-[9px] text-muted-foreground">↪</span>
      )}
    </button>
  );

  return (
    <>
      <FileContextMenu
        workspace={workspace}
        relPath={row.id}
        isDirectory={isDirectory}
        onTrashed={() => onEntryTrashed?.(row.id, isDirectory)}
      >
        {button}
      </FileContextMenu>
      {showLoading && <LoadingRow depth={row.depth + 1} />}
      {showError && (
        <StatusRow
          depth={row.depth + 1}
          message={messageOf(error)}
          onRetry={() => {
            handle.invalidate(row.id);
            handle.load(row.id);
          }}
        />
      )}
      {showEmpty && <EmptyRow depth={row.depth + 1} />}
    </>
  );
}

function LoadingRow({ depth }: { depth: number }) {
  return (
    <div
      className="px-2 py-0.5 text-[10px] italic text-muted-foreground"
      style={{ paddingLeft: `${depth * INDENT_STEP + INDENT_BASE}px` }}
    >
      loading…
    </div>
  );
}

function EmptyRow({ depth }: { depth: number }) {
  return (
    <div
      className="px-2 py-0.5 text-[10px] italic text-muted-foreground"
      style={{ paddingLeft: `${depth * INDENT_STEP + INDENT_BASE}px` }}
    >
      (empty)
    </div>
  );
}

function StatusRow({
  depth,
  message,
  onRetry,
}: {
  depth: number;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-destructive"
      style={{ paddingLeft: `${depth * INDENT_STEP + INDENT_BASE}px` }}
    >
      <span className="truncate">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Retry"
      >
        <RefreshCwIcon className="size-3" />
      </button>
    </div>
  );
}

function readMeta(
  controller: TreeController<WorkspaceFileTree.Meta>,
  id: NodeId
): WorkspaceFileTree.Meta | undefined {
  try {
    return controller.source.getNode(id).meta;
  } catch {
    return undefined;
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Couldn't read folder.";
}

function isTreeTrashKey(event: KeyEventLike): boolean {
  return (
    !event.altKey &&
    !event.shiftKey &&
    (event.key === "Backspace" || event.key === "Delete")
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
}

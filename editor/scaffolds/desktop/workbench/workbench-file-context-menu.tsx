/**
 * Right-click context menu for a workspace entry — a file row or a
 * folder row in the file tree pane, or a tab in the tab strip. Same
 * actions, same shortcut hints, same backing helpers; the only
 * difference between the surfaces is which element receives the
 * right-click (and tabs are always files, so they pass `isDirectory`
 * false by default).
 *
 * Built on shadcn's `ContextMenu` primitives, which wrap Radix. The
 * `<ContextMenuTrigger asChild>` pattern means the trigger element
 * the caller passes in keeps its own click/focus handlers — we're
 * just attaching the right-click behaviour around it.
 *
 * The component is intentionally narrow: it only knows how to render
 * the menu and dispatch the actions. The keyboard-shortcut bindings
 * for the same actions live one level up in `workspace-workbench.tsx`
 * (where the active tab is in scope) and reuse the same helpers
 * from `workbench-file-actions.ts`.
 */
"use client";

import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@app/ui/components/context-menu";
import type { Workspace } from "@/lib/desktop/bridge";
import {
  confirmAndTrashEntry,
  copyAbsolutePath,
  copyRelativePath,
  revealInFinder,
  COPY_PATH_SHORTCUT_HINT,
  COPY_RELATIVE_PATH_SHORTCUT_HINT,
  REVEAL_SHORTCUT_HINT,
  TRASH_SHORTCUT_HINT,
} from "./workbench-file-actions";

export function FileContextMenu({
  workspace,
  relPath,
  isDirectory = false,
  onTrashed,
  onOpenChange,
  children,
}: {
  workspace: Workspace;
  /** Workspace-relative path of the entry the menu acts on. */
  relPath: string;
  /**
   * Whether the entry is a folder. Only affects the trash confirm copy
   * ("…and its contents"); the main process trashes either kind.
   */
  isDirectory?: boolean;
  /**
   * Called after the entry was successfully moved to the trash, so the
   * surrounding surface can refresh its tree / close affected tabs.
   * Omitted on surfaces that don't own that state.
   */
  onTrashed?: () => void;
  /** Optional surface-level reaction, such as dismissing a tab preview. */
  onOpenChange?: (open: boolean) => void;
  /** The right-click target — usually a tree row button or a tab. */
  children: ReactNode;
}) {
  // `.canvas` bundles open on click (the tree renders them as opaque leaves),
  // so there's no longer a dedicated "Open as Canvas" item here.
  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]">
        <ContextMenuItem
          onSelect={() => void revealInFinder(workspace, relPath)}
        >
          Reveal in Finder
          <ContextMenuShortcut>{REVEAL_SHORTCUT_HINT}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => void copyAbsolutePath(workspace, relPath)}
        >
          Copy path
          <ContextMenuShortcut>{COPY_PATH_SHORTCUT_HINT}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void copyRelativePath(relPath)}>
          Copy relative path
          <ContextMenuShortcut>
            {COPY_RELATIVE_PATH_SHORTCUT_HINT}
          </ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() =>
            void confirmAndTrashEntry(workspace, relPath, isDirectory).then(
              (trashed) => {
                if (trashed) onTrashed?.();
              }
            )
          }
        >
          Move to Trash
          <ContextMenuShortcut>{TRASH_SHORTCUT_HINT}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

"use client";

import { FileArchiveIcon, FolderOpenIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import type { Workspace } from "@/lib/desktop/bridge";
import { WorkspaceFileKind } from "./workspace-file-kind";
import { revealInFinder } from "./workbench-file-actions";

/**
 * ZIP files are useful workspace artifacts but not editable documents.
 * Keep them out of the UTF-8 reader and offer the one meaningful native action.
 */
export function EditorPaneZipFile({
  workspace,
  relPath,
}: {
  workspace: Workspace;
  relPath: string;
}) {
  return (
    <div
      data-testid="viewer-workspace-zip"
      className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <FileArchiveIcon className="size-6" aria-hidden />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="break-all text-sm font-medium">
          {WorkspaceFileKind.filename(relPath)}
        </p>
        <p className="text-xs text-muted-foreground">
          {WorkspaceFileKind.typeLabel("zip")}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void revealInFinder(workspace, relPath)}
      >
        <FolderOpenIcon aria-hidden />
        Reveal in Finder
      </Button>
    </div>
  );
}

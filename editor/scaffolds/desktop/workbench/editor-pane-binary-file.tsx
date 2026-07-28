"use client";

import { FolderOpenIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import type { Workspace } from "@/lib/desktop/bridge";
import { WorkspaceFileIcon } from "./workspace-file-icon";
import { WorkspaceFileKind } from "./workspace-file-kind";
import { revealInFinder } from "./workbench-file-actions";

/**
 * Files without a dedicated Grida viewer stay out of the UTF-8 reader and
 * expose the one universally useful native action.
 */
export function EditorPaneBinaryFile({
  workspace,
  relPath,
}: {
  workspace: Workspace;
  relPath: string;
}) {
  return (
    <div
      data-testid="viewer-workspace-binary"
      className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <WorkspaceFileIcon relPath={relPath} className="size-6" />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="break-all text-sm font-medium">
          {WorkspaceFileKind.filename(relPath)}
        </p>
        <p className="text-xs text-muted-foreground">
          {WorkspaceFileKind.label(relPath)}
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

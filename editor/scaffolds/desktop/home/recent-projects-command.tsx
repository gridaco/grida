"use client";

/**
 * Recent-projects quick switcher — a cmdk command palette (VS Code's ⌃R "Open
 * Recent"). Keeps the home itself minimal: instead of a persistent recents
 * list, projects live one keystroke away. Search matches name OR path; opening
 * a `.canvas` bundle routes to the board window, everything else to the
 * workbench (same rule the old inline list used).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FolderIcon, FolderOpenIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@app/ui/components/command";
import {
  workspaces as workspaceBridge,
  type Workspace,
} from "@/lib/desktop/bridge";
import { workspaceWorkbenchHref } from "@/scaffolds/desktop/workbench/workspace-workbench-url";

export function RecentProjectsCommand({
  open,
  onOpenChange,
  workspaces,
  canvasIds,
  onOpenFolder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: Workspace[];
  canvasIds: Set<string>;
  onOpenFolder: () => void;
}) {
  const router = useRouter();
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openProject = async (w: Workspace) => {
    if (reopening) return;
    setReopening(true);
    setError(null);
    try {
      const reopened = await workspaceBridge.openFolder(w.root);
      onOpenChange(false);
      router.push(
        canvasIds.has(reopened.id)
          ? `/desktop/file?id=${encodeURIComponent(reopened.id)}`
          : workspaceWorkbenchHref(reopened)
      );
    } catch {
      setError(
        "The registered folder may have moved or changed. Select it again through Open folder."
      );
    } finally {
      setReopening(false);
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (reopening) return;
        setError(null);
        onOpenChange(next);
      }}
      title="Recent projects"
      description="Search and open a recent project"
    >
      <CommandInput placeholder="Search projects…" />
      {error && (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <CommandList>
        <CommandEmpty>No projects found.</CommandEmpty>
        {workspaces.length > 0 && (
          <CommandGroup heading="Recent">
            {workspaces.map((w) => (
              <CommandItem
                key={w.id}
                value={`${w.name} ${w.root}`}
                disabled={reopening}
                onSelect={() => void openProject(w)}
              >
                <FolderIcon className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                <span className="ml-auto min-w-0 max-w-[50%] truncate font-mono text-xs text-muted-foreground">
                  {w.root}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup>
          <CommandItem
            value="open folder existing project"
            disabled={reopening}
            onSelect={() => {
              onOpenChange(false);
              onOpenFolder();
            }}
          >
            <FolderOpenIcon className="text-muted-foreground" />
            Open folder…
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

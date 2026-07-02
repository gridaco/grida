"use client";

/**
 * Recent-projects quick switcher — a cmdk command palette (VS Code's ⌃R "Open
 * Recent"). Keeps the home itself minimal: instead of a persistent recents
 * list, projects live one keystroke away. Search matches name OR path; opening
 * a `.canvas` bundle routes to the board window, everything else to the
 * workbench (same rule the old inline list used).
 */

import { useRouter } from "next/navigation";
import { FolderIcon, FolderOpenIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@app/ui/components/command";
import type { Workspace } from "@/lib/desktop/bridge";
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

  const openProject = (w: Workspace) => {
    onOpenChange(false);
    router.push(
      canvasIds.has(w.id)
        ? `/desktop/file?id=${encodeURIComponent(w.id)}`
        : workspaceWorkbenchHref(w)
    );
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Recent projects"
      description="Search and open a recent project"
    >
      <CommandInput placeholder="Search projects…" />
      <CommandList>
        <CommandEmpty>No projects found.</CommandEmpty>
        {workspaces.length > 0 && (
          <CommandGroup heading="Recent">
            {workspaces.map((w) => (
              <CommandItem
                key={w.id}
                value={`${w.name} ${w.root}`}
                onSelect={() => openProject(w)}
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

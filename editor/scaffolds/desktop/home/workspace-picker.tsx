"use client";

/**
 * `WorkspacePicker` — the home's "where does this land?" control.
 *
 * Lives at the top-left of the home surface as a BORDERLESS button (friendly,
 * low-chrome) that opens a dropdown on click. It replaces the old
 * picker-above-the-composer + "or start with a blank" pairing, which read as a
 * confusing up-front choice.
 *
 * `value === null` is the default: a fresh project is auto-created under the
 * managed `~/Documents/Grida` root on submit — surfaced here as
 * "Default workspace" (not "New project"). Picking a recent workspace, or
 * "Open folder…", aims submissions at that existing project instead.
 */

import { useState } from "react";
import { CheckIcon, ChevronDownIcon, FolderIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@app/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import type { Workspace } from "@/lib/desktop/bridge";

export function WorkspacePicker({
  value,
  onChange,
  workspaces,
  onOpenFolder,
}: {
  /** The targeted workspace, or `null` for the default managed root. */
  value: Workspace | null;
  onChange: (workspace: Workspace | null) => void;
  workspaces: Workspace[];
  onOpenFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          data-testid="desktop-home-workspace-picker"
          className="max-w-[18rem] gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <FolderIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate font-medium">
            {value?.name ?? "Default workspace"}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search projects…" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="default workspace"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <FolderIcon className="text-muted-foreground" />
                Default workspace
                {value === null && <CheckIcon className="ml-auto size-4" />}
              </CommandItem>
            </CommandGroup>
            {workspaces.length > 0 && (
              <CommandGroup heading="Recent">
                {workspaces.map((w) => (
                  <CommandItem
                    key={w.id}
                    value={`${w.name} ${w.root}`}
                    onSelect={() => {
                      onChange(w);
                      setOpen(false);
                    }}
                  >
                    <FolderIcon className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    {value?.id === w.id && (
                      <CheckIcon className="ml-auto size-4" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup>
              <CommandItem
                value="open folder existing project"
                onSelect={() => {
                  setOpen(false);
                  onOpenFolder();
                }}
              >
                Open folder…
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

"use client";

/**
 * Chooses the workspace where the composer submits. A null value targets the
 * managed `~/Documents/Grida Projects` root, shown as "Default workspace".
 */

import { useLayoutEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, FolderIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@app/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import type { Workspace } from "@/lib/desktop/bridge";

function drawUnderline(
  underline: SVGSVGElement | null,
  delay: number,
  fill: FillMode = "none"
) {
  if (
    !underline ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  return underline.animate(
    [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0)" }],
    { delay, duration: 460, easing: "cubic-bezier(0.3, 0.05, 0.45, 1)", fill }
  );
}

export function WorkspacePicker({
  inline = false,
  value,
  onChange,
  workspaces,
  onOpenFolder,
}: {
  inline?: boolean;
  /** The targeted workspace, or `null` for the default managed root. */
  value: Workspace | null;
  onChange: (workspace: Workspace | null) => void;
  workspaces: Workspace[];
  onOpenFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const underlineRef = useRef<SVGSVGElement>(null);
  const underlineAnimation = useRef<Animation | undefined>(undefined);
  const label = value?.name ?? "Default workspace";

  useLayoutEffect(() => {
    underlineAnimation.current = drawUnderline(
      underlineRef.current,
      280,
      "backwards"
    );
    return () => underlineAnimation.current?.cancel();
  }, [inline]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {inline ? (
          <button
            type="button"
            role="combobox"
            data-testid="desktop-home-workspace-picker"
            title={label}
            onMouseEnter={() => {
              underlineAnimation.current?.cancel();
              underlineAnimation.current = drawUnderline(
                underlineRef.current,
                140
              );
            }}
            className="group relative inline-flex min-w-0 max-w-[calc(100%_-_1ch)] cursor-pointer items-baseline gap-1.5 rounded-md px-1.5 py-0.5 text-blue-500/70 hover:bg-blue-500/5 focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-400/70 dark:hover:bg-blue-400/10"
          >
            <FolderIcon
              aria-hidden="true"
              className="size-4 shrink-0 self-center"
            />
            <span className="min-w-0 truncate">{label}</span>
            <svg
              ref={underlineRef}
              aria-hidden="true"
              viewBox="0 0 160 8"
              preserveAspectRatio="none"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute -bottom-0.5 left-1.5 h-2 w-[calc(100%_-_0.75rem)] opacity-75 group-hover:opacity-100"
            >
              <path
                d="M1 5.8C14 5 24 3 38 3.2S58 6 73 5.7c10-.2 22-2.2 35-2.3 12-.1 18 1.5 30 .7 8-.5 14-1.2 21-2.4"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d="M5 6.4c10-.8 21-2 31-2m12 .6c8 1.1 16 2 24 1.8 7-.1 12-.8 18-1.6m10-1c12-.6 22 1.2 35 .5 7-.3 12-1.1 17-1.9"
                strokeWidth="0.85"
                opacity="0.65"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d="M8 4.9C21 3.5 28 2.6 40 2.8s19 2.7 31 2.3 26-2.3 38-2.3 18 1.1 30 .5c6-.3 13-1.2 17-1.9"
                strokeWidth="0.7"
                strokeDasharray="1 2.5 3 1.5"
                opacity="0.55"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            data-testid="desktop-home-workspace-picker"
            className="max-w-[18rem] gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <FolderIcon className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate font-medium">{label}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side={inline ? "top" : "bottom"}
        avoidCollisions={!inline}
        className="w-72 p-0"
      >
        <Command
          className={
            inline
              ? "max-h-[calc(var(--radix-popover-content-available-height)_-_2px)]"
              : undefined
          }
        >
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
            <CommandSeparator />
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

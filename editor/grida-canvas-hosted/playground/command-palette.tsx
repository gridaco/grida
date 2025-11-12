"use client";

import React, { useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  GearIcon,
  ImageIcon,
  BarChartIcon,
  GlobeIcon,
  MagicWandIcon,
} from "@radix-ui/react-icons";
import { useHotkeys } from "react-hotkeys-hook";
import { cn } from "@/components/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";

/**
 * Hook to detect double shift key press (like IntelliJ)
 */
function useDoubleShiftPress(onDoubleShift: () => void) {
  const [lastShiftPressTime, setLastShiftPressTime] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        const now = Date.now();
        const timeSinceLastPress = now - lastShiftPressTime;

        // If shift is pressed twice within 300ms, trigger callback
        if (timeSinceLastPress < 300 && timeSinceLastPress > 0) {
          onDoubleShift();
          setLastShiftPressTime(0); // Reset to prevent multiple triggers
        } else {
          setLastShiftPressTime(now);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastShiftPressTime, onDoubleShift]);
}

// Command palette data structure
type CommandAction = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onExecute?: () => void;
};

type CommandGroup = {
  heading: string;
  actions: CommandAction[];
};

const COMMAND_GROUPS: CommandGroup[] = [
  {
    heading: "Image Editing",
    actions: [
      {
        id: "create-image",
        label: "Create Image",
        icon: <ImageIcon className="mr-2" />,
      },
      {
        id: "edit-image",
        label: "Edit Image",
        icon: <MagicWandIcon className="mr-2" />,
      },
      {
        id: "remove-background",
        label: "Remove Background",
      },
      {
        id: "upscale-resolution",
        label: "Upscale Resolution",
      },
    ],
  },
  {
    heading: "Elements",
    actions: [
      {
        id: "insert-maps",
        label: "Insert Maps",
        icon: <GlobeIcon className="mr-2" />,
      },
      {
        id: "insert-charts",
        label: "Insert Charts",
        icon: <BarChartIcon className="mr-2" />,
      },
    ],
  },
  {
    heading: "Help",
    actions: [
      {
        id: "preferences",
        label: "Preferences",
        icon: <GearIcon className="mr-2" />,
        shortcut: "⌘,",
      },
      {
        id: "keyboard-shortcuts",
        label: "Keyboard Shortcuts",
      },
    ],
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  // Handle cmd+k, cmd+p, cmd+shift+p
  useHotkeys(
    "meta+k, ctrl+k, meta+p, ctrl+p, meta+shift+p, ctrl+shift+p",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen((open) => !open);
    },
    {
      enableOnFormTags: true,
    }
  );

  // Handle double shift key press (like IntelliJ)
  useDoubleShiftPress(() => setOpen(true));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        {/* Transparent overlay - provides click-outside-to-dismiss without dimming */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50" />

        <DialogPrimitive.Content
          className={cn(
            "fixed top-20 left-[50%] z-50 translate-x-[-50%]",
            "w-full max-w-2xl mx-4",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "duration-200"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Command Palette
          </DialogPrimitive.Title>
          <Command className="shadow-2xl border-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group]]:px-1 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-1.5 [&_[cmdk-item]]:text-sm [&_[cmdk-input]]:h-9 [&_[cmdk-input]]:text-sm">
            <CommandInput placeholder="Type a command or search..." />
            <CommandList className="max-h-[400px] py-1">
              <CommandEmpty>
                <span className="text-muted-foreground">No results found.</span>
              </CommandEmpty>

              {COMMAND_GROUPS.map((group, groupIndex) => (
                <React.Fragment key={group.heading}>
                  {groupIndex > 0 && <CommandSeparator />}
                  <CommandGroup heading={group.heading}>
                    {group.actions.map((action) => (
                      <CommandItem
                        key={action.id}
                        onSelect={() => {
                          action.onExecute?.();
                          setOpen(false);
                        }}
                      >
                        {action.icon}
                        <span>{action.label}</span>
                        {action.shortcut && (
                          <CommandShortcut>{action.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </React.Fragment>
              ))}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

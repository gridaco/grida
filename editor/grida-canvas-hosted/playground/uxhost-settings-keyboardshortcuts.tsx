import React, { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { keycodeToPlatformUILabel } from "@/grida-canvas/keybinding";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { actions } from "./uxhost-actions";
import {
  keybindingsToKeyCodes,
  getKeyboardOS,
  type Keybindings,
} from "@/grida-canvas/keybinding";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchIcon } from "lucide-react";

interface KeyboardShortcutRowProps {
  action: {
    /**
     * Stable unique identifier for the action (derived from the `actions` registry key).
     */
    id?: string;
    name: string;
    description: string;
    command: string;
    keybindings: Keybindings;
  };
  selectedPlatform: "mac" | "windows" | "linux";
}

function KeyboardShortcutRow({
  action,
  selectedPlatform,
}: KeyboardShortcutRowProps) {
  // Get platform-specific keybindings
  let keybindings: Keybindings = action.keybindings;
  if (
    typeof keybindings === "object" &&
    !Array.isArray(keybindings) &&
    ("mac" in keybindings || "windows" in keybindings || "linux" in keybindings)
  ) {
    const platformBinding =
      keybindings[selectedPlatform] ||
      keybindings.mac ||
      keybindings.linux ||
      keybindings.windows;
    if (platformBinding) {
      keybindings = platformBinding;
    }
  }

  const resolvedSequences = keybindingsToKeyCodes(
    keybindings,
    selectedPlatform
  );

  return (
    <div className="flex items-center justify-between p-2 border-b last:border-b-0">
      <div className="grid gap-1">
        <span className="font-medium text-sm text-gray-800">{action.name}</span>
        <span className="text-xs text-gray-500">{action.description}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {resolvedSequences
          .map((sequence, aliasIndex) => (
            <KbdGroup key={aliasIndex} className="gap-0.5">
              {sequence.map((chunk, chunkIndex) => (
                <React.Fragment key={chunkIndex}>
                  {/* Space separator between chunks (sequence steps) */}
                  {chunkIndex > 0 && (
                    <span className="text-xs text-muted-foreground"> </span>
                  )}
                  {/* Render modifiers first */}
                  {chunk.mods.map((modKeyCode, modIndex) => (
                    <Kbd key={`mod-${modIndex}`}>
                      {keycodeToPlatformUILabel(modKeyCode, selectedPlatform)}
                    </Kbd>
                  ))}
                  {/* Render keys after modifiers */}
                  {chunk.keys.map((keyCode, keyIndex) => (
                    <Kbd key={`key-${keyIndex}`}>
                      {keycodeToPlatformUILabel(keyCode, selectedPlatform)}
                    </Kbd>
                  ))}
                </React.Fragment>
              ))}
            </KbdGroup>
          ))
          .reduce((acc, element, index) => {
            // Add / separator between aliases
            if (index > 0) {
              acc.push(
                <span
                  key={`separator-${index}`}
                  className="text-xs text-muted-foreground"
                >
                  {" "}
                  /{" "}
                </span>
              );
            }
            acc.push(element);
            return acc;
          }, [] as React.ReactNode[])}
      </div>
    </div>
  );
}

export function KeyboardShortcuts() {
  const [selectedPlatform, setSelectedPlatform] = useState<
    "mac" | "windows" | "linux"
  >(getKeyboardOS());
  const [searchQuery, setSearchQuery] = useState("");

  const filteredActions = useMemo(() => {
    const actionsWithId = Object.entries(actions).map(([id, action]) => ({
      id,
      ...action,
    }));

    if (!searchQuery.trim()) {
      return actionsWithId;
    }

    const query = searchQuery.toLowerCase().trim();
    return actionsWithId.filter(
      (action) =>
        action.name.toLowerCase().includes(query) ||
        action.description.toLowerCase().includes(query) ||
        action.command.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 shrink-0 border-b">
        <div className="flex items-center gap-4">
          <InputGroup className="flex-1">
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search shortcuts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Label className="text-xs font-normal">Preview:</Label>
            <Select
              value={selectedPlatform}
              onValueChange={(value) =>
                setSelectedPlatform(value as "mac" | "windows" | "linux")
              }
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mac">macOS</SelectItem>
                <SelectItem value="windows">Windows</SelectItem>
                <SelectItem value="linux">Linux</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <ScrollBar />
        <div className="px-6 pb-6">
          {filteredActions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No shortcuts found matching "{searchQuery}"
            </div>
          ) : (
            filteredActions.map((action, index) => (
              <KeyboardShortcutRow
                key={
                  action.id ??
                  // Fallback: deterministic-ish unique string to avoid React key collisions
                  `${action.command}:${action.name}:${action.description}:${index}`
                }
                action={action}
                selectedPlatform={selectedPlatform}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

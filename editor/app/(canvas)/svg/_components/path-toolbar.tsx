"use client";

import * as React from "react";
import { CursorArrowIcon, Cross2Icon } from "@radix-ui/react-icons";
import { LassoIcon, SplineIcon } from "lucide-react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

import {
  useSvgEditor,
  useTool,
  useContentEditKind,
} from "@grida/svg-editor/react";
import type { Tool } from "@grida/svg-editor";

import { ToolGroupItem } from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/utils";

type ToolEntry = {
  value: string;
  tool: Tool;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
};

const PATH_TOOLS: ReadonlyArray<ToolEntry> = [
  {
    value: "cursor",
    tool: { type: "cursor" },
    Icon: CursorArrowIcon,
    label: "Move",
    shortcut: "V",
  },
  {
    value: "lasso",
    tool: { type: "lasso" },
    Icon: LassoIcon,
    label: "Lasso",
    shortcut: "Q",
  },
  {
    value: "bend",
    tool: { type: "bend" },
    Icon: SplineIcon,
    // Main editor uses Meta-held for momentary bend; this chip is the
    // sticky equivalent (every segment-drag bends until you switch back).
    label: "Bend",
    // No bare-letter shortcut to mirror main editor's "hold Meta" UX —
    // tooltip omits the key text.
    shortcut: "",
  },
];

/**
 * Floating pill for vector content-edit: cursor (V) / lasso (Q) + an
 * exit button. Mirrors the main editor's `PathToolbar`
 * (`editor/grida-canvas-react-starter-kit/starterkit-toolbar/path-toolbar.tsx`)
 * scoped to the tools svg-editor wires today (no bend / variable-width yet).
 *
 * Mount inside `PathToolbarPosition` so it auto-hides outside path edit.
 */
export function PathToolbar({ className }: { className?: string }) {
  const editor = useSvgEditor();
  const tool = useTool();
  const meta_held = useMetaHeld();
  // Effective active chip: real tool wins; while Meta is held and the
  // real tool is cursor, paint Bend as active (mirrors the underlying
  // momentary-bend dispatch — segment-drag with Meta bends regardless of
  // tool). The editor's `tool` state stays pure: user-set only, never
  // mutated by modifier keys.
  const effective_value: "cursor" | "lasso" | "bend" =
    tool.type === "bend"
      ? "bend"
      : tool.type === "lasso"
        ? "lasso"
        : meta_held
          ? "bend"
          : "cursor";

  return (
    <div
      aria-label="Path toolbar"
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-full border bg-popover px-3 py-1 shadow-md",
        className
      )}
    >
      <ToggleGroupPrimitive.Root
        type="single"
        value={effective_value}
        onValueChange={(next) => {
          // Two click cases to disambiguate:
          //   1. `next === ""` — Radix clears value on re-click of the
          //      visually-active chip. If Meta is held, the user just
          //      clicked the (Meta-derived) Bend chip and intended to
          //      make it sticky — set bend explicitly. Otherwise the
          //      user clicked-off their real tool → collapse to cursor.
          //   2. `next === "<value>"` — user picked a different chip;
          //      set that tool directly. Same path as before.
          if (next === "") {
            editor.set_tool(meta_held ? { type: "bend" } : { type: "cursor" });
            return;
          }
          const t = PATH_TOOLS.find((x) => x.value === next);
          if (t) editor.set_tool(t.tool);
        }}
        className="flex items-center gap-0.5"
      >
        {PATH_TOOLS.map(({ value: v, Icon, label, shortcut }) => (
          <ToolGroupItem key={v} value={v} label={label} shortcut={shortcut}>
            <Icon className="size-4" />
          </ToolGroupItem>
        ))}
      </ToggleGroupPrimitive.Root>

      <div className="h-4 w-px bg-border" aria-hidden />

      <Button
        variant="ghost"
        size="sm"
        className="size-7 rounded-full p-0"
        aria-label="Exit path edit"
        onClick={() => {
          editor.commands.set_mode("select");
        }}
      >
        <Cross2Icon className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Position wrapper that mounts `PathToolbar` only during PATH content-edit
 * (not text). Wrapper is `pointer-events-none` so the empty space doesn't
 * eat canvas drags; the inner pill restores `auto`. Same gate pattern as
 * the main editor's `PathToolbarPosition`.
 */
export function PathToolbarPosition({ children }: React.PropsWithChildren) {
  const kind = useContentEditKind();
  if (kind !== "path") return null;
  return (
    <div className="absolute bottom-16 left-0 right-0 z-50 flex items-center justify-center pointer-events-none">
      {children}
    </div>
  );
}

/**
 * Track whether the Meta key (⌘ on macOS, Win on Windows) is currently
 * held. Scope-local helper for the path toolbar — used to paint the Bend
 * chip as active during momentary-bend (Meta-held), without mutating the
 * editor's `tool` state.
 *
 * Window-scoped listeners self-attach on mount and tear down on unmount.
 * `blur` and visibility-loss reset the flag so a Cmd-Tab away doesn't
 * leave us stuck in "bend active" state when the page comes back.
 */
function useMetaHeld(): boolean {
  const [held, set_held] = React.useState(false);
  React.useEffect(() => {
    const on_down = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.metaKey) set_held(true);
    };
    const on_up = (e: KeyboardEvent) => {
      if (e.key === "Meta" || !e.metaKey) set_held(false);
    };
    const on_blur = () => set_held(false);
    window.addEventListener("keydown", on_down);
    window.addEventListener("keyup", on_up);
    window.addEventListener("blur", on_blur);
    document.addEventListener("visibilitychange", on_blur);
    return () => {
      window.removeEventListener("keydown", on_down);
      window.removeEventListener("keyup", on_up);
      window.removeEventListener("blur", on_blur);
      document.removeEventListener("visibilitychange", on_blur);
    };
  }, []);
  return held;
}

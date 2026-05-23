"use client";

import {
  BoxIcon,
  CircleIcon,
  CursorArrowIcon,
  SlashIcon,
} from "@radix-ui/react-icons";
import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

import {
  ToolGroupItem,
  ToolbarPosition,
} from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import { useSvgEditor, useTool } from "@grida/svg-editor/react";
import type { Tool } from "@grida/svg-editor";

type ToolEntry = {
  value: string;
  tool: Tool;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
};

const TOOLS: ReadonlyArray<ToolEntry> = [
  {
    value: "cursor",
    tool: { type: "cursor" },
    Icon: CursorArrowIcon,
    label: "Move",
    shortcut: "V",
  },
  {
    value: "rect",
    tool: { type: "insert", tag: "rect" },
    Icon: BoxIcon,
    label: "Rectangle",
    shortcut: "R",
  },
  {
    value: "ellipse",
    tool: { type: "insert", tag: "ellipse" },
    Icon: CircleIcon,
    label: "Ellipse",
    shortcut: "O",
  },
  {
    value: "line",
    tool: { type: "insert", tag: "line" },
    Icon: SlashIcon,
    label: "Line",
    shortcut: "L",
  },
];

export function SvgToolbar({ className }: { className?: string }) {
  const editor = useSvgEditor();
  const tool = useTool();
  // `lasso` and `bend` are path-edit-only and SvgToolbar is mounted in
  // select mode, so they're never actually visible while either is active
  // — fall back to cursor to keep this toolbar's active value defined.
  const value = tool.type === "insert" ? tool.tag : "cursor";

  return (
    <ToolbarPosition className={className}>
      <ToggleGroupPrimitive.Root
        type="single"
        value={value}
        onValueChange={(next) => {
          // Radix clears value on re-click of active item; collapse to cursor.
          const t = next ? TOOLS.find((x) => x.value === next) : undefined;
          editor.set_tool(t ? t.tool : { type: "cursor" });
        }}
        className="pointer-events-auto flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md"
      >
        {TOOLS.map(({ value, Icon, label, shortcut }) => (
          <ToolGroupItem
            key={value}
            value={value}
            label={label}
            shortcut={shortcut}
          >
            <Icon className="size-4" />
          </ToolGroupItem>
        ))}
      </ToggleGroupPrimitive.Root>
    </ToolbarPosition>
  );
}

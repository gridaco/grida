"use client";

import * as React from "react";

import {
  DrawingToolbar,
  ToolGroupItem,
  ToolIcon,
  ToolbarPosition,
} from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import { useSvgEditor } from "@grida/svg-editor/react";
import type { SvgEditor, Tool } from "@grida/svg-editor";

type ToolEntry = {
  value: string;
  tool: Tool;
  icon: React.ComponentProps<typeof ToolIcon>["type"];
  label: string;
  shortcut: string;
};

const CURSOR_TOOL: Tool = { type: "cursor" };
const readCursorTool = () => CURSOR_TOOL;

const TOOLS: ReadonlyArray<ToolEntry> = [
  {
    value: "cursor",
    tool: CURSOR_TOOL,
    icon: "cursor",
    label: "Move",
    shortcut: "V",
  },
  {
    value: "rect",
    tool: { type: "insert", tag: "rect" },
    icon: "rectangle",
    label: "Rectangle",
    shortcut: "R",
  },
  {
    value: "ellipse",
    tool: { type: "insert", tag: "ellipse" },
    icon: "ellipse",
    label: "Ellipse",
    shortcut: "O",
  },
  {
    value: "line",
    tool: { type: "insert", tag: "line" },
    icon: "line",
    label: "Line",
    shortcut: "L",
  },
  {
    value: "text",
    tool: { type: "insert-text" },
    icon: "text",
    label: "Text",
    shortcut: "T",
  },
];

export function SvgToolbar({ className }: { className?: string }) {
  const editor = useSvgEditor();
  return <SvgToolbarControls editor={editor} className={className} />;
}

export function SvgToolbarControls({
  editor,
  disabled = false,
  className,
}: {
  editor: SvgEditor | null;
  disabled?: boolean;
  className?: string;
}) {
  const subscribe = React.useCallback(
    (listener: () => void) => editor?.subscribe(listener) ?? (() => {}),
    [editor]
  );
  const readTool = React.useCallback(
    () => editor?.state.tool ?? CURSOR_TOOL,
    [editor]
  );
  const tool = React.useSyncExternalStore(subscribe, readTool, readCursorTool);
  // `lasso` and `bend` are path-edit-only and SvgToolbar is mounted in
  // select mode, so they're never actually visible while either is active
  // — fall back to cursor to keep this toolbar's active value defined.
  const value =
    tool.type === "insert"
      ? tool.tag
      : tool.type === "insert-text"
        ? "text"
        : "cursor";

  return (
    <ToolbarPosition className={className}>
      <DrawingToolbar
        type="single"
        aria-label="Drawing tools"
        value={value}
        inert={disabled}
        disabled={!editor}
        onValueChange={(next) => {
          if (disabled || !editor) return;
          // Radix clears value on re-click of active item; collapse to cursor.
          const t = next ? TOOLS.find((x) => x.value === next) : undefined;
          editor.set_tool(t?.tool ?? CURSOR_TOOL);
        }}
      >
        {TOOLS.map(({ value, icon, label, shortcut }) => (
          <ToolGroupItem
            key={value}
            value={value}
            className="aspect-square"
            label={label}
            aria-label={label}
            shortcut={shortcut}
          >
            <ToolIcon type={icon} className="size-4" />
          </ToolGroupItem>
        ))}
      </DrawingToolbar>
    </ToolbarPosition>
  );
}

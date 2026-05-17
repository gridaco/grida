"use client";

import {
  modeFromEvent,
  type DropPlacement,
  type NodeId,
  type Row,
} from "@grida/tree-view";
import { useTree, useTreeSnapshot } from "@grida/tree-view/react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Component,
  FrameIcon,
  ImageIcon,
  LockIcon,
  SquareIcon,
  TypeIcon,
} from "lucide-react";
import * as React from "react";
import type { DemoMeta } from "./_fixtures";

interface RowProps {
  row: Row;
  label: string;
  meta?: DemoMeta;
  /**
   * Begins a drag from this row. The container hit-tests pointermove at
   * the window level — the row only needs to register the pointer-down
   * starting point.
   */
  onDragStart?: (id: NodeId, e: React.PointerEvent) => void;
  /** When true, render this row as the active drop target. */
  isDropTarget?: boolean;
  dropPlacement?: DropPlacement | null;
  /**
   * Depth the drop line should be drawn at (resolved from horizontal
   * cursor position). Defaults to the row's own depth.
   */
  dropDepth?: number;
  /**
   * `true` while *any* drag is in progress. Used to suppress `:hover`
   * styles so they don't fight the drop indicator. The package never
   * disables pointer-events (would break hit-testing); the consumer
   * gates hover.
   */
  isDragActive?: boolean;
}

const iconFor = (meta: DemoMeta | undefined) => {
  switch (meta?.kind) {
    case "frame":
      return <FrameIcon className="size-3.5 text-muted-foreground" />;
    case "group":
      return <Component className="size-3.5 text-muted-foreground" />;
    case "rect":
      return <SquareIcon className="size-3.5 text-muted-foreground" />;
    case "text":
      return <TypeIcon className="size-3.5 text-muted-foreground" />;
    case "image":
      return <ImageIcon className="size-3.5 text-muted-foreground" />;
    case "locked":
      return <LockIcon className="size-3.5 text-muted-foreground" />;
    default:
      return null;
  }
};

/**
 * Depth-aware position indicator: a horizontal line with a small leading
 * dot, starting at `indentPx` from the left so it visually aligns with the
 * target row's content (depth indent).
 */
function DropLine({
  side,
  indentPx,
}: {
  side: "top" | "bottom";
  indentPx: number;
}) {
  const y = side === "top" ? "-top-px" : "-bottom-px";
  return (
    <div
      className={`absolute ${y} right-1 h-0.5 pointer-events-none`}
      style={{ left: indentPx }}
    >
      <div className="absolute -left-1 -top-[3px] size-2 rounded-full bg-blue-500" />
      <div className="absolute inset-x-0 inset-y-0 rounded bg-blue-500" />
    </div>
  );
}

export function DemoRow({
  row,
  label,
  meta,
  onDragStart,
  isDropTarget,
  dropPlacement,
  dropDepth,
  isDragActive,
}: RowProps) {
  const controller = useTree();
  const selected = useTreeSnapshot((c) => c.getSelection().includes(row.id));
  const focused = useTreeSnapshot((c) => c.getFocused() === row.id);
  const isDragging = useTreeSnapshot(
    (c) => c.getDrag()?.items.includes(row.id) ?? false
  );

  const onClick = (e: React.MouseEvent) => {
    controller.focus(row.id);
    controller.select([row.id], modeFromEvent(e));
  };

  const onChevron = (e: React.MouseEvent) => {
    e.stopPropagation();
    controller.toggle(row.id);
  };

  return (
    <div
      data-tree-row-id={row.id}
      data-row-depth={row.depth}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={row.isContainer ? row.isExpanded : undefined}
      tabIndex={-1}
      onClick={onClick}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onDragStart?.(row.id, e);
      }}
      className={[
        "relative flex h-7 items-center gap-1 rounded px-1 text-xs select-none cursor-default",
        selected
          ? "bg-blue-100 text-blue-900"
          : focused
            ? "bg-gray-100"
            : isDragActive
              ? ""
              : "hover:bg-gray-50",
        meta?.kind === "locked" ? "opacity-60" : "",
        isDragging ? "opacity-40 italic" : "",
      ].join(" ")}
      style={{ paddingLeft: 4 + row.depth * 12 }}
    >
      {/* drop indicators */}
      {/* before/after — depth-aware position line. Uses the *resolved*
          drop depth from the drag handle so horizontal cursor movement
          slides the line in/out of containers, not just the over-row's
          own depth. */}
      {isDropTarget && dropPlacement === "before" && (
        <DropLine side="top" indentPx={4 + (dropDepth ?? row.depth) * 12} />
      )}
      {isDropTarget && dropPlacement === "after" && (
        <DropLine side="bottom" indentPx={4 + (dropDepth ?? row.depth) * 12} />
      )}
      {/* into — folder indicator: ring around the container row. */}
      {isDropTarget && dropPlacement === "into" && (
        <div className="absolute inset-0 rounded-sm ring-2 ring-blue-500 pointer-events-none" />
      )}
      <span
        onClick={row.isContainer ? onChevron : undefined}
        className={
          row.isContainer
            ? "inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
            : "inline-flex size-4"
        }
      >
        {row.isContainer ? (
          row.isExpanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )
        ) : null}
      </span>
      {iconFor(meta)}
      <span className="truncate">{label}</span>
    </div>
  );
}

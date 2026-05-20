"use client";

import type { Row } from "@grida/tree-view";
import { useTree, useTreeSnapshot } from "@grida/tree-view/react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";

export interface TreeViewRowProps {
  /** Row produced by `controller.getRows()`. */
  row: Row;
  /** Optional label override. Falls back to `row.meta.label ?? row.id`. */
  label?: React.ReactNode;
  /** Optional leading icon. */
  icon?: React.ReactNode;
  /** Number of pixels per depth step. Defaults to 16. */
  indent?: number;
}

/**
 * Canonical shadcn-styled row for `@grida/tree-view`.
 *
 * - Subscribes to its own selection / focus / expanded slice via
 *   `useTreeSnapshot` so siblings don't re-render when only your row's
 *   state changes.
 * - Drives a single `data-state` attribute so Tailwind variants can style
 *   every state from one className.
 * - Toggles expansion on chevron click; emits selection on the row body.
 */
export function TreeViewRow({
  row,
  label,
  icon,
  indent = 16,
}: TreeViewRowProps) {
  const controller = useTree();
  const isContainer =
    controller.source.isContainer?.(row.id) ?? row.isContainer;

  const state = useTreeSnapshot(
    (c) => ({
      selected: c.getSelection().includes(row.id),
      focused: c.getFocused() === row.id,
      expanded: c.isExpanded(row.id),
    }),
    (a, b) =>
      a.selected === b.selected &&
      a.focused === b.focused &&
      a.expanded === b.expanded
  );

  const dataState = state.selected
    ? "selected"
    : state.focused
      ? "focused"
      : "idle";

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.expanded) controller.collapse(row.id);
    else controller.expand(row.id);
  };

  const handleSelect = (e: React.MouseEvent) => {
    const mode = e.shiftKey
      ? "range"
      : e.metaKey || e.ctrlKey
        ? "toggle"
        : "replace";
    controller.select([row.id], mode);
    controller.focus(row.id);
  };

  return (
    <div
      role="treeitem"
      aria-selected={state.selected}
      aria-expanded={isContainer ? state.expanded : undefined}
      data-state={dataState}
      onClick={handleSelect}
      style={{ paddingLeft: row.depth * indent }}
      className={cn(
        "flex h-7 items-center gap-1.5 px-1.5 text-sm cursor-default select-none rounded-sm",
        "hover:bg-accent/60 data-[state=selected]:bg-accent data-[state=selected]:text-accent-foreground",
        "data-[state=focused]:ring-1 data-[state=focused]:ring-ring/40"
      )}
    >
      {isContainer ? (
        <button
          type="button"
          onClick={handleToggle}
          className="size-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={state.expanded ? "Collapse" : "Expand"}
        >
          {state.expanded ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
        </button>
      ) : (
        <span className="size-4" />
      )}
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <span className="truncate">{label ?? row.id}</span>
    </div>
  );
}

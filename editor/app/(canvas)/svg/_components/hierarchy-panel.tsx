"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useHoverOverride, useSelection } from "@grida/svg-editor/react";
import type { NodeId } from "@grida/svg-editor";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import type { Row } from "@grida/tree-view";
import { useSvgTreeController, type SvgNodeMeta } from "./use-svg-tree";
import { useSurfaceHover } from "./use-surface-hover";
import { tagInfo } from "./node-type-map";
import { cn } from "@/components/lib/utils";

const INDENT_PX = 14;

/**
 * Read-only hierarchy view of the loaded SVG document, driven by
 * `@grida/tree-view`.
 *
 * v1 features: click-to-select (replace), shift-click (range),
 * cmd/ctrl-click (toggle), expand/collapse via chevron, auto-expand to
 * reveal current selection. Children rendered in reverse document
 * order (`flatten.reverseChildren`) so top-of-list matches top-visually
 * (standard layer-panel convention).
 *
 * Deferred for later: drag-to-reorder, rename, lock/visibility,
 * keyboard navigation, virtualization. See the plan doc for rationale.
 */
export function HierarchyPanel() {
  const controller = useSvgTreeController();
  return (
    <TreeProvider controller={controller}>
      <HierarchyPanelInner />
    </TreeProvider>
  );
}

function HierarchyPanelInner() {
  const controller = useTree<SvgNodeMeta>();
  const rows = useTreeSnapshot((c) => c.getRows());
  const selection = useSelection();
  const hoverId = useSurfaceHover();
  const setHover = useHoverOverride();

  const selectedSet = useMemo(() => new Set<NodeId>(selection), [selection]);

  // Auto-expand ancestors of any selected node.
  useEffect(() => {
    for (const id of selection) controller.expandTo(id);
  }, [selection, controller]);

  const rowRefs = useRef(new Map<NodeId, HTMLDivElement>());

  const lastScrolled = useRef<NodeId | null>(null);
  useLayoutEffect(() => {
    if (selection.length === 0) {
      lastScrolled.current = null;
      return;
    }
    const target = selection[0];
    if (lastScrolled.current === target) return;
    const el = rowRefs.current.get(target);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    lastScrolled.current = target;
  }, [selection, rows]);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-2">No document loaded.</p>
    );
  }

  const handleRowClick = (id: NodeId, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      controller.select([id], "toggle");
      return;
    }
    if (e.shiftKey) {
      controller.select([id], "range");
      return;
    }
    controller.select([id], "replace");
  };

  return (
    <div className="text-xs select-none">
      {rows.map((row) => (
        <HierarchyRow
          key={row.id}
          row={row}
          selected={selectedSet.has(row.id)}
          hovered={hoverId === row.id}
          rowRefs={rowRefs}
          onClick={handleRowClick}
          onHover={setHover}
        />
      ))}
    </div>
  );
}

function HierarchyRow({
  row,
  selected,
  hovered,
  rowRefs,
  onClick,
  onHover,
}: {
  row: Row;
  selected: boolean;
  hovered: boolean;
  rowRefs: React.MutableRefObject<Map<NodeId, HTMLDivElement>>;
  onClick: (id: NodeId, e: React.MouseEvent) => void;
  onHover: (id: NodeId | null) => void;
}) {
  const controller = useTree<SvgNodeMeta>();
  const node = controller.source.getNode(row.id);
  const label = controller.source.getLabel?.(row.id) ?? row.id;
  const { Icon } = tagInfo(node.meta?.tag ?? "");
  const isFolder = row.isContainer;
  const isExpanded = row.isExpanded;

  return (
    <div
      ref={(el) => {
        if (el) rowRefs.current.set(row.id, el);
        else rowRefs.current.delete(row.id);
      }}
      onClick={(e) => onClick(row.id, e)}
      onMouseEnter={() => onHover(row.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "flex items-center gap-1.5 h-[22px] pr-1.5 rounded-sm cursor-pointer",
        selected
          ? "bg-accent text-accent-foreground"
          : hovered
            ? "bg-muted"
            : "hover:bg-muted/60"
      )}
      style={{ paddingLeft: 4 + row.depth * INDENT_PX }}
      title={label}
    >
      <span
        onClick={(e) => {
          if (!isFolder) return;
          e.stopPropagation();
          controller.toggle(row.id);
        }}
        className={cn(
          "w-3.5 shrink-0 inline-flex items-center justify-center text-muted-foreground",
          isFolder ? "cursor-pointer" : "cursor-default"
        )}
      >
        {isFolder ? (isExpanded ? "▾" : "▸") : ""}
      </span>
      <Icon
        size={13}
        strokeWidth={1.75}
        className={cn(
          "shrink-0",
          selected ? "text-accent-foreground" : "text-muted-foreground"
        )}
      />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

"use client";

import type { Row, TreeController } from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";
import type { DemoMeta } from "./_fixtures";
import { DemoRow } from "./_row";

interface VirtualPanelProps {
  controller: TreeController<DemoMeta>;
  className?: string;
  /**
   * When set, the inner virtual canvas gets this `min-width` (px) so
   * deeply-indented rows can extend past the container's right edge and
   * the container shows a horizontal scrollbar. Leave undefined for the
   * default "row hugs container width" behavior.
   */
  minInnerWidth?: number;
  /** Override the default `DemoRow` renderer. */
  renderRow?: (row: Row, meta: DemoMeta | undefined) => React.ReactNode;
}

/**
 * Demonstrates plugging `controller.getRows()` into `@tanstack/react-virtual`.
 * The package itself does not depend on the virtualizer — this is purely a
 * consumer-side recipe.
 */
export function VirtualPanel({
  controller,
  className,
  minInnerWidth,
  renderRow,
}: VirtualPanelProps) {
  return (
    <TreeProvider controller={controller}>
      <Inner
        className={className}
        minInnerWidth={minInnerWidth}
        renderRow={renderRow}
      />
    </TreeProvider>
  );
}

function Inner({
  className,
  minInnerWidth,
  renderRow,
}: {
  className?: string;
  minInnerWidth?: number;
  renderRow?: (row: Row, meta: DemoMeta | undefined) => React.ReactNode;
}) {
  const controller = useTree<DemoMeta>();
  const rows = useTreeSnapshot((c) => c.getRows());
  const parentRef = React.useRef<HTMLDivElement | null>(null);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 12,
  });

  // When horizontal scroll is enabled, rows sit at `width: 100%` of the
  // inner wrapper (which is at least `minInnerWidth` wide) instead of
  // hugging the container. This is the canonical "scroll both axes"
  // pattern for indented virtual lists — render-cost still scales with
  // visible-row count, not depth.
  const rowStyle: React.CSSProperties = minInnerWidth
    ? { position: "absolute", top: 0, left: 0, width: "100%" }
    : { position: "absolute", top: 0, left: 0, right: 0 };

  return (
    <div
      ref={parentRef}
      className={[
        "border border-gray-200 bg-white rounded overflow-auto",
        className ?? "h-72",
      ].join(" ")}
    >
      <div
        style={{
          height: virt.getTotalSize(),
          position: "relative",
          width: minInnerWidth ? minInnerWidth : "100%",
          minWidth: minInnerWidth ? minInnerWidth : undefined,
        }}
      >
        {virt.getVirtualItems().map((vi) => {
          const row = rows[vi.index];
          const meta = controller.source.getNode(row.id).meta;
          return (
            <div
              key={row.id}
              data-virtual-row
              style={{
                ...rowStyle,
                transform: `translateY(${vi.start}px)`,
                height: vi.size,
              }}
            >
              {renderRow ? (
                renderRow(row, meta)
              ) : (
                <DemoRow row={row} label={meta?.label ?? row.id} meta={meta} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

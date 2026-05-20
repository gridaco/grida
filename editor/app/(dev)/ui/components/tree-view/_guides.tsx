"use client";

import type { NodeId, Row, TreeSource } from "@grida/tree-view";
import { useTreeSnapshot } from "@grida/tree-view/react";
import * as React from "react";
import type { DemoMeta } from "./_fixtures";

/**
 * Guide-line overlay layer. Renders independently of the rows so the lines
 * remain continuous across row padding/gaps. The SDK user — not the
 * package — decides what to draw and where.
 *
 * The overlay reads:
 *   - the flat row list (for layout)
 *   - the source (for per-node semantics like `mask: true`)
 *
 * Each guide is described by a small struct (`x`, `y0`, `y1`, style) and
 * rendered as a pure SVG line. Consumers can swap the renderer for
 * branch corners (┌, └), arrow markers, or custom shapes — none of it
 * touches the row.
 */
export interface TreeGuidesProps {
  /** Px per row. The demo's rows are `h-7` = 28 px. */
  rowHeight?: number;
  /** Px from the row's left edge to the first depth tick (matches the
   *  row's `paddingLeft: 4`). */
  indentBase?: number;
  /** Px per indent level (matches the row's `* 12` indent). */
  indentStep?: number;
  /** Half-width of the chevron box (square icon) in px — used to center
   *  the rail under the parent's chevron. DemoRow uses `size-4` chevrons
   *  (16 px), so half = 8. */
  chevronHalfWidth?: number;
}

interface GuideSpan {
  /** Visible depth of the *parent* (the mask container) — the rail is
   *  drawn through the column of the parent's chevron, which is the
   *  conventional indent-guide position in tree views. */
  parentDepth: number;
  /** First row index covered (inclusive — usually the parent row itself). */
  startIndex: number;
  /** Last row index covered (inclusive — last visible descendant). */
  endIndex: number;
  kind: "mask";
}

export function TreeGuides({
  rowHeight = 28,
  indentBase = 4,
  indentStep = 12,
  chevronHalfWidth = 8,
}: TreeGuidesProps) {
  const rows = useTreeSnapshot((c) => c.getRows());
  const source = useTreeSnapshot((c) => c.source) as TreeSource<DemoMeta>;

  // Pre-index rows by id for O(1) lookup while resolving descendant
  // ranges, then collect a guide span per mask container.
  const spans: GuideSpan[] = React.useMemo(() => {
    const indexById = new Map<NodeId, number>();
    for (let i = 0; i < rows.length; i++) indexById.set(rows[i].id, i);

    const out: GuideSpan[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const meta = source.getNode(row.id).meta;
      if (!meta?.mask) continue;
      if (!row.isExpanded) continue;
      const last = lastVisibleDescendantIndex(rows, i);
      if (last <= i) continue;
      out.push({
        parentDepth: row.depth,
        startIndex: i,
        endIndex: last,
        kind: "mask",
      });
    }
    return out;
  }, [rows, source]);

  if (spans.length === 0) return null;

  const totalHeight = rows.length * rowHeight;

  return (
    <svg
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      width="100%"
      height={totalHeight}
      style={{ height: totalHeight }}
    >
      {spans.map((s, i) => {
        // Align the rail with the *parent*'s chevron-center column:
        //   row paddingLeft     = indentBase + depth * indentStep
        //   chevron center      = paddingLeft + chevronHalfWidth
        // The `+ 0.5` is a sub-pixel nudge so the 1px stroke renders
        // sharp on integer-x devices instead of straddling two columns.
        const x =
          indentBase + s.parentDepth * indentStep + chevronHalfWidth + 0.5;
        // Start just below the parent row's chevron line, end mid-way
        // through the last descendant — visually closes off the rail.
        const y0 = s.startIndex * rowHeight + rowHeight * 0.7;
        const y1 = s.endIndex * rowHeight + rowHeight * 0.5;
        return (
          <g key={i}>
            {/* vertical rail */}
            <line
              x1={x}
              y1={y0}
              x2={x}
              y2={y1}
              stroke="#60a5fa"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            {/* terminator at the last descendant (┘-shaped tick) */}
            <line
              x1={x}
              y1={y1}
              x2={x + 4}
              y2={y1}
              stroke="#60a5fa"
              strokeWidth={1}
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Pure: given a flat row list and the index of a parent row, return the
 * index of the parent's last visible descendant (or `parentIndex` itself
 * when the parent has no visible descendants).
 *
 * Uses depth comparison: a descendant is any subsequent row whose depth is
 * greater than the parent's; the run ends at the first row whose depth is
 * less than or equal.
 */
function lastVisibleDescendantIndex(
  rows: readonly Row[],
  parentIndex: number
): number {
  const parentDepth = rows[parentIndex].depth;
  let i = parentIndex + 1;
  while (i < rows.length && rows[i].depth > parentDepth) i++;
  return i - 1;
}

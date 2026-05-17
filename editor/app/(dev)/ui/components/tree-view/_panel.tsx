"use client";

import {
  autoScrollDelta,
  defaultKeymap,
  desiredDepthFromX,
  passedDragThreshold,
  placementFromY,
  rowDepthOf,
  snapToEdge,
  type DragHandle,
  type DropPlacement,
  type Keymap,
  type NodeId,
  type Row,
  type TreeController,
  type TreeIntent,
} from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import * as React from "react";
import { DemoRow } from "./_row";
import { TreeGuides } from "./_guides";
import type { DemoMeta } from "./_fixtures";

export interface RenderRowArgs {
  row: Row;
  index: number;
  isDropTarget: boolean;
  dropPlacement: DropPlacement | null;
  dropDepth: number;
  /**
   * `true` when this row is the resolved drop's **parent** — i.e. the
   * insertion is happening *inside* this row. Set independently of the
   * over-row, so a folder gets this flag whether the cursor is hovering
   * the folder header (placement=into) or any of its children
   * (placement=before/after with parent = this folder).
   *
   * Use this to highlight the *container* the user is dropping into,
   * even when the cursor is over one of its leaves.
   */
  isDropParent: boolean;
  indentBase: number;
  indentStep: number;
  /**
   * `true` while *any* drag is in progress (not just a drag of this row).
   * Rows should use it to suppress `:hover` styles — without this, every
   * row the pointer crosses during a drag briefly flashes its hover
   * background, which competes visually with the drop indicator.
   *
   * The package itself never disables pointer-events (that would break
   * `elementFromPoint`-based hit-testing). Suppressing hover is a
   * presentational concern the consumer owns.
   *
   * CSS-only consumers can read the same signal from the
   * `data-dragging` attribute the container sets while a drag is active.
   */
  isDragActive: boolean;
  onDragStart?: (id: NodeId, e: React.PointerEvent) => void;
}

export interface DemoPanelProps {
  controller: TreeController<DemoMeta>;
  keymap?: Keymap | null;
  enableDrag?: boolean;
  /** Forward intents emitted by the controller. */
  onIntent?: (intent: TreeIntent) => void;
  /**
   * Render a guides overlay over the tree (depth rails for mask
   * containers, in this demo). Opt-in — most consumers don't want any
   * guides by default.
   */
  guides?: boolean;
  className?: string;
  /**
   * Indent in px from the row's left edge to depth-0's tick. Defaults to 4.
   * Must match whatever the row renderer uses for padding-left.
   */
  indentBase?: number;
  /** Indent step in px per depth level. Defaults to 12. */
  indentStep?: number;
  /** Override the default row renderer. */
  renderRow?: (args: RenderRowArgs) => React.ReactNode;
}

export function DemoPanel(props: DemoPanelProps) {
  const { controller } = props;
  React.useEffect(() => {
    if (!props.onIntent) return;
    return controller.subscribe("intent", props.onIntent);
  }, [controller, props.onIntent]);
  return (
    <TreeProvider controller={controller}>
      <PanelInner {...props} />
    </TreeProvider>
  );
}

function PanelInner({
  keymap,
  enableDrag,
  guides,
  className,
  indentBase: indentBaseProp,
  indentStep: indentStepProp,
  renderRow,
}: DemoPanelProps) {
  const controller = useTree<DemoMeta>();
  const rows = useTreeSnapshot((c) => c.getRows());
  const indentBase = indentBaseProp ?? 4;
  const indentStep = indentStepProp ?? 12;
  // Pull only the drop position (stable ref between drag updates). Building
  // an object literal in the selector would defeat Object.is and create an
  // update loop.
  const dragPosition = useTreeSnapshot(
    (c) => c.getDrag()?.getPosition() ?? null
  );
  const isDragActive = useTreeSnapshot((c) => c.getDrag() !== null);

  const dragRef = React.useRef<DragHandle | null>(null);
  const pendingRef = React.useRef<{
    id: NodeId;
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Resolve "which row is the cursor over, where in it, and at what
  // depth does the user want to land?" against the tree container.
  //
  // Outside-aware: when the cursor is above the tree's first visible row,
  // we snap to "before" the first row; when below the last, "after" the
  // last. This keeps the drop indicator visible even when the user drags
  // past either end, which is what graphics tools do.
  //
  // Horizontal-aware: cursor x decides the visible depth the user wants
  // to drop at. For `before`/`after` placements this is passed to the
  // drag handle as `desiredDepth` and the handle walks up the over row's
  // ancestor chain — letting cursor-x "pop out" of a deeply nested
  // container without moving vertically.
  const hitTestRow = React.useCallback(
    (
      x: number,
      y: number
    ): {
      id: NodeId;
      placement: DropPlacement;
      desiredDepth: number;
    } | null => {
      const container = containerRef.current;
      if (!container) return null;
      const INDENT_BASE = indentBase;
      const INDENT_STEP = indentStep;
      const containerRect = container.getBoundingClientRect();
      const insideX = x >= containerRect.left && x <= containerRect.right;
      const rowEls =
        container.querySelectorAll<HTMLElement>("[data-tree-row-id]");
      if (rowEls.length === 0) return null;

      const desiredDepthFor = (rowEl: HTMLElement): number => {
        const rect = rowEl.getBoundingClientRect();
        const rowDepth = Number(rowEl.getAttribute("data-row-depth") ?? 0);
        return desiredDepthFromX(
          x - rect.left,
          INDENT_BASE,
          INDENT_STEP,
          rowDepth
        );
      };

      // Direct hit — works when the cursor is over the tree. When the
      // cursor leaves the tree (horizontally OR onto an overlay), this
      // either returns an element outside the container or `null`, and we
      // fall through to the Y-based recovery below. That recovery is what
      // keeps the drop indicator following the pointer when the user
      // drags outside the panel.
      if (insideX) {
        const el = document.elementFromPoint(x, y);
        if (el && container.contains(el)) {
          const rowEl = el.closest<HTMLElement>("[data-tree-row-id]");
          if (rowEl && container.contains(rowEl)) {
            const id = rowEl.getAttribute("data-tree-row-id");
            if (id) {
              const rect = rowEl.getBoundingClientRect();
              return {
                id,
                placement: placementFromY(y - rect.top, rect.height),
                desiredDepth: desiredDepthFor(rowEl),
              };
            }
          }
        }
      }

      // Y-based recovery: cursor is outside the tree horizontally (or
      // covered by something), but its Y still lines up with a row. Walk
      // the row list and pick the one whose vertical range contains Y.
      // This is what makes the drop indicator keep tracking the pointer
      // when the user drags off to the side. desiredDepth still uses the
      // cursor X (clamped by `desiredDepthFromX`) so horizontal
      // re-indenting from outside the panel works too.
      const firstRect = rowEls[0].getBoundingClientRect();
      const lastRect = rowEls[rowEls.length - 1].getBoundingClientRect();
      if (y >= firstRect.top && y <= lastRect.bottom) {
        for (let i = 0; i < rowEls.length; i++) {
          const rowEl = rowEls[i];
          const rect = rowEl.getBoundingClientRect();
          if (y >= rect.top && y <= rect.bottom) {
            const id = rowEl.getAttribute("data-tree-row-id");
            if (!id) continue;
            return {
              id,
              placement: placementFromY(y - rect.top, rect.height),
              desiredDepth: desiredDepthFor(rowEl),
            };
          }
        }
      }

      // Off the top or bottom — snap to first/last visible row's edge.
      // The snap is intentionally X-tolerant: when the user drags above
      // or below the tree we still want a clear drop indicator regardless
      // of where the cursor wanders horizontally.
      const snap = snapToEdge(y, firstRect.top, lastRect.bottom);
      if (snap === "before-first") {
        return {
          id: rowEls[0].getAttribute("data-tree-row-id")!,
          placement: "before",
          desiredDepth: desiredDepthFor(rowEls[0]),
        };
      }
      if (snap === "after-last") {
        const lastEl = rowEls[rowEls.length - 1];
        return {
          id: lastEl.getAttribute("data-tree-row-id")!,
          placement: "after",
          desiredDepth: desiredDepthFor(lastEl),
        };
      }
      return null;
    },
    [indentBase, indentStep]
  );

  // Latest pointer position — read by the auto-scroll RAF loop so it
  // can re-hit-test after each scroll step.
  const lastPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const autoScrollRafRef = React.useRef<number | null>(null);

  const stopAutoScroll = React.useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  // Auto-scroll the tree while the cursor is near (or past) its top/bottom
  // edge during a drag. Continues until the cursor exits the edge zone or
  // the drag ends. Re-runs hit-test after every scroll step so the drop
  // indicator tracks the row newly under the cursor.
  const tickAutoScroll = React.useCallback(() => {
    autoScrollRafRef.current = null;
    const container = containerRef.current;
    const handle = dragRef.current;
    const last = lastPointerRef.current;
    if (!container || !handle || !last) return;
    const rect = container.getBoundingClientRect();
    const dy = autoScrollDelta(rect.top, rect.bottom, last.y);
    if (dy === 0) return;
    const before = container.scrollTop;
    container.scrollTop += dy;
    const moved = container.scrollTop !== before;
    if (moved) {
      const hit = hitTestRow(last.x, last.y);
      if (hit)
        handle.over(hit.id, hit.placement, { desiredDepth: hit.desiredDepth });
    }
    // Continue scrolling next frame while we're still in the edge zone
    // (and the scroll actually moved — i.e. we're not at min/max scroll).
    if (moved) {
      autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
    }
  }, [hitTestRow]);

  // While a drag is active (or pending), listen at the window level so
  // events keep firing even when the cursor leaves the tree.
  React.useEffect(() => {
    if (!enableDrag) return;
    const DRAG_THRESHOLD_PX = 4;

    const onMove = (e: PointerEvent) => {
      // Once a drag/pending exists, ignore every other pointer (multi-touch).
      const activePointerId = pendingRef.current?.pointerId;
      if (activePointerId !== undefined && e.pointerId !== activePointerId)
        return;
      const pending = pendingRef.current;
      if (pending && pending.pointerId === e.pointerId && !dragRef.current) {
        if (
          !passedDragThreshold(
            pending.startX,
            pending.startY,
            e.clientX,
            e.clientY,
            DRAG_THRESHOLD_PX
          )
        )
          return;
        const sel = controller.getSelection();
        const items = sel.includes(pending.id) ? sel : [pending.id];
        dragRef.current = controller.startDrag(items, {
          mode: e.altKey ? "copy" : "move",
        });
      }
      const handle = dragRef.current;
      if (!handle) return;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      const hit = hitTestRow(e.clientX, e.clientY);
      if (hit) {
        handle.over(hit.id, hit.placement, {
          desiredDepth: hit.desiredDepth,
        });
      }
      // Kick the auto-scroll loop if we're near an edge and not already
      // ticking.
      const container = containerRef.current;
      if (container && autoScrollRafRef.current === null) {
        const rect = container.getBoundingClientRect();
        const EDGE = 32;
        if (e.clientY < rect.top + EDGE || e.clientY > rect.bottom - EDGE) {
          autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const activePointerId = pendingRef.current?.pointerId;
      if (activePointerId !== undefined && e.pointerId !== activePointerId)
        return;
      stopAutoScroll();
      if (dragRef.current) {
        controller.commitDrag();
        dragRef.current = null;
      }
      pendingRef.current = null;
      lastPointerRef.current = null;
    };

    const onAlt = (e: KeyboardEvent) => {
      if (!dragRef.current || e.key !== "Alt") return;
      dragRef.current.setMode(e.type === "keydown" ? "copy" : "move");
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onAlt);
    window.addEventListener("keyup", onAlt);
    return () => {
      stopAutoScroll();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onAlt);
      window.removeEventListener("keyup", onAlt);
    };
  }, [controller, enableDrag, hitTestRow, stopAutoScroll, tickAutoScroll]);

  const onDragStart = React.useCallback(
    (id: NodeId, e: React.PointerEvent) => {
      if (!enableDrag) return;
      pendingRef.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
      };
    },
    [enableDrag]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!keymap) return;
    const r = controller.keyDown(e.nativeEvent, keymap);
    if (r.handled) e.preventDefault();
  };

  return (
    <div
      ref={containerRef}
      role="tree"
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-dragging={isDragActive ? "" : undefined}
      className={[
        "outline-none focus:ring-2 focus:ring-blue-300 rounded",
        "border border-gray-200 bg-white overflow-auto",
        className ?? "h-72",
      ].join(" ")}
    >
      <div className="relative">
        {rows.map((row, index) => {
          const isTarget =
            !!dragPosition &&
            (dragPosition.over === row.id ||
              (dragPosition.placement === "into" &&
                dragPosition.parent === row.id));
          // The drop line's indent must follow the resolved position,
          // not the over-row's depth — so horizontal cursor movement
          // visually re-indents the line.
          const dropDepth =
            isTarget && dragPosition && dragPosition.placement !== "into"
              ? rowDepthOf(controller.source, dragPosition.parent) + 1
              : row.depth;
          const args: RenderRowArgs = {
            row,
            index,
            isDropTarget: isTarget,
            dropPlacement:
              dragPosition?.over === row.id ? dragPosition.placement : null,
            dropDepth,
            isDropParent: !!dragPosition && dragPosition.parent === row.id,
            indentBase,
            indentStep,
            isDragActive,
            onDragStart: enableDrag ? onDragStart : undefined,
          };
          return renderRow ? (
            <React.Fragment key={row.id}>{renderRow(args)}</React.Fragment>
          ) : (
            <RowItem key={row.id} {...args} />
          );
        })}
        {/* Guides render *after* the rows so the overlay paints on top —
            row backgrounds (hover, selected, drop highlight) would
            otherwise occlude the rail. The overlay is pointer-events:none
            so it doesn't intercept clicks or drag hit-tests. */}
        {guides ? <TreeGuides /> : null}
      </div>
    </div>
  );
}

function RowItem({
  row,
  isDropTarget,
  dropPlacement,
  dropDepth,
  isDragActive,
  onDragStart,
}: RenderRowArgs) {
  const meta = useTreeSnapshot<DemoMeta, DemoMeta | undefined>(
    (c) => c.source.getNode(row.id).meta
  );
  const label = meta?.label ?? row.id;
  return (
    <DemoRow
      row={row}
      label={label}
      meta={meta}
      isDropTarget={isDropTarget}
      dropPlacement={dropPlacement}
      dropDepth={dropDepth}
      isDragActive={isDragActive}
      onDragStart={onDragStart}
    />
  );
}

/**
 * Own a controller for the component's lifetime: build it once, dispose it
 * on unmount. Every demo panel needs exactly this — centralizing it is why
 * the `exhaustive-deps` suppression lives here and nowhere else.
 */
export function useDemoController<T>(
  factory: () => TreeController<T>
): TreeController<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const controller = React.useMemo(factory, []);
  React.useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}

/**
 * The per-row controller subscriptions every themed row needs. Bundled so
 * the theme rows don't each re-declare the same five hooks.
 */
export function useRowSnapshot(id: NodeId): {
  controller: TreeController<DemoMeta>;
  meta: DemoMeta | undefined;
  selected: boolean;
  focused: boolean;
  isDragging: boolean;
} {
  const controller = useTree<DemoMeta>();
  const meta = useTreeSnapshot<DemoMeta, DemoMeta | undefined>(
    (c) => c.source.getNode(id).meta
  );
  const selected = useTreeSnapshot((c) => c.getSelection().includes(id));
  const focused = useTreeSnapshot((c) => c.getFocused() === id);
  const isDragging = useTreeSnapshot(
    (c) => c.getDrag()?.items.includes(id) ?? false
  );
  return { controller, meta, selected, focused, isDragging };
}

export { defaultKeymap };

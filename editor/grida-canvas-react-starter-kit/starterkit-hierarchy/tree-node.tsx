"use client";

/**
 * Hierarchy UI for the Grida Canvas editor — the layers panel.
 *
 * Driven by `@grida/tree-view` (`TreeController`): the editor owns the
 * hierarchy + selection; this is a read-only live view that emits a `move`
 * intent on drag-commit, applied back via `editor.commands.mv`.
 *
 * Layer-panel convention is visual-top = last in document order, so the
 * controller flattens with `reverseChildren`. The package's drag math is
 * document-order; the consumer flips before/after when feeding `over()`
 * (see FEEDBACKS — "Consumer #2"). Auto-expand-to-reveal-selection is
 * `controller.expandTo` (additive — never auto-collapses the user's
 * manual expansions).
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useCurrentEditor,
  useEditorState,
  useContextMenuActions,
  ContextMenuAction,
} from "@/grida-canvas-react";
import { Tree, TreeDragLine } from "@/components/ui-editor/tree";
import {
  TreeController,
  onlyIntoContainers,
  passedDragThreshold,
  placementFromY,
  desiredDepthFromX,
  subtreeMembership,
  autoScrollDelta,
  snapToEdge,
  type DragHandle,
  type DropPlacement,
  type NodeId,
} from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useCurrentSceneState } from "@/grida-canvas-react/provider";
import grida from "@grida/schema";
import { EditorTreeSource } from "./tree-source";
import { NodeHierarchyTreeItem } from "./node-hierarchy-tree-item";
import { computeNodeMaskMap } from "./mask";

const CONTAINER_NODE_TYPES = new Set([
  "scene",
  "container",
  "tray",
  "group",
  "boolean",
]);

function isNodeContainer(node: grida.program.nodes.Node | undefined): boolean {
  return !!node && CONTAINER_NODE_TYPES.has(node.type);
}

// Visual indent step (px / depth level). Shared by `<Tree indent>` and the
// horizontal pop-out geometry so the gesture maps 1:1 to what's rendered —
// a mismatch would silently mis-resolve the plain (no-x) reorder.
const TREE_INDENT = 6;

const EMPTY_SET: ReadonlySet<NodeId> = new Set();

// The Layers panel doesn't own its scroll box — it's mounted inside a
// `SidebarGroupContent` (overflow-y-auto). Drag auto-scroll must scroll
// that ancestor, so walk up to the nearest actually-scrollable one.
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const oy = getComputedStyle(cur).overflowY;
    if (
      (oy === "auto" || oy === "scroll") &&
      cur.scrollHeight > cur.clientHeight
    )
      return cur;
    cur = cur.parentElement;
  }
  return null;
}

function NodeHierarchyItemContextMenuWrapper({
  node_id,
  children,
  onStartRenaming,
}: React.PropsWithChildren<{
  node_id: string;
  onStartRenaming?: () => void;
}>) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <__ContextMenuContent
          node_id={node_id}
          onStartRenaming={onStartRenaming}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function __ContextMenuContent({
  node_id,
  onStartRenaming,
}: {
  node_id: string;
  onStartRenaming?: () => void;
}) {
  const actions = useContextMenuActions([node_id]);
  const ActionItem = ({ action }: { action: ContextMenuAction }) => (
    <ContextMenuItem
      onSelect={action.onSelect}
      disabled={action.disabled}
      className="text-xs"
    >
      {action.label}
      {action.shortcut && (
        <ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut>
      )}
    </ContextMenuItem>
  );
  return (
    <>
      <ActionItem action={actions.copy} />
      <ContextMenuSub>
        <ContextMenuSubTrigger className="text-xs">
          Copy/Paste as...
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ActionItem action={actions.copyAsSVG} />
          <ActionItem action={actions.copyAsPNG} />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ActionItem
        action={{
          label: "Rename",
          onSelect: onStartRenaming || (() => {}),
          disabled: !onStartRenaming,
        }}
      />
      <ActionItem action={actions.flatten} />
      {actions.removeMask.disabled ? (
        <ActionItem action={actions.groupMask} />
      ) : (
        <ActionItem action={actions.removeMask} />
      )}
      <ContextMenuSeparator />
      <ActionItem action={actions.bringToFront} />
      <ActionItem action={actions.sendToBack} />
      <ContextMenuSeparator />
      <ActionItem action={actions.group} />
      <ActionItem action={actions.ungroup} />
      <ActionItem action={actions.groupWithContainer} />
      <ActionItem action={actions.autoLayout} />
      <ContextMenuSeparator />
      <ActionItem action={actions.zoomToFit} />
      <ContextMenuSeparator />
      <ActionItem action={actions.toggleActive} />
      <ActionItem action={actions.toggleLocked} />
      <ContextMenuSeparator />
      <ActionItem action={actions.delete} />
    </>
  );
}

export interface NodeHierarchyListProps {
  /** Tree root node id. The hierarchy shows this node's subtree. */
  rootId: string;
}

/**
 * Isolation-aware default: resolves `rootId` from editor state
 * (`isolation_root_node_id` → scene id) so existing callers that
 * don't manage their own root keep working.
 */
export function IsolationNodeHierarchyList() {
  const editor = useCurrentEditor();
  const sceneState = useCurrentSceneState();
  const isolation_root_node_id = useEditorState(
    editor,
    (state) => state.isolation_root_node_id
  );
  const id = isolation_root_node_id ?? sceneState.id;
  return <NodeHierarchyList rootId={id} />;
}

export function NodeHierarchyList({ rootId }: NodeHierarchyListProps) {
  const editor = useCurrentEditor();
  const document_ctx = useEditorState(editor, (state) => state.document_ctx);
  const nodes = useEditorState(
    editor,
    (state) => state.document.nodes,
    // Custom comparator: treat `nodes` as unchanged when only non-display
    // fields (transform, fills, effects, etc.) differ. Immer preserves
    // per-node identity for untouched nodes, so this walk is O(N) with
    // an early `na === nb` short-circuit on each unchanged entry.
    (a, b) => {
      if (a === b) return true;
      const aKeys = Object.keys(a);
      if (aKeys.length !== Object.keys(b).length) return false;
      for (const id of aKeys) {
        const na = a[id];
        const nb = b[id];
        if (na === nb) continue;
        if (!na || !nb) return false;
        if (na.name !== nb.name) return false;
        if (na.type !== nb.type) return false;
        if ((na.active ?? true) !== (nb.active ?? true)) return false;
        if ((na.locked ?? false) !== (nb.locked ?? false)) return false;
        if ((na as { mask?: unknown }).mask !== (nb as { mask?: unknown }).mask)
          return false;
      }
      return true;
    }
  );

  const sceneState = useCurrentSceneState();
  const id = rootId;
  const children =
    id !== sceneState.id
      ? (editor.state.document.links[id] ?? document_ctx.lu_children[id] ?? [])
      : sceneState.children_refs;
  const { selection, hovered_node_id } = sceneState;

  const maskInfoMap = useMemo(
    () =>
      computeNodeMaskMap({
        documentCtx: document_ctx,
        nodes,
        sceneChildren: children,
      }),
    [children, document_ctx, nodes]
  );

  const source = useMemo(
    () =>
      new EditorTreeSource<grida.program.nodes.Node>({
        root: id,
        getChildIds: (nid) => editor.state.document_ctx.lu_children[nid] ?? [],
        getMeta: (nid) => editor.state.document.nodes[nid],
        isContainer: (_nid, meta) => isNodeContainer(meta),
      }),
    [editor, id]
  );
  const controller = useMemo(
    () =>
      new TreeController<grida.program.nodes.Node>({
        source,
        flatten: { reverseChildren: true },
        constraint: onlyIntoContainers(),
      }),
    [source]
  );
  useEffect(() => () => controller.dispose(), [controller]);

  // Push editor hierarchy/display changes into the read-only source.
  // The canvas/wasm backend keeps `state.document` referentially stable,
  // so a `useEditorState`-dep effect never re-fires on mutation — drive
  // the snapshot off the editor's own change stream instead.
  useEffect(() => {
    source.refresh();
    return editor.doc.subscribeWithSelector(
      (s) => s.document,
      () => source.refresh()
    );
  }, [editor, source]);

  // Reorder bridge: the package never mutates — `commitDrag()` emits a
  // `move` intent. `to.index` is the post-removal document-order index,
  // exactly what `editor.commands.mv` expects (it detaches then splices).
  useEffect(() => {
    return controller.subscribe("intent", (intent) => {
      if (intent.kind !== "move") return;
      const ids = intent.items.filter((i) => i in editor.state.document.nodes);
      if (ids.length === 0) return;
      editor.commands.mv(ids, intent.to.parent, intent.to.index);
    });
  }, [controller, editor]);

  return (
    <TreeProvider controller={controller} key={id}>
      <NodeHierarchyListInner
        nodes={nodes}
        rootId={id}
        selection={selection}
        hoveredNodeId={hovered_node_id}
        maskInfoMap={maskInfoMap}
      />
    </TreeProvider>
  );
}

function NodeHierarchyListInner({
  nodes,
  rootId,
  selection,
  hoveredNodeId,
  maskInfoMap,
}: {
  nodes: Record<string, grida.program.nodes.Node>;
  rootId: string;
  selection: readonly string[];
  hoveredNodeId: string | null | undefined;
  maskInfoMap: ReturnType<typeof computeNodeMaskMap>;
}) {
  const editor = useCurrentEditor();
  const controller = useTree<grida.program.nodes.Node>();
  const rows = useTreeSnapshot((c) => c.getRows());
  const focusedId = useTreeSnapshot((c) => c.getFocused());
  const isDragging = useTreeSnapshot((c) => c.getDrag() !== null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{
    overId: string;
    side: DropPlacement;
    parent: string;
  } | null>(null);
  const [dragLineTop, setDragLineTop] = useState<number | null>(null);
  const [dragLineIndent, setDragLineIndent] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragHandle | null>(null);
  const pendingRef = useRef<{
    id: string;
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const anchorRef = useRef<string | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);

  const selectionSet = useMemo(() => new Set(selection), [selection]);

  // Selection group-extent highlight (consumer recipe over the package's
  // pure `subtreeMembership`). Memoized at panel level so each row is an
  // O(1) `set.has(id)` instead of an ancestor walk per row per render.
  // `rows` is the reactive proxy for source-version bumps — `source`
  // keeps a stable identity across refreshes, so a deps list without
  // `rows` would never recompute on a pure move/reorder. `source.getNode`
  // throws on ids the snapshot doesn't have yet (host-owned selection can
  // lead the refresh), so it's computed defensively.
  //
  // Note: the *drop* target deliberately highlights only the resolved
  // container itself (the `dropParent` flag), never its descendants —
  // matching the Grida/Figma demo, which skips the drag-over subtree.
  const source = controller.source;

  const selectionGroupSet = useMemo<ReadonlySet<NodeId>>(() => {
    const anchors = selection.filter((id) => isNodeContainer(nodes[id]));
    if (anchors.length === 0) return EMPTY_SET;
    try {
      // Exclusive: the selected container keeps its own (stronger)
      // selected style; only its descendants get the faint group fill.
      return subtreeMembership(source, anchors, { inclusive: false });
    } catch {
      return EMPTY_SET;
    }
  }, [source, nodes, selection, rows]);

  // Selection mirrors the editor (host-owned). Click resolves the mode
  // against the *visible* rows; range walks the flat list like the old
  // selectionFeature did.
  const onRowClick = useCallback(
    (rowId: string, e: React.MouseEvent) => {
      if (e.shiftKey) {
        const anchor = anchorRef.current ?? selection[0] ?? rowId;
        const ai = rows.findIndex((r) => r.id === anchor);
        const ti = rows.findIndex((r) => r.id === rowId);
        if (ai >= 0 && ti >= 0) {
          const [from, to] = ai <= ti ? [ai, ti] : [ti, ai];
          editor.commands.select(rows.slice(from, to + 1).map((r) => r.id));
          return;
        }
      }
      if (e.metaKey || e.ctrlKey) {
        const next = new Set(selection);
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        anchorRef.current = rowId;
        editor.commands.select([...next]);
        return;
      }
      anchorRef.current = rowId;
      editor.commands.select([rowId]);
    },
    [editor, rows, selection]
  );

  // Reveal the active selection: expand its ancestors + move focus.
  // `controller.reveal` walks ancestors through the source and is
  // additive (never auto-collapses the user's manual expansions). It is
  // stale-safe since F11.1 — `_peek` no-ops instead of throwing for the
  // tick between insert-select and `source.refresh`; re-running on `rows`
  // re-reveals once the refresh brings the node into the snapshot.
  // `select: false` because selection is host-owned (the editor drives
  // it, not the controller's adapter).
  useEffect(() => {
    const first = selection[0];
    if (first) controller.reveal(first, { select: false });
  }, [controller, selection, rows]);

  // Scroll the first selected row into view once it actually exists in
  // the rendered rows (re-runs when the snapshot refreshes it in).
  useEffect(() => {
    const first = selection[0];
    if (!first) return;
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-tree-row-id="${CSS.escape(first)}"]`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
  }, [selection, rows]);

  // Outside-aware flat hit-test. Direct hit via `elementFromPoint`; if the
  // cursor leaves the panel sideways (or is occluded) fall back to a
  // Y-range scan; past either end, snap to the first/last row's edge so
  // the drop indicator keeps tracking the pointer (graphics-tool feel).
  //
  // Containers get the 3-way split (middle = `into`); leaves 2-way (F4).
  // The list is rendered reversed; the controller flattens with
  // `reverseChildren`, so `handle.over()` is reverse-aware and we feed it
  // the *visual* side directly — no consumer-side flip. `desiredDepth`
  // makes the drop horizontal-aware (consumer-owned glue; the package
  // only does the `f(numbers,source)→numbers` walk): cursor toward the
  // left gutter lowers the target depth so a deeply-nested last child can
  // be dropped *after its container* without moving vertically.
  // `indentBase: 0` clamps it to the over-row's own depth while the
  // cursor rests on the row (no regression to the plain reorder);
  // `TREE_INDENT` mirrors the rendered step exactly.
  const hitTest = useCallback(
    (
      clientY: number,
      clientX: number
    ): {
      overId: string;
      side: DropPlacement;
      desiredDepth: number;
    } | null => {
      const container = containerRef.current;
      if (!container) return null;
      const els = Array.from(
        container.querySelectorAll<HTMLElement>("[data-tree-row-id]")
      );
      if (els.length === 0) return null;

      const resolve = (
        el: HTMLElement,
        snap?: "before" | "after"
      ): { overId: string; side: DropPlacement; desiredDepth: number } => {
        const r = el.getBoundingClientRect();
        const overId = el.dataset.treeRowId!;
        const row = rows.find((x) => x.id === overId);
        const side: DropPlacement = snap
          ? snap
          : placementFromY(clientY - r.top, r.height, {
              into: !!row?.isContainer,
            });
        const desiredDepth = desiredDepthFromX(
          clientX - r.left,
          0,
          TREE_INDENT,
          row?.depth ?? 0
        );
        return { overId, side, desiredDepth };
      };

      // Direct hit — cursor inside the panel, over a row.
      const cRect = container.getBoundingClientRect();
      if (clientX >= cRect.left && clientX <= cRect.right) {
        const el = document.elementFromPoint(clientX, clientY);
        const rowEl = el?.closest<HTMLElement>("[data-tree-row-id]");
        if (rowEl && container.contains(rowEl)) return resolve(rowEl);
      }

      // Y-recovery — cursor off to the side but still level with a row.
      const firstR = els[0].getBoundingClientRect();
      const lastR = els[els.length - 1].getBoundingClientRect();
      if (clientY >= firstR.top && clientY <= lastR.bottom) {
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (clientY >= r.top && clientY <= r.bottom) return resolve(el);
        }
      }

      // Past the top/bottom — snap to the boundary row's edge.
      const snap = snapToEdge(clientY, firstR.top, lastR.bottom);
      if (snap === "before-first") return resolve(els[0], "before");
      if (snap === "after-last") return resolve(els[els.length - 1], "after");
      return null;
    },
    [rows]
  );

  // Apply a hit to the drag handle and mirror the resolved position into
  // local drop state (the package keeps the canonical drag position; we
  // keep a copy so the indicator/highlights render without a snapshot
  // round-trip). Shared by pointer-move and the auto-scroll loop.
  const applyHit = useCallback(
    (handle: DragHandle, x: number, y: number) => {
      const hit = hitTest(y, x);
      if (!hit) {
        setDrop(null);
        return;
      }
      const resolved = handle.over(hit.overId, hit.side, {
        desiredDepth: hit.desiredDepth,
      });
      setDrop(
        resolved
          ? { overId: hit.overId, side: hit.side, parent: resolved.parent }
          : null
      );
    },
    [hitTest]
  );

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  // Auto-scroll the scrollable ancestor while the cursor sits near its
  // top/bottom edge during a drag, re-hit-testing after each step so the
  // indicator tracks the row newly under the cursor. Stops at min/max
  // scroll or when the cursor exits the edge zone.
  const tickAutoScroll = useCallback(() => {
    autoScrollRafRef.current = null;
    const scroller = getScrollParent(containerRef.current);
    const handle = dragRef.current;
    const last = lastPointerRef.current;
    if (!scroller || !handle || !last) return;
    const rect = scroller.getBoundingClientRect();
    const dy = autoScrollDelta(rect.top, rect.bottom, last.y);
    if (dy === 0) return;
    const before = scroller.scrollTop;
    scroller.scrollTop += dy;
    if (scroller.scrollTop === before) return;
    applyHit(handle, last.x, last.y);
    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  }, [applyHit]);

  useEffect(() => {
    const THRESHOLD_PX = 4;
    const onMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (pending && pending.pointerId === e.pointerId && !dragRef.current) {
        if (
          !passedDragThreshold(
            pending.x,
            pending.y,
            e.clientX,
            e.clientY,
            THRESHOLD_PX
          )
        )
          return;
        // Figma rule: drag the whole selection if the grabbed row is part
        // of it, else just the grabbed row.
        const items = selectionSet.has(pending.id)
          ? [...selection]
          : [pending.id];
        dragRef.current = controller.startDrag(items);
      }
      const handle = dragRef.current;
      if (!handle) return;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      applyHit(handle, e.clientX, e.clientY);
      // Kick the auto-scroll loop when the cursor is in the scroller's
      // edge zone (and it isn't already ticking).
      const scroller = getScrollParent(containerRef.current);
      if (scroller && autoScrollRafRef.current === null) {
        const rect = scroller.getBoundingClientRect();
        const EDGE = 32;
        if (e.clientY < rect.top + EDGE || e.clientY > rect.bottom - EDGE)
          autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
      }
    };
    const onUp = () => {
      stopAutoScroll();
      if (dragRef.current) {
        controller.commitDrag();
        dragRef.current = null;
      }
      pendingRef.current = null;
      lastPointerRef.current = null;
      setDrop(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      stopAutoScroll();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    controller,
    applyHit,
    selection,
    selectionSet,
    stopAutoScroll,
    tickAutoScroll,
  ]);

  const onRowPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pendingRef.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
  }, []);

  // Position the insertion line. Vertical = visual space (the hovered
  // row's edge). Horizontal = the resolved drop *depth*, so a pop-out
  // reparent reads as an outdented line instead of being invisible.
  // `into` renders as a row ring on the target instead (see `drop.side`).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !drop || drop.side === "into") {
      setDragLineTop(null);
      return;
    }
    const el = container.querySelector<HTMLElement>(
      `[data-tree-row-id="${CSS.escape(drop.overId)}"]`
    );
    if (!el) {
      setDragLineTop(null);
      return;
    }
    setDragLineTop(
      el.offsetTop + (drop.side === "after" ? el.offsetHeight : 0)
    );
    // Drop sits as a child of `drop.parent`, so its rendered depth is the
    // parent's depth + 1 (root parent → depth 0). Matches the rows' own
    // `ps-(--tree-padding) = depth * TREE_INDENT`.
    const dropDepth =
      drop.parent === rootId
        ? 0
        : (rows.find((r) => r.id === drop.parent)?.depth ?? -1) + 1;
    setDragLineIndent(Math.max(0, dropDepth) * TREE_INDENT);
  }, [drop, rootId, rows]);

  return (
    <Tree
      ref={containerRef}
      indent={TREE_INDENT}
      // `min-h-full` so the list fills the panel (drop space below the
      // last row; doesn't read as collapsed). `py-2` keeps the absolute
      // drop indicator off the scroll ancestor's clip edge at the first /
      // last row (its knob sits at `-top-[3px]`, otherwise culled).
      className="relative min-h-full py-2"
      data-dragging={isDragging ? "" : undefined}
    >
      {rows.map((row) => {
        const node = nodes[row.id];
        if (!node) return null;
        const maskInfo = maskInfoMap.get(node.id);
        const mask = maskInfo?.mask ?? "none";
        const maskIndicatorVariant =
          maskInfo?.mask === "masked" ? "masked" : undefined;
        return (
          <NodeHierarchyItemContextMenuWrapper
            key={node.id}
            node_id={node.id}
            onStartRenaming={() => {
              // defer so the closing context menu doesn't blur the input
              setTimeout(() => setRenamingId(node.id), 200);
            }}
          >
            <NodeHierarchyTreeItem
              node={node}
              level={row.depth}
              selected={selectionSet.has(node.id)}
              focused={focusedId === node.id}
              folder={row.isContainer}
              expanded={row.isExpanded}
              dragTarget={drop?.side === "into" && drop.overId === node.id}
              isDragActive={isDragging}
              dropParent={!!drop && drop.parent === node.id}
              inSelectionGroup={selectionGroupSet.has(node.id)}
              isHovered={hoveredNodeId === node.id}
              isRenaming={renamingId === node.id}
              mask={mask}
              maskIndicatorVariant={maskIndicatorVariant}
              onClick={(e) => onRowClick(node.id, e)}
              onPointerDown={(e) => onRowPointerDown(node.id, e)}
              onToggleExpand={() => controller.toggle(node.id)}
              onStartRenaming={() => setRenamingId(node.id)}
              onPointerEnter={() => {
                editor.surface.surfaceHoverNode(node.id, "enter");
              }}
              onPointerLeave={() => {
                editor.surface.surfaceHoverNode(node.id, "leave");
              }}
              onRenameCommit={(name) => {
                editor.doc.getNodeById(node.id).name = name;
                setRenamingId(null);
              }}
              onToggleLocked={() => {
                editor.commands.toggleNodeLocked(node.id);
              }}
              onToggleActive={() => {
                editor.commands.toggleNodeActive(node.id);
              }}
            />
          </NodeHierarchyItemContextMenuWrapper>
        );
      })}
      <TreeDragLine top={dragLineTop} indent={dragLineIndent} />
    </Tree>
  );
}

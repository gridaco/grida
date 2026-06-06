"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import {
  TreeController,
  passedDragThreshold,
  placementFromY,
  type DragHandle,
  type DropPlacement,
  type NodeId,
  type TreeNode,
  type TreeSource,
} from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@app/ui/components/context-menu";
import { cn } from "@app/ui/lib/utils";
import { useSlideThumbnail } from "./use-slide-thumbnail";
import { useBackendState } from "@/grida-canvas-react/provider";
import {
  useSlideEditorMode,
  useSlides,
  useCurrentSlide,
} from "@/grida-canvas-react/use-slide-editor";
import { slideAspectRatio } from "@/grida-canvas/modes/slide-mode";
import type grida from "@grida/schema";

// ---------------------------------------------------------------------------
// DOM — data attributes + querySelector helpers
// ---------------------------------------------------------------------------
//
// List root: `[data-slide-list][data-slide-list-group="<group>"]`
// Row:       `[data-slide-row][data-slide-list-group="<group>"]`
//
// - `data-selected` — canvas is viewing this slide (editor isolation).
//
// Strong sky tier uses **sidebar-local** focus: wrap slides + layers in
// `SlideSidebarFocusScope` (`group/slides-sidebar`). When anything in that scope has
// focus, `:focus-within` applies — selected row uses strong accent; soft when focus is
// outside (e.g. canvas). Per-row `group/slides` is only for row hover on thumbnails.
//
// Tailwind: `group/slides` (row) + `group/slides-sidebar` (scope) — literals must stay in sync with exports.

/** Row-level group for thumbnail hover (within one slide row). */
export const SLIDE_LIST_GROUP = "slides" as const;

/** Sidebar scope group name for selectors/docs (Tailwind class stays literal). */
export const SLIDE_SIDEBAR_GROUP = "slides-sidebar" as const;

export const slideListDom = {
  group: SLIDE_LIST_GROUP,
  selectors: {
    root: `[data-slide-list][data-slide-list-group="${SLIDE_LIST_GROUP}"]`,
    rows: `[data-slide-list-group="${SLIDE_LIST_GROUP}"] [data-slide-row]`,
    /** Viewing this slide on the canvas (isolation). */
    selected: `[data-slide-list-group="${SLIDE_LIST_GROUP}"] [data-slide-row][data-selected="true"]`,
    /** Sidebar scope has keyboard focus somewhere (see `SlideSidebarFocusScope`). */
    sidebarFocused: `[data-slide-sidebar-focus-scope]:focus-within`,
    /** Selected row + sidebar focused — strong sky tier. */
    selectedAndSidebarFocused: `[data-slide-sidebar-focus-scope]:focus-within [data-slide-row][data-selected="true"]`,
  },
} as const;

/**
 * Wraps the slides list + layers (or whole left column) so `group/slides-sidebar` +
 * `:focus-within` drive the strong sky tier on the **selected** row — not per-item `:focus`.
 */
export function SlideSidebarFocusScope({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      data-slide-sidebar-focus-scope
      className={cn(
        "group/slides-sidebar flex min-h-0 flex-1 flex-col outline-none",
        className
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context menu — operations on a single slide tray
// ---------------------------------------------------------------------------

function SlideItemContextMenu({
  trayId,
  isLastSlide,
  trayIds,
  children,
}: React.PropsWithChildren<{
  trayId: string;
  isLastSlide: boolean;
  trayIds: string[];
}>) {
  const editor = useCurrentEditor();
  const mode = useSlideEditorMode();
  const backend = useBackendState();
  const isCanvasBackend = backend === "canvas";

  return (
    <ContextMenu>
      {/* asChild: row must be the focus target for :focus styling (no extra wrapper). */}
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ContextMenuItem
          onSelect={() => editor.commands.copy(trayId)}
          className="text-xs"
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.commands.paste(trayId)}
          className="text-xs"
        >
          Paste
        </ContextMenuItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger className="text-xs">
            Copy/Paste as...
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onSelect={() => void editor.surface.a11yCopyAsSVG()}
              disabled={!isCanvasBackend}
              className="text-xs"
            >
              Copy as SVG
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => editor.surface.a11yCopyAsImage("png")}
              disabled={!isCanvasBackend}
              className="text-xs"
            >
              Copy as PNG
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem disabled className="text-xs">
              Copy link to slide
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem
          onSelect={() => mode.duplicateSlide(trayId)}
          className="text-xs"
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => mode.deleteSlide(trayId)}
          disabled={isLastSlide}
          className="text-xs text-destructive focus:text-destructive"
        >
          Delete
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={() => mode.addSlide()} className="text-xs">
          New slide
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.commands.select(trayIds, "reset")}
          className="text-xs"
        >
          Select all slides
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Not implemented — disabled */}
        <ContextMenuItem disabled className="text-xs">
          Skip slide
        </ContextMenuItem>
        <ContextMenuItem disabled className="text-xs">
          Set as thumbnail
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ---------------------------------------------------------------------------
// Single slide row — number left, thumbnail right (Keynote-style)
// ---------------------------------------------------------------------------
//
// Accent: selected + sidebar `focus-within` (strong) | selected only (soft) | neither.
// `data-drag-target` for D&D. Tree `item.getProps()` supplies `tabIndex`; do not override.
//
// `forwardRef` + `...rest`: `ContextMenuTrigger asChild` injects `onContextMenu` / `ref` onto
// the row — they must reach the DOM or the OS native context menu appears.

type SlideRowProps = {
  trayId: string;
  index: number;
  /** Canvas is scoped to this slide (editor isolation). */
  isViewing: boolean;
  isDragTarget: boolean;
  onClick: () => void;
  /** CSS aspect-ratio value derived from slide config, e.g. `"1920 / 1080"`. */
  aspectRatio: string;
  /** Props from headless-tree item.getProps() for D&D + a11y */
  itemProps: Record<string, unknown>;
};

const SlideRow = React.forwardRef<
  HTMLDivElement,
  SlideRowProps &
    Omit<React.HTMLAttributes<HTMLDivElement>, keyof SlideRowProps>
>(function SlideRow(
  {
    trayId,
    index,
    isViewing,
    isDragTarget,
    onClick,
    aspectRatio,
    itemProps,
    ...rest
  },
  ref
) {
  const editor = useCurrentEditor();
  const thumbnailSrc = useSlideThumbnail(editor, trayId);

  return (
    <div
      ref={ref}
      onClick={onClick}
      {...itemProps}
      {...rest}
      data-slide-row
      data-slide-list-group={SLIDE_LIST_GROUP}
      data-selected={isViewing ? "true" : undefined}
      data-drag-target={isDragTarget ? "true" : undefined}
      data-tray-id={trayId}
      className={cn(
        "group/slides flex items-start gap-1 rounded-xl px-2 py-2 cursor-pointer outline-none select-none transition-colors",
        "[&[data-selected=true]]:bg-workbench-accent-sky/10",
        "group-focus-within/slides-sidebar:[&[data-selected=true]]:bg-workbench-accent-sky/20",
        "[&[data-drag-target=true]:not([data-selected])]:bg-workbench-accent-sky/5"
      )}
    >
      {/* Slide index column width: intentionally fixed to fit three tabular digits
          ("000"). Keep in sync with `tabular-nums`; do not narrow — thumbnails
          align to the same horizontal start. */}
      <span
        className={cn(
          "text-xs mt-1 font-normal tabular-nums w-[3ch] text-left shrink-0 leading-none text-muted-foreground",
          "group-data-[selected=true]/slides:text-workbench-accent-sky/80",
          "group-focus-within/slides-sidebar:group-data-[selected=true]/slides:font-medium",
          "group-focus-within/slides-sidebar:group-data-[selected=true]/slides:text-workbench-accent-sky"
        )}
      >
        {index + 1}
      </span>

      <div
        className={cn(
          // Fixed 1px stroke — only border-*color* changes by state (no width/outline/ring).
          "relative box-border flex-1 overflow-hidden rounded-md border-[1px] border-solid border-border/60 bg-muted/50 transition-[border-color] duration-150",
          "group-[&:not([data-selected])]/slides:group-hover/slides:border-border",
          "group-data-[selected=true]/slides:border-workbench-accent-sky/30",
          "group-focus-within/slides-sidebar:group-data-[selected=true]/slides:border-workbench-accent-sky/45"
        )}
        style={{ aspectRatio }}
      >
        {thumbnailSrc && (
          <picture>
            <img
              src={thumbnailSrc}
              alt={`Slide ${index + 1}`}
              className="absolute inset-0 w-full h-full object-contain"
              draggable={false}
            />
          </picture>
        )}
      </div>
    </div>
  );
});

SlideRow.displayName = "SlideRow";

// ---------------------------------------------------------------------------
// SlideTreeSource — read-only @grida/tree-view adapter over editor slide state
// ---------------------------------------------------------------------------
//
// The editor owns slide order; this is a thin live *view*, never a copy.
// `@grida/tree-view` never mutates the source — reorders come back out as a
// `move` intent which we apply via `editor.doc.mv` (see SlideList).

const SLIDE_ROOT = "<document>";
const NO_CHILDREN: readonly NodeId[] = Object.freeze([]);

class SlideTreeSource implements TreeSource<grida.program.nodes.TrayNode> {
  private _version = 0;
  private _listeners = new Set<() => void>();
  private _root: TreeNode<grida.program.nodes.TrayNode>;
  private _nodes = new Map<NodeId, TreeNode<grida.program.nodes.TrayNode>>();

  constructor(
    trayIds: readonly string[],
    traysmap: Record<string, grida.program.nodes.TrayNode>
  ) {
    this._root = { id: SLIDE_ROOT, parent: null, children: [] };
    this._snapshot(trayIds, traysmap);
  }

  /**
   * Re-snapshot from the editor's current slide order. Node identities are
   * reused when unchanged on purpose: `useTreeSnapshot` treats a fresh
   * `getNode()` reference as a store change, so churning them defeats the
   * package's memoization (and can loop). See FEEDBACKS.md.
   */
  refresh(
    trayIds: readonly string[],
    traysmap: Record<string, grida.program.nodes.TrayNode>
  ): void {
    this._snapshot(trayIds, traysmap);
    this._version++;
    for (const l of this._listeners) l();
  }

  private _snapshot(
    trayIds: readonly string[],
    traysmap: Record<string, grida.program.nodes.TrayNode>
  ): void {
    const next = new Map<NodeId, TreeNode<grida.program.nodes.TrayNode>>();
    for (const id of trayIds) {
      const prev = this._nodes.get(id);
      const meta = traysmap[id];
      next.set(
        id,
        prev && prev.meta === meta
          ? prev
          : { id, parent: SLIDE_ROOT, children: NO_CHILDREN, meta }
      );
    }
    this._nodes = next;
    this._root = { id: SLIDE_ROOT, parent: null, children: [...trayIds] };
  }

  getRoot(): NodeId {
    return SLIDE_ROOT;
  }
  getNode(id: NodeId): TreeNode<grida.program.nodes.TrayNode> {
    if (id === SLIDE_ROOT) return this._root;
    const n = this._nodes.get(id);
    if (!n) throw new Error(`[slide-list] unknown tray: ${id}`);
    return n;
  }
  getVersion(): number {
    return this._version;
  }
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  getLabel(id: NodeId): string {
    return this._nodes.get(id)?.meta?.name ?? id;
  }
  isContainer(): boolean {
    return false;
  }
  showRoot(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SlideList — D&D reorderable list via @grida/tree-view
// ---------------------------------------------------------------------------

export function SlideList() {
  const editor = useCurrentEditor();
  const mode = useSlideEditorMode();
  const slides = useSlides(mode);
  const current = useCurrentSlide(mode);

  const tray_ids = useMemo(() => slides.map((s) => s.id), [slides]);
  const traysmap = useMemo(() => {
    const m: Record<string, grida.program.nodes.TrayNode> = {};
    for (const s of slides) m[s.id] = s.node;
    return m;
  }, [slides]);

  const active_tray_id = current?.id ?? slides[0]?.id ?? null;
  const sceneId = mode.sceneId;

  const source = useMemo(
    () => new SlideTreeSource(tray_ids, traysmap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const controller = useMemo(
    () => new TreeController<grida.program.nodes.TrayNode>({ source }),
    [source]
  );
  useEffect(() => () => controller.dispose(), [controller]);

  // Push editor slide-order changes into the read-only source.
  useEffect(() => {
    source.refresh(tray_ids, traysmap);
  }, [source, tray_ids, traysmap]);

  // Reorder bridge: the package never mutates — `commitDrag()` emits a
  // `move` intent and we apply it. `to.index` is already the post-removal
  // insertion index (consecutive items step forward), so `to.index + i`
  // reproduces the previous hand-rolled reorder exactly.
  useEffect(() => {
    return controller.subscribe("intent", (intent) => {
      if (intent.kind !== "move" || !sceneId) return;
      const ids = intent.items.filter((id) => id in traysmap);
      ids.forEach((id, i) => {
        editor.doc.mv([id], sceneId, intent.to.index + i);
      });
    });
  }, [controller, editor, sceneId, traysmap]);

  return (
    <TreeProvider controller={controller}>
      <SlideListInner
        activeTrayId={active_tray_id}
        trayIds={tray_ids}
        traysmap={traysmap}
        isLastSlide={slides.length <= 1}
        aspectRatio={slideAspectRatio(mode.config)}
        onGoToSlide={mode.goToSlide}
      />
    </TreeProvider>
  );
}

function SlideListInner({
  activeTrayId,
  trayIds,
  traysmap,
  isLastSlide,
  aspectRatio,
  onGoToSlide,
}: {
  activeTrayId: string | null;
  trayIds: string[];
  traysmap: Record<string, grida.program.nodes.TrayNode>;
  isLastSlide: boolean;
  aspectRatio: string;
  onGoToSlide: (id: string) => void;
}) {
  const controller = useTree<grida.program.nodes.TrayNode>();
  const rows = useTreeSnapshot((c) => c.getRows());
  const dropPosition = useTreeSnapshot(
    (c) => c.getDrag()?.getPosition() ?? null
  );
  const isDragging = useTreeSnapshot((c) => c.getDrag() !== null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragHandle | null>(null);
  const pendingRef = useRef<{
    id: string;
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const [dragLineTop, setDragLineTop] = useState<number | null>(null);

  // Flat hit-test: slides aren't containers — `placementFromY` with
  // `{ into: false }` gives the 2-way before/after split (F4).
  const hitTest = useCallback(
    (y: number): { id: string; placement: DropPlacement } | null => {
      const container = containerRef.current;
      if (!container) return null;
      const els = Array.from(
        container.querySelectorAll<HTMLElement>("[data-tray-id]")
      );
      if (els.length === 0) return null;
      const first = els[0].getBoundingClientRect();
      const last = els[els.length - 1].getBoundingClientRect();
      if (y < first.top)
        return { id: els[0].dataset.trayId!, placement: "before" };
      if (y > last.bottom)
        return {
          id: els[els.length - 1].dataset.trayId!,
          placement: "after",
        };
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) {
          return {
            id: el.dataset.trayId!,
            placement: placementFromY(y - r.top, r.height, { into: false }),
          };
        }
      }
      return null;
    },
    []
  );

  // Drag wiring — the package is DOM-free by design; the consumer owns
  // pointer→`over()`, the click/drag threshold, and listener lifecycle.
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
        dragRef.current = controller.startDrag([pending.id]);
      }
      const handle = dragRef.current;
      if (!handle) return;
      const hit = hitTest(e.clientY);
      if (hit) handle.over(hit.id, hit.placement);
    };
    const onUp = () => {
      if (dragRef.current) {
        controller.commitDrag();
        dragRef.current = null;
      }
      pendingRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [controller, hitTest]);

  const onRowPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pendingRef.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
  }, []);

  // Scroll the active slide into view. The package owns no DOM/scroll (by
  // design) — this is the documented consumer-side `reveal` pattern.
  useEffect(() => {
    if (!activeTrayId) return;
    containerRef.current
      ?.querySelector<HTMLElement>(
        `[data-tray-id="${CSS.escape(activeTrayId)}"]`
      )
      ?.scrollIntoView({
        behavior: "instant",
        block: "nearest",
        inline: "nearest",
      });
  }, [activeTrayId]);

  // Position the insertion line from the resolved drop position.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !dropPosition) {
      setDragLineTop(null);
      return;
    }
    const el = container.querySelector<HTMLElement>(
      `[data-tray-id="${CSS.escape(dropPosition.over)}"]`
    );
    if (!el) {
      setDragLineTop(null);
      return;
    }
    setDragLineTop(
      el.offsetTop + (dropPosition.placement === "after" ? el.offsetHeight : 0)
    );
  }, [dropPosition]);

  // Arrow keys move the viewed slide. Selection lives in the editor (not a
  // package SelectionAdapter), so this bypasses the package keymap — see
  // FEEDBACKS.md.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    if (!activeTrayId) return;
    const idx = rows.findIndex((r) => r.id === activeTrayId);
    if (idx < 0) return;
    const next = rows[e.key === "ArrowUp" ? idx - 1 : idx + 1];
    if (next) {
      e.preventDefault();
      onGoToSlide(next.id);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col relative outline-none"
      data-slide-list
      data-slide-list-group={SLIDE_LIST_GROUP}
      data-dragging={isDragging ? "" : undefined}
    >
      {rows.map((row, index) => {
        const tray = traysmap[row.id];
        if (!tray) return null;
        return (
          <SlideItemContextMenu
            trayId={tray.id}
            isLastSlide={isLastSlide}
            trayIds={trayIds}
            key={tray.id}
          >
            <SlideRow
              trayId={tray.id}
              index={index}
              isViewing={activeTrayId === tray.id}
              isDragTarget={dropPosition?.over === tray.id}
              onClick={() => onGoToSlide(tray.id)}
              aspectRatio={aspectRatio}
              itemProps={{
                tabIndex: -1,
                onPointerDown: (e: React.PointerEvent) =>
                  onRowPointerDown(tray.id, e),
              }}
            />
          </SlideItemContextMenu>
        );
      })}

      {/* D&D insertion indicator */}
      {dragLineTop != null && (
        <div
          style={{ top: dragLineTop }}
          className="absolute inset-x-0 z-30 -mt-px h-0.5 bg-workbench-accent-sky pointer-events-none"
        />
      )}
    </div>
  );
}

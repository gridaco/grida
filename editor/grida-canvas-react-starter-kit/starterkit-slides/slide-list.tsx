"use client";

import React, { useEffect, useMemo } from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import {
  dragAndDropFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/components/lib/utils";
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
          <img
            src={thumbnailSrc}
            alt={`Slide ${index + 1}`}
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
        )}
      </div>
    </div>
  );
});

SlideRow.displayName = "SlideRow";

// ---------------------------------------------------------------------------
// SlideList — D&D reorderable list via @headless-tree
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
  const selectedItems = active_tray_id ? [active_tray_id] : [];
  const sceneId = mode.sceneId;

  const tree = useTree<grida.program.nodes.TrayNode>({
    rootItemId: "<document>",
    canReorder: true,
    initialState: {
      selectedItems,
    },
    state: {
      selectedItems,
    },
    setSelectedItems: (items) => {
      const [id] = items as string[];
      if (id) {
        mode.goToSlide(id);
      }
    },
    getItemName: (item) => {
      if (item.getId() === "<document>") return "<document>";
      return item.getItemData().name;
    },
    isItemFolder: () => false,
    onDrop(items, target) {
      if (!sceneId) return;

      const ids = items.map((item) => item.getId());
      if (
        target.item.getId() !== "<document>" ||
        ids.some((id) => !tray_ids.includes(id))
      ) {
        return;
      }

      const draggedSet = new Set(ids);
      const remaining = tray_ids.filter((id) => !draggedSet.has(id));
      const insertionIndex =
        "insertionIndex" in target && typeof target.insertionIndex === "number"
          ? Math.max(0, Math.min(target.insertionIndex, remaining.length))
          : 0;

      // Reorder by moving each dragged tray to its new absolute index, in
      // order. `editor.doc.mv` appends/inserts at the given index under the
      // same parent (the scene).
      ids.forEach((id, i) => {
        editor.doc.mv([id], sceneId, insertionIndex + i);
      });
    },
    dataLoader: {
      getItem(itemId) {
        const item = traysmap[itemId];
        if (item) return item;
        if (itemId === "<document>") {
          return {
            id: "<document>",
            name: "<document>",
          } as grida.program.nodes.TrayNode;
        }
        return { id: itemId, name: "" } as grida.program.nodes.TrayNode;
      },
      getChildren: (itemId) => {
        if (itemId === "<document>") return tray_ids;
        return [];
      },
    },
    features: [syncDataLoaderFeature, selectionFeature, dragAndDropFeature],
  });

  // Scroll the active slide into view
  useEffect(() => {
    if (!active_tray_id) return;
    const item = tree.getItems().find((i) => i.getId() === active_tray_id);
    if (item) {
      item.setFocused();
      item.scrollTo({
        behavior: "instant",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [active_tray_id, tree]);

  useEffect(() => {
    tree.rebuildTree();
  }, [tray_ids, tree]);

  const dragLineStyle = tree.getDragLineStyle();
  const isLastSlide = slides.length <= 1;
  const aspect = slideAspectRatio(mode.config);

  return (
    <div
      className="flex flex-col relative"
      {...tree.getContainerProps()}
      data-slide-list
      data-slide-list-group={SLIDE_LIST_GROUP}
    >
      {tree.getItems().map((item, index) => {
        const tray = item.getItemData();
        if (!tray || !traysmap[tray.id]) return null;

        return (
          <SlideItemContextMenu
            trayId={tray.id}
            isLastSlide={isLastSlide}
            trayIds={tray_ids}
            key={tray.id}
          >
            <SlideRow
              trayId={tray.id}
              index={index}
              isViewing={active_tray_id === tray.id}
              isDragTarget={item.isDragTarget()}
              onClick={() => mode.goToSlide(tray.id)}
              aspectRatio={aspect}
              itemProps={item.getProps()}
            />
          </SlideItemContextMenu>
        );
      })}

      {/* D&D insertion indicator */}
      <div
        style={dragLineStyle}
        className="absolute z-30 -mt-px h-0.5 bg-workbench-accent-sky pointer-events-none"
      />
    </div>
  );
}

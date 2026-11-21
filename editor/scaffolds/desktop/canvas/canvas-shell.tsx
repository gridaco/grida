/**
 * Desktop `.canvas` slides editor. The folder is registered as a workspace, so
 * this reads/writes through the `workspaces` bridge fs. The deck's order +
 * structure live in `.canvas.json` (mutated via the `dotcanvas`
 * transforms in {@link CanvasDeck}); each slide is one `<src>.svg` edited with
 * the keynote camera + mtime-safe save.
 *
 * Shares the slide sidebar and layer tree with the web SVG editor.
 * See test/desktop-canvas-slide-layers.md.
 */
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Play, Plus, Trash2 } from "lucide-react";
import type { SvgEditor } from "@grida/svg-editor";
import { SvgEditorProvider } from "@grida/svg-editor/react";
import { dotcanvas } from "dotcanvas";
import { Button } from "@app/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/ui/components/resizable";
import {
  SlideListFocusScope,
  SlideRow,
} from "@/app/(canvas)/svg/examples/slides/_components/slide-row";
import { TemplatePicker } from "@/app/(canvas)/svg/examples/slides/_components/template-picker";
import { Presentation } from "@/app/(canvas)/svg/examples/slides/_components/presentation";
import type { SlideTemplate } from "@/app/(canvas)/svg/examples/slides/_components/templates";
import { EMPTY_SLIDE_SVG } from "@/app/(canvas)/svg/examples/slides/_components/types";
import { svgToDataUri } from "@/app/(canvas)/svg/_storage/thumbnails";
import { SvgToolbarControls } from "@/app/(canvas)/svg/_components/svg-toolbar";
import {
  PathToolbar,
  PathToolbarPosition,
} from "@/app/(canvas)/svg/_components/path-toolbar";
import { HierarchyPanel } from "@/scaffolds/svg-editor/hierarchy-panel";
import { SlideSidebar } from "@/scaffolds/svg-editor/slide-sidebar";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import {
  useWorkspaceChanges,
  useWorkspaceFileRevision,
} from "../workbench/workspace-changes";
import { WorkspaceFileProjectionDependencies } from "../workbench/workspace-file-projection-dependencies";
import { CanvasDeck, type Slide } from "./deck-store";
import {
  SlideSurface,
  SLIDE_VIEWPORT_PADDING,
  type BindSlideEditor,
} from "./slide-surface";
import { materializeSlideSvgResources } from "./slide-svg-resources";
import { SlideThumbnailProjectionController } from "./slide-thumbnail-projection-controller";

export function DesktopCanvasShell({
  workspaceId,
  basePath = "",
  active = true,
  onDirtyChange,
  bindSlideEditor,
}: {
  workspaceId: string;
  /** Workspace-relative dir of the `.canvas` bundle; "" when it IS the
   *  workspace root (e.g. a `.canvas` opened directly). */
  basePath?: string;
  /** False when mounted as a hidden workbench tab — gates Cmd+S so a
   *  background deck doesn't grab the save. Defaults true (standalone). */
  active?: boolean;
  onDirtyChange: (dirty: boolean) => void;
  bindSlideEditor?: BindSlideEditor;
}) {
  const [deck] = useState(
    () => new CanvasDeck(workspaceId, workspacesNs, basePath)
  );
  useEffect(() => {
    void deck.load();
    return () => {
      void deck.flush();
    };
  }, [deck]);

  // Reflect external edits to the manifest — the workspace agent adding,
  // removing, or reordering slides writes `.canvas.json`, and so does anything
  // else editing the bundle on disk. Re-read the deck so the strip updates.
  // Slide *content* edits reflect via each slide surface's own mtime watch.
  // Needs a `WorkspaceChangesProvider` ancestor (the file window's deck mode and
  // the workbench both provide one); a no-op otherwise.
  const manifestRel = basePath
    ? `${basePath}/${dotcanvas.MANIFEST_FILENAME}`
    : dotcanvas.MANIFEST_FILENAME;
  useWorkspaceChanges((events) => {
    if (
      events.some((e) => e.rel_path === manifestRel && e.kind !== "deleted")
    ) {
      void deck.load();
    }
  });

  const slides = useSyncExternalStore(
    deck.subscribe,
    deck.getSlides,
    deck.getSlides
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeSlide =
    slides.find((s) => s.id === activeId) ?? slides[0] ?? null;
  useEffect(() => {
    if (activeSlide && activeSlide.id !== activeId) setActiveId(activeSlide.id);
  }, [activeSlide, activeId]);

  const scope = JSON.stringify([workspaceId, basePath]);
  const [presented, setPresented] = useState<{ scope: string; slide: Slide }>();
  const shown = presented?.scope === scope ? presented.slide : undefined;
  const waiting = activeSlide !== null && activeSlide.src !== shown?.src;
  const sessions = activeSlide
    ? waiting && shown
      ? [shown, activeSlide]
      : [activeSlide]
    : [];
  const showSlide = useCallback(
    (slide: Slide) => setPresented({ scope, slide }),
    [scope]
  );
  useLayoutEffect(() => {
    if (activeSlide === null) setPresented(undefined);
  }, [activeSlide]);

  const [toolbarEditor, setToolbarEditor] = useState<SvgEditor | null>(null);
  const bindToolbarEditor = useCallback((editor: SvgEditor) => {
    setToolbarEditor(editor);
    return () =>
      setToolbarEditor((current) => (current === editor ? null : current));
  }, []);

  const { map: thumbnails, refresh } = useSlideThumbnails(
    workspaceId,
    slides,
    basePath
  );
  const [presenting, setPresenting] = useState(false);
  const [layersContainer, setLayersContainer] = useState<HTMLDivElement | null>(
    null
  );

  const pages = slides.map((s, i) => ({
    id: s.id,
    name: s.name ?? `Slide ${i + 1}`,
    thumbnailDataUri: thumbnails[s.src] ?? "",
  }));
  const activeIndex = Math.max(
    0,
    slides.findIndex((s) => s.id === activeSlide?.id)
  );

  const onAdd = useCallback(
    (svg: string) => {
      void deck.addSlide(svg).then((id) => setActiveId(id));
    },
    [deck]
  );
  const onRemove = useCallback(
    (id: string) => {
      if (slides.length <= 1) return; // keep at least one slide
      void deck.removeSlide(id);
    },
    [deck, slides.length]
  );
  const onReorder = useCallback(
    (orderedIds: string[]) => void deck.reorder(orderedIds),
    [deck]
  );

  // Keyboard page nav (↑/↓) — like a slide list. Skipped while the slide editor
  // holds keyboard focus (there arrows NUDGE the selection — the same focus gate
  // the surface uses at `dom.ts` `is_focus_within`) and while a hidden workbench
  // tab (`active` false), so a background deck never steals the keys. Clamps at
  // the ends (no wrap).
  const mainRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const command = e.metaKey || e.ctrlKey;
      if (waiting && command && e.key.toLowerCase() === "s" && !e.shiftKey) {
        e.preventDefault();
        return;
      }
      if (command || e.altKey) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          el.getAttribute("role") === "separator" ||
          layersContainer?.contains(el) ||
          mainRef.current?.contains(el))
      ) {
        return;
      }
      if (slides.length === 0) return;
      const step = e.key === "ArrowUp" ? -1 : 1;
      e.preventDefault();
      setActiveId((requestedId) => {
        const current = Math.max(
          0,
          slides.findIndex((slide) => slide.id === requestedId)
        );
        return slides[current + step]?.id ?? requestedId;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, slides, layersContainer, waiting]);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          defaultSize="224px"
          minSize="144px"
          maxSize="55%"
          groupResizeBehavior="preserve-pixel-size"
        >
          <aside className="flex h-full min-w-0 flex-col">
            <SlideListFocusScope className="h-full">
              <SlideSidebar
                layersCollapsible
                defaultLayersSize="96px"
                minLayersSize="48px"
                slides={
                  <SlideStrip
                    pages={pages}
                    slideIds={slides.map((s) => s.id)}
                    activeId={activeSlide?.id ?? null}
                    onSelect={setActiveId}
                    onRemove={onRemove}
                    onReorder={onReorder}
                    onAdd={() => onAdd(EMPTY_SLIDE_SVG)}
                    onAddTemplate={(tpl: SlideTemplate) => onAdd(tpl.svg)}
                    removable={slides.length > 1}
                  />
                }
                layers={
                  <div
                    ref={setLayersContainer}
                    tabIndex={-1}
                    className="outline-none"
                  />
                }
              />
            </SlideListFocusScope>
          </aside>
        </ResizablePanel>
        {/* Cover the panel group's resize hit area above the canvas. */}
        <ResizableHandle
          aria-label="Resize slide sidebar"
          className="z-10 after:w-2.5 pointer-coarse:after:w-5"
        />
        <ResizablePanel>
          <main ref={mainRef} className="relative h-full min-w-0 bg-muted">
            <Button
              variant="outline"
              size="icon-sm"
              className="absolute right-3 top-3 z-20 bg-background/80 shadow-sm backdrop-blur hover:bg-background"
              disabled={slides.length === 0}
              onClick={() => setPresenting(true)}
              title="Present from current slide"
              aria-label="Present from current slide"
            >
              <Play />
            </Button>
            {activeSlide === null && (
              <div className="flex h-full items-center justify-center text-xs italic text-muted-foreground">
                This deck has no slides yet. Add one from the sidebar.
              </div>
            )}
            {/* Keep the outgoing frame mounted while the requested file is
                prepared. Only the displayed session owns a DOM editor.
                See test/desktop-canvas-slide-navigation.md. */}
            {sessions.map((slide) => {
              const requested = slide.src === activeSlide?.src;
              return (
                <ActiveSlide
                  key={JSON.stringify([scope, slide.src])}
                  workspaceId={workspaceId}
                  slide={slide}
                  basePath={basePath}
                  bindSlideEditor={presenting ? undefined : bindSlideEditor}
                  editable={active && requested}
                  shown={slide.src === shown?.src}
                  hasFrame={shown !== undefined}
                  thumbnail={thumbnails[slide.src]}
                  layersContainer={layersContainer}
                  onPrepared={requested ? showSlide : undefined}
                  bindToolbarEditor={bindToolbarEditor}
                  onDirtyChange={onDirtyChange}
                  onSaved={() => refresh(slide.src)}
                />
              );
            })}
            <SvgToolbarControls
              editor={toolbarEditor}
              disabled={
                !active || waiting || activeSlide === null || presenting
              }
            />
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      <Presentation
        open={presenting}
        pages={pages}
        initialIndex={activeIndex}
        onClose={() => setPresenting(false)}
      />
    </div>
  );
}

/**
 * Slide thumbnails are projections of the slide SVG plus every local resource
 * it references. Track those dependencies per slide so external asset writes
 * refresh the strip and presentation, not only the active editor.
 * See test/desktop-workbench-large-svg.md for the large-source regression.
 */
function useSlideThumbnails(
  workspaceId: string,
  slides: readonly Slide[],
  basePath: string
): { map: Record<string, string>; refresh: (src: string) => void } {
  const [map, setMap] = useState<Record<string, string>>({});
  const [controller] = useState(
    () => new SlideThumbnailProjectionController(basePath)
  );

  // Keyed by bundle-relative `src` (what the UI looks up), read at the
  // workspace-relative path the bridge speaks.
  const read = useCallback(
    (src: string) => {
      const request = controller.begin(src);
      if (!request) return;
      void workspacesNs
        .readSvgDocument(workspaceId, request.relPath)
        .then(async (r) => {
          const materialized = await materializeSlideSvgResources(r.content, {
            workspaceId,
            bundleBasePath: basePath,
            slideRelPath: request.relPath,
          });
          if (!controller.complete(request, materialized.dependencies)) return;
          setMap((m) => ({ ...m, [src]: svgToDataUri(materialized.svg) }));
        })
        .catch(() => {
          if (!controller.fail(request)) return;
          // A slide that can no longer be read must not retain its old preview.
          setMap((current) => {
            if (!(src in current)) return current;
            const next = { ...current };
            delete next[src];
            return next;
          });
        });
    },
    [workspaceId, basePath, controller]
  );

  useEffect(() => {
    controller.reset(basePath);
    setMap({});
  }, [controller, workspaceId, basePath]);

  useEffect(() => {
    const change = controller.reconcile(slides.map((slide) => slide.src));
    if (change.removed.length > 0) {
      setMap((current) => {
        const next = { ...current };
        for (const src of change.removed) delete next[src];
        return next;
      });
    }
    for (const src of change.load) read(src);
  }, [controller, slides, read]);

  useWorkspaceChanges((events) => {
    for (const src of controller.changed(events)) read(src);
  });

  return { map, refresh: read };
}

type Page = { id: string; name: string; thumbnailDataUri: string };

function scrollIntoPaddedView(container: HTMLElement, item: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const style = getComputedStyle(container);
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const itemTop = itemRect.top - containerRect.top + container.scrollTop;
  const itemBottom = itemTop + itemRect.height;
  const viewTop = container.scrollTop + paddingTop;
  const viewBottom =
    container.scrollTop + container.clientHeight - paddingBottom;

  if (itemTop < viewTop) {
    container.scrollTop = itemTop - paddingTop;
  } else if (itemBottom > viewBottom) {
    container.scrollTop = itemBottom - container.clientHeight + paddingBottom;
  }
}

function SlideStrip({
  pages,
  slideIds,
  activeId,
  onSelect,
  onRemove,
  onReorder,
  onAdd,
  onAddTemplate,
  removable,
}: {
  pages: Page[];
  slideIds: string[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onAdd: () => void;
  onAddTemplate: (tpl: SlideTemplate) => void;
  removable: boolean;
}) {
  const dragIndex = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const selectedSlideRef = useRef<HTMLDivElement | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    const item = selectedSlideRef.current;
    if (container && item) scrollIntoPaddedView(container, item);
  }, [activeId]);

  const commitDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from == null || from === to) return;
    const ids = [...slideIds];
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onReorder(ids);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-2">
        <TemplatePicker
          onPick={onAddTemplate}
          triggerClassName="flex-1 justify-center"
        />
        <Button
          variant="outline"
          size="icon-xs"
          className="shrink-0"
          onClick={onAdd}
          title="Insert empty slide"
          aria-label="Insert empty slide"
        >
          <Plus />
        </Button>
      </div>
      <div
        ref={scrollRef}
        role="listbox"
        aria-label="Slides"
        className="flex-1 overflow-auto px-1 py-1"
      >
        {pages.map((p, i) => (
          <div
            key={p.id}
            ref={p.id === activeId ? selectedSlideRef : null}
            draggable
            onDragStart={() => {
              dragIndex.current = i;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overIndex !== i) setOverIndex(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              commitDrop(i);
            }}
            onDragEnd={() => {
              dragIndex.current = null;
              setOverIndex(null);
            }}
            className={
              overIndex === i ? "rounded-xl ring-2 ring-primary/40" : undefined
            }
          >
            <SlideRow
              index={i + 1}
              selected={p.id === activeId}
              aspectRatio="16 / 9"
              thumbnailSrc={p.thumbnailDataUri || null}
              label={p.name}
              onClick={() => onSelect(p.id)}
              actions={
                removable ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 bg-background/80 text-muted-foreground backdrop-blur-sm hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(p.id);
                    }}
                    title="Remove slide"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                ) : null
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

type ActiveState =
  | { kind: "loading" }
  | { kind: "ready"; content: string; mtime: number }
  | { kind: "error"; message: string };

function ActiveSlide({
  workspaceId,
  slide,
  basePath,
  editable,
  shown,
  hasFrame,
  thumbnail,
  layersContainer,
  onPrepared,
  bindToolbarEditor,
  onDirtyChange,
  onSaved,
  bindSlideEditor,
}: {
  workspaceId: string;
  slide: Slide;
  basePath: string;
  /** Whether the displayed slide is still the current editing target. */
  editable: boolean;
  shown: boolean;
  hasFrame: boolean;
  thumbnail?: string;
  layersContainer: HTMLElement | null;
  onPrepared?: (slide: Slide) => void;
  bindToolbarEditor: (editor: SvgEditor) => () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  bindSlideEditor?: BindSlideEditor;
}) {
  // The slide file's workspace-relative path (the bundle may sit at `basePath`).
  const relPath = basePath ? `${basePath}/${slide.src}` : slide.src;
  const [state, setState] = useState<ActiveState>({ kind: "loading" });
  const [projectionDependencies] = useState(
    () => new WorkspaceFileProjectionDependencies(basePath)
  );
  const resourceRevision = useWorkspaceFileRevision(() =>
    projectionDependencies.scope()
  );
  const restoreRef = useRef<(serialized: string) => string>(
    (serialized) => serialized
  );
  const prepareContentForEditor = useCallback(
    async (diskContent: string) => {
      const request = projectionDependencies.begin();
      try {
        const materialized = await materializeSlideSvgResources(diskContent, {
          workspaceId,
          bundleBasePath: basePath,
          slideRelPath: relPath,
        });
        return {
          content: materialized.svg,
          commit() {
            if (
              !projectionDependencies.commit(request, materialized.dependencies)
            ) {
              return;
            }
            restoreRef.current = materialized.restore;
          },
          discard() {
            projectionDependencies.discard(request);
          },
        };
      } catch (error) {
        projectionDependencies.discard(request);
        throw error;
      }
    },
    [workspaceId, basePath, relPath, projectionDependencies]
  );
  const prepareContentForWrite = useCallback((serialized: string) => {
    return restoreRef.current(serialized);
  }, []);

  // Layout cleanup ends a superseded request before its completion can publish
  // a frame. Reading and resource materialization run asynchronously.
  useLayoutEffect(() => {
    let cancelled = false;
    workspacesNs
      .readSvgDocument(workspaceId, relPath)
      .then(async (r) => {
        if (cancelled) return;
        const prepared = await prepareContentForEditor(r.content);
        if (!cancelled) {
          prepared.commit?.();
          setState({
            kind: "ready",
            content: prepared.content,
            mtime: r.mtime,
          });
        } else {
          prepared.discard?.();
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              err instanceof Error ? err.message : "Couldn't read slide.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, relPath, prepareContentForEditor]);

  useLayoutEffect(() => {
    if (state.kind === "ready" && !shown) onPrepared?.(slide);
  }, [state, shown, onPrepared, slide]);

  if (state.kind === "error") {
    return (
      <div
        role="status"
        className={
          hasFrame
            ? "absolute top-3 right-14 left-3 z-10 rounded-md border bg-background px-3 py-2 text-sm text-destructive shadow-sm"
            : "flex h-full items-center justify-center px-6 text-center text-sm text-destructive"
        }
      >
        {state.message}
      </div>
    );
  }
  if (!shown || state.kind !== "ready") {
    if (hasFrame || !thumbnail) return null;
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ padding: SLIDE_VIEWPORT_PADDING }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI, next/image can't optimize it */}
        <img src={thumbnail} alt="" className="size-full object-contain" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0" inert={!editable}>
      <SvgEditorProvider initialSvg={state.content}>
        {editable &&
          layersContainer &&
          createPortal(<HierarchyPanel />, layersContainer)}
        <SlideSurface
          workspaceId={workspaceId}
          relPath={relPath}
          initialMtime={state.mtime}
          resourceRevision={resourceRevision}
          active={editable}
          bindToolbarEditor={bindToolbarEditor}
          onDirtyChange={onDirtyChange}
          onSaved={onSaved}
          binding={
            bindSlideEditor ? { slide, bindEditor: bindSlideEditor } : undefined
          }
          prepareContentForEditor={prepareContentForEditor}
          prepareContentForWrite={prepareContentForWrite}
        />
        {editable && (
          <PathToolbarPosition>
            <PathToolbar />
          </PathToolbarPosition>
        )}
      </SvgEditorProvider>
    </div>
  );
}

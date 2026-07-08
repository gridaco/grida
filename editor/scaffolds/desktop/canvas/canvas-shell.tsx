/**
 * Desktop `.canvas` slides editor. The folder is registered as a workspace, so
 * this reads/writes through the `workspaces` bridge fs. The deck's order +
 * structure live in `.canvas.json` (mutated via the `dotcanvas`
 * transforms in {@link CanvasDeck}); each slide is one `<src>.svg` edited with
 * the keynote camera + mtime-safe save.
 *
 * Reuses the props-only slide UI from the web demo (`SlideRow`,
 * `TemplatePicker`, `Presentation`) — promoting those to a shared module is a
 * follow-up; importing them here keeps this pass focused on the desktop wiring.
 */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import { SvgEditorProvider } from "@grida/svg-editor/react";
import { dotcanvas } from "dotcanvas";
import { Button } from "@app/ui/components/button";
import {
  SlideListFocusScope,
  SlideRow,
} from "@/app/(canvas)/svg/examples/slides/_components/slide-row";
import { TemplatePicker } from "@/app/(canvas)/svg/examples/slides/_components/template-picker";
import { Presentation } from "@/app/(canvas)/svg/examples/slides/_components/presentation";
import type { SlideTemplate } from "@/app/(canvas)/svg/examples/slides/_components/templates";
import { EMPTY_SLIDE_SVG } from "@/app/(canvas)/svg/examples/slides/_components/types";
import { svgToDataUri } from "@/app/(canvas)/svg/_storage/thumbnails";
import { SvgToolbar } from "@/app/(canvas)/svg/_components/svg-toolbar";
import {
  PathToolbar,
  PathToolbarPosition,
} from "@/app/(canvas)/svg/_components/path-toolbar";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import { useWorkspaceChanges } from "../workbench/workspace-changes";
import { CanvasDeck, type Slide } from "./deck-store";
import { SlideSurface } from "./slide-surface";
import { materializeSlideSvgResources } from "./slide-svg-resources";

export function DesktopCanvasShell({
  workspaceId,
  basePath = "",
  active = true,
}: {
  workspaceId: string;
  /** Workspace-relative dir of the `.canvas` bundle; "" when it IS the
   *  workspace root (e.g. a `.canvas` opened directly). */
  basePath?: string;
  /** False when mounted as a hidden workbench tab — gates Cmd+S so a
   *  background deck doesn't grab the save. Defaults true (standalone). */
  active?: boolean;
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

  const { map: thumbnails, refresh } = useSlideThumbnails(
    workspaceId,
    slides,
    basePath
  );
  const [presenting, setPresenting] = useState(false);

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
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          mainRef.current?.contains(el))
      ) {
        return;
      }
      if (slides.length === 0) return;
      const cur = Math.max(
        0,
        slides.findIndex((s) => s.id === activeSlide?.id)
      );
      const next = e.key === "ArrowUp" ? cur - 1 : cur + 1;
      if (next < 0 || next >= slides.length) return;
      e.preventDefault();
      setActiveId(slides[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, slides, activeSlide]);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border">
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
        </aside>
        <main ref={mainRef} className="relative min-w-0 flex-1">
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
          <ActiveSlide
            key={activeSlide ? activeSlide.src : "__empty__"}
            workspaceId={workspaceId}
            slide={activeSlide}
            basePath={basePath}
            editable={active}
            thumbnail={activeSlide ? thumbnails[activeSlide.src] : undefined}
            onSaved={() => activeSlide && refresh(activeSlide.src)}
          />
        </main>
      </div>
      <Presentation
        open={presenting}
        pages={pages}
        initialIndex={activeIndex}
        onClose={() => setPresenting(false)}
      />
    </div>
  );
}

/** Slide thumbnails, read once per `src` and refreshable after a save. */
function useSlideThumbnails(
  workspaceId: string,
  slides: readonly Slide[],
  basePath: string
): { map: Record<string, string>; refresh: (src: string) => void } {
  const [map, setMap] = useState<Record<string, string>>({});
  const requested = useRef<Set<string>>(new Set());

  // Keyed by bundle-relative `src` (what the UI looks up), read at the
  // workspace-relative path the bridge speaks.
  const read = useCallback(
    (src: string) => {
      const rel = basePath ? `${basePath}/${src}` : src;
      workspacesNs
        .readFile(workspaceId, rel)
        .then(async (r) => {
          const materialized = await materializeSlideSvgResources(r.content, {
            workspaceId,
            bundleBasePath: basePath,
            slideRelPath: rel,
          });
          setMap((m) => ({ ...m, [src]: svgToDataUri(materialized.svg) }));
        })
        .catch(() => {
          /* a slide that can't be read just shows an empty thumbnail */
        });
    },
    [workspaceId, basePath]
  );

  useEffect(() => {
    for (const s of slides) {
      if (!requested.current.has(s.src)) {
        requested.current.add(s.src);
        read(s.src);
      }
    }
  }, [slides, read]);

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
    <SlideListFocusScope className="h-full">
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
    </SlideListFocusScope>
  );
}

type ActiveState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "ready"; content: string; mtime: number }
  | { kind: "error"; message: string };

function ActiveSlide({
  workspaceId,
  slide,
  basePath,
  editable,
  thumbnail,
  onSaved,
}: {
  workspaceId: string;
  slide: Slide | null;
  basePath: string;
  /** Whether Cmd+S in the slide editor applies (false for a hidden tab). */
  editable: boolean;
  /** The active slide's rendered thumbnail (data URI), shown full-surface WHILE
   *  the slide file loads so switching pages doesn't blink a "Loading…"
   *  placeholder — the deck strip already has these, so a revisit is instant. */
  thumbnail?: string;
  onSaved: () => void;
}) {
  // The slide file's workspace-relative path (the bundle may sit at `basePath`).
  const relPath = slide
    ? basePath
      ? `${basePath}/${slide.src}`
      : slide.src
    : null;
  const [state, setState] = useState<ActiveState>(
    slide ? { kind: "loading" } : { kind: "empty" }
  );
  const restoreRef = useRef<(serialized: string) => string>(
    (serialized) => serialized
  );
  const prepareContentForEditor = useCallback(
    async (diskContent: string) => {
      if (!relPath) return diskContent;
      const materialized = await materializeSlideSvgResources(diskContent, {
        workspaceId,
        bundleBasePath: basePath,
        slideRelPath: relPath,
      });
      restoreRef.current = materialized.restore;
      return materialized.svg;
    },
    [workspaceId, basePath, relPath]
  );
  const prepareContentForWrite = useCallback((serialized: string) => {
    return restoreRef.current(serialized);
  }, []);

  useEffect(() => {
    if (!relPath) {
      setState({ kind: "empty" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    workspacesNs
      .readFile(workspaceId, relPath)
      .then(async (r) => {
        const content = await prepareContentForEditor(r.content);
        if (!cancelled) {
          setState({ kind: "ready", content, mtime: r.mtime });
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

  if (state.kind === "empty") {
    return (
      <div className="flex h-full items-center justify-center text-xs italic text-muted-foreground">
        This deck has no slides yet. Add one from the sidebar.
      </div>
    );
  }
  if (state.kind === "loading") {
    // Show the slide's thumbnail while its file loads so switching pages doesn't
    // flash a "Loading…" placeholder (the SVG is re-read on each page change).
    // Falls back to a neutral surface — never the jarring text — before the
    // first thumbnail is ready.
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URI; next/image can't optimize it
          <img
            src={thumbnail}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : null}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
        {state.message}
      </div>
    );
  }

  return (
    <SvgEditorProvider initialSvg={state.content}>
      <SlideSurface
        workspaceId={workspaceId}
        relPath={relPath!}
        initialMtime={state.mtime}
        active={editable}
        onSaved={onSaved}
        prepareContentForEditor={prepareContentForEditor}
        prepareContentForWrite={prepareContentForWrite}
      />
      <SvgToolbar />
      <PathToolbarPosition>
        <PathToolbar />
      </PathToolbarPosition>
    </SvgEditorProvider>
  );
}

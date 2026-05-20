"use client";

// Slides canvas demo. Multi-page state is owned by this page (not the
// editor): each entry in `pages` is one SVG document. Switching pages
// serializes the current edit back into its entry and remounts the
// provider with the next page's source via `key={activeId}` — each slide
// gets a fresh editor instance with fresh history. The provider's
// `initialSvg` is read once per mount; we never reload an existing editor.
//
// Uses `keynote.attach` from `@grida/svg-editor/presets` for the bundle of
// opinions: cover-constraint, auto-fit on attach, refit on every
// `editor.load()`. The keynote camera preset is what creates the breathing
// margin around the slide content — the host container is full-bleed white.

import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import {
  SvgEditorProvider,
  useEditorSerialize,
  useSvgEditor,
} from "@grida/svg-editor/react";
import { keynote, type KeynoteSurfaceHandle } from "@grida/svg-editor/presets";
import { Button } from "@/components/ui/button";
import { SvgShell } from "../../_components/svg-shell";
import { SvgToolbar } from "../../_components/svg-toolbar";
import { Presentation } from "./_components/presentation";
import { SlidesNav } from "./_components/slides-nav";
import { TITLE_SLIDE_SVG, type SlideTemplate } from "./_components/templates";
import {
  EMPTY_SLIDE_SVG,
  createPage,
  withSvg,
  type SlidePage,
} from "./_components/types";

function initialPages(): SlidePage[] {
  return [createPage("Slide 1", TITLE_SLIDE_SVG)];
}

export default function SlidesCanvasPage() {
  const [pages, setPages] = useState<SlidePage[]>(initialPages);
  const [activeId, setActiveId] = useState<string>(() => pages[0].id);

  const activePage = pages.find((p) => p.id === activeId) ?? pages[0];

  return (
    <SvgEditorProvider
      key={activeId}
      initialSvg={activePage?.svg ?? EMPTY_SLIDE_SVG}
    >
      <SlidesBody
        pages={pages}
        setPages={setPages}
        activeId={activeId}
        setActiveId={setActiveId}
      />
    </SvgEditorProvider>
  );
}

/** Lives inside the provider so `useEditorSerialize()` resolves. */
function SlidesBody({
  pages,
  setPages,
  activeId,
  setActiveId,
}: {
  pages: SlidePage[];
  setPages: React.Dispatch<React.SetStateAction<SlidePage[]>>;
  activeId: string;
  setActiveId: (id: string) => void;
}) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [handle, setHandle] = useState<KeynoteSurfaceHandle | null>(null);
  const [presenting, setPresenting] = useState(false);
  const serialize = useEditorSerialize();

  const activePage = pages.find((p) => p.id === activeId) ?? pages[0];
  const activeIndex = pages.findIndex((p) => p.id === activeId);

  const persistActive = useCallback(() => {
    const svg = serialize();
    setPages((prev) =>
      prev.map((p) => (p.id === activeId ? withSvg(p, svg) : p))
    );
  }, [serialize, activeId, setPages]);

  const selectPage = (id: string) => {
    if (id === activeId) return;
    persistActive();
    setActiveId(id);
  };

  const appendPage = (svg: string, name?: string) => {
    persistActive();
    const page = createPage(name ?? `Slide ${pages.length + 1}`, svg);
    setPages((prev) => [...prev, page]);
    setActiveId(page.id);
  };

  const removePage = (id: string) => {
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((p) => p.id !== id);
      if (id === activeId) {
        const idx = prev.findIndex((p) => p.id === id);
        setActiveId(next[Math.max(0, idx - 1)].id);
      }
      return next;
    });
  };

  const loadSvgFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (!text.includes("<svg")) {
        setLoadError(`"${file.name}" does not contain an <svg> element.`);
        return;
      }
      setLoadError(null);
      setSourceName(file.name);
      appendPage(text, file.name.replace(/\.svg$/i, ""));
    };
    reader.onerror = () => setLoadError("Failed to read file.");
    reader.readAsText(file);
  };

  const onReset = () => {
    setLoadError(null);
    setSourceName(null);
    const fresh = initialPages();
    setPages(fresh);
    setActiveId(fresh[0].id);
  };

  const startPresenting = () => {
    persistActive();
    setPresenting(true);
  };

  return (
    <>
      <EditorCommitWatcher onCommit={persistActive} />
      <SvgShell
        title="SVG / Slides"
        badge="DEMO"
        handle={handle}
        sourceName={sourceName ?? activePage?.name ?? null}
        loadError={loadError}
        onPickFile={loadSvgFile}
        onReset={onReset}
        onCameraFit={() =>
          handle?.camera.fit("<root>", {
            margin: handle.camera.constraints?.padding ?? 0,
          })
        }
        onCameraReset={() => handle?.camera.set_zoom(1)}
        sidebarContent={
          <SlidesNav
            pages={pages}
            activeId={activeId}
            onAdd={() => appendPage(EMPTY_SLIDE_SVG)}
            onAddFromTemplate={(t: SlideTemplate) => appendPage(t.svg)}
            onSelect={selectPage}
            onRemove={removePage}
          />
        }
        inspectorActions={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={startPresenting}
            title="Present from current slide"
            aria-label="Present from current slide"
          >
            <Play />
          </Button>
        }
        canvas={<SlideStage setHandle={setHandle} loadSvgFile={loadSvgFile} />}
      />
      <Presentation
        open={presenting}
        pages={pages}
        initialIndex={Math.max(0, activeIndex)}
        onClose={() => setPresenting(false)}
      />
    </>
  );
}

/**
 * Debounced re-serialization of the active page on commit/gesture-end.
 *
 * Subscribes to the full `editor.subscribe` channel (not `subscribe_geometry`)
 * so presentation-only writes — fill, opacity, stroke — also refresh the
 * thumbnail. The 250ms quiet window coincides with gesture end and avoids
 * serializing 60× per second mid-drag.
 */
function EditorCommitWatcher({
  onCommit,
  debounceMs = 250,
}: {
  onCommit: () => void;
  debounceMs?: number;
}) {
  const editor = useSvgEditor();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onCommit();
      }, debounceMs);
    };
    const off = editor.subscribe(tick);
    return () => {
      if (timer) clearTimeout(timer);
      off();
    };
  }, [editor, onCommit, debounceMs]);
  return null;
}

function SlideStage({
  setHandle,
  loadSvgFile,
}: {
  setHandle: (h: KeynoteSurfaceHandle | null) => void;
  loadSvgFile: (f: File) => void;
}) {
  const editor = useSvgEditor();
  const container_ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = container_ref.current;
    if (!container) return;
    const h = keynote.attach(editor, { container, pan_overshoot: 80 });
    setHandle(h);
    return () => {
      setHandle(null);
      h.detach();
    };
  }, [editor, setHandle]);

  const [dragging, setDragging] = useState(false);
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    for (const file of files) loadSvgFile(file);
  };

  // `container_ref` is the surface container — the DOM surface installs a
  // pointerdown listener on it and may capture the pointer. Interactive
  // chrome (toolbar, drag overlay) must NOT be a DOM descendant —
  // even with the package's defensive capture-gating, nesting chrome
  // here is the wrong shape and triggers the dev-only `console.warn`
  // from `@grida/svg-editor` at attach time.
  return (
    <>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        ref={container_ref}
        className="absolute inset-0"
      />
      <SvgToolbar />
      {dragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 text-primary text-base font-semibold pointer-events-none z-10">
          Drop SVG to add as new page
        </div>
      )}
    </>
  );
}

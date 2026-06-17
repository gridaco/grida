"use client";

// Slides canvas demo. Multi-doc state + persistence + AI agent come from
// the shared `SvgRouteShell`. This file owns only the slide-specific
// presentation surface (keynote camera preset + Presentation overlay)
// and template-aware add operations.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Play } from "lucide-react";
import { useSvgEditor } from "@grida/svg-editor/react";
import { keynote, type KeynoteSurfaceHandle } from "@grida/svg-editor/presets";
import { Button } from "@app/ui/components/button";
import { SvgShell } from "../../_components/svg-shell";
import { SvgToolbar } from "../../_components/svg-toolbar";
import {
  PathToolbar,
  PathToolbarPosition,
} from "../../_components/path-toolbar";
import { Presentation } from "./_components/presentation";
import { SlidesNav } from "./_components/slides-nav";
import { useOpacityDigitsHotkeys } from "../../_components/use-opacity-digits";
import { TITLE_SLIDE_SVG, type SlideTemplate } from "./_components/templates";
import { EMPTY_SLIDE_SVG } from "./_components/types";
import { SvgRouteShell, useSvgDocStore } from "../../_storage";
import { useSvgAgentHydrated } from "../../_ai/provider";

const OPFS_BASE = ["grida-svg-demo", "v2", "slides"] as const;

export default function SlidesCanvasPage() {
  return (
    <SvgRouteShell opfsBase={OPFS_BASE} defaultSvg={TITLE_SLIDE_SVG}>
      <SlidesBody />
    </SvgRouteShell>
  );
}

function SlidesBody() {
  const store = useSvgDocStore();
  const docs = useSyncExternalStore(
    store.subscribe,
    store.getDocs,
    store.getDocs
  );
  const activeId = useSyncExternalStore(
    store.subscribe,
    store.getActiveId,
    store.getActiveId
  );

  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [handle, setHandle] = useState<KeynoteSurfaceHandle | null>(null);
  const [presenting, setPresenting] = useState(false);

  const activeDoc = docs.find((d) => d.id === activeId);
  const activeIndex = docs.findIndex((d) => d.id === activeId);
  const hydrated = useSvgAgentHydrated();

  // Host-owned digit → opacity shortcut (1–9 / 0 / 0 0) + toast. Suppressed
  // while presenting, where digits are not an authoring gesture.
  useOpacityDigitsHotkeys({ enabled: !presenting });

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
      store.appendDoc(text, file.name.replace(/\.svg$/i, ""));
    };
    reader.onerror = () => setLoadError("Failed to read file.");
    reader.readAsText(file);
  };

  const onReset = () => {
    setLoadError(null);
    setSourceName(null);
    store.reset(TITLE_SLIDE_SVG, "Slide 1");
  };

  return (
    <>
      <SvgShell
        title="SVG / Slides"
        badge="DEMO"
        handle={handle}
        sourceName={sourceName ?? activeDoc?.name ?? null}
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
            docs={docs}
            activeId={activeId}
            onAdd={() => store.appendDoc(EMPTY_SLIDE_SVG)}
            onAddFromTemplate={(t: SlideTemplate) => store.appendDoc(t.svg)}
            onSelect={(id) => store.setActiveId(id)}
            onRemove={(id) => store.removeDoc(id)}
          />
        }
        inspectorActions={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setPresenting(true)}
            title="Present from current slide"
            aria-label="Present from current slide"
          >
            <Play />
          </Button>
        }
        canvas={
          <SlideStage
            setHandle={setHandle}
            loadSvgFile={loadSvgFile}
            hidden={!hydrated}
          />
        }
      />
      <Presentation
        open={presenting}
        pages={docs}
        initialIndex={Math.max(0, activeIndex)}
        onClose={() => setPresenting(false)}
      />
    </>
  );
}

function SlideStage({
  setHandle,
  loadSvgFile,
  hidden,
}: {
  setHandle: (h: KeynoteSurfaceHandle | null) => void;
  loadSvgFile: (f: File) => void;
  hidden: boolean;
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

  // The keynote DOM surface installs a pointerdown listener on the
  // container and may capture the pointer. Interactive chrome (toolbar,
  // drag overlay) lives as siblings, not descendants — even with the
  // package's defensive capture-gating, nesting chrome inside is the
  // wrong shape and triggers a dev-only warning at attach time.
  return (
    <>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        ref={container_ref}
        className="absolute inset-0"
        style={{ visibility: hidden ? "hidden" : "visible" }}
      />
      <SvgToolbar />
      <PathToolbarPosition>
        <PathToolbar />
      </PathToolbarPosition>
      {dragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 text-primary text-base font-semibold pointer-events-none z-10">
          Drop SVG to add as new page
        </div>
      )}
    </>
  );
}

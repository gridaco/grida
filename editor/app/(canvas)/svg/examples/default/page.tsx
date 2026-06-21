"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  SvgEditorCanvas,
  useCommands,
  useEditorLoad,
} from "@grida/svg-editor/react";
import type { DomSurfaceHandle } from "@grida/svg-editor/dom";
import { toast } from "sonner";
import { datatransfer } from "@/grida-canvas/data-transfer";
import { SvgShell } from "../../_components/svg-shell";
import { SvgToolbar } from "../../_components/svg-toolbar";
import {
  PathToolbar,
  PathToolbarPosition,
} from "../../_components/path-toolbar";
import { DocsNav } from "../../_components/docs-nav";
import { SvgLibraryWindow } from "../../_components/library-window";
import { useOpacityDigitsHotkeys } from "../../_components/use-opacity-digits";
import { fragment } from "../../_components/fragment";
import SAMPLE_SVG from "../../_fixtures/artwork";
import { SvgRouteShell, useSvgDocStore } from "../../_storage";
import { useSvgAgentHydrated } from "../../_ai/provider";

// v4: persistence moved from the `_meta/index.json` sidecar to a `.canvas`
// bundle (canvas.json + <id>.svg) via @grida/io-canvas. Old data is dropped.
const OPFS_BASE = ["grida-svg-demo", "v4", "default"] as const;

export default function SvgEditorDevPage() {
  return (
    <SvgRouteShell opfsBase={OPFS_BASE} defaultSvg={SAMPLE_SVG}>
      <SvgEditorDevPageBody />
    </SvgRouteShell>
  );
}

function SvgEditorDevPageBody() {
  const store = useSvgDocStore();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<"file" | "library" | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [handle, setHandle] = useState<DomSurfaceHandle | null>(null);
  const load = useEditorLoad();
  const cmd = useCommands();
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
  const activeDoc = docs.find((d) => d.id === activeId);
  // Defer canvas paint until the store has hydrated, so the seed fixture
  // doesn't flash before persisted content loads in.
  const hydrated = useSvgAgentHydrated();

  // Host-owned digit → opacity shortcut (1–9 / 0 / 0 0) + toast. svg-editor
  // ships the `set_opacity` command but not this binding — see the hook.
  useOpacityDigitsHotkeys();

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

  // Fetch a library asset and insert it as ONE history step. With a target
  // point, the position is authored into the markup — see
  // `fragment.position`. Shared by click-to-insert and drop-at-point.
  const insertFromSrc = useCallback(
    (src: string, at: { x: number; y: number } | null) => {
      const task = fetch(src, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch icon");
          return res.text();
        })
        .then((svg) => {
          cmd.insert_fragment(at ? fragment.position(svg, at) : svg);
        });
      toast.promise(task, {
        loading: "Loading icon...",
        success: "Icon inserted",
        error: "Failed to insert icon",
      });
    },
    [cmd]
  );

  // Library click-to-insert: land the icon at the viewport center.
  const insertSrcAtViewportCenter = useCallback(
    (src: string) => insertFromSrc(src, handle?.camera.center ?? null),
    [insertFromSrc, handle]
  );

  const dragKind = (dt: DataTransfer | null): "file" | "library" | null => {
    if (dt?.types?.includes(datatransfer.key)) return "library";
    if (dt?.types?.includes("Files")) return "file";
    return null;
  };

  const onDragOver = (e: React.DragEvent) => {
    const kind = dragKind(e.dataTransfer);
    if (!kind) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (dragging !== kind) setDragging(kind);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragging(null);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(null);
    const known = e.dataTransfer?.getData(datatransfer.key);
    if (known) {
      const data = datatransfer.decode(known);
      if (data.type !== "svg") return;
      // Drop point → world space, so the icon lands centered under the
      // pointer. Same screen-space convention as the surface's gestures.
      const cr = e.currentTarget.getBoundingClientRect();
      const at =
        handle?.camera.screen_to_world({
          x: e.clientX - cr.left,
          y: e.clientY - cr.top,
        }) ?? null;
      insertFromSrc(data.src, at);
      return;
    }
    const file = e.dataTransfer?.files?.[0];
    if (file) loadSvgFile(file);
  };

  return (
    <SvgShell
      title="Canvas / SVG"
      badge="DEMO"
      handle={handle}
      sourceName={sourceName ?? activeDoc?.name ?? null}
      loadError={loadError}
      onPickFile={loadSvgFile}
      onReset={() => {
        setLoadError(null);
        setSourceName(null);
        load(SAMPLE_SVG);
      }}
      sidebarContent={<DocsNav />}
      canvas={
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className="absolute inset-0 bg-[radial-gradient(circle,theme(colors.border)_1px,transparent_1px)] [background-size:20px_20px] data-[dragging=true]:outline-2 data-[dragging=true]:outline-dashed data-[dragging=true]:outline-primary data-[dragging=true]:-outline-offset-2"
          data-dragging={dragging !== null}
        >
          <SvgEditorCanvas
            fit
            onAttach={setHandle}
            className="w-full h-full"
            style={{ visibility: hydrated ? "visible" : "hidden" }}
          />
          <SvgToolbar />
          <PathToolbarPosition>
            <PathToolbar />
          </PathToolbarPosition>
          {dragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/5 text-primary text-sm font-semibold pointer-events-none">
              {dragging === "file" ? "Drop SVG to load" : "Drop to insert"}
            </div>
          )}
        </div>
      }
      canvasOverlay={
        // Sibling of the drop target on purpose — dropping an icon back
        // onto the Library window must not insert it into the canvas.
        <SvgLibraryWindow onInsertSrc={insertSrcAtViewportCenter} />
      }
    />
  );
}

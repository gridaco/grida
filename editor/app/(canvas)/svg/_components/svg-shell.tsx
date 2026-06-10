"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { CaretDownIcon } from "@radix-ui/react-icons";
import {
  useCameraSnapshot,
  useCanRedo,
  useCanUndo,
  useCommands,
  useEditorSerialize,
  useEditorState,
  useSvgEditor,
} from "@grida/svg-editor/react";
import type { SvgEditor } from "@grida/svg-editor";
import { Badge } from "@app/ui/components/badge";
import { Button } from "@app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { Input } from "@app/ui/components/input";
import { GridaLogo } from "@/components/grida-logo";
import { HierarchyPanel } from "./hierarchy-panel";
import { InspectorPanel } from "./inspector-panel";
import { SvgMenuContent } from "./svg-menu";
import { SvgCanvasContextMenu } from "./context-menu";

/** Zoom step matches the editor's keyboard handler — see
 *  `gestures/defaults.ts#ZOOM_STEP`. */
const ZOOM_STEP = 1.2;

type CameraHandleLike = Parameters<typeof useCameraSnapshot>[0];

/**
 * Shared shell for the SVG demo pages.
 *
 * Layout: left sidebar (logo + dropdown + sidebarContent) | center canvas
 * | right inspector (camera chrome on top + inspector body).
 *
 * Demo-specific concerns: the parent owns the canvas surface and the
 * left-sidebar body. The shell wires the dropdown, file picker, header,
 * and inspector identically across both demos.
 */
export function SvgShell({
  title,
  badge,
  canvas,
  handle,
  sourceName,
  loadError,
  onPickFile,
  onReset,
  onCameraFit,
  onCameraReset,
  sidebarContent,
  inspectorActions,
  canvasOverlay,
}: {
  title: string;
  badge?: string;
  canvas: React.ReactNode;
  handle: CameraHandleLike | null;
  sourceName: string | null;
  loadError: string | null;
  onPickFile: (file: File) => void;
  onReset: () => void;
  /** Optional override — defaults to `handle.camera.fit("<root>")`. */
  onCameraFit?: () => void;
  /** Optional override — defaults to `camera.reset()` or `set_zoom(1)`. */
  onCameraReset?: () => void;
  /**
   * Left-sidebar body. Defaults to a "Layers" heading + `<HierarchyPanel/>`.
   * Override for multi-page demos (Pages + Layers).
   */
  sidebarContent?: React.ReactNode;
  /** Optional trailing actions in the Inspector header (e.g. Play). */
  inspectorActions?: React.ReactNode;
  /**
   * Floating chrome over the canvas area (e.g. a Library window), rendered
   * as a SIBLING of `canvas` — outside its drop target and context-menu
   * wrapper, so interactions on the overlay don't leak into the canvas.
   */
  canvasOverlay?: React.ReactNode;
}) {
  const editor = useSvgEditor();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const hasSelection = useEditorState((s) => s.selection.length > 0);
  const cmd = useCommands();
  const serialize = useEditorSerialize();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __svgEditor: unknown }).__svgEditor = editor;
  }, [editor]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPickFile(file);
  };

  const saveSvg = () => {
    const text = serialize();
    const blob = new Blob([text], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const base = sourceName?.replace(/\.svg$/i, "") ?? "sample";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.modified.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFit = onCameraFit ?? (() => handle?.camera.fit("<root>"));
  const handleReset =
    onCameraReset ??
    (() => {
      const c = handle?.camera as
        | { reset?: () => void; set_zoom?: (z: number) => void }
        | undefined;
      if (c?.reset) c.reset();
      else c?.set_zoom?.(1);
    });

  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        onChange={onChange}
        className="hidden"
        data-testid="open-svg-input"
      />

      {/* ─── Left sidebar ────────────────────────────────────────── */}
      <aside className="w-64 border-r flex flex-col">
        <header className="h-11 min-h-11 flex items-center px-3">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 me-2 -ms-1">
                <GridaLogo className="inline-block size-4" />
              </Button>
            </DropdownMenuTrigger>
            <SvgMenuContent
              canUndo={canUndo}
              canRedo={canRedo}
              canCopy={hasSelection}
              onOpenFile={() => fileInputRef.current?.click()}
              onSaveFile={saveSvg}
              onReset={onReset}
              onUndo={() => cmd.undo()}
              onRedo={() => cmd.redo()}
              // Menu items route through the command REGISTRY (not the
              // bare commands) — this is the provider/RPC acquisition
              // path the keystroke flow never exercises: copy/cut write
              // navigator.clipboard via the route's ClipboardProvider,
              // paste reads it (see route-shell.tsx).
              onCopy={() => cmd.invoke("clipboard.copy")}
              onCut={() => cmd.invoke("clipboard.cut")}
              onPaste={() => cmd.invoke("clipboard.paste")}
            />
          </DropdownMenu>
          <span className="font-bold text-xs">{title}</span>
          {badge && (
            <Badge variant="outline" className="ms-2 text-[10px] py-0 h-4">
              {badge}
            </Badge>
          )}
        </header>
        {loadError && (
          <div className="m-2 px-2 py-1.5 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive">
            {loadError}
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0">
          {sidebarContent ?? (
            <>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-2 pb-1 shrink-0">
                Layers
              </h2>
              <div className="flex-1 overflow-auto px-2 pb-2">
                <HierarchyPanel />
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ─── Center: canvas ─────────────────────────────────────── */}
      <main className="flex-1 relative bg-muted overflow-hidden">
        <SvgCanvasContextMenu>{canvas}</SvgCanvasContextMenu>
        {canvasOverlay}
      </main>

      {/* ─── Right sidebar: inspector ───────────────────────────── */}
      <aside className="w-64 border-l flex flex-col">
        <header className="h-11 min-h-11 flex items-center justify-between gap-2 px-3 border-b">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Inspector
          </span>
          {inspectorActions}
        </header>
        <CameraChromeBar
          handle={handle}
          onFit={handleFit}
          onReset={handleReset}
        />
        <div className="flex-1 overflow-auto py-2">
          <InspectorPanel />
        </div>
      </aside>
    </div>
  );
}

function CameraChromeBar({
  handle,
  onFit,
  onReset,
}: {
  handle: CameraHandleLike | null;
  onFit: () => void;
  onReset: () => void;
}) {
  const editor = useSvgEditor();
  const zoom = useCameraSnapshot(handle, (c) => c.zoom, 1);
  // Primitive selectors — `useSyncExternalStore` short-circuits on
  // `Object.is`, so this bar only re-renders when the style booleans
  // actually flip, not on every `emit()`.
  const pixelGrid = useEditorStyleFlag(editor, "pixel_grid");
  const snapToPixelGrid = useEditorStyleFlag(editor, "snap_to_pixel_grid");

  const pct = Math.round(zoom * 100);
  const setZoom = (z: number) => handle?.camera.set_zoom(z);

  return (
    <div className="flex items-center justify-end px-2 py-1.5 border-b">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 gap-1 tabular-nums text-muted-foreground"
            disabled={!handle}
          >
            {pct}%
            <CaretDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="min-w-52">
          <div className="px-1 pb-1">
            <Input
              type="number"
              value={pct}
              min={2}
              step={1}
              max={256}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) / 100;
                if (v) setZoom(v);
              }}
              className="h-7 text-xs"
            />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setZoom(zoom * ZOOM_STEP)}
            className="text-xs"
          >
            Zoom in
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setZoom(zoom / ZOOM_STEP)}
            className="text-xs"
          >
            Zoom out
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onFit} className="text-xs">
            Zoom to fit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setZoom(0.5)} className="text-xs">
            Zoom to 50%
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onReset} className="text-xs">
            Zoom to 100%
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setZoom(2)} className="text-xs">
            Zoom to 200%
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={pixelGrid}
            onSelect={(e) => {
              e.preventDefault();
              editor.set_style({ pixel_grid: !pixelGrid });
            }}
            className="text-xs"
          >
            Pixel grid
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={snapToPixelGrid}
            onSelect={(e) => {
              e.preventDefault();
              editor.set_style({ snap_to_pixel_grid: !snapToPixelGrid });
            }}
            className="text-xs"
          >
            Snap to pixel grid
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Subscribe to a single boolean on `editor.style`. The editor doesn't
 * have a dedicated style channel — `set_style` piggy-backs on the global
 * `emit()` — so we still subscribe to that, but the snapshot returns a
 * primitive, which `useSyncExternalStore` compares with `Object.is`.
 * Result: this hook re-renders ONLY when the flag flips, even though
 * the underlying channel fires per-pointermove during a drag.
 */
function useEditorStyleFlag(
  editor: SvgEditor,
  key: "pixel_grid" | "snap_to_pixel_grid"
): boolean {
  const subscribe = useCallback(
    (cb: () => void) => editor.subscribe(cb),
    [editor]
  );
  const get = useCallback(() => editor.style[key], [editor, key]);
  return useSyncExternalStore(subscribe, get, get);
}

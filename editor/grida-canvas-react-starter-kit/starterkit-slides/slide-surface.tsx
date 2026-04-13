"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ViewportRoot,
  EditorSurface,
  StandaloneSceneBackground,
  useCurrentEditor,
} from "@/grida-canvas-react";
import { EditorSurfaceDropzone } from "@/grida-canvas-react/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-canvas-react/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-canvas-react/viewport/surface";
import { WithSize } from "@/grida-canvas-react/viewport/size";
import { useDPR } from "@/grida-canvas-react/viewport/hooks/use-dpr";

/**
 * Slide-aware canvas surface composition.
 *
 * Encapsulates the full surface stack for a slides editor:
 *
 * - Clipboard sync
 * - Dropzone (file drag & drop)
 * - Context menu
 * - Scene background
 * - Viewport root with overlays (including `RootFramesBarOverlay`)
 * - EditorSurface (DOM overlay layer)
 * - WASM canvas element
 *
 * The `RootFramesBarOverlay` inside `EditorSurface` already handles
 * isolation mode correctly — when a slide (tray) is isolated, only that
 * tray's title bar is shown. This component simply composes the layers
 * in the correct order and manages the WASM canvas lifecycle.
 *
 * Pass toolbar content as `children` — it will be rendered inside the
 * viewport root, above the canvas.
 */
export function SlideSurface({ children }: React.PropsWithChildren) {
  const instance = useCurrentEditor();
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null
  );
  const handleCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasElement(node);
  }, []);

  // Mount WASM canvas backend
  useEffect(() => {
    if (!canvasElement) return;

    let cancelled = false;
    const dpr = window.devicePixelRatio || 1;
    instance
      .mount(canvasElement, dpr)
      .then(() => {
        if (!cancelled) {
          // mounted
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to mount canvas surface", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canvasElement, instance]);

  return (
    <>
      <EditorSurfaceClipboardSyncProvider />
      <EditorSurfaceDropzone>
        <EditorSurfaceContextMenu>
          <StandaloneSceneBackground className="w-full h-full flex flex-col relative">
            <ViewportRoot className="relative w-full h-full overflow-hidden">
              <EditorSurface />
              <WasmCanvas ref={handleCanvasRef} />
              {children}
            </ViewportRoot>
          </StandaloneSceneBackground>
        </EditorSurfaceContextMenu>
      </EditorSurfaceDropzone>
    </>
  );
}

// ---------------------------------------------------------------------------
// WASM canvas element
// ---------------------------------------------------------------------------

function WasmCanvas({
  ref,
}: {
  ref?: (canvas: HTMLCanvasElement | null) => void;
}) {
  const dpr = useDPR();

  return (
    <WithSize
      className="w-full h-full max-w-full max-h-full"
      style={{ contain: "strict" }}
    >
      {({ width, height }) => (
        <canvas
          id="canvas"
          ref={ref}
          width={width * dpr}
          height={height * dpr}
          style={{ width, height }}
        />
      )}
    </WithSize>
  );
}

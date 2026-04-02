import { useEffect, useState } from "react";
import { CanvasSurfaceUI } from "@/grida-canvas/backends/wasm-surface-provider";
import { useBackendState, useEditableState } from "../../provider";
import { useCurrentEditor } from "../../use-editor";

/**
 * Manages the WASM native surface lifecycle for readonly canvas mode.
 *
 * When `editable === false` and `backend === "canvas"`, the WASM engine
 * handles all surface interaction (hover, selection, marquee, cursor,
 * overlays) natively — no React overlay pipeline needed.
 *
 * Returns `active: true` when the WASM surface is mounted and handling events,
 * so the caller can skip React gesture bindings and overlay rendering.
 */
export function useWasmSurface(
  eventTargetRef: React.RefObject<HTMLDivElement | null>
): { active: boolean } {
  const editor = useCurrentEditor();
  const editable = useEditableState();
  const backend = useBackendState();

  const shouldUse = !editable && backend === "canvas";

  // Track when wasmScene becomes available (set asynchronously after mount)
  const [wasmScene, setWasmScene] = useState(editor.wasmScene);
  useEffect(() => {
    if (!shouldUse) return;
    if (editor.wasmScene) {
      setWasmScene(editor.wasmScene);
      return;
    }
    const interval = setInterval(() => {
      if (editor.wasmScene) {
        setWasmScene(editor.wasmScene);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [shouldUse, editor]);

  // Mount CanvasSurfaceUI when using native surface
  useEffect(() => {
    if (!shouldUse) return;
    const target = eventTargetRef.current;
    if (!wasmScene || !target) return;

    const dpr = window.devicePixelRatio || 1;
    wasmScene.setSurfaceOverlayConfig({
      dpr,
      show_size_meter: true,
      show_frame_titles: true,
      text_baseline_decoration: true,
    });

    const provider = new CanvasSurfaceUI(
      wasmScene,
      target,
      (action) => editor.doc.dispatch(action),
      editor.camera,
      dpr
    );

    return () => provider.destroy();
  }, [shouldUse, wasmScene, editor, eventTargetRef.current]);

  return { active: shouldUse };
}

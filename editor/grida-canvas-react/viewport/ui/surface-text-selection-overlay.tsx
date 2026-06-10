"use client";

import React from "react";
import {
  useBackendState,
  useContentEditModeMinimalState,
} from "@/grida-canvas-react/provider";

/**
 * Text-dedicated selection overlay (single selection only).
 *
 * Entry point for all text-specific selection overlay logic. When the selected
 * node is a text node (tspan), SingleSelectionOverlay delegates here.
 *
 * Behavior:
 * - **WASM + text edit mode:** Renders nothing. The outline is drawn by WASM
 *   via highlightStrokes; no DOM overlay avoids a stale rect as the user types.
 * - **Otherwise:** Renders the frame (children, typically NodeOverlay).
 */
export function TextSelectionOverlay({
  children,
}: React.PropsWithChildren<{ node_id: string; readonly?: boolean }>) {
  const backend = useBackendState();
  const content_edit_mode = useContentEditModeMinimalState();

  if (backend === "canvas" && content_edit_mode?.type === "text") {
    return null;
  }

  return <>{children}</>;
}

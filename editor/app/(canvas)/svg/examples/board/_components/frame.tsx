"use client";

import * as React from "react";
import type { Frame } from "../_core/svg-canvas";

/**
 * An inert, placed SVG document on the canvas.
 *
 * Rendered as `<img src="data:image/svg+xml,…">` — full per-document isolation
 * (no cross-frame `id`/CSS collision), mirroring the slides `Presentation`
 * pattern. It lives INSIDE the transformed world layer, so it pans/zooms with
 * the camera; the host only ever hit-tests its world rect, never its internals.
 *
 * When a frame becomes "active" (feature rung C), this <img> is swapped for a
 * mounted @grida/svg-editor surface — not implemented in round 1.
 */
export function FrameView({ frame }: { frame: Frame }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frame.dataUri}
      alt={frame.id}
      width={frame.rect.width}
      height={frame.rect.height}
      draggable={false}
      data-frame-id={frame.id}
      style={{
        position: "absolute",
        left: frame.rect.x,
        top: frame.rect.y,
        width: frame.rect.width,
        height: frame.rect.height,
        // defeat Tailwind preflight's `img { max-width: 100%; height: auto }`,
        // which would clamp the img to the 0-width world layer (→ invisible).
        maxWidth: "none",
        maxHeight: "none",
        display: "block",
        // a subtle frame chrome so empty/edge areas read as a "frame"
        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        background: "#fff",
        userSelect: "none",
      }}
    />
  );
}

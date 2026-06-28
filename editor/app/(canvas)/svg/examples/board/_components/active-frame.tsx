"use client";

import * as React from "react";
import cmath from "@grida/cmath";
import { createSvgEditor, type SvgEditor } from "@grida/svg-editor";
import {
  attach_dom_surface,
  type DomSurfaceHandle,
} from "@grida/svg-editor/dom";
import type { Frame, Rect } from "../_core/svg-canvas";

/**
 * The ACTIVE frame — an in-place live `@grida/svg-editor` (feature rung C).
 *
 * IMPORTANT — coordinate space. The editor pre-projects its HUD chrome to true
 * screen px via `getScreenCTM()` (which folds in ancestor CSS transforms) and
 * renders it on a HUD canvas kept at identity. So the editor MUST NOT live
 * inside the host's scaled world layer — the scale would double-apply and the
 * chrome would drift toward the frame's top-left.
 *
 * Instead this mounts in UNSCALED screen space at the frame's SCREEN rect
 * (`worldRectToScreen`), and the editor's OWN camera supplies the zoom — set
 * explicitly to `scale(hostZoom)` (the editor's `transform-origin` is `0 0`, so
 * world (0..w) maps to container px (0..w·zoom), filling the container). Now
 * `getScreenCTM()` == the editor's own camera, the HUD canvas is 1:1 with the
 * screen, and chrome lands correctly.
 *
 * Write-back: on unmount (deactivate) the editor serializes back into the frame.
 * Per-document history lives in this instance and is discarded on close.
 */
function scaleTransform(z: number): cmath.Transform {
  return [
    [z, 0, 0],
    [0, z, 0],
  ];
}

export function ActiveFrame({
  frame,
  screenRect,
  zoom,
  onCommit,
  onEditor,
}: {
  frame: Frame;
  /** The frame's rect projected to screen px (host camera applied). */
  screenRect: Rect;
  /** Host camera zoom — the editor's own camera mirrors it. */
  zoom: number;
  onCommit: (id: string, svg: string) => void;
  /** Hand the live editor instance to the host (for unified-history routing). */
  onEditor?: (editor: SvgEditor | null) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const handleRef = React.useRef<DomSurfaceHandle | null>(null);
  const onCommitRef = React.useRef(onCommit);
  onCommitRef.current = onCommit;
  const onEditorRef = React.useRef(onEditor);
  onEditorRef.current = onEditor;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const editor: SvgEditor = createSvgEditor({ svg: frame.svg });
    const handle = attach_dom_surface(editor, {
      container,
      gestures: false, // host owns pan/zoom; editor edits within the frame
    });
    handle.camera.set_transform(scaleTransform(zoom));
    handleRef.current = handle;
    onEditorRef.current?.(editor);
    return () => {
      try {
        onCommitRef.current(frame.id, editor.serialize());
      } catch {
        // ignore serialize failures on teardown
      }
      onEditorRef.current?.(null);
      handle.detach();
      editor.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mirror the host zoom onto the editor's own camera
  React.useEffect(() => {
    handleRef.current?.camera.set_transform(scaleTransform(zoom));
  }, [zoom]);

  return (
    <div
      ref={containerRef}
      data-active-frame={frame.id}
      // The editor keeps its svg LAYOUT box at viewBox px (the CSS camera scale
      // is visual-only), so it overflows this screen-sized container and the
      // editor's selection `scrollIntoView` would scroll it. Content already
      // fits visually, so pin scroll to the origin (keeps content + HUD aligned).
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
      style={{
        position: "absolute",
        left: screenRect.x,
        top: screenRect.y,
        width: screenRect.width,
        height: screenRect.height,
        background: "#fff",
        overflow: "hidden",
        boxShadow: "0 0 0 2px #2563eb, 0 4px 16px rgba(37,99,235,0.25)",
      }}
    />
  );
}

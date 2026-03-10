/**
 * Surface Text Editor
 *
 * Renders an inline text editing overlay on the canvas surface.
 *
 * Two modes based on the rendering backend:
 *
 * **WASM/Canvas backend (primary):**
 * The text editing engine (grida-text-edit) runs entirely in WASM.
 * This component provides a thin input relay — a hidden `<textarea>` for
 * keyboard/IME capture and a transparent overlay for pointer events.
 * All rendering (text, caret, selection highlights) is handled by the
 * Painter on the Skia canvas. The web layer only toggles the session
 * and forwards events.
 *
 * **DOM backend (fallback):**
 * Uses a `ContentEditable` div for browser-native text editing, positioned
 * as an overlay matching the node's canvas position.
 */

import React, { useEffect, useRef, useCallback, useMemo } from "react";
import cmath from "@grida/cmath";
import grida from "@grida/schema";
import {
  useNode,
  useTransformState,
  useCurrentEditor,
} from "@/grida-canvas-react";
import { useBackendState } from "@/grida-canvas-react/provider";
import { keyEventToTextEditCommand } from "@/grida-canvas/commands/text-edit";
import { useSingleSelection } from "../surface-hooks";
import { css } from "@/grida-canvas-utils/css";
import ContentEditable from "@/components/primitives/contenteditable";
import type { Scene } from "@grida/canvas-wasm";

// ---------------------------------------------------------------------------
// SurfaceTextEditor (public API)
// ---------------------------------------------------------------------------

export function SurfaceTextEditor({ node_id }: { node_id: string }) {
  const backend = useBackendState();

  if (backend === "canvas") {
    return <WasmTextEditorRelay node_id={node_id} />;
  }

  return <DOMTextEditorOverlay node_id={node_id} />;
}

// ===========================================================================
// WASM backend — thin input relay
// ===========================================================================

// Multi-click detection constants
const MULTI_CLICK_TIMEOUT = 500;
const MULTI_CLICK_RADIUS = 5;

interface ClickState {
  count: number;
  time: number;
  x: number;
  y: number;
}

function WasmTextEditorRelay({ node_id }: { node_id: string }) {
  const editor = useCurrentEditor();
  const node = useNode(node_id);
  const { transform } = useTransformState();
  const selection = useSingleSelection(node_id);
  const scene: Scene | null = editor.wasmScene;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);
  const isDraggingRef = useRef(false);
  const composingRef = useRef(false);
  const clickStateRef = useRef<ClickState>({
    count: 0,
    time: 0,
    x: 0,
    y: 0,
  });

  // --- Layout geometry --------------------------------------------------

  const scale = useMemo(() => cmath.transform.getScale(transform), [transform]);
  const scaleX = scale[0] || 1;
  const scaleY = scale[1] || 1;

  const width = selection?.size[0] ?? 0;
  const height = selection?.size[1] ?? 0;

  const centerX = selection
    ? selection.boundingSurfaceRect.x + selection.boundingSurfaceRect.width / 2
    : 0;
  const centerY = selection
    ? selection.boundingSurfaceRect.y + selection.boundingSurfaceRect.height / 2
    : 0;

  const nodeCanvasX = selection?.object.boundingRect.x ?? 0;
  const nodeCanvasY = selection?.object.boundingRect.y ?? 0;
  const rotationDeg = selection?.rotation ?? 0;
  const rotationRad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  // --- Coordinate helpers -----------------------------------------------

  const toLayoutLocalPoint = useCallback(
    (clientX: number, clientY: number): cmath.Vector2 => {
      const [cx, cy] = editor.camera.clientPointToCanvasPoint([
        clientX,
        clientY,
      ]);
      const dx = cx - nodeCanvasX;
      const dy = cy - nodeCanvasY;
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      return [localX, localY];
    },
    [editor.camera, nodeCanvasX, nodeCanvasY, cos, sin]
  );

  const isPointInsideNode = useCallback(
    (clientX: number, clientY: number): boolean => {
      const [lx, ly] = toLayoutLocalPoint(clientX, clientY);
      return lx >= 0 && lx <= width && ly >= 0 && ly <= height;
    },
    [toLayoutLocalPoint, width, height]
  );

  // --- Multi-click counter ----------------------------------------------

  const getClickCount = useCallback(
    (clientX: number, clientY: number): number => {
      const now = performance.now();
      const prev = clickStateRef.current;
      const dt = now - prev.time;
      const dist = Math.hypot(clientX - prev.x, clientY - prev.y);
      let count: number;
      if (dt < MULTI_CLICK_TIMEOUT && dist < MULTI_CLICK_RADIUS) {
        count = prev.count >= 4 ? 1 : prev.count + 1;
      } else {
        count = 1;
      }
      clickStateRef.current = { count, time: now, x: clientX, y: clientY };
      return count;
    },
    []
  );

  // --- Session lifecycle (enter on mount, exit + commit on unmount) ------

  useEffect(() => {
    if (!scene || !node) return;

    const originalText = ((node as any).text as string) ?? "";

    let entered = false;
    try {
      entered = scene.textEditEnter(node_id);
    } catch (e) {
      console.error("[SurfaceTextEditor] WASM textEditEnter threw:", e);
    }
    if (!entered) {
      console.warn("[SurfaceTextEditor] Failed to enter WASM text editing");
      return;
    }

    activeRef.current = true;
    scene.redraw();

    // Caret blink RAF loop
    const tick = () => {
      if (!activeRef.current) return;
      try {
        if (scene.textEditTick()) {
          scene.redraw();
        }
      } catch {
        // WASM instance may be dead (e.g. OOM, tab backgrounding).
        // Stop the loop silently — the user can re-enter editing.
        activeRef.current = false;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    requestAnimationFrame(() => textareaRef.current?.focus());

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);

      try {
        if (scene.textEditIsActive()) {
          const committedText = scene.textEditExit(true);

          if (committedText !== null && committedText !== originalText) {
            // Commit the final text as a single atomic change.
            // Session-level undo (word-grouped, IME-aware) was available
            // during editing via the WASM session. After exit, the
            // document history treats the entire edit as one undo step.
            editor.commands.changeNodePropertyText(node_id, committedText);
          }
          scene.redraw();
        }
      } catch (e) {
        console.error("[SurfaceTextEditor] WASM cleanup threw:", e);
      }
    };
  }, [scene, node_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Click-outside to exit --------------------------------------------

  // Store the latest hit-test function in a ref to avoid re-registering
  // the global listener on every geometry change (which would briefly
  // leave a stale closure active during the teardown/setup gap).
  const isPointInsideNodeRef = useRef(isPointInsideNode);
  isPointInsideNodeRef.current = isPointInsideNode;

  useEffect(() => {
    if (!activeRef.current) return;

    const handleWindowPointerDown = (e: PointerEvent) => {
      if (!activeRef.current || e.button !== 0) return;
      const target = e.target as Node;
      if (overlayRef.current?.contains(target)) return;
      if (textareaRef.current?.contains(target)) return;
      if (isPointInsideNodeRef.current(e.clientX, e.clientY)) return;
      editor.surface.surfaceTryExitContentEditMode();
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("pointerdown", handleWindowPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handleWindowPointerDown, true);
    };
  }, [editor]); // stable deps only — hit-test uses ref

  // --- Pointer events ---------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scene || !activeRef.current || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const clickCount = getClickCount(e.clientX, e.clientY);
      const [lx, ly] = toLayoutLocalPoint(e.clientX, e.clientY);
      scene.textEditPointerDown(lx, ly, e.shiftKey, clickCount);
      scene.redraw();

      isDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      textareaRef.current?.focus();
    },
    [scene, getClickCount, toLayoutLocalPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scene || !activeRef.current || !isDraggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const [lx, ly] = toLayoutLocalPoint(e.clientX, e.clientY);
      scene.textEditPointerMove(lx, ly);
      scene.redraw();
    },
    [scene, toLayoutLocalPoint]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scene || !isDraggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = false;
      scene.textEditPointerUp();
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [scene]
  );

  // --- Keyboard events --------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!scene || !activeRef.current) return;

      // Skip IME composition events
      if (
        composingRef.current ||
        e.nativeEvent.isComposing ||
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        e.nativeEvent.keyCode === 229
      ) {
        return;
      }

      // Escape exits editing
      if (e.key === "Escape") {
        e.preventDefault();
        editor.surface.surfaceTryExitContentEditMode();
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      // Undo/redo: try the WASM session first (word-grouped, IME-aware).
      // When the session has nothing left, fall through to document-level
      // undo/redo so the user can undo their way out of content edit mode
      // (see ASSERTIONS.md: "Editor History System Takes Precedence in
      // Content Edit Mode").
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        e.stopPropagation();
        const handled = e.shiftKey
          ? scene.textEditRedo()
          : scene.textEditUndo();
        if (handled) {
          scene.redraw();
        } else if (e.shiftKey) {
          editor.doc.redo();
        } else {
          editor.doc.undo();
        }
        return;
      }

      // Clipboard: Copy
      if (mod && e.key === "c") {
        e.preventDefault();
        clipboardCopy(scene);
        return;
      }

      // Clipboard: Cut (deleteByCut — no-op when selection is collapsed)
      if (mod && e.key === "x") {
        e.preventDefault();
        clipboardCopy(scene);
        scene.textEditCommand({ type: "DeleteByCut" });
        scene.redraw();
        return;
      }

      // Clipboard: Paste
      if (mod && e.key === "v") {
        e.preventDefault();
        clipboardPaste(scene);
        return;
      }

      // Rich text style shortcuts (don't change text, no sync needed)
      if (mod && e.key === "b") {
        e.preventDefault();
        scene.textEditToggleBold();
        scene.redraw();
        return;
      }
      if (mod && e.key === "i") {
        e.preventDefault();
        scene.textEditToggleItalic();
        scene.redraw();
        return;
      }
      if (mod && e.key === "u") {
        e.preventDefault();
        scene.textEditToggleUnderline();
        scene.redraw();
        return;
      }

      // General editing command
      const cmd = keyEventToTextEditCommand(e.nativeEvent);
      if (cmd) {
        e.preventDefault();
        scene.textEditCommand(cmd);
        scene.redraw();
      }
    },
    [scene, editor]
  );

  // --- IME composition --------------------------------------------------

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const handleCompositionUpdate = useCallback(
    (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      if (!scene || !activeRef.current) return;
      scene.textEditImeSetPreedit(e.data);
      scene.redraw();
    },
    [scene]
  );

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = false;
      if (!scene || !activeRef.current) return;
      scene.textEditImeCommit(e.data);
      scene.redraw();
      if (textareaRef.current) {
        textareaRef.current.value = "";
      }
    },
    [scene]
  );

  // --- Blur handling ----------------------------------------------------

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (overlayRef.current?.contains(related)) {
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
      editor.surface.surfaceTryExitContentEditMode();
    },
    [editor]
  );

  // --- Render -----------------------------------------------------------

  if (!scene) return null;

  const overlayStyle: React.CSSProperties | undefined = selection
    ? {
        position: "absolute" as const,
        top: centerY,
        left: centerX,
        width: width * scaleX,
        height: height * scaleY,
        transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
        pointerEvents: "auto" as const,
        cursor: "text",
      }
    : undefined;

  return (
    <>
      {/* Transparent pointer-capture overlay positioned over the text node */}
      {overlayStyle && (
        <div
          ref={overlayRef}
          style={overlayStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}
      {/* Hidden textarea for keyboard/IME capture */}
      <textarea
        ref={textareaRef}
        className="fixed opacity-0 pointer-events-auto"
        style={{
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          padding: 0,
          border: "none",
          outline: "none",
          resize: "none",
          overflow: "hidden",
          zIndex: 9999,
          caretColor: "transparent",
          color: "transparent",
          background: "transparent",
        }}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionUpdate={handleCompositionUpdate}
        onCompositionEnd={handleCompositionEnd}
        onBlur={handleBlur}
        onPointerDown={(e) => e.stopPropagation()}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Clipboard helpers (WASM backend)
// ---------------------------------------------------------------------------

function clipboardCopy(scene: Scene): void {
  const text = scene.textEditGetSelectedText();
  if (!text) return;

  const html = scene.textEditGetSelectedHtml();
  const items: Record<string, Blob> = {
    "text/plain": new Blob([text], { type: "text/plain" }),
  };
  if (html) {
    items["text/html"] = new Blob([html], { type: "text/html" });
  }
  navigator.clipboard
    .write([new ClipboardItem(items)])
    .catch(() => navigator.clipboard.writeText(text));
}

function clipboardPaste(scene: Scene): void {
  navigator.clipboard
    .read()
    .then(async (items) => {
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          const html = await blob.text();
          scene.textEditPasteHtml(html);
          scene.redraw();
          return;
        }
        if (item.types.includes("text/plain")) {
          const blob = await item.getType("text/plain");
          const text = await blob.text();
          scene.textEditPasteText(text);
          scene.redraw();
          return;
        }
      }
    })
    .catch(() => {
      navigator.clipboard.readText().then((text) => {
        scene.textEditPasteText(text);
        scene.redraw();
      });
    });
}

// ===========================================================================
// DOM backend — ContentEditable overlay (fallback)
// ===========================================================================

function DOMTextEditorOverlay({ node_id }: { node_id: string }) {
  const editor = useCurrentEditor();
  const node = useNode(node_id);
  const { transform } = useTransformState();
  const selection = useSingleSelection(node_id);
  const [scaleX, scaleY] = cmath.transform.getScale(transform);
  const ref = useRef<HTMLDivElement>(null);

  const styles = css.toReactTextStyle(
    node as grida.program.nodes.TextSpanNode as any as grida.program.nodes.ComputedTextSpanNode
  );

  // Focus and select all text on mount
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    requestAnimationFrame(() => el.focus());
  }, [ref]);

  const stopPropagation = (e: React.BaseSyntheticEvent) => {
    e.stopPropagation();
  };

  const handleDoubleClick = (e: React.BaseSyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      id="richtext-editor-surface"
      className="fixed left-0 top-0 w-0 h-0 z-10"
    >
      <div
        style={
          selection
            ? {
                position: "absolute",
                ...selection.style,
                willChange: "transform",
                resize: "none",
                zIndex: 1,
              }
            : { display: "none" }
        }
      >
        <div
          style={{
            width: selection?.object.boundingRect.width,
            height: selection?.object.boundingRect.height,
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: "0 0",
          }}
        >
          <ContentEditable
            innerRef={ref}
            translate="no"
            contentEditable="plaintext-only"
            className="box-border outline-none"
            onPointerDown={stopPropagation}
            onDoubleClick={handleDoubleClick}
            onKeyDown={(e) => {
              if (editor.surface.explicitlyOverrideInputUndoRedo(e)) return;
              if (e.key === "Escape") e.currentTarget.blur();
              stopPropagation(e);
            }}
            onBlur={() => editor.surface.surfaceTryExitContentEditMode()}
            html={node.text as string}
            onChange={(e) => {
              const txt = e.currentTarget.textContent;
              editor.commands.changeNodePropertyText(node_id, txt ?? "");
            }}
            style={{
              width: "100%",
              height: "100%",
              opacity: node.opacity,
              ...styles,
            }}
          />
        </div>
      </div>
    </div>
  );
}

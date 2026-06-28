"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";
import type { SvgEditor } from "@grida/svg-editor";
import { SvgCanvas, type Rect, type ElementRef } from "../_core/svg-canvas";
import { FrameView } from "./frame";
import { ActiveFrame } from "./active-frame";

// ── store wiring (thin) ──────────────────────────────────────────────────────

const Ctx = React.createContext<SvgCanvas | null>(null);

export function SvgCanvasProvider({
  store,
  children,
}: {
  store: SvgCanvas;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useSvgCanvas(): SvgCanvas {
  const s = React.useContext(Ctx);
  if (!s)
    throw new Error("useSvgCanvas must be used within <SvgCanvasProvider>");
  return s;
}

export function useSvgCanvasState() {
  const store = useSvgCanvas();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

// ── gesture state (refs; never re-render the world on every move) ─────────────

type Gesture =
  | { kind: "none" }
  | { kind: "pan"; lastX: number; lastY: number }
  | {
      kind: "press-frame";
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      moved: boolean;
    }
  // dragging a cross-frame ELEMENT selection (rung D): start in BOTH screen px
  // (for the move threshold) and world (for the drag delta). `wasSelected`
  // distinguishes drag-the-group from click-to-deselect on pointer-up.
  | {
      kind: "press-element";
      ref: ElementRef;
      startSX: number;
      startSY: number;
      startWX: number;
      startWY: number;
      moved: boolean;
      wasSelected: boolean;
    }
  | {
      kind: "marquee";
      startX: number;
      startY: number;
      baseline: readonly string[];
      additive: boolean;
    };

const DRAG_THRESHOLD = 3;

function historyBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    font: "12px ui-sans-serif, system-ui",
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: disabled ? "#9ca3af" : "#111827",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

export function SvgCanvasView({ className }: { className?: string }) {
  const store = useSvgCanvas();
  const state = useSvgCanvasState();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const gestureRef = React.useRef<Gesture>({ kind: "none" });
  const spaceRef = React.useRef(false);
  // manual double-click detection (two quick presses on the same frame → edit)
  const lastPressRef = React.useRef<{ id: string; t: number }>({
    id: "",
    t: 0,
  });
  const [cursor, setCursor] = React.useState<"default" | "grab" | "grabbing">(
    "default"
  );

  const toLocal = React.useCallback((clientX: number, clientY: number) => {
    const r = viewportRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, []);

  // fit content once on mount — useLayoutEffect so it runs BEFORE paint (no
  // flash of frames at the identity camera before they snap to the fitted view).
  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    store.fit(el.clientWidth, el.clientHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // space-to-pan
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !spaceRef.current) {
        spaceRef.current = true;
        setCursor("grab");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setCursor("default");
      }
      if (e.code === "Escape") store.deactivate();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [store]);

  // native non-passive wheel (React onWheel is passive → can't preventDefault)
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = toLocal(e.clientX, e.clientY);
      if (e.ctrlKey || e.metaKey) {
        // match @grida/svg-editor's gesture sensitivity (defaults.ts:
        // WHEEL_ZOOM_SENSITIVITY = 0.01) so the canvas feels like the editor.
        store.zoomAt(1 - e.deltaY * 0.01, x, y);
      } else {
        store.panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unified-history keymap — CAPTURE phase on window so we run BEFORE the active
  // editor's own keymap and suppress it (single source of truth for Cmd+Z). The
  // fine-then-cross-the-boundary routing lives in the store's undo/redo.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.code !== "KeyZ") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.shiftKey) store.redo();
      else store.undo();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [store]);

  const onDoubleClick = (e: React.MouseEvent) => {
    const { x, y } = toLocal(e.clientX, e.clientY);
    const hit = store.frameAtScreen(x, y);
    if (hit) store.activate(hit.id); // no-op if already active
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = toLocal(e.clientX, e.clientY);
    const panning = spaceRef.current || e.button === 1;

    // While editing: a press INSIDE the active frame belongs to the editor —
    // don't host-handle it and (critically) don't pointer-capture, or we'd
    // steal move/up from the editor's own surface.
    if (!panning && state.activeId) {
      if ((e.target as HTMLElement).closest("[data-active-frame]")) return;
      store.deactivate(); // a press anywhere else exits content edit
    }

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* some pointers can't be captured; harmless */
    }

    if (panning) {
      gestureRef.current = { kind: "pan", lastX: x, lastY: y };
      setCursor("grabbing");
      return;
    }
    if (e.button !== 0) return;

    // Cmd/Ctrl+Shift = cross-frame ELEMENT mode (rung D): pick & drag elements
    // that live in DIFFERENT single-doc frames, together. Host-synthesized —
    // the editor's picking is surface-private, so this goes through the store's
    // own toy geometry engine.
    const elementMode = (e.metaKey || e.ctrlKey) && e.shiftKey;
    if (elementMode && !state.activeId) {
      const hitEl = store.elementAtScreen(x, y);
      if (!hitEl) {
        store.clearElementSelection();
        gestureRef.current = { kind: "none" };
        return;
      }
      const wasSelected = state.elementSelection.some(
        (r) => r.frameId === hitEl.frameId && r.key === hitEl.key
      );
      // select-on-down (idempotent) so a fresh pick can drag immediately; a
      // click WITHOUT a drag on an already-selected element deselects on up.
      if (!wasSelected) store.pickElement(hitEl);
      const w = store.screenToWorld(x, y);
      gestureRef.current = {
        kind: "press-element",
        ref: hitEl,
        startSX: x,
        startSY: y,
        startWX: w.x,
        startWY: w.y,
        moved: false,
        wasSelected,
      };
      return;
    }

    const additive = e.shiftKey || e.metaKey;
    const hit = store.frameAtScreen(x, y);
    if (hit) {
      // two quick presses on the same frame → enter content edit
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const isDoubleClick =
        lastPressRef.current.id === hit.id &&
        now - lastPressRef.current.t < 400;
      lastPressRef.current = { id: hit.id, t: now };
      if (isDoubleClick && !additive) {
        store.activate(hit.id);
        gestureRef.current = { kind: "none" };
        return;
      }
      // select-on-down so a subsequent move drags it
      if (additive) store.selectAtScreen(x, y, { additive: true });
      else if (!state.selection.includes(hit.id)) store.selectAtScreen(x, y);
      gestureRef.current = {
        kind: "press-frame",
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        moved: false,
      };
    } else {
      gestureRef.current = {
        kind: "marquee",
        startX: x,
        startY: y,
        baseline: additive ? state.selection : [],
        additive,
      };
      if (!additive) store.clearSelection();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (g.kind === "none") return;
    const { x, y } = toLocal(e.clientX, e.clientY);

    if (g.kind === "pan") {
      store.panBy(x - g.lastX, y - g.lastY);
      g.lastX = x;
      g.lastY = y;
    } else if (g.kind === "press-frame") {
      const zoom = state.camera.zoom;
      if (!g.moved && Math.hypot(x - g.startX, y - g.startY) > DRAG_THRESHOLD)
        g.moved = true;
      if (g.moved) {
        store.translateSelection((x - g.lastX) / zoom, (y - g.lastY) / zoom);
        g.lastX = x;
        g.lastY = y;
      }
    } else if (g.kind === "press-element") {
      if (!g.moved && Math.hypot(x - g.startSX, y - g.startSY) > DRAG_THRESHOLD)
        g.moved = true;
      if (g.moved) {
        const w = store.screenToWorld(x, y);
        store.setElementDrag(w.x - g.startWX, w.y - g.startWY);
      }
    } else if (g.kind === "marquee") {
      store.updateMarquee({ x: g.startX, y: g.startY }, { x, y }, g.baseline, {
        additive: g.additive,
      });
    }
  };

  const endGesture = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (g.kind === "marquee") store.endMarquee();
    // a completed frame drag is one unified-history step
    if (g.kind === "press-frame" && g.moved) store.pushHistory();
    // a completed cross-frame element drag commits + pushes one step; a click
    // without a drag on an already-selected element deselects it.
    if (g.kind === "press-element") {
      if (g.moved) store.commitElementDrag();
      else if (g.wasSelected) store.unpickElement(g.ref);
    }
    gestureRef.current = { kind: "none" };
    setCursor(spaceRef.current ? "grab" : "default");
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const {
    camera,
    frames,
    selection,
    marquee,
    activeId,
    canUndo,
    canRedo,
    elementSelection,
    elementDrag,
  } = state;
  // cross-frame element chrome (rung D): world rects + a unified bounds box that
  // visibly spans frames. Shift by the live drag delta for the ghost.
  const dragDX = elementDrag?.x ?? 0;
  const dragDY = elementDrag?.y ?? 0;
  const ghost = (r: Rect): Rect =>
    store.worldRectToScreen({ ...r, x: r.x + dragDX, y: r.y + dragDY });
  const elementRects = elementSelection.length
    ? store.elementSelectionWorldRects()
    : [];
  // reuse the rects we just resolved (no second pass); null when nothing selected
  const elementBounds = store.elementSelectionBounds(elementRects);
  const boundsBox = elementBounds ? ghost(elementBounds) : null;
  const activeFrame = activeId
    ? (frames.find((f) => f.id === activeId) ?? null)
    : null;
  // history controls stay live while editing (the store routes fine→canvas)
  const undoOff = !canUndo && !activeId;
  const redoOff = !canRedo && !activeId;

  return (
    <div
      ref={viewportRef}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onDoubleClick={onDoubleClick}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        cursor,
        background:
          "repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 24px 24px",
        touchAction: "none",
      }}
    >
      {/* transformed world layer — frames only */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
        }}
      >
        {[...frames]
          .sort((a, b) => a.z - b.z) // paint low z first; matches frameAtScreen
          .filter((f) => f.id !== activeId)
          .map((f) => (
            <FrameView key={f.id} frame={f} />
          ))}
      </div>

      {/* active editor — UNSCALED screen space (so its getScreenCTM-projected
          HUD chrome isn't double-scaled by the world layer). Positioned at the
          frame's screen rect; the editor's own camera supplies the zoom. */}
      {activeFrame && (
        <ActiveFrame
          frame={activeFrame}
          screenRect={store.worldRectToScreen(activeFrame.rect)}
          zoom={camera.zoom}
          onCommit={(id, svg) => store.commitFrameEdit(id, svg)}
          onEditor={(ed) => {
            // hand the editor's history to the store as a minimal port, so
            // store.undo/redo can walk fine history then cross the boundary
            store.setActiveHistory(
              ed
                ? {
                    canUndo: () => ed.state.can_undo,
                    canRedo: () => ed.state.can_redo,
                    undo: () => ed.commands.undo(),
                    redo: () => ed.commands.redo(),
                  }
                : null
            );
            // spike dev aid: expose the live editor for console/automation poking
            (
              window as unknown as { __activeEditor?: SvgEditor | null }
            ).__activeEditor = ed;
          }}
        />
      )}

      {/* chrome overlay — identity / screen space (pre-projected via worldToScreen) */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {frames
          .filter((f) => selection.includes(f.id) && f.id !== activeId)
          .map((f) => {
            const r = store.worldRectToScreen(f.rect);
            return (
              <div
                key={f.id}
                style={{
                  position: "absolute",
                  left: r.x,
                  top: r.y,
                  width: r.width,
                  height: r.height,
                  border: "1.5px solid #2563eb",
                  boxSizing: "border-box",
                }}
              />
            );
          })}
        {marquee && (
          <div
            style={{
              position: "absolute",
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
              border: "1px solid #2563eb",
              background: "rgba(37, 99, 235, 0.08)",
            }}
          />
        )}

        {/* cross-frame ELEMENT selection (rung D). Distinct color (amber) from
            frame selection (blue). The per-element boxes + the unified bounds
            box are drawn HERE, in one host overlay that spans every frame and
            lives OUTSIDE any single frame's clip — which is the whole point. */}
        {elementRects.map(({ ref, rect }) => {
          const r = ghost(rect);
          return (
            <div
              key={`${ref.frameId}:${ref.key}`}
              style={{
                position: "absolute",
                left: r.x,
                top: r.y,
                width: r.width,
                height: r.height,
                border: "1.5px solid #f59e0b",
                background: elementDrag
                  ? "rgba(245,158,11,0.12)"
                  : "transparent",
                boxSizing: "border-box",
              }}
            />
          );
        })}
        {boundsBox && elementRects.length > 1 && (
          <div
            style={{
              position: "absolute",
              left: boundsBox.x,
              top: boundsBox.y,
              width: boundsBox.width,
              height: boundsBox.height,
              border: "1.5px dashed #f59e0b",
              boxSizing: "border-box",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* undo / redo toolbar (screen space). Routed through store.undo/redo, the
          same path as Cmd+Z: editor-fine first, then cross to canvas history. */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          gap: 6,
        }}
      >
        <button
          data-testid="undo"
          disabled={undoOff}
          onClick={() => store.undo()}
          style={historyBtnStyle(undoOff)}
        >
          ↶ Undo
        </button>
        <button
          data-testid="redo"
          disabled={redoOff}
          onClick={() => store.redo()}
          style={historyBtnStyle(redoOff)}
        >
          ↷ Redo
        </button>
      </div>

      {/* status / legend (screen space) */}
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          pointerEvents: "none",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          color: "#374151",
          background: "rgba(255,255,255,0.85)",
          padding: "6px 8px",
          borderRadius: 6,
          lineHeight: 1.5,
        }}
      >
        zoom {(camera.zoom * 100).toFixed(0)}% · {selection.length} frame
        {elementSelection.length ? ` · ${elementSelection.length} element` : ""}
        {activeId ? ` · editing ${activeId}` : ""}
        <br />
        wheel: pan · ⌘/ctrl+wheel: zoom · space-drag: pan · drag bg: marquee
        <br />
        dbl-click: edit svg · esc / click-away: done · ⌘Z undo · ⌘⇧Z redo
        <br />
        ⌘⇧+click: pick element (across frames) · ⌘⇧+drag: move them together
      </div>
    </div>
  );
}

/**
 * Desktop **board host** — the `editor: "board"` surface (an infinite canvas of
 * pins), sibling to the slides `DesktopCanvasShell`. Productionized lean from the
 * `/svg/examples/board` spike: a pan/zoom camera + drag-to-move over
 * {@link CanvasBoard} (manifest-as-truth, `setLayout` persists placement).
 *
 * A pin's `src` renders either as a remote URI directly (`<img src={uri}>` — a
 * picked library reference; the library origin is CSP-allowlisted) or as a
 * bundle file via the `grida-workspace://` stream. A generated output becomes a
 * pin once the agent materializes it into the bundle (see the `dotcanvas` skill).
 *
 * V1 SCOPE (flagged for app verification + later refinement): single-select +
 * drag-move + pan/zoom only. The spike's marquee / multi-select / unified
 * undo-redo / in-place content editing are intentionally NOT ported yet.
 * TODO(grida-asset): arbitrary non-library URI pins need the deferred
 * `grida-asset://` proxy to render under desktop CSP; library URIs render today.
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { dotcanvas } from "dotcanvas";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import { useWorkspaceChanges } from "../workbench/workspace-changes";
import { CanvasBoard, isUriSrc, type Frame } from "./board-store";

type Camera = { x: number; y: number; zoom: number };

/** Default pin box for an unplaced (`layout: null`) document, laid out in a
 *  simple cascade so it's visible until the agent/user places it. */
const UNPLACED = { w: 320, h: 240, step: 40 };

function placedRect(frame: Frame, index: number) {
  const l = frame.layout;
  if (l && Number.isFinite(l.x) && Number.isFinite(l.y)) {
    return {
      x: l.x ?? 0,
      y: l.y ?? 0,
      w: l.w ?? UNPLACED.w,
      h: l.h ?? UNPLACED.h,
    };
  }
  // unplaced → cascade
  return {
    x: index * UNPLACED.step,
    y: index * UNPLACED.step,
    w: UNPLACED.w,
    h: UNPLACED.h,
  };
}

/** The render URL for a pin: a URI is used as-is; a bundle file streams via
 *  `grida-workspace://` (`media_url`). */
function pinSrc(board: CanvasBoard, workspaceId: string, src: string): string {
  if (isUriSrc(src)) return src;
  return workspacesNs.mediaUrl(workspaceId, board.bundlePath(src)) ?? "";
}

export function DesktopBoardShell({
  workspaceId,
  basePath = "",
}: {
  workspaceId: string;
  basePath?: string;
}) {
  const board = useMemo(
    () => new CanvasBoard(workspaceId, workspacesNs, basePath),
    [workspaceId, basePath]
  );
  const frames = useSyncExternalStore(board.subscribe, board.getFrames, () =>
    board.getFrames()
  );

  // Resolve each pin's render URL once per frame-set, not once per camera tick:
  // pan/zoom re-renders this component, but a pin's URL is stable for its `src`,
  // so recomputing `bundlePath` + the `mediaUrl` bridge call on every scroll
  // frame is pure waste. Keyed by `frames`, so it refreshes only on a real edit.
  const pinUrls = useMemo(() => {
    const urls = new Map<string, string>();
    for (const f of frames) {
      if (!urls.has(f.src)) urls.set(f.src, pinSrc(board, workspaceId, f.src));
    }
    return urls;
  }, [frames, board, workspaceId]);

  useEffect(() => {
    void board.load();
    return () => {
      void board.flush();
    };
  }, [board]);

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Pointer gesture: pan the camera (empty space) or drag the pressed frame.
  const gesture = useRef<
    | {
        kind: "pan";
        startX: number;
        startY: number;
        camX: number;
        camY: number;
      }
    | {
        kind: "frame";
        id: string;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
        w: number;
        h: number;
        // Preserved across the move: `setLayout` replaces the whole layout, so a
        // drag that omitted `z` would silently reset the pin's stacking order.
        z: number | undefined;
      }
    | null
  >(null);

  // Live-update from disk: the agent adds / moves / removes pins by writing
  // `.canvas.json`; reload the store so the canvas reflects it without a reopen
  // (same model as the slides shell's `useWorkspaceChanges`). Conflict guard:
  // the board auto-persists, so the ONLY uncommitted user edit is an active pin
  // drag — skip the reload mid-drag so an agent write can't yank the pin out from
  // under the cursor (pointer-up then persists the drag, and the next change
  // reconciles). Needs a `WorkspaceChangesProvider` ancestor; a no-op otherwise.
  const manifestRel = basePath
    ? `${basePath}/${dotcanvas.MANIFEST_FILENAME}`
    : dotcanvas.MANIFEST_FILENAME;
  useWorkspaceChanges((events) => {
    if (gesture.current?.kind === "frame") return; // user mid-drag — don't clobber
    if (
      events.some((e) => e.rel_path === manifestRel && e.kind !== "deleted")
    ) {
      void board.load();
    }
  });

  // Trackpad-native: two-finger scroll PANS; pinch ZOOMS (a trackpad pinch
  // arrives as ctrl+wheel), anchored at the cursor. A native NON-passive
  // listener so `preventDefault` actually stops the page scrolling/zooming.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (e.ctrlKey) {
        // pinch → zoom, keeping the world point under the cursor fixed.
        setCamera((c) => {
          const zoom = Math.min(
            4,
            Math.max(0.1, c.zoom * Math.exp(-e.deltaY * 0.01))
          );
          const wx = (px - c.x) / c.zoom;
          const wy = (py - c.y) / c.zoom;
          return { zoom, x: px - wx * zoom, y: py - wy * zoom };
        });
      } else {
        // two-finger scroll → pan (follows the scroll direction).
        setCamera((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const frameEl = (e.target as HTMLElement).closest("[data-frame-id]");
      const id = frameEl?.getAttribute("data-frame-id") ?? null;
      if (id) {
        const f = frames.find((fr) => fr.id === id);
        const r = f ? placedRect(f, frames.indexOf(f)) : null;
        setSelected(id);
        if (r)
          gesture.current = {
            kind: "frame",
            id,
            startX: e.clientX,
            startY: e.clientY,
            origX: r.x,
            origY: r.y,
            w: r.w,
            h: r.h,
            z: f?.layout?.z,
          };
      } else {
        setSelected(null);
        gesture.current = {
          kind: "pan",
          startX: e.clientX,
          startY: e.clientY,
          camX: camera.x,
          camY: camera.y,
        };
      }
    },
    [frames, camera.x, camera.y]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      setCamera((c) => ({
        ...c,
        x: g.camX + (e.clientX - g.startX),
        y: g.camY + (e.clientY - g.startY),
      }));
    }
    // frame drag is committed on pointer-up (one setLayout per move) to keep the
    // manifest write count bounded; the live visual offset is applied below.
    if (g.kind === "frame") {
      setDragPreview({
        id: g.id,
        dx: e.clientX - g.startX,
        dy: e.clientY - g.startY,
      });
    }
  }, []);

  const [dragPreview, setDragPreview] = useState<{
    id: string;
    dx: number;
    dy: number;
  } | null>(null);

  const onPointerUp = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === "frame" && dragPreview && dragPreview.id === g.id) {
      // screen delta → world delta (divide by zoom), commit the new placement.
      const nx = g.origX + dragPreview.dx / camera.zoom;
      const ny = g.origY + dragPreview.dy / camera.zoom;
      void board.setLayout(g.id, {
        x: nx,
        y: ny,
        w: g.w,
        h: g.h,
        ...(g.z !== undefined ? { z: g.z } : {}),
      });
    }
    setDragPreview(null);
  }, [board, camera.zoom, dragPreview]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/30">
      <div
        ref={surfaceRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* world layer */}
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          {frames.map((frame, i) => {
            const r = placedRect(frame, i);
            const dragging = dragPreview?.id === frame.id;
            const dx = dragging ? dragPreview.dx / camera.zoom : 0;
            const dy = dragging ? dragPreview.dy / camera.zoom : 0;
            return (
              <div
                key={frame.id}
                data-frame-id={frame.id}
                className={
                  "absolute cursor-grab overflow-hidden rounded-md border bg-background shadow-sm " +
                  (selected === frame.id
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border")
                }
                style={{
                  left: r.x + dx,
                  top: r.y + dy,
                  width: r.w,
                  height: r.h,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pinUrls.get(frame.src) ?? ""}
                  alt={frame.id}
                  draggable={false}
                  className="pointer-events-none size-full object-cover"
                />
              </div>
            );
          })}
        </div>
      </div>

      {frames.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Empty board — ask the agent to gather references onto it.
        </div>
      )}
    </div>
  );
}

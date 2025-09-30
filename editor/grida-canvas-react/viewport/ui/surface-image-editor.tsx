import React, { useCallback, useEffect, useMemo, useState } from "react";
import cmath from "@grida/cmath";
import type cg from "@grida/cg";
import { useCurrentEditor } from "@/grida-canvas-react";
import { useSingleSelection } from "../surface-hooks";
import {
  useContentEditModeState,
  useEditorFlagsState,
  useNodeState,
  useTransformState,
} from "@/grida-canvas-react/provider";
import { editor } from "@/grida-canvas";
import { resolvePaints } from "@/grida-canvas/utils/paint-resolution";
import {
  getImageRectCorners,
  reduceImageTransform,
} from "./__math/image-transform";

function cloneTransform(transform: cg.AffineTransform): cg.AffineTransform {
  return [
    [...transform[0]] as [number, number, number],
    [...transform[1]] as [number, number, number],
  ];
}

function isImagePaint(paint: cg.Paint | undefined): paint is cg.ImagePaint {
  return !!paint && paint.type === "image";
}

type ActiveHandle =
  | {
      type: "translate";
      base: cg.AffineTransform;
      start: cmath.Vector2;
      pointerId: number;
    }
  | {
      type: "scale";
      side: cmath.RectangleSide;
      base: cg.AffineTransform;
      start: cmath.Vector2;
      pointerId: number;
    }
  | {
      type: "rotate";
      corner: cmath.IntercardinalDirection;
      base: cg.AffineTransform;
      start: cmath.Vector2;
      pointerId: number;
    };

const SIDE_CURSOR: Record<cmath.RectangleSide, React.CSSProperties["cursor"]> =
  {
    left: "ew-resize",
    right: "ew-resize",
    top: "ns-resize",
    bottom: "ns-resize",
  };

const CORNER_ORDER: cmath.IntercardinalDirection[] = [
  "nw", // northwest = top-left
  "ne", // northeast = top-right
  "se", // southeast = bottom-right
  "sw", // southwest = bottom-left
];

export function SurfaceImageEditor({ node_id }: { node_id: string }) {
  const contentMode =
    useContentEditModeState() as editor.state.PaintImageContentEditMode;
  const selection = useSingleSelection(node_id);
  const node = useNodeState(node_id, (n) => n);

  if (!selection || !node) {
    return null;
  }

  const target = contentMode.paint_target ?? "fill";
  const paintIndex = contentMode.paint_index ?? 0;
  const { paints, resolvedIndex } = resolvePaints(node, target, paintIndex);
  const paint = paints[resolvedIndex];

  if (!isImagePaint(paint)) {
    return null;
  }

  // Only enable the image editor when fit is "transform"
  if (paint.fit !== "transform") {
    return null;
  }

  return (
    <div className="fixed left-0 top-0 w-0 h-0 z-10 pointer-events-none">
      <div
        style={{
          position: "absolute",
          ...selection.style,
          pointerEvents: "none",
        }}
      >
        <_ImagePaintEditor
          node_id={node_id}
          selection={selection}
          paint={paint}
          paintIndex={resolvedIndex}
          paintTarget={target}
        />
      </div>
    </div>
  );
}

function _ImagePaintEditor({
  node_id,
  selection,
  paint,
  paintIndex,
  paintTarget,
}: {
  node_id: string;
  selection: any;
  paint: cg.ImagePaint;
  paintIndex: number;
  paintTarget: "fill" | "stroke";
}) {
  const editorInstance = useCurrentEditor();
  const node = useNodeState(node_id, (n) => n);
  const { transform: viewportTransform } = useTransformState();
  const { debug } = useEditorFlagsState();

  const ensureTransform = paint.transform ?? cmath.transform.identity;
  const initialTransform = useMemo(
    () => cloneTransform(ensureTransform),
    [ensureTransform]
  );
  const [previewTransform, setPreviewTransform] =
    useState<cg.AffineTransform>(initialTransform);

  useEffect(() => {
    setPreviewTransform(cloneTransform(ensureTransform));
  }, [ensureTransform]);

  const scale = useMemo(
    () => cmath.transform.getScale(viewportTransform),
    [viewportTransform]
  );

  const [rawWidth, rawHeight] = selection.size;
  const size = useMemo(
    () => [rawWidth, rawHeight] as cmath.Vector2,
    [rawWidth, rawHeight]
  );
  const [width, height] = size;
  const scaleX = scale[0] || 1;
  const scaleY = scale[1] || 1;
  const widthPx = width * scaleX;
  const heightPx = height * scaleY;

  const centerX =
    selection.boundingSurfaceRect.x + selection.boundingSurfaceRect.width / 2;
  const centerY =
    selection.boundingSurfaceRect.y + selection.boundingSurfaceRect.height / 2;
  const rotationDeg = selection.rotation ?? 0;
  const rotationRad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  const toLocalPoint = useCallback(
    (clientX: number, clientY: number): cmath.Vector2 => {
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const alignedX = dx * cos - dy * sin;
      const alignedY = dx * sin + dy * cos;
      const localX = alignedX / scaleX + width / 2;
      const localY = alignedY / scaleY + height / 2;
      return [localX, localY];
    },
    [centerX, centerY, cos, sin, scaleX, scaleY, width, height]
  );

  const [activeHandle, setActiveHandle] = useState<ActiveHandle | null>(null);

  useEffect(() => {
    if (!activeHandle) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activeHandle.pointerId) return;
      const current = toLocalPoint(event.clientX, event.clientY);
      const delta = cmath.vector2.sub(current, activeHandle.start);
      let next: cg.AffineTransform = activeHandle.base;

      switch (activeHandle.type) {
        case "translate":
          next = reduceImageTransform(
            activeHandle.base,
            { type: "translate", delta },
            { size }
          );
          break;
        case "scale":
          next = reduceImageTransform(
            activeHandle.base,
            { type: "scale-side", side: activeHandle.side, delta },
            { size }
          );
          break;
        case "rotate":
          next = reduceImageTransform(
            activeHandle.base,
            { type: "rotate", corner: activeHandle.corner, delta },
            { size }
          );
          break;
      }

      setPreviewTransform(next);

      const updatedPaint: cg.ImagePaint = {
        ...paint,
        transform: next,
      };
      const { paints } = resolvePaints(node!, paintTarget, paintIndex);
      const updatedPaints = [...paints];
      updatedPaints[paintIndex] = updatedPaint;
      if (paintTarget === "stroke") {
        editorInstance.commands.changeNodePropertyStrokes(
          node_id,
          updatedPaints
        );
      } else {
        editorInstance.commands.changeNodePropertyFills(node_id, updatedPaints);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activeHandle.pointerId) return;
      setActiveHandle(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    activeHandle,
    editorInstance,
    node_id,
    paint,
    paintIndex,
    paintTarget,
    toLocalPoint,
    size,
    node,
  ]);

  const corners = useMemo(
    () => getImageRectCorners(previewTransform, size),
    [previewTransform, size]
  );

  const screenCorners = useMemo(() => {
    const toScreen = (point: cmath.Vector2): cmath.Vector2 => [
      point[0] * scaleX,
      point[1] * scaleY,
    ];
    return {
      nw: toScreen(corners.nw), // northwest = top-left
      ne: toScreen(corners.ne), // northeast = top-right
      se: toScreen(corners.se), // southeast = bottom-right
      sw: toScreen(corners.sw), // southwest = bottom-left
    };
  }, [corners, scaleX, scaleY]);

  const polygonPoints = useMemo(() => {
    return [
      screenCorners.nw, // northwest = top-left
      screenCorners.ne, // northeast = top-right
      screenCorners.se, // southeast = bottom-right
      screenCorners.sw, // southwest = bottom-left
    ]
      .map(([x, y]) => `${x},${y}`)
      .join(" ");
  }, [screenCorners]);

  const handleSurfacePointerDown = useCallback(
    (event: React.PointerEvent<SVGPolygonElement>) => {
      if (activeHandle) return;
      const local = toLocalPoint(event.clientX, event.clientY);

      event.preventDefault();
      event.stopPropagation();
      setActiveHandle({
        type: "translate",
        base: cloneTransform(previewTransform),
        start: local,
        pointerId: event.pointerId,
      });
    },
    [activeHandle, previewTransform, toLocalPoint]
  );

  const createScaleHandle = useCallback(
    (
      side: cmath.RectangleSide,
      position: cmath.Vector2,
      angle: number,
      length: number
    ) => {
      return (
        <div
          key={`side-${side}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const local = toLocalPoint(event.clientX, event.clientY);
            setActiveHandle({
              type: "scale",
              side,
              base: cloneTransform(previewTransform),
              start: local,
              pointerId: event.pointerId,
            });
          }}
          style={{
            position: "absolute",
            left: position[0],
            top: position[1],
            width: length,
            height: 12,
            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
            transformOrigin: "center",
            cursor: SIDE_CURSOR[side],
            pointerEvents: "auto",
          }}
          data-popover-no-close
        />
      );
    },
    [previewTransform, toLocalPoint]
  );

  const createCornerHandle = useCallback(
    (corner: cmath.IntercardinalDirection, position: cmath.Vector2) => {
      return (
        <div
          key={`corner-${corner}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const local = toLocalPoint(event.clientX, event.clientY);
            setActiveHandle({
              type: "rotate",
              corner,
              base: cloneTransform(previewTransform),
              start: local,
              pointerId: event.pointerId,
            });
          }}
          className={`absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 cursor-grab pointer-events-auto ${
            debug
              ? "rounded-full border-2 border-muted-foreground/70 bg-muted-foreground/20"
              : ""
          }`}
          style={{
            left: position[0],
            top: position[1],
          }}
          data-popover-no-close
        />
      );
    },
    [previewTransform, toLocalPoint, debug]
  );

  const handles = useMemo(() => {
    const sideHandles: React.ReactNode[] = [];
    const cornerHandles: React.ReactNode[] = [];

    const { nw, ne, se, sw } = screenCorners; // northwest, northeast, southeast, southwest

    const sides: Array<{
      side: cmath.RectangleSide;
      a: cmath.Vector2;
      b: cmath.Vector2;
    }> = [
      { side: "top", a: nw, b: ne }, // northwest to northeast
      { side: "right", a: ne, b: se }, // northeast to southeast
      { side: "bottom", a: sw, b: se }, // southwest to southeast
      { side: "left", a: nw, b: sw }, // northwest to southwest
    ];

    for (const { side, a, b } of sides) {
      const midpoint: cmath.Vector2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const vector = cmath.vector2.sub(b, a);
      const length = Math.hypot(vector[0], vector[1]) || 1;
      const angle = (Math.atan2(vector[1], vector[0]) * 180) / Math.PI;
      sideHandles.push(createScaleHandle(side, midpoint, angle, length));
    }

    const cornerPositions: Record<cmath.IntercardinalDirection, cmath.Vector2> =
      {
        nw: nw, // northwest = top-left
        ne: ne, // northeast = top-right
        se: se, // southeast = bottom-right
        sw: sw, // southwest = bottom-left
      };

    for (const corner of CORNER_ORDER) {
      cornerHandles.push(createCornerHandle(corner, cornerPositions[corner]));
    }

    return { sideHandles, cornerHandles };
  }, [createCornerHandle, createScaleHandle, screenCorners]);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: widthPx,
        height: heightPx,
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <svg
          width={widthPx}
          height={heightPx}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {/* Original image polygon */}
          <polygon
            onPointerDown={handleSurfacePointerDown}
            points={polygonPoints}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            fill="transparent"
            className="pointer-events-auto cursor-move"
            data-popover-no-close
          />
        </svg>
      </div>
      <DebugLayer
        debug={debug}
        transform={previewTransform}
        width={width}
        height={height}
        scaleX={scaleX}
        scaleY={scaleY}
      />
      {handles.sideHandles}
      {handles.cornerHandles}
    </div>
  );
}

function DebugLayer({
  debug,
  transform,
  width,
  height,
  scaleX,
  scaleY,
}: {
  debug: boolean;
  transform: cg.AffineTransform;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}) {
  const debuglayerMatrix = useMemo(() => {
    if (!debug) return null;
    // Apply only viewport scaling to the raw transform matrix
    // The container already handles box-relative scaling
    const a = transform[0][0] * scaleX;
    const b = transform[1][0] * scaleY;
    const c = transform[0][1] * scaleX;
    const d = transform[1][1] * scaleY;
    const e = transform[0][2] * scaleX;
    const f = transform[1][2] * scaleY;
    return { a, b, c, d, e, f };
  }, [debug, transform, scaleX, scaleY]);

  if (!debug || !debuglayerMatrix) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <svg
        width={width * scaleX}
        height={height * scaleY}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        {/* Debug overlay - exactly the raw matrix (box-relative → pixels) */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="rgba(255,0,0,0.3)"
          stroke="rgba(255,0,0,0.8)"
          strokeWidth={2}
          transform={`matrix(${debuglayerMatrix.a} ${debuglayerMatrix.b} ${debuglayerMatrix.c} ${debuglayerMatrix.d} ${debuglayerMatrix.e} ${debuglayerMatrix.f})`}
          style={{ pointerEvents: "none", transformOrigin: "0 0" }}
        />
      </svg>
    </div>
  );
}

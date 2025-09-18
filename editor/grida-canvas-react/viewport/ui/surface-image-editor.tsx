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
  type ImageTransformCorner,
  type ImageTransformSide,
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
      side: ImageTransformSide;
      base: cg.AffineTransform;
      start: cmath.Vector2;
      pointerId: number;
    }
  | {
      type: "rotate";
      corner: ImageTransformCorner;
      base: cg.AffineTransform;
      start: cmath.Vector2;
      pointerId: number;
    };

const SIDE_CURSOR: Record<ImageTransformSide, React.CSSProperties["cursor"]> = {
  left: "ew-resize",
  right: "ew-resize",
  top: "ns-resize",
  bottom: "ns-resize",
};

const CORNER_ORDER: ImageTransformCorner[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
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
        editorInstance.changeNodeStrokes(node_id, updatedPaints);
      } else {
        editorInstance.changeNodeFills(node_id, updatedPaints);
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
      topLeft: toScreen(corners.topLeft),
      topRight: toScreen(corners.topRight),
      bottomRight: toScreen(corners.bottomRight),
      bottomLeft: toScreen(corners.bottomLeft),
    };
  }, [corners, scaleX, scaleY]);

  const polygonPoints = useMemo(() => {
    return [
      screenCorners.topLeft,
      screenCorners.topRight,
      screenCorners.bottomRight,
      screenCorners.bottomLeft,
    ]
      .map(([x, y]) => `${x},${y}`)
      .join(" ");
  }, [screenCorners]);

  const isPointInsideImage = useCallback(
    (point: cmath.Vector2) => {
      // Use the original corners (in local coordinates) for hit testing
      const rel = cmath.vector2.sub(point, corners.topLeft);
      const u = cmath.vector2.sub(corners.topRight, corners.topLeft);
      const v = cmath.vector2.sub(corners.bottomLeft, corners.topLeft);
      const det = u[0] * v[1] - u[1] * v[0];
      if (Math.abs(det) < 1e-6) return false;
      const s = (rel[0] * v[1] - rel[1] * v[0]) / det;
      const t = (rel[1] * u[0] - rel[0] * u[1]) / det;
      return s >= 0 && s <= 1 && t >= 0 && t <= 1;
    },
    [corners]
  );

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
      side: ImageTransformSide,
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
        />
      );
    },
    [previewTransform, toLocalPoint]
  );

  const createCornerHandle = useCallback(
    (corner: ImageTransformCorner, position: cmath.Vector2) => {
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
          style={{
            position: "absolute",
            left: position[0],
            top: position[1],
            width: 16,
            height: 16,
            transform: "translate(-50%, -50%)",
            borderRadius: 999,
            border: "2px solid rgba(59,130,246,0.7)",
            background: "rgba(59,130,246,0.2)",
            cursor: "grab",
            pointerEvents: "auto",
          }}
        />
      );
    },
    [previewTransform, toLocalPoint]
  );

  const handles = useMemo(() => {
    const sideHandles: React.ReactNode[] = [];
    const cornerHandles: React.ReactNode[] = [];

    const { topLeft, topRight, bottomRight, bottomLeft } = screenCorners;

    const sides: Array<{
      side: ImageTransformSide;
      a: cmath.Vector2;
      b: cmath.Vector2;
    }> = [
      { side: "top", a: topLeft, b: topRight },
      { side: "right", a: topRight, b: bottomRight },
      { side: "bottom", a: bottomLeft, b: bottomRight },
      { side: "left", a: topLeft, b: bottomLeft },
    ];

    for (const { side, a, b } of sides) {
      const midpoint: cmath.Vector2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const vector = cmath.vector2.sub(b, a);
      const length = Math.hypot(vector[0], vector[1]) || 1;
      const angle = (Math.atan2(vector[1], vector[0]) * 180) / Math.PI;
      sideHandles.push(createScaleHandle(side, midpoint, angle, length));
    }

    const cornerPositions: Record<ImageTransformCorner, cmath.Vector2> = {
      "top-left": topLeft,
      "top-right": topRight,
      "bottom-right": bottomRight,
      "bottom-left": bottomLeft,
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
            stroke="rgba(59,130,246,0.7)"
            strokeWidth={1}
            fill="transparent"
            style={{ pointerEvents: "auto", cursor: "grab" }}
          />
        </svg>
      </div>
      <DebugLayer
        debug={debug}
        corners={corners}
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
  corners,
  width,
  height,
  scaleX,
  scaleY,
}: {
  debug: boolean;
  corners: {
    topLeft: cmath.Vector2;
    topRight: cmath.Vector2;
    bottomRight: cmath.Vector2;
    bottomLeft: cmath.Vector2;
  };
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}) {
  const debuglayerMatrix = useMemo(() => {
    if (!debug) return null;
    const w = width || 1;
    const h = height || 1;
    const widthVector = cmath.vector2.sub(corners.topRight, corners.topLeft);
    const heightVector = cmath.vector2.sub(corners.bottomLeft, corners.topLeft);
    return {
      a: (widthVector[0] / w) * scaleX,
      b: (widthVector[1] / w) * scaleY,
      c: (heightVector[0] / h) * scaleX,
      d: (heightVector[1] / h) * scaleY,
      e: corners.topLeft[0] * scaleX,
      f: corners.topLeft[1] * scaleY,
    };
  }, [debug, corners, width, height, scaleX, scaleY]);

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
        {/* Debug overlay - red rectangle with same transform as image */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="rgba(255,0,0,0.3)"
          stroke="rgba(255,0,0,0.8)"
          strokeWidth={2}
          transform={`matrix(${debuglayerMatrix.a} ${debuglayerMatrix.b} ${debuglayerMatrix.c} ${debuglayerMatrix.d} ${debuglayerMatrix.e} ${debuglayerMatrix.f})`}
          style={{ pointerEvents: "none" }}
        />
      </svg>
    </div>
  );
}

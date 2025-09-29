import React, { useMemo } from "react";
import {
  useEditorFlagsState,
  useToolState,
  useTransformState,
} from "@/grida-canvas-react/provider";
import cmath from "@grida/cmath";
import { useGesture } from "@use-gesture/react";
import { cn } from "@/components/lib/utils";
import { Point } from "./point";
import assert from "assert";
import useVectorContentEditMode, {
  VectorContentEditor,
} from "@/grida-canvas-react/use-sub-vector-network-editor";
import { useCurrentEditor } from "@/grida-canvas-react";
import { VectorRegion } from "./vector-region";
import { Curve } from "./vector-cubic-curve";

const t = (v: cmath.Vector2, t: cmath.Transform): cmath.Vector2 => {
  return cmath.vector2.transform(v, [
    [t[0][0], t[0][1], 0],
    [t[1][0], t[1][1], 0],
  ]);
};

export function SurfaceVectorEditor({
  node_id: _node_id,
}: {
  node_id: string;
}) {
  const tool = useToolState();
  const { debug } = useEditorFlagsState();
  const { transform } = useTransformState();
  const ve = useVectorContentEditMode();
  const {
    node_id,
    absolute_vertices,
    segments,
    selected_tangents,
    neighbouring_vertices,
    path_cursor_position,
    a_point,
    next_ta,
    hovered_control,
  } = ve;

  assert(node_id === _node_id);

  const neighbouringSet = useMemo(
    () => new Set(neighbouring_vertices),
    [neighbouring_vertices]
  );

  return (
    <div id="path-editor-surface" className="fixed left-0 top-0 w-0 h-0 z-10">
      <div
        data-debug={debug}
        style={{
          position: "absolute",
          willChange: "transform",
          overflow: "visible",
          resize: "none",
          zIndex: 1,
        }}
        className="border-0 data-[debug='true']:border data-[debug='true']:border-pink-500"
      >
        {absolute_vertices.map((p, i) => (
          <VertexPoint
            key={i}
            point={cmath.vector2.transform(p, transform)}
            index={i}
            ve={ve}
            tool={tool}
          />
        ))}
        {debug && (
          <svg
            width={1}
            height={1}
            style={{
              overflow: "visible",
            }}
          >
            {/* // debug */}
            {absolute_vertices.map((v, i) => {
              const tv = cmath.vector2.transform(v, transform);
              return (
                <text
                  key={i}
                  x={tv[0] - 8}
                  y={tv[1] - 8}
                  fontSize={8}
                  fill="fuchsia"
                >
                  p{i} ({Math.round(v[0])}, {Math.round(v[1])})
                </text>
              );
            })}
          </svg>
        )}
      </div>

      {tool.type === "cursor" && <Loops ve={ve} transform={transform} />}

      {/* Render all segments */}
      {segments.map((s, i) => {
        const a = absolute_vertices[s.a];
        const b = absolute_vertices[s.b];
        const ta = s.ta;
        const tb = s.tb;

        return (
          <Segment
            key={i}
            segmentIndex={i}
            a={cmath.vector2.transform(a, transform)}
            b={cmath.vector2.transform(b, transform)}
            ta={t(ta, transform)}
            tb={t(tb, transform)}
            hovered={
              hovered_control?.type === "segment" && hovered_control.index === i
            }
            ve={ve}
            tool={tool}
          />
        );
      })}

      {tool.type === "path" && (
        <NextExtension
          a={
            a_point != null
              ? cmath.vector2.transform(absolute_vertices[a_point], transform)
              : undefined
          }
          b={cmath.vector2.transform(path_cursor_position, transform)}
          ta={next_ta ? t(next_ta, transform) : undefined}
        />
      )}

      {segments.map((s, i) => {
        const a = absolute_vertices[s.a];
        const b = absolute_vertices[s.b];
        const ta = s.ta;
        const tb = s.tb;
        const ta_scaled = t(ta, transform);
        const tb_scaled = t(tb, transform);
        const tangent_a_selected = selected_tangents.some(
          ([v, t]) => v === s.a && t === 0
        );
        const tangent_b_selected = selected_tangents.some(
          ([v, t]) => v === s.b && t === 1
        );
        const show_ta = neighbouringSet.has(s.a);
        const show_tb = neighbouringSet.has(s.b);
        if (!show_ta && !show_tb) return null;

        return (
          <React.Fragment key={`control-${i}`}>
            <div
              style={{
                position: "absolute",
              }}
            >
              {show_ta && !cmath.vector2.isZero(ta) && (
                <CurveControlExtension
                  segment={i}
                  control="ta"
                  a={cmath.vector2.transform(a, transform)}
                  b={cmath.vector2.transform(
                    cmath.vector2.add(a, ta),
                    transform
                  )}
                  ta={ta_scaled}
                  selected={tangent_a_selected}
                  ve={ve}
                />
              )}
              {show_tb && !cmath.vector2.isZero(tb) && (
                <CurveControlExtension
                  segment={i}
                  control="tb"
                  a={cmath.vector2.transform(b, transform)}
                  b={cmath.vector2.transform(
                    cmath.vector2.add(b, tb),
                    transform
                  )}
                  ta={tb_scaled}
                  selected={tangent_b_selected}
                  ve={ve}
                />
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Loops({
  ve,
  transform,
}: {
  ve: VectorContentEditor;
  transform: cmath.Transform;
}) {
  const { segments, absolute_vertices, loops } = ve;
  //
  return (
    <>
      {loops.map((loop, i) => {
        // TODO: can be cheaper.
        // Derive vertices from segments since getLoops() only returns segment indices
        const loopVertices = new Set<number>();
        const loopSegments = loop.map((si) => {
          const s = segments[si];
          loopVertices.add(s.a);
          loopVertices.add(s.b);
          return {
            idx: si,
            a: s.a,
            b: s.b,
            ta: t(s.ta, transform),
            tb: t(s.tb, transform),
          };
        });

        const vertexPositions = Array.from(loopVertices).map((v) =>
          cmath.vector2.transform(absolute_vertices[v], transform)
        );

        const indexMap = new Map(
          Array.from(loopVertices).map((v, idx) => [v, idx])
        );

        // Update segment indices to use the new vertex mapping
        const mappedSegments = loopSegments.map((seg) => ({
          ...seg,
          a: indexMap.get(seg.a)!,
          b: indexMap.get(seg.b)!,
        }));

        return (
          <VectorRegion
            key={`region-${i}`}
            vertices={vertexPositions}
            segments={mappedSegments}
            ve={ve}
            onSelect={() => {
              ve.selectLoop(loop);
            }}
          />
        );
      })}
    </>
  );
}

function Segment({
  segmentIndex,
  a,
  b,
  ta,
  tb,
  hovered,
  ve,
  tool,
}: {
  segmentIndex: number;
  a: cmath.Vector2;
  b: cmath.Vector2;
  ta: cmath.Vector2;
  tb: cmath.Vector2;
  hovered: boolean;
  ve: VectorContentEditor;
  tool: any;
}) {
  const instance = useCurrentEditor();
  const selected = ve.selected_segments.includes(segmentIndex);
  const active = selected;
  const selectedRef = React.useRef(false);
  const draggedRef = React.useRef(false);
  const t0Ref = React.useRef<number | null>(null);
  const frozenRef = React.useRef<{
    a: cmath.Vector2;
    b: cmath.Vector2;
    ta: cmath.Vector2;
    tb: cmath.Vector2;
  } | null>(null);
  const showMiddle =
    hovered && cmath.vector2.isZero(ta) && cmath.vector2.isZero(tb);
  const middle = useMemo(() => {
    if (!showMiddle) return null;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as cmath.Vector2;
  }, [showMiddle, a, b]);

  const bind = useGesture(
    {
      onHover: (s) => {
        if (s.first) {
          ve.updateHoveredControl({ type: "segment", index: segmentIndex });
        }
        if (s.last) {
          ve.updateHoveredControl(null);
        }
      },
      onPointerDown: ({ event }) => {
        if (tool.type === "path") return;
        event.preventDefault();
        selectedRef.current = ve.selected_segments.includes(segmentIndex);
        draggedRef.current = false;
        if (!selectedRef.current) {
          ve.selectSegment(segmentIndex, event.shiftKey);
        }
      },
      onDragStart: ({ event }) => {
        if (tool.type === "path") return;
        event.preventDefault();
        draggedRef.current = true;
        if (tool.type === "bend") {
          const canvasPoint = instance.camera.clientPointToCanvasPoint([
            (event as MouseEvent).clientX,
            (event as MouseEvent).clientY,
          ]);
          const point = cmath.vector2.sub(canvasPoint, ve.offset);
          const seg = ve.segments[segmentIndex];
          // Store frozen state in local coordinates (relative to vector network origin)
          const a0 = ve.vertices[seg.a];
          const b0 = ve.vertices[seg.b];
          const ta0 = seg.ta;
          const tb0 = seg.tb;
          frozenRef.current = { a: a0, b: b0, ta: ta0, tb: tb0 };
          t0Ref.current = cmath.bezier.project(a0, b0, ta0, tb0, point);
        } else {
          ve.onDragStart();
        }
      },
      onDrag: ({ event }) => {
        if (tool.type === "path") return;
        if (
          tool.type === "bend" &&
          t0Ref.current !== null &&
          frozenRef.current
        ) {
          event.preventDefault();
          const canvasPoint = instance.camera.clientPointToCanvasPoint([
            (event as MouseEvent).clientX,
            (event as MouseEvent).clientY,
          ]);
          const cb = cmath.vector2.sub(canvasPoint, ve.offset);
          ve.bendSegment(segmentIndex, t0Ref.current, cb, frozenRef.current);
        }
      },
      onPointerUp: ({ event }) => {
        if (tool.type === "path") return;
        if (tool.type === "bend") {
          if (selectedRef.current && !draggedRef.current) {
            ve.selectSegment(segmentIndex, event.shiftKey);
          }
          return;
        }
        if (selectedRef.current && !draggedRef.current) {
          ve.selectSegment(segmentIndex, event.shiftKey);
        }
      },
    },
    {
      drag: {
        threshold: 1,
      },
    }
  );

  return (
    <>
      {/* Invisible hit area curve */}
      <div {...bind()} style={{ touchAction: "none" }}>
        <Curve
          a={a}
          b={b}
          ta={ta}
          tb={tb}
          strokeWidth={16}
          className="stroke-transparent"
        />
        {showMiddle && middle && (
          <MiddlePoint
            segmentIndex={segmentIndex}
            point={middle}
            ve={ve}
            tool={tool}
          />
        )}
      </div>
      {/* Visible curve */}
      <div style={{ pointerEvents: "none" }}>
        <Curve
          a={a}
          b={b}
          ta={ta}
          tb={tb}
          strokeWidth={active ? 3 : hovered ? 3 : 1}
          className={cn(
            "stroke-gray-400",
            active && "stroke-workbench-accent-sky",
            hovered && !active && "stroke-workbench-accent-sky opacity-50"
          )}
        />
      </div>
    </>
  );
}

function CurveControlExtension({
  segment,
  control,
  a,
  b,
  ta,
  tb,
  selected,
  ve,
}: {
  segment: number;
  control: "ta" | "tb";
  //
  a: cmath.Vector2;
  b: cmath.Vector2;
  ta?: cmath.Vector2;
  tb?: cmath.Vector2;
  selected?: boolean;
  ve: VectorContentEditor;
}) {
  const selectedRef = React.useRef(false);
  const draggedRef = React.useRef(false);
  const bind = useGesture(
    {
      onPointerDown: ({ event }) => {
        event.preventDefault();
        selectedRef.current = ve.selected_tangents.some(
          ([v, t]) =>
            v ===
              (control === "ta"
                ? ve.segments[segment].a
                : ve.segments[segment].b) && t === (control === "ta" ? 0 : 1)
        );
        draggedRef.current = false;
        if (!selectedRef.current) {
          ve.selectTangent(segment, control, event.shiftKey);
        }
      },
      onDragStart: ({ event }) => {
        event.preventDefault();
        draggedRef.current = true;
        ve.onCurveControlPointDragStart(segment, control);
      },
      onPointerUp: ({ event }) => {
        if (selectedRef.current && !draggedRef.current) {
          ve.selectTangent(segment, control, event.shiftKey);
        }
      },
    },
    {
      drag: {
        threshold: 1,
      },
    }
  );

  return (
    <>
      {/* cursor point */}
      <Point
        {...bind()}
        point={b}
        style={{ cursor: "pointer", zIndex: 99 }}
        selected={selected}
        shape="diamond"
        size={6}
      />
      <Curve
        a={a}
        b={b}
        ta={ta}
        tb={tb}
        data-focus={selected}
        strokeWidth={selected ? 2 : 1}
        className="stroke-gray-400 pointer-events-none data-[focus=true]:stroke-workbench-accent-sky"
      />
    </>
  );
}

function NextExtension({
  a,
  b,
  ta,
  tb,
}: {
  a?: cmath.Vector2;
  b: cmath.Vector2;
  ta?: cmath.Vector2;
  tb?: cmath.Vector2;
}) {
  return (
    <>
      {/* cursor point */}
      <Point point={b} style={{ cursor: "crosshair", pointerEvents: "none" }} />
      {/* curve - if had a start point */}
      {a && b && (
        <Curve
          a={a}
          b={b}
          ta={ta}
          tb={tb}
          className="stroke-workbench-accent-sky pointer-events-none"
          style={{ pointerEvents: "none" }}
        />
      )}
    </>
  );
}

function MiddlePoint({
  point,
  segmentIndex,
  ve,
  tool,
}: {
  point: cmath.Vector2;
  segmentIndex: number;
  ve: VectorContentEditor;
  tool: any;
}) {
  const bind = useGesture({
    onPointerDown: ({ event }) => {
      if (tool.type === "path") return;
      event.preventDefault();
      ve.onSegmentInsertMiddle(segmentIndex);
    },
  });

  return (
    <Point
      {...bind()}
      point={point}
      size={6}
      style={tool.type === "path" ? { pointerEvents: "none" } : undefined}
    />
  );
}

function VertexPoint({
  point,
  index,
  ve,
  tool,
}: {
  point: cmath.Vector2;
  index: number;
  ve: VectorContentEditor;
  tool: any;
}) {
  const instance = useCurrentEditor();
  const selected = ve.selected_vertices.includes(index);
  const hovered =
    ve.snapped_point === index ||
    (ve.hovered_control?.type === "vertex" &&
      ve.hovered_control.index === index);
  const selectedRef = React.useRef(false);
  const draggedRef = React.useRef(false);
  const bind = useGesture(
    {
      onHover: (s) => {
        if (s.first) {
          ve.updateHoveredControl({ type: "vertex", index });
        }
        if (s.last) {
          ve.updateHoveredControl(null);
        }
      },
      onPointerDown: ({ event }) => {
        if (tool.type === "path") return;
        event.preventDefault();
        const element = event.target as HTMLDivElement;
        if (element.hasAttribute("tabindex")) {
          element.focus();
        }
        selectedRef.current = ve.selected_vertices.includes(index);
        draggedRef.current = false;
        if (!selectedRef.current) {
          ve.selectVertex(index, event.shiftKey);
        }
      },
      onDragStart: (state) => {
        const { event } = state;
        if (tool.type === "path") return;
        event.preventDefault();
        draggedRef.current = true;
        if (tool.type === "bend") {
          instance.bendOrClearCorner(ve.node_id, index, 0);
          const segment = ve.segments.findIndex(
            (s) => s.a === index || s.b === index
          );
          if (segment !== -1) {
            const control = ve.segments[segment].a === index ? "ta" : "tb";
            instance.surfaceStartCurveGesture(ve.node_id, segment, control);
          }
        } else {
          ve.onDragStart();
        }
      },
      onPointerUp: ({ event }) => {
        if (tool.type === "path") return;
        if (tool.type === "bend") {
          if (!draggedRef.current) {
            instance.bendOrClearCorner(ve.node_id, index);
          }
          return;
        }
        if (selectedRef.current && !draggedRef.current) {
          ve.selectVertex(index, event.shiftKey);
        }
      },
    },
    {
      drag: {
        threshold: 1,
      },
    }
  );

  return (
    <Point
      {...bind()}
      tabIndex={0}
      selected={selected}
      hovered={hovered}
      point={point}
    />
  );
}

import React, { useState, useMemo } from "react";
import {
  useEditorFlagsState,
  useToolState,
  useTransformState,
} from "@/grida-canvas-react/provider";
import cmath from "@grida/cmath";
import { useGesture } from "@use-gesture/react";
import { cn } from "@/components/lib/utils";
import { svg } from "@/grida-canvas-utils/svg";
import assert from "assert";
import useSurfaceVectorEditor from "@/grida-canvas-react/use-sub-vector-network-editor";

function transformDelta(v: cmath.Vector2, t: cmath.Transform): cmath.Vector2 {
  return cmath.vector2.transform(v, [
    [t[0][0], t[0][1], 0],
    [t[1][0], t[1][1], 0],
  ]);
}

export function SurfaceVectorEditor({
  node_id: _node_id,
}: {
  node_id: string;
}) {
  const tool = useToolState();
  const { debug } = useEditorFlagsState();
  const { transform } = useTransformState();
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const {
    node_id,
    absolute_vertices,
    segments,
    selected_tangents,
    neighbouring_vertices,
    path_cursor_position,
    a_point,
    next_ta,
  } = useSurfaceVectorEditor();

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
            {absolute_vertices.map((v, i) => (
              <text
                key={i}
                x={v[0] - 8}
                y={v[1] - 8}
                fontSize={8}
                fill="fuchsia"
              >
                p{i} ({Math.round(v[0])}, {Math.round(v[1])})
              </text>
            ))}
          </svg>
        )}
      </div>

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
            ta={transformDelta(ta, transform)}
            tb={transformDelta(tb, transform)}
            hovered={hoveredSegment === i}
            onHover={setHoveredSegment}
          />
        );
      })}

      {tool.type === "path" && typeof a_point === "number" && (
        <>
          {/* next segment */}
          <Extension
            a={cmath.vector2.transform(absolute_vertices[a_point], transform)}
            b={cmath.vector2.transform(path_cursor_position, transform)}
            ta={next_ta ? transformDelta(next_ta, transform) : undefined}
          />
        </>
      )}
      {segments.map((s, i) => {
        const a = absolute_vertices[s.a];
        const b = absolute_vertices[s.b];
        const ta = s.ta;
        const tb = s.tb;
        const ta_scaled = transformDelta(ta, transform);
        const tb_scaled = transformDelta(tb, transform);
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
                />
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Segment({
  segmentIndex,
  a,
  b,
  ta,
  tb,
  hovered,
  onHover,
}: {
  segmentIndex: number;
  a: cmath.Vector2;
  b: cmath.Vector2;
  ta: cmath.Vector2;
  tb: cmath.Vector2;
  hovered: boolean;
  onHover: (segmentIndex: number | null) => void;
}) {
  const editor = useSurfaceVectorEditor();
  const segment = editor.segments[segmentIndex];
  const selected = editor.selected_segments.includes(segmentIndex);
  // activeAB when both vertices of the segment are selected
  const activeAB =
    editor.selected_vertices.includes(segment.a) &&
    editor.selected_vertices.includes(segment.b);
  const active = selected || activeAB;
  const selectedRef = React.useRef(false);
  const draggedRef = React.useRef(false);
  const showMiddle =
    hovered && cmath.vector2.isZero(ta) && cmath.vector2.isZero(tb);
  const middle = useMemo(() => {
    if (!showMiddle) return null;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as cmath.Vector2;
  }, [showMiddle, a, b]);
  const bind = useGesture(
    {
      onHover: (s) => {
        // enter
        if (s.first) {
          onHover(segmentIndex);
        }
        // leave
        if (s.last) {
          onHover(null);
        }
      },
      onPointerDown: ({ event }) => {
        event.preventDefault();
        selectedRef.current = editor.selected_segments.includes(segmentIndex);
        draggedRef.current = false;
        if (!selectedRef.current) {
          editor.selectSegment(segmentIndex, event.shiftKey);
        }
      },
      onDragStart: ({ event }) => {
        event.preventDefault();
        draggedRef.current = true;
        editor.onDragStart();
      },
      onPointerUp: ({ event }) => {
        if (selectedRef.current && !draggedRef.current) {
          editor.selectSegment(segmentIndex, event.shiftKey);
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
      <div {...bind()}>
        <Curve
          a={a}
          b={b}
          ta={ta}
          tb={tb}
          strokeWidth={16}
          className="stroke-transparent"
        />
        {showMiddle && middle && (
          <MiddlePoint segmentIndex={segmentIndex} point={middle} />
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
}: {
  segment: number;
  control: "ta" | "tb";
  //
  a: cmath.Vector2;
  b: cmath.Vector2;
  ta?: cmath.Vector2;
  tb?: cmath.Vector2;
  selected?: boolean;
}) {
  const editor = useSurfaceVectorEditor();
  const selectedRef = React.useRef(false);
  const draggedRef = React.useRef(false);
  const bind = useGesture(
    {
      onPointerDown: ({ event }) => {
        event.preventDefault();
        selectedRef.current = editor.selected_tangents.some(
          ([v, t]) =>
            v ===
              (control === "ta"
                ? editor.segments[segment].a
                : editor.segments[segment].b) &&
            t === (control === "ta" ? 0 : 1)
        );
        draggedRef.current = false;
        if (!selectedRef.current) {
          editor.selectTangent(segment, control, event.shiftKey);
        }
      },
      onDragStart: ({ event }) => {
        event.preventDefault();
        draggedRef.current = true;
        editor.onCurveControlPointDragStart(segment, control);
      },
      onPointerUp: ({ event }) => {
        if (selectedRef.current && !draggedRef.current) {
          editor.selectTangent(segment, control, event.shiftKey);
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

function Extension({
  a,
  b,
  ta,
  tb,
}: {
  a: cmath.Vector2;
  b: cmath.Vector2;
  ta?: cmath.Vector2;
  tb?: cmath.Vector2;
}) {
  return (
    <>
      {/* cursor point */}
      <Point point={b} style={{ cursor: "crosshair" }} />
      <Curve
        a={a}
        b={b}
        ta={ta}
        tb={tb}
        className="stroke-workbench-accent-sky"
      />
    </>
  );
}

function MiddlePoint({
  point,
  segmentIndex,
}: {
  point: cmath.Vector2;
  segmentIndex: number;
}) {
  const editor = useSurfaceVectorEditor();
  const bind = useGesture({
    onPointerDown: ({ event }) => {
      event.preventDefault();
      editor.onSegmentInsertMiddle(segmentIndex);
    },
  });

  return <Point {...bind()} point={point} size={6} />;
}

function VertexPoint({
  point,
  index,
}: {
  point: cmath.Vector2;
  index: number;
}) {
  const editor = useSurfaceVectorEditor();
  const tool = useToolState();
  const selected = editor.selected_vertices.includes(index);
  const hovered = editor.hovered_point === index;
  const selectedRef = React.useRef(false);
  const draggedRef = React.useRef(false);
  const bind = useGesture(
    {
      onHover: (s) => {
        // enter
        if (s.first) {
          editor.onVertexHover(index, "enter");
        }
        // leave
        if (s.last) {
          editor.onVertexHover(index, "leave");
        }
      },
      onPointerDown: ({ event }) => {
        if (tool.type === "path") return;
        event.preventDefault();
        const element = event.target as HTMLDivElement;
        if (element.hasAttribute("tabindex")) {
          element.focus();
        }
        selectedRef.current = editor.selected_vertices.includes(index);
        draggedRef.current = false;
        if (!selectedRef.current) {
          editor.selectVertex(index, event.shiftKey);
        }
      },
      onDragStart: (state) => {
        const { event } = state;
        if (tool.type === "path") return;
        event.preventDefault();
        draggedRef.current = true;
        editor.onDragStart();
      },
      onPointerUp: ({ event }) => {
        if (tool.type === "path") return;
        if (selectedRef.current && !draggedRef.current) {
          editor.selectVertex(index, event.shiftKey);
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

const Point = React.forwardRef(
  (
    {
      point,
      className,
      style,
      selected,
      hovered,
      size = 8,
      shape = "circle",
      ...props
    }: React.HtmlHTMLAttributes<HTMLDivElement> & {
      point: cmath.Vector2;
      selected?: boolean;
      hovered?: boolean;
      size?: number;
      shape?: "circle" | "diamond";
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    return (
      <div
        ref={ref}
        {...props}
        data-selected={selected}
        data-hovered={hovered}
        className={cn(
          "border border-workbench-accent-sky bg-background",
          shape === "circle" ? "rounded-full" : undefined,
          "data-[selected='true']:shadow-sm data-[selected='true']:bg-workbench-accent-sky data-[selected='true']:border-spacing-1.5 data-[selected='true']:border-background",
          "data-[hovered='true']:opacity-50",
          className
        )}
        style={{
          position: "absolute",
          left: point[0],
          top: point[1],
          width: size,
          height: size,
          cursor: "pointer",
          touchAction: "none",
          ...style,
          transform: `translate(-50%, -50%)${shape === "diamond" ? " rotate(45deg)" : ""}${style?.transform ? ` ${style.transform}` : ""}`,
        }}
      />
    );
  }
);

Point.displayName = "Point";

function Curve({
  a,
  b,
  ta = [0, 0],
  tb = [0, 0],
  className,
  strokeWidth = 2,
  stroke,
  ...props
}: React.HtmlHTMLAttributes<HTMLOrSVGElement> & {
  a: cmath.Vector2;
  b: cmath.Vector2;
  ta?: cmath.Vector2;
  tb?: cmath.Vector2;
  className?: string;
  strokeWidth?: number;
  stroke?: string;
}) {
  //
  const offset = a;
  const _a = cmath.vector2.sub(a, offset);
  const _b = cmath.vector2.sub(b, offset);
  const path = svg.d.encode(svg.d.curve(_a, ta, tb, _b));

  return (
    <svg
      {...props}
      id="curve"
      className={className}
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        left: offset[0],
        top: offset[1],
        overflow: "visible",
      }}
    >
      <path d={path} stroke={stroke} fill="none" strokeWidth={strokeWidth} />
    </svg>
  );
}

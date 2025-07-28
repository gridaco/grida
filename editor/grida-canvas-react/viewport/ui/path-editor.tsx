import React from "react";
import {
  useEditorFlagsState,
  useSurfacePathEditor,
  useToolState,
  useTransformState,
} from "@/grida-canvas-react/provider";
import cmath from "@grida/cmath";
import { useGesture } from "@use-gesture/react";
import { cn } from "@/components/lib/utils";
import { svg } from "@/grida-canvas-utils/svg";
import assert from "assert";

function transformDelta(v: cmath.Vector2, t: cmath.Transform): cmath.Vector2 {
  return cmath.vector2.transform(v, [
    [t[0][0], t[0][1], 0],
    [t[1][0], t[1][1], 0],
  ]);
}

export function SurfacePathEditor({ node_id: _node_id }: { node_id: string }) {
  const tool = useToolState();
  const { debug } = useEditorFlagsState();
  const { transform } = useTransformState();
  const {
    node_id,
    offset,
    vertices,
    segments,
    path_cursor_position,
    a_point,
    next_ta,
  } = useSurfacePathEditor();

  assert(node_id === _node_id);

  const a_point_is_last = a_point === vertices.length - 1;

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
        className="border border-transparent data-[debug='true']:border-pink-500"
      >
        {vertices.map(({ p }, i) => (
          <VertexPoint
            key={i}
            point={cmath.vector2.transform(
              cmath.vector2.add(offset, p),
              transform
            )}
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
            {vertices.map((v, i) => (
              <text
                key={i}
                x={v.p[0] - 8}
                y={v.p[1] - 8}
                fontSize={8}
                fill="fuchsia"
              >
                p{i} ({Math.round(v.p[0])}, {Math.round(v.p[1])})
              </text>
            ))}
          </svg>
        )}
      </div>
      {tool.type === "path" && typeof a_point === "number" && (
        <>
          {/* next segment */}
          <Extension
            a={cmath.vector2.transform(
              cmath.vector2.add(offset, vertices[a_point].p),
              transform
            )}
            b={cmath.vector2.transform(path_cursor_position, transform)}
            ta={next_ta ? transformDelta(next_ta, transform) : undefined}
          />
        </>
      )}
      {segments.map((s, i) => {
        const a = vertices[s.a].p;
        const b = vertices[s.b].p;
        const ta = s.ta;
        const tb = s.tb;
        const ta_scaled = transformDelta(ta, transform);
        const tb_scaled = transformDelta(tb, transform);
        const is_neighbouring = a_point === s.a || a_point === s.b;
        if (!is_neighbouring) return null;

        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
              }}
            >
              {!cmath.vector2.isZero(ta) && (
                <CurveControlExtension
                  segment={i}
                  control="ta"
                  a={cmath.vector2.transform(
                    cmath.vector2.add(a, offset),
                    transform
                  )}
                  b={cmath.vector2.transform(
                    cmath.vector2.add(a, offset, ta),
                    transform
                  )}
                  ta={ta_scaled}
                />
              )}
              {!cmath.vector2.isZero(tb) && (
                <CurveControlExtension
                  segment={i}
                  control="tb"
                  a={cmath.vector2.transform(
                    cmath.vector2.add(b, offset),
                    transform
                  )}
                  b={cmath.vector2.transform(
                    cmath.vector2.add(b, offset, tb),
                    transform
                  )}
                  tb={tb_scaled}
                />
              )}
              {/* preview the next ta - cannot be edited */}
              {a_point_is_last && (
                <Extension
                  a={cmath.vector2.transform(
                    cmath.vector2.add(b, offset),
                    transform
                  )}
                  b={cmath.vector2.transform(
                    cmath.vector2.add(b, offset, cmath.vector2.invert(tb)),
                    transform
                  )}
                />
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CurveControlExtension({
  segment,
  control,
  a,
  b,
  ta,
  tb,
}: {
  segment: number;
  control: "ta" | "tb";
  //
  a: cmath.Vector2;
  b: cmath.Vector2;
  ta?: cmath.Vector2;
  tb?: cmath.Vector2;
}) {
  const editor = useSurfacePathEditor();
  const bind = useGesture({
    onDragStart: ({ event }) => {
      event.preventDefault();
      editor.onCurveControlPointDragStart(segment, control);
    },
  });

  return (
    <>
      {/* cursor point */}
      <Point {...bind()} point={b} style={{ cursor: "pointer", zIndex: 99 }} />
      <Curve a={a} b={b} ta={ta} tb={tb} />
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
      <Curve a={a} b={b} ta={ta} tb={tb} />
    </>
  );
}

function VertexPoint({
  point,
  index,
}: {
  point: cmath.Vector2;
  index: number;
}) {
  const editor = useSurfacePathEditor();
  const selected = editor.selected_vertices.includes(index);
  const hovered = editor.hovered_point === index;
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
        event.preventDefault();
        const element = event.target as HTMLDivElement;
        if (element.hasAttribute("tabindex")) {
          // focus explicitly for key events (as default behavior is prevented)
          element.focus();
        }
        editor.selectVertex(index);
      },
      onDragStart: (state) => {
        const { event } = state;
        event.preventDefault();
        editor.onVertexDragStart(index);
      },
      onKeyDown: (state) => {
        const { event } = state;

        if (event.key === "Delete" || event.key === "Backspace") {
          event.stopPropagation();
          event.preventDefault();
          editor.onVertexDelete(index);
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
      ...props
    }: React.HtmlHTMLAttributes<HTMLDivElement> & {
      point: cmath.Vector2;
      selected?: boolean;
      hovered?: boolean;
      size?: number;
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
          "rounded-full border border-workbench-accent-sky bg-background",
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
          transform: "translate(-50%, -50%)",
          cursor: "pointer",
          touchAction: "none",
          ...style,
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
}: {
  a: cmath.Vector2;
  b: cmath.Vector2;
  ta?: cmath.Vector2;
  tb?: cmath.Vector2;
}) {
  //
  const offset = a;
  const _a = cmath.vector2.sub(a, offset);
  const _b = cmath.vector2.sub(b, offset);
  const path = svg.d.encode(svg.d.curve(_a, ta, tb, _b));

  return (
    <svg
      id="curve"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        left: offset[0],
        top: offset[1],
        overflow: "visible",
      }}
    >
      <path d={path} stroke={"skyblue"} fill="none" strokeWidth="2" />
    </svg>
  );
}

import React, { useMemo } from "react";
import {
  useContentEditModeMinimalState,
  useGestureState,
  useToolState,
  useTransformState,
} from "@/grida-canvas-react/provider";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import cmath from "@grida/cmath";
import { guide } from "@grida/cmath/_snap";
import { Crosshair } from "./crosshair";
import { Rule } from "./rule";
import { Line } from "./line";

function useSnapGuide(): guide.SnapGuide | undefined {
  const editor = useCurrentEditor();
  const surface_snapping = useEditorState(
    editor,
    (state) => state.surface_snapping
  );
  const { transform } = useTransformState();
  const { gesture } = useGestureState();
  const cem = useContentEditModeMinimalState();
  const tool = useToolState();

  const shouldShow = useMemo(
    () =>
      (cem?.type === "vector" && tool.type === "path") ||
      gesture.type === "translate" ||
      gesture.type === "translate-vector-controls" ||
      gesture.type === "curve" ||
      gesture.type === "nudge" ||
      gesture.type === "scale",
    [gesture, cem?.type, tool.type]
  );

  return useMemo(() => {
    if (shouldShow && surface_snapping) {
      const { lines, points, rules: rays } = guide.plot(surface_snapping);
      // finally, map the vectors to the surface space
      return {
        lines: lines.map((l) => cmath.ui.transformLine(l, transform)),
        points: points.map((p) => cmath.vector2.transform(p, transform)),
        rules: rays.map((r) => {
          const axis = r[0];
          return [axis, cmath.delta.transform(r[1], axis, transform)];
        }),
      } satisfies guide.SnapGuide;
    }
  }, [shouldShow, transform, surface_snapping]);
}

const Z_INDEX = 999999;

export function SnapGuide() {
  const guide = useSnapGuide();

  if (!guide) return <></>;

  return (
    <div className="pointer-events-none">
      {guide.lines.map((l, i) => (
        <Line key={i} {...l} zIndex={Z_INDEX} />
      ))}
      {guide.rules.map(([axis, offset], i) => (
        <Rule
          key={i}
          axis={cmath.counterAxis(axis)}
          offset={offset}
          width={1}
          zIndex={Z_INDEX}
        />
      ))}
      {guide.points.map((p, i) => {
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              zIndex: Z_INDEX,
              left: p[0],
              top: p[1],
              transform: "translate(-50%, -50%)",
              willChange: "transform",
            }}
          >
            <Crosshair />
          </div>
        );
      })}
    </div>
  );
}

import React, { useMemo } from "react";
import {
  useEventTargetState,
  useTransformState,
} from "@/grida-canvas-react/provider";
import cmath from "@grida/cmath";
import { guide } from "@grida/cmath/_snap";
import { Crosshair } from "./crosshair";
import { Rule } from "./rule";
import { Line } from "./line";

function useSnapGuide(): guide.SnapGuide | undefined {
  const { transform } = useTransformState();
  const { gesture, surface_snapping } = useEventTargetState();

  return useMemo(() => {
    if (
      (gesture.type === "translate" ||
        gesture.type === "nudge" ||
        gesture.type === "scale") &&
      surface_snapping
    ) {
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
  }, [gesture, transform, surface_snapping]);
}

export function SnapGuide() {
  const guide = useSnapGuide();

  if (!guide) return <></>;

  return (
    <div>
      {guide.lines.map((l, i) => (
        <Line key={i} {...l} />
      ))}
      {guide.rules.map(([axis, offset], i) => (
        <Rule
          key={i}
          axis={cmath.counterAxis(axis)}
          offset={offset}
          width={1}
        />
      ))}
      {guide.points.map((p, i) => {
        return (
          <div
            key={i}
            style={{
              position: "absolute",
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

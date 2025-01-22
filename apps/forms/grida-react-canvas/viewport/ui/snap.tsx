import React from "react";
import { Crosshair } from "./crosshair";
import { useDocument, useTransform } from "@/grida-react-canvas/provider";
import { cmath } from "@grida/cmath";
import { pointToSurfaceSpace } from "@/grida-react-canvas/utils/transform";
import { surface } from "./types";
import { Rule } from "./rule";

function useSnapGuide(): surface.SnapGuide | undefined {
  const { state } = useDocument();
  const { gesture } = state;

  if (
    (gesture.type === "translate" ||
      gesture.type === "nudge" ||
      gesture.type === "scale") &&
    gesture.surface_snapping
  ) {
    const { anchors, distance } = gesture.surface_snapping;

    return {
      x: anchors.x.map((x) => cmath.vector2.add(x, distance)),
      y: anchors.y.map((y) => cmath.vector2.add(y, distance)),
    };
  }
}

export function SnapGuide() {
  const guide = useSnapGuide();
  const { transform } = useTransform();

  if (!guide) return <></>;

  return (
    <div>
      {guide.x?.map((snap, i) => {
        const p = pointToSurfaceSpace(snap, transform);
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: p[0],
                top: p[1],
                transform: "translate(-50%, -50%)",
                willChange: "transform",
                // background: "red",
              }}
            >
              <Crosshair />
            </div>
            <Rule axis="y" offset={p[0]} />
          </React.Fragment>
        );
      })}
      {guide.y?.map((snap, i) => {
        const p = pointToSurfaceSpace(snap, transform);
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: p[0],
                top: p[1],
                transform: "translate(-50%, -50%)",
                willChange: "transform",
                // background: "red",
              }}
            >
              <Crosshair />
            </div>
            <Rule axis="x" offset={p[1]} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

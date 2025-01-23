import React from "react";
import { Crosshair } from "./crosshair";
import { useDocument } from "@/grida-react-canvas/provider";
import { pointToSurfaceSpace } from "@/grida-react-canvas/utils/transform";
import { surface } from "./types";
import { Rule } from "./rule";

function useSnapGuide(): surface.SnapGuide | undefined {
  const { state, transform } = useDocument();
  const { gesture } = state;

  if (
    (gesture.type === "translate" ||
      gesture.type === "nudge" ||
      gesture.type === "scale") &&
    gesture.surface_snapping
  ) {
    const { points } = gesture.surface_snapping;

    const unique_x_offsets = Array.from(
      new Set(points.x.map((p) => p[0]))
    ).filter((o): o is number => o !== null);

    const unique_y_offsets = Array.from(
      new Set(points.y.map((p) => p[1]))
    ).filter((o): o is number => o !== null);

    // ([0, 0], transform);
    return {
      x_points: points.x.map((p) =>
        pointToSurfaceSpace([p[0] ?? 0, p[1] ?? 0], transform)
      ),
      x_offsets: unique_x_offsets.map(
        (x) => pointToSurfaceSpace([x, 0], transform)[0]
      ),
      y_points: points.y.map((p) =>
        pointToSurfaceSpace([p[0] ?? 0, p[1] ?? 0], transform)
      ),
      y_offsets: unique_y_offsets.map(
        (y) => pointToSurfaceSpace([0, y], transform)[1]
      ),
    };
  }
}

export function SnapGuide() {
  const guide = useSnapGuide();

  if (!guide) return <></>;

  return (
    <div>
      {guide.x_offsets.map((offset) => (
        <Rule key={offset} axis="y" offset={offset} />
      ))}
      {guide.y_offsets.map((offset) => (
        <Rule key={offset} axis="x" offset={offset} />
      ))}
      {guide.x_points.map((snap, i) => {
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: snap[0],
              top: snap[1],
              transform: "translate(-50%, -50%)",
              willChange: "transform",
            }}
          >
            <Crosshair />
          </div>
        );
      })}
      {guide.y_points?.map((snap, i) => {
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: snap[0],
              top: snap[1],
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

"use client";

import { cmath } from "@grida/cmath";
import { useDocument } from "@/grida-react-canvas/provider";

export default function useSnapGuide() {
  const { state } = useDocument();
  const { gesture, content_offset: translate } = state;

  if (
    (gesture.type === "translate" ||
      gesture.type === "nudge" ||
      gesture.type === "scale") &&
    gesture.surface_snapping
  ) {
    const { anchors, distance } = gesture.surface_snapping;

    return {
      x: anchors.x.map((x) => cmath.vector2.add(x, distance, translate)),
      y: anchors.y.map((y) => cmath.vector2.add(y, distance, translate)),
    };
  }
}

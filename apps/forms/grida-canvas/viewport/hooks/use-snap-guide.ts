"use client";

import { cmath } from "@/grida-canvas/cmath";
import { useDocument } from "@/grida-canvas/provider";

export default function useSnapGuide() {
  const { state } = useDocument();
  const { surface_snapping, translate } = state;

  if (surface_snapping) {
    const { anchors, distance } = surface_snapping;

    return {
      x: anchors.x.map((x) => cmath.vector2.add(x, distance, translate)),
      y: anchors.y.map((y) => cmath.vector2.add(y, distance, translate)),
    };
  }
}

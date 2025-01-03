"use client";

import { useLayoutEffect, useState } from "react";
import { domapi } from "@/grida-react-canvas/domapi";
import { cmath } from "@grida/cmath";
import { useDocument } from "@/grida-react-canvas/provider";
import { measure, Measurement } from "@grida/cmath/_measurement";

export default function useMeasurement() {
  const { state, selection } = useDocument();
  const { content_offset: translate, surface_measurement_target } = state;

  const [measurement, setMeasurement] = useState<Measurement>();

  useLayoutEffect(() => {
    try {
      const b = surface_measurement_target;

      if (!(selection.length > 0) || !b) {
        setMeasurement(undefined);
        return;
      }

      const _a_rect = cmath.rect.union(
        selection.map((id) => domapi.get_node_bounding_rect(id)!)
      );
      const a_rect = cmath.rect.translate(_a_rect, translate!);
      const _b_rect = cmath.rect.union(
        surface_measurement_target.map(
          (id) => domapi.get_node_bounding_rect(id)!
        )
      );
      const b_rect = cmath.rect.translate(_b_rect!, translate!);

      const measurement = measure(a_rect, b_rect);
      if (measurement)
        setMeasurement({
          a: a_rect,
          b: b_rect,
          distance: measurement.distance,
          box: measurement.box, // cmath.rect.translate(measurement.box),
        });
    } catch (e) {
      console.error("useMeasurement", e);
    }
  }, [state.document, selection, surface_measurement_target, translate]);

  return measurement;
}

"use client";

import React, { useContext, useEffect, useRef, useState } from "react";
import { domapi } from "@/grida-canvas/domapi";
import { cmath } from "@/grida-canvas/cmath";
import { useDocument } from "@/grida-canvas/provider";
import { documentquery } from "@/grida-canvas/document-query";
import { measure, Measurement } from "@/grida-canvas/cmath/_measurement";
import { axisAligned } from "@/grida-canvas/cmath/_snap";

export function useSnapGuide() {
  const { state, selection: selected_node_ids } = useDocument();

  const [offset, setOffset] = useState<cmath.Vector2>([0, 0]);
  const [snaps, setSnaps] = useState<null | {
    x: cmath.Vector2[];
    y: cmath.Vector2[];
  }>(null);

  useEffect(() => {
    const vrect = domapi.get_viewport_rect();
    const voff: cmath.Vector2 = [vrect.x, vrect.y];
    setOffset(voff);
  }, []);

  useEffect(() => {
    const { nodes } = state.document;

    const node_ids = Object.keys(nodes);

    const first_selected_node_id = selected_node_ids[0];

    if (!first_selected_node_id) {
      setSnaps(null);
      return;
    }

    const first_selected_node = domapi.get_node_element(first_selected_node_id);
    const first_selected_node_rect =
      first_selected_node?.getBoundingClientRect();

    // this can happen when selected node is not rendered (active false or delay)
    if (!first_selected_node_rect) return;

    const snap_target_node_ids = documentquery
      .getSiblings(state.document_ctx, first_selected_node_id)
      .concat(
        documentquery.getParentId(state.document_ctx, first_selected_node_id) ??
          []
      );

    const target_node_rects = snap_target_node_ids.map((node_id) => {
      const node = domapi.get_node_element(node_id);
      return node!.getBoundingClientRect();
    });

    const targetpoints = target_node_rects
      .map((r) => Object.values(cmath.rect.to9Points(r)))
      .flat();

    const origin_points = Object.values(
      cmath.rect.to9Points(first_selected_node_rect)
    );

    const [points, delta, anchors] = axisAligned(
      origin_points,
      targetpoints,
      [4, 4]
    );

    // const snaps: cmath.Vector2[] = ;

    // const snap = cmath.snap.vector2(topleft, targetpoints, [10, 10]);
    setSnaps({
      x: anchors.x.map((x) => cmath.vector2.add(x, delta)),
      y: anchors.y.map((y) => cmath.vector2.add(y, delta)),
    });
  }, [state.document, state.document_ctx, selected_node_ids]);

  return {
    x: snaps?.x?.map((snap) => ({
      left: snap[0] - offset[0],
      top: snap[1] - offset[1],
    })),
    y: snaps?.y?.map((snap) => ({
      left: snap[0] - offset[0],
      top: snap[1] - offset[1],
    })),
  };
}

export function useMeasurement() {
  const { state, selection } = useDocument();
  const { translate, surface_measurement_target } = state;

  const [measurement, setMeasurement] = useState<Measurement>();

  useEffect(() => {
    const b = surface_measurement_target;

    if (!(selection.length > 0) || !b) {
      setMeasurement(undefined);
      return;
    }

    const _a_rect = cmath.rect.getBoundingRect(
      selection.map((id) => domapi.get_node_bounding_rect(id)!)
    );
    const a_rect = cmath.rect.translate(_a_rect, translate!);
    const _b_rect = domapi.get_node_bounding_rect(b);
    const b_rect = cmath.rect.translate(_b_rect!, translate!);

    const measurement = measure(a_rect, b_rect);
    if (measurement)
      setMeasurement({
        a: a_rect,
        b: b_rect,
        distance: measurement.distance,
        box: measurement.box, // cmath.rect.translate(measurement.box),
      });
  }, [state.document, selection, surface_measurement_target, translate]);

  return measurement;
}

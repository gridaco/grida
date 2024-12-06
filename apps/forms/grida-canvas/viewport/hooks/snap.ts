"use client";

import React, { useContext, useEffect, useRef, useState } from "react";
import { domapi } from "@/grida-canvas/domapi";
import { cmath } from "@/grida-canvas/math";
import { useDocument } from "@/grida-canvas/provider";
import { documentquery } from "@/grida-canvas/document-query";

export function useSnapGuide() {
  const { state, selected_node_ids } = useDocument();

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
      first_selected_node!.getBoundingClientRect();

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

    const [points, delta, anchors] = cmath.snap.axisAligned(
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
  }, [state]);

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

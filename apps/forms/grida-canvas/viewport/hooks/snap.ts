"use client";

import React, { useContext, useEffect, useRef, useState } from "react";
import { domapi } from "@/grida-canvas/domapi";
import { cmath } from "@/grida-canvas/math";
import { useDocument } from "@/grida-canvas/provider";

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

    const node_rects = node_ids
      .filter((node_id) => node_id !== first_selected_node_id)
      .map((node_id) => {
        const node = domapi.get_node_element(node_id);
        return node!.getBoundingClientRect();
      });

    const targetpoints = node_rects
      .map((r) => Object.values(cmath.rect.toPoints(r)))
      .flat();

    const origin_points = Object.values(
      cmath.rect.toPoints(first_selected_node_rect)
    );

    const [points, delta, anchors] = cmath.snap.axisAligned(
      origin_points,
      targetpoints,
      [2, 2]
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

"use client";

import { useEffect } from "react";
import { useEventTarget, useTransform } from "../../provider";
import { useViewport } from "../context";
import { cmath } from "@grida/cmath";

const EDGE_SCROLLING_THRESHOLD = 16;

export function useEdgeScrolling({ enabled = true }: { enabled?: boolean }) {
  const { pointer, dragging, tool } = useEventTarget();
  const { transform, setTransform } = useTransform();
  const viewport = useViewport();

  useEffect(() => {
    let rafId: number;
    const loop = () => {
      if (tool.type !== "cursor") return;
      if (!enabled) return;
      if (!dragging) return;
      if (!viewport) return;

      const _vr = viewport.getBoundingClientRect();
      const vrect: cmath.Rectangle = {
        x: _vr.left,
        y: _vr.top,
        width: _vr.width,
        height: _vr.height,
      };
      const inset = cmath.rect.inset(vrect, EDGE_SCROLLING_THRESHOLD);
      const offset = cmath.rect.offset(inset, pointer.client);
      if (cmath.vector2.isZero(offset)) {
        return;
      }
      const delta = cmath.vector2.clamp(
        cmath.vector2.invert(offset),
        [-EDGE_SCROLLING_THRESHOLD, -EDGE_SCROLLING_THRESHOLD],
        [EDGE_SCROLLING_THRESHOLD, EDGE_SCROLLING_THRESHOLD]
      );

      const next = cmath.transform.translate(transform, delta);

      setTransform(next);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [dragging, pointer.client, transform, viewport, enabled, tool.type]);
}

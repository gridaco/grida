"use client";

import React from "react";
import { TransparencyGrid } from "@grida/transparency-grid";
import { useGesture } from "@use-gesture/react";
import useDisableSwipeBack from "@/grida-react-canvas/viewport/hooks/use-disable-browser-swipe-back";

export default function TransparencyGridDemoPage() {
  useDisableSwipeBack();

  const ref = React.useRef<HTMLDivElement>(null);

  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);

  useGesture(
    {
      onWheel: ({ delta, ctrlKey, event }) => {
        event.preventDefault();
        if (ctrlKey) {
          setZoom((prev) => prev - delta[1] * 0.01);
        } else {
          setOffset((prev) => ({
            x: prev.x - delta[0],
            y: prev.y - delta[1],
          }));
        }
      },
    },
    {
      wheel: {
        eventOptions: {
          passive: false,
        },
      },
      target: ref,
    }
  );

  return (
    <main ref={ref} className="w-dvw h-dvh">
      <TransparencyGrid
        width={typeof window === "undefined" ? 0 : window.innerWidth}
        height={typeof window === "undefined" ? 0 : window.innerHeight}
        transform={[
          [zoom, 0, offset.x],
          [0, zoom, offset.y],
        ]}
        color={"rgba(150, 150, 150, 0.15)"}
      />
    </main>
  );
}

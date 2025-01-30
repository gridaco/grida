"use client";

import React from "react";
import { Ruler } from "@grida/ruler";
import { useGesture } from "@use-gesture/react";
import useDisableSwipeBack from "@/grida-react-canvas/viewport/hooks/use-disable-browser-swipe-back";
import { cmath } from "@grida/cmath";

const rects = [
  { x: 100, y: 100, width: 100, height: 100 },
  { x: 400, y: 200, width: 100, height: 100 },
  { x: 700, y: 700, width: 100, height: 100 },
];

const x_ranges: cmath.Range[] = rects.map((rect) => [
  rect.x,
  rect.x + rect.width,
]);
const y_ranges: cmath.Range[] = rects.map((rect) => [
  rect.y,
  rect.y + rect.height,
]);

export default function RulerDemoPage() {
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
      <div className="fixed top-0 left-0 right-0 border-b bg-background">
        <Ruler
          axis="x"
          width={window.innerWidth}
          height={24}
          transform={{
            scaleX: zoom,
            translateX: offset.x,
          }}
          ranges={x_ranges}
        />
      </div>
      <div className="fixed top-0 left-0 bottom-0 border-r bg-background">
        <Ruler
          axis="y"
          width={24}
          height={window.innerHeight}
          transform={{
            scaleX: zoom,
            translateX: offset.y,
          }}
          ranges={y_ranges}
        />
      </div>
    </main>
  );
}

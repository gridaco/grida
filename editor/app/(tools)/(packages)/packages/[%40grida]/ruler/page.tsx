"use client";

import React from "react";
import { AxisRuler, type Tick } from "@grida/ruler/react";
import { useGesture } from "@use-gesture/react";
import useDisableSwipeBack from "@/grida-canvas-react/viewport/hooks/use-disable-browser-swipe-back";
import cmath from "@grida/cmath";

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

const x_marks: Tick[] = [{ pos: 50, color: "red", text: "50" }];

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
      <div className="fixed top-0 left-0 right-0 border-b bg-background cursor-ns-resize">
        <AxisRuler
          axis="x"
          width={typeof window === "undefined" ? 0 : window.innerWidth}
          height={24}
          zoom={zoom}
          offset={offset.x}
          ranges={x_ranges}
          marks={x_marks}
        />
      </div>
      <div className="fixed top-0 left-0 bottom-0 border-r bg-background cursor-ew-resize">
        <AxisRuler
          axis="y"
          width={24}
          height={typeof window === "undefined" ? 0 : window.innerHeight}
          zoom={zoom}
          offset={offset.y}
          ranges={y_ranges}
        />
      </div>
      <div className="fixed inset-0 -z-10">
        <div
          style={{
            transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px)`,
            transformOrigin: "0 0",
          }}
        >
          {rects.map((rect, i) => (
            <div
              key={i}
              className="absolute border border-primary pointer-events-none"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

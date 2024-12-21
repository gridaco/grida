import React from "react";
import useSnapGuide from "../hooks/use-snap-guide";
import { Crosshair } from "./crosshair";

export function SnapGuide() {
  const guide = useSnapGuide();

  if (!guide) return <></>;

  return (
    <div>
      {guide.x?.map((snap, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              position: "absolute",
              left: snap[0],
              top: snap[1],
              transform: "translate(-50%, -50%)",
              // background: "red",
            }}
          >
            <Crosshair />
          </div>
          <Rule axis="y" offset={snap[0]} />
        </React.Fragment>
      ))}
      {guide.y?.map((snap, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              position: "absolute",
              left: snap[0],
              top: snap[1],
              transform: "translate(-50%, -50%)",
              // background: "red",
            }}
          >
            <Crosshair />
          </div>
          <Rule axis="x" offset={snap[1]} />
        </React.Fragment>
      ))}
    </div>
  );
}

function Rule({
  axis,
  offset,
  width = 0.1,
}: {
  axis: "x" | "y";
  offset: number;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        transform:
          axis === "x" ? `translateY(${offset}px)` : `translateX(${offset}px)`,
        width: axis === "x" ? "100%" : width,
        height: axis === "y" ? "100%" : width,
        background: "red",
      }}
    />
  );
}

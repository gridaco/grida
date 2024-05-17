"use client";

import { PlusIcon } from "@radix-ui/react-icons";
import React from "react";

export function GridEditor() {
  return (
    <div className="relative w-full h-full">
      <GridGuide col={6} row={12} />
      <Grid col={6} row={12}>
        <GridAreaBlock x={[1, 7]} y={[4, 8]} z={1} debug>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed tempor
          dui eu risus sodales scelerisque. Pellentesque dui neque, scelerisque
          in faucibus a, ullamcorper sed orci. Etiam libero urna, sodales luctus
          lobortis et, porta in tellus.
        </GridAreaBlock>
        <GridAreaBlock x={[1, 7]} y={[12, 9]} z={2}>
          Lorem ipsum dolor sit amet
        </GridAreaBlock>
      </Grid>
    </div>
  );
}

const gridpos = (col: number, row: number, i: number) => {
  const x = i % col;
  const y = Math.floor(i / col);
  return [x, y] as const;
};

function GridGuide({
  col,
  row,
  debug,
}: {
  col: number;
  row: number;
  debug?: boolean;
}) {
  // <div
  //   style={{
  //     height: "852px",
  //     width: "calc(100% - 1px)",
  //     boxSizing: "border-box",
  //     pointerEvents: "none",
  //     position: "absolute",
  //     top: 0,
  //     left: 0,
  //     zIndex: -10,
  //     mixBlendMode: "difference",
  //     backgroundImage:
  //       "linear-gradient(rgba(255, 255, 255, 0.65) 0.51px, transparent 0.51px), linear-gradient(to right, rgba(255, 255, 255, 0.65) 0.51px, transparent 0.51px)",
  //     backgroundPosition: "-1px -1px",
  //     backgroundSize: "71px 71px",
  //   }}
  // ></div>
  return (
    <div
      className="w-full h-full z-10"
      style={{
        position: "absolute",
        display: "grid",
        gridTemplateColumns: `repeat(${col}, 1fr)`,
        gridTemplateRows: `repeat(${row}, 1fr)`,
        // height: "calc(var(--scale-factor) * 750)",
        // width: "calc(var(--scale-factor) * 375)",
        margin: "0px auto",
        border: "1px solid rgba(0, 0, 0, 0.1)",
      }}
    >
      {Array.from({ length: col * row }).map((_, i) => (
        <div
          key={i}
          className="hover:bg-pink-200/15"
          style={{
            border: "0.1px solid rgba(0, 0, 0, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {debug ? (
            <>
              <span className="text-xs font-mono opacity-20">
                {gridpos(col, row, i).join(",")}
              </span>
            </>
          ) : (
            <>
              <PlusIcon className="opacity-20" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function Grid({
  col,
  row,
  children,
}: React.PropsWithChildren<{
  col: number;
  row: number;
}>) {
  return (
    <div
      className="w-full h-full"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${col}, 1fr)`,
        gridTemplateRows: `repeat(${row}, 1fr)`,
        // height: "calc(var(--scale-factor) * 750)",
        // width: "calc(var(--scale-factor) * 375)",
        margin: "0px auto",
      }}
    >
      {children}
    </div>
  );
}

function GridAreaBlock({
  x,
  y,
  z,
  debug,
  children,
}: React.PropsWithChildren<{
  x: [number, number];
  y: [number, number];
  z?: number;
  debug?: boolean;
}>) {
  return (
    <div
      data-debug={debug}
      className="data-[debug='true']:bg-pink-300/20"
      style={{
        gridArea: y[0] + " / " + x[0] + " / " + y[1] + " / " + x[1],
        zIndex: z,
        overflow: "hidden",
        position: "relative",
        padding: "0px",
      }}
    >
      {children}
    </div>
  );
}

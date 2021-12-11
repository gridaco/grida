import React, { useRef, useState } from "react";
import { useSpring, animated } from "react-spring";
import { usePinch } from "@use-gesture/react";
import { Resizable } from "re-resizable";

export function InteractiveCanvas({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [scale, setScale] = useState(1);

  return (
    <div id="interactive-canvas" style={{ width: "100%", height: "100%" }}>
      <ScalableFrame onRescale={setScale} scale={scale}>
        <ResizableFrame scale={scale}>{children}</ResizableFrame>
      </ScalableFrame>
    </div>
  );
}

function ScalableFrame({
  children,
  scale,
  onRescale,
}: {
  scale: number;
  onRescale?: (scale: number) => void;
  children?: React.ReactNode;
}) {
  // const [{ xyzs }, set] = useSpring(() => ({ xyzs: [0, 0, 0, 100] }));
  const ref = useRef();

  usePinch(
    (state) => {
      const { offset } = state;
      const [scale] = offset;
      onRescale(scale);
    },
    { target: ref }
  );

  return (
    <div
      id="scale-event-listener"
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          // xyzs
          // .to((x, y, z, s): string => {
          //   return `translate3D(${x}px, ${y}px, 0) scale(${s / 100})`;
          // })
          // .get(),
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ResizableFrame({
  scale,
  children,
}: {
  scale: number;
  children?: React.ReactNode;
}) {
  return (
    <Resizable
      style={{
        overflow: "hidden",
      }}
      scale={scale}
    >
      {children}
    </Resizable>
  );
}

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useGesture } from "@use-gesture/react";
import { Resizable } from "re-resizable";
import { ZoomControl } from "./controller-zoom-control";

/**
 * A React Hook that returns a delta state.
 * When user completely stops interacting, after a short delay (600ms), set the value to false.
 * When user starts interacting, immidiately set the value to true.
 *
 * the condition rather if the user is currently interacting or not is set on higher level, which this function accepts the condition as a parameter.
 * @param interacting
 */
function useIsInteractingDelta(interacting: boolean) {
  throw new Error("Not implemented");
}

export function InteractiveCanvas({
  children,
  defaultSize,
}: {
  defaultSize: { width: number; height: number };
  children?: React.ReactNode;
}) {
  const __canvas_width = 800;
  const __canvas_height = 900;
  const __margin = 20;
  const __y_start =
    defaultSize.height < __canvas_height - __margin * 2
      ? (__canvas_height - defaultSize.height) / 2
      : __margin;
  const __initial_xy = [0, __y_start] as [number, number];
  const __initial_scale =
    defaultSize.width > __canvas_width
      ? (__canvas_width - __margin * 2) / defaultSize.width
      : 1;

  const [scale, setScale] = useState(__initial_scale);
  const [xy, setXY] = useState<[number, number]>(__initial_xy);

  const [isPanning, setIsPanning] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const isDeltaInteracting = isPanning || isZooming;

  const ref = useRef();

  useGesture(
    {
      onPinch: (state) => {
        setIsZooming(state.pinching);
        setScale(Math.max(scale + state.delta[0], 0.1));
      },
      onWheel: ({ delta: [x, y], wheeling }) => {
        setIsPanning(wheeling);
        setXY([xy[0] - x / scale, xy[1] - y / scale]);
      },
    },
    { target: ref }
  );

  return (
    <InteractiveCanvasWrapper id="interactive-canvas">
      <div
        id="event-listener"
        ref={ref}
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Controls>
          <ZoomControl
            onReset={() => {
              setScale(__initial_scale);
              setXY(__initial_xy);
            }}
            scale={scale}
            onChange={setScale}
          />
        </Controls>
        {/* <ScalingAreaStaticRoot> */}
        <TransformContainer
          scale={scale}
          xy={xy}
          isTransitioning={isDeltaInteracting}
        >
          <ResizableFrame defaultSize={defaultSize} scale={scale}>
            {children}
          </ResizableFrame>
        </TransformContainer>
        {/* </ScalingAreaStaticRoot> */}
      </div>
    </InteractiveCanvasWrapper>
  );
}

const InteractiveCanvasWrapper = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-grow: 1;
`;

const Controls = styled.div`
  z-index: 2;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
`;

const TransformContainer = ({
  scale,
  children,
  xy,
  isTransitioning,
}: {
  scale: number;
  xy: [number, number];
  isTransitioning: boolean;
  children: React.ReactNode;
}) => {
  return (
    <div
      style={{
        pointerEvents: isTransitioning ? "none" : undefined,
        transform: `scale(${scale}) translateX(${xy[0]}px) translateY(${xy[1]}px)`,
        willChange: "transform",
        transformOrigin: "top center",
      }}
    >
      {children}
    </div>
  );
};

function ResizableFrame({
  scale,
  children,
  defaultSize,
}: {
  defaultSize?: { width: number; height: number };
  scale: number;
  children?: React.ReactNode;
}) {
  return (
    <Resizable
      defaultSize={
        defaultSize ?? {
          width: 500,
          height: 500,
        }
      }
      scale={scale}
    >
      {children}
    </Resizable>
  );
}

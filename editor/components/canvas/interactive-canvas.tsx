import React, { useRef, useState } from "react";
import styled from "@emotion/styled";
import { usePinch } from "@use-gesture/react";
import { Resizable } from "re-resizable";
import { ZoomControl } from "./controller-zoom-control";

export function InteractiveCanvas({
  children,
  defaultSize,
}: {
  defaultSize: { width: number; height: number };
  children?: React.ReactNode;
}) {
  const [scale, setScale] = useState(1);

  return (
    <InteractiveCanvasWrapper id="interactive-canvas">
      <ScalableFrame onRescale={setScale} scale={scale}>
        <Controls>
          <ZoomControl scale={scale} onChange={setScale} />
        </Controls>
        <ScalingAreaStaticRoot>
          <ScalingArea scale={scale}>
            <ResizableFrame defaultSize={defaultSize} scale={scale}>
              {children}
            </ResizableFrame>
          </ScalingArea>
        </ScalingAreaStaticRoot>
      </ScalableFrame>
    </InteractiveCanvasWrapper>
  );
}

const InteractiveCanvasWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
`;

const Controls = styled.div`
  z-index: 2;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
`;

const ScalingAreaStaticRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  align-content: flex-start;
  align-self: stretch;
  flex: 1;
`;

function ScalableFrame({
  children,
  scale,
  onRescale,
}: {
  scale: number;
  onRescale?: (scale: number) => void;
  children?: React.ReactNode;
}) {
  const ref = useRef();

  usePinch(
    (state) => {
      const prevscale = scale;
      const { offset } = state;
      const thisscale = offset[0];
      // const newscale = thisscale - prevscale;
      onRescale(thisscale);
    },
    { target: ref }
  );

  return (
    <div
      id="scale-event-listener"
      ref={ref}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        alignItems: "center",
        alignContent: "center",
      }}
    >
      {children}
    </div>
  );
}

const ScalingArea = ({
  scale,
  children,
}: {
  scale: number;
  children: React.ReactNode;
}) => {
  return (
    <div
      style={{
        transform: `scale(${scale})`,
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

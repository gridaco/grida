import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useGesture } from "@use-gesture/react";
import useMeasure from "react-use-measure";
import { Resizable } from "re-resizable";
import { ZoomControl } from "./controller-zoom-control";
import { colors } from "theme";
import { RunnerLoadingIndicator } from "components/app-runner/loading-indicator";
import { ReloadIcon, EnterFullScreenIcon } from "@radix-ui/react-icons";
// TODO:
// - add gesture debounce

type Size = { width: number; height: number };
function initialTransform(
  canvas: Size,
  frame: Size,
  margin: number
): InitialTransform {
  const __canvas_width = canvas.width;
  const __canvas_height = canvas.height;
  const __margin_2x = margin * 2;
  const __initial_scale =
    frame.width > __canvas_width
      ? (__canvas_width - __margin_2x) / frame.width
      : 1;
  const __height_fits_in_canvas =
    frame.height * __initial_scale < __canvas_height - __margin_2x;
  const __initial_transform_origin = __height_fits_in_canvas
    ? "center"
    : "top center";
  const __scaled_display_height = frame.height * __initial_scale;
  const __y_start = __height_fits_in_canvas
    ? __initial_transform_origin === "top center"
      ? (__canvas_height - __margin_2x - __scaled_display_height) / 2
      : margin
    : margin;
  const __initial_xy = [0, __y_start] as [number, number];

  return {
    scale: __initial_scale,
    xy: __initial_xy,
    transformOrigin: __initial_transform_origin,
  };
}

type InitialTransform = {
  scale: number;
  xy: [number, number];
  transformOrigin: string;
};

export function IsolatedCanvas({
  children,
  defaultSize,
  building = false,
  onFullscreen,
  onReload,
}: {
  defaultSize: { width: number; height: number };
  children?: React.ReactNode;
  building?: boolean;
  onFullscreen?: () => void;
  onReload?: () => void;
}) {
  const _margin = 20;
  const [canvasSizingRef, canvasBounds] = useMeasure();
  const [initial, setInitial] = useState(
    initialTransform(canvasBounds, defaultSize, _margin)
  );
  const [hasUserOverride, setHasUserOverride] = useState(false);

  useEffect(() => {
    if (canvasBounds.width !== 0 && canvasBounds.height !== 0) {
      const i = initialTransform(canvasBounds, defaultSize, _margin);
      setInitial(i); // setup new initial
      if (!hasUserOverride) {
        setScale(i.scale);
        setXY(i.xy);
        setTransformOrigin(i.transformOrigin);
      }
    }
  }, [canvasBounds.width, canvasBounds.height]);

  const [scale, setScale] = useState(initial.scale);
  const [xy, setXY] = useState<[number, number]>(initial.xy);
  const [transformOrigin, setTransformOrigin] = useState(
    initial.transformOrigin
  );

  const [isPanning, setIsPanning] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const isDeltaInteracting = isPanning || isZooming; //useIsInteractingDelta();

  const interactionEventTargetRef = useRef();

  useGesture(
    {
      onPinch: (state) => {
        setHasUserOverride(true);
        setIsZooming(state.pinching);
        setScale(Math.max(scale + state.delta[0], 0.1));
      },
      onWheel: ({ delta: [x, y], wheeling }) => {
        setHasUserOverride(true);
        setIsPanning(wheeling);
        setXY([xy[0] - x / scale, xy[1] - y / scale]);
      },
    },
    { target: interactionEventTargetRef }
  );

  return (
    <InteractiveCanvasWrapper ref={canvasSizingRef} id="interactive-canvas">
      <div
        id="event-listener"
        ref={interactionEventTargetRef}
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <Controls>
          <ZoomControl
            canReset={hasUserOverride}
            onReset={() => {
              setScale(initial.scale);
              setXY(initial.xy);
              setHasUserOverride(false);
            }}
            scale={scale}
            onChange={setScale}
          />
          {onFullscreen && (
            <ActionButton onClick={onFullscreen}>
              <EnterFullScreenIcon />
            </ActionButton>
          )}
          {onReload && (
            <ActionButton onClick={onReload}>
              <ReloadIcon />
            </ActionButton>
          )}
        </Controls>
        {/* <ScalingAreaStaticRoot> */}
        <TransformContainer
          scale={scale}
          xy={xy}
          transformOrigin={transformOrigin}
          isTransitioning={isDeltaInteracting}
        >
          <ResizableFrame defaultSize={defaultSize} scale={scale}>
            {children}
          </ResizableFrame>
        </TransformContainer>
        {/* </ScalingAreaStaticRoot> */}
      </div>
      {building && (
        <div
          style={{
            position: "absolute",
            width: 32,
            height: 32,
            right: 32,
            bottom: 32,
            zIndex: 9,
          }}
        >
          <RunnerLoadingIndicator size={32} />
        </div>
      )}
    </InteractiveCanvasWrapper>
  );
}

const ActionButton = styled.button`
  align-self: center;
  background-color: ${colors.color_editor_bg_on_dark};
  box-shadow: ${colors.color_editor_bg_on_dark} 0px 0px 0px 16px inset;
  outline: none;
  border: none;
  cursor: pointer;
  color: white;
  /* border-radius: 4px; */
  height: 24px;
`;

const InteractiveCanvasWrapper = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  align-items: stretch;
  flex-grow: 1;
`;

const Controls = styled.div`
  position: relative;
  top: 16px;
  z-index: 2;
  background-color: ${colors.color_editor_bg_on_dark};
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  border-radius: 32px;
  padding-right: 16px;
  box-shadow: 0px 0px 24px 4px rgba(0, 0, 0, 0.2);
`;

const TransformContainer = ({
  scale,
  children,
  xy,
  isTransitioning,
  transformOrigin = "top center",
}: {
  transformOrigin?: string;
  scale: number;
  xy: [number, number];
  isTransitioning: boolean;
  children: React.ReactNode;
}) => {
  return (
    <div
      style={{
        pointerEvents: isTransitioning ? "none" : undefined,
        transform: `scale(${scale}) translate3d(${xy[0]}px, ${xy[1]}px, 0)`,
        willChange: "transform",
        transformOrigin: transformOrigin,
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
      style={{
        overflow: "hidden",
        borderRadius: 4,
        boxShadow: "0px 0px 48px 4px rgba(0, 0, 0, 0.25)",
      }}
      scale={scale}
    >
      {children}
    </Resizable>
  );
}

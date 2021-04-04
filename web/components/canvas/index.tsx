import React, {
  CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Stage } from "../../../packages/nothing/packages/skia-backend";
import styled from "@emotion/styled";
import { useRecoilValue } from "recoil";
import { currentInsetLayer } from "state/demo";
interface CanvasStyledProps {
  cursor?: CSSProperties["cursor"];
  left?: CSSProperties["left"];
}

function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: undefined,
    height: undefined,
  });

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener("resize", handleResize);

    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowSize;
}

function createRect(initialPoint, finalPoint) {
  return {
    width: Math.abs(finalPoint.x - initialPoint.x),
    height: Math.abs(finalPoint.y - initialPoint.y),
    x: Math.min(finalPoint.x, initialPoint.x),
    y: Math.min(finalPoint.y, initialPoint.y),
  };
}

function getXYLocation(event: MouseEvent) {
  return { x: Math.round(event.offsetX), y: Math.round(event.offsetY) };
}

function SkiaComposition() {
  return (
    <cg-rect
      fTop={0}
      fRight={0}
      fBottom={50}
      fLeft={50}
      paint={{ color: "#fff" }}
    />
  );
}

let startLocation = {};

function Canvas() {
  const wrapperRef = useRef(undefined);

  const [cursorRect, setCursorRect] = useState(null);
  const [isClicked, setIsClicked] = useState(false);
  const currentLayer = useRecoilValue(currentInsetLayer);
  const { width, height } = useWindowSize();

  const cursorType = useCallback((): CSSProperties["cursor"] => {
    switch (currentLayer) {
      case "insert-frame":
      case "insert-rect":
      case "insert-circle":
      case "insert-text":
        return "crosshair";
    }
  }, [currentLayer]);

  const mouseUp = (e: React.PointerEvent) => {
    const XYLocation = getXYLocation(e.nativeEvent);
    setIsClicked(false);
  };

  const mouseDown = (e) => {
    const XYLocation = getXYLocation(e.nativeEvent);
    console.log("D", XYLocation);
    startLocation = XYLocation;
    setIsClicked(true);
  };

  const mouseMove = (e) => {
    const XYLocation = getXYLocation(e.nativeEvent);

    wrapperRef.current?.setPointerCapture(e.pointerId);
    isClicked && setCursorRect(createRect(startLocation, XYLocation));
  };

  return (
    <Wrapper
      ref={wrapperRef}
      cursor={cursorType()}
      onPointerDown={mouseDown}
      onPointerMove={mouseMove}
      onPointerUp={mouseUp}
    >
      <SkiaCanvas width={width} height={height - 55}>
        {/* <cg-canvas>
          <SkiaComposition />
        </cg-canvas> */}
        <cg-canvas>
          {cursorRect && (
            <cg-rect
              fBottom={cursorRect.width + cursorRect.y}
              fTop={cursorRect.y}
              fLeft={cursorRect.x}
              fRight={cursorRect.height + cursorRect.x}
            />
          )}
        </cg-canvas>
      </SkiaCanvas>
    </Wrapper>
  );
}

export default Canvas;

const Wrapper = styled.div<CanvasStyledProps>`
  flex: 1;
  position: relative;
  cursor: ${(p) => p.cursor};
`;

const SkiaCanvas = styled(Stage)<CanvasStyledProps>`
  position: absolute;
  top: 0;
  left: -250px;
`;

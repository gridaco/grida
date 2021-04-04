import React, { CSSProperties, useCallback, useEffect, useRef } from "react";
import { Stage } from "../../../packages/nothing/packages/skia-backend";
import styled from "@emotion/styled";
import { useRecoilValue } from "recoil";
import { currentInsetLayer } from "state/demo";
interface CanvasStyledProps {
  cursor?: CSSProperties["cursor"];
  left?: CSSProperties["left"];
}

function SkiaComposition() {
  return (
    <cg-canvas>
      <cg-rect fTop={0} fRight={0} fBottom={50} fLeft={50} paint={{ color: "#fff" }} />
    </cg-canvas>
  );
}

function Canvas() {
  const wrapperRef = useRef(undefined);
  const currentLayer = useRecoilValue(currentInsetLayer);

  const cursorType = useCallback((): CSSProperties["cursor"] => {
    switch (currentLayer) {
      case "insert-frame":
      case "insert-rect":
      case "insert-circle":
      case "insert-text":
        return "crosshair";
    }
  }, [currentLayer]);

  const mouseUp = useCallback(
    (e) => {
      wrapperRef.current?.releasePointerCapture(e.pointerId);
    },
    [currentLayer]
  );

  const mouseDown = useCallback(
    (e) => {
      wrapperRef.current?.releasePointerCapture(e.pointerId);
    },
    [currentLayer]
  );

  const mouseMove = useCallback(
    (e) => {
      wrapperRef.current?.releasePointerCapture(e.pointerId);
    },
    [currentLayer]
  );

  return (
    <Wrapper
      ref={wrapperRef}
      cursor={cursorType()}
      onPointerDown={mouseDown}
      onPointerMove={mouseMove}
      onPointerUp={mouseUp}
    >
      <SkiaCanvas width={1000} height={100}>
        <SkiaComposition />
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

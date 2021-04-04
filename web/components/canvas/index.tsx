import React, { CSSProperties, useCallback, useRef } from "react";
import { Stage } from "../../../packages/nothing/packages/skia-backend";
import styled from "@emotion/styled";
import { useRecoilValue } from "recoil";
import { currentInsetLayer } from "state/demo";

interface CanvasStyledProps {
  cursor?: CSSProperties["cursor"];
}

function SkiaComposition() {
  return <cg-canvas>
    <cg-rect fBottom={50} fLeft={50} fRight={0} fTop={0} />
  </cg-canvas>;
}

function Canvas() {
  const wrapperRef = useRef(null);
  const currentLayer = useRecoilValue(currentInsetLayer);

  const cursorType = useCallback((): CSSProperties["cursor"] => {
    switch (currentLayer) {
      case "insert-frame":
      case "insert-rect":
      case "insert-circle":
      case "insert-text":
        return "crosshair";
    }
    return "zoom-out";
  }, [currentLayer]);

  const mouseHandler = useCallback(
    (e) => {
      wrapperRef.current?.releasePointerCapture(e.pointerId);
    },
    [currentLayer]
  );

  return (
    <Wrapper
      ref={wrapperRef}
      cursor={cursorType()}
      onPointerDown={mouseHandler}
      onPointerMove={mouseHandler}
      onPointerUp={mouseHandler}
    >
      <Stage width={600} height={600}>
        <SkiaComposition />
      </Stage>
    </Wrapper>
  );
}

export default Canvas;

const Wrapper = styled.div<CanvasStyledProps>`
  flex: 1;
  position: relative;
  cursor: ${(p) => p.cursor};
  background-color: #fff;
`;

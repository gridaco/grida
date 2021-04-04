import React, { useCallback } from "react";
// import { Stage } from "../../../packages/nothing/packages/skia-backend";
import styled from "@emotion/styled";

interface CanvasStyledProps {
  cursor?:
    | "grabbing"
    | "grab"
    | "crosshair"
    | "default"
    | "ew-resize"
    | "ns-resize"
    | "nesw-resize"
    | "nwse-resize";
}

function SkiaComposition() {
  // return <cg-canvas></cg-canvas>;
}

function Canvas() {
  const mouseHandler = useCallback((e) => console.log(e), []);
  return (
    <Wrapper
      onPointerDown={mouseHandler}
      onPointerMove={mouseHandler}
      onPointerUp={mouseHandler}
    >
      {/* <Stage width={0} height={0}>
        <SkiaComposition />
      </Stage> */}
    </Wrapper>
  );
}

export default Canvas;

const Wrapper = styled.div<CanvasStyledProps>`
  flex: 1;
  position: relative;
  cursor: ${(p) => p.cursor};
`;

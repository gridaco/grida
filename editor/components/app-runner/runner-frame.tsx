import React, { useRef } from "react";
import { usePinch } from "@use-gesture/react";

export function RunnerFrame() {
  const ref = useRef();
  usePinch(
    (state) => {
      const { pinching, last } = state;
    },
    { domTarget: ref }
  );

  return (
    <div ref={ref}>
      <p>content</p>
    </div>
  );
}

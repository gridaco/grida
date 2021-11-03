import React from "react";
import PIP from "./pip";
import { ResizableBox } from "react-resizable";
import "react-resizable/css/styles.css";
import type { ResizableBoxProps as RawResizableBoxProps } from "react-resizable";
import styled from "@emotion/styled";

interface ResizableBoxProps
  extends Omit<RawResizableBoxProps, "width" | "height"> {
  /**
   * axis to allow resize to
   * @default "both"
   */
  axis?: "x" | "y" | "both" | "none";

  /**
   * resize handle to display - a react component
   * @default none
   */
  resizeHandle?: React.ReactNode;
  /**
   * @default 500
   */
  width?: number;
  /**
   * @default 500
   */
  height?: number;
  /**
   * @default [300, 300]
   */
  minConstraints?: [number, number];
  /**
   * @default [800, 800]
   */
  maxConstraints?: [number, number];
}

type ResizablePIPProps = {
  children?: React.ReactNode;
} & ResizableBoxProps;

function ResizablePIP({
  children,
  axis = "both",
  resizeHandle,
  width = 500,
  height = 500,
  minConstraints = [300, 300],
  maxConstraints = [800, 800],
  ...otherResizableProps
}: ResizablePIPProps) {
  return (
    <PIP>
      <StyledResizableBox
        draggableOpts={{
          onMouseDown: (e) => {
            e.stopPropagation();
          },
        }}
        {...otherResizableProps}
        axis={axis}
        handle={resizeHandle}
        width={width}
        height={height}
        minConstraints={minConstraints}
        maxConstraints={maxConstraints}
      >
        {children}
      </StyledResizableBox>
    </PIP>
  );
}

const StyledResizableBox = styled(ResizableBox)`
  overflow: auto;
`;

export default ResizablePIP;

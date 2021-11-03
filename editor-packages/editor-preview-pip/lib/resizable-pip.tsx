import React from "react";
import PIP from "./PIP";
import { ResizableBox } from "react-resizable";
import styled from "@emotion/styled";

function ResizablePIP({
  children,
  width = 500,
  height = 500,
  minConstraints = [300, 300],
  maxConstraints = [800, 800],
}: {
  children?: React.ReactNode;
  width?: number;
  height?: number;
  minConstraints?: [number, number];
  maxConstraints?: [number, number];
}) {
  return (
    <div>
      <PIP>
        <StyledResizableBox
          width={width}
          height={height}
          minConstraints={minConstraints}
          maxConstraints={maxConstraints}
        >
          {children}
        </StyledResizableBox>
      </PIP>
    </div>
  );
}

const StyledResizableBox = styled(ResizableBox)`
  background: #202429;
  margin: 20px;
  border-radius: 0.28571429rem;
  overflow: auto;

  :hover {
    cursor: default;
  }
`;

export default ResizablePIP;

import React from "react";
import Draggable from "react-draggable";
import styled from "@emotion/styled";

interface DraggingBoxStyle {
  outline: string;
  outlineColor: string;
  outlineStyle: string;
  outlineWidth: number | string;
}

const unit = (u: string | number) => {
  if (typeof u === "number") {
    return `${u}px`;
  }
  return u;
};

function PIP({
  children,
  zIndex = 100,
  boxShadow = "1px 3px 3px 0 rgb(0 0 0 / 20%), 1px 3px 15px 2px rgb(0 0 0 / 20%)",
  borderRadius = "0.3rem",
  hoverCursor = "grab",
  draggingCursor = "grabbing",
  backgroundColor = "#242d36",
  draggingStyle = {
    outline: "-webkit-focus-ring-color auto 1px",
    outlineColor: "-webkit-focus-ring-color",
    outlineStyle: "auto",
    outlineWidth: 1,
  },
}: {
  children: React.ReactNode;
  /**
   * @default 100
   */
  zIndex?: number;
  /**
   * boxshadow css as string
   * @default "1px 3px 3px 0 rgb(0 0 0 / 20%), 1px 3px 15px 2px rgb(0 0 0 / 20%)"
   */
  boxShadow?: string;
  /**
   * px in number or other unit (e.g. rem) as string
   * @default "0.3rem"
   */
  borderRadius?: string | number;
  /**
   * @default grab
   */
  hoverCursor?: string;
  /**
   * @default grabbing
   */
  draggingCursor?: string;
  draggingStyle?: DraggingBoxStyle;
  /**
   * @default #242d36
   */
  backgroundColor?: string;
}) {
  return (
    <Draggable>
      <PipWindow
        borderRadius={borderRadius}
        boxShadow={boxShadow}
        zIndex={zIndex}
        hoverCursor={hoverCursor}
        draggingCursor={draggingCursor}
        draggingStyle={draggingStyle}
        backgroundColor={backgroundColor}
      >
        {children}
      </PipWindow>
    </Draggable>
  );
}

const PipWindow = styled.div<{
  zIndex: number;
  boxShadow: string;
  borderRadius: string | number;
  hoverCursor: string;
  draggingCursor: string;
  draggingStyle: DraggingBoxStyle;
  backgroundColor: string;
}>`
  background-color: ${(props) => props.backgroundColor};
  z-index: ${(props) => props.zIndex};
  position: fixed;
  color: rgb(248, 248, 249);
  box-sizing: content-box;
  box-shadow: ${(props) => props.boxShadow};
  border-radius: ${(props) => unit(props.boxShadow)};

  :hover {
    cursor: ${(props) => props.hoverCursor};
  }

  :active {
    cursor: ${(props) => props.draggingCursor};
    outline: ${(props) => props.draggingStyle.outline};
    outline-color: ${(props) => props.draggingStyle.outlineColor};
    outline-style: ${(props) => props.draggingStyle.outlineStyle};
    outline-width: ${(props) => unit(props.draggingStyle.outlineWidth)};
  }
`;

export default PIP;

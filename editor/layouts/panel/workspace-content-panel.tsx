import React, { CSSProperties } from "react";
import styled from "@emotion/styled";
import { Resizable, ResizableProps } from "re-resizable";
/**
 * Wrapper for WorkspaceContentPanelGridLayout
 * @param props
 * @returns
 */
export function WorkspaceContentPanel({
  children,
  disableBorder = true,
  flex = 1,
  zIndex,
  overflow = "auto",
  backgroundColor = "none",
  hidden = false,
  resize = {
    top: false,
    right: false,
    bottom: false,
    left: false,
  },
  minWidth = 0,
}: {
  children: JSX.Element;
  hidden?: boolean;
} & Omit<WorkspaceCPanelStyleProps, "display"> & {
    resize?: ResizableProps["enable"];
    minWidth?: number;
  }) {
  const [oflex, setOFlex] = React.useState(flex);

  return (
    <StyledResizable
      enable={resize}
      handleClasses={{
        top: "handle",
        right: "handle",
        bottom: "handle",
        left: "handle",
      }}
      onResizeStart={() => setOFlex(undefined)}
      onResize={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }}
      minWidth={minWidth}
      style={{
        minWidth: minWidth,
        border: disableBorder ? "none" : "solid #d2d2d2",
        backgroundColor: backgroundColor,
        borderWidth: 1,
        alignSelf: "stretch",
        flex: oflex,
        overflow: overflow,
        display: hidden ? "none" : undefined,
        zIndex: zIndex ?? 0,
      }}
    >
      {children}
    </StyledResizable>
  );
}

type WorkspaceCPanelStyleProps = {
  flex?: number;
  overflow?: CSSProperties["overflow"];
  backgroundColor?: string;
  disableBorder?: boolean;
  zIndex?: number;
  display: "none" | undefined;
};

// @ts-ignore
const StyledResizable = styled(Resizable)`
  .handle {
    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    &:active {
      background-color: rgba(255, 255, 255, 0.2);
    }
    transition: background-color 0.1s ease-in-out;
  }
`;

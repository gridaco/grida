import React, { CSSProperties } from "react";
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
    <Resizable
      enable={resize}
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
    </Resizable>
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

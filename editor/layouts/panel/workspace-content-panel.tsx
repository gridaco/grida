import { css, jsx } from "@emotion/react";
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
}: {
  children: JSX.Element;
  hidden?: boolean;
} & Omit<WorkspaceCPanelStyleProps, "display"> & {
    resize?: ResizableProps["enable"];
  }) {
  const [oflex, setOFlex] = React.useState(flex);

  return (
    <Resizable
      enable={resize}
      onResizeStart={() => setOFlex(undefined)}
      style={{
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

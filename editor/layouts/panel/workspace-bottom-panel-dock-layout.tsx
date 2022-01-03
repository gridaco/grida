import styled from "@emotion/styled";
import React, { useState } from "react";
import { Resizable } from "re-resizable";

/**
 * bottom docked layout. its content displays as row
 * Wrapper for WorkspaceContentPanelGridLayout
 * @param props
 * @returns
 */
export function WorkspaceBottomPanelDockLayout(props: {
  children: JSX.Element | JSX.Element[];
  resizable?: boolean;
}) {
  const [height, setHeight] = useState(300);

  const body = props.children;
  return props.resizable ? (
    <Resizable
      size={{
        height: height,
        width: "100%",
      }}
      enable={{
        top: true,
        bottom: false,
        left: false,
        right: false,
      }}
      defaultSize={{ height: height, width: "100%" }}
      onResize={(e, direction, ref, d) => {
        setHeight(height + d.height);
      }}
    >
      <DockRootWrap>{body}</DockRootWrap>
    </Resizable>
  ) : (
    <DockRootWrap>{body}</DockRootWrap>
  );
}

const DockRootWrap = styled.div`
  align-self: stretch;
  display: flex;
  flex-direction: row;
`;

import styled from "@emotion/styled";
import React from "react";

/**
 * bottom docked layout. its content displays as row
 * Wrapper for WorkspaceContentPanelGridLayout
 * @param props
 * @returns
 */
export function WorkspaceBottomPanelDockLayout(props: {
  children: JSX.Element | JSX.Element[];
}) {
  return <DockRootWrap>{props.children}</DockRootWrap>;
}

const DockRootWrap = styled.div`
  display: flex;
  flex-direction: row;
`;

import styled from "@emotion/styled";
import React from "react";

/**
 * Wrapper for WorkspaceContentPanelGridLayout
 * @param props
 * @returns
 */
export function WorkspaceContentPanel(props: { children: JSX.Element }) {
  return <Container>{props.children}</Container>;
}

const Container = styled.div`
  border: solid #d2d2d2;
  border-width: 1px;
  align-self: stretch;
  flex: 1;
  overflow: auto;
`;

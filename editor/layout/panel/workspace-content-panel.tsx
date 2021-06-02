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
  border: solid #181a22;
  border-width: 1px;
  align-self: stretch;
  flex: 1;
  background: #2a2e39;
`;

import styled from "@emotion/styled";
import React from "react";

/**
 * Wrapper for WorkspaceContentPanelGridLayout
 * @param props
 * @returns
 */
export function WorkspaceContentPanel({
  children,
  disableBorder = false,
}: {
  children: JSX.Element;
  disableBorder?: boolean;
}) {
  return <Container disableBorder={disableBorder}>{children}</Container>;
}

const Container = styled.div<{ disableBorder: boolean }>`
  border: ${(p) => (p.disableBorder ? "none" : "solid #d2d2d2")};
  border-width: 1px;
  align-self: stretch;
  flex: 1;
  overflow: auto;
`;

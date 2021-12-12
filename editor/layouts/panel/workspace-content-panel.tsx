import styled from "@emotion/styled";
import React from "react";

/**
 * Wrapper for WorkspaceContentPanelGridLayout
 * @param props
 * @returns
 */
export function WorkspaceContentPanel({
  children,
  disableBorder = true,
  backgroundColor = "none",
}: {
  backgroundColor?: string;
  children: JSX.Element;
  disableBorder?: boolean;
}) {
  return (
    <WorkspaceCPanel
      backgroundColor={backgroundColor}
      disableBorder={disableBorder}
    >
      {children}
    </WorkspaceCPanel>
  );
}

const WorkspaceCPanel = styled.div<{
  backgroundColor: string;
  disableBorder: boolean;
}>`
  border: ${(p) => (p.disableBorder ? "none" : "solid #d2d2d2")};
  background-color: ${(p) => p.backgroundColor};
  border-width: 1px;
  align-self: stretch;
  flex: 1;
  overflow: auto;
`;

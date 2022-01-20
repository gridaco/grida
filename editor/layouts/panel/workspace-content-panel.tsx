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
  flex = 1,
  zIndex,
  backgroundColor = "none",
}: {
  backgroundColor?: string;
  children: JSX.Element;
  disableBorder?: boolean;
  flex?: number;
  zIndex?: number;
}) {
  return (
    <WorkspaceCPanel
      flex={flex}
      zIndex={zIndex}
      backgroundColor={backgroundColor}
      disableBorder={disableBorder}
    >
      {children}
    </WorkspaceCPanel>
  );
}

const WorkspaceCPanel = styled.div<{
  flex?: number;
  backgroundColor: string;
  disableBorder: boolean;
  zIndex?: number;
}>`
  border: ${(p) => (p.disableBorder ? "none" : "solid #d2d2d2")};
  background-color: ${(p) => p.backgroundColor};
  border-width: 1px;
  align-self: stretch;
  flex: ${(p) => p.flex};
  overflow: auto;
  z-index: ${(p) => p.zIndex ?? 0};
`;

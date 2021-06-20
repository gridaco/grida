import React, { useMemo } from "react";
import styled from "@emotion/styled";
import "@editor-ui/theme";

import { BarDragArea } from "@editor-ui/desktop-titlebar";
import { SideNavigationPagesHierarchySegment } from "./side-navigation-pages-hierarchy-segment";
import { AddPageButton } from "../add-page-button";

interface SideNavigationProps {
  /**
   * specifies rather to enable top draggable area for mac frameless app.
   */
  top: boolean;
  controlDoubleClick: () => void;
}

export function SideNavigation(props: SideNavigationProps) {
  return (
    <SideNavigationRootWrapper>
      {/* non footer */}
      <SideNavigationNonFooterWrapper>
        <BarDragArea
          controlDoubleClick={props.controlDoubleClick}
          enabled={props.top}
        />
        <SideNavigationPagesHierarchySegment />
      </SideNavigationNonFooterWrapper>
      {/* footer */}
      <SideNavigationFooterWrapper>
        <AddPageButton />
      </SideNavigationFooterWrapper>
    </SideNavigationRootWrapper>
  );
}

const SideNavigationRootWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  height: 100%;
`;

const SideNavigationNonFooterWrapper = styled.div`
  flex: 1;
`;

const SideNavigationFooterWrapper = styled.div`
  position: relative;
  bottom: 0px;
  align-self: stretch;
`;

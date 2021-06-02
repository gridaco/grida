import React from "react";
import { WorkspaceContentPanel } from "./workspace-content-panel";
import styled from "@emotion/styled";

export function WorkspaceContentPanelGridLayout(props: {
  children: JSX.Element | JSX.Element[];
}) {
  const onlyPanelChilds = () => {
    return React.Children.map(props.children, (child) => {
      if (child.type == WorkspaceContentPanel) {
        return <PanelItemWrap>{child}</PanelItemWrap>;
      }
    });
  };

  return <GridRoot>{onlyPanelChilds()}</GridRoot>;
}

const GridRoot = styled.div`
  display: flex;
  flex-direction: row;
`;

const PanelItemWrap = styled.div``;

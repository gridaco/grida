import React from "react";
import { WorkspaceContentPanel } from "./workspace-content-panel";
import { WorkspaceBottomPanelDockLayout } from "./workspace-bottom-panel-dock-layout";
import styled from "@emotion/styled";

export function WorkspaceContentPanelGridLayout(props: {
  children: JSX.Element | JSX.Element[];
}) {
  const onlyPanelChilds = () => {
    const primaryContentPanels = [];
    const bottomDockedPanels = [];
    React.Children.forEach(props.children, (child) => {
      if (child.type == WorkspaceContentPanel) {
        primaryContentPanels.push(<PanelItemWrap>{child}</PanelItemWrap>);
      } else if (child.type == WorkspaceBottomPanelDockLayout) {
        bottomDockedPanels.push(<PanelItemWrap>{child}</PanelItemWrap>);
      }
    });

    return (
      <RootLayout>
        <PrimaryContentGridRoot>{primaryContentPanels}</PrimaryContentGridRoot>
        <DockedContentGridRoot>{bottomDockedPanels}</DockedContentGridRoot>
      </RootLayout>
    );
  };

  return <>{onlyPanelChilds()}</>;
}

const RootLayout = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
`;

const DockedContentGridRoot = styled.div`
  min-height: 300px;
  position: absolute;
  background: black;
  bottom: 0px;
`;

const PrimaryContentGridRoot = styled.div`
  align-self: stretch;
  align-items: stretch;
  display: flex;
  flex-direction: row;
`;

const PanelItemWrap = styled.div``;

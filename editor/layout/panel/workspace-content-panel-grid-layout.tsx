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
        primaryContentPanels.push(child);
      } else if (child.type == WorkspaceBottomPanelDockLayout) {
        bottomDockedPanels.push(child);
      }
    });

    return (
      <Container>
        {primaryContentPanels.length > 0 && (
          <UpperContent>
            <PrimaryContentGridRoot>
              {primaryContentPanels}
            </PrimaryContentGridRoot>
          </UpperContent>
        )}
        {bottomDockedPanels.length > 0 && (
          <BottomDockedContent>
            <DockedContentGridRoot>{bottomDockedPanels}</DockedContentGridRoot>
          </BottomDockedContent>
        )}
      </Container>
    );
  };

  return <>{onlyPanelChilds()}</>;
}

const Container = styled.div`
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
`;

const UpperContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;

  flex: 1;
`;

const BottomDockedContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;

  height: 60px;
`;

const PanelLayoutItemsContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const DockedContentGridRoot = styled.div`
  min-height: 300px;
  bottom: 0px;
  flex: 0;
`;

const PrimaryContentGridRoot = styled.div`
  flex: 1;
  overflow-y: scroll;
  justify-content: space-between;
  align-self: stretch;
  align-items: stretch;
  display: flex;
  flex-direction: row;
`;

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
      <Slot_Container>
        {primaryContentPanels.length > 0 && (
          <Slot_NonDockedContent>
            <PrimaryContentGridRoot>
              {primaryContentPanels}
            </PrimaryContentGridRoot>
          </Slot_NonDockedContent>
        )}
        {bottomDockedPanels.length > 0 && (
          <Slot_BottomDockedContent>
            <DockedContentGridRoot>{bottomDockedPanels}</DockedContentGridRoot>
          </Slot_BottomDockedContent>
        )}
      </Slot_Container>
    );
  };

  return <>{onlyPanelChilds()}</>;
}

const Slot_Container = styled.div`
  height: 100%;
  min-height: 100%;
  display: flex;
  align-items: stretch;
  flex-direction: column;
`;

const Slot_NonDockedContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const Slot_BottomDockedContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  margin-top: auto;
  min-height: 150px;
`;

const PanelLayoutItemsContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const DockedContentGridRoot = styled.div`
  /* display: flex; */
  min-height: 150px;
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

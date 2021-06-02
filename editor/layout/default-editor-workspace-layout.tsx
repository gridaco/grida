import styled from "@emotion/styled";
import React from "react";
import { AppMenu } from "./app-menu";

export function DefaultEditorWorkspaceLayout(props: {
  leftbar: JSX.Element;
  children: JSX.Element | Array<JSX.Element>;
}) {
  return (
    <WorkspaceRoot>
      <AppBarMenuAndBelowContentWrap>
        <AppBarWrap>
          <AppMenu />
        </AppBarWrap>
        <NonMenuContentZoneWrap>
          <PanelLeftSideWrap>{props.leftbar}</PanelLeftSideWrap>
          <ChildrenContainerRoot>{props.children}</ChildrenContainerRoot>
        </NonMenuContentZoneWrap>
      </AppBarMenuAndBelowContentWrap>
    </WorkspaceRoot>
  );
}

const WorkspaceRoot = styled.div`
  width: 100vw;
  height: 100vh;
`;

const AppBarMenuAndBelowContentWrap = styled.div`
  min-height: 100%;
  display: flex;
  flex-direction: column;
`;

const AppBarWrap = styled.div`
  flex-grow: 0;
`;

const NonMenuContentZoneWrap = styled.div`
  flex-grow: 1;
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;

const PanelLeftSideWrap = styled.div`
  flex-grow: 0;
  min-height: 100%;
`;

const ChildrenContainerRoot = styled.div`
  flex: 1;
  height: 100%;
`;

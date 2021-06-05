import styled from "@emotion/styled";
import React from "react";
import { AppMenu } from "./app-menu";

export function DefaultEditorWorkspaceLayout(props: {
  leftbar?: JSX.Element;
  rightbar?: JSX.Element;
  children: JSX.Element | Array<JSX.Element>;
}) {
  return (
    <WorkspaceRoot>
      <AppBarMenuAndBelowContentWrap>
        <AppBarWrap>
          <AppMenu />
        </AppBarWrap>
        <NonMenuContentZoneWrap>
          {props.leftbar && (
            <PanelLeftSideWrap>{props.leftbar}</PanelLeftSideWrap>
          )}
          <ChildrenContainerRoot>{props.children}</ChildrenContainerRoot>
          {props.rightbar && (
            <PanelRightSideWrap>{props.rightbar}</PanelRightSideWrap>
          )}
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
  max-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const AppBarWrap = styled.div`
  flex-grow: 0;
  background: grey;
`;

const NonMenuContentZoneWrap = styled.div`
  min-height: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;

const PanelLeftSideWrap = styled.div`
  flex-grow: 0;
  min-height: 100%;
  max-height: 100%;
  max-width: 400px;
  overflow: auto;
`;

const PanelRightSideWrap = styled.div`
  flex-grow: 0;
  min-height: 100%;
`;

const ChildrenContainerRoot = styled.div`
  flex: 1;
  min-height: 100%;
`;

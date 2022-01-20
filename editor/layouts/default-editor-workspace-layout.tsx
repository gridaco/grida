import styled from "@emotion/styled";
import React from "react";
import { AppMenu } from "./app-menu";

export function DefaultEditorWorkspaceLayout(props: {
  leftbar?: JSX.Element;
  rightbar?: JSX.Element;
  appbar?: JSX.Element;
  children: JSX.Element | Array<JSX.Element>;
  backgroundColor?: string;
}) {
  return (
    <WorkspaceRoot backgroundColor={props.backgroundColor}>
      <AppBarMenuAndBelowContentWrap>
        {props.appbar && <AppBarWrap>{props.appbar}</AppBarWrap>}
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

const WorkspaceRoot = styled.div<{ backgroundColor: string }>`
  width: 100vw;
  height: 100vh;
  background-color: ${(p) => p.backgroundColor ?? "transparent"};
`;

const AppBarMenuAndBelowContentWrap = styled.div`
  min-height: 100%;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const AppBarWrap = styled.div`
  flex-grow: 0;
`;

const NonMenuContentZoneWrap = styled.div`
  min-height: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;

const PanelLeftSideWrap = styled.div`
  z-index: 1;
  flex-grow: 0;
  min-height: 100%;
  max-height: 100%;
  max-width: 400px;
`;

const PanelRightSideWrap = styled.div`
  flex-grow: 0;
  min-height: 100%;
`;

const ChildrenContainerRoot = styled.div`
  flex: 1;
  min-height: 100%;
`;

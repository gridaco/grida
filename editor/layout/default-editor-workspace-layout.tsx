import styled from "@emotion/styled";
import React from "react";
import { AppMenu } from "./app-menu";

export function DefaultEditorWorkspaceLayout(props: {
  leftbar: JSX.Element;
  children: JSX.Element | Array<JSX.Element>;
}) {
  return (
    <>
      <WorkspaceRoot>
        <AppBarMenuAndBelowContentWrap>
          <AppMenu />
          <NonMenuContentZoneWrap>
            <PanelLeftSideWrap>{props.leftbar}</PanelLeftSideWrap>
            <ChildrenContainerRoot>
              <RenderComponentWrapper>{props.children}</RenderComponentWrapper>
            </ChildrenContainerRoot>
          </NonMenuContentZoneWrap>
        </AppBarMenuAndBelowContentWrap>
      </WorkspaceRoot>
    </>
  );
}

const NonMenuContentZoneWrap = styled.div`
  display: flex;
  flex-direction: row;
`;

const AppBarMenuAndBelowContentWrap = styled.div`
  display: flex;
  flex-direction: column;
`;

const PanelLeftSideWrap = styled.div`
  height: 100vh;
`;

const WorkspaceRoot = styled.div`
  width: 100vw;
  height: 100vh;
`;

const ChildrenContainerRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 6;
`;

const RenderComponentWrapper = styled.div`
  overflow-y: hidden;
  flex: 3;
`;

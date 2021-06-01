import styled from "@emotion/styled";
import React from "react";

export function DefaultEditorWorkspaceLayout(props: {
  leftbar: JSX.Element;
  children: JSX.Element | Array<JSX.Element>;
}) {
  return (
    <>
      <WorkspaceRoot>
        <PanelLeftSideWrap>{props.leftbar}</PanelLeftSideWrap>
        <ChildrenContainerRoot>
          <RenderComponentWrapper>{props.children}</RenderComponentWrapper>
        </ChildrenContainerRoot>
      </WorkspaceRoot>
    </>
  );
}

const PanelLeftSideWrap = styled.div``;

const WorkspaceRoot = styled.div`
  display: flex;
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

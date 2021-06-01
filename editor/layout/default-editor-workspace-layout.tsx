import styled from "@emotion/styled";
import React from "react";

export function DefaultEditorWorkspaceLayout(props: {
  leftbar: JSX.Element;
  children: JSX.Element | Array<JSX.Element>;
}) {
  return (
    <>
      <Template>
        {props.leftbar}
        <ContentWrapper>
          <RenderComponentWrapper>{props.children}</RenderComponentWrapper>
        </ContentWrapper>
      </Template>
    </>
  );
}

const Template = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
`;

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 6;
`;

const RenderComponentWrapper = styled.div`
  overflow-y: hidden;
  flex: 3;
`;

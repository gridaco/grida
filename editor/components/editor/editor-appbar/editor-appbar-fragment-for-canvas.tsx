import React from "react";
import styled from "@emotion/styled";
import { useEditorState } from "core/states";
import { colors } from "theme";

export function AppbarFragmentForCanvas() {
  const [state] = useEditorState();
  return (
    <RootWrapperAppbarFragmentForCanvas>
      <Breadcrumbs>{state.design?.input?.name}</Breadcrumbs>
    </RootWrapperAppbarFragmentForCanvas>
  );
}

const RootWrapperAppbarFragmentForCanvas = styled.div`
  z-index: 10;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  background-color: ${colors.color_editor_bg_on_dark};
  box-sizing: border-box;
  padding: 10px 24px;
`;

const Breadcrumbs = styled.span`
  text-overflow: ellipsis;
  font-size: 14px;
  color: grey;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

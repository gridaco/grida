import React from "react";
import styled from "@emotion/styled";
import { useEditorState } from "core/states";
import { colors } from "theme";
export function InspectorSegment() {
  const [state] = useEditorState();

  return (
    <InspectorContainer>
      file: {state.design.key}
      {/* todo */}
    </InspectorContainer>
  );
}

const InspectorContainer = styled.div`
  display: flex;
  z-index: 1;
  flex-direction: column;
  width: 200px;
  height: 100%;
  background-color: ${colors.color_editor_bg_on_dark};
  /* background-color: ${(props) => props.theme.colors.background}; */
`;

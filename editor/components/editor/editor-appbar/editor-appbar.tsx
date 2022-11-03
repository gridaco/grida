import React from "react";
import styled from "@emotion/styled";
import { AppbarFragmentForSidebar } from "./editor-appbar-fragment-for-sidebar";
import { AppbarFragmentForCanvas } from "./editor-appbar-fragment-for-canvas";
import { AppbarFragmentForRightSidebar } from "./editor-appbar-fragment-for-code-editor";

export function Appbar() {
  return (
    <AppbarContainer>
      <AppbarFragmentForSidebar />
      <AppbarFragmentForCanvas />
      <AppbarFragmentForRightSidebar />
    </AppbarContainer>
  );
}

const AppbarContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

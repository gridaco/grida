import styled from "@emotion/styled";
import React from "react";

import { TabsHeader } from "./tabs-header";

export function Panel() {
  return (
    <RootWrapperEditor>
      <TabsHeader></TabsHeader>
      <Editor></Editor>
    </RootWrapperEditor>
  );
}

const RootWrapperEditor = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const Editor = styled.div`
  width: 722px;
  height: 626px;
  overflow: hidden;
  background-color: rgba(30, 30, 30, 1);
  position: relative;
`;

import styled from "@emotion/styled";
import React from "react";

export function Container() {
  return (
    <RootWrapperContainer>
      <ActivityBar></ActivityBar>
      <Sidebar></Sidebar>
      <Panel>
        <TabsHeader>
          <Tabs></Tabs>
        </TabsHeader>
        <Editor></Editor>
      </Panel>
    </RootWrapperContainer>
  );
}

const RootWrapperContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  min-height: 100vh;
  box-sizing: border-box;
`;

const ActivityBar = styled.div`
  width: 48px;
  background-color: rgba(51, 51, 51, 1);
  align-self: stretch;
`;

const Sidebar = styled.div`
  width: 467px;
  background-color: rgba(37, 37, 38, 1);
  align-self: stretch;
`;

const Panel = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const TabsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: start;
  flex: 1;
  gap: 54px;
  align-self: stretch;
  background-color: rgba(37, 37, 38, 1);
  box-sizing: border-box;
`;

const Tabs = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 1px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Editor = styled.div`
  width: 722px;
  height: 626px;
  background-color: rgba(30, 30, 30, 1);
`;

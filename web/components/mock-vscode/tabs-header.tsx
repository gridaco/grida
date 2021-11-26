import styled from "@emotion/styled";
import React from "react";

import VSCodeTab from "./vscode-tab";

export default function TabsHeader({
  activeTab,
  onTabClick,
}: {
  activeTab: string;
  onTabClick: (tab: string) => void;
}) {
  return (
    <RootWrapperTabsHeader>
      <Tabs>
        <VSCodeTab
          selected={activeTab === "react"}
          label="React.tsx"
          onClick={() => {
            onTabClick("react");
          }}
        />
        <VSCodeTab
          selected={activeTab === "flutter"}
          label="Flutter.dart"
          onClick={() => {
            onTabClick("flutter");
          }}
        />
        <VSCodeTab
          selected={activeTab === "vanilla"}
          label="vanilla.html"
          onClick={() => {
            onTabClick("vanilla");
          }}
        />
      </Tabs>
      <Toolbar>
        <Actions>
          <Actions_0001>
            <Icon></Icon>
          </Actions_0001>
        </Actions>
        <Actions>
          <Actions_0001>
            <Icon></Icon>
          </Actions_0001>
        </Actions>
      </Toolbar>
    </RootWrapperTabsHeader>
  );
}

const RootWrapperTabsHeader = styled.div`
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
  align-items: flex-start;
  flex: 1;
  gap: 1px;
  align-self: stretch;
  box-sizing: border-box;
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 0;
  width: 64px;
  height: 36px;
  box-sizing: border-box;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 0;
  width: 32px;
  height: 36px;
  box-sizing: border-box;
`;

const Actions_0001 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 10px;
  width: 32px;
  height: 36px;
  box-sizing: border-box;
  padding: 10px 8px;
`;

const Icon = styled.span`
  color: rgba(204, 204, 204, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: codicon, sans-serif;
  font-weight: 400;
  text-align: center;
`;
